import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getResourcesData, subscribeResourcesData, deleteResource } from '../../data/resourcesData'
import { ConfirmModal } from '../../components/ConfirmModal'

function AdminResourcesManagementPage() {
  const navigate = useNavigate()
  const [cves, setCves] = useState(getResourcesData())
  const [searchTerm, setSearchTerm] = useState('')

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [cveToDelete, setCveToDelete] = useState(null)

  useEffect(() => {
    return subscribeResourcesData(() => {
      setCves(getResourcesData())
    })
  }, [])

  const handleDeleteClick = (e, id) => {
    e.stopPropagation()
    setCveToDelete(id)
    setIsModalOpen(true)
  }

  const handleConfirmDelete = () => {
    if (cveToDelete) {
      deleteResource(cveToDelete)
      setCves(cves.filter(c => c.id !== cveToDelete))
      setCveToDelete(null)
    }
    setIsModalOpen(false)
  }

  const handleCancelDelete = () => {
    setCveToDelete(null)
    setIsModalOpen(false)
  }

  const filteredCves = cves.filter(
    (cve) =>
      (cve.cve_id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (cve.short_description || '').toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <main className="min-h-screen bg-surface px-6 md:px-10 py-10">
      <section className="max-w-6xl mx-auto">
        <header className="rounded-2xl bg-surface-container-lowest shadow-soft p-8 md:p-10 mb-8">
          <div className="flex items-center gap-4 mb-4">
            <button
              className="text-primary hover:text-on-surface transition-colors"
              onClick={() => navigate('/admin')}
              type="button"
            >
              <span className="material-symbols-outlined">arrow_back</span>
            </button>
            <span className="font-headline text-xs text-primary font-bold">
              Content Management
            </span>
          </div>
          <h1 className="font-headline text-4xl md:text-5xl font-extrabold tracking-tight">
            Manage Resource Database
          </h1>
          <p className="text-sm text-on-surface-variant mt-4 max-w-2xl">
            Configure available Common Vulnerabilities and Exposures (Resources). 
            Click on any Resource to edit title, description, content, and metadata.
          </p>
          <div className="mt-6">
            <button
              className="rounded-full bg-primary text-on-primary px-5 py-2.5 font-headline text-sm font-bold"
              onClick={() => navigate('/admin/resources/new')}
              type="button"
            >
              Add New Resource
            </button>
          </div>
        </header>

        <div className="mb-6">
          <input
            className="rounded-xl w-full bg-surface-container-lowest  border-t-0 border-r-0 border-b-0 focus:ring-0 font-body text-sm py-3 px-4 outline-none"
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search Resources by ID or description..."
            type="text"
            value={searchTerm}
          />
        </div>

        <div className="grid grid-cols-1 gap-4">
          {filteredCves.map((cve) => (
            <div
              className="rounded-2xl bg-surface-container-lowest p-6 hover:bg-surface-container-low transition-colors text-left flex flex-col md:flex-row md:items-center justify-between gap-4 border border-outline-variant/30 cursor-pointer group"
              key={cve.id}
              onClick={() => navigate(`/admin/resources/${cve.id}`)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/admin/resources/${cve.id}`) }}
            >
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="font-headline text-xl font-bold tracking-tight text-on-surface">
                    {cve.cve_id}
                  </h3>
                  <span className="rounded-xl text-xs font-headline font-bold bg-surface-container-high px-2 py-0.5 text-on-surface-variant">
                    {cve.found_year}
                  </span>
                </div>
                <p className="text-sm text-on-surface-variant font-body line-clamp-2 pr-4">
                  {cve.short_description}
                </p>
              </div>
              <div className="flex flex-col items-end gap-2 flex-shrink-0">
                <span className="material-symbols-outlined text-outline">chevron_right</span>
                <button
                  className="mt-2 text-error hover:bg-error/10 p-2 rounded-lg transition-colors flex items-center justify-center border-none bg-transparent"
                  onClick={(e) => handleDeleteClick(e, cve.id)}
                  type="button"
                  title="Delete Resource"
                >
                  <span className="material-symbols-outlined">delete</span>
                </button>
              </div>
            </div>
          ))}
          {filteredCves.length === 0 && (
            <div className="rounded-xl text-center py-12 bg-surface-container-lowest border-2 border-dashed border-outline-variant/30">
              <p className="text-on-surface-variant font-headline">
                No Resources found.
              </p>
            </div>
          )}
        </div>
      </section>

      <ConfirmModal
        isOpen={isModalOpen}
        title="Delete Resource"
        message="Are you sure you want to delete this Vulnerability Record? This action cannot be reverted."
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
      />
    </main>
  )
}

export default AdminResourcesManagementPage
