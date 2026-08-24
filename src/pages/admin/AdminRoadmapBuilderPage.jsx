import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getCareerPathsData, hydrateCareerPathsData } from '../../data/careerPathsData'
import { apiFetch } from '../../services/api'

function clonePaths(paths) {
  return paths.map((path) => ({
    ...path,
    modules: (path.modules || []).map((module) => ({ ...module, rooms: [...(module.rooms || [])] })),
    resources: [...(path.resources || [])],
  }))
}

function sortPathsByRoadmapOrder(paths) {
  return [...paths].sort((a, b) =>
    (a.roadmapSortOrder ?? 0) - (b.roadmapSortOrder ?? 0)
    || String(a.title || '').localeCompare(String(b.title || '')),
  )
}

const INTRO_PATH_PATTERN = /(?:introduction|intro|getting[-_\s]+started)[-_\s]*(?:to)?[-_\s]*(?:programming|coding|development|design|data)?|foundations?[-_\s]+101/

function isIntroPath(path) {
  const text = `${path?.title || ''} ${path?.slug || ''} ${path?.id || ''}`.toLowerCase()
  return INTRO_PATH_PATTERN.test(text)
}

function normalizePhase(index) {
  return `Module ${String(index + 1).padStart(2, '0')}`
}

function buildSlug(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function getBranchIcon(path) {
  const value = `${path.title || ''} ${path.description || ''}`.toLowerCase()
  if (/web|exploit|pen|red/.test(value)) return 'bug_report'
  if (/forensic|incident|soc|defen/.test(value)) return 'travel_explore'
  if (/binary|reverse|buffer|pwn/.test(value)) return 'memory'
  if (/ai|model|machine/.test(value)) return 'psychology'
  if (/cloud|engineer|devsec/.test(value)) return 'hub'
  return path.icon || 'route'
}

function AdminRoadmapBuilderPage() {
  const navigate = useNavigate()
  const [paths, setPaths] = useState(() => clonePaths(sortPathsByRoadmapOrder(getCareerPathsData())))
  const [draggedModule, setDraggedModule] = useState(null)
  const [activeBranchId, setActiveBranchId] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [removedModules, setRemovedModules] = useState([])
  const [newBranchForm, setNewBranchForm] = useState({
    title: '',
    description: '',
    learningPathLevel: 'Beginner',
  })

  useEffect(() => {
    let cancelled = false

    async function loadPaths() {
      setIsLoading(true)
      try {
        const data = await apiFetch('/career-paths')
        const nextPaths = Array.isArray(data) ? data : []
        hydrateCareerPathsData(nextPaths)
        if (!cancelled) {
          setPaths(clonePaths(sortPathsByRoadmapOrder(nextPaths)))
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error?.message || 'Unable to load roadmap branches. Using local cached data.')
          setPaths(clonePaths(sortPathsByRoadmapOrder(getCareerPathsData())))
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

  const modulePool = useMemo(
    () => [
      ...paths.flatMap((path) =>
        (path.modules || []).map((module, index) => ({
          ...module,
          sourcePathId: path.id,
          sourcePathTitle: path.title,
          sourceIndex: index,
        })),
      ),
      ...removedModules.map((module) => ({
        ...module,
        sourcePathTitle: 'Detached from roadmap',
      })),
    ],
    [paths, removedModules],
  )

  const foundationPath = useMemo(() => paths.find(isIntroPath) || null, [paths])
  const branchPaths = useMemo(
    () => (foundationPath ? paths.filter((path) => path.id !== foundationPath.id) : paths),
    [foundationPath, paths],
  )
  const totalModules = modulePool.length
  const branchGridColumns = `repeat(${Math.max(branchPaths.length, 1)}, minmax(17rem, 1fr))`

  const handleDragStart = (event, module) => {
    const payload = {
      moduleId: module.id,
      sourcePathId: module.sourcePathId,
      module,
    }
    setDraggedModule(payload)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('application/json', JSON.stringify(payload))
  }

  const readDragPayload = (event) => {
    if (draggedModule) return draggedModule
    try {
      return JSON.parse(event.dataTransfer.getData('application/json'))
    } catch {
      return null
    }
  }

  const moveModuleToBranch = (targetPathId, event) => {
    event.preventDefault()
    const payload = readDragPayload(event)
    setActiveBranchId('')
    setDraggedModule(null)
    if (!payload?.moduleId || !targetPathId) return

    setPaths((currentPaths) => {
      const nextPaths = clonePaths(currentPaths)
      const sourcePath = nextPaths.find((path) => path.id === payload.sourcePathId)
      const fallbackPath = nextPaths.find((path) => (path.modules || []).some((module) => module.id === payload.moduleId))
      const moduleSource = sourcePath || fallbackPath
      const movingModule = moduleSource?.modules?.find((module) => module.id === payload.moduleId) || payload.module
      if (!movingModule) return currentPaths

      nextPaths.forEach((path) => {
        path.modules = (path.modules || []).filter((module) => module.id !== payload.moduleId)
      })

      const targetPath = nextPaths.find((path) => path.id === targetPathId)
      if (!targetPath) return currentPaths

      targetPath.modules = [
        ...(targetPath.modules || []),
        {
          ...movingModule,
          phase: movingModule.phase || normalizePhase(targetPath.modules?.length || 0),
        },
      ].map((module, index) => ({
        ...module,
        phase: module.phase || normalizePhase(index),
      }))

      return nextPaths
    })
    setRemovedModules((current) => current.filter((module) => module.id !== payload.moduleId))

    setMessage('Roadmap layout updated. Save changes to publish the branch assignment.')
    window.setTimeout(() => setMessage(''), 2400)
  }

  const moveModuleWithinBranch = (pathId, moduleId, direction) => {
    setPaths((currentPaths) => clonePaths(currentPaths).map((path) => {
      if (path.id !== pathId) return path

      const modules = [...(path.modules || [])]
      const currentIndex = modules.findIndex((module) => module.id === moduleId)
      const nextIndex = currentIndex + direction
      if (currentIndex < 0 || nextIndex < 0 || nextIndex >= modules.length) return path

      const [module] = modules.splice(currentIndex, 1)
      modules.splice(nextIndex, 0, module)

      return {
        ...path,
        modules: modules.map((item, index) => ({
          ...item,
          phase: normalizePhase(index),
        })),
      }
    }))
    setMessage('Module order updated. Save changes to publish the new sequence.')
    window.setTimeout(() => setMessage(''), 2400)
  }

  const updateModuleLinkedPath = (pathId, moduleId, linkedPathId) => {
    setPaths((currentPaths) => clonePaths(currentPaths).map((path) => {
      if (path.id !== pathId) return path

      return {
        ...path,
        modules: (path.modules || []).map((module) => (
          module.id === moduleId
            ? { ...module, linkedPathId }
            : module
        )),
      }
    }))
    setMessage(linkedPathId ? 'Module link updated. Save changes to publish.' : 'Module link removed. Save changes to publish.')
    window.setTimeout(() => setMessage(''), 2400)
  }

  const removeModuleFromBranch = (pathId, module) => {
    const moduleId = module?.id
    if (!moduleId) return
    setPaths((currentPaths) => clonePaths(currentPaths).map((path) => {
      if (path.id !== pathId) return path

      return {
        ...path,
        modules: (path.modules || [])
          .filter((module) => module.id !== moduleId)
          .map((module, index) => ({
            ...module,
            phase: normalizePhase(index),
          })),
      }
    }))
    setRemovedModules((current) => {
      if (current.some((item) => item.id === moduleId)) return current
      return [
        ...current,
        {
          ...module,
          sourcePathId: pathId,
          sourceIndex: null,
        },
      ]
    })
    setMessage('Module removed from this roadmap path only. Save changes to publish.')
    window.setTimeout(() => setMessage(''), 2400)
  }

  const addBranch = () => {
    const title = newBranchForm.title.trim()
    if (!title) {
      setErrorMessage('Branch title is required.')
      return
    }

    const baseSlug = buildSlug(title)
    if (!baseSlug) {
      setErrorMessage('Branch title must contain letters or numbers.')
      return
    }

    const existingIds = new Set(paths.map((path) => path.id))
    let slug = baseSlug
    let suffix = 2
    while (existingIds.has(slug)) {
      slug = `${baseSlug}-${suffix}`
      suffix += 1
    }

    setPaths((currentPaths) => [
      ...clonePaths(currentPaths),
      {
        id: slug,
        slug,
        title,
        description: newBranchForm.description.trim() || `Roadmap branch for ${title}.`,
        icon: 'account_tree',
        learningPathLevel: newBranchForm.learningPathLevel || 'Beginner',
        difficulty: newBranchForm.learningPathLevel || 'Beginner',
        estimatedHours: 0,
        enrolledCount: 0,
        mastery: 0,
        color: 'secondary',
        certificateImageData: null,
        modules: [],
        resources: [],
        isNewRoadmapBranch: true,
      },
    ])
    setNewBranchForm({ title: '', description: '', learningPathLevel: 'Beginner' })
    setErrorMessage('')
    setMessage('New roadmap branch added. Drop modules into it, then publish.')
    window.setTimeout(() => setMessage(''), 2400)
  }

  const saveRoadmap = async () => {
    setIsSaving(true)
    setErrorMessage('')
    setMessage('')
    try {
      const savedPaths = []
      for (let index = 0; index < paths.length; index += 1) {
        const path = paths[index]
        const normalized = {
          ...path,
          isNewRoadmapBranch: undefined,
          roadmapSortOrder: index,
          modules: (path.modules || []).map((module, index) => ({
            ...module,
            phase: normalizePhase(index),
          })),
        }
        const saved = await apiFetch(path.isNewRoadmapBranch ? '/career-paths' : `/career-paths/${path.id}`, {
          method: path.isNewRoadmapBranch ? 'POST' : 'PUT',
          body: JSON.stringify(normalized),
        })
        savedPaths.push(saved)
      }
      hydrateCareerPathsData(savedPaths)
      setPaths(clonePaths(savedPaths))
      setMessage('Roadmap published successfully.')
    } catch (error) {
      setErrorMessage(error?.message || 'Unable to save roadmap.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <main className="min-h-screen bg-surface px-6 py-10 text-on-surface md:px-10">
      <section className="mx-auto max-w-[104rem]">
        <button
          className="rounded-xl mb-8 bg-surface-container-high px-5 py-3 font-headline text-xs font-bold text-on-surface hover:bg-surface-container-highest"
          onClick={() => navigate('/admin')}
          type="button"
        >
          Back
        </button>

        <header className="rounded-2xl shadow-soft bg-surface-container-lowest p-8 md:p-10">
          <p className="font-headline text-xs font-bold text-secondary">
            Roadmap Control
          </p>
          <div className="mt-3 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="font-headline text-4xl font-extrabold tracking-tight text-on-background md:text-5xl">
                Roadmap Wireframe Builder
              </h1>
              <p className="mt-4 max-w-3xl text-sm leading-relaxed text-on-surface-variant">
                Drag modules into the main branch where they should appear. The public roadmap will use these
                career path branches and module assignments after publishing.
              </p>
            </div>
            <button
              className="rounded-full bg-primary px-6 py-3 font-headline text-xs font-extrabold text-on-primary disabled:opacity-60"
              disabled={isSaving || isLoading}
              onClick={saveRoadmap}
              type="button"
            >
              {isSaving ? 'Publishing...' : 'Publish Roadmap'}
            </button>
          </div>
        </header>

        {message ? (
          <div className="rounded-2xl mt-6 shadow-soft bg-secondary/10 p-4 font-headline text-xs font-bold text-secondary">
            {message}
          </div>
        ) : null}
        {errorMessage ? (
          <div className="rounded-2xl mt-6 shadow-soft bg-error/10 p-4 font-headline text-xs font-bold text-error">
            {errorMessage}
          </div>
        ) : null}

        <section className="rounded-2xl mt-8 border border-outline-variant/50 bg-surface-container-lowest p-5 md:p-8">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-2xl">
              <p className="font-headline text-xs font-bold text-primary">
                Add Main Branch
              </p>
              <h2 className="mt-2 font-headline text-2xl font-extrabold tracking-tight text-on-background">
                Create Separate Roadmap Path
              </h2>
              <p className="mt-2 text-sm text-on-surface-variant">
                Create a new branch from Getting Started, then drag modules under it or reorder them inside the branch.
              </p>
            </div>
            <div className="grid flex-1 gap-4 md:grid-cols-[1fr_1fr_12rem_auto]">
              <label className="block">
                <span className="font-headline text-xs font-bold text-on-surface-variant">
                  Path Name
                </span>
                <input
                  className="rounded-xl mt-2 w-full border border-outline-variant bg-surface px-4 py-3 text-sm text-on-surface outline-none focus:border-primary"
                  onChange={(event) => setNewBranchForm((current) => ({ ...current, title: event.target.value }))}
                  placeholder="Cloud Security"
                  type="text"
                  value={newBranchForm.title}
                />
              </label>
              <label className="block">
                <span className="font-headline text-xs font-bold text-on-surface-variant">
                  Description
                </span>
                <input
                  className="rounded-xl mt-2 w-full border border-outline-variant bg-surface px-4 py-3 text-sm text-on-surface outline-none focus:border-primary"
                  onChange={(event) => setNewBranchForm((current) => ({ ...current, description: event.target.value }))}
                  placeholder="Branch objective"
                  type="text"
                  value={newBranchForm.description}
                />
              </label>
              <label className="block">
                <span className="font-headline text-xs font-bold text-on-surface-variant">
                  Level
                </span>
                <select
                  className="rounded-xl mt-2 w-full border border-outline-variant bg-surface px-4 py-3 text-sm text-on-surface outline-none focus:border-primary"
                  onChange={(event) => setNewBranchForm((current) => ({ ...current, learningPathLevel: event.target.value }))}
                  value={newBranchForm.learningPathLevel}
                >
                  <option>Beginner</option>
                  <option>Intermediate</option>
                  <option>Advanced</option>
                  <option>Expert</option>
                </select>
              </label>
              <button
                className="rounded-full self-end bg-secondary px-5 py-3 font-headline text-xs font-extrabold text-on-secondary"
                onClick={addBranch}
                type="button"
              >
                Add Path
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-2xl mt-8 border border-outline-variant/50 bg-surface-container-lowest p-5 md:p-8">
          <div className="mb-6 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="font-headline text-xs font-bold text-primary">
                Wireframe Area
              </p>
              <h2 className="mt-2 font-headline text-2xl font-extrabold tracking-tight text-on-background">
                Getting Started Branch Map
              </h2>
            </div>
            <p className="font-headline text-xs font-bold text-on-surface-variant">
              {paths.length} branches / {totalModules} modules
            </p>
          </div>

          <div className="relative overflow-x-auto pb-4">
            <div className="min-w-[1100px]" style={{ minWidth: `${Math.max(branchPaths.length, 4) * 18}rem` }}>
              {foundationPath ? (
                <section
                  className={`rounded-2xl mx-auto max-w-3xl border bg-surface p-5 shadow-[0_0_24px_rgba(102,217,239,0.10)] ${
                    activeBranchId === foundationPath.id ? 'border-secondary bg-secondary/10' : 'border-secondary/70'
                  }`}
                  onDragLeave={() => setActiveBranchId('')}
                  onDragOver={(event) => {
                    event.preventDefault()
                    setActiveBranchId(foundationPath.id)
                  }}
                  onDrop={(event) => moveModuleToBranch(foundationPath.id, event)}
                >
                  <div className="text-center">
                    <p className="font-headline text-xs font-bold text-secondary">
                      Foundation Entry
                    </p>
                    <h3 className="mt-2 font-headline text-2xl font-extrabold tracking-tight text-on-background">
                      {foundationPath.title}
                    </h3>
                    <p className="mx-auto mt-2 max-w-xl text-sm text-on-surface-variant">
                      {foundationPath.description || 'Every branch starts here. Drop modules into the branch where they belong.'}
                    </p>
                  </div>
                  <div className="mt-5 grid gap-3 md:grid-cols-2">
                    {(foundationPath.modules || []).length ? foundationPath.modules.map((module, index) => (
                      <article
                        className="rounded-2xl cursor-grab border border-outline-variant/50 bg-surface-container-lowest p-4 shadow-sm active:cursor-grabbing"
                        draggable
                        key={`${foundationPath.id}-${module.id}`}
                        onDragStart={(event) => handleDragStart(event, { ...module, sourcePathId: foundationPath.id })}
                      >
                        <div className="flex items-start gap-3">
                          <span className="material-symbols-outlined text-secondary">
                            drag_indicator
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="font-headline text-xs font-bold text-on-surface-variant">
                              {module.phase || normalizePhase(index)} / {(module.rooms || []).length} rooms
                            </p>
                            <h4 className="mt-1 line-clamp-2 font-headline text-sm font-extrabold text-on-background">
                              {module.title}
                            </h4>
                            <p className="mt-1 line-clamp-2 text-xs text-on-surface-variant">
                              {module.description || 'No description supplied.'}
                            </p>
                            <label className="mt-3 block" onMouseDown={(event) => event.stopPropagation()}>
                              <span className="font-headline text-xs font-bold text-secondary">
                                Linked sub-path
                              </span>
                              <select
                                className="rounded-lg mt-1 w-full border border-outline-variant bg-surface px-3 py-2 text-xs text-on-surface outline-none focus:border-secondary"
                                onChange={(event) => updateModuleLinkedPath(foundationPath.id, module.id, event.target.value)}
                                onClick={(event) => event.stopPropagation()}
                                value={module.linkedPathId || ''}
                              >
                                <option value="">No linked path</option>
                                {paths
                                  .filter((targetPath) => targetPath.id !== foundationPath.id)
                                  .map((targetPath) => (
                                    <option key={`${module.id}-${targetPath.id}`} value={targetPath.id}>
                                      {targetPath.title}
                                    </option>
                                  ))}
                              </select>
                            </label>
                          </div>
                          <div className="flex shrink-0 flex-col gap-2">
                            <button
                              aria-label={`Move ${module.title} up`}
                              className="rounded-xl grid h-8 w-8 place-items-center border border-outline-variant bg-surface text-on-surface disabled:cursor-not-allowed disabled:opacity-35"
                              disabled={index === 0}
                              onClick={() => moveModuleWithinBranch(foundationPath.id, module.id, -1)}
                              type="button"
                            >
                              <span className="material-symbols-outlined text-base">keyboard_arrow_up</span>
                            </button>
                            <button
                              aria-label={`Move ${module.title} down`}
                              className="rounded-xl grid h-8 w-8 place-items-center border border-outline-variant bg-surface text-on-surface disabled:cursor-not-allowed disabled:opacity-35"
                              disabled={index === (foundationPath.modules || []).length - 1}
                              onClick={() => moveModuleWithinBranch(foundationPath.id, module.id, 1)}
                              type="button"
                            >
                              <span className="material-symbols-outlined text-base">keyboard_arrow_down</span>
                            </button>
                            <button
                              aria-label={`Remove ${module.title} from roadmap path`}
                              className="rounded-xl grid h-8 w-8 place-items-center border border-error/50 bg-error/10 text-error hover:bg-error/20"
                              onClick={() => removeModuleFromBranch(foundationPath.id, module)}
                              title="Remove from this roadmap path only"
                              type="button"
                            >
                              <span className="material-symbols-outlined text-base">playlist_remove</span>
                            </button>
                          </div>
                        </div>
                      </article>
                    )) : (
                      <div className="border border-dashed border-outline-variant/60 p-5 text-center text-sm text-on-surface-variant md:col-span-2">
                        Drop foundation modules here.
                      </div>
                    )}
                  </div>
                </section>
              ) : (
                <div className="rounded-2xl mx-auto max-w-2xl border border-secondary/70 bg-surface p-5 text-center shadow-[0_0_24px_rgba(102,217,239,0.10)]">
                  <p className="font-headline text-xs font-bold text-secondary">
                    Foundation Entry
                  </p>
                  <h3 className="mt-2 font-headline text-2xl font-extrabold tracking-tight text-on-background">
                    Getting Started
                  </h3>
                  <p className="mt-2 text-sm text-on-surface-variant">
                    Create an Getting Started branch to make this node dynamic.
                  </p>
                </div>
              )}
              <div className="relative mx-auto h-20 max-w-[94rem]">
                <div className="absolute left-1/2 top-0 h-full w-[3px] -translate-x-1/2 bg-secondary/70"></div>
                <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-secondary/60"></div>
              </div>

              <div className="grid gap-6" style={{ gridTemplateColumns: branchGridColumns }}>
                {branchPaths.map((path) => (
                  <section
                    className={`rounded-2xl relative min-h-[28rem] border bg-surface p-4 transition-colors ${
                      activeBranchId === path.id
                        ? 'border-secondary bg-secondary/10'
                        : 'border-outline-variant/60'
                    }`}
                    key={path.id}
                    onDragLeave={() => setActiveBranchId('')}
                    onDragOver={(event) => {
                      event.preventDefault()
                      setActiveBranchId(path.id)
                    }}
                    onDrop={(event) => moveModuleToBranch(path.id, event)}
                  >
                    <div className="rounded-xl absolute left-1/2 top-0 h-8 w-[3px] -translate-x-1/2 -translate-y-full bg-secondary/60"></div>
                    <div className="rounded-2xl flex min-h-32 flex-col items-center justify-center border border-outline-variant/50 bg-surface-container-lowest p-4 text-center">
                      <span className="material-symbols-outlined text-3xl text-secondary">
                        {getBranchIcon(path)}
                      </span>
                      <p className="mt-3 font-headline text-xs font-bold text-primary">
                        Main Branch
                      </p>
                      <h3 className="mt-2 line-clamp-2 font-headline text-lg font-extrabold text-on-background">
                        {path.title}
                      </h3>
                    </div>

                    <div className="mt-5 space-y-3">
                      {(path.modules || []).length ? path.modules.map((module, index) => (
                        <article
                          className="rounded-2xl cursor-grab border border-outline-variant/50 bg-surface-container-lowest p-4 shadow-sm active:cursor-grabbing"
                          draggable
                          key={`${path.id}-${module.id}`}
                          onDragStart={(event) => handleDragStart(event, { ...module, sourcePathId: path.id })}
                        >
                          <div className="flex items-start gap-3">
                            <span className="material-symbols-outlined text-primary">
                              drag_indicator
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="font-headline text-xs font-bold text-on-surface-variant">
                                {module.phase || normalizePhase(index)} / {(module.rooms || []).length} rooms
                              </p>
                              <h4 className="mt-1 line-clamp-2 font-headline text-sm font-extrabold text-on-background">
                                {module.title}
                              </h4>
                              <p className="mt-1 line-clamp-2 text-xs text-on-surface-variant">
                                {module.description || 'No description supplied.'}
                              </p>
                              <label className="mt-3 block" onMouseDown={(event) => event.stopPropagation()}>
                                <span className="font-headline text-xs font-bold text-secondary">
                                  Linked sub-path
                                </span>
                                <select
                                  className="rounded-lg mt-1 w-full border border-outline-variant bg-surface px-3 py-2 text-xs text-on-surface outline-none focus:border-secondary"
                                  onChange={(event) => updateModuleLinkedPath(path.id, module.id, event.target.value)}
                                  onClick={(event) => event.stopPropagation()}
                                  value={module.linkedPathId || ''}
                                >
                                  <option value="">No linked path</option>
                                  {paths
                                    .filter((targetPath) => targetPath.id !== path.id)
                                    .map((targetPath) => (
                                      <option key={`${module.id}-${targetPath.id}`} value={targetPath.id}>
                                        {targetPath.title}
                                      </option>
                                    ))}
                                </select>
                              </label>
                            </div>
                            <div className="flex shrink-0 flex-col gap-2">
                              <button
                                aria-label={`Move ${module.title} up`}
                                className="rounded-xl grid h-8 w-8 place-items-center border border-outline-variant bg-surface text-on-surface disabled:cursor-not-allowed disabled:opacity-35"
                                disabled={index === 0}
                                onClick={() => moveModuleWithinBranch(path.id, module.id, -1)}
                                type="button"
                              >
                                <span className="material-symbols-outlined text-base">keyboard_arrow_up</span>
                              </button>
                              <button
                                aria-label={`Move ${module.title} down`}
                                className="rounded-xl grid h-8 w-8 place-items-center border border-outline-variant bg-surface text-on-surface disabled:cursor-not-allowed disabled:opacity-35"
                                disabled={index === (path.modules || []).length - 1}
                                onClick={() => moveModuleWithinBranch(path.id, module.id, 1)}
                                type="button"
                              >
                                <span className="material-symbols-outlined text-base">keyboard_arrow_down</span>
                              </button>
                              <button
                                aria-label={`Remove ${module.title} from roadmap path`}
                                className="rounded-xl grid h-8 w-8 place-items-center border border-error/50 bg-error/10 text-error hover:bg-error/20"
                                onClick={() => removeModuleFromBranch(path.id, module)}
                                type="button"
                                title="Remove from this roadmap path only"
                              >
                                <span className="material-symbols-outlined text-base">playlist_remove</span>
                              </button>
                            </div>
                          </div>
                        </article>
                      )) : (
                        <div className="border border-dashed border-outline-variant/60 p-5 text-center text-sm text-on-surface-variant">
                          Drop modules here.
                        </div>
                      )}
                    </div>
                  </section>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-2xl mt-8 border border-outline-variant/50 bg-surface-container-lowest p-5 md:p-8">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="font-headline text-xs font-bold text-primary">
                Module Pool
              </p>
              <h2 className="mt-2 font-headline text-2xl font-extrabold tracking-tight text-on-background">
                All Modules
              </h2>
            </div>
            <Link
              className="font-headline text-xs font-bold text-secondary underline-offset-4 hover:underline"
              to="/admin/career-paths"
            >
              Manage branches
            </Link>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {modulePool.map((module) => (
              <article
                className="rounded-2xl cursor-grab border border-outline-variant/50 bg-surface p-4 active:cursor-grabbing"
                draggable
                key={`pool-${module.sourcePathId}-${module.id}`}
                onDragStart={(event) => handleDragStart(event, module)}
              >
                <p className="font-headline text-xs font-bold text-primary">
                  {module.sourcePathTitle}
                </p>
                <h3 className="mt-2 font-headline text-base font-extrabold text-on-background">
                  {module.title}
                </h3>
                <p className="mt-2 line-clamp-2 text-xs text-on-surface-variant">
                  {module.description || 'No description supplied.'}
                </p>
              </article>
            ))}
            {!modulePool.length && !isLoading ? (
              <div className="border border-dashed border-outline-variant/60 p-6 text-center text-sm text-on-surface-variant">
                No modules found. Create modules in Career Paths first.
              </div>
            ) : null}
          </div>
        </section>
      </section>
    </main>
  )
}

export default AdminRoadmapBuilderPage
