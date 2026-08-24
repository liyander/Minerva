import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAuthSession } from '../auth'
import CourseThumb from '../components/CourseThumb'
import HomepageFeed from '../components/HomepageFeed'
import MiniCalendar from '../components/MiniCalendar'
import { EVENT_KINDS } from '../components/calendarEventKinds'
import ProgressDonut from '../components/ProgressDonut'
import RequiredTrainingPanel from '../components/RequiredTrainingPanel'
import TraineeLearningContextPanel from '../components/TraineeLearningContextPanel'
import { getCoursesData } from '../data/coursesData'
import { apiFetch } from '../services/api'
import { getCareerPathsData, hydrateCareerPathsData } from '../data/careerPathsData'
import { getLabProgressEvents, getLabProgressMap, getLabProgressSummary } from '../services/labProgress'
import {
  CTF_EVENTS_UPDATED_EVENT,
  CTF_EVENTS_UPDATED_KEY,
  fetchCtfEvents,
  setCtfRegistration,
  triggerCtfNotifications,
} from '../services/ctfEvents'

const NOTIFICATIONS_UPDATED_EVENT = 'incognitrix:notifications-updated'
const NOTIFICATIONS_UPDATED_KEY = 'incognitrix_notifications_updated_at'
const COURSE_PREVIEW_LIMIT = 4

// Rotated across the progress tiles so a long list of topics stays varied.
const TOPIC_ACCENTS = [
  { bg: 'bg-mint', text: 'text-on-mint', bar: 'text-on-mint' },
  { bg: 'bg-lavender', text: 'text-on-lavender', bar: 'text-on-lavender' },
  { bg: 'bg-butter', text: 'text-on-butter', bar: 'text-on-butter' },
  { bg: 'bg-sky', text: 'text-on-sky', bar: 'text-on-sky' },
  { bg: 'bg-blush', text: 'text-on-blush', bar: 'text-on-blush' },
]

function greetingFor(date) {
  const hour = date.getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function timeLabel(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function dayLabel(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function relativeLabel(value) {
  const timestamp = new Date(value).getTime()
  if (Number.isNaN(timestamp)) {
    return ''
  }

  const minutes = Math.round((Date.now() - timestamp) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return dayLabel(value)
}

function DashboardPage() {
  const authSession = getAuthSession()
  const dismissedNotificationsKey = `incognitrix_dismissed_notifications_${authSession?.username || 'student'}`
  const navigate = useNavigate()
  const [careerPaths, setCareerPaths] = useState([])
  const [notifications, setNotifications] = useState([])
  const [dismissedNotificationIds, setDismissedNotificationIds] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [labProgressTick, setLabProgressTick] = useState(0)
  const [upcomingEvents, setUpcomingEvents] = useState([])
  const [isSavingRegistration, setIsSavingRegistration] = useState(false)
  const [activityQuery, setActivityQuery] = useState('')
  const [courseQuery, setCourseQuery] = useState('')
  const [isCourseModalOpen, setIsCourseModalOpen] = useState(false)
  const [topicOffset, setTopicOffset] = useState(0)
  const [selectedDate, setSelectedDate] = useState(() => new Date())
  const [dashboardStats, setDashboardStats] = useState({
    rank: null,
    streak: 0,
  })

  useEffect(() => {
    const { updatedEvent, updatedStorageKey } = getLabProgressEvents()

    const syncLabProgress = () => {
      setLabProgressTick((value) => value + 1)
    }

    const onStorage = (event) => {
      if (event.key === updatedStorageKey) {
        syncLabProgress()
      }
    }

    window.addEventListener(updatedEvent, syncLabProgress)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(updatedEvent, syncLabProgress)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  useEffect(() => {
    if (!isCourseModalOpen) return undefined
    const previousOverflow = document.body.style.overflow
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setIsCourseModalOpen(false)
    }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [isCourseModalOpen])

  useEffect(() => {
    let cancelled = false

    const loadEvents = async () => {
      try {
        const response = await fetchCtfEvents()
        if (!cancelled) {
          setUpcomingEvents(Array.isArray(response) ? response : [])
        }
      } catch (error) {
        console.error('Failed to load upcoming events:', error)
        if (!cancelled) {
          setUpcomingEvents([])
        }
      }
    }

    const syncEvents = () => {
      void loadEvents()
    }

    const onStorage = (event) => {
      if (event.key === CTF_EVENTS_UPDATED_KEY) {
        syncEvents()
      }
    }

    void loadEvents()
    window.addEventListener(CTF_EVENTS_UPDATED_EVENT, syncEvents)
    window.addEventListener('storage', onStorage)

    return () => {
      cancelled = true
      window.removeEventListener(CTF_EVENTS_UPDATED_EVENT, syncEvents)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    const loadDashboardStats = async () => {
      try {
        const [leaderboard, streak] = await Promise.all([
          apiFetch('/rooms/scoreboard/summary'),
          apiFetch('/rooms/streaks/me'),
        ])

        if (cancelled) {
          return
        }

        const leaderboardRows = Array.isArray(leaderboard) ? leaderboard : []
        const currentUser = leaderboardRows.find(
          (row) => String(row.username || '').toLowerCase() === String(authSession?.username || '').toLowerCase(),
        )

        setDashboardStats({
          rank: currentUser?.rank ? Number(currentUser.rank) : null,
          streak: Number(streak?.currentStreak || 0),
        })
      } catch (error) {
        console.error('Failed to load dashboard stats:', error)
        if (!cancelled) {
          setDashboardStats({
            rank: null,
            streak: 0,
          })
        }
      }
    }

    void loadDashboardStats()

    return () => {
      cancelled = true
    }
  }, [authSession?.username, labProgressTick])

  useEffect(() => {
    const runAutoNotifications = async () => {
      try {
        const result = await triggerCtfNotifications()
        if ((result?.created || 0) > 0) {
          window.dispatchEvent(new Event(NOTIFICATIONS_UPDATED_EVENT))
          localStorage.setItem(NOTIFICATIONS_UPDATED_KEY, String(Date.now()))
        }
      } catch {
        // Keep dashboard usable even if trigger check fails.
      }
    }

    void runAutoNotifications()
  }, [])

  useEffect(() => {
    try {
      const stored = localStorage.getItem(dismissedNotificationsKey)
      if (!stored) {
        setDismissedNotificationIds([])
        return
      }

      const parsed = JSON.parse(stored)
      setDismissedNotificationIds(Array.isArray(parsed) ? parsed : [])
    } catch {
      setDismissedNotificationIds([])
    }
  }, [dismissedNotificationsKey])

  const handleDismissNotification = (notificationId) => {
    setDismissedNotificationIds((current) => {
      if (current.includes(notificationId)) {
        return current
      }

      const next = [...current, notificationId]
      localStorage.setItem(dismissedNotificationsKey, JSON.stringify(next))
      return next
    })
  }

  useEffect(() => {
    let cancelled = false

    const loadPaths = async () => {
      try {
        const response = await apiFetch('/career-paths')
        if (!cancelled) {
          const paths = Array.isArray(response) ? response : []
          hydrateCareerPathsData(paths)
          setCareerPaths(paths)
          setIsLoading(false)
        }
      } catch (error) {
        console.error('Failed to load paths:', error)
        if (!cancelled) {
          setCareerPaths(getCareerPathsData())
          setIsLoading(false)
        }
      }
    }

    void loadPaths()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    const loadNotifications = async () => {
      try {
        const response = await apiFetch('/notifications')
        if (!cancelled) {
          setNotifications(Array.isArray(response) ? response : [])
        }
      } catch (error) {
        console.error('Failed to load notifications:', error)
        if (!cancelled) {
          setNotifications([])
        }
      }
    }

    const syncNotifications = () => {
      void loadNotifications()
    }

    const handleNotificationsUpdated = () => {
      syncNotifications()
    }

    const handleStorage = (event) => {
      if (event.key === NOTIFICATIONS_UPDATED_KEY) {
        syncNotifications()
      }
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        syncNotifications()
      }
    }

    syncNotifications()
    const intervalId = window.setInterval(syncNotifications, 5000)
    window.addEventListener(NOTIFICATIONS_UPDATED_EVENT, handleNotificationsUpdated)
    window.addEventListener('storage', handleStorage)
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
      window.removeEventListener(NOTIFICATIONS_UPDATED_EVENT, handleNotificationsUpdated)
      window.removeEventListener('storage', handleStorage)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])

  const visibleNotifications = notifications.filter(
    (notification) => !dismissedNotificationIds.includes(notification.id),
  )

  const courses = useMemo(() => getCoursesData(), [])
  void labProgressTick
  const courseProgressMap = getLabProgressMap()
  const courseProgressSummary = getLabProgressSummary(courses)

  // Per-topic completion drives the donut tiles in the progress rail.
  const topics = useMemo(() => {
    const byCategory = new Map()

    courses.forEach((course) => {
      const category = course.category || 'General'
      const entry = byCategory.get(category) || { category, total: 0, completed: 0, icon: course.icon }
      entry.total += 1
      if (courseProgressMap[course.id]?.completedAt) {
        entry.completed += 1
      }
      byCategory.set(category, entry)
    })

    return [...byCategory.values()]
      .map((entry, index) => ({
        ...entry,
        percentage: entry.total ? Math.round((entry.completed / entry.total) * 100) : 0,
        accent: TOPIC_ACCENTS[index % TOPIC_ACCENTS.length],
      }))
      .sort((a, b) => b.percentage - a.percentage || a.category.localeCompare(b.category))
  }, [courses, courseProgressMap])

  const visibleTopics = topics.slice(topicOffset, topicOffset + 3)

  const pathProgressData = careerPaths.map((path) => {
    const modules = path.modules || []

    const moduleProgress = modules.map((module) => {
      const courseIds = module.rooms || []
      const completedCourses = courseIds.filter(
        (courseId) => Boolean(courseProgressMap[courseId]?.completedAt),
      ).length
      const totalCourses = courseIds.length
      const isComplete = totalCourses > 0 ? completedCourses === totalCourses : true

      return { module, totalCourses, completedCourses, isComplete }
    })

    const totalCourses = moduleProgress.reduce((sum, item) => sum + item.totalCourses, 0)
    const completedCourses = moduleProgress.reduce((sum, item) => sum + item.completedCourses, 0)
    const completionPercentage =
      totalCourses > 0 ? Math.round((completedCourses / totalCourses) * 100) : 0
    const firstIncompleteModule =
      moduleProgress.find((item) => !item.isComplete)?.module || modules[0] || null

    return {
      path,
      totalCourses,
      completedCourses,
      completionPercentage,
      firstIncompleteModule,
      isComplete: completionPercentage >= 100,
    }
  })

  const activePathProgress =
    pathProgressData.find((item) => !item.isComplete) || pathProgressData[0] || null

  const nextResumeModule = activePathProgress?.firstIncompleteModule || null

  const sortedEvents = useMemo(
    () =>
      [...upcomingEvents].sort(
        (a, b) => new Date(a.live_time).getTime() - new Date(b.live_time).getTime(),
      ),
    [upcomingEvents],
  )

  const nextEvent = sortedEvents[0] || null

  // The calendar and the timeline share one normalised shape.
  const calendarEvents = useMemo(
    () =>
      sortedEvents.map((event, index) => ({
        id: event.id ?? index,
        name: event.name,
        date: event.live_time,
        kind: event.is_registered ? 'live' : index % 3 === 1 ? 'deadline' : 'workshop',
        isRegistered: Boolean(event.is_registered),
      })),
    [sortedEvents],
  )

  const scheduleForSelectedDate = useMemo(() => {
    const matching = calendarEvents.filter((event) => {
      const date = new Date(event.date)
      return (
        date.getFullYear() === selectedDate.getFullYear() &&
        date.getMonth() === selectedDate.getMonth() &&
        date.getDate() === selectedDate.getDate()
      )
    })

    return matching.length ? matching : calendarEvents.slice(0, 4)
  }, [calendarEvents, selectedDate])

  const isShowingSelectedDay = calendarEvents.some((event) => {
    const date = new Date(event.date)
    return (
      date.getFullYear() === selectedDate.getFullYear() &&
      date.getMonth() === selectedDate.getMonth() &&
      date.getDate() === selectedDate.getDate()
    )
  })

  const activityItems = useMemo(() => {
    const query = activityQuery.trim().toLowerCase()
    return visibleNotifications.filter(
      (notification) =>
        !query ||
        String(notification.title || '').toLowerCase().includes(query) ||
        String(notification.message || '').toLowerCase().includes(query),
    )
  }, [visibleNotifications, activityQuery])

  const courseItems = useMemo(() => {
    const query = courseQuery.trim().toLowerCase()
    return courses
      .map((course) => {
        const progress = courseProgressMap[course.id]
        return {
          ...course,
          status: progress?.completedAt
            ? 'completed'
            : progress?.startedAt
              ? 'in-progress'
              : 'not-started',
        }
      })
      .filter(
        (course) =>
          !query ||
          String(course.title || '').toLowerCase().includes(query) ||
          String(course.category || '').toLowerCase().includes(query),
      )
  }, [courses, courseProgressMap, courseQuery])
  const previewCourseItems = courseItems.slice(0, COURSE_PREVIEW_LIMIT)

  const handleResumeLearning = () => {
    if (!activePathProgress?.path || !nextResumeModule?.id) {
      navigate('/learn/paths')
      return
    }

    navigate(`/learn/path/${activePathProgress.path.id}/module/${nextResumeModule.id}`)
  }

  const handleToggleEventRegistration = async () => {
    if (!nextEvent) {
      return
    }

    const nextState = !nextEvent.is_registered

    try {
      setIsSavingRegistration(true)
      await setCtfRegistration(nextEvent.id, nextState)
      setUpcomingEvents((current) =>
        current.map((event) =>
          event.id === nextEvent.id ? { ...event, is_registered: nextState } : event,
        ),
      )
    } catch (error) {
      console.error('Failed to update event registration:', error)
    } finally {
      setIsSavingRegistration(false)
    }
  }

  const firstName = String(authSession?.username || 'there').split(/[\s._-]+/)[0]
  const overallPercentage = courseProgressSummary.total
    ? Math.round((courseProgressSummary.completed / courseProgressSummary.total) * 100)
    : 0

  const searchFieldClass =
    'w-full rounded-full bg-surface-container pl-10 pr-4 py-2.5 font-body text-sm text-on-surface placeholder:text-on-surface-variant border border-transparent focus:border-primary focus:ring-0 outline-none transition-colors'

  const railButton = (disabled) =>
    `h-8 w-8 inline-flex items-center justify-center rounded-full transition-colors ${
      disabled
        ? 'text-on-surface-variant/40 cursor-not-allowed'
        : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
    }`

  if (isLoading) {
    return (
      <main className="mt-20 p-8 lg:p-12 flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
          <h1 className="font-headline text-2xl font-extrabold mt-6 mb-1">
            Setting up your dashboard
          </h1>
          <p className="text-on-surface-variant font-body">Loading your courses and progress…</p>
        </div>
      </main>
    )
  }

  return (
    <div className="mt-16 md:mt-20 p-4 sm:p-6 lg:p-8">
      {isCourseModalOpen ? (
        <div
          aria-labelledby="all-courses-title"
          aria-modal="true"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsCourseModalOpen(false)
          }}
          role="dialog"
        >
          <section className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-[2rem] bg-surface-container-lowest shadow-card">
            <header className="flex items-center justify-between gap-4 border-b border-outline-variant px-5 py-4 sm:px-7">
              <div>
                <h2 className="font-headline text-xl font-extrabold text-on-background" id="all-courses-title">All courses</h2>
                <p className="mt-1 font-body text-xs text-on-surface-variant">{courseItems.length} of {courses.length} courses</p>
              </div>
              <button aria-label="Close all courses" className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-surface-container text-on-surface hover:bg-surface-container-high" onClick={() => setIsCourseModalOpen(false)} type="button"><span className="material-symbols-outlined">close</span></button>
            </header>

            <div className="px-5 pt-5 sm:px-7">
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-base text-on-surface-variant">search</span>
                <input aria-label="Search all courses" autoFocus className={searchFieldClass} onChange={(event) => setCourseQuery(event.target.value)} placeholder="Search by course or department" type="search" value={courseQuery}/>
              </div>
            </div>

            <div className="grid flex-1 gap-3 overflow-y-auto p-5 sm:grid-cols-2 sm:p-7">
              {courseItems.length ? courseItems.map((course) => (
                <button className="group flex items-center gap-3 rounded-2xl bg-surface-container-low p-4 text-left transition-colors hover:bg-surface-container" key={course.id} onClick={() => { setIsCourseModalOpen(false); navigate(`/learn/course/${course.slug}`) }} type="button">
                  <CourseThumb course={course} size="sm" />
                  <div className="min-w-0 flex-1"><p className="truncate font-headline text-sm font-bold text-on-background group-hover:text-primary">{course.title}</p><p className="truncate font-body text-xs text-on-surface-variant">{course.category} · {course.estimateTime || course.level}</p></div>
                  <span className="material-symbols-outlined text-on-surface-variant">chevron_right</span>
                </button>
              )) : <div className="col-span-full flex flex-col items-center justify-center py-14 text-center"><span className="material-symbols-outlined text-5xl text-on-surface-variant/40">search_off</span><p className="mt-3 font-headline font-bold text-on-background">No courses found</p><p className="mt-1 font-body text-sm text-on-surface-variant">Try a different course or department name.</p></div>}
            </div>

            <footer className="flex justify-end border-t border-outline-variant px-5 py-4 sm:px-7"><button className="rounded-full bg-primary px-5 py-2.5 font-headline text-sm font-bold text-on-primary" onClick={() => { setIsCourseModalOpen(false); navigate('/learn') }} type="button">Open course catalogue</button></footer>
          </section>
        </div>
      ) : null}

      <div className="rounded-[2rem] bg-surface-container-lowest p-5 sm:p-7 lg:p-9 shadow-soft">
        <header className="flex flex-col lg:flex-row lg:items-start justify-between gap-5">
          <div>
            <h1 className="font-headline text-3xl sm:text-4xl font-extrabold text-on-background">
              {greetingFor(new Date())}, {firstName}
              <span className="inline-block ml-2 animate-pulse">👋</span>
            </h1>
            <p className="text-on-surface-variant mt-2 font-body">
              {courseProgressSummary.completed > 0
                ? `You have finished ${courseProgressSummary.completed} course${courseProgressSummary.completed === 1 ? '' : 's'} — keep the streak going.`
                : 'Start your first course today and begin building your streak.'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-full bg-butter px-4 py-2 font-headline text-sm font-bold text-on-butter">
              <span
                className="material-symbols-outlined text-base"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                local_fire_department
              </span>
              {dashboardStats.streak}
            </span>
            <span className="inline-flex items-center gap-2 rounded-full bg-lavender px-4 py-2 font-headline text-sm font-bold text-on-lavender">
              <span className="material-symbols-outlined text-base">emoji_events</span>
              {dashboardStats.rank ? `#${dashboardStats.rank}` : 'Unranked'}
            </span>
          </div>
        </header>

        <div className="mt-6">
          <HomepageFeed />
        </div>

        {visibleNotifications.length > 0 ? (
          <section className="mt-6 rounded-3xl bg-mint p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="material-symbols-outlined text-on-mint">campaign</span>
                <p className="font-headline text-sm font-extrabold text-on-mint truncate">
                  {visibleNotifications[0].title}
                </p>
              </div>
              <button
                className="shrink-0 rounded-full px-3 py-1 bg-surface-container-lowest/70 text-on-mint font-headline text-xs font-bold hover:opacity-80 transition-opacity"
                onClick={() => handleDismissNotification(visibleNotifications[0].id)}
                type="button"
              >
                Dismiss
              </button>
            </div>
            <p className="mt-1 font-body text-sm text-on-mint/80 pl-8">
              {visibleNotifications[0].message}
            </p>
          </section>
        ) : null}

        <div className="mt-7 space-y-7">
          <RequiredTrainingPanel />
          <TraineeLearningContextPanel />
        </div>

        <div className="mt-7 grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_20rem] gap-6">
          <div className="min-w-0 space-y-7">
            <section>
              <div className="flex items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-2">
                  <h2 className="font-headline text-lg font-extrabold text-on-background">
                    My progress
                  </h2>
                  <span className="rounded-full bg-surface-container px-2.5 py-0.5 font-headline text-xs font-bold text-on-surface-variant">
                    {topics.length}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    aria-label="Previous topics"
                    className={railButton(topicOffset === 0)}
                    disabled={topicOffset === 0}
                    onClick={() => setTopicOffset((value) => Math.max(0, value - 1))}
                    type="button"
                  >
                    <span className="material-symbols-outlined text-base">chevron_left</span>
                  </button>
                  <button
                    aria-label="Next topics"
                    className={railButton(topicOffset + 3 >= topics.length)}
                    disabled={topicOffset + 3 >= topics.length}
                    onClick={() =>
                      setTopicOffset((value) => Math.min(Math.max(0, topics.length - 3), value + 1))
                    }
                    type="button"
                  >
                    <span className="material-symbols-outlined text-base">chevron_right</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <article className="rounded-3xl bg-surface-container p-5 flex flex-col justify-between gap-5">
                  <div className="flex items-start gap-4">
                    <ProgressDonut
                      barClass="text-primary"
                      labelClass="text-on-surface"
                      showLabel
                      size={68}
                      thickness={7}
                      trackClass="text-on-surface opacity-10"
                      value={overallPercentage}
                    />
                    <div className="min-w-0">
                      <p className="font-headline text-2xl font-extrabold text-on-background leading-none">
                        {courseProgressSummary.completed}
                        <span className="text-on-surface-variant text-lg">
                          /{courseProgressSummary.total}
                        </span>
                      </p>
                      <p className="font-body text-xs text-on-surface-variant mt-1.5">
                        Courses completed
                      </p>
                    </div>
                  </div>
                  <div>
                    <div className="h-2 w-full rounded-full bg-on-surface/10 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-[width] duration-700 ease-out"
                        style={{ width: `${Math.max(overallPercentage, 2)}%` }}
                      ></div>
                    </div>
                    <p className="font-body text-xs text-on-surface-variant mt-2">
                      {courseProgressSummary.total - courseProgressSummary.completed} left to finish
                    </p>
                  </div>
                </article>

                {visibleTopics.map((topic) => (
                  <button
                    className={`group rounded-3xl ${topic.accent.bg} p-5 text-left flex items-center gap-4 transition-all duration-300 hover:-translate-y-1 hover:shadow-card`}
                    key={topic.category}
                    onClick={() => navigate('/learn')}
                    type="button"
                  >
                    <ProgressDonut
                      barClass={topic.accent.bar}
                      labelClass={topic.accent.text}
                      showLabel
                      size={68}
                      thickness={7}
                      trackClass={`${topic.accent.text} opacity-20`}
                      value={topic.percentage}
                    />
                    <div className="min-w-0 flex-1">
                      <p
                        className={`font-headline text-base font-extrabold ${topic.accent.text} leading-snug line-clamp-2`}
                      >
                        {topic.category}
                      </p>
                      <p className={`font-body text-xs ${topic.accent.text} opacity-70 mt-1.5`}>
                        {topic.completed} of {topic.total} done
                      </p>
                      <span
                        className={`mt-2 inline-flex items-center gap-1 font-headline text-xs font-bold ${topic.accent.text} opacity-0 group-hover:opacity-100 transition-opacity`}
                      >
                        Browse
                        <span className="material-symbols-outlined text-sm">arrow_forward</span>
                      </span>
                    </div>
                  </button>
                ))}

                {visibleTopics.length === 0 ? (
                  <div className="sm:col-span-2 lg:col-span-3 rounded-3xl bg-surface-container p-5 flex items-center justify-center">
                    <p className="font-body text-sm text-on-surface-variant">
                      Topic progress appears once courses are published.
                    </p>
                  </div>
                ) : null}
              </div>
            </section>

            <section className="rounded-3xl bg-primary-container p-5 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center gap-5">
                <div className="min-w-0 flex-1">
                  <p className="font-headline text-xs font-bold text-on-primary-container opacity-70">
                    Continue where you left off
                  </p>
                  <h3 className="font-headline text-xl sm:text-2xl font-extrabold text-on-primary-container mt-1 truncate">
                    {activePathProgress?.path?.title || 'Choose a learning path'}
                  </h3>
                  <p className="font-body text-sm text-on-primary-container opacity-70 mt-1">
                    {activePathProgress
                      ? `${activePathProgress.completedCourses} of ${activePathProgress.totalCourses} courses · ${activePathProgress.completionPercentage}% complete`
                      : 'Pick a path to get a guided, step-by-step curriculum.'}
                  </p>
                </div>
                <button
                  className="shrink-0 self-start sm:self-auto rounded-full px-7 py-3 bg-primary text-on-primary font-headline text-sm font-bold hover:opacity-90 transition-opacity"
                  onClick={handleResumeLearning}
                  type="button"
                >
                  {activePathProgress?.completionPercentage ? 'Resume' : 'Start'}
                </button>
              </div>
              <div className="mt-4 h-2 w-full rounded-full bg-on-primary-container/20 overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-700 ease-out"
                  style={{ width: `${Math.max(activePathProgress?.completionPercentage || 0, 2)}%` }}
                ></div>
              </div>
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <section className="rounded-3xl bg-surface-container-low p-5 flex flex-col">
                <div className="flex items-center gap-2 mb-4">
                  <h2 className="font-headline text-lg font-extrabold text-on-background">
                    Activity
                  </h2>
                  <span className="rounded-full bg-surface-container-high px-2.5 py-0.5 font-headline text-xs font-bold text-on-surface-variant">
                    {activityItems.length}
                  </span>
                </div>

                <div className="relative mb-3">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-base text-on-surface-variant">
                    search
                  </span>
                  <input
                    aria-label="Search activity"
                    className={searchFieldClass}
                    onChange={(event) => setActivityQuery(event.target.value)}
                    placeholder="Find update"
                    type="text"
                    value={activityQuery}
                  />
                </div>

                <div className="flex-1 overflow-y-auto -mr-2 pr-2 space-y-1">
                  {activityItems.length > 0 ? (
                    activityItems.map((notification) => (
                      <div
                        className="group flex items-center gap-3 rounded-2xl px-3 py-2.5 hover:bg-surface-container-lowest transition-colors"
                        key={notification.id}
                      >
                        <span className="h-9 w-9 shrink-0 rounded-lg bg-secondary-container text-on-secondary-container inline-flex items-center justify-center">
                          <span className="material-symbols-outlined text-base">
                            {notification.type === 'warning' ? 'priority_high' : 'notifications'}
                          </span>
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-headline text-sm font-bold text-on-background truncate">
                            {notification.title}
                          </p>
                          <p className="font-body text-xs text-on-surface-variant truncate">
                            {notification.message}
                          </p>
                        </div>
                        <span className="shrink-0 font-body text-[11px] text-on-surface-variant">
                          {relativeLabel(notification.created_at)}
                        </span>
                        <button
                          aria-label="Dismiss update"
                          className="shrink-0 text-on-surface-variant opacity-0 group-hover:opacity-100 hover:text-error transition-all"
                          onClick={() => handleDismissNotification(notification.id)}
                          type="button"
                        >
                          <span className="material-symbols-outlined text-base">close</span>
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center gap-2 py-8">
                      <span className="material-symbols-outlined text-4xl text-on-surface-variant/40">
                        inbox
                      </span>
                      <p className="font-body text-sm text-on-surface-variant">
                        {activityQuery ? 'No updates match that search.' : 'No new activity.'}
                      </p>
                    </div>
                  )}
                </div>
              </section>

              <section className="rounded-3xl bg-surface-container-low p-5 flex flex-col min-h-[22rem]">
                <div className="flex items-center justify-between gap-2 mb-4">
                  <div className="flex items-center gap-2">
                    <h2 className="font-headline text-lg font-extrabold text-on-background">
                      Courses
                    </h2>
                    <span className="rounded-full bg-surface-container-high px-2.5 py-0.5 font-headline text-xs font-bold text-on-surface-variant">
                      {courses.length}
                    </span>
                  </div>
                  <button
                    className="font-headline text-xs font-bold text-primary hover:opacity-80 transition-opacity"
                    onClick={() => setIsCourseModalOpen(true)}
                    type="button"
                  >
                    View all
                  </button>
                </div>

                <div className="relative mb-3">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-base text-on-surface-variant">
                    search
                  </span>
                  <input
                    aria-label="Search courses"
                    className={searchFieldClass}
                    onChange={(event) => setCourseQuery(event.target.value)}
                    placeholder="Find course"
                    type="text"
                    value={courseQuery}
                  />
                </div>

                <div className="space-y-2">
                  {previewCourseItems.length > 0 ? (
                    previewCourseItems.map((course) => (
                      <button
                        className="group w-full flex items-center gap-3 rounded-2xl px-3 py-2.5 text-left hover:bg-surface-container-lowest transition-colors"
                        key={course.id}
                        onClick={() => navigate(`/learn/course/${course.slug}`)}
                        type="button"
                      >
                        <CourseThumb course={course} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="font-headline text-sm font-bold text-on-background truncate group-hover:text-primary transition-colors">
                            {course.title}
                          </p>
                          <p className="font-body text-xs text-on-surface-variant truncate">
                            {course.category} · {course.estimateTime || course.level}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2.5 py-0.5 font-headline text-[11px] font-bold ${
                            course.status === 'completed'
                              ? 'bg-mint text-on-mint'
                              : course.status === 'in-progress'
                                ? 'bg-butter text-on-butter'
                                : 'bg-surface-container-high text-on-surface-variant'
                          }`}
                        >
                          {course.status === 'completed'
                            ? 'Done'
                            : course.status === 'in-progress'
                              ? 'Active'
                              : 'New'}
                        </span>
                      </button>
                    ))
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center gap-2 py-8">
                      <span className="material-symbols-outlined text-4xl text-on-surface-variant/40">
                        search_off
                      </span>
                      <p className="font-body text-sm text-on-surface-variant">
                        No courses match that search.
                      </p>
                    </div>
                  )}
                </div>
                {courseItems.length > COURSE_PREVIEW_LIMIT ? <button className="mt-3 self-center rounded-full px-4 py-2 font-headline text-xs font-bold text-primary hover:bg-surface-container-high" onClick={() => setIsCourseModalOpen(true)} type="button">Show {courseItems.length - COURSE_PREVIEW_LIMIT} more</button> : null}
              </section>
            </div>
          </div>

          <aside className="space-y-6 min-w-0">
            <section>
              <h2 className="font-headline text-lg font-extrabold text-on-background mb-3">
                Scheduled
              </h2>
              <MiniCalendar
                events={calendarEvents}
                onSelectDate={setSelectedDate}
                selectedDate={selectedDate}
              />
            </section>

            <section>
              <div className="flex items-baseline justify-between gap-2 mb-3">
                <h2 className="font-headline text-lg font-extrabold text-on-background">Upcoming</h2>
                <span className="font-body text-xs text-on-surface-variant">
                  {isShowingSelectedDay
                    ? selectedDate.toLocaleDateString([], { month: 'short', day: 'numeric' })
                    : 'Next up'}
                </span>
              </div>

              <div className="space-y-2">
                {scheduleForSelectedDate.length > 0 ? (
                  scheduleForSelectedDate.map((event) => (
                    <div className="flex items-start gap-3" key={event.id}>
                      <span className="w-12 shrink-0 pt-3 font-body text-[11px] text-on-surface-variant">
                        {timeLabel(event.date)}
                      </span>
                      <div
                        className={`flex-1 min-w-0 rounded-2xl px-4 py-3 ${
                          EVENT_KINDS[event.kind]?.chip || 'bg-surface-container'
                        }`}
                      >
                        <p className="font-headline text-sm font-bold truncate">{event.name}</p>
                        <p className="font-body text-xs opacity-80">
                          {dayLabel(event.date)} · {EVENT_KINDS[event.kind]?.label || 'Event'}
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl bg-surface-container px-4 py-6 text-center">
                    <p className="font-body text-sm text-on-surface-variant">
                      Nothing scheduled yet.
                    </p>
                  </div>
                )}
              </div>

              {nextEvent ? (
                <button
                  className="mt-4 w-full rounded-full py-3 bg-primary text-on-primary font-headline text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-60"
                  disabled={isSavingRegistration}
                  onClick={handleToggleEventRegistration}
                  type="button"
                >
                  {isSavingRegistration
                    ? 'Saving…'
                    : nextEvent.is_registered
                      ? 'Cancel registration'
                      : `Register for ${nextEvent.name}`}
                </button>
              ) : null}
            </section>
          </aside>
        </div>
      </div>

      <footer className="w-full py-6 flex flex-col md:flex-row justify-between items-center gap-4 px-2 sm:px-6">
        <span className="font-body text-xs text-on-surface-variant">
          © {new Date().getFullYear()} Minerva Academy
        </span>
        <div className="flex flex-wrap justify-center gap-6">
          <a
            className="font-body text-xs text-on-surface-variant hover:text-primary transition-colors"
            href="#"
          >
            Privacy
          </a>
          <a
            className="font-body text-xs text-on-surface-variant hover:text-primary transition-colors"
            href="#"
          >
            Terms
          </a>
          <a
            className="font-body text-xs text-on-surface-variant hover:text-primary transition-colors"
            href="#"
          >
            Accessibility
          </a>
        </div>
      </footer>
    </div>
  )
}

export default DashboardPage
