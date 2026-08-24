import { useEffect, useState } from 'react'
import { useParams, Navigate, useNavigate } from 'react-router-dom'
import {
  getCareerPathsData,
  hydrateCareerPathsData,
} from '../data/careerPathsData'
import { getCoursesData } from '../data/coursesData'
import { apiFetch } from '../services/api'
import { parseMarkdownToHtml } from '../utils/markdown'
import { fetchPathGating } from '../services/platform'

function renderRichContent(content, htmlOverride = '') {
  if (content && String(content).trim()) {
    return parseMarkdownToHtml(content)
  }
  if (htmlOverride && String(htmlOverride).trim()) {
    return String(htmlOverride)
  }
  return '<p></p>'
}

function ModuleDetailPage() {
  const navigate = useNavigate()
  const { pathId, moduleId } = useParams()
  const [careerPaths, setCareerPaths] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [gating, setGating] = useState([])

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

  const path = careerPaths.find((item) => item.id === pathId || item.slug === pathId)
  const module = path?.modules?.find((m) => m.id === moduleId)
  useEffect(() => {
    if (!path?.id) return
    fetchPathGating(path.id).then((result) => setGating(result.modules || [])).catch(() => setGating([]))
  }, [path?.id])
  const allRooms = getCoursesData()
  const moduleOverviewSource =
    module?.content?.markdown || module?.markdown || module?.description || ''
  const moduleOverviewMarkup = renderRichContent(moduleOverviewSource, module?.content?.html || module?.html)

  // Show loading while fetching paths
  if (isLoading) {
    return (
      <main className="pt-20 px-8 pb-12 min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">⚙️</div>
          <h1 className="font-headline text-3xl font-bold mb-2">Loading Module</h1>
          <p className="text-on-surface-variant">Initializing module content...</p>
        </div>
      </main>
    )
  }

  // Redirect if path or module not found after loading
  if (!path || !module) {
    return <Navigate to="/learn/paths" replace />
  }
  const gate = gating.find((item) => String(item.id) === String(module.id))
  if (gate?.locked) {
    return <main className="min-h-screen bg-surface px-6 pt-32"><section className="mx-auto max-w-2xl rounded-3xl bg-surface-container-lowest p-8 text-center shadow-soft"><span className="material-symbols-outlined text-5xl text-primary">lock</span><h1 className="mt-4 font-headline text-2xl font-extrabold">Module locked</h1><p className="mt-3 text-sm text-on-surface-variant">Complete {gate.blockedBy.join(', ')} to unlock {module.title}.</p><button className="mt-6 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-on-primary" onClick={() => navigate(`/learn/path/${pathId}`)} type="button">Back to learning path</button></section></main>
  }

  return (
    <main className="pt-32 px-8 pb-12">
      <section className="mb-12">
        {/* Breadcrumb and header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => navigate(`/learn/path/${pathId}`)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/5 border border-primary/20 rounded-lg transition-all duration-200 hover:border-primary/40 hover:-translate-x-1"
            type="button"
          >
            <span className="material-symbols-outlined text-base">arrow_back</span>
            Back to {path.title}
          </button>
        </div>

        {/* Module Image */}
        {module.imageData && (
          <div className="mb-8 rounded-lg overflow-hidden">
            <img 
              src={module.imageData} 
              alt={module.title} 
              className="w-full h-96 object-cover"
            />
          </div>
        )}

        <div className="rounded-xl bg-surface-container-lowest p-0 relative border-l-8 border-secondary overflow-hidden">
          <div className="p-10">
            <div>
              <span className="font-headline text-xs font-bold text-secondary tracking-[2px]">
                {module.phase}
              </span>
              <h1 className="text-5xl font-extrabold font-headline tracking-tighter text-on-surface mb-4">
                {module.title}
              </h1>
              <div
                className="text-on-surface-variant max-w-3xl leading-relaxed [&_h1]:text-3xl [&_h1]:font-extrabold [&_h1]:tracking-tight [&_h1]:mt-8 [&_h1]:mb-4 [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:tracking-tight [&_h2]:mt-7 [&_h2]:mb-3 [&_h3]:text-xl [&_h3]:font-bold [&_h3]:mt-6 [&_h3]:mb-2 [&_p]:mb-4 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:mb-4 [&_li]:mb-1.5 [&_pre]:bg-surface-container-high [&_pre]:border [&_pre]:border-outline-variant/30 [&_pre]:p-5 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:my-5 [&_code]:font-mono [&_code]:text-[0.9em] [&_code]:bg-surface-container-highest [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_a]:text-primary [&_a]:underline [&_hr]:my-6 [&_hr]:border-outline-variant/40 [&_blockquote]:border-l-4 [&_blockquote]:border-primary/40 [&_blockquote]:bg-surface-container-low [&_blockquote]:px-4 [&_blockquote]:py-3 [&_blockquote]:my-4 [&_table]:w-full [&_table]:border-collapse [&_table]:my-5 [&_th]:text-left [&_th]:text-xs [&_th]:tracking-normal [&_th]:font-headline [&_th]:bg-surface-container-high [&_th]:p-3 [&_th]:border [&_th]:border-outline-variant/30 [&_td]:p-3 [&_td]:border [&_td]:border-outline-variant/30"
                dangerouslySetInnerHTML={{ __html: moduleOverviewMarkup }}
              ></div>
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-4xl">
        <header className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-extrabold font-headline tracking-tight">
            Module Skills
          </h2>
          <div className="h-px flex-1 mx-8 bg-surface-container-highest"></div>
          <span className="text-xs font-headline text-outline">
            {module.rooms?.length || 0} Skills
          </span>
        </header>

        {module.rooms && module.rooms.length > 0 ? (
          <div className="space-y-4">
            {module.rooms.map((roomId) => {
              const room = allRooms.find((r) => r.id === roomId)
              if (!room) return null
              return (
                <div
                  key={roomId}
                  className="rounded-2xl bg-surface-container-lowest p-6 flex items-center justify-between group hover:bg-white transition-colors cursor-pointer"
                  onClick={() => navigate(`/learn/course/${room.slug}`)}
                >
                  <div className="flex items-center gap-4 flex-1">
                    <div className="rounded-xl w-12 h-12 flex items-center justify-center bg-secondary-container text-on-secondary-container">
                      <span className="material-symbols-outlined">flag</span>
                    </div>
                    <div className="flex-1">
                      <h3 className="font-bold text-lg font-headline">
                        {room.title}
                      </h3>
                      <p className="text-sm text-on-surface-variant mt-1">
                        {room.description}
                      </p>
                      <div className="flex gap-4 mt-2 flex-wrap">
                        {room.tags?.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-lg text-xs font-headline font-bold text-secondary bg-secondary/10 px-2 py-1"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="flex flex-col items-end">
                      <span className="text-[11px] font-headline text-outline mb-1">
                        Reward
                      </span>
                      <span className="text-xs font-headline font-bold text-secondary">
                        {room.xp}
                      </span>
                    </div>
                    <button
                      className="p-2 opacity-0 group-hover:opacity-100 transition-opacity"
                      type="button"
                    >
                      <span className="material-symbols-outlined text-outline">
                        arrow_forward
                      </span>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="rounded-2xl bg-surface-container-low border border-dashed border-outline-variant/30 p-12 flex items-center justify-center">
            <span className="text-xs font-headline text-outline">
              No skills assigned to this module
            </span>
          </div>
        )}
      </section>
    </main>
  )
}

export default ModuleDetailPage
