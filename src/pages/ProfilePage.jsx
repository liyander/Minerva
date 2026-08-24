import { useEffect, useMemo, useState } from 'react'
import { getAuthSession } from '../auth'
import { getCareerPathsData, hydrateCareerPathsData } from '../data/careerPathsData'
import { getCoursesData } from '../data/coursesData'
import { apiFetch } from '../services/api'
import { getLabProgressEvents, getLabProgressMap } from '../services/labProgress'

function parseXpValue(value) {
  const match = String(value || '').replace(/,/g, '').match(/\d+/)
  return match ? Number(match[0]) : 0
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(Number(value || 0))
}

function formatTimelineTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '--:--'
  }

  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatTimelineDate(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return 'Unknown date'
  }

  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)

  if (date.toDateString() === today.toDateString()) {
    return 'Today'
  }

  if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday'
  }

  return date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
  })
}

function buildDisplayName(profile, fallbackUsername) {
  const fullName = [profile?.first_name, profile?.last_name]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(' ')

  return fullName || profile?.username || fallbackUsername || 'Student'
}

const RANK_TIERS = [
  { name: 'New Learner', xp: 0 },
  { name: 'Beginner', xp: 250 },
  { name: 'Apprentice', xp: 750 },
  { name: 'Practitioner', xp: 1500 },
  { name: 'Specialist', xp: 3000 },
  { name: 'Advanced', xp: 5000 },
  { name: 'Expert', xp: 8000 },
  { name: 'Master', xp: 12000 },
]

const ACHIEVEMENT_DEFINITIONS = [
  {
    id: 'first-breach',
    name: 'First Step',
    icon: 'flag',
    tone: 'primary',
    criteria: 'Complete 1 skill',
    isUnlocked: ({ completedRooms }) => completedRooms >= 1,
  },
  {
    id: 'steady-signal',
    name: 'Getting Consistent',
    icon: 'timeline',
    tone: 'secondary',
    criteria: 'Complete 3 skills',
    isUnlocked: ({ completedRooms }) => completedRooms >= 3,
  },
  {
    id: 'lab-operator',
    name: 'Hands On',
    icon: 'terminal',
    tone: 'primary',
    criteria: 'Complete 5 skills',
    isUnlocked: ({ completedRooms }) => completedRooms >= 5,
  },
  {
    id: 'mission-chain',
    name: 'On a Roll',
    icon: 'conversion_path',
    tone: 'secondary',
    criteria: 'Complete 7 skills',
    isUnlocked: ({ completedRooms }) => completedRooms >= 7,
  },
  {
    id: 'xp-hunter',
    name: 'Point Collector',
    icon: 'data_thresholding',
    tone: 'primary',
    criteria: 'Earn 1,000 XP',
    isUnlocked: ({ xp }) => xp >= 1000,
  },
  {
    id: 'signal-amplifier',
    name: 'Momentum',
    icon: 'monitoring',
    tone: 'secondary',
    criteria: 'Earn 2,500 XP',
    isUnlocked: ({ xp }) => xp >= 2500,
  },
  {
    id: 'vault-runner',
    name: 'Deep Diver',
    icon: 'encrypted',
    tone: 'primary',
    criteria: 'Earn 4,000 XP',
    isUnlocked: ({ xp }) => xp >= 4000,
  },
  {
    id: 'domain-hopper',
    name: 'Well Rounded',
    icon: 'hub',
    tone: 'secondary',
    criteria: 'Complete skills in 3 categories',
    isUnlocked: ({ categories }) => categories >= 3,
  },
  {
    id: 'domain-cartographer',
    name: 'Broad Horizons',
    icon: 'travel_explore',
    tone: 'secondary',
    criteria: 'Complete skills in 5 categories',
    isUnlocked: ({ categories }) => categories >= 5,
  },
  {
    id: 'module-master',
    name: 'Module Master',
    icon: 'military_tech',
    tone: 'primary',
    criteria: 'Master 1 module',
    isUnlocked: ({ masteredModules }) => masteredModules >= 1,
  },
  {
    id: 'path-breaker',
    name: 'Path Breaker',
    icon: 'account_tree',
    tone: 'primary',
    criteria: 'Master 2 modules',
    isUnlocked: ({ masteredModules }) => masteredModules >= 2,
  },
  {
    id: 'completion-specialist',
    name: 'Completion Specialist',
    icon: 'fact_check',
    tone: 'secondary',
    criteria: 'Master 4 modules',
    isUnlocked: ({ masteredModules }) => masteredModules >= 4,
  },
  {
    id: 'fresh-operator',
    name: 'Fresh Start',
    icon: 'bolt',
    tone: 'primary',
    criteria: 'Complete a skill in the last 7 days',
    isUnlocked: ({ recentCompletions }) => recentCompletions >= 1,
  },
  {
    id: 'rapid-triage',
    name: 'Rapid Triage',
    icon: 'speed',
    tone: 'secondary',
    criteria: 'Complete 3 skills in the last 7 days',
    isUnlocked: ({ recentCompletions }) => recentCompletions >= 3,
  },
  {
    id: 'deep-operator',
    name: 'Deep Focus',
    icon: 'workspace_premium',
    tone: 'secondary',
    criteria: 'Complete 10 skills or earn 5,000 XP',
    isUnlocked: ({ completedRooms, xp }) => completedRooms >= 10 || xp >= 5000,
  },
]

function getRankProgress(xp) {
  const currentXp = Number(xp || 0)
  const currentIndex = RANK_TIERS.reduce(
    (bestIndex, tier, index) => (currentXp >= tier.xp ? index : bestIndex),
    0,
  )
  const currentRank = RANK_TIERS[currentIndex]
  const nextRank = RANK_TIERS[currentIndex + 1] || currentRank
  const span = Math.max(1, nextRank.xp - currentRank.xp)
  const earnedInTier = Math.max(0, currentXp - currentRank.xp)
  const progress = currentIndex === RANK_TIERS.length - 1
    ? 100
    : Math.min(100, Math.round((earnedInTier / span) * 100))

  return {
    currentRank: currentRank.name,
    nextRank: currentIndex === RANK_TIERS.length - 1 ? 'Max Rank' : nextRank.name,
    progress,
    xpToNext: Math.max(0, nextRank.xp - currentXp),
  }
}

function ProfilePage() {
  const authSession = getAuthSession()
  const analysisCacheKey = `incognitrix_profile_analysis_${authSession?.username || 'operator'}`
  const [profileIdentity, setProfileIdentity] = useState({
    username: authSession?.username || 'operator',
    displayName: authSession?.username || 'Student',
    role: authSession?.role || 'operator',
    registrationNumber: '',
    userId: authSession?.id || null,
  })
  const [careerPaths, setCareerPaths] = useState([])
  const [isLoadingPaths, setIsLoadingPaths] = useState(true)
  const [labProgressTick, setLabProgressTick] = useState(0)
  const [aiAnalysis, setAiAnalysis] = useState(null)
  const [isLoadingAnalysis, setIsLoadingAnalysis] = useState(true)
  const [profileStats, setProfileStats] = useState({
    xp: 0,
    completedRooms: 0,
    rank: null,
    totalRankedUsers: 0,
  })

  useEffect(() => {
    let cancelled = false

    const loadProfileIdentity = async () => {
      try {
        const response = await apiFetch('/users/me')
        if (!cancelled) {
          setProfileIdentity({
            username: response?.username || authSession?.username || 'operator',
            displayName: buildDisplayName(response, authSession?.username),
            role: response?.role || authSession?.role || 'operator',
            registrationNumber: response?.registration_number || '',
            userId: response?.id || authSession?.id || null,
          })
        }
      } catch (error) {
        console.error('Failed to load profile identity:', error)
        if (!cancelled) {
          setProfileIdentity({
            username: authSession?.username || 'operator',
            displayName: authSession?.username || 'Student',
            role: authSession?.role || 'operator',
            registrationNumber: '',
            userId: authSession?.id || null,
          })
        }
      }
    }

    void loadProfileIdentity()

    return () => {
      cancelled = true
    }
  }, [authSession?.id, authSession?.role, authSession?.username])

  useEffect(() => {
    let cancelled = false

    const loadPaths = async () => {
      try {
        const response = await apiFetch('/career-paths')
        if (!cancelled) {
          const paths = Array.isArray(response) ? response : []
          hydrateCareerPathsData(paths)
          setCareerPaths(paths)
        }
      } catch (error) {
        console.error('Failed to load paths for profile:', error)
        if (!cancelled) {
          setCareerPaths(getCareerPathsData())
        }
      } finally {
        if (!cancelled) {
          setIsLoadingPaths(false)
        }
      }
    }

    void loadPaths()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const { updatedEvent, updatedStorageKey } = getLabProgressEvents()

    const syncProgress = () => {
      setLabProgressTick((value) => value + 1)
    }

    const onStorage = (event) => {
      if (event.key === updatedStorageKey) {
        syncProgress()
      }
    }

    window.addEventListener(updatedEvent, syncProgress)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(updatedEvent, syncProgress)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  const completedRoomSignature = useMemo(() => {
    void labProgressTick
    const progressMap = getLabProgressMap()
    const completedEntries = Object.entries(progressMap)
      .filter(([, progress]) => Boolean(progress?.completedAt))
      .map(([roomId, progress]) => `${roomId}:${progress.completedAt}`)
      .sort()

    return completedEntries.length ? completedEntries.join('|') : 'no-completed-rooms'
  }, [labProgressTick])

  useEffect(() => {
    let cancelled = false

    const loadProfileStats = async () => {
      const progressMap = getLabProgressMap()
      const roomsById = new Map(getCoursesData().map((room) => [room.id, room]))
      const localCompletedRoomIds = Object.entries(progressMap)
        .filter(([, progress]) => Boolean(progress?.completedAt))
        .map(([roomId]) => roomId)
      const localXp = localCompletedRoomIds.reduce(
        (sum, roomId) => sum + parseXpValue(roomsById.get(roomId)?.xp),
        0,
      )

      try {
        const scoreboard = await apiFetch('/rooms/scoreboard/summary')
        if (cancelled) {
          return
        }

        const currentUser = Array.isArray(scoreboard)
          ? scoreboard.find(
              (row) => String(row.username || '').toLowerCase() === String(authSession?.username || '').toLowerCase(),
            )
          : null

        setProfileStats({
          xp: Number(currentUser?.xp ?? localXp),
          completedRooms: Number(currentUser?.completedRooms ?? localCompletedRoomIds.length),
          rank: currentUser?.rank ? Number(currentUser.rank) : null,
          totalRankedUsers: Array.isArray(scoreboard) ? scoreboard.length : 0,
        })
      } catch (error) {
        console.error('Failed to load profile XP:', error)
        if (!cancelled) {
          setProfileStats({
            xp: localXp,
            completedRooms: localCompletedRoomIds.length,
            rank: null,
            totalRankedUsers: 0,
          })
        }
      }
    }

    void loadProfileStats()

    return () => {
      cancelled = true
    }
  }, [authSession?.username, completedRoomSignature])

  useEffect(() => {
    let cancelled = false

    const loadAnalysis = async () => {
      try {
        const cached = JSON.parse(localStorage.getItem(analysisCacheKey) || 'null')
        if (cached?.signature === completedRoomSignature && cached?.analysis) {
          setAiAnalysis(cached.analysis)
          setIsLoadingAnalysis(false)
          return
        }
      } catch {
        // Ignore unreadable cache and fetch a fresh analysis.
      }

      setIsLoadingAnalysis(true)
      try {
        const response = await apiFetch('/rooms/profile/analysis')
        if (!cancelled) {
          setAiAnalysis(response)
          localStorage.setItem(
            analysisCacheKey,
            JSON.stringify({
              signature: completedRoomSignature,
              analysis: response,
              analyzedAt: new Date().toISOString(),
            }),
          )
        }
      } catch (error) {
        console.error('Failed to load profile AI analysis:', error)
        if (!cancelled) {
          setAiAnalysis(null)
        }
      } finally {
        if (!cancelled) {
          setIsLoadingAnalysis(false)
        }
      }
    }

    void loadAnalysis()

    return () => {
      cancelled = true
    }
  }, [analysisCacheKey, completedRoomSignature])

  const moduleProgressItems = useMemo(() => {
    void labProgressTick
    const roomsById = new Map(getCoursesData().map((room) => [room.id, room]))
    const progressMap = getLabProgressMap()

    const modules = careerPaths.flatMap((path) =>
      (path.modules || []).map((module) => {
        const roomIds = module.rooms || []
        const totalRooms = roomIds.length
        const completedRooms = roomIds.filter((roomId) => Boolean(progressMap[roomId]?.completedAt)).length
        const percentage = totalRooms > 0 ? Math.round((completedRooms / totalRooms) * 100) : 0

        return {
          id: `${path.id}-${module.id}`,
          title: module.title || 'Untitled Module',
          subtitle: `${module.phase || 'Module'} / ${path.title || 'Path'}`,
          percentage,
          completedRooms,
          totalRooms,
          tone: path.color === 'secondary' ? 'secondary' : 'primary',
          roomPreview: roomIds
            .map((roomId) => roomsById.get(roomId)?.title)
            .filter(Boolean)
            .slice(0, 2)
            .join(', '),
        }
      }),
    )

    return modules
      .sort(
        (a, b) =>
          b.percentage - a.percentage ||
          b.completedRooms - a.completedRooms ||
          b.totalRooms - a.totalRooms ||
          a.title.localeCompare(b.title),
      )
      .slice(0, 4)
      .map((item, index) => ({
        ...item,
        rank: index + 1,
      }))
  }, [careerPaths, labProgressTick])

  const firstColumnItems = moduleProgressItems.filter((_, index) => index % 2 === 0)
  const secondColumnItems = moduleProgressItems.filter((_, index) => index % 2 !== 0)
  const operatorId = profileIdentity.registrationNumber || (profileIdentity.userId ? `USER_${profileIdentity.userId}` : profileIdentity.username)
  const roleLabel = aiAnalysis?.suitableRole || (profileIdentity.role === 'admin' ? 'Administrator' : 'Learner')
  const labTimelineItems = useMemo(() => {
    void labProgressTick
    const roomsById = new Map(getCoursesData().map((room) => [room.id, room]))
    const progressMap = getLabProgressMap()

    return Object.entries(progressMap)
      .filter(([, progress]) => Boolean(progress?.completedAt))
      .map(([roomId, progress]) => {
        const room = roomsById.get(roomId)
        return {
          id: roomId,
          title: room?.title || roomId,
          category: room?.category || room?.categoryTag || 'Lab',
          difficulty: room?.difficulty || room?.level || 'Skill',
          xp: parseXpValue(room?.xp),
          completedAt: progress.completedAt,
        }
      })
      .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())
      .slice(0, 6)
  }, [labProgressTick])
  const completedCategoryCount = useMemo(
    () => new Set(labTimelineItems.map((item) => item.category).filter(Boolean)).size,
    [labTimelineItems],
  )
  const masteredModuleCount = moduleProgressItems.filter((item) => item.percentage === 100).length
  const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000)
  const recentCompletionCount = labTimelineItems.filter(
    (item) => new Date(item.completedAt).getTime() >= sevenDaysAgo,
  ).length
  const achievementContext = {
    xp: profileStats.xp,
    completedRooms: profileStats.completedRooms,
    categories: completedCategoryCount,
    masteredModules: masteredModuleCount,
    recentCompletions: recentCompletionCount,
  }
  const achievements = ACHIEVEMENT_DEFINITIONS.map((achievement) => ({
    ...achievement,
    unlocked: achievement.isUnlocked(achievementContext),
  }))
  const rankProgress = getRankProgress(profileStats.xp)
  const percentile = profileStats.rank && profileStats.totalRankedUsers
    ? Math.max(1, Math.round((profileStats.rank / profileStats.totalRankedUsers) * 100))
    : null
  const networkState = profileStats.completedRooms === 0
    ? {
        label: 'Waiting…',
        message: 'Complete your first skill to activate performance insights.',
        action: 'Start your first course',
      }
    : percentile
      ? {
          label: percentile <= 10 ? 'Secure' : percentile <= 35 ? 'Active' : 'Practice',
          message: `Your current performance is in the top ${percentile}% of ranked academy operators.`,
          action: percentile <= 10 ? 'Keep up the pace' : 'Complete more courses',
        }
      : {
          label: 'Local',
          message: `You have completed ${profileStats.completedRooms} skill${profileStats.completedRooms === 1 ? '' : 's'} and earned ${formatNumber(profileStats.xp)} XP.`,
          action: 'Sync rankings',
        }

  return (
    <>
      <main className="pt-24 min-h-screen">
        <div className="max-w-7xl mx-auto px-12 py-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
            <div className="md:col-span-2 flex flex-col justify-end">
              <h1 className="font-headline font-bold text-5xl md:text-6xl tracking-tighter mb-2 break-words">
                {profileIdentity.displayName}
              </h1>
              <div className="flex gap-4 items-center">
                <span className="rounded-lg bg-primary-container text-on-primary-container px-3 py-1 font-headline text-xs">
                  {roleLabel}
                </span>
                <span className="text-on-surface-variant font-headline text-xs">
                  ID: {operatorId}
                </span>
              </div>
            </div>
            <div className="rounded-2xl bg-surface-container-lowest p-8 flex flex-col justify-between shadow-soft">
              <span className="font-headline text-xs text-on-surface-variant">Total Experience Points</span>
              <div className="flex flex-col">
                <span className="font-headline font-bold text-5xl tracking-tighter text-primary">
                  {formatNumber(profileStats.xp)}
                </span>
                <span className="font-headline text-xs text-primary/60 mt-1">
                  {profileStats.completedRooms} skills completed
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-12 gap-8">
            <div className="rounded-2xl col-span-12 bg-surface-container-lowest p-8 shadow-soft">
              <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
                <div className="max-w-3xl">
                  <span className="font-headline text-xs text-secondary font-bold">
                    AI Career Analysis
                  </span>
                  <h2 className="font-headline font-bold text-2xl tracking-tight mt-2">
                    {isLoadingAnalysis
                      ? 'Analyzing completed skills...'
                      : aiAnalysis?.suitableRole || 'Complete skills to unlock role analysis'}
                  </h2>
                  <p className="text-sm text-on-surface-variant leading-relaxed mt-3">
                    {aiAnalysis?.summary ||
                      'The recommendation is generated from completed skills, theoretical scores, answered questions, and evaluator feedback.'}
                  </p>
                </div>
                <div className="rounded-2xl bg-surface-container-high px-5 py-4 min-w-44">
                  <p className="font-headline text-xs text-on-surface-variant font-bold">
                    Confidence
                  </p>
                  <p className="font-headline text-2xl font-extrabold text-secondary mt-1">
                    {aiAnalysis?.confidence || 'Pending'}
                  </p>
                  <p className="text-xs text-on-surface-variant mt-2">
                    {Number(aiAnalysis?.completedRooms || 0)} skills completed
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
                <div className="rounded-2xl bg-surface p-5">
                  <h3 className="font-headline text-xs font-bold text-primary mb-4">
                    Strengths
                  </h3>
                  <div className="space-y-3">
                    {(aiAnalysis?.strengths || ['Complete more skills to identify your strongest capabilities.']).map((item) => (
                      <p className="text-sm text-on-surface-variant leading-relaxed" key={item}>
                        {item}
                      </p>
                    ))}
                  </div>
                </div>
                <div className="rounded-2xl bg-surface p-5">
                  <h3 className="font-headline text-xs font-bold text-primary mb-4">
                    Improve Next
                  </h3>
                  <div className="space-y-3">
                    {(aiAnalysis?.improvementAreas || ['Submit detailed theoretical answers to improve analysis quality.']).map((item) => (
                      <p className="text-sm text-on-surface-variant leading-relaxed" key={item}>
                        {item}
                      </p>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl col-span-12 lg:col-span-8 bg-surface-container-lowest p-8 shadow-soft/70">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h2 className="font-headline font-bold text-xl tracking-tight">Skill Matrix Output</h2>
                  <p className="text-xs font-headline text-on-surface-variant mt-1">
                    Top 4 modules by completion output
                  </p>
                </div>
                <span className="material-symbols-outlined text-neutral-300">analytics</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {[firstColumnItems, secondColumnItems].map((columnItems, columnIndex) => (
                  <div className="space-y-4" key={`skill-col-${columnIndex + 1}`}>
                    {columnItems.map((item) => (
                      <div className="rounded-2xl bg-surface border border-surface-container p-4 space-y-3" key={item.id}>
                        <div className="flex justify-between gap-4">
                          <div className="min-w-0">
                            <span className="rounded-full inline-flex items-center px-2 py-1 bg-surface-container-high text-xs font-bold font-headline mb-2">
                              Rank #{item.rank}
                            </span>
                            <h3 className="font-headline font-bold text-sm tracking-wide truncate">{item.title}</h3>
                            <p className="text-xs text-on-surface-variant mt-1 truncate">
                              {item.subtitle}
                            </p>
                          </div>
                          <span
                            className={`${item.tone === 'secondary' ? 'text-secondary' : 'text-primary'} font-headline font-bold text-xl shrink-0`}
                          >
                            {item.percentage}%
                          </span>
                        </div>

                        <div className="h-2 bg-surface-container rounded-sm overflow-hidden">
                          <div
                            className={`h-full ${item.tone === 'secondary' ? 'bg-secondary' : 'bg-primary'}`}
                            style={{ width: `${item.percentage}%` }}
                          ></div>
                        </div>

                        <div className="flex justify-between text-xs font-headline text-on-surface-variant">
                          <span>
                            {item.completedRooms}/{item.totalRooms} labs complete
                          </span>
                          <span>{item.percentage === 100 ? 'Mastered' : 'In Progress'}</span>
                        </div>

                        {item.roomPreview ? (
                          <p className="text-xs text-on-surface-variant truncate">Focus: {item.roomPreview}</p>
                        ) : null}
                      </div>
                    ))}

                    {isLoadingPaths && !columnItems.length ? (
                      <p className="text-xs text-on-surface-variant">Loading module progress...</p>
                    ) : null}

                    {!isLoadingPaths && !columnItems.length ? (
                      <p className="text-xs text-on-surface-variant">No module progress available yet.</p>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl col-span-12 lg:col-span-4 bg-surface-container-lowest p-8 text-on-surface relative overflow-hidden border border-outline-variant/40 shadow-soft shadow-sm">
              <div className="rounded-xl absolute top-0 right-0 h-32 w-32 bg-secondary/10 blur-[80px]"></div>
              <div className="flex justify-between items-center mb-8 relative z-10">
                <div>
                  <h2 className="font-headline font-bold text-sm">Lab Completion Timeline</h2>
                  <p className="mt-1 text-xs font-headline text-on-surface-variant">
                    Latest completed skills
                  </p>
                </div>
                <span className="rounded-lg inline-flex items-center gap-1 bg-secondary/15 px-2.5 py-1 text-xs font-headline font-bold text-secondary">
                  <span className="h-1.5 w-1.5 rounded-full bg-secondary"></span>
                  Live
                </span>
              </div>
              <div className="space-y-4 relative z-10">
                {labTimelineItems.length > 0 ? (
                  labTimelineItems.map((item) => (
                    <div
                      className="group grid grid-cols-[4.5rem_1fr] gap-4 border-l-2 border-outline-variant/50 pl-4 transition-colors hover:border-secondary"
                      key={`${item.id}-${item.completedAt}`}
                    >
                      <div className="font-headline text-right">
                        <p className="text-sm font-extrabold text-secondary">{formatTimelineTime(item.completedAt)}</p>
                        <p className="mt-1 text-xs text-on-surface-variant">
                          {formatTimelineDate(item.completedAt)}
                        </p>
                      </div>
                      <div className="rounded-xl min-w-0 bg-surface-container-high px-4 py-3">
                        <p className="font-headline text-xs font-extrabold tracking-wide text-on-surface truncate">
                          {item.title}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-headline font-bold text-on-surface-variant">
                          <span>{item.category}</span>
                          <span className="h-1 w-1 rounded-full bg-outline"></span>
                          <span>{item.difficulty}</span>
                          {item.xp > 0 ? (
                            <>
                              <span className="h-1 w-1 rounded-full bg-outline"></span>
                              <span className="text-primary">+{item.xp} XP</span>
                            </>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl bg-surface-container-high p-6 text-center">
                    <span className="material-symbols-outlined text-3xl text-on-surface-variant">
                      timeline
                    </span>
                    <p className="mt-3 font-headline text-xs font-bold text-on-surface">
                      No completed labs yet
                    </p>
                    <p className="mt-2 text-xs leading-relaxed text-on-surface-variant">
                      Complete a skill to start building your learning timeline.
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl col-span-12 bg-surface-container-low p-8">
              <div className="flex justify-between items-end mb-8">
                <div>
                  <h2 className="font-headline font-bold text-xl tracking-tight">Achievement Vault</h2>
                  <p className="text-on-surface-variant text-xs font-headline mt-1">
                    Criteria based on XP, completed skills, categories, and module mastery
                  </p>
                </div>
                <span className="font-headline text-xs text-primary border-b-2 border-primary pb-1">
                  {achievements.filter((item) => item.unlocked).length}/{achievements.length} Unlocked
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
                {achievements.map((achievement) => (
                  <div
                    className={`rounded-2xl aspect-square bg-surface-container-lowest p-5 flex flex-col items-center justify-center text-center gap-3 border border-outline-variant/20 transition-opacity ${
                      achievement.unlocked ? '' : 'opacity-35 grayscale'
                    }`}
                    key={achievement.id}
                    title={achievement.criteria}
                  >
                    <span
                      className={`material-symbols-outlined text-4xl ${achievement.tone === 'secondary' ? 'text-secondary' : 'text-primary'}`}
                      style={{ fontVariationSettings: achievement.unlocked ? "'FILL' 1" : "'FILL' 0" }}
                    >
                      {achievement.unlocked ? achievement.icon : 'lock'}
                    </span>
                    <span className="font-headline text-xs font-bold">
                      {achievement.unlocked ? achievement.name : 'Locked File'}
                    </span>
                    <span className="text-xs leading-relaxed text-on-surface-variant">
                      {achievement.criteria}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl col-span-12 lg:col-span-6 bg-surface-container-lowest h-64 overflow-hidden relative">
              <img alt="Servers" className="w-full h-full object-cover grayscale opacity-20 mix-blend-multiply" src="https://lh3.googleusercontent.com/aida-public/AB6AXuB8Up8U0Qns_mn9r9DwX9zZyvGMbGwohDNQ9BG4mbWDhnv0l4-3gpm4UDv9c46eqHBIzyJtLpzvO4j-raquDQB9Kf9U9wtASYKd-r5Bkk5wASptx560cccS9lcqSOEFEwIjNtqc0B-ux92is0Zz8a6bYJA5HGoLwEAuDmn7lzG1kN1lmmcbJpQyRc0YrcR_25GSA13Z_9ISSXGx-PsmWEev9swLpEGoskBLUatjuQsdfCXYL4-LRN2nvKAHbSu2RFneVMhwYubmE4g" />
              <div className="absolute inset-0 p-8 flex flex-col justify-between">
                <div className="flex justify-between items-start">
                  <h3 className="font-headline font-bold text-lg">Network Status</h3>
                  <span className="bg-green-500/20 text-green-700 px-2 py-1 text-[11px] font-bold tracking-[2px]">
                    {networkState.label}
                  </span>
                </div>
                <div className="space-y-2">
                  <p className="font-body text-sm text-on-surface-variant max-w-xs">
                    {networkState.message}
                  </p>
                  <span className="font-headline text-xs text-primary font-bold">
                    {networkState.action}
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded-2xl col-span-12 lg:col-span-6 bg-primary-container p-8 flex flex-col justify-between text-on-primary-container">
              <div className="flex justify-between items-start">
                <span className="material-symbols-outlined text-4xl">military_tech</span>
                <div className="text-right">
                  <span className="font-headline text-xs opacity-70">Next Rank Progression</span>
                  <p className="font-headline font-bold text-xl">{rankProgress.nextRank}</p>
                  <p className="mt-1 font-headline text-xs opacity-70">
                    Current: {rankProgress.currentRank}
                  </p>
                </div>
              </div>
              <div>
                <div className="flex justify-between font-headline text-xs mb-2">
                  <span>Rank Progress</span>
                  <span>
                    {rankProgress.xpToNext > 0 ? `${formatNumber(rankProgress.xpToNext)} XP to Next Rank` : 'Max Rank Reached'}
                  </span>
                </div>
                <div className="h-3 bg-black/10">
                  <div className="h-full bg-white" style={{ width: `${rankProgress.progress}%` }}></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="w-full py-6 mt-auto bg-neutral-50 border-t border-neutral-200/50 flex flex-col md:flex-row justify-between items-center px-12">
        <div className="font-headline text-xs text-neutral-400">© 2026 Minerva Academy</div>
        <div className="flex gap-8 mt-4 md:mt-0">
          <a className="font-headline text-xs text-neutral-400 hover:text-primary opacity-80 hover:opacity-100 transition-all duration-150" href="#">Privacy</a>
          <a className="font-headline text-xs text-neutral-400 hover:text-primary opacity-80 hover:opacity-100 transition-all duration-150" href="#">Terms</a>
          <a className="font-headline text-xs text-neutral-400 hover:text-primary opacity-80 hover:opacity-100 transition-all duration-150" href="#">Accessibility</a>
        </div>
      </footer>
    </>
  )
}

export default ProfilePage
