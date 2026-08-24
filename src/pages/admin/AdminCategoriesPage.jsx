import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ConfirmModal } from '../../components/ConfirmModal'
import { createRoomCategory, fetchRoomCategories, getRoomCategories, removeRoomCategory } from '../../data/categoriesData'
import { getCoursesData } from '../../data/coursesData'

function AdminCategoriesPage() {
  const navigate = useNavigate()
  const [categoryInput, setCategoryInput] = useState('')
  const [categoryToDelete, setCategoryToDelete] = useState(null)
  const [deleteError, setDeleteError] = useState('')
  const [categories, setCategories] = useState(() =>
    getRoomCategories(getCoursesData().map((room) => room.category)),
  )
  const roomCounts = useMemo(() => {
    const counts = new Map()
    getCoursesData().forEach((room) => {
      const category = room.category || 'Uncategorized'
      counts.set(category, (counts.get(category) || 0) + 1)
    })
    return counts
  }, [])

  const refreshCategories = async () => {
    setCategories(await fetchRoomCategories(getCoursesData().map((room) => room.category)))
  }

  useEffect(() => {
    let cancelled = false
    fetchRoomCategories(getCoursesData().map((room) => room.category)).then((nextCategories) => {
      if (!cancelled) {
        setCategories(nextCategories)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  const handleAddCategory = async () => {
    const next = categoryInput.trim()
    if (!next) {
      return
    }

    await createRoomCategory(next)
    await refreshCategories()
    setCategoryInput('')
  }

  const handleDeleteCategory = (category, roomCount) => {
    setDeleteError('')
    if (roomCount > 0) {
      setDeleteError(`"${category}" is assigned to ${roomCount} skill${roomCount === 1 ? '' : 's'}. Reassign those skills before deleting this category.`)
      return
    }

    setCategoryToDelete(category)
  }

  const handleConfirmDelete = async () => {
    if (!categoryToDelete) {
      return
    }

    try {
      await removeRoomCategory(categoryToDelete)
      await refreshCategories()
      setCategoryToDelete(null)
    } catch (error) {
      setDeleteError(error?.message || 'Unable to delete category.')
    }
  }

  return (
    <main className="min-h-screen bg-surface px-6 md:px-10 py-10">
      <section className="max-w-5xl mx-auto">
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
              Category Control
            </span>
          </div>
          <h1 className="font-headline text-4xl md:text-5xl font-extrabold tracking-tight">
            Skill Categories
          </h1>
          <p className="text-sm text-on-surface-variant mt-4 max-w-2xl">
            Add specialization categories for skill filters, skill creation, and proficiency tracking.
          </p>
        </header>

        <section className="rounded-2xl bg-surface-container-lowest p-8 mb-8">
          <h2 className="font-headline text-xl font-bold tracking-tight mb-6">
            Add Category
          </h2>
          <div className="flex flex-col md:flex-row gap-4">
            <input
              className="rounded-xl flex-1 bg-surface-container-highest  focus:ring-0 font-body text-sm py-3 px-4 outline-none"
              onChange={(event) => setCategoryInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  void handleAddCategory()
                }
              }}
              placeholder="e.g. Web3 Security"
              type="text"
              value={categoryInput}
            />
            <button
              className="rounded-full bg-primary text-on-primary px-6 py-3 font-headline text-sm font-bold"
              onClick={() => void handleAddCategory()}
              type="button"
            >
              Add Category
            </button>
          </div>
        </section>

        <section className="rounded-2xl bg-surface-container-lowest p-8">
          <div className="flex items-end justify-between gap-4 mb-6">
            <div>
              <h2 className="font-headline text-xl font-bold tracking-tight">
                Available Categories
              </h2>
              <p className="text-xs text-on-surface-variant mt-1">
                Categories assigned to skills are locked until those skills are reassigned.
              </p>
            </div>
            <span className="font-headline text-xs text-primary font-bold">
              {categories.length} Total
            </span>
          </div>

          {deleteError ? (
            <div className="rounded-xl mb-5 shadow-soft bg-error/10 px-4 py-3 text-sm text-error">
              {deleteError}
            </div>
          ) : null}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {categories.map((category) => {
              const roomCount = roomCounts.get(category) || 0
              return (
                <div
                  className="rounded-2xl bg-surface-container-high p-5 flex items-center justify-between gap-4"
                  key={category}
                >
                  <div>
                    <p className="font-headline text-sm font-bold tracking-wide">
                      {category}
                    </p>
                    <p className="text-xs text-on-surface-variant mt-1">
                      {roomCount} skill{roomCount === 1 ? '' : 's'}
                    </p>
                  </div>
                  <button
                    className="text-on-surface-variant hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed"
                    disabled={roomCount > 0}
                    onClick={() => handleDeleteCategory(category, roomCount)}
                    title={roomCount > 0 ? 'Category is assigned to skills' : 'Delete category'}
                    type="button"
                  >
                    <span className="material-symbols-outlined">delete</span>
                  </button>
                </div>
              )
            })}
          </div>
        </section>
      </section>

      <ConfirmModal
        isOpen={Boolean(categoryToDelete)}
        message={`Delete "${categoryToDelete}" from the category list? This will not affect skills because this category is not currently assigned.`}
        onCancel={() => setCategoryToDelete(null)}
        onConfirm={() => void handleConfirmDelete()}
        title="Delete Category"
      />
    </main>
  )
}

export default AdminCategoriesPage
