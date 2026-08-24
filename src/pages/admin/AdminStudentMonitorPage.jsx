import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PageHeader from '../../components/PageHeader'
import { fetchParticipation } from '../../services/training'

function AdminStudentMonitorPage() {
  const navigate = useNavigate()
  const [students, setStudents] = useState([])
  const [search, setSearch] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const data = await fetchParticipation()
      setStudents(data)
    } catch (loadError) {
      setError(loadError?.message || 'Could not load student participation data.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const filteredStudents = students.filter(student => 
    (student.name || '').toLowerCase().includes(search.toLowerCase()) || 
    (student.username || '').toLowerCase().includes(search.toLowerCase()) ||
    (student.email || '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <main className="min-h-screen bg-surface px-5 py-8 sm:px-8 lg:px-10 pt-24">
      <div className="mx-auto max-w-6xl space-y-6">
        <button
          className="inline-flex items-center gap-1 font-headline text-sm font-bold text-on-surface-variant hover:text-on-surface transition-colors"
          onClick={() => navigate('/admin')}
          type="button"
        >
          <span className="material-symbols-outlined text-base">arrow_back</span>
          Back to admin
        </button>

        <PageHeader
          accent="primary"
          description="Monitor each student separately. View their detailed statistics, progress, and performance."
          eyebrow="Student Tracking"
          icon="query_stats"
          title="Student Monitor"
        />

        <div className="flex flex-wrap gap-3 items-center justify-end">
          <div className="relative min-w-[16rem]">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-base text-on-surface-variant">
              search
            </span>
            <input
              aria-label="Search students"
              className="w-full rounded-full bg-surface-container-lowest pl-10 pr-4 py-2.5 font-body text-sm border border-transparent focus:border-primary focus:ring-0 outline-none"
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, username, or email"
              value={search}
            />
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

        {!isLoading && filteredStudents.length === 0 ? (
          <div className="rounded-3xl bg-surface-container-lowest p-12 text-center shadow-soft">
            <span className="material-symbols-outlined text-5xl text-on-surface-variant/40">
              person_off
            </span>
            <p className="font-headline text-base font-extrabold text-on-background mt-4">
              No students found
            </p>
          </div>
        ) : null}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredStudents.map((student) => (
            <article
              className="rounded-3xl bg-surface-container-lowest p-5 shadow-soft hover:shadow-card transition-shadow cursor-pointer flex flex-col gap-4"
              key={student.id}
              onClick={() => navigate(`/admin/students/${student.id}`)}
            >
              <div className="flex items-center gap-3">
                <span className="h-12 w-12 shrink-0 rounded-full bg-primary-container text-on-primary-container inline-flex items-center justify-center font-headline font-bold text-lg">
                  {(student.name || student.username).slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="font-headline text-base font-extrabold text-on-background truncate">
                    {student.name}
                  </h3>
                  <p className="font-body text-xs text-on-surface-variant truncate">
                    @{student.username}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mt-2">
                <div className="bg-surface p-3 rounded-2xl">
                  <p className="text-[10px] uppercase font-bold text-on-surface-variant tracking-wider">Enrolments</p>
                  <p className="text-xl font-headline font-bold text-primary mt-1">{student.enrolments}</p>
                </div>
                <div className="bg-surface p-3 rounded-2xl">
                  <p className="text-[10px] uppercase font-bold text-on-surface-variant tracking-wider">Certificates</p>
                  <p className="text-xl font-headline font-bold text-secondary mt-1">{student.certificates}</p>
                </div>
                <div className="bg-surface p-3 rounded-2xl">
                  <p className="text-[10px] uppercase font-bold text-on-surface-variant tracking-wider">Attempts</p>
                  <p className="text-xl font-headline font-bold text-on-background mt-1">{student.attempts}</p>
                </div>
                <div className="bg-surface p-3 rounded-2xl">
                  <p className="text-[10px] uppercase font-bold text-on-surface-variant tracking-wider">Avg Score</p>
                  <p className="text-xl font-headline font-bold text-mint mt-1">{student.averageScore ?? '-'}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </main>
  )
}

export default AdminStudentMonitorPage
