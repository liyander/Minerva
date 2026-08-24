import { useEffect, useState } from 'react'
import { useParams, Navigate, useNavigate } from 'react-router-dom'
import {
  getCareerPathsData,
  hydrateCareerPathsData,
  subscribeCareerPathsData,
} from '../data/careerPathsData'
import { getCoursesData } from '../data/coursesData'
import { apiFetch } from '../services/api'
import { downloadCertificateAsPDF, issueCertificateForPath } from '../services/certificates'
import { getLabProgressEvents, getLabProgressMap } from '../services/labProgress'

function LearningPathDetailPage({ pathId: propPathId }) {
  const navigate = useNavigate()
  const { pathId: paramPathId } = useParams()
  const pathId = propPathId || paramPathId || 'full-stack-developer'
  const [careerPaths, setCareerPaths] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [labProgressTick, setLabProgressTick] = useState(0)
  const [certificate, setCertificate] = useState(null)
  const [isCertificateLoading, setIsCertificateLoading] = useState(false)

  useEffect(() => {
    let cancelled = false

    const loadPaths = async () => {
      try {
        console.log('🌐 LearningPathDetailPage: Fetching paths...')
        const response = await apiFetch('/career-paths')
        if (!cancelled) {
          const paths = Array.isArray(response) ? response : []
          hydrateCareerPathsData(paths)
          setCareerPaths(paths)
          setIsLoading(false)
          console.log('✅ Paths loaded:', paths.length)
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
    const { updatedEvent, updatedStorageKey } = getLabProgressEvents()
    const syncProgress = () => {
      setLabProgressTick((value) => value + 1)
    }

    const handleStorage = (event) => {
      if (event.key === updatedStorageKey) {
        syncProgress()
      }
    }

    window.addEventListener(updatedEvent, syncProgress)
    window.addEventListener('storage', handleStorage)

    return () => {
      window.removeEventListener(updatedEvent, syncProgress)
      window.removeEventListener('storage', handleStorage)
    }
  }, [])

  const path = careerPaths.find((item) => item.id === pathId || item.slug === pathId)
  const allRooms = getCoursesData()
  const labProgressMap = getLabProgressMap()
  void labProgressTick

  const modules = path?.modules || []
  const moduleProgress = modules.map((module) => {
    const roomIds = Array.isArray(module.rooms) ? module.rooms : []
    const completedRooms = roomIds.filter((roomId) => Boolean(labProgressMap[roomId]?.completedAt)).length
    const totalRooms = roomIds.length
    const completionPercentage = totalRooms > 0 ? Math.round((completedRooms / totalRooms) * 100) : 0

    return {
      module,
      totalRooms,
      completedRooms,
      isComplete: totalRooms > 0 ? completedRooms === totalRooms : true,
      completionPercentage,
    }
  })

  const totalRooms = moduleProgress.reduce((sum, item) => sum + item.totalRooms, 0)
  const completedRooms = moduleProgress.reduce((sum, item) => sum + item.completedRooms, 0)
  const completionPercentage = totalRooms > 0 ? Math.round((completedRooms / totalRooms) * 100) : 0
  const nextResumeModule = moduleProgress.find((item) => !item.isComplete)?.module || modules[0] || null

  const handleResumeOperation = () => {
    if (!nextResumeModule?.id || !path?.id) {
      return
    }
    navigate(`/learn/path/${path.id}/module/${nextResumeModule.id}`)
  }

  const handleIssueCertificate = async () => {
    if (!path?.id || completionPercentage !== 100) {
      return
    }

    setIsCertificateLoading(true)
    try {
      const result = await issueCertificateForPath(path.id)
      if (result?.certificate) {
        setCertificate(result.certificate)
      }
    } catch (error) {
      console.error('Failed to issue certificate:', error)
    } finally {
      setIsCertificateLoading(false)
    }
  }

  const handleDownloadCertificate = async () => {
    if (!certificate || !path) {
      return
    }
    setIsCertificateLoading(true)
    try {
      await downloadCertificateAsPDF(certificate, path.title, path.certificateImageData)
    } catch (error) {
      console.error('Failed to download certificate:', error)
    } finally {
      setIsCertificateLoading(false)
    }
  }

  // Show loading while fetching paths
  if (isLoading) {
    return (
      <main className="pt-20 px-8 pb-12 min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">⚙️</div>
          <h1 className="font-headline text-3xl font-bold mb-2">Loading Path</h1>
          <p className="text-on-surface-variant">Initializing learning materials...</p>
        </div>
      </main>
    )
  }

  // Redirect if path not found after loading
  if (!path) {
    return <Navigate to="/learn/paths" replace />
  }

  const getModuleCount = () => modules.length
  const getTotalRooms = () => totalRooms

  return (
    <>
      <main className="pt-20 px-8 pb-12">
        <section className="mb-12">
          <div className="rounded-xl bg-surface-container-lowest p-0 relative border-l-8 border-primary overflow-hidden">
            <div className="absolute top-0 right-0 w-1/2 h-full opacity-10 pointer-events-none">
              <img
                alt="Background"
                className="w-full h-full object-cover grayscale"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuC1Jb-T93YLY8qp0Uhfa6X_1kRwy5hqD4olGgwyku1Bkd4rNgkSIMCrPSW3tvoUJJGdfBJQmCVhD_3lonZ7UR-LePeoEHmCv9aYBOQrD4N9-3cs4ox_U_9NIc00fMYWZGT4eIdwkQjSLw2hy7RMKalPSi8qHhyhEm_uaIV0ZeiO-Pq5GSlnejETZpWa77ORdZmVtOFbvcFb6ZM7ZxsOK8GrZ16WMIvWfkPysok61POdiwJm347kswkw1gkLSKSp99LnNNM_mY4Vd-g"
              />
            </div>
            <div className="relative z-10 p-10 flex flex-col md:flex-row justify-between items-start gap-8">
              <div className="max-w-2xl">
                <div className="rounded-lg inline-flex items-center gap-2 px-3 py-1 bg-primary-container text-on-primary-container font-headline text-xs tracking-[2px] mb-4">
                  <span className="material-symbols-outlined text-sm">priority_high</span>
                  Critical Learning Path
                </div>
                <h1 className="text-5xl font-extrabold font-headline tracking-tighter text-on-surface mb-4">
                  {path.title}
                </h1>
                <p className="text-on-surface-variant leading-relaxed mb-8 max-w-xl">
                  {path.description}
                </p>
                <div className="flex flex-wrap gap-8">
                  <div className="space-y-1">
                    <span className="text-xs font-headline text-outline">
                      Difficulty
                    </span>
                    <div className="flex items-center gap-2 text-primary">
                      <span className="material-symbols-outlined text-sm">bolt</span>
                      <span className="font-headline font-bold text-sm">{path.difficulty}</span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs font-headline text-outline">
                      Est. Commitment
                    </span>
                    <div className="flex items-center gap-2 text-on-surface">
                      <span className="material-symbols-outlined text-sm">schedule</span>
                      <span className="font-headline font-bold text-sm">{path.estimatedHours} Hours</span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs font-headline text-outline">
                      Enrolled Ops
                    </span>
                    <div className="flex items-center gap-2 text-on-surface">
                      <span className="material-symbols-outlined text-sm">group</span>
                      <span className="font-headline font-bold text-sm">{path.enrolledCount?.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="rounded-2xl w-full md:w-80 bg-surface-container-low p-6 border-t-2 border-primary">
                <div className="flex justify-between items-end mb-4">
                  <span className="text-xs font-headline font-bold text-on-surface">
                    Path Progress
                  </span>
                  <span className="text-2xl font-headline font-extrabold text-primary">{completionPercentage}%</span>
                </div>
                <div className="rounded-xl h-1 bg-surface-variant w-full mb-6">
                  <div className="h-full bg-primary transition-all duration-500" style={{ width: `${completionPercentage}%` }}></div>
                </div>
                <p className="text-xs font-headline text-on-surface-variant mb-3">
                  {completedRooms}/{totalRooms} Rooms Completed
                </p>
                <button className="rounded-full w-full bg-primary text-on-primary py-4 font-headline font-bold hover:opacity-90 transition-all active:scale-95" onClick={handleResumeOperation} type="button">
                  RESUME OPERATION
                </button>
              </div>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          <div className="lg:col-span-8 space-y-12">
            <header className="flex items-center justify-between">
              <h2 className="text-2xl font-extrabold font-headline tracking-tight">
                Path Syllabus
              </h2>
              <div className="h-px flex-1 mx-8 bg-surface-container-highest"></div>
              <span className="text-xs font-headline text-outline">
                {getModuleCount()} Modules - {getTotalRooms()} Rooms
              </span>
            </header>

            {path.modules && path.modules.length > 0 ? (
              <div className="space-y-8 relative before:absolute before:left-6 before:top-0 before:bottom-0 before:w-px before:bg-surface-container-highest">
                {path.modules.map((module, index) => (
                  <div key={module.id} className="relative pl-16 group cursor-pointer" onClick={() => navigate(`/learn/path/${pathId}/module/${module.id}`)}>
                    <div className="rounded-xl absolute left-3.5 top-0 w-5 h-5 bg-primary ring-4 ring-surface group-hover:scale-125 transition-transform"></div>
                    <div className="space-y-6">
                      <div className="group-hover:text-primary transition-colors">
                        <span className="text-xs font-headline font-bold text-primary tracking-[2px]">
                          {module.phase}
                        </span>
                        <h3 className="text-xl font-bold font-headline mt-1">
                          {module.title}
                        </h3>
                        {module.description && (
                          <p className="text-sm text-on-surface-variant mt-2">{module.description}</p>
                        )}
                      </div>

                      {module.rooms && module.rooms.length > 0 ? (
                        <div className="grid gap-4">
                          {module.rooms.map((roomId, roomIndex) => {
                            const room = allRooms.find((r) => r.id === roomId)
                            if (!room) return null
                            return (
                              <div key={roomId} className="rounded-2xl bg-surface-container-lowest p-6 flex items-center justify-between group hover:bg-white transition-colors">
                                <div className="flex items-center gap-4">
                                  <div className="rounded-xl w-10 h-10 flex items-center justify-center bg-primary-container text-on-primary-container">
                                    <span className="material-symbols-outlined text-sm">flag</span>
                                  </div>
                                  <div>
                                    <h4 className="font-bold text-sm font-headline">
                                      {room.title}
                                    </h4>
                                    <p className="text-xs text-on-surface-variant">
                                      {room.description}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-6">
                                  <div className="flex flex-col items-end">
                                    <span className="text-[11px] font-headline text-outline mb-1">
                                      Reward
                                    </span>
                                    <span className="text-xs font-headline font-bold text-primary">
                                      {room.xp}
                                    </span>
                                  </div>
                                  <button className="p-2 opacity-0 group-hover:opacity-100 transition-opacity" type="button">
                                    <span className="material-symbols-outlined text-outline">arrow_forward</span>
                                  </button>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      ) : (
                        <div className="rounded-2xl bg-surface-container-low border border-dashed border-outline-variant/30 p-6 flex items-center justify-center">
                          <span className="text-xs font-headline text-outline">
                            No rooms assigned to this module
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl bg-surface-container-low border border-dashed border-outline-variant/30 p-12 flex items-center justify-center text-center">
                <span className="text-xs font-headline text-outline">
                  No modules configured for this path
                </span>
              </div>
            )}
          </div>

          <aside className="lg:col-span-4 space-y-8">
            <div className="rounded-2xl bg-surface-container-low p-8 border-t-2 border-on-surface">
              <h3 className="text-sm font-extrabold font-headline tracking-[2px] mb-6 flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-lg">inventory_2</span>
                Path Resources ({path.resources?.length || 0})
              </h3>
              {path.resources && path.resources.length > 0 ? (
                <div className="space-y-6">
                  {path.resources.map((resource) => (
                    <div key={resource.id} className="group cursor-pointer">
                      <div className="flex gap-4 items-start">
                        <div className="rounded-xl w-16 h-20 bg-surface-container-highest flex-shrink-0 flex items-center justify-center">
                          <span className="material-symbols-outlined text-3xl text-outline group-hover:text-primary transition-colors">
                            description
                          </span>
                        </div>
                        <div className="space-y-1">
                          <span className="rounded-lg text-[11px] font-headline font-bold bg-primary/10 text-primary px-1.5 py-0.5">
                            {resource.type}
                          </span>
                          <h4 className="text-xs font-bold font-headline group-hover:text-primary transition-colors leading-tight">
                            {resource.title}
                          </h4>
                          {resource.url && (
                            <a className="text-xs text-primary hover:underline" href={resource.url} rel="noopener noreferrer" target="_blank">
                              View Resource
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6">
                  <p className="text-xs text-on-surface-variant">No resources available</p>
                </div>
              )}
            </div>

            <div className={`rounded-2xl bg-surface-container-low p-8 border-t-2 border-on-surface transition-opacity ${completionPercentage < 100 ? 'opacity-60' : ''}`}>
              <h3 className="text-sm font-extrabold font-headline tracking-[2px] mb-6 flex items-center gap-2">
                {completionPercentage === 100 ? (
                  <span className="material-symbols-outlined text-primary text-lg">verified</span>
                ) : (
                  <span className="material-symbols-outlined text-outline text-lg">lock</span>
                )}
                Path Certificate
              </h3>

              {completionPercentage < 100 ? (
                <div className="space-y-4 text-center">
                  <div className="flex justify-center mb-4">
                    <span className="material-symbols-outlined text-6xl text-outline/40">lock</span>
                  </div>
                  <p className="text-xs text-on-surface-variant font-headline">
                    Complete {100 - completionPercentage}% more of this path to unlock your certificate
                  </p>
                  <div className="bg-surface-container-highest/50 p-3 rounded border border-outline-variant/30 text-left">
                    <p className="text-xs text-on-surface-variant">
                      <span className="font-bold">Progress:</span> {completedRooms}/{totalRooms} rooms completed
                    </p>
                  </div>
                </div>
              ) : certificate ? (
                <div className="space-y-4">
                  <div className="bg-surface-container-highest p-4 rounded border border-primary/30">
                    <p className="text-xs text-on-surface-variant mb-2">Certificate ID</p>
                    <p className="text-sm font-bold font-headline text-primary font-mono break-all">
                      {certificate.certificateId}
                    </p>
                  </div>
                  <button
                    className="rounded-full w-full bg-primary text-on-primary py-3 font-headline text-sm font-bold hover:opacity-90 transition-all active:scale-95 disabled:opacity-50"
                    onClick={handleDownloadCertificate}
                    type="button"
                  >
                    Download Certificate
                  </button>
                  {certificate.verificationUrl && (
                    <p className="text-xs text-on-surface-variant text-center">
                      Share the verification link to prove your completion
                    </p>
                  )}
                </div>
              ) : (
                <button
                  className="rounded-full w-full bg-primary text-on-primary py-3 font-headline text-sm font-bold hover:opacity-90 transition-all active:scale-95 disabled:opacity-50"
                  onClick={handleIssueCertificate}
                  disabled={isCertificateLoading}
                  type="button"
                >
                  {isCertificateLoading ? 'Issuing...' : 'Issue Certificate'}
                </button>
              )}
            </div>
          </aside>
        </div>
      </main>
    </>
  )
}

export default LearningPathDetailPage
