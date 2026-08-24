import { useEffect, useState } from 'react'

function formatPublicationDate(value) {
  if (!value) return ''
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`)
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
}

function ResourcePublicationProof({ cve }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const image = String(cve?.publication_image_data || '').trim()
  const sourceUrl = String(cve?.publication_source_url || '').trim()
  const title = String(cve?.publication_title || '').trim() || `${cve?.cve_id || 'Resource'} publication`
  const publicationDate = formatPublicationDate(cve?.publication_date)

  useEffect(() => {
    if (!isExpanded) return undefined
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setIsExpanded(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isExpanded])

  if (!image) return null

  return (
    <section className="bg-surface-container-lowest shadow-soft overflow-hidden">
      <div className="p-6 md:p-8 border-b border-outline-variant/30 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-headline text-xs font-bold text-primary mb-2">
            Publication evidence
          </p>
          <h2 className="font-headline text-xl font-bold text-on-surface">
            Published Resource Proof
          </h2>
          <p className="font-body text-sm text-on-surface-variant mt-2">
            {title}{publicationDate ? ` | Published ${publicationDate}` : ''}
          </p>
        </div>
        {sourceUrl && (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xl inline-flex shrink-0 items-center justify-center gap-2 border border-outline-variant px-4 py-3 font-headline text-xs font-bold text-on-surface hover:border-primary hover:text-primary transition-colors"
          >
            Open published page
            <span className="material-symbols-outlined text-[17px]">open_in_new</span>
          </a>
        )}
      </div>

      <button
        type="button"
        className="rounded-2xl group relative block w-full bg-surface p-3 md:p-5 text-left"
        onClick={() => setIsExpanded(true)}
        aria-label="View publication proof image at full size"
      >
        <img
          src={image}
          alt={`Screenshot proving publication of ${cve?.cve_id || 'this resource'}`}
          className="block w-full max-h-[680px] object-contain border border-outline-variant/30 bg-black/20"
        />
        <span className="rounded-xl absolute bottom-7 right-7 inline-flex h-11 w-11 items-center justify-center bg-surface-container-lowest border border-outline-variant text-on-surface group-hover:text-primary group-hover:border-primary transition-colors">
          <span className="material-symbols-outlined">zoom_in</span>
        </span>
      </button>

      {isExpanded && (
        <div
          className="fixed inset-0 z-[120] bg-black/90 p-4 md:p-8 flex items-center justify-center"
          role="dialog"
          aria-modal="true"
          aria-label="Published Resource proof image"
          onClick={() => setIsExpanded(false)}
        >
          <button
            type="button"
            className="absolute right-5 top-5 h-12 w-12 border border-white/40 bg-black text-white hover:border-primary hover:text-primary transition-colors"
            onClick={() => setIsExpanded(false)}
            aria-label="Close image viewer"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
          <img
            src={image}
            alt={`Full-size publication proof for ${cve?.cve_id || 'Resource'}`}
            className="max-h-full max-w-full object-contain"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      )}
    </section>
  )
}

export default ResourcePublicationProof
