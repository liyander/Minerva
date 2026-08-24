import { useCallback, useEffect, useMemo, useState } from 'react'
import PageHeader from '../components/PageHeader'
import { fetchLibrary, fetchLibraryFile } from '../services/training'
import { fetchLectureProgress, saveLectureProgress } from '../services/platform'

const TYPE_META = {
  lecture: { label: 'Recorded lecture', icon: 'smart_display', accent: 'bg-blush text-on-blush' },
  presentation: { label: 'Presentation', icon: 'slideshow', accent: 'bg-butter text-on-butter' },
  material: { label: 'Study material', icon: 'description', accent: 'bg-sky text-on-sky' },
  link: { label: 'External link', icon: 'link', accent: 'bg-lavender text-on-lavender' },
}

function TrainerLibraryPage() {
  const [items, setItems] = useState([])
  const [query, setQuery] = useState('')
  const [type, setType] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [openingId, setOpeningId] = useState(null)
  const [progress, setProgress] = useState({})
  const [player, setPlayer] = useState(null)

  const load = useCallback(async () => {
    setError('')
    try {
      const [libraryRows, progressRows] = await Promise.all([fetchLibrary(), fetchLectureProgress()])
      setItems(libraryRows)
      setProgress(Object.fromEntries(progressRows.map((row) => [row.libraryItemId, row])))
    } catch (loadError) {
      setError(loadError?.message || 'Could not load the library.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const visible = useMemo(() => {
    const search = query.trim().toLowerCase()
    return items.filter((item) => {
      if (type && item.itemType !== type) return false
      if (!search) return true
      return (
        item.title.toLowerCase().includes(search) ||
        String(item.subject || '').toLowerCase().includes(search) ||
        String(item.trainerName || '').toLowerCase().includes(search)
      )
    })
  }, [items, query, type])

  // Files are stored as data URLs, so opening one means fetching then handing it
  // to the browser in a new tab.
  const openItem = async (item) => {
    if (item.externalUrl) {
      window.open(item.externalUrl, '_blank', 'noreferrer')
      return
    }

    setOpeningId(item.id)
    setError('')
    try {
      const file = await fetchLibraryFile(item.id)
      if (file.externalUrl) {
        window.open(file.externalUrl, '_blank', 'noreferrer')
        return
      }
      if (!file.fileData) {
        setError('That item has no attached file.')
        return
      }

      const response = await fetch(file.fileData)
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      if (item.itemType === 'lecture' && String(blob.type).startsWith('video/')) {
        setPlayer({ item, url, resume: progress[item.id]?.positionSeconds || 0 })
        return
      }
      window.open(url, '_blank', 'noreferrer')
      window.setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch (openError) {
      setError(openError?.message || 'Could not open that item.')
    } finally {
      setOpeningId(null)
    }
  }

  return (
    <main className="min-h-screen bg-surface px-5 py-8 sm:px-8 lg:px-10 pt-24 pb-24 md:pb-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <PageHeader
          accent="sky"
          description="Recorded lectures, presentations and study material shared by your trainers."
          eyebrow="Trainer library"
          icon="video_library"
          title="Learning resources"
        />

        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[14rem]">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-base text-on-surface-variant">
              search
            </span>
            <input
              aria-label="Search the library"
              className="w-full rounded-full bg-surface-container-lowest pl-10 pr-4 py-2.5 font-body text-sm border border-transparent focus:border-primary focus:ring-0 outline-none"
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by title, subject or trainer"
              value={query}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className={`rounded-full px-4 py-2 font-headline text-sm font-bold transition-colors ${
                type === '' ? 'bg-primary text-on-primary' : 'bg-surface-container-lowest text-on-surface-variant'
              }`}
              onClick={() => setType('')}
              type="button"
            >
              All
            </button>
            {Object.entries(TYPE_META).map(([value, meta]) => (
              <button
                className={`rounded-full px-4 py-2 font-headline text-sm font-bold transition-colors ${
                  type === value
                    ? 'bg-primary text-on-primary'
                    : 'bg-surface-container-lowest text-on-surface-variant'
                }`}
                key={value}
                onClick={() => setType(value)}
                type="button"
              >
                {meta.label}
              </button>
            ))}
          </div>
        </div>

        {error ? (
          <div className="rounded-2xl bg-blush p-4">
            <p className="font-body text-sm text-on-blush">{error}</p>
          </div>
        ) : null}

        {isLoading ? (
          <div className="rounded-3xl bg-surface-container-lowest p-12 text-center shadow-soft">
            <div className="mx-auto h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
          </div>
        ) : null}

        {!isLoading && visible.length === 0 ? (
          <div className="rounded-3xl bg-surface-container-lowest p-12 text-center shadow-soft">
            <span className="material-symbols-outlined text-5xl text-on-surface-variant/40">
              video_library
            </span>
            <p className="font-headline text-base font-extrabold text-on-background mt-4">
              Nothing here yet
            </p>
            <p className="font-body text-sm text-on-surface-variant mt-1">
              {items.length ? 'No items match that search.' : 'Your trainers have not shared material yet.'}
            </p>
          </div>
        ) : null}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {visible.map((item) => {
            const meta = TYPE_META[item.itemType] || TYPE_META.material

            return (
              <article
                className="rounded-3xl bg-surface-container-lowest p-5 shadow-soft flex flex-col gap-3"
                key={item.id}
              >
                <div className={`h-11 w-11 rounded-2xl flex items-center justify-center ${meta.accent}`}>
                  <span className="material-symbols-outlined">{meta.icon}</span>
                </div>

                <div className="min-w-0">
                  <h3 className="font-headline text-base font-extrabold text-on-background">
                    {item.title}
                  </h3>
                  <p className="font-body text-xs text-on-surface-variant mt-1">
                    {item.subject || 'General'} · {item.trainerName}
                  </p>
                </div>

                {item.description ? (
                  <p className="font-body text-sm text-on-surface-variant line-clamp-3">
                    {item.description}
                  </p>
                ) : null}

                <div className="flex items-center justify-between gap-3 mt-auto pt-2">
                  <span className="font-body text-xs text-on-surface-variant">
                    {item.fileName
                      ? `${Math.max(1, Math.round(item.fileSize / 1024))} KB`
                      : meta.label}
                  </span>
                  <button
                    className="rounded-full px-5 py-2.5 bg-primary text-on-primary font-headline text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-60"
                    disabled={openingId === item.id}
                    onClick={() => openItem(item)}
                    type="button"
                  >
                    {openingId === item.id ? 'Opening…' : 'Open'}
                  </button>
                </div>
                {progress[item.id] ? <div className="h-1.5 overflow-hidden rounded-full bg-surface-container-high"><div className="h-full bg-primary" style={{ width: `${progress[item.id].percentage}%` }} /></div> : null}
              </article>
            )
          })}
        </div>
        {player ? <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-5"><section className="w-full max-w-4xl rounded-3xl bg-surface-container-lowest p-5 shadow-lift"><div className="mb-4 flex items-center justify-between"><div><h2 className="font-headline text-lg font-extrabold">{player.item.title}</h2><p className="text-xs text-on-surface-variant">Resumes across devices</p></div><button className="material-symbols-outlined" onClick={() => { URL.revokeObjectURL(player.url); setPlayer(null) }} type="button">close</button></div><video className="max-h-[70vh] w-full rounded-2xl bg-black" controls onLoadedMetadata={(event) => { event.currentTarget.currentTime = Math.min(player.resume, Math.max(0, event.currentTarget.duration - 1)) }} onPause={(event) => void saveLectureProgress(player.item.id, { positionSeconds: event.currentTarget.currentTime, durationSeconds: event.currentTarget.duration })} onTimeUpdate={(event) => { const video = event.currentTarget; if (Math.floor(video.currentTime) % 10 === 0) void saveLectureProgress(player.item.id, { positionSeconds: video.currentTime, durationSeconds: video.duration }) }} src={player.url} /></section></div> : null}
      </div>
    </main>
  )
}

export default TrainerLibraryPage
