import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { searchPlatform } from '../services/platform'

const TYPE_TONE = {
  course: 'bg-sky text-on-sky',
  path: 'bg-lavender text-on-lavender',
  library: 'bg-mint text-on-mint',
  resource: 'bg-butter text-on-butter',
  assessment: 'bg-blush text-on-blush',
  assignment: 'bg-surface-container-high text-on-surface-variant',
}

/**
 * Searches courses, paths, library items, resources, assessments and assignments
 * in one box. Debounced so typing does not fire a request per keystroke.
 */
function GlobalSearch({ className = '' }) {
  const navigate = useNavigate()
  const containerRef = useRef(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [highlight, setHighlight] = useState(0)

  useEffect(() => {
    const term = query.trim()
    if (term.length < 2) {
      setResults([])
      return undefined
    }

    setBusy(true)
    const timer = window.setTimeout(() => {
      searchPlatform(term, 6)
        .then((response) => {
          setResults(response.results)
          setHighlight(0)
          setOpen(true)
        })
        .catch(() => setResults([]))
        .finally(() => setBusy(false))
    }, 250)

    return () => window.clearTimeout(timer)
  }, [query])

  useEffect(() => {
    const onClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const go = (result) => {
    navigate(result.link)
    setQuery('')
    setResults([])
    setOpen(false)
  }

  const onKeyDown = (event) => {
    if (!open || !results.length) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setHighlight((current) => (current + 1) % results.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlight((current) => (current - 1 + results.length) % results.length)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      go(results[highlight])
    } else if (event.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <div className="flex items-center gap-2 rounded-full bg-surface-container-lowest border border-outline-variant px-4 py-2.5 shadow-soft focus-within:border-primary transition-colors">
        <span className="material-symbols-outlined text-on-surface-variant text-lg">search</span>
        <input
          aria-label="Search the platform"
          className="bg-transparent outline-none font-body text-sm text-on-surface placeholder:text-on-surface-variant w-36 2xl:w-52"
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => results.length && setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search everything"
          type="text"
          value={query}
        />
        {busy ? (
          <span className="h-3.5 w-3.5 rounded-full border-2 border-primary border-t-transparent animate-spin shrink-0"></span>
        ) : null}
      </div>

      {open && query.trim().length >= 2 ? (
        <div className="absolute top-full right-0 mt-3 w-[26rem] max-w-[90vw] rounded-3xl bg-surface-container-lowest shadow-lift overflow-hidden z-50">
          {results.length === 0 ? (
            <div className="p-6 text-center">
              <span className="material-symbols-outlined text-3xl text-on-surface-variant/40">
                search_off
              </span>
              <p className="font-body text-sm text-on-surface-variant mt-2">
                {busy ? 'Searching…' : `Nothing found for “${query.trim()}”`}
              </p>
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto py-2">
              {results.map((result, index) => (
                <button
                  className={`w-full flex items-start gap-3 px-4 py-3 text-left transition-colors ${
                    index === highlight ? 'bg-surface-container' : 'hover:bg-surface-container'
                  }`}
                  key={`${result.type}-${result.id}`}
                  onClick={() => go(result)}
                  onMouseEnter={() => setHighlight(index)}
                  type="button"
                >
                  <span
                    className={`h-9 w-9 shrink-0 rounded-xl inline-flex items-center justify-center ${
                      TYPE_TONE[result.type] || TYPE_TONE.assignment
                    }`}
                  >
                    <span className="material-symbols-outlined text-base">{result.icon}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="font-headline text-sm font-bold text-on-surface block truncate">
                      {result.title}
                    </span>
                    <span className="font-body text-xs text-on-surface-variant block truncate">
                      {result.subtitle}
                    </span>
                    {result.snippet ? (
                      <span className="font-body text-xs text-on-surface-variant/80 block truncate mt-0.5">
                        {result.snippet}
                      </span>
                    ) : null}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}

export default GlobalSearch
