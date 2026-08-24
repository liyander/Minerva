import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  getCareerPathsData,
  hydrateCareerPathsData,
} from '../data/careerPathsData'
import { getCoursesData, hydrateCoursesData } from '../data/coursesData'
import { apiFetch } from '../services/api'

function normalizeDifficulty(value) {
  return String(value || 'Unknown').trim()
}

function getRoomTone(room, index) {
  const difficulty = normalizeDifficulty(room.difficulty || room.level).toLowerCase()
  if (/hard|critical|advanced/.test(difficulty)) {
    return {
      border: 'border-primary',
      badge: 'bg-primary-container text-on-primary-container',
      text: 'text-primary',
      icon: 'warning',
    }
  }

  if (/medium|intermediate/.test(difficulty)) {
    return {
      border: 'border-secondary',
      badge: 'bg-secondary-container text-on-secondary-container',
      text: 'text-secondary',
      icon: 'lock_open',
    }
  }

  return index % 2 === 0
    ? {
        border: 'border-tertiary',
        badge: 'bg-tertiary-container text-on-tertiary-container',
        text: 'text-tertiary',
        icon: 'play_circle',
      }
    : {
        border: 'border-secondary',
        badge: 'bg-secondary-container text-on-secondary-container',
        text: 'text-secondary',
        icon: 'play_circle',
      }
}

function LearningPathsPage({ allowFeaturedPath = true }) {
  const [careerPaths, setCareerPaths] = useState([])
  const [rooms, setRooms] = useState([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    const loadPaths = async () => {
      setIsLoading(true)
      try {
        // Always fetch fresh from backend
        console.log('🌐 Fetching career paths from backend...')
        const [pathsResponse, roomsResponse] = await Promise.all([
          apiFetch('/career-paths'),
          apiFetch('/rooms'),
        ])
        const response = pathsResponse
        console.log('✅ Backend response:', response)
        
        if (!cancelled) {
          const paths = Array.isArray(pathsResponse) ? pathsResponse : []
          const fetchedRooms = Array.isArray(roomsResponse) ? roomsResponse : []
          console.log('📊 Setting career paths. Count:', paths.length)
          
          // Hydrate localStorage with backend data
          hydrateCareerPathsData(paths)
          hydrateCoursesData(fetchedRooms)
          
          // Directly set state with fresh data
          setCareerPaths(paths)
          setRooms(fetchedRooms)
          console.log('✅ Career paths loaded successfully')
        }
      } catch (error) {
        console.error('❌ Failed to load career paths:', error)
        if (!cancelled) {
          // Fallback to localStorage or defaults
          const fallback = getCareerPathsData()
          console.log('⚠️ Using fallback data. Count:', fallback.length)
          setCareerPaths(fallback)
          setRooms(getCoursesData())
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void loadPaths()

    return () => {
      cancelled = true
    }
  }, [])

  const featuredPath = careerPaths.find((p) => p.id === 'full-stack-developer')
  const otherPaths = careerPaths.filter((p) => p.id !== 'full-stack-developer')
  const roomsById = new Map(rooms.map((room) => [room.id, room]))
  const linkedCurriculumRooms = careerPaths.flatMap((path) =>
    (path.modules || []).flatMap((module) =>
      (module.rooms || [])
        .map((roomId) => {
          const room = roomsById.get(roomId)
          if (!room) return null
          return {
            ...room,
            modulePhase: module.phase,
            moduleTitle: module.title,
            pathTitle: path.title,
          }
        })
        .filter(Boolean),
    ),
  )
  const curriculumRooms =
    linkedCurriculumRooms.length > 0
      ? linkedCurriculumRooms
      : rooms.map((room) => ({
          ...room,
          modulePhase: 'Catalog',
          moduleTitle: 'Skill Catalog',
          pathTitle: 'Unassigned',
        }))
  const emptyModulesMessage = isLoading
    ? 'Loading curriculum modules...'
    : 'No skills available for curriculum modules.'

  return (
    <>
      <main className="pt-20">
        <section className="relative flex items-center px-6 sm:px-10 lg:px-12 py-14 overflow-hidden bg-secondary-container">
          <div
            className="absolute right-0 top-0 w-1/2 h-full opacity-10 mix-blend-multiply pointer-events-none"
            style={{
              backgroundImage:
                "url('https://lh3.googleusercontent.com/aida-public/AB6AXuCWmjUpfkTNtilFXa2k7cgdBo7c6sx_SAmiMPOckpdSkz37z4-FnDARalx2_czUQ43AvBCpuZegegmXlqnxCQckWBCn7ofcIqyQc_ap0HwBJocDAS8ze8SMOfmxL9iauJpjlmKptw0dk1NAZ72bo0qjV9MJx3WsZVRCKEEgZoy6z9TUVFhNoSr7fyCWtxyS30LFLCNLZVL86wGrH99vOFjgwY_b1bvSUtyCmzqWL3Y-MWY-E_fLQRP51_bgCrq9oyiN5csF88Dd4jo')",
            }}
          ></div>
          <div className="relative z-10 max-w-2xl">
            <span className="font-headline text-on-secondary-container/70 font-bold text-xs mb-4 block">
              Guided curricula
            </span>
            <h1 className="font-headline text-4xl sm:text-5xl font-extrabold text-on-secondary-container mb-5 leading-tight">
              Learn one path
              <br />
              at a time
            </h1>
            <p className="text-on-secondary-container/80 max-w-md text-lg leading-relaxed mb-8 font-body">
              Structured, self-paced curricula that take you from fundamentals to job-ready, with
              every module and course laid out in order.
            </p>
            <div className="flex gap-4">
              <a
                className="rounded-full bg-primary text-on-primary px-8 py-3 font-headline text-sm font-bold hover:opacity-90 transition-opacity"
                href="#paths"
              >
                Browse paths
              </a>
              <a
                className="rounded-full bg-surface-container-lowest text-on-surface px-8 py-3 font-headline text-sm font-bold hover:opacity-90 transition-opacity"
                href="#modules"
              >
                See modules
              </a>
            </div>
          </div>
        </section>

        <div className="sticky top-[72px] z-30 glass-nav px-6 sm:px-12 py-3 flex gap-8 font-headline text-sm font-bold">
          <a className="text-primary border-b-2 border-primary pb-1" href="#roadmap">
            Roadmap
          </a>
          <a className="text-neutral-500 hover:text-on-surface transition-colors" href="#paths">
            Paths
          </a>
          <a className="text-neutral-500 hover:text-on-surface transition-colors" href="#modules">
            Modules
          </a>
        </div>

        <section className="px-6 sm:px-10 lg:px-12 py-14" id="paths">
          <div className="flex justify-between items-end mb-12">
            <div>
              <h2 className="font-headline text-3xl font-bold tracking-tight mb-2">
                Learning paths
              </h2>
              <p className="text-on-surface-variant font-headline text-xs">
                Choose the track that matches your goal
              </p>
            </div>
            <div className="h-[2px] flex-1 mx-12 bg-outline-variant opacity-20"></div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {featuredPath && (allowFeaturedPath ? (
              <Link
                className="rounded-2xl bg-surface-container-lowest p-8 flex flex-col h-[400px] relative group hover:bg-white transition-all duration-300"
                to={`/learn/path/${featuredPath.slug}`}
              >
                <div className="absolute top-0 right-0 p-4 font-headline text-primary-container font-extrabold text-4xl opacity-10">
                  01
                </div>
                <span
                  className="material-symbols-outlined text-primary mb-6"
                  style={{ fontSize: '40px', fontVariationSettings: "'FILL' 1" }}
                >
                  {featuredPath.icon || 'security'}
                </span>
                <h3 className="font-headline text-xl font-bold mb-4">{featuredPath.title}</h3>
                <p className="text-sm text-on-surface-variant flex-1 leading-relaxed">
                  {featuredPath.description}
                </p>
                <div className="mt-8 flex flex-col gap-3">
                  <div className="flex justify-between text-xs font-headline font-bold text-neutral-400">
                    <span>Mastery</span>
                    <span>{featuredPath.mastery}%</span>
                  </div>
                  <div className="rounded-xl w-full h-1 bg-surface-container">
                    <div className="h-full bg-primary" style={{ width: `${featuredPath.mastery}%` }}></div>
                  </div>
                </div>
              </Link>
            ) : (
              <div className="rounded-2xl bg-surface-container-lowest p-8 flex flex-col h-[400px] relative opacity-50 grayscale cursor-not-allowed">
                <div className="absolute top-0 right-0 p-4 font-headline text-primary-container font-extrabold text-4xl opacity-10">
                  01
                </div>
                <span
                  className="material-symbols-outlined text-primary mb-6"
                  style={{ fontSize: '40px', fontVariationSettings: "'FILL' 1" }}
                >
                  {featuredPath.icon || 'security'}
                </span>
                <h3 className="font-headline text-xl font-bold mb-4">{featuredPath.title}</h3>
                <p className="text-sm text-on-surface-variant flex-1 leading-relaxed">
                  {featuredPath.description}
                </p>
                <div className="mt-8 text-xs font-headline font-bold text-outline">
                  Access Disabled By Admin
                </div>
              </div>
            ))}

            {otherPaths.map((path, index) => (
              <Link
                key={path.id}
                className="rounded-2xl bg-surface-container-lowest p-8 flex flex-col h-[400px] relative group hover:bg-white transition-all duration-300"
                to={`/learn/path/${path.slug || path.id}`}
              >
                <div className="absolute top-0 right-0 p-4 font-headline text-secondary-container font-extrabold text-4xl opacity-10">
                  {String(index + 2).padStart(2, '0')}
                </div>
                <span
                  className="material-symbols-outlined text-secondary mb-6"
                  style={{ fontSize: '40px', fontVariationSettings: "'FILL' 1" }}
                >
                  {path.icon || 'shield'}
                </span>
                <h3 className="font-headline text-xl font-bold mb-4">{path.title}</h3>
                <p className="text-sm text-on-surface-variant flex-1 leading-relaxed">
                  {path.description}
                </p>
                <div className="mt-8 flex flex-col gap-3">
                  <div className="flex justify-between text-xs font-headline font-bold text-neutral-400">
                    <span>Mastery</span>
                    <span>{path.mastery}%</span>
                  </div>
                  <div className="rounded-xl w-full h-1 bg-surface-container">
                    <div className="h-full bg-secondary" style={{ width: `${path.mastery}%` }}></div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section className="rounded-xl px-12 py-20 bg-surface-container-low" id="modules">
          <div className="mb-12">
            <h2 className="font-headline text-3xl font-bold tracking-tight mb-2">
              Curriculum modules
            </h2>
            <p className="text-on-surface-variant font-headline text-xs">
              Surgical skill blocks for deep technical immersion
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {curriculumRooms.length ? (
              curriculumRooms.slice(0, 8).map((room, index) => {
                const tone = getRoomTone(room, index)
                const isFeatured = index === 0
                const roomSlug = room.slug || room.id

                return (
                  <Link
                    className={`rounded-2xl bg-surface-container-lowest p-6 flex flex-col border-l-4 ${tone.border} hover:bg-white transition-all ${
                      isFeatured ? 'md:col-span-2' : ''
                    }`}
                    key={`${room.id}-${index}`}
                    to={`/learn/course/${roomSlug}`}
                  >
                    <div className="flex justify-between items-start mb-8">
                      <span className={`font-headline text-xs font-bold px-3 py-1 ${tone.badge}`}>
                        {room.categoryTag || room.category || room.moduleTitle || 'Skill'}
                      </span>
                      <span className={`material-symbols-outlined ${isFeatured ? 'text-neutral-300' : tone.text}`}>
                        {isFeatured ? 'star' : tone.icon}
                      </span>
                    </div>
                    <h4 className={`font-headline font-bold mb-2 ${isFeatured ? 'text-lg' : 'text-base'}`}>
                      {room.title}
                    </h4>
                    <p className={`text-xs text-on-surface-variant leading-relaxed ${isFeatured ? 'mb-6' : 'mb-5'}`}>
                      {room.description || 'No skill description configured yet.'}
                    </p>
                    <div className="mt-auto flex items-end justify-between gap-4">
                      <div className="flex flex-wrap gap-4">
                        <div className="text-xs font-headline text-neutral-400">
                          <p>Duration</p>
                          <p className="text-on-surface">{room.estimateTime || 'TBD'}</p>
                        </div>
                        <div className="text-xs font-headline text-neutral-400">
                          <p>Difficulty</p>
                          <p className={tone.text}>{normalizeDifficulty(room.difficulty || room.level).toUpperCase()}</p>
                        </div>
                        {!isFeatured ? (
                          <div className="text-xs font-headline text-neutral-400">
                            <p>XP</p>
                            <p className="text-on-surface">{room.xp || 'N/A'}</p>
                          </div>
                        ) : null}
                      </div>
                      <span className={`inline-flex h-10 w-10 items-center justify-center ${isFeatured ? 'bg-neutral-900 text-white' : tone.text}`}>
                        <span className="material-symbols-outlined text-sm">arrow_forward</span>
                      </span>
                    </div>
                    <div className="mt-5 border-t border-outline-variant/20 pt-3">
                      <p className="text-xs font-headline text-neutral-400 truncate">
                        {room.pathTitle} / {room.modulePhase || room.moduleTitle}
                      </p>
                    </div>
                  </Link>
                )
              })
            ) : (
              <div className="rounded-2xl md:col-span-4 bg-surface-container-lowest border border-dashed border-outline-variant/40 p-10 text-center">
                <p className="font-headline text-xs text-on-surface-variant">
                  {emptyModulesMessage}
                </p>
              </div>
            )}
          </div>
        </section>
      </main>

      <footer className="w-full py-6 mt-auto bg-neutral-50 border-t border-neutral-200/50 flex flex-col md:flex-row justify-between items-center px-12">
        <div className="font-headline text-xs text-neutral-400 mb-4 md:mb-0">
          © 2026 Minerva Academy
        </div>
        <div className="flex gap-8">
          <a className="font-headline text-xs text-neutral-400 hover:text-primary opacity-80 hover:opacity-100 transition-all" href="#">Privacy</a>
          <a className="font-headline text-xs text-neutral-400 hover:text-primary opacity-80 hover:opacity-100 transition-all" href="#">Terms</a>
          <a className="font-headline text-xs text-neutral-400 hover:text-primary opacity-80 hover:opacity-100 transition-all" href="#">Accessibility</a>
        </div>
      </footer>
    </>
  )
}

export default LearningPathsPage
