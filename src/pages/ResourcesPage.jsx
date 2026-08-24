import { useState, useMemo, useEffect } from 'react'
import { Link } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import { getResourcesData, subscribeResourcesData } from '../data/resourcesData'

function ResourcesPage() {
  const [cves, setCves] = useState(getResourcesData())
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    return subscribeResourcesData(() => {
      setCves(getResourcesData())
    })
  }, [])

  const filteredCves = useMemo(() => {
    if (!searchQuery) return cves
    const q = searchQuery.toLowerCase()
    return cves.filter(cve => 
      cve.cve_id?.toLowerCase().includes(q) || 
      cve.short_description?.toLowerCase().includes(q)
    )
  }, [cves, searchQuery])

  return (
    <main className="min-h-screen bg-surface px-6 xl:px-10 py-10 mt-16 md:mt-20">
      <div className="max-w-7xl mx-auto space-y-12">
        <PageHeader
          accent="sky"
          description="Guides, write-ups and reference material from the teaching team. Search by title or topic to find what you need."
          eyebrow="Library"
          icon="menu_book"
          title="Resources"
        />

        <section>
          <div className="mb-6 max-w-xl">
            <label className="block text-xs font-headline text-on-surface-variant mb-2 font-bold">
              Search resources
            </label>
            <input
              type="text"
              placeholder="e.g. Resource-2021-44228 or Log4Shell"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="rounded-xl w-full bg-surface-container-low border-b-2 border-primary border-t-0 border-l-0 border-r-0 focus:ring-0 focus:border-b-primary font-body text-sm py-3 px-4 outline-none transition-colors"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filteredCves.map((cve) => (
              <Link
                key={cve.id}
                to={`/resources/${cve.id}`}
                className="rounded-2xl group p-6 bg-surface-container-lowest border-l-4 border-l-surface-container-lowest hover:border-l-primary transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="font-headline text-lg font-bold text-on-surface group-hover:text-primary transition-colors">
                      {cve.cve_id}
                    </span>
                    <span className="rounded-full bg-surface-container-highest px-2 py-1 text-xs font-headline font-bold text-on-surface-variant">
                      {cve.found_year}
                    </span>
                  </div>
                  <h3 className="font-body text-sm text-on-surface-variant mb-4 line-clamp-3">
                    {cve.short_description}
                  </h3>
                </div>
                <div className="border-t border-outline-variant pt-4 mt-auto">
                  <p className="font-headline text-xs text-on-surface-variant truncate">
                    <strong>Credit:</strong> {cve.credit || 'Unknown'}
                  </p>
                </div>
              </Link>
            ))}
            
            {filteredCves.length === 0 && (
              <div className="rounded-xl col-span-full py-12 text-center bg-surface-container-lowest">
                <span className="material-symbols-outlined text-4xl text-on-surface-variant mb-4">search_off</span>
                <p className="font-headline text-on-surface-variant">No Resources match your query.</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}

export default ResourcesPage
