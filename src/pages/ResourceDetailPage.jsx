import { useState, useEffect, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getResourceById, subscribeResourcesData } from '../data/resourcesData'
import { parseMarkdownToHtml } from '../utils/markdown'
import ResourcePublicationProof from '../components/ResourcePublicationProof'

function looksLikeCodeContent(text) {
  const lines = String(text || '').split('\n')
  const codeLikeLines = lines.filter((line) => {
    const trimmed = line.trim()
    if (!trimmed) return false

    return (
      /^(#\s?(?:!|import|from|\$|curl|python|bash|cat|echo|base64|payload|validate)|curl\s|-[A-Z]\s|--[a-z-]+|\w+\.\w+\(|[A-Za-z0-9+/]{40,}={0,2}$)/i.test(trimmed) ||
      /[{}()[\]=<>]|\\$/.test(trimmed)
    )
  })

  return codeLikeLines.length >= 3 || codeLikeLines.length / Math.max(1, lines.filter((line) => line.trim()).length) >= 0.45
}

function renderCveContent(text, { preferCode = false } = {}) {
  const raw = String(text || '').trim()
  if (!raw) {
    return parseMarkdownToHtml('No details available.')
  }

  if (preferCode && looksLikeCodeContent(raw) && !/^```/m.test(raw)) {
    return parseMarkdownToHtml(`\`\`\`bash\n${raw}\n\`\`\``)
  }

  return parseMarkdownToHtml(raw)
}

function ResourceDetailPage() {
  const { id } = useParams()
  const [cve, setCve] = useState(() => getResourceById(id))
  const contentRootRef = useRef(null)

  useEffect(() => {
    return subscribeResourcesData(() => {
      const foundCve = getResourceById(id)
      if (foundCve) {
        setCve(foundCve)
      }
    })
  }, [id])

  useEffect(() => {
    const root = contentRootRef.current
    if (!root) {
      return undefined
    }

    const cleanupHandlers = []
    root.querySelectorAll('pre').forEach((block) => {
      if (block.querySelector('[data-copy-code]')) {
        return
      }

      block.classList.add('relative', 'group')
      const button = document.createElement('button')
      button.type = 'button'
      button.dataset.copyCode = 'true'
      button.className =
        'absolute right-3 top-3 bg-surface-container-lowest border border-outline-variant/40 px-3 py-1.5 font-headline text-xs font-bold text-on-surface-variant opacity-0 transition-opacity group-hover:opacity-100 hover:text-primary'
      button.textContent = 'Copy'

      const handleClick = async () => {
        const code = block.querySelector('code')?.textContent || block.textContent || ''
        try {
          await navigator.clipboard.writeText(code)
          button.textContent = 'Copied'
          window.setTimeout(() => {
            button.textContent = 'Copy'
          }, 1200)
        } catch {
          button.textContent = 'Failed'
          window.setTimeout(() => {
            button.textContent = 'Copy'
          }, 1200)
        }
      }

      button.addEventListener('click', handleClick)
      block.appendChild(button)
      cleanupHandlers.push(() => {
        button.removeEventListener('click', handleClick)
        button.remove()
      })
    })

    return () => {
      cleanupHandlers.forEach((cleanup) => cleanup())
    }
  }, [cve])

  if (!cve) {
    return (
      <main className="min-h-screen bg-surface px-6 md:px-10 py-10 mt-16 md:mt-20 flex items-center justify-center">
        <div className="text-center">
          <p className="text-on-surface-variant font-headline mb-4">Resource Not Found.</p>
          <Link
            to="/resources"
            className="rounded-full bg-primary text-on-primary px-6 py-3 font-headline text-sm font-bold inline-flex items-center gap-2 hover:bg-primary-darker transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">arrow_back</span>
            Back to Resource Database
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-surface px-6 md:px-10 py-10 mt-16 md:mt-20">
      <div ref={contentRootRef} className="max-w-4xl mx-auto space-y-12">
        <nav className="flex items-center gap-4 border-b border-outline-variant pb-6 mb-10">
          <Link
            to="/resources"
            className="text-on-surface-variant hover:text-primary transition-colors flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
            <span className="font-headline text-xs font-bold">
              Resource Database
            </span>
          </Link>
          <div className="h-4 w-px bg-outline-variant"></div>
          <span className="font-headline text-xs text-on-surface">
            {cve.cve_id}
          </span>
        </nav>

        <header className="space-y-6 mb-12 shadow-soft pl-6">
          <h1 className="text-4xl md:text-5xl font-extrabold font-headline tracking-tight text-on-background">
            {cve.cve_id}
          </h1>
          <div className="flex flex-wrap items-center gap-4 text-xs font-headline text-on-surface-variant">
            <span className="rounded-full bg-surface-container-highest px-3 py-1 font-bold text-on-surface">
              Found: {cve.found_year || 'Unknown'}
            </span>
            <span className="font-bold text-primary">
              Credit: <span className="text-on-surface-variant font-normal">{cve.credit || 'Unknown'}</span>
            </span>
          </div>
          <p className="text-on-surface-variant font-body text-base mt-6">
            {cve.short_description}
          </p>
        </header>

        <section className="rounded-2xl bg-surface-container-lowest p-8 border-l border-outline-variant/30">
          <h2 className="font-headline text-xl font-bold tracking-tight text-on-surface mb-6 flex items-center gap-3">
            <span className="material-symbols-outlined text-primary">bug_report</span>
            Vulnerability Report
          </h2>
          <div
            className="rounded-2xl font-body text-sm md:text-base text-on-surface-variant leading-relaxed [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mb-4 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:mt-6 [&_h2]:mb-3 [&_h3]:text-lg [&_h3]:font-bold [&_h3]:mt-4 [&_h3]:mb-2 [&_p]:mb-4 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:mb-1.5 [&_pre]:bg-surface [&_pre]:border [&_pre]:border-outline-variant/30 [&_pre]:p-4 [&_pre]:overflow-x-auto [&_pre]:my-4 [&_pre]:text-sm [&_code]:font-mono [&_code]:text-[0.9em] [&_code]:bg-on-surface/5 [&_code]:px-1.5 [&_code]:py-0.5 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_a]:text-primary [&_a]:underline"
            dangerouslySetInnerHTML={{ __html: renderCveContent(cve.vulnerability_report) }}
          ></div>
        </section>

        <ResourcePublicationProof cve={cve} />

        <section className="rounded-2xl bg-surface-container-lowest p-8 border-l border-outline-variant/30">
          <h2 className="font-headline text-xl font-bold tracking-tight text-on-surface mb-6 flex items-center gap-3">
            <span className="material-symbols-outlined text-primary">search_insights</span>
            Discovery Method
          </h2>
          <div
            className="rounded-2xl font-body text-sm md:text-base text-on-surface-variant leading-relaxed [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mb-4 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:mt-6 [&_h2]:mb-3 [&_h3]:text-lg [&_h3]:font-bold [&_h3]:mt-4 [&_h3]:mb-2 [&_p]:mb-4 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:mb-1.5 [&_pre]:bg-surface [&_pre]:border [&_pre]:border-outline-variant/30 [&_pre]:p-4 [&_pre]:overflow-x-auto [&_pre]:my-4 [&_pre]:text-sm [&_code]:font-mono [&_code]:text-[0.9em] [&_code]:bg-on-surface/5 [&_code]:px-1.5 [&_code]:py-0.5 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_a]:text-primary [&_a]:underline"
            dangerouslySetInnerHTML={{ __html: renderCveContent(cve.method_followed, { preferCode: true }) }}
          ></div>
        </section>

        <section className="rounded-2xl bg-surface-container-lowest p-8 border-l border-outline-variant/30">
          <h2 className="font-headline text-xl font-bold tracking-tight text-on-surface mb-6 flex items-center gap-3">
            <span className="material-symbols-outlined text-primary">menu_book</span>
            References
          </h2>
          <div className="font-body text-sm text-on-surface-variant leading-relaxed break-words space-y-2">
            {cve.references_text ? (
              <ul className="list-disc list-inside ml-4 space-y-2">
                {cve.references_text.split('\n').map((ref, index) => {
                  if (!ref.trim()) return null
                  const isUrl = ref.trim().startsWith('http://') || ref.trim().startsWith('https://')
                  return (
                    <li key={index}>
                      {isUrl ? (
                        <a
                          href={ref.trim()}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline hover:text-primary-darker transition-colors"
                        >
                          {ref.trim()}
                        </a>
                      ) : (
                        <span>{ref.trim()}</span>
                      )}
                    </li>
                  )
                })}
              </ul>
            ) : (
              'No references available.'
            )}
          </div>
        </section>
      </div>
    </main>
  )
}

export default ResourceDetailPage
