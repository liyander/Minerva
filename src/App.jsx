import { useEffect, useRef, useState } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import './App.css'
import { getAuthSession, hasRole, logoutUser, ROLES } from './auth'
import Navbar from './components/Navbar'
import Sidebar from './components/Sidebar'
import AssistantChatbot from './components/AssistantChatbot'
import { loadPlatformConfig, savePlatformConfig } from './platformConfig'
import { apiFetch } from './services/api'
import { syncFrontendStateFromBackend } from './services/backendSync'
import AdminPanelPage from './pages/AdminPanelPage'
import AdminCoursesManagementPage from './pages/admin/AdminCoursesManagementPage'
import AdminCourseEditorPage from './pages/admin/AdminCourseEditorPage'
import AdminCategoriesPage from './pages/admin/AdminCategoriesPage'
import AdminDockerConfigPage from './pages/admin/AdminDockerConfigPage'
import AdminRunningEnvironmentsPage from './pages/admin/AdminRunningEnvironmentsPage'
import AdminCareerPathsManagementPage from './pages/admin/AdminCareerPathsManagementPage'
import AdminCareerPathEditorPage from './pages/admin/AdminCareerPathEditorPage'
import AdminRoadmapBuilderPage from './pages/admin/AdminRoadmapBuilderPage'
import AdminNotificationsManagementPage from './pages/admin/AdminNotificationsManagementPage'
import AdminRegistrationsManagementPage from './pages/admin/AdminRegistrationsManagementPage'
import AdminRegistrationDetailPage from './pages/admin/AdminRegistrationDetailPage'
import AdminEventsManagementPage from './pages/admin/AdminEventsManagementPage'
import AdminResourcesManagementPage from './pages/admin/AdminResourcesManagementPage'
import AdminResourceEditorPage from './pages/admin/AdminResourceEditorPage'
import AdminAiControlPage from './pages/admin/AdminAiControlPage'
import AdminDatabasePage from './pages/admin/AdminDatabasePage'
import AdminUsersPage from './pages/admin/AdminUsersPage'
import AdminInsightsPage from './pages/admin/AdminInsightsPage'
import AdminHomepagePage from './pages/admin/AdminHomepagePage'
import AdminCompetencyPage from './pages/admin/AdminCompetencyPage'
import TrainerWorkspacePage from './pages/trainer/TrainerWorkspacePage'
import AssessmentEditorPage from './pages/trainer/AssessmentEditorPage'
import AssessmentResultsPage from './pages/trainer/AssessmentResultsPage'
import AssessmentsPage from './pages/AssessmentsPage'
import AssessmentAttemptPage from './pages/AssessmentAttemptPage'
import TrainerLibraryPage from './pages/TrainerLibraryPage'
import ProfessionalProfilePage from './pages/ProfessionalProfilePage'
import AdminInterviewQuestionsPage from './pages/admin/AdminInterviewQuestionsPage'
import AdminJobRecommendationsPage from './pages/admin/AdminJobRecommendationsPage'
import AdminTopStudentResumesPage from './pages/admin/AdminTopStudentResumesPage'
import AdminProjectsPage from './pages/admin/AdminProjectsPage'
import AdminProjectSubmissionPage from './pages/admin/AdminProjectSubmissionPage'
import DeveloperDashboardPage from './pages/developer/DeveloperDashboardPage'
import DashboardPage from './pages/DashboardPage'
import OpportunitiesPage from './pages/OpportunitiesPage'
import CareerPrepPage from './pages/CareerPrepPage'
import ResourcesPage from './pages/ResourcesPage'
import ResourceDetailPage from './pages/ResourceDetailPage'
import CertificateVerificationPage from './pages/CertificateVerificationPage'
import CoursePage from './pages/CoursePage'
import LearningPathsPage from './pages/LearningPathsPage'
import LoginPage from './pages/LoginPage'
import CourseCatalogPage from './pages/CourseCatalogPage'
import ModuleDetailPage from './pages/ModuleDetailPage'
import NotesPage from './pages/NotesPage'
import NotFoundPage from './pages/NotFoundPage'
import ProfilePage from './pages/ProfilePage'
import RoadmapPage from './pages/RoadmapPage'
import LeaderboardPage from './pages/LeaderboardPage'
import SettingsPage from './pages/SettingsPage'
import RegistrationPage from './pages/RegistrationPage'
import LearningPathDetailPage from './pages/LearningPathDetailPage'
import EventsPage from './pages/EventsPage'
import ProjectsPage from './pages/ProjectsPage'
import ProjectDetailPage from './pages/ProjectDetailPage'
import { getSavedTheme, toggleTheme as toggleThemeSetting } from './services/theme'

function ControlledOutageScreen() {
  return (
    <main className="min-h-screen bg-white text-on-surface flex items-center justify-center px-6 py-10">
      <section className="w-full max-w-xl rounded border border-outline-variant bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight">
          Something went wrong.
        </h1>
        <p className="mt-4 text-base leading-7 text-on-surface-variant">
          The application encountered an unexpected error. Try refreshing the page.
        </p>
        <pre className="mt-6 max-h-56 overflow-auto rounded bg-slate-950 p-4 text-xs leading-6 text-slate-100">
          {`Error: Minified React error #418; visit https://react.dev/errors/418 for the full message or use the non-minified dev environment for full errors and additional helpful warnings.
    at renderRootSync (react-dom_client.js:8309:13)
    at performWorkOnRoot (react-dom_client.js:7957:19)
    at performWorkOnRootViaSchedulerTask (react-dom_client.js:9059:9)`}
        </pre>
      </section>
    </main>
  )
}

function firstEnabledRoute(config) {
  if (config.routes.dashboard) return '/'
  if (config.routes.learningPaths) return '/learn/paths'
  if (config.routes.practiceLabs) return '/learn'
  if (config.routes.upcomingCtf) return '/events'
  if (config.routes.profile) return '/profile'
  return '/'
}

function App() {
  const [authSession, setAuthSession] = useState(getAuthSession)
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [platformConfig, setPlatformConfig] = useState(loadPlatformConfig)
  const [isBootstrapping, setIsBootstrapping] = useState(true)
  const [syncTick, setSyncTick] = useState(0)
  const [theme, setTheme] = useState(getSavedTheme)
  const platformConfigSaveRef = useRef({ inFlight: false, version: 0 })
  const location = useLocation()
  const isPublicVerificationRoute = location.pathname.startsWith('/verify-certificate')

  const toggleTheme = () => {
    setTheme((current) => toggleThemeSetting(current))
  }

  const themeToggleButton = (
    <button
      className="rounded-full fixed bottom-5 right-5 z-[80] inline-flex items-center gap-2 px-4 py-3 bg-surface-container-lowest border border-outline-variant text-on-surface font-headline text-xs font-bold shadow-card hover:border-primary transition-colors"
      onClick={toggleTheme}
      type="button"
      aria-label="Toggle theme"
      title="Toggle light/dark mode"
    >
      <span className="material-symbols-outlined text-base">
        {theme === 'dark' ? 'light_mode' : 'dark_mode'}
      </span>
      {theme === 'dark' ? 'Light' : 'Dark'}
    </button>
  )

  const handleSessionExpired = () => {
    logoutUser()
    setAuthSession(null)
  }

  const isAuthError = (error) =>
    /invalid or expired token|unauthorized/i.test(error?.message || '')

  useEffect(() => {
    const onAuthExpired = () => {
      handleSessionExpired()
    }

    window.addEventListener('incognitrix:auth-expired', onAuthExpired)
    return () => {
      window.removeEventListener('incognitrix:auth-expired', onAuthExpired)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function bootstrap() {
      if (!authSession?.token) {
        if (!cancelled) {
          setIsBootstrapping(false)
        }
        return
      }

      try {
        const syncResult = await syncFrontendStateFromBackend({ persistPlatformConfig: false })
        if (!cancelled) {
          const savedConfig = savePlatformConfig(syncResult.platformConfig)
          setPlatformConfig(savedConfig)
          setSyncTick((value) => value + 1)
        }
      } catch (error) {
        if (isAuthError(error)) {
          handleSessionExpired()
          return
        }
        console.error('Failed to sync backend state:', error)
      } finally {
        if (!cancelled) {
          setIsBootstrapping(false)
        }
      }
    }

    bootstrap()

    return () => {
      cancelled = true
    }
  }, [authSession])

  useEffect(() => {
    if (!authSession?.token) {
      return undefined
    }

    let cancelled = false
    const syncNow = async () => {
      if (platformConfigSaveRef.current.inFlight) {
        return
      }

      const syncVersion = platformConfigSaveRef.current.version
      try {
        const syncResult = await syncFrontendStateFromBackend({ persistPlatformConfig: false })
        if (platformConfigSaveRef.current.inFlight || platformConfigSaveRef.current.version !== syncVersion) {
          return
        }

        if (!cancelled) {
          const savedConfig = savePlatformConfig(syncResult.platformConfig)
          setPlatformConfig(savedConfig)
          setSyncTick((value) => value + 1)
        }
      } catch (error) {
        if (isAuthError(error)) {
          handleSessionExpired()
          return
        }
        console.error('Background sync failed:', error)
      }
    }

    const intervalId = window.setInterval(syncNow, 8000)
    void syncNow()
    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [authSession?.token])

  const updatePlatformConfig = (nextConfig) => {
    const merged = savePlatformConfig(nextConfig)
    const saveVersion = platformConfigSaveRef.current.version + 1
    platformConfigSaveRef.current = { inFlight: true, version: saveVersion }
    setPlatformConfig(merged)
    void apiFetch('/platform-config', {
      method: 'PUT',
      body: JSON.stringify(merged),
    })
      .then((savedConfig) => {
        if (platformConfigSaveRef.current.version !== saveVersion) {
          return
        }

        const savedMerged = savePlatformConfig(savedConfig)
        setPlatformConfig(savedMerged)
        setSyncTick((value) => value + 1)
      })
      .catch((error) => {
        if (isAuthError(error)) {
          handleSessionExpired()
          return
        }
        console.error('Failed to sync platform config:', error)
      })
      .finally(() => {
        if (platformConfigSaveRef.current.version === saveVersion) {
          platformConfigSaveRef.current = { inFlight: false, version: saveVersion }
        }
      })
  }

  if (authSession && !authSession.token) {
    logoutUser()
    return <Navigate to="/login" replace />
  }

  if (isBootstrapping) {
    return (
      <main className="min-h-screen bg-surface flex items-center justify-center px-6">
        <div className="text-center space-y-4">
          <div className="mx-auto h-10 w-10 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
          <p className="font-headline text-sm text-on-surface-variant font-semibold">
            Loading your workspace…
          </p>
        </div>
      </main>
    )
  }

  void syncTick

  const controlledOutage = platformConfig.features?.controlledOutage
  if (controlledOutage?.active) {
    return (
      <ControlledOutageScreen />
    )
  }

  if (isPublicVerificationRoute) {
    return (
      <Routes>
        <Route path="/verify-certificate" element={<CertificateVerificationPage />} />
        <Route path="/verify-certificate/:certificateId" element={<CertificateVerificationPage />} />
        <Route path="*" element={<NotFoundPage variant="public" />} />
      </Routes>
    )
  }

  if (!authSession) {
    return (
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/verify-certificate" element={<CertificateVerificationPage />} />
        <Route path="/verify-certificate/:certificateId" element={<CertificateVerificationPage />} />
        <Route
          path="/login"
          element={<LoginPage onLoginSuccess={setAuthSession} />}
        />
          <Route
            path="/register"
            element={<RegistrationPage onRegisterSuccess={setAuthSession} />}
          />
        <Route path="*" element={<NotFoundPage variant="public" />} />
      </Routes>
    )
  }

  if (authSession.role === 'admin') {
    return (
      <>
        {themeToggleButton}
        <AssistantChatbot />
        <Routes>
          <Route path="/login" element={<Navigate to="/admin" replace />} />
          <Route path="/register" element={<Navigate to="/admin" replace />} />
          <Route
            path="/admin"
            element={
              <AdminPanelPage
                config={platformConfig}
                onConfigChange={updatePlatformConfig}
                onLogout={() => {
                  logoutUser()
                  setAuthSession(null)
                }}
                username={authSession.username}
              />
            }
          />
          <Route path="/admin/courses" element={<AdminCoursesManagementPage />} />
          <Route path="/admin/courses/new" element={<AdminCourseEditorPage />} />
          <Route path="/admin/courses/:roomId" element={<AdminCourseEditorPage />} />
          <Route path="/admin/docker" element={<AdminDockerConfigPage />} />
          <Route path="/admin/environments" element={<AdminRunningEnvironmentsPage />} />
          <Route path="/admin/categories" element={<AdminCategoriesPage />} />
          <Route path="/admin/resources" element={<AdminResourcesManagementPage />} />
          <Route path="/admin/resources/new" element={<AdminResourceEditorPage />} />
          <Route path="/admin/resources/:id" element={<AdminResourceEditorPage />} />
          <Route path="/admin/career-paths" element={<AdminCareerPathsManagementPage />} />
          <Route path="/admin/career-paths/new" element={<AdminCareerPathEditorPage />} />
          <Route path="/admin/career-paths/:pathId" element={<AdminCareerPathEditorPage />} />
          <Route path="/admin/roadmap" element={<AdminRoadmapBuilderPage />} />
          <Route path="/admin/notifications" element={<AdminNotificationsManagementPage />} />
          <Route path="/admin/registrations" element={<AdminRegistrationsManagementPage />} />
          <Route path="/admin/registrations/:userId" element={<AdminRegistrationDetailPage />} />
          <Route path="/admin/events" element={<AdminEventsManagementPage />} />
          <Route path="/admin/ai-control" element={<AdminAiControlPage />} />
          <Route path="/admin/database" element={<AdminDatabasePage />} />
          <Route path="/admin/users" element={<AdminUsersPage />} />
          <Route path="/admin/insights" element={<AdminInsightsPage />} />
          <Route path="/admin/homepage" element={<AdminHomepagePage />} />
          <Route path="/admin/competencies" element={<AdminCompetencyPage />} />
          <Route path="/trainer" element={<TrainerWorkspacePage />} />
          <Route path="/trainer/assessments/new" element={<AssessmentEditorPage />} />
          <Route path="/trainer/assessments/:assessmentId" element={<AssessmentEditorPage />} />
          <Route path="/trainer/assessments/:assessmentId/results" element={<AssessmentResultsPage />} />
          <Route path="/admin/interview-questions" element={<AdminInterviewQuestionsPage />} />
          <Route path="/admin/jobs" element={<AdminJobRecommendationsPage />} />
          <Route path="/admin/top-resumes" element={<AdminTopStudentResumesPage />} />
          <Route path="/admin/projects" element={<AdminProjectsPage />} />
          <Route path="/admin/projects/:projectId/students/:userId" element={<AdminProjectSubmissionPage />} />
          <Route path="/developer" element={<DeveloperDashboardPage />} />
          <Route path="*" element={<NotFoundPage variant="admin" />} />
        </Routes>
      </>
    )
  }

  if (hasRole(authSession, ROLES.TRAINER)) {
    return (
      <>
        {themeToggleButton}
        <AssistantChatbot />
        <Sidebar
          config={platformConfig}
          isSidebarOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
        />
        <main
          className={`${isSidebarOpen ? 'md:ml-64' : 'md:ml-0'} min-h-screen flex flex-col bg-surface transition-all duration-300`}
        >
          <Navbar
            config={platformConfig}
            isSidebarOpen={isSidebarOpen}
            onLogout={() => {
              logoutUser()
              setAuthSession(null)
            }}
            onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
          />
          <Routes>
            <Route path="/login" element={<Navigate to="/trainer" replace />} />
            <Route path="/register" element={<Navigate to="/trainer" replace />} />
            <Route path="/" element={<Navigate to="/trainer" replace />} />
            <Route path="/trainer" element={<TrainerWorkspacePage />} />
            <Route path="/trainer/assessments/new" element={<AssessmentEditorPage />} />
            <Route path="/trainer/assessments/:assessmentId" element={<AssessmentEditorPage />} />
            <Route
              path="/trainer/assessments/:assessmentId/results"
              element={<AssessmentResultsPage />}
            />
            <Route path="/library" element={<TrainerLibraryPage />} />
            <Route path="/assessments" element={<AssessmentsPage />} />
            <Route path="/assessments/:assessmentId" element={<AssessmentAttemptPage />} />
            <Route path="/my-profile" element={<ProfessionalProfilePage />} />
            <Route path="/learn" element={<CourseCatalogPage allowLabRooms={platformConfig.features.labRooms} />} />
            <Route path="/learn/course/:courseId" element={<CoursePage />} />
            <Route path="/resources" element={<ResourcesPage />} />
            <Route path="/resources/:id" element={<ResourceDetailPage />} />
            <Route path="/notes" element={<NotesPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/verify-certificate" element={<CertificateVerificationPage />} />
            <Route path="*" element={<NotFoundPage variant="admin" />} />
          </Routes>
        </main>
      </>
    )
  }

  if (authSession.role === 'developer') {
    return (
      <>
        {themeToggleButton}
        <AssistantChatbot />
        <Routes>
          <Route path="/login" element={<Navigate to="/developer" replace />} />
          <Route path="/register" element={<Navigate to="/developer" replace />} />
          <Route path="/" element={<Navigate to="/developer" replace />} />
          <Route path="/developer" element={<DeveloperDashboardPage />} />
          <Route path="*" element={<NotFoundPage variant="admin" />} />
        </Routes>
      </>
    )
  }

  return (
    <>
      {themeToggleButton}
      <AssistantChatbot />
      <Sidebar
        config={platformConfig}
        isSidebarOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />
      <main
        className={`${isSidebarOpen ? 'md:ml-64' : 'md:ml-0'} min-h-screen flex flex-col bg-surface selection:bg-primary-container selection:text-on-primary-container transition-all duration-300`}
      >
        <Navbar
          config={platformConfig}
          isSidebarOpen={isSidebarOpen}
          onLogout={() => {
            logoutUser()
            setAuthSession(null)
          }}
          onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
        />
        <Routes>
          <Route path="/verify-certificate" element={<CertificateVerificationPage />} />
          <Route path="/verify-certificate/:certificateId" element={<CertificateVerificationPage />} />
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route path="/register" element={<Navigate to="/" replace />} />
          <Route
            path="/"
            element={
              platformConfig.routes.dashboard ? (
                <DashboardPage />
              ) : (
                <Navigate to={firstEnabledRoute(platformConfig)} replace />
              )
            }
          />
          <Route
            path="/learn/paths"
            element={
              platformConfig.routes.learningPaths ? (
                <LearningPathsPage
                  allowFeaturedPath={platformConfig.features.featuredPath}
                />
              ) : (
                <Navigate to={firstEnabledRoute(platformConfig)} replace />
              )
            }
          />
          <Route
            path="/learn/path"
            element={
              platformConfig.routes.learningPaths ? (
                <LearningPathsPage
                  allowFeaturedPath={platformConfig.features.featuredPath}
                />
              ) : (
                <Navigate to={firstEnabledRoute(platformConfig)} replace />
              )
            }
          />
          <Route
            path="/learn/path/full-stack-developer"
            element={
              platformConfig.routes.learningPaths &&
              platformConfig.features.featuredPath ? (
                <LearningPathDetailPage pathId="full-stack-developer" />
              ) : (
                <Navigate to={firstEnabledRoute(platformConfig)} replace />
              )
            }
          />
          <Route
            path="/learn/path/:pathId/module/:moduleId"
            element={
              platformConfig.routes.learningPaths ? (
                <ModuleDetailPage />
              ) : (
                <Navigate to={firstEnabledRoute(platformConfig)} replace />
              )
            }
          />
          <Route
            path="/learn/path/:pathId"
            element={
              platformConfig.routes.learningPaths ? (
                <LearningPathDetailPage />
              ) : (
                <Navigate to={firstEnabledRoute(platformConfig)} replace />
              )
            }
          />
          <Route
            path="/learn"
            element={
              platformConfig.routes.practiceLabs ? (
                <CourseCatalogPage allowLabRooms={platformConfig.features.labRooms} />
              ) : (
                <Navigate to={firstEnabledRoute(platformConfig)} replace />
              )
            }
          />
          <Route
            path="/learn/course/:courseId"
            element={
              platformConfig.routes.practiceLabs &&
              platformConfig.features.labRooms ? (
                <CoursePage />
              ) : (
                <Navigate to={firstEnabledRoute(platformConfig)} replace />
              )
            }
          />
          <Route
            path="/events"
            element={
              platformConfig.routes.upcomingCtf ? (
                <EventsPage />
              ) : (
                <Navigate to={firstEnabledRoute(platformConfig)} replace />
              )
            }
          />
          <Route
            path="/resources"
            element={<ResourcesPage />}
          />
          <Route
            path="/notes"
            element={<NotesPage />}
          />
          <Route path="/assessments" element={<AssessmentsPage />} />
          <Route path="/assessments/:assessmentId" element={<AssessmentAttemptPage />} />
          <Route path="/library" element={<TrainerLibraryPage />} />
          <Route path="/my-profile" element={<ProfessionalProfilePage />} />
          <Route
            path="/jobs"
            element={<OpportunitiesPage />}
          />
          <Route
            path="/career-prep"
            element={<CareerPrepPage />}
          />
          <Route
            path="/projects"
            element={<ProjectsPage />}
          />
          <Route
            path="/projects/:projectId"
            element={<ProjectDetailPage />}
          />
          <Route
            path="/roadmap"
            element={<RoadmapPage />}
          />
          <Route
            path="/leaderboard"
            element={<LeaderboardPage />}
          />
          <Route
            path="/resources/:id"
            element={<ResourceDetailPage />}
          />
          <Route
            path="/profile"
            element={
              platformConfig.routes.profile ? (
                <ProfilePage />
              ) : (
                <Navigate to={firstEnabledRoute(platformConfig)} replace />
              )
            }
          />
          <Route
            path="/settings"
            element={
              platformConfig.routes.profile ? (
                <SettingsPage />
              ) : (
                <Navigate to={firstEnabledRoute(platformConfig)} replace />
              )
            }
          />
          <Route path="/admin" element={<Navigate to="/" replace />} />
          <Route
            path="*"
            element={<NotFoundPage config={platformConfig} variant="operator" />}
          />
        </Routes>
      </main>
    </>
  )
}

export default App
