import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getCoursesData, deleteCourse } from '../../data/coursesData'
import { ConfirmModal } from '../../components/ConfirmModal'

function AdminCoursesManagementPage() {
  const navigate = useNavigate()
  const [rooms, setRooms] = useState(getCoursesData())
  const [searchTerm, setSearchTerm] = useState('')

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [roomToDelete, setRoomToDelete] = useState(null)

  const handleDeleteRoom = (e, id) => {
    e.stopPropagation()
    setRoomToDelete(id)
    setIsModalOpen(true)
  }

  const handleConfirmDelete = () => {
    if (roomToDelete) {
      deleteCourse(roomToDelete)
      setRooms(getCoursesData())
      setRoomToDelete(null)
    }
    setIsModalOpen(false)
  }

  const handleCancelDelete = () => {
    setRoomToDelete(null)
    setIsModalOpen(false)
  }

  const filteredRooms = rooms.filter(
    (room) =>
      (room.title || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (room.category || '').toLowerCase().includes(searchTerm.toLowerCase())
  )

  const getLevelColor = (level) => {
    switch (level) {
      case 'Easy':
        return 'bg-emerald-500/20 text-emerald-600'
      case 'Medium':
        return 'bg-amber-500/20 text-amber-600'
      case 'Hard':
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
            Manage Skills
          </h1>
          <p className="text-sm text-on-surface-variant mt-4 max-w-2xl">
            Configure available skills. Select any skill to edit its title, description, content, and metadata.
          </p>
          <div className="mt-6">
            <button
              className="rounded-full bg-primary text-on-primary px-5 py-2.5 font-headline text-sm font-bold"
              onClick={() => navigate('/admin/courses/new')}
              type="button"
            >
              Add Skill
            </button>
          </div>
        </header>

        <div className="mb-6">
          <input
            className="rounded-xl w-full bg-surface-container-lowest  border-t-0 border-r-0 border-b-0 focus:ring-0 font-body text-sm py-3 px-4 outline-none"
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search courses by name or category..."
            type="text"
            value={searchTerm}
          />
        </div>

        <div className="grid grid-cols-1 gap-4">
          {filteredRooms.map((room) => (
            <div
              className="rounded-2xl bg-surface-container-lowest p-6 hover:bg-surface-container-high transition-colors text-left shadow-soft/30 hover:border-primary flex items-start justify-between cursor-pointer"
              key={room.id}
              onClick={() => navigate(`/admin/courses/${room.id}`)}
            >
              <div className="flex-1">
                <div className="flex flex-wrap gap-2 mb-3">
                  <span className={`px-2 py-1 font-headline text-xs font-bold rounded ${getLevelColor(room.level)}`}>
                    {room.level || 'N/A'}
                  </span>
                  <span className="bg-primary-container text-on-primary-container px-2 py-1 font-headline text-sm font-bold rounded">
                    {room.category || 'Uncategorized'}
                  </span>
                </div>
                <h3 className="font-headline text-lg font-bold mb-2">{room.title}</h3>
                <p className="text-sm text-on-surface-variant max-w-2xl line-clamp-2">
                  {room.description}
                </p>
                <div className="flex gap-6 mt-4 text-xs text-on-surface-variant">
                  <span className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm">star</span>
                    {room.xp}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm">folder</span>
                    {room.slug || room.id}
                  </span>
                </div>
              </div>
              <div className="flex flex-col flex-shrink-0 ml-4 items-end gap-2">
                <span className="material-symbols-outlined text-on-surface-variant mt-1">
                  chevron_right
                </span>
                <button
                  className="mt-2 text-error hover:bg-error/10 p-2 rounded-lg transition-colors flex items-center justify-center"
                  onClick={(e) => handleDeleteRoom(e, room.id)}
                  type="button"
                  title="Delete Course"
                >
                  <span className="material-symbols-outlined">delete</span>
                </button>
              </div>
            </div>
          ))}

          {filteredRooms.length === 0 && (
            <div className="rounded-2xl bg-surface-container-lowest p-12 text-center">
              <p className="text-on-surface-variant">No courses found matching your search.</p>
            </div>
          )}
        </div>
      </section>

      <ConfirmModal
        isOpen={isModalOpen}
        title="Delete Experimental Course"
        message="Are you sure you want to delete this skill? This cannot be reverted and will delete its associated learning content."
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
      />
    </main>
  )
}

export default AdminCoursesManagementPage
