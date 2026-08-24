import { useState } from 'react'

function ToggleRow({ checked, description, label, onChange }) {
  return (
    <label className="flex items-start justify-between gap-6 py-4 border-b border-outline-variant/20">
      <div>
        <p className="font-headline text-sm font-bold text-on-background">
          {label}
        </p>
        <p className="text-xs text-on-surface-variant mt-1">{description}</p>
      </div>
      <input
        checked={checked}
        className="mt-1 h-4 w-4 accent-[#b6171e]"
        onChange={(e) => onChange(e.target.checked)}
        type="checkbox"
      />
    </label>
  )
}

function AdminPanelPage({ config, onConfigChange, onLogout, username }) {
  const [aiApiKeyDraft, setAiApiKeyDraft] = useState('')
  const [publicApiKeysDraft, setPublicApiKeysDraft] = useState('')

  const setRouteValue = (key, value) => {
    onConfigChange({
      ...config,
      routes: { ...config.routes, [key]: value },
    })
  }

  const setFeatureValue = (key, value) => {
    onConfigChange({
      ...config,
      features: { ...config.features, [key]: value },
    })
  }

  const setAiValue = (key, value) => {
    onConfigChange({
      ...config,
      ai: { ...(config.ai || {}), [key]: value },
    })
  }

  const setApiValue = (section, key, value) => {
    onConfigChange({
      ...config,
      api: {
        ...(config.api || {}),
        [section]: {
          ...(config.api?.[section] || {}),
          [key]: value,
        },
      },
    })
  }

  const availableAiModels = Array.isArray(config.ai?.availableModels) ? config.ai.availableModels : []
  const selectableAiModels = Array.isArray(config.ai?.selectableModels) && config.ai.selectableModels.length
    ? config.ai.selectableModels
    : availableAiModels
  const selectedAiModel = config.ai?.model || selectableAiModels[0]?.id || availableAiModels[0]?.id || ''
  const apiConfig = config.api || {}

  return (
    <main className="min-h-screen bg-surface px-6 md:px-10 py-10">
      <section className="max-w-5xl mx-auto">
        <header className="rounded-2xl bg-surface-container-lowest shadow-soft p-8 md:p-10">
          <p className="font-headline text-xs text-primary font-bold">
            Administrative Control Center
          </p>
          <h1 className="font-headline text-4xl md:text-5xl font-extrabold tracking-tight mt-3">
            Minerva Admin Panel
          </h1>
          <p className="text-sm text-on-surface-variant mt-4 max-w-2xl">
            Signed in as {username}. Manage all platform content, configuration, access controls, and operator features in real time.
          </p>
          <div className="mt-6 flex gap-3">
            <button
              className="rounded-full bg-primary text-on-primary px-5 py-2.5 font-headline text-sm font-bold"
              onClick={onLogout}
              type="button"
            >
              Logout Admin
            </button>
          </div>
        </header>

        <section className="mt-8">
          <h2 className="font-headline text-2xl font-bold tracking-tight mb-6 text-primary flex items-center gap-2">
            <span className="material-symbols-outlined">school</span>
            Training Platform
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="rounded-2xl bg-surface-container-lowest shadow-soft p-6 hover:bg-surface-container-high transition-all cursor-pointer">
              <a className="block" href="/admin/users">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-primary" style={{ fontSize: '32px' }}>
                      manage_accounts
                    </span>
                    <div>
                      <h3 className="font-headline text-lg font-bold">People</h3>
                      <p className="text-xs text-on-surface-variant">Approvals &amp; roles</p>
                    </div>
                  </div>
                  <span className="material-symbols-outlined text-on-surface-variant">
                    chevron_right
                  </span>
                </div>
                <p className="text-sm text-on-surface-variant">
                  Approve new trainer accounts, switch someone between trainee, trainer and admin, and deactivate access.
                </p>
              </a>
            </div>
            <div className="rounded-2xl bg-surface-container-lowest shadow-soft p-6 hover:bg-surface-container-high transition-all cursor-pointer">
              <a className="block" href="/admin/insights">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-primary" style={{ fontSize: '32px' }}>
                      monitoring
                    </span>
                    <div>
                      <h3 className="font-headline text-lg font-bold">Insights</h3>
                      <p className="text-xs text-on-surface-variant">Dashboards &amp; statistics</p>
                    </div>
                  </div>
                  <span className="material-symbols-outlined text-on-surface-variant">
                    chevron_right
                  </span>
                </div>
                <p className="text-sm text-on-surface-variant">
                  Courses, enrolments, certifications, assessment results and participation trends in one dashboard.
                </p>
              </a>
            </div>
            <div className="rounded-2xl bg-surface-container-lowest shadow-soft p-6 hover:bg-surface-container-high transition-all cursor-pointer">
              <a className="block" href="/admin/homepage">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-primary" style={{ fontSize: '32px' }}>
                      campaign
                    </span>
                    <div>
                      <h3 className="font-headline text-lg font-bold">Noticeboard</h3>
                      <p className="text-xs text-on-surface-variant">Announcements &amp; achievements</p>
                    </div>
                  </div>
                  <span className="material-symbols-outlined text-on-surface-variant">
                    chevron_right
                  </span>
                </div>
                <p className="text-sm text-on-surface-variant">
                  Publish announcements, achievements and newly added learning content to everyone&rsquo;s home screen.
                </p>
              </a>
            </div>
            <div className="rounded-2xl bg-surface-container-lowest shadow-soft p-6 hover:bg-surface-container-high transition-all cursor-pointer">
              <a className="block" href="/admin/competencies">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-primary" style={{ fontSize: '32px' }}>
                      hub
                    </span>
                    <div>
                      <h3 className="font-headline text-lg font-bold">Competency Mapping</h3>
                      <p className="text-xs text-on-surface-variant">Match trainers to subjects</p>
                    </div>
                  </div>
                  <span className="material-symbols-outlined text-on-surface-variant">
                    chevron_right
                  </span>
                </div>
                <p className="text-sm text-on-surface-variant">
                  Rank trainers for any subject using declared proficiency, published material and trainee results.
                </p>
              </a>
            </div>
          </div>
        </section>

        <section className="mt-8">
          <h2 className="font-headline text-2xl font-bold tracking-tight mb-6 text-primary flex items-center gap-2">
            <span className="material-symbols-outlined">database</span>
            Platform Setup
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="rounded-2xl bg-surface-container-lowest shadow-soft p-6 hover:bg-surface-container-high transition-all cursor-pointer">
              <a className="block" href="/admin/database">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-primary" style={{ fontSize: '32px' }}>
                      storage
                    </span>
                    <div>
                      <h3 className="font-headline text-lg font-bold">Database Setup</h3>
                      <p className="text-xs text-on-surface-variant">Tables &amp; starter data</p>
                    </div>
                  </div>
                  <span className="material-symbols-outlined text-on-surface-variant">
                    chevron_right
                  </span>
                </div>
                <p className="text-sm text-on-surface-variant">
                  Create every table the platform needs and load starter courses, learning paths,
                  categories and resources. Safe to run more than once.
                </p>
              </a>
            </div>
          </div>
        </section>

        {/* Content Management Section */}
        <section className="mt-8">
          <h2 className="font-headline text-2xl font-bold tracking-tight mb-6 text-primary flex items-center gap-2">
            <span className="material-symbols-outlined">manage_accounts</span>
            Content Management
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Experimental Rooms */}
            <div className="rounded-2xl bg-surface-container-lowest shadow-soft p-6 hover:bg-surface-container-high transition-all cursor-pointer">
              <a className="block" href="/admin/courses">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-primary" style={{ fontSize: '32px' }}>
                      flask_2
                    </span>
                    <div>
                      <h3 className="font-headline text-lg font-bold">
                        Experimental Rooms
                      </h3>
                      <p className="text-xs text-on-surface-variant">
                        Manage Lab Content
                      </p>
                    </div>
                  </div>
                  <span className="material-symbols-outlined text-on-surface-variant">
                    chevron_right
                  </span>
                </div>
                <p className="text-sm text-on-surface-variant">
                  Configure available lab rooms, titles, descriptions, difficulty levels, and detailed markdown/HTML content for each room.
                </p>
              </a>
            </div>

            <div className="rounded-2xl bg-surface-container-lowest shadow-soft p-6 hover:bg-surface-container-high transition-all cursor-pointer">
              <a className="block" href="/admin/categories">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-primary" style={{ fontSize: '32px' }}>
                      category
                    </span>
                    <div>
                      <h3 className="font-headline text-lg font-bold">
                        Room Categories
                      </h3>
                      <p className="text-xs text-on-surface-variant">
                        Manage Specializations
                      </p>
                    </div>
                  </div>
                  <span className="material-symbols-outlined text-on-surface-variant">
                    chevron_right
                  </span>
                </div>
                <p className="text-sm text-on-surface-variant">
                  Add specialization categories for room filters, room creation, and dynamic proficiency tracking.
                </p>
              </a>
            </div>

            {/* Resource Database Management */}
            <div className="rounded-2xl bg-surface-container-lowest shadow-soft p-6 hover:bg-surface-container-high transition-all cursor-pointer">
              <a className="block" href="/admin/resources">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-error" style={{ fontSize: '32px' }}>
                      bug_report
                    </span>
                    <div>
                      <h3 className="font-headline text-lg font-bold">
                        Resource Database
                      </h3>
                      <p className="text-xs text-on-surface-variant">
                        Manage Vulnerabilities
                      </p>
                    </div>
                  </div>
                  <span className="material-symbols-outlined text-on-surface-variant">
                    chevron_right
                  </span>
                </div>
                <p className="text-sm text-on-surface-variant">
                  Configure Common Vulnerabilities and Exposures (Resources), manage vulnerability reports, found date and research references.
                </p>
              </a>
            </div>

            {/* Career Paths */}
            <div className="rounded-2xl bg-surface-container-lowest shadow-soft p-6 hover:bg-surface-container-high transition-all cursor-pointer">
              <a className="block" href="/admin/career-paths">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-secondary" style={{ fontSize: '32px' }}>
                      school
                    </span>
                    <div>
                      <h3 className="font-headline text-lg font-bold">
                        Career Paths
                      </h3>
                      <p className="text-xs text-on-surface-variant">
                        Manage Learning Paths
                      </p>
                    </div>
                  </div>
                  <span className="material-symbols-outlined text-on-surface-variant">
                    chevron_right
                  </span>
                </div>
                <p className="text-sm text-on-surface-variant">
                  Configure learning paths, modules, resources, difficulty levels, commitment hours, and specialization details.
                </p>
              </a>
            </div>

            <div className="rounded-2xl bg-surface-container-lowest shadow-soft p-6 hover:bg-surface-container-high transition-all cursor-pointer">
              <a className="block" href="/admin/roadmap">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-secondary" style={{ fontSize: '32px' }}>
                      account_tree
                    </span>
                    <div>
                      <h3 className="font-headline text-lg font-bold">
                        Roadmap Builder
                      </h3>
                      <p className="text-xs text-on-surface-variant">
                        Wireframe Module Flow
                      </p>
                    </div>
                  </div>
                  <span className="material-symbols-outlined text-on-surface-variant">
                    chevron_right
                  </span>
                </div>
                <p className="text-sm text-on-surface-variant">
                  Drag modules under specific roadmap branches and publish the public learning flow from one visual wireframe.
                </p>
              </a>
            </div>

            {/* Notifications */}
            <div className="rounded-2xl bg-surface-container-lowest shadow-soft p-6 hover:bg-surface-container-high transition-all cursor-pointer">
              <a className="block" href="/admin/notifications">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-secondary" style={{ fontSize: '32px' }}>
                      notifications_active
                    </span>
                    <div>
                      <h3 className="font-headline text-lg font-bold">
                        Notifications
                      </h3>
                      <p className="text-xs text-on-surface-variant">
                        Manage System Notifications
                      </p>
                    </div>
                  </div>
                  <span className="material-symbols-outlined text-on-surface-variant">
                    chevron_right
                  </span>
                </div>
                <p className="text-sm text-on-surface-variant">
                  Create and manage system-wide notifications that appear in the user panel for all operators.
                </p>
              </a>
            </div>

            {/* Registrations */}
            <div className="rounded-2xl bg-surface-container-lowest shadow-soft p-6 hover:bg-surface-container-high transition-all cursor-pointer">
              <a className="block" href="/admin/registrations">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-secondary" style={{ fontSize: '32px' }}>
                      badge
                    </span>
                    <div>
                      <h3 className="font-headline text-lg font-bold">
                        Registrations
                      </h3>
                      <p className="text-xs text-on-surface-variant">
                        Manage User Accounts
                      </p>
                    </div>
                  </div>
                  <span className="material-symbols-outlined text-on-surface-variant">
                    chevron_right
                  </span>
                </div>
                <p className="text-sm text-on-surface-variant">
                  View and edit registration number, email, status, role, and credentials for player accounts.
                </p>
              </a>
            </div>

            {/* Lab Research */}
            <div className="rounded-2xl bg-surface-container-lowest shadow-soft p-6 hover:bg-surface-container-high transition-all cursor-pointer">
              <a className="block" href="/admin/projects">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-secondary" style={{ fontSize: '32px' }}>
                      biotech
                    </span>
                    <div>
                      <h3 className="font-headline text-lg font-bold">
                        Lab Research
                      </h3>
                      <p className="text-xs text-on-surface-variant">
                        Project Knowledge Transfer
                      </p>
                    </div>
                  </div>
                  <span className="material-symbols-outlined text-on-surface-variant">
                    chevron_right
                  </span>
                </div>
                <p className="text-sm text-on-surface-variant">
                  Publish project write-ups with stack, contributors, and implementation details. Players pass an AI knowledge check and optional AI code lab; track who completed each project.
                </p>
              </a>
            </div>

            {/* Upcoming Event */}
            <div className="rounded-2xl bg-surface-container-lowest shadow-soft p-6 hover:bg-surface-container-high transition-all cursor-pointer">
              <a className="block" href="/admin/events">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-primary" style={{ fontSize: '32px' }}>
                      event_upcoming
                    </span>
                    <div>
                      <h3 className="font-headline text-lg font-bold">
                        Upcoming Event
                      </h3>
                      <p className="text-xs text-on-surface-variant">
                        Manage Event Timeline
                      </p>
                    </div>
                  </div>
                  <span className="material-symbols-outlined text-on-surface-variant">
                    chevron_right
                  </span>
                </div>
                <p className="text-sm text-on-surface-variant">
                  Configure event name, registration deadline, live time, and registration link for player-facing CTF announcements.
                </p>
              </a>
            </div>

            {/* Docker Config */}
            <div className="rounded-2xl bg-surface-container-lowest shadow-soft p-6 hover:bg-surface-container-high transition-all cursor-pointer">
              <a className="block" href="/admin/docker">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-primary" style={{ fontSize: '32px' }}>
                      deployed_code
                    </span>
                    <div>
                      <h3 className="font-headline text-lg font-bold">
                        Docker Config
                      </h3>
                      <p className="text-xs text-on-surface-variant">
                        Container Runtime
                      </p>
                    </div>
                  </div>
                  <span className="material-symbols-outlined text-on-surface-variant">
                    chevron_right
                  </span>
                </div>
                <p className="text-sm text-on-surface-variant">
                  Check Docker connectivity and review available container images for practical lab services.
                </p>
              </a>
            </div>

            <div className="rounded-2xl bg-surface-container-lowest shadow-soft p-6 hover:bg-surface-container-high transition-all cursor-pointer">
              <a className="block" href="/admin/environments">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-secondary" style={{ fontSize: '32px' }}>
                      dns
                    </span>
                    <div>
                      <h3 className="font-headline text-lg font-bold">
                        Running Machines
                      </h3>
                      <p className="text-xs text-on-surface-variant">
                        Active Lab Containers
                      </p>
                    </div>
                  </div>
                  <span className="material-symbols-outlined text-on-surface-variant">
                    chevron_right
                  </span>
                </div>
                <p className="text-sm text-on-surface-variant">
                  View live Docker machines spawned by players, refresh runtime state, and stop active lab sessions.
                </p>
              </a>
            </div>

            <div className="rounded-2xl bg-surface-container-lowest shadow-soft p-6 hover:bg-surface-container-high transition-all cursor-pointer">
              <a className="block" href="/developer">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-primary" style={{ fontSize: '32px' }}>
                      data_object
                    </span>
                    <div>
                      <h3 className="font-headline text-lg font-bold">
                        Developer Panel
                      </h3>
                      <p className="text-xs text-on-surface-variant">
                        API Keys and Monitoring
                      </p>
                    </div>
                  </div>
                  <span className="material-symbols-outlined text-on-surface-variant">
                    chevron_right
                  </span>
                </div>
                <p className="text-sm text-on-surface-variant">
                  Monitor active users, Docker lab instances, integration payloads, and create developer API keys for external scripts.
                </p>
              </a>
            </div>

            <div className="rounded-2xl bg-surface-container-lowest shadow-soft p-6 hover:bg-surface-container-high transition-all cursor-pointer">
              <a className="block" href="/admin/interview-questions">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-primary" style={{ fontSize: '32px' }}>
                      record_voice_over
                    </span>
                    <div>
                      <h3 className="font-headline text-lg font-bold">
                        Interview Questions
                      </h3>
                      <p className="text-xs text-on-surface-variant">
                        AI Room Matching
                      </p>
                    </div>
                  </div>
                  <span className="material-symbols-outlined text-on-surface-variant">
                    chevron_right
                  </span>
                </div>
                <p className="text-sm text-on-surface-variant">
                  Add custom interview questions and let AI insert them into the best matching rooms as optional bonus challenges.
                </p>
              </a>
            </div>

            {/* Admin AI */}
            <div className="rounded-2xl bg-surface-container-lowest shadow-soft p-6 hover:bg-surface-container-high transition-all cursor-pointer">
              <a className="block" href="/admin/ai-control">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-secondary" style={{ fontSize: '32px' }}>
                      smart_toy
                    </span>
                    <div>
                      <h3 className="font-headline text-lg font-bold">
                        Admin AI Control
                      </h3>
                      <p className="text-xs text-on-surface-variant">
                        Monitor and Automate
                      </p>
                    </div>
                  </div>
                  <span className="material-symbols-outlined text-on-surface-variant">
                    chevron_right
                  </span>
                </div>
                <p className="text-sm text-on-surface-variant">
                  Chat with an admin-only AI to monitor platform insights and execute content operations such as creating rooms, career paths, and modules.
                </p>
              </a>
            </div>

            <div className="rounded-2xl bg-surface-container-lowest shadow-soft p-6 hover:bg-surface-container-high transition-all cursor-pointer">
              <a className="block" href="/admin/jobs">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-secondary" style={{ fontSize: '32px' }}>
                      work
                    </span>
                    <div>
                      <h3 className="font-headline text-lg font-bold">
                        Job Recommendations
                      </h3>
                      <p className="text-xs text-on-surface-variant">
                        Student Placement Matrix
                      </p>
                    </div>
                  </div>
                  <span className="material-symbols-outlined text-on-surface-variant">
                    chevron_right
                  </span>
                </div>
                <p className="text-sm text-on-surface-variant">
                  Review which seeded jobs are recommended to each student using completed rooms, internships, projects, certifications, tools, and skills.
                </p>
              </a>
            </div>

            <div className="rounded-2xl bg-surface-container-lowest shadow-soft p-6 hover:bg-surface-container-high transition-all cursor-pointer">
              <a className="block" href="/admin/top-resumes">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-secondary" style={{ fontSize: '32px' }}>
                      description
                    </span>
                    <div>
                      <h3 className="font-headline text-lg font-bold">
                        Top Player Resumes
                      </h3>
                      <p className="text-xs text-on-surface-variant">
                        Placement Download Vault
                      </p>
                    </div>
                  </div>
                  <span className="material-symbols-outlined text-on-surface-variant">
                    chevron_right
                  </span>
                </div>
                <p className="text-sm text-on-surface-variant">
                  Download resumes uploaded by the current top 10 players for placement and recruiter review.
                </p>
              </a>
            </div>
          </div>
        </section>

        {/* Platform Access Controls */}
        <section className="mt-8">
          <h2 className="font-headline text-2xl font-bold tracking-tight mb-6 text-primary flex items-center gap-2">
            <span className="material-symbols-outlined">settings</span>
            Platform Access Controls
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="rounded-2xl bg-surface-container-lowest p-6 md:p-8">
              <h2 className="font-headline text-xl font-bold tracking-tight">
                Route Access Control
              </h2>
              <p className="text-xs text-on-surface-variant mt-1 mb-4">
                Enable or disable user pages
              </p>

              <ToggleRow
                checked={config.routes.dashboard}
                description="Controls access to the main mission dashboard route (/)."
                label="Dashboard Route"
                onChange={(v) => setRouteValue('dashboard', v)}
              />
              <ToggleRow
                checked={config.routes.learningPaths}
                description="Controls access to learning path pages (/learn/paths and role-path pages)."
                label="Learning Paths Route"
                onChange={(v) => setRouteValue('learningPaths', v)}
              />
              <ToggleRow
                checked={config.routes.practiceLabs}
                description="Controls access to labs and module routes (/learn and /learn/course/:courseId)."
                label="Practice Labs Route"
                onChange={(v) => setRouteValue('practiceLabs', v)}
              />
              <ToggleRow
                checked={config.routes.upcomingCtf}
                description="Controls access to player upcoming CTF route (/events)."
                label="Upcoming Event Route"
                onChange={(v) => setRouteValue('upcomingCtf', v)}
              />
              <ToggleRow
                checked={config.routes.profile}
                description="Controls access to operator profile route (/profile)."
                label="Profile Route"
                onChange={(v) => setRouteValue('profile', v)}
              />
            </div>

            <div className="rounded-2xl bg-surface-container-lowest p-6 md:p-8">
              <h2 className="font-headline text-xl font-bold tracking-tight">
                Feature Control
              </h2>
              <p className="text-xs text-on-surface-variant mt-1 mb-4">
                Toggle core platform actions
              </p>

              <ToggleRow
                checked={config.features.labRooms}
                description="Controls whether users can open specific lab room pages."
                label="Lab Course Access"
                onChange={(v) => setFeatureValue('labRooms', v)}
              />
              <ToggleRow
                checked={config.features.featuredPath}
                description="Controls access from Learning Paths to Full-Stack Developer page."
                label="Core Track Path Access"
                onChange={(v) => setFeatureValue('featuredPath', v)}
              />
              <ToggleRow
                checked={config.features.newMissionButton}
                description="Shows or hides the Browse courses action in the sidebar."
                label="Sidebar Browse Action"
                onChange={(v) => setFeatureValue('newMissionButton', v)}
              />
              <ToggleRow
                checked={config.features.navbarSearch}
                description="Shows or hides the search utility in top navbar."
                label="Navbar Search"
                onChange={(v) => setFeatureValue('navbarSearch', v)}
              />
              <ToggleRow
                checked={config.features.navbarNotifications}
                description="Shows or hides navbar notification icon."
                label="Navbar Notifications"
                onChange={(v) => setFeatureValue('navbarNotifications', v)}
              />
              <ToggleRow
                checked={config.features.navbarSettings}
                description="Shows or hides navbar settings icon."
                label="Navbar Settings"
                onChange={(v) => setFeatureValue('navbarSettings', v)}
              />
              <ToggleRow
                checked={config.features.publicRegistration}
                description="Enable or disable public /register page for new operator accounts."
                label="Public Registration"
                onChange={(v) => setFeatureValue('publicRegistration', v)}
              />
              <div className="grid grid-cols-1 gap-4 py-4 md:grid-cols-2">
                <label className="block">
                  <span className="font-headline text-xs text-on-surface-variant font-bold">
                    Registration Range Min
                  </span>
                  <input
                    className="rounded-xl mt-2 w-full bg-surface-container-highest  py-3 px-4 outline-none"
                    min="0"
                    onChange={(event) => setFeatureValue('registrationDynamicMin', Number(event.target.value))}
                    type="number"
                    value={config.features.registrationDynamicMin ?? 23}
                  />
                </label>
                <label className="block">
                  <span className="font-headline text-xs text-on-surface-variant font-bold">
                    Registration Range Max
                  </span>
                  <input
                    className="rounded-xl mt-2 w-full bg-surface-container-highest  py-3 px-4 outline-none"
                    min="0"
                    onChange={(event) => setFeatureValue('registrationDynamicMax', Number(event.target.value))}
                    type="number"
                    value={config.features.registrationDynamicMax ?? 30}
                  />
                </label>
                <p className="md:col-span-2 text-xs text-on-surface-variant">
                  Applies only to public operator registration. Admin-created and admin-edited users are not restricted by this policy.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-8">
          <h2 className="font-headline text-2xl font-bold tracking-tight mb-6 text-primary flex items-center gap-2">
            <span className="material-symbols-outlined">psychology</span>
            AI Runtime Control
          </h2>
          <div className="rounded-2xl bg-surface-container-lowest p-6 md:p-8 shadow-soft">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-xl">
                <h3 className="font-headline text-xl font-bold tracking-tight">
                  Active AI Model
                </h3>
                <p className="mt-2 text-sm text-on-surface-variant">
                  Choose the model used by course question generation, evaluation, profile analysis, the study assistant, and Admin AI. Runtime API settings can be controlled below.
                </p>
              </div>

              <label className="block w-full lg:max-w-md">
                <span className="font-headline text-xs text-on-surface-variant font-bold">
                  Available Models
                </span>
                <select
                  className="rounded-xl mt-2 w-full bg-surface-container-highest  border-t-0 border-r-0 border-b-0 py-3 px-4 outline-none"
                  onChange={(event) => setAiValue('model', event.target.value)}
                  value={selectedAiModel}
                >
                  {selectableAiModels.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.provider ? `${model.provider} - ` : ''}{model.label || model.id}
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-xs text-on-surface-variant break-all">
                  Current model id: {selectedAiModel || 'Not configured'}
                </p>
              </label>
            </div>

            <div className="mt-8 grid grid-cols-1 xl:grid-cols-3 gap-4">
              <div className="rounded-2xl bg-surface-container-high p-5">
                <p className="font-headline text-xs text-secondary font-bold">
                  AI API
                </p>
                <h4 className="mt-1 font-headline text-lg font-extrabold">Runtime Settings</h4>
                <label className="mt-4 block">
                  <span className="font-headline text-xs text-on-surface-variant font-bold">
                    Base URL
                  </span>
                  <input
                    className="rounded-xl mt-2 w-full bg-surface-container-highest  py-3 px-4 outline-none"
                    onChange={(event) => setApiValue('ai', 'baseUrl', event.target.value)}
                    placeholder="https://integrate.api.nvidia.com/v1"
                    type="text"
                    value={apiConfig.ai?.baseUrl || ''}
                  />
                </label>
                <label className="mt-4 block">
                  <span className="font-headline text-xs text-on-surface-variant font-bold">
                    API Key
                  </span>
                  <input
                    className="rounded-xl mt-2 w-full bg-surface-container-highest  py-3 px-4 outline-none"
                    onBlur={(event) => {
                      setApiValue('ai', 'apiKey', event.target.value)
                      setAiApiKeyDraft('')
                    }}
                    onChange={(event) => setAiApiKeyDraft(event.target.value)}
                    placeholder={apiConfig.ai?.apiKeyConfigured ? 'Configured. Enter a new key to replace.' : 'Paste AI API key'}
                    type="password"
                    value={aiApiKeyDraft}
                  />
                  <p className="mt-1 text-xs text-on-surface-variant">
                    {apiConfig.ai?.apiKeyConfigured ? 'A key is currently configured.' : 'No AI API key configured.'}
                  </p>
                </label>
                <div className="mt-4 grid grid-cols-3 gap-3">
                  <label className="block">
                    <span className="font-headline text-xs text-on-surface-variant font-bold">
                      Temp
                    </span>
                    <input
                      className="rounded-xl mt-2 w-full bg-surface-container-highest  py-3 px-3 outline-none"
                      max="2"
                      min="0"
                      onChange={(event) => setApiValue('ai', 'temperature', event.target.value)}
                      step="0.1"
                      type="number"
                      value={apiConfig.ai?.temperature ?? ''}
                    />
                  </label>
                  <label className="block">
                    <span className="font-headline text-xs text-on-surface-variant font-bold">
                      Top P
                    </span>
                    <input
                      className="rounded-xl mt-2 w-full bg-surface-container-highest  py-3 px-3 outline-none"
                      max="1"
                      min="0"
                      onChange={(event) => setApiValue('ai', 'topP', event.target.value)}
                      step="0.05"
                      type="number"
                      value={apiConfig.ai?.topP ?? ''}
                    />
                  </label>
                  <label className="block">
                    <span className="font-headline text-xs text-on-surface-variant font-bold">
                      Tokens
                    </span>
                    <input
                      className="rounded-xl mt-2 w-full bg-surface-container-highest  py-3 px-3 outline-none"
                      min="256"
                      onChange={(event) => setApiValue('ai', 'maxTokens', event.target.value)}
                      step="256"
                      type="number"
                      value={apiConfig.ai?.maxTokens ?? ''}
                    />
                  </label>
                </div>
              </div>

              <div className="rounded-2xl bg-surface-container-high p-5">
                <p className="font-headline text-xs text-secondary font-bold">
                  the events feed API
                </p>
                <h4 className="mt-1 font-headline text-lg font-extrabold">Event sync</h4>
                <label className="mt-4 flex items-center gap-3">
                  <input
                    checked={apiConfig.ctftime?.enabled !== false}
                    className="h-4 w-4 accent-[#b6171e]"
                    onChange={(event) => setApiValue('ctftime', 'enabled', event.target.checked)}
                    type="checkbox"
                  />
                  <span className="font-headline text-xs text-on-surface-variant font-bold">
                    Enable Sync
                  </span>
                </label>
                <label className="mt-4 block">
                  <span className="font-headline text-xs text-on-surface-variant font-bold">
                    Base URL
                  </span>
                  <input
                    className="rounded-xl mt-2 w-full bg-surface-container-highest  py-3 px-4 outline-none"
                    onChange={(event) => setApiValue('ctftime', 'baseUrl', event.target.value)}
                    placeholder="https://ctftime.org/api/v1"
                    type="text"
                    value={apiConfig.ctftime?.baseUrl || ''}
                  />
                </label>
                <label className="mt-4 block">
                  <span className="font-headline text-xs text-on-surface-variant font-bold">
                    User Agent
                  </span>
                  <input
                    className="rounded-xl mt-2 w-full bg-surface-container-highest  py-3 px-4 outline-none"
                    onChange={(event) => setApiValue('ctftime', 'userAgent', event.target.value)}
                    type="text"
                    value={apiConfig.ctftime?.userAgent || ''}
                  />
                </label>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="font-headline text-xs text-on-surface-variant font-bold">
                      Limit
                    </span>
                    <input
                      className="rounded-xl mt-2 w-full bg-surface-container-highest  py-3 px-3 outline-none"
                      max="500"
                      min="1"
                      onChange={(event) => setApiValue('ctftime', 'limit', event.target.value)}
                      type="number"
                      value={apiConfig.ctftime?.limit ?? 100}
                    />
                  </label>
                  <label className="block">
                    <span className="font-headline text-xs text-on-surface-variant font-bold">
                      Horizon Days
                    </span>
                    <input
                      className="rounded-xl mt-2 w-full bg-surface-container-highest  py-3 px-3 outline-none"
                      max="1095"
                      min="1"
                      onChange={(event) => setApiValue('ctftime', 'horizonDays', event.target.value)}
                      type="number"
                      value={apiConfig.ctftime?.horizonDays ?? 365}
                    />
                  </label>
                </div>
              </div>

              <div className="rounded-2xl bg-surface-container-high p-5">
                <p className="font-headline text-xs text-secondary font-bold">
                  Public API
                </p>
                <h4 className="mt-1 font-headline text-lg font-extrabold">Access Keys</h4>
                <label className="mt-4 block">
                  <span className="font-headline text-xs text-on-surface-variant font-bold">
                    API Keys
                  </span>
                  <textarea
                    className="rounded-xl mt-2 min-h-32 w-full bg-surface-container-highest  py-3 px-4 outline-none"
                    onBlur={(event) => {
                      setApiValue('publicApi', 'keys', event.target.value)
                      setPublicApiKeysDraft('')
                    }}
                    onChange={(event) => setPublicApiKeysDraft(event.target.value)}
                    placeholder={apiConfig.publicApi?.keysConfigured ? 'Configured. Enter comma-separated keys to replace.' : 'key-one, key-two'}
                    value={publicApiKeysDraft}
                  ></textarea>
                  <p className="mt-1 text-xs text-on-surface-variant">
                    {apiConfig.publicApi?.keysConfigured
                      ? `${apiConfig.publicApi?.keyCount || 0} public API key(s) configured.`
                      : 'No public API keys configured.'}
                  </p>
                </label>
                <p className="mt-4 text-xs leading-relaxed text-on-surface-variant">
                  Docker daemon settings remain in the dedicated Docker Configuration page because they include certificate uploads and live image discovery.
                </p>
              </div>
            </div>

            {availableAiModels.length ? (
              <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-3">
                {availableAiModels.map((model) => (
                  <article
                    className={`p-4 border-l-2 ${
                      model.id === selectedAiModel
                        ? 'bg-secondary/10 border-l-secondary'
                        : 'bg-surface-container-high border-l-outline-variant'
                    }`}
                    key={model.id}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-headline text-sm font-bold tracking-wide">
                          {model.label || model.id}
                        </p>
                        <p className="mt-1 text-xs text-on-surface-variant break-all">{model.id}</p>
                      </div>
                      <span className="rounded-full bg-surface-container-highest px-2 py-1 font-headline text-xs font-bold text-on-surface-variant">
                        {model.provider || 'AI'}
                      </span>
                    </div>
                    {model.description ? (
                      <p className="mt-3 text-xs text-on-surface-variant">{model.description}</p>
                    ) : null}
                  </article>
                ))}
              </div>
            ) : (
              <p className="rounded-2xl mt-6 bg-surface-container-high p-4 text-sm text-on-surface-variant">
                No model list was returned by the backend.
              </p>
            )}
          </div>
        </section>
      </section>
    </main>
  )
}

export default AdminPanelPage
