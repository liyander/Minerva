import { useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { getCoursesData } from '../../data/coursesData'
import {
  addCareerPath,
  getCareerPathById,
  updateCareerPath,
  addModuleToPath,
  updateModuleInPath,
  deleteModuleFromPath,
  addResourceToPath,
  updateResourceInPath,
  deleteResourceFromPath,
} from '../../data/careerPathsData'

function AdminCareerPathEditorPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { pathId } = useParams()
  const isNewPath = pathId === 'new' || location.pathname === '/admin/career-paths/new'

  const path = isNewPath ? null : getCareerPathById(pathId)
  const allRooms = getCoursesData()

  const [formData, setFormData] = useState(
    path || {
      title: '',
      slug: '',
      description: '',
      icon: 'school',
      learningPathLevel: 'Basic',
      difficulty: 'Basic',
      estimatedHours: 0,
      enrolledCount: 0,
      mastery: 0,
      certificateImageData: '',
      modules: [],
      resources: [],
    }
  )
  const [activeTab, setActiveTab] = useState('basic')
  const [saved, setSaved] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [modulesSavedId, setModulesSavedId] = useState('')
  const [resourcesSavedId, setResourcesSavedId] = useState('')
  const [roomSearchByModule, setRoomSearchByModule] = useState({})
  const [newModuleForm, setNewModuleForm] = useState({
    phase: '',
    title: '',
    description: '',
    imageData: '',
  })
  const [certificateImagePreview, setCertificateImagePreview] = useState(path?.certificateImageData || '')
  const [newResourceForm, setNewResourceForm] = useState({
    title: '',
    url: '',
    type: 'Reference',
  })
  if (!isNewPath && !path) {
    return (
      <main className="min-h-screen bg-surface px-6 md:px-10 py-10 flex items-center justify-center">
        <div className="text-center">
          <p className="text-on-surface-variant mb-4">Career path not found.</p>
          <button
            className="rounded-full bg-secondary text-on-secondary px-4 py-2 font-headline font-bold"
            onClick={() => navigate('/admin/career-paths')}
            type="button"
          >
            Back to Career Paths
          </button>
        </div>
      </main>
    )
  }

  const buildSlug = (value) =>
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')

  const handleSave = () => {
    if (!formData.title?.trim()) {
      setErrorMessage('Path title is required.')
      return
    }

    const normalized = {
      ...formData,
      slug: formData.slug || buildSlug(formData.title || ''),
      learningPathLevel: formData.learningPathLevel || 'Basic',
      difficulty: formData.learningPathLevel || formData.difficulty || 'Basic',
    }

    if (!normalized.slug) {
      setErrorMessage('Unable to generate a valid slug. Please provide a title or slug.')
      return
    }

    setErrorMessage('')

    if (isNewPath) {
      const created = addCareerPath(normalized)
      setSaved(true)
      setTimeout(() => {
        setSaved(false)
        navigate(`/admin/career-paths/${created.id}`)
      }, 1200)
    } else {
      updateCareerPath(pathId, normalized)
      setSaved(true)
      setTimeout(() => {
        setSaved(false)
      }, 1200)
    }
  }

  const handleInputChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: name === 'estimatedHours' || name === 'enrolledCount' || name === 'mastery'
        ? parseInt(value)
        : value,
    }))
  }

  const handleCertificateImageUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file) {
      return
    }

    const reader = new FileReader()
    reader.onloadend = () => {
      const imageData = String(reader.result || '')
      setFormData((prev) => ({
        ...prev,
        certificateImageData: imageData,
      }))
      setCertificateImagePreview(imageData)
    }
    reader.readAsDataURL(file)
  }

  const handleClearCertificateImage = () => {
    setFormData((prev) => ({
      ...prev,
      certificateImageData: '',
    }))
    setCertificateImagePreview('')
  }

  const handleAddModule = () => {
    if (newModuleForm.phase && newModuleForm.title) {
      if (isNewPath) {
        setFormData((prev) => ({
          ...prev,
          modules: [
            ...(prev.modules || []),
            {
              id: `mod-${Date.now()}`,
              ...newModuleForm,
              rooms: [],
            },
          ],
        }))
      } else {
        addModuleToPath(pathId, {
          ...newModuleForm,
          rooms: [],
        })
        setFormData(getCareerPathById(pathId))
      }
      setNewModuleForm({ phase: '', title: '', description: '', imageData: '' })
    }
  }

  const handleModuleDraftChange = (moduleId, field, value) => {
    setFormData((prev) => ({
      ...prev,
      modules: (prev.modules || []).map((module) =>
        module.id === moduleId ? { ...module, [field]: value } : module,
      ),
    }))
  }

  const handleModuleImageEditUpload = (moduleId, e) => {
    const file = e.target.files?.[0]
    if (!file) {
      return
    }

    const reader = new FileReader()
    reader.onloadend = () => {
      handleModuleDraftChange(moduleId, 'imageData', reader.result)
    }
    reader.readAsDataURL(file)
  }

  const handleSaveModule = (moduleId) => {
    const module = formData.modules.find((item) => item.id === moduleId)
    if (!module) {
      return
    }

    if (!module.phase?.trim() || !module.title?.trim()) {
      setErrorMessage('Module phase and title are required.')
      return
    }

    setErrorMessage('')

    if (isNewPath) {
      setModulesSavedId(moduleId)
      window.setTimeout(() => setModulesSavedId(''), 1200)
      return
    }

    updateModuleInPath(pathId, moduleId, {
      phase: module.phase,
      title: module.title,
      description: module.description || '',
      imageData: module.imageData || '',
      rooms: module.rooms || [],
    })
    setFormData(getCareerPathById(pathId))
    setModulesSavedId(moduleId)
    window.setTimeout(() => setModulesSavedId(''), 1200)
  }

  const handleDeleteModule = (moduleId) => {
    if (isNewPath) {
      setFormData((prev) => ({
        ...prev,
        modules: (prev.modules || []).filter((m) => m.id !== moduleId),
      }))
    } else {
      deleteModuleFromPath(pathId, moduleId)
      setFormData(getCareerPathById(pathId))
    }
  }

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => {
        setNewModuleForm((prev) => ({
          ...prev,
          imageData: reader.result,
        }))
      }
      reader.readAsDataURL(file)
    }
  }

  const handleAddRoomToModule = (moduleId, roomId) => {
    const module = formData.modules.find((m) => m.id === moduleId)
    if (module && !module.rooms.includes(roomId)) {
      const updatedRooms = [...module.rooms, roomId]
      if (isNewPath) {
        setFormData((prev) => ({
          ...prev,
          modules: (prev.modules || []).map((m) =>
            m.id === moduleId ? { ...m, rooms: updatedRooms } : m
          ),
        }))
      } else {
        updateModuleInPath(pathId, moduleId, { rooms: updatedRooms })
        setFormData(getCareerPathById(pathId))
      }
      setRoomSearchByModule((prev) => ({ ...prev, [moduleId]: '' }))
    }
  }

  const handleRemoveRoomFromModule = (moduleId, roomId) => {
    const module = formData.modules.find((m) => m.id === moduleId)
    if (module) {
      const updatedRooms = module.rooms.filter((r) => r !== roomId)
      if (isNewPath) {
        setFormData((prev) => ({
          ...prev,
          modules: (prev.modules || []).map((m) =>
            m.id === moduleId ? { ...m, rooms: updatedRooms } : m
          ),
        }))
      } else {
        updateModuleInPath(pathId, moduleId, { rooms: updatedRooms })
        setFormData(getCareerPathById(pathId))
      }
    }
  }

  const handleAddResource = () => {
    if (newResourceForm.title && newResourceForm.url) {
      if (isNewPath) {
        setFormData((prev) => ({
          ...prev,
          resources: [
            ...(prev.resources || []),
            {
              id: `res-${Date.now()}`,
              ...newResourceForm,
            },
          ],
        }))
      } else {
        addResourceToPath(pathId, newResourceForm)
        setFormData(getCareerPathById(pathId))
      }
      setNewResourceForm({ title: '', url: '', type: 'Reference' })
    }
  }

  const handleDeleteResource = (resourceId) => {
    if (isNewPath) {
      setFormData((prev) => ({
        ...prev,
        resources: (prev.resources || []).filter((r) => r.id !== resourceId),
      }))
    } else {
      deleteResourceFromPath(pathId, resourceId)
      setFormData(getCareerPathById(pathId))
    }
  }

  const handleResourceDraftChange = (resourceId, field, value) => {
    setFormData((prev) => ({
      ...prev,
      resources: (prev.resources || []).map((resource) =>
        resource.id === resourceId ? { ...resource, [field]: value } : resource,
      ),
    }))
  }

  const handleSaveResource = (resourceId) => {
    const resource = formData.resources.find((item) => item.id === resourceId)
    if (!resource) {
      return
    }

    if (!resource.title?.trim() || !resource.url?.trim()) {
      setErrorMessage('Resource title and URL are required.')
      return
    }

    setErrorMessage('')

    if (isNewPath) {
      setResourcesSavedId(resourceId)
      window.setTimeout(() => setResourcesSavedId(''), 1200)
      return
    }

    updateResourceInPath(pathId, resourceId, {
      title: resource.title,
      url: resource.url,
      type: resource.type,
    })
    setFormData(getCareerPathById(pathId))
    setResourcesSavedId(resourceId)
    window.setTimeout(() => setResourcesSavedId(''), 1200)
  }

  return (
    <main className="min-h-screen bg-surface px-6 md:px-10 py-10">
      <section className="max-w-6xl mx-auto">
        <header className="rounded-2xl bg-surface-container-lowest shadow-soft p-8 md:p-10 mb-8">
          <div className="flex items-center gap-4 mb-4">
            <button
              className="text-secondary hover:text-on-surface transition-colors"
              onClick={() => navigate('/admin/career-paths')}
              type="button"
            >
              <span className="material-symbols-outlined">arrow_back</span>
            </button>
            <span className="font-headline text-xs text-secondary font-bold">
              Path Configuration
            </span>
          </div>
          <h1 className="font-headline text-4xl md:text-5xl font-extrabold tracking-tight">
            {isNewPath ? 'Create Career Path' : `Edit: ${formData.title || 'Untitled Path'}`}
          </h1>
          <div className="mt-6 flex gap-3">
            <button
              className={`px-5 py-2.5 font-headline text-xs font-bold transition-all ${
                saved
                  ? 'bg-emerald-600 text-white'
                  : 'bg-secondary text-on-secondary hover:bg-secondary-darker'
              }`}
              onClick={handleSave}
              type="button"
            >
              {saved ? (
                <>
                  <span className="material-symbols-outlined inline mr-1">check</span>
                  Saved
                </>
              ) : (
                isNewPath ? 'Create Path' : 'Save Changes'
              )}
            </button>
            <button
              className="rounded-lg bg-surface-container-high text-on-surface px-5 py-2.5 font-headline text-xs font-bold"
              onClick={() => navigate('/admin/career-paths')}
              type="button"
            >
              Cancel
            </button>
          </div>
          {errorMessage ? (
            <p className="mt-4 text-sm text-error font-headline tracking-wide">
              {errorMessage}
            </p>
          ) : null}
        </header>

        {/* Tab Navigation */}
        <div className="flex gap-0 mb-8 border-b border-outline-variant/30 overflow-x-auto">
          {['basic', 'modules', 'resources'].map((tab) => (
            <button
              className={`rounded-xl px-6 py-3 font-headline text-xs font-bold transition-all border-b-2 whitespace-nowrap ${
                activeTab === tab
                  ? 'border-secondary text-secondary'
                  : 'border-transparent text-on-surface-variant hover:text-on-surface'
              }`}
              key={tab}
              onClick={() => setActiveTab(tab)}
              type="button"
            >
              {tab === 'basic' ? 'Basic Info' : tab === 'modules' ? 'Modules' : 'Resources'}
            </button>
          ))}
        </div>

        {/* Basic Information Tab */}
        {activeTab === 'basic' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <section className="rounded-2xl bg-surface-container-lowest p-8">
              <h2 className="font-headline text-xl font-bold tracking-tight mb-6">
                Path Details
              </h2>

              <div className="space-y-6">
                <div>
                  <label className="block font-headline text-xs font-bold mb-2">
                    Path Title
                  </label>
                  <input
                    className="rounded-xl w-full bg-surface-container-highest  focus:ring-0 font-body text-sm py-3 px-4 outline-none"
                    name="title"
                    onChange={handleInputChange}
                    type="text"
                    value={formData.title || ''}
                  />
                </div>

                <div>
                  <label className="block font-headline text-xs font-bold mb-2">
                    Description
                  </label>
                  <textarea
                    className="rounded-xl w-full bg-surface-container-highest  focus:ring-0 font-body text-sm py-3 px-4 outline-none"
                    name="description"
                    onChange={handleInputChange}
                    rows="4"
                    value={formData.description || ''}
                  ></textarea>
                </div>

                <div>
                  <label className="block font-headline text-xs font-bold mb-2">
                    Slug
                  </label>
                  <input
                    className="rounded-xl w-full bg-surface-container-highest  focus:ring-0 font-body text-sm py-3 px-4 outline-none"
                    name="slug"
                    onChange={handleInputChange}
                    placeholder="auto-generated-from-title"
                    type="text"
                    value={formData.slug || ''}
                  />
                </div>

                <div>
                  <label className="block font-headline text-xs font-bold mb-2">
                    Learning Path Level
                  </label>
                  <select
                    className="rounded-xl w-full bg-surface-container-highest  focus:ring-0 font-body text-sm py-3 px-4 outline-none"
                    name="learningPathLevel"
                    onChange={handleInputChange}
                    value={formData.learningPathLevel || 'Basic'}
                  >
                    <option value="Basic">Basic Learning Path</option>
                    <option value="Intermediate">Intermediate Learning Path</option>
                    <option value="Expert">Expert Learning Path</option>
                    <option value="Critical">Critical Learning Path</option>
                  </select>
                </div>

                <div>
                  <label className="block font-headline text-xs font-bold mb-2">
                    Difficulty Level
                  </label>
                  <select
                    className="rounded-xl w-full bg-surface-container-highest  focus:ring-0 font-body text-sm py-3 px-4 outline-none"
                    name="difficulty"
                    onChange={handleInputChange}
                    value={formData.difficulty || formData.learningPathLevel || ''}
                  >
                    <option value="">Select Difficulty</option>
                    <option value="Basic">Basic</option>
                    <option value="Intermediate">Intermediate</option>
                    <option value="Expert">Expert</option>
                    <option value="Critical">Critical</option>
                  </select>
                </div>

                <div>
                  <label className="block font-headline text-xs font-bold mb-2">
                    Estimated Hours
                  </label>
                  <input
                    className="rounded-xl w-full bg-surface-container-highest  focus:ring-0 font-body text-sm py-3 px-4 outline-none"
                    name="estimatedHours"
                    onChange={handleInputChange}
                    type="number"
                    value={formData.estimatedHours || 0}
                  />
                </div>

                <div>
                  <label className="block font-headline text-xs font-bold mb-2">
                    Enrolled Count
                  </label>
                  <input
                    className="rounded-xl w-full bg-surface-container-highest  focus:ring-0 font-body text-sm py-3 px-4 outline-none"
                    name="enrolledCount"
                    onChange={handleInputChange}
                    type="number"
                    value={formData.enrolledCount || 0}
                  />
                </div>

                <div>
                  <label className="block font-headline text-xs font-bold mb-2">
                    Mastery % (for display progress)
                  </label>
                  <input
                    className="rounded-xl w-full bg-surface-container-highest  focus:ring-0 font-body text-sm py-3 px-4 outline-none"
                    name="mastery"
                    onChange={handleInputChange}
                    type="number"
                    max="100"
                    min="0"
                    value={formData.mastery || 0}
                  />
                </div>
              </div>
            </section>

            <section className="rounded-2xl bg-surface-container-lowest p-8">
              <h2 className="font-headline text-xl font-bold tracking-tight mb-6">
                Preview
              </h2>
              <div className="bg-surface-container-highest p-6 rounded">
                <div className="flex items-center gap-3 mb-4">
                  <span className="material-symbols-outlined text-secondary" style={{ fontSize: '32px' }}>
                    {formData.icon || 'folder'}
                  </span>
                  <span className="rounded-lg bg-secondary-container text-on-secondary-container px-2 py-1 font-headline text-sm font-bold">
                    {formData.learningPathLevel || formData.difficulty}
                  </span>
                </div>
                <h3 className="font-headline font-extrabold text-lg mb-2">{formData.title}</h3>
                <p className="text-sm text-on-surface-variant mb-6">{formData.description}</p>
                <div className="space-y-2 text-xs text-on-surface-variant">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm">schedule</span>
                    <span>Est. {formData.estimatedHours} hours commitment</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm">group</span>
                    <span>{formData.enrolledCount?.toLocaleString()} enrolled</span>
                  </div>
                  <div className="flex items-center gap-2 mt-4">
                    <span className="text-xs font-bold">Mastery: {formData.mastery}%</span>
                  </div>
                  <div className="rounded-xl w-full h-1 bg-surface-container mt-2">
                    <div
                      className="h-full bg-secondary transition-all"
                      style={{ width: `${formData.mastery}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-2xl bg-surface-container-lowest p-8 lg:col-span-2">
              <h2 className="font-headline text-xl font-bold tracking-tight mb-6">
                Certificate Artwork
              </h2>
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_20rem] gap-6 items-start">
                <div className="space-y-3">
                  <label className="block font-headline text-xs font-bold mb-2">
                    Select Image For Certificate
                  </label>
                  <input
                    className="rounded-xl w-full bg-surface-container-highest  focus:ring-0 font-body text-sm py-3 px-4 outline-none"
                    onChange={handleCertificateImageUpload}
                    type="file"
                    accept="image/*"
                  />
                  <p className="text-xs text-on-surface-variant">
                    This image is embedded into the downloadable certificate for completed learners.
                  </p>
                  {formData.certificateImageData ? (
                    <button
                      className="rounded-lg px-4 py-2 bg-surface-container-high text-on-surface font-headline text-xs font-bold"
                      onClick={handleClearCertificateImage}
                      type="button"
                    >
                      Clear Artwork
                    </button>
                  ) : null}
                </div>

                <div className="rounded-xl bg-surface-container-highest p-3 border border-outline-variant/30 min-h-56 flex items-center justify-center overflow-hidden">
                  {certificateImagePreview ? (
                    <img
                      alt="Certificate artwork preview"
                      className="w-full h-full object-cover"
                      src={certificateImagePreview}
                    />
                  ) : (
                    <div className="text-center text-xs text-on-surface-variant">
                      No artwork selected yet
                    </div>
                  )}
                </div>
              </div>
            </section>
          </div>
        )}

        {/* Modules Tab */}
        {activeTab === 'modules' && (
          <div className="space-y-8">
            {/* Add New Module */}
            <section className="rounded-2xl bg-surface-container-lowest p-8">
              <h2 className="font-headline text-xl font-bold tracking-tight mb-6">
                Add New Module
              </h2>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <input
                    className="rounded-xl bg-surface-container-highest  focus:ring-0 font-body text-sm py-3 px-4 outline-none"
                    onChange={(e) => setNewModuleForm({ ...newModuleForm, phase: e.target.value })}
                    placeholder="Phase (e.g., Module 01)"
                    type="text"
                    value={newModuleForm.phase}
                  />
                  <input
                    className="rounded-xl bg-surface-container-highest  focus:ring-0 font-body text-sm py-3 px-4 outline-none"
                    onChange={(e) => setNewModuleForm({ ...newModuleForm, title: e.target.value })}
                    placeholder="Module Title"
                    type="text"
                    value={newModuleForm.title}
                  />
                  <button
                    className="rounded-full bg-secondary text-on-secondary px-4 py-2 font-headline text-sm font-bold hover:bg-secondary-darker transition-all"
                    onClick={handleAddModule}
                    type="button"
                  >
                    Add Module
                  </button>
                </div>
                <input
                  className="rounded-xl w-full bg-surface-container-highest  focus:ring-0 font-body text-sm py-3 px-4 outline-none"
                  onChange={(e) =>
                    setNewModuleForm({ ...newModuleForm, description: e.target.value })
                  }
                  placeholder="Module Description"
                  type="text"
                  value={newModuleForm.description}
                />
                <div className="rounded-2xl bg-surface-container-highest  p-4">
                  <label className="block font-headline text-xs font-bold mb-2">
                    Module Image
                  </label>
                  <div className="flex items-center gap-4">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="flex-1 text-sm font-body file:bg-secondary file:text-on-secondary file:px-4 file:py-2 file:rounded file:border-0 file:font-bold file:cursor-pointer hover:file:bg-secondary-container"
                    />
                    {newModuleForm.imageData && (
                      <div className="w-24 h-24 rounded overflow-hidden border border-secondary/30">
                        <img src={newModuleForm.imageData} alt="Module preview" className="w-full h-full object-cover" />
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-on-surface-variant mt-2">Leave empty to use default image</p>
                </div>
              </div>
            </section>

            {/* Existing Modules */}
            <section className="rounded-2xl bg-surface-container-lowest p-8">
              <h2 className="font-headline text-xl font-bold tracking-tight mb-6">
                Current Modules ({formData.modules?.length || 0})
              </h2>
              {formData.modules && formData.modules.length > 0 ? (
                <div className="space-y-6">
                  {formData.modules.map((module) => (
                    <div key={module.id} className="rounded-2xl bg-surface-container-high p-6 shadow-soft/50">
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex-1">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                            <input
                              className="rounded-lg w-full bg-surface-container-lowest  focus:ring-0 font-body text-sm py-2 px-3 outline-none"
                              onChange={(e) => handleModuleDraftChange(module.id, 'phase', e.target.value)}
                              placeholder="Phase"
                              type="text"
                              value={module.phase || ''}
                            />
                            <input
                              className="rounded-lg w-full bg-surface-container-lowest  focus:ring-0 font-body text-sm py-2 px-3 outline-none"
                              onChange={(e) => handleModuleDraftChange(module.id, 'title', e.target.value)}
                              placeholder="Module Title"
                              type="text"
                              value={module.title || ''}
                            />
                          </div>
                          <textarea
                            className="rounded-lg w-full bg-surface-container-lowest  focus:ring-0 font-body text-sm py-2 px-3 outline-none"
                            onChange={(e) => handleModuleDraftChange(module.id, 'description', e.target.value)}
                            placeholder="Module Description"
                            rows="2"
                            value={module.description || ''}
                          ></textarea>
                        </div>
                        <div className="flex flex-col gap-2 ml-4">
                          <button
                            className="rounded-full px-3 py-2 bg-secondary text-on-secondary font-headline text-sm font-bold"
                            onClick={() => handleSaveModule(module.id)}
                            type="button"
                          >
                            {modulesSavedId === module.id ? 'Saved' : 'Save'}
                          </button>
                          <button
                            className="text-on-surface-variant hover:text-error transition-colors"
                            onClick={() => handleDeleteModule(module.id)}
                            type="button"
                          >
                            <span className="material-symbols-outlined">delete</span>
                          </button>
                        </div>
                      </div>

                      <div className="rounded-2xl bg-surface-container-lowest  p-4 mb-4">
                        <label className="block font-headline text-xs font-bold mb-2">
                          Module Image
                        </label>
                        <div className="flex items-center gap-4">
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => handleModuleImageEditUpload(module.id, e)}
                            className="flex-1 text-sm font-body file:bg-secondary file:text-on-secondary file:px-4 file:py-2 file:rounded file:border-0 file:font-bold file:cursor-pointer hover:file:bg-secondary-container"
                          />
                          {module.imageData ? (
                            <button
                              className="rounded-lg px-3 py-2 bg-surface-container-high text-on-surface font-headline text-xs font-bold"
                              onClick={() => handleModuleDraftChange(module.id, 'imageData', '')}
                              type="button"
                            >
                              Clear
                            </button>
                          ) : null}
                        </div>
                      </div>

                      {module.imageData && (
                        <div className="my-4 rounded overflow-hidden">
                          <img src={module.imageData} alt={module.title} className="w-full h-48 object-cover" />
                        </div>
                      )}

                      {/* Skill Assignment */}
                      <div className="mt-6 pt-6 border-t border-outline-variant/20">
                        <p className="text-xs font-bold text-on-surface-variant mb-3">
                          Assigned Skills
                        </p>
                        <div className="space-y-2 mb-4">
                          {module.rooms && module.rooms.length > 0 ? (
                            module.rooms.map((roomId) => {
                              const room = allRooms.find((r) => r.id === roomId)
                              return (
                                <div
                                  key={roomId}
                                  className="rounded-xl flex justify-between items-center bg-surface-container-lowest p-3"
                                >
                                  <span className="text-sm">{room?.title || roomId}</span>
                                  <button
                                    className="text-on-surface-variant hover:text-error transition-colors"
                                    onClick={() => handleRemoveRoomFromModule(module.id, roomId)}
                                    type="button"
                                  >
                                    <span className="material-symbols-outlined text-sm">close</span>
                                  </button>
                                </div>
                              )
                            })
                          ) : (
                            <p className="text-xs text-on-surface-variant italic">No courses assigned yet.</p>
                          )}
                        </div>

                        {(() => {
                          const roomSearch = roomSearchByModule[module.id] || ''
                          const normalizedSearch = roomSearch.trim().toLowerCase()
                          const availableRooms = allRooms
                            .filter((room) => !module.rooms || !module.rooms.includes(room.id))
                            .filter((room) => {
                              if (!normalizedSearch) return true
                              return [
                                room.title,
                                room.id,
                                room.slug,
                                room.category,
                                room.level,
                              ]
                                .filter(Boolean)
                                .some((value) => String(value).toLowerCase().includes(normalizedSearch))
                            })

                          return (
                            <div className="space-y-2">
                              <input
                                className="rounded-xl w-full bg-surface-container-highest  focus:ring-0 font-body text-sm py-3 px-4 outline-none"
                                onChange={(event) =>
                                  setRoomSearchByModule((prev) => ({
                                    ...prev,
                                    [module.id]: event.target.value,
                                  }))
                                }
                                placeholder="Search courses by title, slug, category, or difficulty..."
                                type="search"
                                value={roomSearch}
                              />
                              <select
                                className="rounded-xl w-full bg-surface-container-highest  focus:ring-0 font-body text-sm py-3 px-4 outline-none"
                                disabled={!availableRooms.length}
                                onChange={(e) => {
                                  if (e.target.value) {
                                    handleAddRoomToModule(module.id, e.target.value)
                                    e.target.value = ''
                                  }
                                }}
                                value=""
                              >
                                <option value="">
                                  {availableRooms.length
                                    ? `+ Add Skill to Module (${availableRooms.length} match${availableRooms.length === 1 ? '' : 'es'})`
                                    : 'No matching skills available'}
                                </option>
                                {availableRooms.map((room) => (
                                  <option key={room.id} value={room.id}>
                                    {room.title} {room.category ? `- ${room.category}` : ''}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )
                        })()}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-on-surface-variant text-center py-8">No modules added yet.</p>
              )}
            </section>
          </div>
        )}

        {/* Resources Tab */}
        {activeTab === 'resources' && (
          <div className="space-y-8">
            {/* Add New Resource */}
            <section className="rounded-2xl bg-surface-container-lowest p-8">
              <h2 className="font-headline text-xl font-bold tracking-tight mb-6">
                Add New Resource
              </h2>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <input
                    className="rounded-xl bg-surface-container-highest  focus:ring-0 font-body text-sm py-3 px-4 outline-none"
                    onChange={(e) => setNewResourceForm({ ...newResourceForm, title: e.target.value })}
                    placeholder="Resource Title"
                    type="text"
                    value={newResourceForm.title}
                  />
                  <input
                    className="rounded-xl bg-surface-container-highest  focus:ring-0 font-body text-sm py-3 px-4 outline-none"
                    onChange={(e) => setNewResourceForm({ ...newResourceForm, url: e.target.value })}
                    placeholder="Resource URL"
                    type="text"
                    value={newResourceForm.url}
                  />
                  <select
                    className="rounded-xl bg-surface-container-highest  focus:ring-0 font-body text-sm py-3 px-4 outline-none"
                    onChange={(e) => setNewResourceForm({ ...newResourceForm, type: e.target.value })}
                    value={newResourceForm.type}
                  >
                    <option value="Reference">Reference</option>
                    <option value="Guide">Guide</option>
                    <option value="Tutorial">Tutorial</option>
                    <option value="Tool">Tool</option>
                  </select>
                </div>
                <button
                  className="rounded-full bg-secondary text-on-secondary px-4 py-2 font-headline text-sm font-bold hover:bg-secondary-darker transition-all"
                  onClick={handleAddResource}
                  type="button"
                >
                  Add Resource
                </button>
              </div>
            </section>

            {/* Existing Resources */}
            <section className="rounded-2xl bg-surface-container-lowest p-8">
              <h2 className="font-headline text-xl font-bold tracking-tight mb-6">
                Current Resources ({formData.resources?.length || 0})
              </h2>
              {formData.resources && formData.resources.length > 0 ? (
                <div className="space-y-3">
                  {formData.resources.map((resource) => (
                    <div
                      key={resource.id}
                      className="rounded-2xl bg-surface-container-high p-4 border-l-2 border-secondary/50"
                    >
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <input
                          className="rounded-lg bg-surface-container-lowest  focus:ring-0 font-body text-sm py-2 px-3 outline-none"
                          onChange={(e) => handleResourceDraftChange(resource.id, 'title', e.target.value)}
                          placeholder="Resource Title"
                          type="text"
                          value={resource.title || ''}
                        />
                        <input
                          className="rounded-lg bg-surface-container-lowest  focus:ring-0 font-body text-sm py-2 px-3 outline-none"
                          onChange={(e) => handleResourceDraftChange(resource.id, 'url', e.target.value)}
                          placeholder="Resource URL"
                          type="text"
                          value={resource.url || ''}
                        />
                        <select
                          className="rounded-lg bg-surface-container-lowest  focus:ring-0 font-body text-sm py-2 px-3 outline-none"
                          onChange={(e) => handleResourceDraftChange(resource.id, 'type', e.target.value)}
                          value={resource.type || 'Reference'}
                        >
                          <option value="Reference">Reference</option>
                          <option value="Guide">Guide</option>
                          <option value="Tutorial">Tutorial</option>
                          <option value="Tool">Tool</option>
                        </select>
                      </div>

                      <div className="flex justify-between items-center mt-3">
                        <div className="text-xs">
                          {resource.url ? (
                            <a
                              className="text-primary hover:underline"
                              href={resource.url}
                              rel="noopener noreferrer"
                              target="_blank"
                            >
                              Open Link
                            </a>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            className="rounded-full px-3 py-2 bg-secondary text-on-secondary font-headline text-sm font-bold"
                            onClick={() => handleSaveResource(resource.id)}
                            type="button"
                          >
                            {resourcesSavedId === resource.id ? 'Saved' : 'Save'}
                          </button>
                          <button
                            className="text-on-surface-variant hover:text-error transition-colors"
                            onClick={() => handleDeleteResource(resource.id)}
                            type="button"
                          >
                            <span className="material-symbols-outlined">delete</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-on-surface-variant text-center py-8">No resources added yet.</p>
              )}
            </section>
          </div>
        )}
      </section>
    </main>
  )
}

export default AdminCareerPathEditorPage
