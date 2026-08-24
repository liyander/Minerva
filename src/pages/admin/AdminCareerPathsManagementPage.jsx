import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getCareerPathsData,
  hydrateCareerPathsData,
  deleteCareerPath,
} from '../../data/careerPathsData'
import { apiFetch } from '../../services/api'
import { ConfirmModal } from '../../components/ConfirmModal'

function AdminCareerPathsManagementPage() {
  const navigate = useNavigate()
  const [paths, setPaths] = useState([])
  const [searchTerm, setSearchTerm] = useState('')

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [pathToDelete, setPathToDelete] = useState(null)

  const handleDeletePath = (e, id) => {
    e.stopPropagation()
    setPathToDelete(id)
    setIsModalOpen(true)
  }

  const handleConfirmDelete = () => {
    if (pathToDelete) {
      deleteCareerPath(pathToDelete)
      setPaths(paths.filter(p => p.id !== pathToDelete))
      setPathToDelete(null)
    }
    setIsModalOpen(false)
  }

  const handleCancelDelete = () => {
    setPathToDelete(null)
    setIsModalOpen(false)
  }

  useEffect(() => {
    let cancelled = false

    const loadPaths = async () => {
      try {
        console.log('🌐 Admin: Fetching career paths...')
        const response = await apiFetch('/career-paths')
        if (!cancelled) {
          const pathsData = Array.isArray(response) ? response : []
          hydrateCareerPathsData(pathsData)
          setPaths(pathsData)
          console.log('✅ Admin paths loaded:', pathsData.length)
        }
      } catch (error) {
        console.error('Failed to load admin career paths:', error)
        if (!cancelled) {
          setPaths(getCareerPathsData())
        }
      }
    }

    void loadPaths()

    return () => {
      cancelled = true
    }
  }, [])

  const filteredPaths = paths.filter((path) =>
    (path.title || '').toLowerCase().includes(searchTerm.toLowerCase())
  )

  const getDifficultyColor = (difficulty) => {
    switch (difficulty) {
      case 'Basic':
      case 'Beginner':
        return 'bg-emerald-500/20 text-emerald-600'
      case 'Intermediate':
        return 'bg-amber-500/20 text-amber-600'
      case 'Expert':
        return 'bg-error/20 text-error'
      case 'Critical':
        return 'bg-error/20 text-error'
      case 'Advanced':
        return 'bg-error/20 text-error'
      default:
        return 'bg-primary/20 text-primary'
    }
  }

  return (
    <main className="min-h-screen bg-surface px-6 md:px-10 py-10">
      <section className="max-w-6xl mx-auto">
        <header className="rounded-2xl bg-surface-container-lowest shadow-soft p-8 md:p-10 mb-8">
          <div className="flex items-center gap-4 mb-4">
            <button
              className="text-secondary hover:text-on-surface transition-colors"
              onClick={() => navigate('/admin')}
              type="button"
            >
              <span className="material-symbols-outlined">arrow_back</span>
            </button>
            <span className="font-headline text-xs text-secondary font-bold">
              Content Management
            </span>
          </div>
          <h1 className="font-headline text-4xl md:text-5xl font-extrabold tracking-tight">
            Manage Career Paths
          </h1>
          <p className="text-sm text-on-surface-variant mt-4 max-w-2xl">
            Configure learning paths and career specializations. Click on any path to edit modules, resources, and metadata.
          </p>
          <div className="mt-6">
            <button
              className="rounded-full bg-secondary text-on-secondary px-5 py-2.5 font-headline text-sm font-bold"
              onClick={() => navigate('/admin/career-paths/new')}
              type="button"
            >
              Add Career Path
            </button>
          </div>
        </header>

        <div className="mb-6">
          <input
            className="rounded-xl w-full bg-surface-container-lowest  border-t-0 border-r-0 border-b-0 focus:ring-0 font-body text-sm py-3 px-4 outline-none"
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search career paths..."
            type="text"
            value={searchTerm}
          />
        </div>

        <div className="grid grid-cols-1 gap-4">
          {filteredPaths.map((path) => (
            <div
              className="rounded-2xl bg-surface-container-lowest p-6 hover:bg-surface-container-high transition-colors text-left shadow-soft/30 hover:border-secondary flex items-start justify-between cursor-pointer"
              key={path.id}
              onClick={() => navigate(`/admin/career-paths/${path.id}`)}
            >
              <div className="flex-1">
                <div className="flex flex-wrap gap-2 mb-3">
                  <span
                    className={`px-2 py-1 font-headline text-xs font-bold rounded ${getDifficultyColor(path.difficulty)}`}
                  >
                    {path.learningPathLevel || path.difficulty || 'N/A'}
                  </span>
                  <span className="bg-secondary-container text-on-secondary-container px-2 py-1 font-headline text-sm font-bold rounded flex items-center gap-1">
                    <span className="material-symbols-outlined text-xs">{path.icon}</span>
                    {path.modules.length} Module{path.modules.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <h3 className="font-headline text-lg font-bold mb-2">{path.title}</h3>
                <p className="text-sm text-on-surface-variant max-w-2xl line-clamp-2">
                  {path.description}
                </p>
                <div className="flex gap-6 mt-4 text-xs text-on-surface-variant">
                  <span className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm">schedule</span>
                    {path.estimatedHours}h
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm">group</span>
                    {path.enrolledCount?.toLocaleString()} enrolled
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm">bookmark</span>
                    {path.resources.length} resources
                  </span>
                </div>
              </div>
              <div className="flex flex-col flex-shrink-0 ml-4 items-end gap-2">
                <span className="material-symbols-outlined text-on-surface-variant mt-1">
                  chevron_right
                </span>
                <button
                  className="mt-2 text-error hover:bg-error/10 p-2 rounded-lg transition-colors flex items-center justify-center"
                  onClick={(e) => handleDeletePath(e, path.id)}
                  type="button"
                  title="Delete Career Path"
                >
                  <span className="material-symbols-outlined">delete</span>
                </button>
              </div>
            </div>
          ))}

          {filteredPaths.length === 0 && (
            <div className="rounded-2xl bg-surface-container-lowest p-12 text-center">
              <p className="text-on-surface-variant">No career paths found matching your search.</p>
            </div>
          )}
        </div>
      </section>

      <ConfirmModal
        isOpen={isModalOpen}
        title="Delete Career Path"
        message="Are you sure you want to delete this career path? This destructive move cannot be reverted and will delete all associated modules and progression hooks."
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
      />
    </main>
  )
}

export default AdminCareerPathsManagementPage
