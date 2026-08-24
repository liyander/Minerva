import { Link, useLocation } from 'react-router-dom'

function NotFoundPage({ variant = 'operator', config = null }) {
  const location = useLocation()
  const isAdmin = variant === 'admin'
  const isPublic = variant === 'public'

  const operatorLinks = [
    { label: 'Dashboard', to: '/', icon: 'grid_view', enabled: config?.routes?.dashboard !== false },
    { label: 'Learning Paths', to: '/learn/paths', icon: 'school', enabled: config?.routes?.learningPaths !== false },
    { label: 'Courses', to: '/learn', icon: 'menu_book', enabled: config?.routes?.practiceLabs !== false },
    { label: 'Leaderboard', to: '/leaderboard', icon: 'leaderboard', enabled: true },
  ].filter((item) => item.enabled)

  const adminLinks = [
    { label: 'Admin home', to: '/admin', icon: 'admin_panel_settings' },
    { label: 'Courses', to: '/admin/courses', icon: 'menu_book' },
    { label: 'Users', to: '/admin/registrations', icon: 'badge' },
    { label: 'Admin AI', to: '/admin/ai-control', icon: 'psychology' },
  ]

  const publicLinks = [
    { label: 'Login', to: '/login', icon: 'login' },
    { label: 'Register', to: '/register', icon: 'person_add' },
    { label: 'Verify Certificate', to: '/verify-certificate', icon: 'verified' },
  ]

  const links = isAdmin ? adminLinks : isPublic ? publicLinks : operatorLinks

  return (
    <main className="min-h-screen bg-surface text-on-background selection:bg-primary-container selection:text-on-primary-container">
      <section className="relative min-h-screen overflow-hidden px-6 py-10 md:px-12 lg:px-16 flex items-center">
        <div className="absolute inset-0 pointer-events-none opacity-[0.06]">
          <div className="h-full w-full bg-[linear-gradient(90deg,currentColor_1px,transparent_1px),linear-gradient(0deg,currentColor_1px,transparent_1px)] bg-[size:48px_48px]"></div>
        </div>
        <div className="relative z-10 mx-auto grid w-full max-w-6xl grid-cols-1 gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
          <div>
            <p className="font-headline text-xs font-bold text-primary">
              Page not found
            </p>
            <h1 className="mt-5 font-headline text-7xl font-extrabold leading-none tracking-tight md:text-8xl lg:text-9xl">
              404
            </h1>
            <div className="rounded-2xl mt-6 max-w-3xl shadow-soft bg-surface-container-lowest p-6 md:p-8">
              <h2 className="font-headline text-2xl font-extrabold tracking-tight md:text-4xl">
We couldn't find that page
              </h2>
              <p className="mt-4 text-base leading-relaxed text-on-surface-variant md:text-lg">
That address doesn't match any page on Minerva Academy. It may have moved, been turned
                off, or never existed.
              </p>
              <p className="mt-4 break-all font-mono text-xs text-on-surface-variant">
                Requested: {location.pathname}
              </p>
            </div>
          </div>

          <aside className="rounded-2xl bg-surface-container-lowest p-6 shadow-2xl md:p-8">
            <div className="flex items-center gap-3 border-b border-outline-variant/30 pb-5">
              <span className="material-symbols-outlined text-primary">
                {isAdmin ? 'admin_panel_settings' : isPublic ? 'public' : 'explore'}
              </span>
              <div>
                <p className="font-headline text-xs font-bold text-primary">
Try one of these
                </p>
                <h3 className="mt-1 font-headline text-xl font-extrabold">Popular pages</h3>
              </div>
            </div>

            <div className="mt-6 space-y-3">
              {links.map((link) => (
                <Link
                  className="rounded-full group flex items-center justify-between gap-4 bg-surface-container-high px-4 py-4 text-on-surface transition-colors hover:bg-primary hover:text-on-primary"
                  key={link.to}
                  to={link.to}
                >
                  <span className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-lg">{link.icon}</span>
                    <span className="font-headline text-xs font-bold">
                      {link.label}
                    </span>
                  </span>
                  <span className="material-symbols-outlined text-base transition-transform group-hover:translate-x-1">
                    arrow_forward
                  </span>
                </Link>
              ))}
            </div>

            <div className="rounded-2xl mt-8 bg-surface-container-high p-4">
              <p className="font-headline text-xs font-bold text-on-surface-variant">
Still stuck?
              </p>
              <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">
Use the links above to get back on track. If this link came from the admin panel, check
                that the route is enabled and the content still exists.
              </p>
            </div>
          </aside>
        </div>
      </section>
    </main>
  )
}

export default NotFoundPage
