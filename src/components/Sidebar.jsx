import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { getAuthSession, hasRole, roleLabel, ROLES } from '../auth'
import { apiFetch } from '../services/api'

function initialsFor(name) {
  return (name || 'S')
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('')
}

function Sidebar({ config, isSidebarOpen, onClose }) {
  const authSession = getAuthSession()
  const [username, setUsername] = useState(authSession?.username || 'student')
  const [activeSessions, setActiveSessions] = useState([])

  useEffect(() => {
    let cancelled = false

    const loadProfile = async () => {
      try {
        const response = await apiFetch('/users/me')
        if (!cancelled) {
          setUsername(response?.username || authSession?.username || 'student')
        }
      } catch {
        if (!cancelled) {
          setUsername(authSession?.username || 'student')
        }
      }
    }

    void loadProfile()

    return () => {
      cancelled = true
    }
  }, [authSession?.username])

  useEffect(() => {
    let cancelled = false

    const loadSessions = async () => {
      try {
        const response = await apiFetch('/rooms/docker-machines/me')
        if (!cancelled) {
          setActiveSessions(Array.isArray(response?.machines) ? response.machines : [])
        }
      } catch {
        if (!cancelled) {
          setActiveSessions([])
        }
      }
    }

    void loadSessions()
    const intervalId = window.setInterval(loadSessions, 15000)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [])

  const role = authSession?.role
  const isTrainer = hasRole({ role }, ROLES.TRAINER)

  const navItems = (isTrainer
        ? [
            { to: '/trainer', icon: 'space_dashboard', label: 'Workspace', end: true },
            { to: '/assessments', icon: 'quiz', label: 'Assessments' },
            { to: '/library', icon: 'video_library', label: 'Library' },
            config.routes.practiceLabs && { to: '/learn', icon: 'school', label: 'Courses' },
            { to: '/resources', icon: 'menu_book', label: 'Resources' },
            { to: '/notes', icon: 'edit_note', label: 'Notes' },
            { to: '/my-profile', icon: 'badge', label: 'My Profile' },
          ]
        : [
            config.routes.dashboard && { to: '/', icon: 'grid_view', label: 'Dashboard', end: true },
            config.routes.practiceLabs && { to: '/learn', icon: 'school', label: 'Courses' },
            config.routes.learningPaths && {
              to: '/learn/paths',
              icon: 'auto_stories',
              label: 'Learning Paths',
            },
            { to: '/assessments', icon: 'quiz', label: 'Assessments' },
            { to: '/library', icon: 'video_library', label: 'Library' },
            config.routes.upcomingCtf && { to: '/events', icon: 'event_upcoming', label: 'Events' },
            { to: '/resources', icon: 'menu_book', label: 'Resources' },
            { to: '/notes', icon: 'edit_note', label: 'Notes' },
            { to: '/projects', icon: 'science', label: 'Projects' },
            { to: '/roadmap', icon: 'route', label: 'Roadmap' },
            { to: '/leaderboard', icon: 'leaderboard', label: 'Leaderboard' },
            { to: '/jobs', icon: 'work', label: 'Opportunities' },
            { to: '/career-prep', icon: 'record_voice_over', label: 'Career Prep' },
            { to: '/my-profile', icon: 'badge', label: 'My Profile' },
            config.routes.profile && { to: '/profile', icon: 'account_circle', label: 'Profile' },
            { to: '/verify-certificate', icon: 'verified', label: 'Certificates' },
          ]
  ).filter(Boolean)

  const navLinkClass = ({ isActive }) =>
    `flex items-center gap-3 rounded-xl px-3 py-2.5 font-headline text-sm font-semibold transition-colors duration-150 min-w-0 [&_.material-symbols-outlined]:shrink-0 [&_.material-symbols-outlined]:text-[20px] [&_.nav-label]:truncate ${
      isActive
        ? 'bg-primary-container text-on-primary-container'
        : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
    }`

  const mobileLinkClass = ({ isActive }) =>
    `min-w-16 flex flex-col items-center gap-1 rounded-xl px-2 py-1.5 ${
      isActive ? 'text-primary' : 'text-on-surface-variant'
    }`

  return (
    <>
      <div
        className={`fixed inset-0 bg-black/40 z-30 md:hidden ${isSidebarOpen ? 'block' : 'hidden'}`}
        onClick={onClose}
      ></div>

      <aside
        className={`h-dvh max-h-dvh w-[min(20rem,calc(100vw-1rem))] md:w-64 fixed left-0 top-0 bg-surface-container-low md:bg-background flex flex-col p-3 sm:p-4 z-40 transform transition-transform duration-300 overflow-hidden ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <button
          className="md:hidden absolute top-5 right-5 text-on-surface-variant hover:text-on-surface transition-colors"
          onClick={onClose}
          type="button"
          aria-label="Close sidebar"
        >
          <span className="material-symbols-outlined">close</span>
        </button>

        <div className="rounded-2xl bg-secondary-container px-4 py-4 shrink-0">
          <p className="font-headline text-lg font-extrabold text-on-secondary-container">Minerva</p>
          <p className="font-body text-xs text-on-secondary-container/70">Learn at your own pace</p>

          <div className="mt-4 flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-on-primary font-headline font-bold text-sm shrink-0">
              {initialsFor(username)}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="font-body text-[11px] text-on-secondary-container/70">
                {roleLabel(authSession?.role)}
              </span>
              <span
                className="font-headline text-sm font-bold text-on-secondary-container truncate max-w-[140px]"
                title={username}
              >
                {username}
              </span>
            </div>
          </div>
        </div>

        <nav className="flex-1 min-h-0 overflow-y-auto overscroll-contain mt-3 rounded-2xl bg-surface-container-lowest p-2 flex flex-col gap-0.5">
          {navItems.map((item) => (
            <NavLink
              className={navLinkClass}
              end={item.end}
              key={item.to}
              onClick={onClose}
              to={item.to}
            >
              <span className="material-symbols-outlined">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </NavLink>
          ))}

          {activeSessions.length ? (
            <div className="mt-3 rounded-xl bg-mint p-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-on-mint text-base">dns</span>
                <p className="font-headline text-xs font-bold text-on-mint">Active lab sessions</p>
              </div>
              <div className="mt-2 space-y-2">
                {activeSessions.slice(0, 3).map((session) => (
                  <div
                    className="rounded-lg bg-surface-container-lowest p-2"
                    key={session.containerName || session.roomId}
                  >
                    <NavLink
                      className="block font-headline text-xs font-semibold text-on-surface hover:text-primary truncate"
                      onClick={onClose}
                      title={session.title}
                      to={`/learn/course/${session.slug || session.roomId}`}
                    >
                      {session.title || session.roomId}
                    </NavLink>
                    {session.access?.url ? (
                      <a
                        className="mt-1 flex items-center gap-1 text-[11px] text-secondary hover:text-on-surface min-w-0"
                        href={session.access.url}
                        rel="noreferrer"
                        target="_blank"
                        title={session.access.url}
                      >
                        <span className="material-symbols-outlined text-xs">open_in_new</span>
                        <span className="truncate">Open workspace</span>
                      </a>
                    ) : null}
                  </div>
                ))}
                {activeSessions.length > 3 ? (
                  <p className="font-body text-[11px] text-on-mint">
                    +{activeSessions.length - 3} more running
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
        </nav>

        {config.features.newMissionButton ? (
          <div className="mt-3 shrink-0">
            <NavLink
              className="flex items-center justify-center gap-2 rounded-full bg-primary px-4 py-3 font-headline text-sm font-bold text-on-primary hover:opacity-90 transition-opacity"
              onClick={onClose}
              to={isTrainer ? '/trainer/assessments/new' : '/learn'}
            >
              <span className="material-symbols-outlined text-[20px]">add</span>
              {isTrainer ? 'New questionnaire' : 'Browse courses'}
            </NavLink>
          </div>
        ) : null}

        <footer className="shrink-0 pt-2">
          <a
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface font-headline text-sm font-semibold min-w-0"
            href="/support"
          >
            <span className="material-symbols-outlined text-[20px] shrink-0">help</span>
            <span className="truncate">Help &amp; Support</span>
          </a>
        </footer>
      </aside>

      <nav className="md:hidden fixed bottom-0 left-0 right-0 glass-nav border-t border-outline-variant/60 flex items-center gap-2 overflow-x-auto px-3 py-2 z-50">
        {navItems.map((item) => (
          <NavLink
            className={mobileLinkClass}
            end={item.end}
            key={item.to}
            onClick={onClose}
            to={item.to}
          >
            <span className="material-symbols-outlined">{item.icon}</span>
            <span className="font-headline text-xs font-bold">{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </>
  )
}

export default Sidebar
