import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { CATEGORIES_UPDATED_EVENT, fetchRoomCategories, getRoomCategories } from '../data/categoriesData'
import { getCoursesData } from '../data/coursesData'
import {
  getLabProgressEvents,
  getLabProgressMap,
} from '../services/labProgress'

function searchableValue(value) {
  return String(value ?? '').toLowerCase()
}

function normalizeRoomType(value) {
  return String(value || 'theoretical').toLowerCase() === 'practical' ? 'practical' : 'theoretical'
}

function CourseCatalogPage({ allowLabRooms = true, selectedLabId = null }) {
  const [complexity, setComplexity] = useState('Any Difficulty')
  const [specialization, setSpecialization] = useState('All Categories')
  const [roomTypeFilter, setRoomTypeFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [viewFilter, setViewFilter] = useState('all')
  const [progressMap, setProgressMap] = useState(() => getLabProgressMap())
  const [categoryTick, setCategoryTick] = useState(0)
  const allRooms = useMemo(() => getCoursesData(), [])
  const [roomCategories, setRoomCategories] = useState(() =>
    getRoomCategories(allRooms.map((room) => room.category)),
  )

  const filteredRooms = useMemo(() => {
    let results = allRooms

    if (complexity !== 'Any Difficulty') {
      results = results.filter((room) => room.level === complexity)
    }

    if (specialization !== 'All Categories') {
      results = results.filter((room) => room.category === specialization)
    }

    if (roomTypeFilter !== 'all') {
      results = results.filter((room) => normalizeRoomType(room.roomType) === roomTypeFilter)
    }

    if (searchQuery.trim()) {
      const query = searchQuery.trim().toLowerCase()
      results = results.filter(
        (room) =>
          searchableValue(room.title).includes(query) ||
          searchableValue(room.description).includes(query) ||
          searchableValue(room.slug).includes(query)
      )
    }

    if (viewFilter === 'in-progress') {
      results = results.filter((room) => {
        const progress = progressMap[room.id]
        return Boolean(progress?.startedAt && !progress?.completedAt)
      })
    }

    if (viewFilter === 'completed') {
      results = results.filter((room) => Boolean(progressMap[room.id]?.completedAt))
    }

    return results
  }, [allRooms, complexity, specialization, roomTypeFilter, searchQuery, viewFilter, progressMap])

  const proficiencyItems = useMemo(() => {
    void categoryTick
    return roomCategories
      .map((category) => {
        const categoryRooms = allRooms.filter((room) => room.category === category)
        const completedRooms = categoryRooms.filter((room) => Boolean(progressMap[room.id]?.completedAt)).length
        const percentage = categoryRooms.length
          ? Math.round((completedRooms / categoryRooms.length) * 100)
          : 0

        return {
          category,
          completedRooms,
          totalRooms: categoryRooms.length,
          percentage,
        }
      })
      .filter((item) => item.totalRooms > 0)
      .sort(
        (a, b) =>
          b.percentage - a.percentage ||
          b.completedRooms - a.completedRooms ||
          b.totalRooms - a.totalRooms ||
          a.category.localeCompare(b.category),
      )
      .slice(0, 5)
  }, [allRooms, categoryTick, progressMap, roomCategories])

  useEffect(() => {
    const { updatedEvent, updatedStorageKey } = getLabProgressEvents()

    const syncProgress = () => {
      setProgressMap(getLabProgressMap())
    }

    const onStorage = (event) => {
      if (event.key === updatedStorageKey) {
        syncProgress()
      }
    }
    const syncCategories = () => {
      setCategoryTick((value) => value + 1)
    }

    window.addEventListener(updatedEvent, syncProgress)
    window.addEventListener('storage', onStorage)
    window.addEventListener(CATEGORIES_UPDATED_EVENT, syncCategories)
    return () => {
      window.removeEventListener(updatedEvent, syncProgress)
      window.removeEventListener('storage', onStorage)
      window.removeEventListener(CATEGORIES_UPDATED_EVENT, syncCategories)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    const loadCategories = async () => {
      const categories = await fetchRoomCategories(allRooms.map((room) => room.category))
      if (!cancelled) {
        setRoomCategories(categories)
      }
    }

    void loadCategories()

    return () => {
      cancelled = true
    }
  }, [allRooms, categoryTick])

  const getRoomStatus = (roomId) => {
    const progress = progressMap[roomId]
    if (progress?.completedAt) return 'completed'
    if (progress?.startedAt) return 'in-progress'
    return 'not-started'
  }

  const handleReset = () => {
    setComplexity('Any Difficulty')
    setSpecialization('All Categories')
    setRoomTypeFilter('all')
    setSearchQuery('')
    setViewFilter('all')
  }

  const filterFieldClass =
    'rounded-xl bg-surface-container-lowest border border-outline-variant focus:border-primary focus:ring-0 font-body text-sm py-3 px-4 outline-none cursor-pointer transition-colors'

  const filterLabelClass = 'font-headline text-xs text-on-surface-variant font-bold ml-1'

  const viewTabClass = (value) =>
    `rounded-full px-4 py-2 text-xs font-bold font-headline transition-colors ${
      viewFilter === value
        ? 'bg-surface-container-lowest text-primary shadow-soft'
        : 'text-on-surface-variant hover:text-on-surface'
    }`

  const statusChip = (status) => {
    if (status === 'completed') return 'bg-mint text-on-mint'
    if (status === 'in-progress') return 'bg-butter text-on-butter'
    return 'bg-surface-container-high text-on-surface-variant'
  }

  const statusLabel = (status) => {
    if (status === 'completed') return 'Completed'
    if (status === 'in-progress') return 'In progress'
    return 'Not started'
  }

  const renderCourseCard = (course) => {
    const status = getRoomStatus(course.id)

    return (
      <article
        className={`rounded-3xl bg-surface-container-lowest shadow-soft hover:shadow-card transition-shadow group flex flex-col ${
          course.slug === selectedLabId ? 'ring-2 ring-primary' : ''
        }`}
        key={course.slug || course.title}
      >
        <div className="p-6 sm:p-7 flex flex-col h-full">
          <div className="flex justify-between items-start gap-3 mb-5">
            <span className="rounded-lg bg-secondary-container px-3 py-1 font-headline text-sm font-bold text-on-secondary-container">
              {course.category}
            </span>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              <span className={`font-headline text-xs font-bold ${course.levelTone}`}>
                {course.level}
              </span>
              <span
                className={`rounded-full font-headline text-xs font-bold px-2.5 py-0.5 ${statusChip(status)}`}
              >
                {statusLabel(status)}
              </span>
            </div>
          </div>

          <h3 className="text-xl font-extrabold text-on-background mb-2 font-headline leading-snug">
            {course.title}
          </h3>
          <p className="text-sm text-on-surface-variant font-body leading-relaxed mb-6">
            {course.description}
          </p>

          {course.trainerName ? (
            <div className="mb-4 flex items-center gap-2 rounded-xl bg-surface-container px-3 py-2">
              <span className="material-symbols-outlined text-base text-primary">co_present</span>
              <span className="font-body text-xs text-on-surface-variant">
                Trainer <strong className="font-headline text-on-surface">{course.trainerName}</strong>
              </span>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-4 text-xs font-body text-on-surface-variant mb-6">
            {course.estimateTime ? (
              <span className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm">timer</span>
                {course.estimateTime}
              </span>
            ) : null}
            <span className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm">military_tech</span>
              {course.xp}
            </span>
          </div>

          <div className="mt-auto">
            {allowLabRooms ? (
              <Link
                className="inline-flex items-center justify-center gap-1 rounded-full bg-primary text-on-primary font-headline text-sm py-3 px-7 hover:opacity-90 transition-opacity font-bold"
                to={`/learn/course/${course.slug}`}
              >
                {status === 'completed'
                  ? 'Review course'
                  : course.slug === selectedLabId
                    ? 'Currently open'
                    : status === 'in-progress'
                      ? 'Continue'
                      : 'Start course'}
              </Link>
            ) : (
              <button
                className="rounded-full bg-surface-container-high text-on-surface-variant font-headline text-sm py-3 px-7 font-bold cursor-not-allowed"
                disabled
                type="button"
              >
                Unavailable
              </button>
            )}
          </div>
        </div>
      </article>
    )
  }

  const hasActiveFilters =
    complexity !== 'Any Difficulty' ||
    specialization !== 'All Categories' ||
    roomTypeFilter !== 'all' ||
    Boolean(searchQuery)

  return (
    <div className="bg-surface p-5 sm:p-8 lg:p-10 overflow-x-hidden mt-16 md:mt-20">
      <div className="mb-8">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
          <div className="space-y-2">
            <h1 className="text-3xl sm:text-4xl font-extrabold text-on-background font-headline">
              Course catalogue
            </h1>
            <p className="font-body text-on-surface-variant max-w-xl">
              Browse every course on the platform, filter by topic or difficulty, and pick up
              anything you have already started.
            </p>
          </div>
          <div className="rounded-full bg-surface-container p-1 flex self-start">
            <button className={viewTabClass('all')} onClick={() => setViewFilter('all')} type="button">
              All
            </button>
            <button
              className={viewTabClass('in-progress')}
              onClick={() => setViewFilter('in-progress')}
              type="button"
            >
              In progress
            </button>
            <button
              className={viewTabClass('completed')}
              onClick={() => setViewFilter('completed')}
              type="button"
            >
              Completed
            </button>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
          <div className="flex flex-col gap-2">
            <label className={filterLabelClass} htmlFor="filter-difficulty">
              Difficulty
            </label>
            <select
              className={filterFieldClass}
              id="filter-difficulty"
              onChange={(e) => setComplexity(e.target.value)}
              value={complexity}
            >
              <option>Any Difficulty</option>
              <option>Easy</option>
              <option>Medium</option>
              <option>Hard</option>
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <label className={filterLabelClass} htmlFor="filter-category">
              Category
            </label>
            <select
              className={filterFieldClass}
              id="filter-category"
              onChange={(e) => setSpecialization(e.target.value)}
              value={specialization}
            >
              <option>All Categories</option>
              {roomCategories.map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <label className={filterLabelClass} htmlFor="filter-format">
              Format
            </label>
            <select
              className={filterFieldClass}
              id="filter-format"
              onChange={(e) => setRoomTypeFilter(e.target.value)}
              value={roomTypeFilter}
            >
              <option value="all">All formats</option>
              <option value="theoretical">Guided reading</option>
              <option value="practical">Hands-on workspace</option>
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <label className={filterLabelClass} htmlFor="filter-search">
              Search
            </label>
            <input
              className={filterFieldClass}
              id="filter-search"
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by course name…"
              type="text"
              value={searchQuery}
            />
          </div>
          <div className="flex items-end">
            {hasActiveFilters && (
              <button
                className="w-full rounded-full px-4 py-3 bg-surface-container-high text-on-surface font-headline text-sm hover:bg-surface-container-highest transition-colors font-bold"
                onClick={handleReset}
                title="Reset filters"
                type="button"
              >
                Reset filters
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {filteredRooms.length > 0 ? (
          <>
            {filteredRooms.slice(0, 2).map(renderCourseCard)}

            <section className="rounded-3xl p-6 sm:p-7 bg-sky">
              <h2 className="font-headline text-base font-extrabold text-on-sky mb-5">
                Your progress by topic
              </h2>
              <div className="space-y-5">
                {proficiencyItems.length > 0 ? (
                  proficiencyItems.map((item) => (
                    <div key={item.category}>
                      <div className="flex justify-between gap-4 font-headline text-xs font-bold mb-2">
                        <span className="text-on-sky/80 truncate">{item.category}</span>
                        <span className="text-on-sky shrink-0">
                          {item.percentage}% ({item.completedRooms}/{item.totalRooms})
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-surface-container-lowest/60 w-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-on-sky"
                          style={{ width: `${item.percentage}%` }}
                        ></div>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm font-body text-on-sky/80">
                    Finish a course to start building your progress chart.
                  </p>
                )}
              </div>
            </section>

            {filteredRooms.slice(2).map(renderCourseCard)}
          </>
        ) : (
          <div className="col-span-full rounded-3xl bg-surface-container-lowest py-16 text-center">
            <div className="flex flex-col items-center gap-4">
              <span className="material-symbols-outlined text-6xl text-on-surface-variant/50">
                search_off
              </span>
              <div>
                <h3 className="text-xl font-extrabold font-headline text-on-background mb-1">
                  No courses found
                </h3>
                <p className="text-on-surface-variant font-body">
                  Try widening your filters to see more courses.
                </p>
              </div>
              <button
                className="mt-2 rounded-full px-6 py-3 bg-primary text-on-primary font-headline text-sm font-bold hover:opacity-90 transition-opacity"
                onClick={handleReset}
                type="button"
              >
                Reset filters
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default CourseCatalogPage
