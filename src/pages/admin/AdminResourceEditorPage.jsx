import { useState } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { getResourceById, addResource, updateResource, deleteResource } from '../../data/resourcesData'

import { ConfirmModal } from '../../components/ConfirmModal'

function createCveFormData(cve) {
  return {
    cve_id: cve?.cve_id || '',
    short_description: cve?.short_description || '',
    found_year: cve?.found_year || new Date().getFullYear(),
    credit: cve?.credit || '',
    vulnerability_report: cve?.vulnerability_report || '',
    method_followed: cve?.method_followed || '',
    references_text: cve?.references_text || '',
    publication_title: cve?.publication_title || '',
    publication_source_url: cve?.publication_source_url || '',
    publication_date: cve?.publication_date ? String(cve.publication_date).slice(0, 10) : '',
    publication_image_data: cve?.publication_image_data || '',
  }
}

function AdminResourceEditorPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { id } = useParams()
  const isNewCve = id === 'new' || location.pathname === '/admin/resources/new'

  const cve = isNewCve ? null : getResourceById(id)
  const [formData, setFormData] = useState(() => createCveFormData(cve))
  
  const [saved, setSaved] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const [isModalOpen, setIsModalOpen] = useState(false)

  // Basic validation rules
  const handleSave = () => {
    if (!formData.cve_id?.trim()) {
      setErrorMessage('Resource ID is required.')
      return
    }

    if (!formData.short_description?.trim()) {
      setErrorMessage('A short description is required.')
      return
    }

    setErrorMessage('')

    if (isNewCve) {
      addResource(formData)
    } else {
      updateResource(id, formData)
    }

    setSaved(true)
    setTimeout(() => {
      setSaved(false)
      if (isNewCve) {
        navigate('/admin/resources')
      }
    }, 1200)
  }

  const handleDelete = () => {
    setIsModalOpen(true)
  }

  const handleConfirmDelete = () => {
    deleteResource(id)
    setIsModalOpen(false)
    navigate('/admin/resources')
  }

  const handleCancelDelete = () => {
    setIsModalOpen(false)
  }

  const handleInputChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handlePublicationImage = (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setErrorMessage('Publication proof must be a PNG, JPEG, or WebP image.')
      event.target.value = ''
      return
    }

    if (file.size > 3 * 1024 * 1024) {
      setErrorMessage('Publication proof image must be 3 MB or smaller.')
      event.target.value = ''
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      setFormData((prev) => ({ ...prev, publication_image_data: String(reader.result || '') }))
      setErrorMessage('')
    }
    reader.onerror = () => setErrorMessage('Unable to read the selected publication image.')
    reader.readAsDataURL(file)
  }

  if (!isNewCve && !cve) {
    return (
      <main className="min-h-screen bg-surface px-6 md:px-10 py-10 flex items-center justify-center">
        <div className="text-center">
          <p className="text-on-surface-variant font-headline mb-4">
            Resource NOT FOUND.
          </p>
          <button
            className="rounded-full bg-primary text-on-primary px-6 py-3 font-headline text-sm font-bold hover:bg-primary-darker transition-colors"
            onClick={() => navigate('/admin/resources')}
            type="button"
          >
            Back to Resource Management
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-surface px-6 md:px-10 py-10 mt-16 md:mt-0">
      <section className="max-w-6xl mx-auto space-y-12">
        <header className="rounded-2xl bg-surface-container-lowest shadow-soft p-8 md:p-10">
          <div className="flex items-center gap-3 mb-6 border-b border-outline-variant/30 pb-4">
            <button
              className="text-primary hover:text-primary-darker transition-colors"
              onClick={() => navigate('/admin/resources')}
              type="button"
            >
              <span className="material-symbols-outlined text-[20px]">arrow_back</span>
            </button>
            <span className="font-headline text-xs font-bold text-primary">
              Admin &raquo; Resource Configuration
            </span>
          </div>

          <h1 className="text-3xl md:text-4xl font-extrabold font-headline tracking-tight text-on-background mb-4">
            {isNewCve ? 'Create Resource' : `Edit: ${formData.cve_id || 'Unknown resource'}`}
          </h1>

          <div className="mt-8 flex flex-wrap gap-4">
            <button
              className={`px-6 py-3 font-headline text-xs font-bold transition-colors flex items-center gap-2 ${
                saved ? 'bg-emerald-600 text-white' : 'bg-primary text-on-primary hover:bg-primary-darker'
              }`}
              onClick={handleSave}
              type="button"
            >
              {saved ? (
                <>
                  <span className="material-symbols-outlined text-[18px]">check</span>
                  SAVED
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[18px]">save</span>
                  {isNewCve ? 'Create record' : 'Save changes'}
                </>
              )}
            </button>

            {!isNewCve && (
              <button
                className="rounded-xl px-6 py-3 font-headline text-xs font-bold transition-colors bg-error text-white hover:opacity-90 flex items-center gap-2 ml-auto"
                onClick={handleDelete}
                type="button"
              >
                <span className="material-symbols-outlined text-[18px]">delete</span>
                DELETE RECORD
              </button>
            )}
          </div>

          {errorMessage && (
            <p className="rounded-lg font-headline text-xs font-bold text-error mt-6 bg-error/10 px-4 py-2 border-l-2 border-error">
              {errorMessage}
            </p>
          )}
        </header>

        <section className="rounded-2xl bg-surface-container-lowest p-8 border-l border-outline-variant/30 space-y-8">
          <h2 className="font-headline text-xl font-bold tracking-tight text-on-surface mb-6">
            Basic Metadata
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-headline text-on-surface-variant font-bold mb-2">
                Resource Identifier
              </label>
              <input
                className="rounded-xl w-full bg-surface-container-highest  border-transparent focus:ring-0 font-body text-sm py-3 px-4 outline-none placeholder:text-on-surface-variant/50"
                name="cve_id"
                type="text"
                placeholder="e.g. Resource-2023-XXXX"
                value={formData.cve_id}
                onChange={handleInputChange}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-headline text-on-surface-variant font-bold mb-2">
                Discovery Year
              </label>
              <input
                className="rounded-xl w-full bg-surface-container-highest  border-transparent focus:ring-0 font-body text-sm py-3 px-4 outline-none placeholder:text-on-surface-variant/50"
                name="found_year"
                type="number"
                placeholder="2024"
                value={formData.found_year}
                onChange={handleInputChange}
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-headline text-on-surface-variant font-bold mb-2">
                Credit / Assignment
              </label>
              <input
                className="rounded-xl w-full bg-surface-container-highest  border-transparent focus:ring-0 font-body text-sm py-3 px-4 outline-none placeholder:text-on-surface-variant/50"
                name="credit"
                type="text"
                placeholder="Name of researcher or organization."
                value={formData.credit}
                onChange={handleInputChange}
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-headline text-on-surface-variant font-bold mb-2">
                Short Description
              </label>
              <textarea
                className="rounded-xl w-full bg-surface-container-highest  border-transparent focus:ring-0 font-body text-sm py-3 px-4 outline-none min-h-[80px] resize-y placeholder:text-on-surface-variant/50"
                name="short_description"
                placeholder="A brief summary of the topic impact..."
                value={formData.short_description}
                onChange={handleInputChange}
                required
              />
            </div>
          </div>
        </section>

        <section className="rounded-2xl bg-surface-container-lowest p-8 border-l border-outline-variant/30 space-y-8">
          <h2 className="font-headline text-xl font-bold tracking-tight text-on-surface mb-6">
            Detailed Content
          </h2>

          <div>
            <label className="block text-xs font-headline text-on-surface-variant font-bold mb-2 flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px] text-primary">bug_report</span>
              Vulnerability Report
            </label>
            <textarea
              className="rounded-xl w-full bg-surface-container-highest border-transparent focus:ring-0 font-body text-sm py-3 px-4 outline-none min-h-[160px] resize-y placeholder:text-on-surface-variant/50 border-l border-l-primary/50 focus:border-l-primary transition-colors"
              name="vulnerability_report"
              placeholder="Provide a comprehensive technical description of the topic..."
              value={formData.vulnerability_report}
              onChange={handleInputChange}
            />
          </div>

          <div>
            <label className="block text-xs font-headline text-on-surface-variant font-bold mb-2 flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px] text-primary">search_insights</span>
              Discovery Method / Exploitation Path
            </label>
            <textarea
              className="rounded-xl w-full bg-surface-container-highest border-transparent focus:ring-0 font-body text-sm py-3 px-4 outline-none min-h-[160px] resize-y placeholder:text-on-surface-variant/50 border-l border-l-primary/50 focus:border-l-primary transition-colors"
              name="method_followed"
              placeholder="Describe how the bug was discovered, steps to reproduce, or methods used..."
              value={formData.method_followed}
              onChange={handleInputChange}
            />
          </div>

          <div>
            <label className="block text-xs font-headline text-on-surface-variant font-bold mb-2 flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px] text-primary">menu_book</span>
              References / Links
            </label>
            <textarea
              className="rounded-xl w-full bg-surface-container-highest border-transparent focus:ring-0 font-body text-sm py-3 px-4 outline-none min-h-[100px] resize-y placeholder:text-on-surface-variant/50 border-l border-l-primary/50 focus:border-l-primary transition-colors"
              name="references_text"
              placeholder="Line-separated list of URLs or reference IDs (e.g. NIST NVD URL, GitHub Advisory...)"
              value={formData.references_text}
              onChange={handleInputChange}
            />
          </div>
        </section>

        <section className="rounded-2xl bg-surface-container-lowest p-8 shadow-soft space-y-8">
          <div>
            <p className="font-headline text-xs font-bold text-primary mb-2">
              Publication evidence
            </p>
            <h2 className="font-headline text-xl font-bold tracking-tight text-on-surface">
              Published Page Proof
            </h2>
            <p className="font-body text-sm text-on-surface-variant mt-2">
              Attach a screenshot of the official advisory, disclosure, or published Resource page.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2">
              <label className="block text-xs font-headline text-on-surface-variant font-bold mb-2">
                Publication title
              </label>
              <input
                className="rounded-xl w-full bg-surface-container-highest  border-transparent focus:ring-0 font-body text-sm py-3 px-4 outline-none"
                name="publication_title"
                type="text"
                placeholder="e.g. NVD topic detail page"
                value={formData.publication_title}
                onChange={handleInputChange}
              />
            </div>
            <div>
              <label className="block text-xs font-headline text-on-surface-variant font-bold mb-2">
                Published page URL
              </label>
              <input
                className="rounded-xl w-full bg-surface-container-highest  border-transparent focus:ring-0 font-body text-sm py-3 px-4 outline-none"
                name="publication_source_url"
                type="url"
                placeholder="https://..."
                value={formData.publication_source_url}
                onChange={handleInputChange}
              />
            </div>
            <div>
              <label className="block text-xs font-headline text-on-surface-variant font-bold mb-2">
                Publication date
              </label>
              <input
                className="rounded-xl w-full bg-surface-container-highest  border-transparent focus:ring-0 font-body text-sm py-3 px-4 outline-none"
                name="publication_date"
                type="date"
                value={formData.publication_date}
                onChange={handleInputChange}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-headline text-on-surface-variant font-bold mb-2">
              Published page screenshot
            </label>
            <div className="rounded-2xl border border-outline-variant/40 bg-surface p-4">
              {formData.publication_image_data ? (
                <div className="space-y-4">
                  <img
                    src={formData.publication_image_data}
                    alt="Publication proof preview"
                    className="w-full max-h-[480px] object-contain bg-black/20 border border-outline-variant/30"
                  />
                  <div className="flex flex-wrap gap-3">
                    <label className="rounded-xl cursor-pointer bg-secondary-container px-4 py-3 font-headline text-sm font-bold text-on-secondary-container hover:text-primary transition-colors">
                      Replace image
                      <input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={handlePublicationImage} />
                    </label>
                    <button
                      type="button"
                      className="rounded-xl border border-error/60 px-4 py-3 font-headline text-xs font-bold text-error hover:bg-error hover:text-white transition-colors"
                      onClick={() => setFormData((prev) => ({ ...prev, publication_image_data: '' }))}
                    >
                      Remove image
                    </button>
                  </div>
                </div>
              ) : (
                <label className="min-h-40 cursor-pointer flex flex-col items-center justify-center gap-3 border border-dashed border-outline-variant p-8 text-center hover:border-primary transition-colors">
                  <span className="material-symbols-outlined text-4xl text-primary">add_photo_alternate</span>
                  <span className="font-headline text-xs font-bold text-on-surface">Upload publication screenshot</span>
                  <span className="font-body text-xs text-on-surface-variant">PNG, JPEG, or WebP up to 3 MB</span>
                  <input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={handlePublicationImage} />
                </label>
              )}
            </div>
          </div>
        </section>

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

export default AdminResourceEditorPage
