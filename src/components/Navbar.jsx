import { useState, useRef, useEffect } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { apiFetch } from '../services/api'
import GlobalSearch from './GlobalSearch'

const NOTIFICATIONS_UPDATED_EVENT = 'incognitrix:notifications-updated'
const NOTIFICATIONS_UPDATED_KEY = 'incognitrix_notifications_updated_at'

function Navbar({ config, isSidebarOpen, onLogout, onToggleSidebar }) {
  const navigate = useNavigate()
  const [notifications, setNotifications] = useState([])
  const [showNotifications, setShowNotifications] = useState(false)
  const notificationsRef = useRef(null)
  const [streak, setStreak] = useState({ currentStreak: 0 })
  const [confirmLogoutOpen, setConfirmLogoutOpen] = useState(false)

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
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

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
            Minerva
          </h1>
          <span className="hidden sm:block truncate font-body text-[11px] text-on-surface-variant mt-1">
            Online Learning Academy
          </span>
        </div>
        <nav className="hidden xl:flex items-center gap-6 font-headline tracking-tight text-[15px] whitespace-nowrap">
          {config.routes.learningPaths ? (
            <NavLink className={navItemClass} to="/learn/paths">
              Learning Paths
            </NavLink>
          ) : null}
          {config.routes.practiceLabs ? (
            <NavLink className={navItemClass} to="/learn">
              Courses
            </NavLink>
          ) : null}
          <NavLink className={navItemClass} to="/resources">
            Resources
          </NavLink>
          <NavLink className={navItemClass} to="/roadmap">
            Roadmap
          </NavLink>
          <NavLink className={navItemClass} to="/projects">
            Projects
          </NavLink>
        </nav>
      </div>
      <div className="flex shrink-0 items-center gap-3 xl:gap-4">
        {config.features.navbarSearch ? (
          <GlobalSearch className="hidden 2xl:block" />
        ) : null}
        <div className="hidden lg:flex items-center gap-2 px-4 py-2 bg-butter rounded-full whitespace-nowrap">
          <span className="material-symbols-outlined text-on-butter text-base">local_fire_department</span>
          <span className="font-headline text-xs font-bold text-on-butter">
            {Number(streak.currentStreak || 0)}-day streak
          </span>
        </div>
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
          {config.features.navbarSettings ? (
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
        <button
          className="rounded-full hidden sm:inline-flex px-4 xl:px-5 py-2.5 border border-outline-variant bg-surface-container-lowest text-on-surface-variant font-headline text-xs font-bold hover:bg-surface-container-high hover:text-on-surface transition-colors"
          onClick={() => setConfirmLogoutOpen(true)}
          type="button"
        >
          Logout
        </button>
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
