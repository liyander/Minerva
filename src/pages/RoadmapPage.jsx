import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { getCareerPathsData, hydrateCareerPathsData } from '../data/careerPathsData'
import { getCoursesData, hydrateCoursesData } from '../data/coursesData'
import {
  getLabProgressEvents,
  getLabProgressMap,
  syncLabProgressFromBackend,
} from '../services/labProgress'
import { apiFetch } from '../services/api'

function getRoomStatus(progress) {
  if (progress?.completedAt) return 'completed'
  if (progress?.startedAt) return 'in-progress'
  return 'queued'
}

const INTRO_PATH_PATTERN = /(?:introduction|intro|getting[-_\s]+started)[-_\s]*(?:to)?[-_\s]*(?:programming|coding|development|design|data)?|foundations?[-_\s]+101/

function isIntroCourse(room) {
  const text = `${room?.title || ''} ${room?.slug || ''} ${room?.id || ''}`.toLowerCase()
  return INTRO_PATH_PATTERN.test(text)
}

function isIntroPath(path) {
  const text = `${path?.title || ''} ${path?.slug || ''} ${path?.id || ''}`.toLowerCase()
  return INTRO_PATH_PATTERN.test(text)
}

function isIntroModule(module) {
  const text = `${module?.title || ''} ${module?.phase || ''} ${module?.id || ''}`.toLowerCase()
  const moduleTitleMatches = INTRO_PATH_PATTERN.test(text)
  const moduleOnlyContainsIntro = (module?.rooms || []).length > 0 && (module.rooms || []).every(isIntroCourse)
  return moduleTitleMatches || moduleOnlyContainsIntro
}

function sortPathsByRoadmapOrder(paths) {
  return [...paths].sort((a, b) =>
    (a.roadmapSortOrder ?? 0) - (b.roadmapSortOrder ?? 0)
    || String(a.title || '').localeCompare(String(b.title || '')),
  )
}

function getIconForTrack(value) {
  const text = String(value || '').toLowerCase()
  if (/soc|defen|blue|analyst|incident/.test(text)) return 'security'
  if (/pen|red|web|exploit|offen/.test(text)) return 'bug_report'
  if (/engineer|devsec|cloud|aws|azure/.test(text)) return 'hub'
  if (/ai|machine|model/.test(text)) return 'psychology'
  if (/crypto/.test(text)) return 'key'
  if (/forensic/.test(text)) return 'travel_explore'
  return 'terminal'
}

function getTrackTone(index, title) {
  const text = String(title || '').toLowerCase()
  if (/ai/.test(text)) {
    return {
      glow: 'shadow-[0_0_70px_rgba(139,92,246,0.28)]',
      border: 'border-violet-400/70',
      accent: 'bg-violet-500',
      line: 'bg-violet-400/60',
      panel: 'from-violet-500/35 to-surface-container-high',
      text: 'text-violet-200',
    }
  }

  const tones = [
    {
      glow: '',
      border: 'border-blue-400/35',
      accent: 'bg-blue-500',
      line: 'bg-blue-300/35',
      panel: 'from-blue-500/30 to-surface-container-high',
      text: 'text-blue-200',
    },
    {
      glow: '',
      border: 'border-primary/45',
      accent: 'bg-primary',
      line: 'bg-primary/35',
      panel: 'from-primary/35 to-surface-container-high',
      text: 'text-primary',
    },
    {
      glow: '',
      border: 'border-cyan-300/40',
      accent: 'bg-secondary',
      line: 'bg-cyan-300/35',
      panel: 'from-cyan-400/30 to-surface-container-high',
      text: 'text-secondary',
    },
    {
      glow: '',
      border: 'border-amber-300/40',
      accent: 'bg-amber-400',
      line: 'bg-amber-300/35',
      panel: 'from-amber-400/25 to-surface-container-high',
      text: 'text-amber-200',
    },
  ]

  return tones[index % tones.length]
}

function buildFallbackModules(rooms) {
  const grouped = rooms.reduce((acc, room) => {
    const key = room.category || room.categoryTag || 'General Operations'
    acc[key] = acc[key] || []
    acc[key].push(room.id)
    return acc
  }, {})

  return Object.entries(grouped).map(([category, roomIds], index) => ({
    id: `category-${category.toLowerCase().replace(/[^a-z0-9]+/g, '-') || index}`,
    phase: `Track ${String(index + 1).padStart(2, '0')}`,
    title: category,
    description: `Build capability across ${category.toLowerCase()} skills.`,
    rooms: roomIds,
  }))
}

function RoadmapPage() {
  const [paths, setPaths] = useState(() => getCareerPathsData())
  const [rooms, setRooms] = useState(() => getCoursesData())
  const [progressMap, setProgressMap] = useState(() => getLabProgressMap())
  const [isLoading, setIsLoading] = useState(true)
  const [roadmapZoom, setRoadmapZoom] = useState(1)
  const roadmapViewportRef = useRef(null)
  const pinchStateRef = useRef({ distance: 0, zoom: 1 })
  const gestureZoomRef = useRef(1)

  useEffect(() => {
    let cancelled = false

    async function loadRoadmap() {
      setIsLoading(true)
      try {
        const [pathsResponse, roomsResponse] = await Promise.all([
          apiFetch('/career-paths'),
          apiFetch('/rooms'),
        ])
        const nextPaths = Array.isArray(pathsResponse) ? pathsResponse : []
        const nextRooms = Array.isArray(roomsResponse) ? roomsResponse : []

        hydrateCareerPathsData(nextPaths)
        hydrateCoursesData(nextRooms)

        if (!cancelled) {
          setPaths(nextPaths)
          setRooms(nextRooms)
        }
      } catch {
        if (!cancelled) {
          setPaths(getCareerPathsData())
          setRooms(getCoursesData())
        }
      } finally {
        if (!cancelled) {
          const syncedProgress = await syncLabProgressFromBackend()
          if (!cancelled) {
            setProgressMap(syncedProgress || getLabProgressMap())
            setIsLoading(false)
          }
        }
      }
    }

    void loadRoadmap()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const events = getLabProgressEvents()
    const syncProgress = () => setProgressMap(getLabProgressMap())
    const handleStorage = (event) => {
      if (event.key === events.updatedStorageKey) syncProgress()
    }

    window.addEventListener(events.updatedEvent, syncProgress)
    window.addEventListener('storage', handleStorage)
    return () => {
      window.removeEventListener(events.updatedEvent, syncProgress)
      window.removeEventListener('storage', handleStorage)
    }
  }, [])

  const roadmap = useMemo(() => {
    const roomsById = new Map(rooms.map((room) => [room.id, room]))
    const hasConfiguredPaths = paths.length > 0
    const sourcePaths = paths.length
      ? paths
      : [{
          id: 'all-rooms',
          title: 'Course Catalogue',
          description: 'A generated roadmap from all available academy skills.',
          modules: buildFallbackModules(rooms),
        }]

    return sortPathsByRoadmapOrder(sourcePaths)
      .map((path) => {
        const modules = (hasConfiguredPaths ? (path.modules || []) : buildFallbackModules(rooms))
          .map((module) => {
            const moduleRooms = (module.rooms || [])
              .map((roomId) => roomsById.get(roomId))
              .filter(Boolean)

            const completed = moduleRooms.filter((room) => progressMap[room.id]?.completedAt).length
            const inProgress = moduleRooms.filter((room) => progressMap[room.id]?.startedAt && !progressMap[room.id]?.completedAt).length
            const completion = moduleRooms.length ? Math.round((completed / moduleRooms.length) * 100) : 0

            return {
              ...module,
              rooms: moduleRooms,
              completed,
              inProgress,
              completion,
            }
          })

        const totalRooms = modules.reduce((sum, module) => sum + module.rooms.length, 0)
        const completedRooms = modules.reduce((sum, module) => sum + module.completed, 0)
        const pathCompletion = totalRooms ? Math.round((completedRooms / totalRooms) * 100) : 0

        return {
          ...path,
          modules,
          totalRooms,
          completedRooms,
          pathCompletion,
        }
      })
      .filter((path) => hasConfiguredPaths || path.modules.length)
  }, [paths, progressMap, rooms])

  const allRooms = roadmap.flatMap((path) => path.modules.flatMap((module) => module.rooms))
  const completedRooms = allRooms.filter((room) => progressMap[room.id]?.completedAt).length
  const inProgressRooms = allRooms.filter((room) => progressMap[room.id]?.startedAt && !progressMap[room.id]?.completedAt).length
  const nextRoom = allRooms.find((room) => getRoomStatus(progressMap[room.id]) !== 'completed')
  const foundationPath = roadmap.find(isIntroPath)
  const foundationPathRooms = foundationPath?.modules?.flatMap((module) => module.rooms) || []
  const foundationRoom = foundationPathRooms.find(isIntroCourse) || allRooms.find(isIntroCourse)
  const foundationTargetRoom = foundationRoom
    || allRooms.find((room) => /foundation|basic|intro/i.test(room.title || room.category || ''))
    || allRooms[0]
  const pathsById = new Map(roadmap.map((path) => [path.id, path]))
  const linkedPathIds = new Set(
    roadmap.flatMap((path) => path.modules.map((module) => module.linkedPathId).filter(Boolean)),
  )
  const foundationFlowModules = foundationPath?.modules || []
  const branchPaths = roadmap.filter((path) => (
    path.id !== foundationPath?.id && !linkedPathIds.has(path.id)
  ))
  const foundationEntry = foundationPath || (foundationTargetRoom
    ? {
        id: 'foundation-entry',
        slug: foundationTargetRoom.slug || foundationTargetRoom.id,
        title: 'Getting Started',
        description: foundationRoom?.description || 'Begin here before branching into academy specializations, practical labs, and role-based paths.',
        pathCompletion: getRoomStatus(progressMap[foundationTargetRoom.id]) === 'completed' ? 100 : 0,
      }
    : null)
  const columns = branchPaths.map((path, index) => {
    const modulesForPath = path.modules.filter((module) => !isIntroModule(module))

    return {
      ...path,
      tone: getTrackTone(index, path.title),
      modules: modulesForPath,
    }
  })
  const linkedPathSideAllowance = linkedPathIds.size ? 12 : 0
  const branchGridGapRem = linkedPathIds.size ? 18 : 2
  const branchGridGap = `${branchGridGapRem}rem`
  const branchColumnWidth = `${Math.max(12, 18 * roadmapZoom).toFixed(2)}rem`
  const branchGridColumns = `repeat(${Math.max(columns.length, 1)}, minmax(${branchColumnWidth}, 1fr))`
  const branchGridWidth = `${(Math.max(columns.length, 4) * 20 * roadmapZoom) + (Math.max(columns.length - 1, 0) * branchGridGapRem) + linkedPathSideAllowance}rem`
  const clampRoadmapZoom = useCallback((value) => Math.max(0.7, Math.min(1.3, Number(value.toFixed(2)))), [])
  const setClampedRoadmapZoom = useCallback((value) => {
    setRoadmapZoom(clampRoadmapZoom(value))
  }, [clampRoadmapZoom])
  const zoomRoadmapBy = useCallback((delta) => {
    setRoadmapZoom((current) => clampRoadmapZoom(current + delta))
  }, [clampRoadmapZoom])

  const getTouchDistance = (touches) => {
    if (!touches || touches.length < 2) return 0
    const [first, second] = touches
    return Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY)
  }

  const handlePinchStart = (event) => {
    if (event.touches.length !== 2) return
    pinchStateRef.current = {
      distance: getTouchDistance(event.touches),
      zoom: roadmapZoom,
    }
  }

  const handlePinchMove = (event) => {
    if (event.touches.length !== 2 || !pinchStateRef.current.distance) return
    event.preventDefault()
    const nextDistance = getTouchDistance(event.touches)
    const scale = nextDistance / pinchStateRef.current.distance
    setClampedRoadmapZoom(pinchStateRef.current.zoom * scale)
  }

  const handlePinchEnd = () => {
    pinchStateRef.current = { distance: 0, zoom: roadmapZoom }
  }

  useEffect(() => {
    const viewport = roadmapViewportRef.current
    if (!viewport) return undefined

    const handleNativeWheel = (event) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault()
        event.stopPropagation()
        const rawDelta = Math.abs(event.deltaY || event.deltaX || 0)
        const step = Math.max(0.04, Math.min(0.14, rawDelta / 700))
        zoomRoadmapBy(event.deltaY > 0 || event.deltaX > 0 ? -step : step)
      }
    }

    const handleNativeGestureStart = (event) => {
      event.preventDefault()
      gestureZoomRef.current = roadmapZoom
    }

    const handleNativeGestureChange = (event) => {
      event.preventDefault()
      const scale = Number(event.scale || 1)
      setClampedRoadmapZoom(gestureZoomRef.current * scale)
    }

    const handleNativeTouchMove = (event) => {
      if (event.touches?.length !== 2) return
      event.preventDefault()
    }

    const handleNativeCtrlWheelFallback = (event) => {
      if (!event.ctrlKey && !event.metaKey) return
      if (!viewport.contains(event.target)) return
      event.preventDefault()
      const rawDelta = Math.abs(event.deltaY || event.deltaX || 0)
      const step = Math.max(0.04, Math.min(0.14, rawDelta / 700))
      zoomRoadmapBy(event.deltaY > 0 || event.deltaX > 0 ? -step : step)
    }

    viewport.addEventListener('wheel', handleNativeWheel, { passive: false })
    viewport.addEventListener('touchmove', handleNativeTouchMove, { passive: false })
    viewport.addEventListener('gesturestart', handleNativeGestureStart, { passive: false })
    viewport.addEventListener('gesturechange', handleNativeGestureChange, { passive: false })
    window.addEventListener('wheel', handleNativeCtrlWheelFallback, { passive: false })

    return () => {
      viewport.removeEventListener('wheel', handleNativeWheel)
      viewport.removeEventListener('touchmove', handleNativeTouchMove)
      viewport.removeEventListener('gesturestart', handleNativeGestureStart)
      viewport.removeEventListener('gesturechange', handleNativeGestureChange)
      window.removeEventListener('wheel', handleNativeCtrlWheelFallback)
    }
  }, [roadmapZoom, setClampedRoadmapZoom, zoomRoadmapBy])

  const renderLinkedPathBranch = (linkedPath, tone, keyPrefix) => {
    if (!linkedPath) return null

    const childModules = (linkedPath.modules || []).filter((module) => !isIntroModule(module))
    const lineClass = tone?.line || 'bg-secondary/70'
    const borderClass = tone?.border || 'border-secondary/50'
    const panelClass = tone?.panel || 'from-secondary/30 to-surface-container-high'
    const textClass = tone?.text || 'text-secondary'
    const pathTarget = `/learn/path/${linkedPath.slug || linkedPath.id}`

    return (
      <div
        className="relative mx-auto mt-3 max-w-[92%] lg:absolute lg:left-[calc(100%+1.5rem)] lg:top-1/2 lg:z-30 lg:mt-0 lg:w-56 lg:max-w-none lg:-translate-y-1/2"
        key={`${keyPrefix}-${linkedPath.id}`}
      >
        <div className={`mx-auto hidden h-5 w-[3px] ${lineClass} lg:hidden`}></div>
        <div className={`absolute -left-6 top-1/2 hidden h-[3px] w-6 -translate-y-1/2 ${lineClass} lg:block`}></div>
        <div className={`absolute -left-2 top-1/2 hidden h-3 w-3 -translate-y-1/2 border-2 ${borderClass} bg-surface-container-lowest lg:block`}></div>
        <Link
          className={`group relative z-10 block border ${borderClass} bg-surface-container-lowest p-3 text-left shadow-[0_0_24px_rgba(102,217,239,0.10)] transition-transform hover:-translate-y-0.5`}
          to={pathTarget}
        >
          <div className="flex items-start gap-2.5">
            <span className={`grid h-9 w-9 shrink-0 place-items-center bg-gradient-to-br ${panelClass}`}>
              <span className="material-symbols-outlined text-xl text-on-background">
                account_tree
              </span>
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-headline text-xs font-bold text-secondary">
                Linked Sub-Path
              </p>
              <h4 className="mt-1 line-clamp-2 font-headline text-[11px] font-extrabold tracking-wide text-on-background">
                {linkedPath.title}
              </h4>
              <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-on-surface-variant">
                {linkedPath.description || `${linkedPath.completedRooms}/${linkedPath.totalRooms} skills mapped in this sub-path.`}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <span className={`font-headline text-sm font-extrabold ${textClass}`}>
                {linkedPath.pathCompletion || 0}%
              </span>
              <p className="font-headline text-[11px] font-bold text-on-surface-variant">
                Complete
              </p>
            </div>
          </div>
          {childModules.length ? (
            <div className="mt-3 border-t border-outline-variant/50 pt-3">
              <p className="font-headline text-[11px] font-bold text-on-surface-variant">
                Submodules
              </p>
              <div className="mt-2 space-y-1.5">
                {childModules.slice(0, 4).map((childModule, childIndex) => (
                  <div
                    className="rounded-full flex items-center gap-2 bg-surface-container-high/70 px-2 py-1.5 text-xs text-on-surface-variant"
                    key={`${keyPrefix}-${linkedPath.id}-${childModule.id}`}
                  >
                    <span className={`h-1.5 w-1.5 shrink-0 ${lineClass}`}></span>
                    <span className="min-w-0 flex-1 truncate font-headline font-bold tracking-wide">
                      {childModule.phase || `Module ${String(childIndex + 1).padStart(2, '0')}`} - {childModule.title}
                    </span>
                  </div>
                ))}
                {childModules.length > 4 ? (
                  <p className="px-2 pt-1 text-xs text-on-surface-variant">
                    +{childModules.length - 4} more modules
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
        </Link>
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-surface pt-32 md:pt-36 text-on-surface">
      <section className="relative overflow-hidden px-4 py-10 sm:px-8 lg:px-12">
        <div
          className="absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 0%, rgba(109,85,224,0.10), transparent 45%), radial-gradient(circle at 85% 10%, rgba(15,155,118,0.10), transparent 40%)',
          }}
        ></div>
        <div className="absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-primary/10 to-transparent"></div>

        <div className="relative mx-auto max-w-[104rem]">
          <header className="mx-auto max-w-5xl text-center">
            <p className="font-headline text-xs font-bold text-on-surface-variant">
              Your learning map
            </p>
            <h1 className="mt-4 font-headline text-4xl font-extrabold tracking-tight text-on-background sm:text-5xl lg:text-6xl">
              Minerva Roadmap
            </h1>
            <p className="mx-auto mt-5 max-w-3xl text-base font-medium leading-relaxed text-on-surface-variant sm:text-lg">
              A live mission route built from academy skills, career paths, practical labs, and your completion state.
            </p>
          </header>

          {isLoading ? (
            <div className="rounded-2xl mx-auto mt-16 max-w-lg border border-outline-variant/50 bg-surface-container-lowest p-6 text-center font-headline text-xs text-on-surface-variant">
              Building roadmap...
            </div>
          ) : (
            <div className="relative mx-auto mt-12 max-w-[96rem]">
              <div className="mb-5 flex flex-wrap items-center justify-center gap-2">
                <button
                  className="rounded-lg inline-flex items-center gap-2 border border-outline-variant bg-surface-container-lowest px-4 py-2 font-headline text-xs font-bold text-on-surface hover:border-secondary disabled:opacity-40"
                  disabled={roadmapZoom <= 0.7}
                  onClick={() => setRoadmapZoom((current) => Math.max(0.7, Number((current - 0.1).toFixed(2))))}
                  type="button"
                >
                  <span className="material-symbols-outlined text-base">zoom_out</span>
                  Shrink
                </button>
                <button
                  className="rounded-lg inline-flex items-center gap-2 border border-secondary bg-secondary/10 px-4 py-2 font-headline text-sm font-bold text-secondary"
                  onClick={() => setRoadmapZoom(1)}
                  type="button"
                >
                  <span className="material-symbols-outlined text-base">center_focus_strong</span>
                  {Math.round(roadmapZoom * 100)}%
                </button>
                <button
                  className="rounded-lg inline-flex items-center gap-2 border border-outline-variant bg-surface-container-lowest px-4 py-2 font-headline text-xs font-bold text-on-surface hover:border-secondary disabled:opacity-40"
                  disabled={roadmapZoom >= 1.3}
                  onClick={() => setRoadmapZoom((current) => Math.min(1.3, Number((current + 0.1).toFixed(2))))}
                  type="button"
                >
                  <span className="material-symbols-outlined text-base">zoom_in</span>
                  Expand
                </button>
              </div>

              <div
                className="overflow-x-auto overflow-y-visible overscroll-x-contain pb-4 [touch-action:pan-x_pan-y]"
                onTouchCancel={handlePinchEnd}
                onTouchEnd={handlePinchEnd}
                onTouchMove={handlePinchMove}
                onTouchStart={handlePinchStart}
                ref={roadmapViewportRef}
              >
              <div className="mx-auto" style={{ width: branchGridWidth }}>
              <div className="rounded-xl mx-auto hidden h-10 w-[3px] bg-secondary/65 shadow-[0_0_18px_rgba(102,217,239,0.25)] lg:block"></div>
              {foundationEntry ? (
                <Link
                  className="rounded-2xl group relative z-10 mx-auto flex max-w-2xl border border-secondary/70 bg-surface-container-lowest p-5 shadow-[0_0_34px_rgba(102,217,239,0.12)] transition-transform hover:-translate-y-0.5"
                  to={foundationPath ? `/learn/path/${foundationPath.slug || foundationPath.id}` : `/learn/course/${foundationTargetRoom.slug || foundationTargetRoom.id}`}
                >
                  <div className="rounded-xl grid h-20 w-20 shrink-0 place-items-center bg-secondary/20 text-secondary">
                    <span className="material-symbols-outlined text-4xl">
                      shield
                    </span>
                  </div>
                  <div className="min-w-0 flex-1 px-5">
                    <p className="font-headline text-xs font-bold text-secondary">
                      Foundation Entry
                    </p>
                    <h2 className="mt-2 font-headline text-2xl font-extrabold tracking-tight text-on-background">
                      {foundationEntry.title}
                    </h2>
                    <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-on-surface-variant">
                      {foundationEntry.description || 'Begin here before branching into academy specializations, practical labs, and role-based paths.'}
                    </p>
                  </div>
                  <div className="hidden min-w-24 flex-col items-end justify-center sm:flex">
                    <span className="font-headline text-3xl font-extrabold text-secondary">
                      {foundationEntry.pathCompletion || 0}%
                    </span>
                    <span className="font-headline text-xs font-bold text-on-surface-variant">
                      Complete
                    </span>
                  </div>
                </Link>
              ) : null}
              {foundationFlowModules.length ? (
                <div className="mx-auto max-w-2xl">
                  <div className="rounded-xl mx-auto hidden h-8 w-[5px] bg-secondary shadow-[0_0_18px_rgba(102,217,239,0.28)] lg:block"></div>
                  <div className="space-y-0">
                    {foundationFlowModules.map((module, moduleIndex) => {
                      const firstRoom = module.rooms?.[0]
                      const isActive = module.rooms?.some((room) => nextRoom?.id === room.id)
                      const linkedPath = module.linkedPathId ? pathsById.get(module.linkedPathId) : null
                      const moduleTarget = module.id
                        ? linkedPath
                          ? `/learn/path/${linkedPath.slug || linkedPath.id}`
                          : `/learn/path/${foundationPath.slug || foundationPath.id}/module/${module.id}`
                        : firstRoom
                          ? `/learn/course/${firstRoom.slug || firstRoom.id}`
                          : `/learn/path/${foundationPath.slug || foundationPath.id}`

                      return (
                        <div className={`relative ${linkedPath ? 'lg:min-h-[15rem]' : ''}`} key={`foundation-${module.id}`}>
                          {moduleIndex > 0 ? (
                            <div className="rounded-xl mx-auto hidden h-4 w-[3px] bg-secondary/70 lg:block"></div>
                          ) : null}
                          <Link
                            className={`rounded-xl group relative z-10 flex min-h-24 overflow-hidden border bg-surface-container-lowest shadow-lg transition-transform hover:-translate-y-0.5 ${
                              isActive
                                ? 'border-secondary shadow-[0_0_30px_rgba(102,217,239,0.14)]'
                                : module.completion === 100
                                  ? 'border-secondary/60'
                                  : 'border-secondary/40'
                            }`}
                            to={moduleTarget}
                          >
                            {isActive ? (
                              <span className="rounded-full absolute left-0 top-0 z-20 bg-secondary px-3 py-1 font-headline text-sm font-bold text-on-secondary">
                                Next
                              </span>
                            ) : null}
                            <div className="grid w-24 shrink-0 place-items-center bg-secondary/20">
                              <span className="material-symbols-outlined text-4xl text-secondary">
                                {getIconForTrack(module.title)}
                              </span>
                            </div>
                            <div className="flex min-w-0 flex-1 flex-col justify-center p-4 pr-14">
                              <p className="font-headline text-xs font-bold text-primary">
                                {module.phase || `Module ${String(moduleIndex + 1).padStart(2, '0')}`} / {module.rooms.length} skills
                              </p>
                              <h4 className="mt-1 line-clamp-2 font-headline text-sm font-extrabold tracking-wide text-on-background">
                                {module.title}
                              </h4>
                              {linkedPath ? (
                                <p className="mt-2 line-clamp-1 font-headline text-xs font-bold text-secondary">
                                  Links to {linkedPath.title}
                                </p>
                              ) : null}
                            </div>
                            {module.completion > 0 && module.completion < 100 ? (
                              <div className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full border-2 border-secondary bg-surface-container-lowest text-xs font-extrabold text-secondary">
                                {module.completion}%
                              </div>
                            ) : null}
                            {module.completion === 100 ? (
                              <div className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-secondary text-on-secondary">
                                <span className="material-symbols-outlined text-xl">check</span>
                              </div>
                            ) : null}
                          </Link>
                          {linkedPath ? renderLinkedPathBranch(linkedPath, null, `foundation-link-${module.id}`) : null}
                          <div className="rounded-xl mx-auto hidden h-4 w-[3px] bg-secondary/70 lg:block"></div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : null}
              <div className="relative mx-auto hidden h-32 w-full lg:block">
                <div className="absolute left-1/2 -top-px h-full w-[5px] -translate-x-1/2 bg-secondary shadow-[0_0_26px_rgba(102,217,239,0.45)]"></div>
                <div className="absolute left-0 right-0 bottom-0 h-[5px] bg-secondary shadow-[0_0_22px_rgba(102,217,239,0.32)]"></div>
                <div
                  className="absolute inset-x-0 bottom-0 grid translate-y-full"
                  style={{ columnGap: branchGridGap, gridTemplateColumns: branchGridColumns }}
                >
                  {columns.map((column) => (
                    <div className="h-10" key={`root-link-${column.id || column.title}`}>
                      <div className="mx-auto h-full w-[5px] bg-secondary shadow-[0_0_18px_rgba(102,217,239,0.28)]"></div>
                    </div>
                  ))}
                </div>
              </div>

              <div
                className="grid gap-y-8 lg:mt-10 lg:items-start"
                style={{ columnGap: branchGridGap, gridTemplateColumns: branchGridColumns }}
              >
                {columns.map((column) => (
                  <section className="relative pt-10" key={column.id || column.title}>
                    <div className={`absolute left-1/2 top-0 hidden h-full w-[3px] -translate-x-1/2 ${column.tone.line} lg:block`}></div>
                    <div className="rounded-xl absolute left-1/2 top-0 hidden h-10 w-[5px] -translate-x-1/2 bg-secondary shadow-[0_0_16px_rgba(102,217,239,0.22)] lg:block"></div>
                    <div className="rounded-2xl relative z-10 mx-auto min-h-40 border border-outline-variant/60 bg-surface-container-lowest p-5 text-center shadow-xl">
                      <p className="font-headline text-xs font-bold text-primary">
                        Specialization
                      </p>
                      <h3 className="mt-2 font-headline text-xl font-extrabold tracking-tight text-on-background">
                        {column.title}
                      </h3>
                      <p className="mx-auto mt-2 line-clamp-3 max-w-xs text-sm leading-relaxed text-on-surface-variant">
                        {column.description || `${column.completedRooms}/${column.totalRooms} skills completed in this specialization.`}
                      </p>
                      <div className="rounded-xl mt-4 h-1.5 bg-surface-container-high">
                        <div className="h-full bg-secondary" style={{ width: `${column.pathCompletion}%` }}></div>
                      </div>
                    </div>

                    <div className={`relative z-10 mx-auto hidden h-6 w-[3px] ${column.tone.line} lg:block`}></div>

                    <div className="relative z-10 space-y-0">
                      {column.modules.length ? column.modules.map((module, moduleIndex) => {
                        const isActive = module.rooms?.some((room) => nextRoom?.id === room.id)
                        const firstRoom = module.rooms?.[0]
                        const progress = module.completion || 0
                        const linkedPath = module.linkedPathId ? pathsById.get(module.linkedPathId) : null
                        const moduleTarget = module.id
                          ? linkedPath
                            ? `/learn/path/${linkedPath.slug || linkedPath.id}`
                            : `/learn/path/${column.slug || column.id}/module/${module.id}`
                          : firstRoom
                            ? `/learn/course/${firstRoom.slug || firstRoom.id}`
                            : `/learn/path/${column.slug || column.id}`

                        return (
                          <div className={`relative ${linkedPath ? 'lg:min-h-[15rem]' : ''}`} key={module.id}>
                            {moduleIndex > 0 ? (
                              <div className={`mx-auto hidden h-4 w-[3px] ${column.tone.line} lg:block`}></div>
                            ) : null}
                            <Link
                              className={`rounded-xl group relative z-10 flex min-h-28 overflow-hidden border bg-surface-container-lowest shadow-lg transition-transform hover:-translate-y-0.5 ${
                                isActive
                                  ? 'border-secondary shadow-[0_0_30px_rgba(102,217,239,0.14)]'
                                  : progress === 100
                                    ? 'border-secondary/60'
                                    : column.tone.border
                              }`}
                              to={moduleTarget}
                            >
                              {isActive ? (
                                <span className="rounded-full absolute left-0 top-0 z-20 bg-secondary px-3 py-1 font-headline text-sm font-bold text-on-secondary">
                                  Next
                                </span>
                              ) : null}
                              <div className={`grid w-24 shrink-0 place-items-center bg-gradient-to-br ${column.tone.panel}`}>
                                <span className="material-symbols-outlined text-4xl text-on-background">
                                  {getIconForTrack(module.title || column.title)}
                                </span>
                              </div>
                              <div className="flex min-w-0 flex-1 flex-col justify-center p-4 pr-16">
                                <h4 className="line-clamp-2 font-headline text-sm font-extrabold tracking-wide text-on-background">
                                  {module.title}
                                </h4>
                                <div className="mt-3 flex flex-wrap items-center gap-2">
                                  <span className={`material-symbols-outlined text-base ${progress === 100 ? 'text-secondary' : column.tone.text}`}>
                                    {progress === 100 ? 'check_circle' : 'signal_cellular_alt'}
                                  </span>
                                  <span className="rounded-full bg-surface-container-high px-3 py-1 font-headline text-xs font-bold text-on-surface-variant">
                                    {module.phase || `Module ${String(moduleIndex + 1).padStart(2, '0')}`}
                                  </span>
                                  <span className="rounded-lg max-w-full truncate bg-primary/10 px-3 py-1 font-headline text-sm font-bold text-primary">
                                    {module.rooms.length} skills
                                  </span>
                                  {module.description ? (
                                    <span className="rounded-lg max-w-full truncate bg-primary/10 px-3 py-1 font-headline text-sm font-bold text-primary">
                                      {module.description}
                                    </span>
                                  ) : null}
                                  {linkedPath ? (
                                    <span className="rounded-lg max-w-full truncate bg-secondary/10 px-3 py-1 font-headline text-sm font-bold text-secondary">
                                      Links to {linkedPath.title}
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                              {progress > 0 && progress !== 100 ? (
                                <div className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full border-2 border-primary bg-surface-container-lowest text-xs font-extrabold text-primary">
                                  {progress}%
                                </div>
                              ) : null}
                              {progress === 100 ? (
                                <div className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-secondary text-on-secondary">
                                  <span className="material-symbols-outlined text-xl">check</span>
                                </div>
                              ) : null}
                            </Link>
                            {linkedPath ? renderLinkedPathBranch(linkedPath, column.tone, `branch-link-${module.id}`) : null}
                            {moduleIndex < column.modules.length - 1 ? (
                              <div className={`mx-auto hidden h-4 w-[3px] ${column.tone.line} lg:block`}></div>
                            ) : null}
                            </div>
                        )
                      }) : (
                        <div className="rounded-2xl border border-outline-variant/50 bg-surface-container-lowest p-5 text-center text-sm text-on-surface-variant">
                          Modules will appear here when this path is configured.
                        </div>
                      )}
                    </div>
                  </section>
                ))}
              </div>
              {columns.length === 0 ? (
                <div className="rounded-2xl border border-outline-variant/50 bg-surface-container-lowest p-8 text-center text-on-surface-variant">
                  No skills are available for a roadmap yet.
                </div>
              ) : null}
              <div className="rounded-xl mx-auto mt-10 hidden h-12 w-[3px] bg-secondary/65 shadow-[0_0_18px_rgba(102,217,239,0.18)] lg:block"></div>
              <div className="rounded-2xl mx-auto max-w-xl border border-outline-variant/50 bg-surface-container-lowest p-6 text-center shadow-xl">
                <p className="font-headline text-xs font-bold text-secondary">
                  Current Mission Focus
                </p>
                <h2 className="mt-2 font-headline text-xl font-extrabold tracking-tight text-on-background">
                  {nextRoom?.title || 'All Mapped Missions Cleared'}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">
                  {nextRoom
                    ? nextRoom.description
                    : 'Every mapped skill is complete. Watch for new learning from the academy.'}
                </p>
                {nextRoom ? (
                  <Link
                    className="rounded-full mt-5 inline-flex items-center justify-center gap-2 bg-primary px-5 py-3 font-headline text-xs font-extrabold text-on-primary"
                    to={`/learn/course/${nextRoom.slug || nextRoom.id}`}
                  >
                    Enter Mission
                    <span className="material-symbols-outlined text-base">arrow_forward</span>
                  </Link>
                ) : null}
              </div>
              </div>
              </div>
            </div>
          )}

          <div className="rounded-2xl relative mx-auto mt-14 grid max-w-4xl gap-4 border border-outline-variant/40 bg-surface-container-lowest p-5 sm:grid-cols-3">
            <div>
              <p className="font-headline text-xs font-bold text-on-surface-variant">Cleared</p>
              <p className="mt-1 font-headline text-3xl font-extrabold text-secondary">{completedRooms}</p>
            </div>
            <div>
              <p className="font-headline text-xs font-bold text-on-surface-variant">In Progress</p>
              <p className="mt-1 font-headline text-3xl font-extrabold text-primary">{inProgressRooms}</p>
            </div>
            <div>
              <p className="font-headline text-xs font-bold text-on-surface-variant">Mapped Courses</p>
              <p className="mt-1 font-headline text-3xl font-extrabold text-on-background">{allRooms.length}</p>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}

export default RoadmapPage
