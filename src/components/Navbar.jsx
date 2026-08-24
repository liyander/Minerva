import { useState, useRef, useEffect } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { getAuthSession, hasRole, ROLES } from '../auth'
import { apiFetch } from '../services/api'
import GlobalSearch from './GlobalSearch'

const NOTIFICATIONS_UPDATED_EVENT = 'incognitrix:notifications-updated'
const NOTIFICATIONS_UPDATED_KEY = 'incognitrix_notifications_updated_at'

function Navbar({ config, isSidebarOpen, onLogout, onToggleSidebar }) {
  const navigate = useNavigate()
  const location = useLocation()
  const session = getAuthSession()
  const isTrainer = hasRole(session, ROLES.TRAINER)
  const [notifications, setNotifications] = useState([])
  const [showNotifications, setShowNotifications] = useState(false)
  const notificationsRef = useRef(null)
  const quickCreateRef = useRef(null)
  const profileRef = useRef(null)
  const [showQuickCreate, setShowQuickCreate] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const [streak, setStreak] = useState({ currentStreak: 0 })
  const [confirmLogoutOpen, setConfirmLogoutOpen] = useState(false)

  const trainerPageTitle = (() => {
    if (location.pathname.startsWith('/trainer/question-banks')) return 'Question banks'
    if (location.pathname.includes('/grading')) return 'Grading queue'
    if (location.pathname.startsWith('/trainer/assignments')) return 'Assignments'
    if (location.pathname.startsWith('/trainer/assessments')) return 'Assessments'
    if (location.pathname === '/learn') return 'My courses'
    if (location.pathname === '/community') return 'Classrooms'
    if (location.pathname === '/my-profile') return 'Professional profile'
    if (location.pathname === '/settings') return 'Settings'
    return 'Trainer dashboard'
  })()
  const [showLanguageMenu, setShowLanguageMenu] = useState(false)
  const languageRef = useRef(null)

  const navItemClass = ({ isActive }) =>
    `transition-colors duration-200 ${
      isActive
        ? 'text-primary border-b-2 border-primary pb-1'
        : 'text-on-surface-variant hover:text-on-surface'
    }`

  // Fetch notifications on mount and set up polling
  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        const data = await apiFetch('/notifications')
        setNotifications(Array.isArray(data) ? data : [])
      } catch (error) {
        if (/invalid or expired token|unauthorized/i.test(error?.message || '')) {
          return
        }
        console.error('Failed to fetch notifications:', error)
      }
    }

    const syncNotifications = () => {
      void fetchNotifications()
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

    // Keep fallback polling for cross-device updates.
    const interval = window.setInterval(syncNotifications, 5000)
    window.addEventListener(NOTIFICATIONS_UPDATED_EVENT, handleNotificationsUpdated)
    window.addEventListener('storage', handleStorage)
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      window.clearInterval(interval)
      window.removeEventListener(NOTIFICATIONS_UPDATED_EVENT, handleNotificationsUpdated)
      window.removeEventListener('storage', handleStorage)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    const fetchStreak = async () => {
      try {
        const data = await apiFetch('/rooms/streaks/me')
        if (!cancelled) {
          setStreak(data || { currentStreak: 0 })
        }
      } catch {
        if (!cancelled) {
          setStreak({ currentStreak: 0 })
        }
      }
    }

    void fetchStreak()
    const interval = window.setInterval(fetchStreak, 30000)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [])

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (notificationsRef.current && !notificationsRef.current.contains(e.target)) {
        setShowNotifications(false)
      }
      if (languageRef.current && !languageRef.current.contains(e.target)) {
        setShowLanguageMenu(false)
      }
      if (quickCreateRef.current && !quickCreateRef.current.contains(e.target)) {
        setShowQuickCreate(false)
      }
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setShowProfile(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])


  const handleLanguageChange = (langCode) => {
    const select = document.querySelector('.goog-te-combo')
    if (select) {
      select.value = langCode
      select.dispatchEvent(new Event('change'))
    }
    setShowLanguageMenu(false)
  }

  const languages = [
    { code: 'en', name: 'English' },
    { code: 'hi', name: 'Hindi (हिन्दी)' },
    { code: 'bn', name: 'Bengali (বাংলা)' },
    { code: 'te', name: 'Telugu (తెలుగు)' },
    { code: 'mr', name: 'Marathi (मराठी)' },
    { code: 'ta', name: 'Tamil (தமிழ்)' },
    { code: 'gu', name: 'Gujarati (ગુજરાતી)' },
    { code: 'kn', name: 'Kannada (ಕನ್ನಡ)' },
    { code: 'ml', name: 'Malayalam (മലയാളം)' },
    { code: 'pa', name: 'Punjabi (ਪੰਜਾਬੀ)' },
    { code: 'or', name: 'Odia (ଓଡ଼ିଆ)' },
    { code: 'as', name: 'Assamese (অসমীয়া)' },
    { code: 'ur', name: 'Urdu (اردو)' }
  ]

  const handleSearch = (value) => {
    setSearchQuery(value)
    
    if (!value.trim()) {
      setSearchResults([])
      setShowResults(false)
      return
    }

    const query = value.trim().toLowerCase()
    const careerPaths = getCareerPathsData()
    const rooms = getCoursesData()

    const results = []

    // Search in career paths
    careerPaths.forEach((path) => {
      if (searchableValue(path.title).includes(query) || searchableValue(path.description).includes(query)) {
        results.push({
          type: 'path',
          id: path.id,
          title: path.title,
          description: path.description,
          icon: 'school',
        })
      }

      // Search in modules
      if (path.modules) {
        path.modules.forEach((module) => {
          if (searchableValue(module.title).includes(query) || searchableValue(module.description).includes(query)) {
            results.push({
              type: 'module',
              id: module.id,
              pathId: path.id,
              title: module.title,
              description: module.description,
              icon: 'layers',
              pathTitle: path.title,
            })
          }
        })
      }
    })

    // Search in rooms
    rooms.forEach((room) => {
      if (searchableValue(room.title).includes(query) || searchableValue(room.description).includes(query)) {
        results.push({
          type: 'room',
          id: room.id,
          slug: room.slug,
          title: room.title,
          description: room.description,
          icon: 'flag',
        })
      }
    })

    setSearchResults(results.slice(0, 8))
    setShowResults(true)
  }

  const handleSelectResult = (result) => {
    if (result.type === 'path') {
      navigate(`/learn/path/${result.id}`)
    } else if (result.type === 'module') {
      navigate(`/learn/path/${result.pathId}/module/${result.id}`)
    } else if (result.type === 'room') {
      navigate(`/learn/lesson/${result.slug}`)
    }
    setSearchQuery('')
    setShowResults(false)
  }


  return (
    <>
      <header
        className={`fixed top-0 right-0 left-0 ${isSidebarOpen ? 'md:left-64' : 'md:left-0'} z-50 glass-nav flex items-center justify-between gap-3 px-5 md:px-8 py-4 transition-all duration-300 overflow-visible`}
      >
      <div className="flex min-w-0 items-center gap-3 xl:gap-6">
        <button
          className="rounded-xl inline-flex h-11 w-11 shrink-0 items-center justify-center border border-outline-variant bg-surface-container-low text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors"
          onClick={onToggleSidebar}
          type="button"
          aria-label="Toggle sidebar"
        >
          <span className="material-symbols-outlined">
            {isSidebarOpen ? 'menu_open' : 'menu'}
          </span>
        </button>
        <div className="flex min-w-0 flex-col">
          <h1 className="truncate text-xl md:text-2xl font-headline font-extrabold tracking-tight text-on-surface leading-none">
            {isTrainer ? trainerPageTitle : 'Minerva'}
          </h1>
          <span className="hidden sm:block truncate font-body text-[11px] text-on-surface-variant mt-1">
            {isTrainer ? 'Trainer workspace' : 'Online Learning Academy'}
          </span>
        </div>
        <nav className="hidden xl:flex items-center gap-6 font-headline tracking-tight text-[15px] whitespace-nowrap">
          {isTrainer ? (
            <>
              <NavLink className={navItemClass} end to="/trainer">Dashboard</NavLink>
              <NavLink className={navItemClass} to="/learn">My courses</NavLink>
              <NavLink className={navItemClass} to="/trainer?tab=assessments">Assessments</NavLink>
              <NavLink className={navItemClass} to="/trainer?tab=assignments">Assignments</NavLink>
            </>
          ) : config.routes.learningPaths ? (
            <NavLink className={navItemClass} to="/learn/paths">
              Learning Paths
            </NavLink>
          ) : null}
          {!isTrainer && config.routes.practiceLabs ? (
            <NavLink className={navItemClass} to="/learn">
              Courses
            </NavLink>
          ) : null}
          {!isTrainer ? <NavLink className={navItemClass} to="/resources">
            Resources
          </NavLink> : null}
          {!isTrainer ? <NavLink className={navItemClass} to="/roadmap">
            Roadmap
          </NavLink> : null}
          {!isTrainer ? <NavLink className={navItemClass} to="/projects">
            Projects
          </NavLink> : null}
        </nav>
      </div>
      <div className="flex shrink-0 items-center gap-3 xl:gap-4">
        {config.features.navbarSearch ? (
          <GlobalSearch className="hidden 2xl:block" />
        ) : null}
        {!isTrainer ? <div className="hidden lg:flex items-center gap-2 px-4 py-2 bg-butter rounded-full whitespace-nowrap">
          <span className="material-symbols-outlined text-on-butter text-base">local_fire_department</span>
          <span className="font-headline text-xs font-bold text-on-butter">
            {Number(streak.currentStreak || 0)}-day streak
          </span>
        </div> : null}
        {isTrainer ? (
          <div className="relative" ref={quickCreateRef}>
            <button
              className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 font-headline text-xs font-bold text-on-primary hover:opacity-90"
              onClick={() => setShowQuickCreate((open) => !open)}
              type="button"
            >
              <span className="material-symbols-outlined text-base">add</span>
              <span className="hidden sm:inline">Create</span>
            </button>
            {showQuickCreate ? (
              <div className="absolute right-0 top-full mt-3 w-64 overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest p-2 shadow-lift">
                {[
                  ['/trainer/assessments/new', 'quiz', 'Assessment'],
                  ['/trainer/assignments/new', 'assignment_add', 'Assignment'],
                  ['/trainer/question-banks', 'database', 'Question bank'],
                  ['/trainer?tab=library&upload=1', 'upload_file', 'Library material'],
                  ['/community', 'meeting_room', 'Classroom'],
                ].map(([to, icon, label]) => (
                  <button
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left font-headline text-sm font-bold text-on-surface hover:bg-surface-container-high"
                    key={label}
                    onClick={() => { setShowQuickCreate(false); navigate(to) }}
                    type="button"
                  >
                    <span className="material-symbols-outlined text-primary">{icon}</span>{label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="flex items-center gap-3 text-on-surface-variant">
          {config.features.navbarNotifications ? (
            <div ref={notificationsRef} className="relative">
              <button
                type="button"
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative hover:text-on-surface transition-colors"
              >
                <span className="material-symbols-outlined">notifications</span>
                {notifications.length > 0 && (
                  <span className="absolute top-0 right-0 w-2 h-2 bg-error rounded-full animate-pulse"></span>
                )}
              </button>

              {/* Notifications Dropdown */}
              {showNotifications && (
                <div className="absolute top-full mt-3 right-0 w-96 bg-surface-container-lowest border border-primary/20 rounded-xl shadow-2xl z-50 overflow-hidden backdrop-blur-sm">
                  <div className="rounded-xl px-4 py-3 border-b border-primary/10 bg-primary/5">
                    <p className="text-xs font-headline font-bold text-primary">
                      Notifications ({notifications.length})
                    </p>
                  </div>
                  {notifications.length === 0 ? (
                    <div className="p-6 text-center">
                      <span className="material-symbols-outlined text-4xl text-neutral-300 block mb-3">
                        notifications_none
                      </span>
                      <p className="text-sm text-on-surface-variant">No notifications</p>
                    </div>
                  ) : (
                    <div className="max-h-96 overflow-y-auto divide-y divide-primary/10">
                      {notifications.map((notification) => (
                        <div key={notification.id} className="rounded-xl px-4 py-3.5 hover:bg-primary/8 transition-colors">
                          <div className="flex items-start gap-3">
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <h4 className="font-headline text-sm font-bold text-on-background">
                                  {notification.title}
                                </h4>
                                <span
                                  className={`text-[11px] font-headline font-bold px-2 py-0.5 rounded ${
                                    notification.type === 'info'
                                      ? 'bg-primary/10 text-primary'
                                      : notification.type === 'success'
                                        ? 'bg-secondary/10 text-secondary'
                                        : notification.type === 'warning'
                                          ? 'bg-yellow-500/10 text-yellow-600'
                                          : 'bg-error/10 text-error'
                                  }`}
                                >
                                  {notification.type}
                                </span>
                              </div>
                              <p className="text-xs text-on-surface-variant leading-relaxed">
                                {notification.message}
                              </p>
                              <p className="text-xs text-on-surface-variant/60 mt-2">
                                {new Date(notification.created_at).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : null}
          <div ref={languageRef} className="relative hidden sm:block">
            <button
              type="button"
              onClick={() => setShowLanguageMenu(!showLanguageMenu)}
              className="relative hover:text-on-surface transition-colors inline-flex items-center justify-center mt-1"
              title="Translate"
            >
              <span className="material-symbols-outlined">language</span>
            </button>

            {showLanguageMenu && (
              <div className="absolute top-full mt-3 right-0 w-40 bg-surface-container-lowest border border-primary/20 rounded-xl shadow-2xl z-50 overflow-hidden backdrop-blur-sm">
                <div className="rounded-xl px-3 py-2 border-b border-primary/10 bg-primary/5">
                  <p className="text-[11px] font-headline font-bold text-primary uppercase tracking-wider">Language</p>
                </div>
                <div className="max-h-64 overflow-y-auto py-1 divide-y divide-primary/5">
                  {languages.map((lang) => (
                    <button
                      key={lang.code}
                      onClick={() => handleLanguageChange(lang.code)}
                      className="w-full text-left px-4 py-2 hover:bg-primary/8 transition-colors text-xs font-headline font-semibold text-on-surface-variant hover:text-primary"
                      type="button"
                    >
                      {lang.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          {config.features.navbarSettings ? (
          {!isTrainer && config.features.navbarSettings ? (
            <button
              className="inline-flex items-center justify-center hover:text-on-surface transition-colors"
              onClick={() => navigate('/settings')}
              title="Open settings"
              type="button"
            >
              <span className="material-symbols-outlined">settings</span>
            </button>
          ) : null}
        </div>
        {isTrainer ? (
          <div className="relative" ref={profileRef}>
            <button className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-secondary-container text-on-secondary-container" onClick={() => setShowProfile((open) => !open)} title="Trainer account" type="button">
              <span className="material-symbols-outlined">account_circle</span>
            </button>
            {showProfile ? (
              <div className="absolute right-0 top-full mt-3 w-64 overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest p-2 shadow-lift">
                <div className="border-b border-outline-variant px-3 py-3"><p className="truncate font-headline text-sm font-extrabold text-on-surface">{session?.username || 'Trainer'}</p><p className="font-body text-xs text-on-surface-variant">Trainer account</p></div>
                {[
                  ['/my-profile', 'badge', 'Professional profile'],
                  ['/settings', 'settings', 'Account settings'],
                  ['/settings', 'password', 'Change password'],
                ].map(([to, icon, label]) => <button className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left font-headline text-sm font-bold text-on-surface hover:bg-surface-container-high" key={label} onClick={() => { setShowProfile(false); navigate(to) }} type="button"><span className="material-symbols-outlined text-primary">{icon}</span>{label}</button>)}
                <button className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left font-headline text-sm font-bold text-error hover:bg-blush" onClick={() => { setShowProfile(false); setConfirmLogoutOpen(true) }} type="button"><span className="material-symbols-outlined">logout</span>Logout</button>
              </div>
            ) : null}
          </div>
        ) : (
          <button className="rounded-full hidden sm:inline-flex px-4 xl:px-5 py-2.5 border border-outline-variant bg-surface-container-lowest text-on-surface-variant font-headline text-xs font-bold hover:bg-surface-container-high hover:text-on-surface transition-colors" onClick={() => setConfirmLogoutOpen(true)} type="button">Logout</button>
        )}
      </div>
      </header>

      {confirmLogoutOpen ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <section className="w-full max-w-md rounded-3xl border border-outline-variant bg-surface-container-lowest shadow-lift overflow-hidden">
            <div className="p-6">
              <p className="font-headline text-xs font-bold text-primary">Account</p>
              <h2 className="mt-2 font-headline text-2xl font-extrabold text-on-background">
                Sign out of Minerva?
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-on-surface-variant">
                Any unsaved lesson answers, notes or workspace changes may be lost.
              </p>
              <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button
                  className="rounded-full bg-surface-container-high px-5 py-3 font-headline text-sm font-bold text-on-background hover:bg-surface-container-highest"
                  onClick={() => setConfirmLogoutOpen(false)}
                  type="button"
                >
                  Stay signed in
                </button>
                <button
                  className="rounded-xl bg-primary px-5 py-3 font-headline text-sm font-bold text-on-primary hover:bg-primary/90"
                  onClick={() => {
                    setConfirmLogoutOpen(false)
                    onLogout()
                  }}
                  type="button"
                >
                  Sign out
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </>
  )
}

export default Navbar
