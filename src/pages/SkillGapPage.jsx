import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import ProgressDonut from '../components/ProgressDonut'
import { fetchAssessmentSubjects } from '../services/training'
import { fetchSkillGap } from '../services/platform'
import { apiFetch } from '../services/api'

function SkillGapPage() {
  const navigate = useNavigate()
  const [target, setTarget] = useState('')
  const [subjects, setSubjects] = useState([])
  const [paths, setPaths] = useState([])
  const [data, setData] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async (selected) => {
    setIsLoading(true)
    setError('')

    const params = {}
    if (selected?.startsWith('path:')) params.pathId = selected.slice(5)
    else if (selected?.startsWith('subject:')) params.subject = selected.slice(8)

    try {
      setData(await fetchSkillGap(params))
    } catch (loadError) {
      setError(loadError?.message || 'Could not work out your skill gap.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    Promise.all([
      fetchAssessmentSubjects().catch(() => []),
      apiFetch('/career-paths').catch(() => []),
    ]).then(([subjectRows, pathRows]) => {
      setSubjects(subjectRows)
      setPaths(Array.isArray(pathRows) ? pathRows : [])
    })
  }, [])

  useEffect(() => {
    void load(target)
  }, [load, target])

  return (
    <main className="min-h-screen bg-surface px-5 py-8 sm:px-8 lg:px-10 pt-24 pb-24 md:pb-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <PageHeader
          accent="sky"
          description="Compares the skills on your profile against what the courses expect, then suggests what to take next."
          eyebrow="Skill gap"
          icon="radar"
          title="What to learn next"
        />

        <section className="rounded-3xl bg-surface-container-lowest p-6 shadow-soft">
          <label className="block max-w-lg">
            <span className="font-headline text-xs font-bold text-on-surface-variant">
              Compare against
            </span>
            <select
              className="mt-1.5 w-full rounded-xl bg-surface-container border border-transparent focus:border-primary focus:ring-0 font-body text-sm py-2.5 px-3.5 outline-none"
              onChange={(e) => setTarget(e.target.value)}
              value={target}
            >
              <option value="">Everything on the platform</option>
              {paths.length ? (
                <optgroup label="A learning path">
                  {paths.map((path) => (
                    <option key={path.id} value={`path:${path.id}`}>
                      {path.title}
                    </option>
                  ))}
                </optgroup>
              ) : null}
              {subjects.length ? (
                <optgroup label="A subject">
                  {subjects.map((subject) => (
                    <option key={subject} value={`subject:${subject}`}>
                      {subject}
                    </option>
                  ))}
                </optgroup>
              ) : null}
            </select>
          </label>
        </section>

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

        {!isLoading && data ? (
          <>
            <section className="rounded-3xl bg-surface-container-lowest p-6 shadow-soft">
              <div className="flex flex-wrap items-center gap-6">
                <ProgressDonut
                  barClass="text-primary"
                  labelClass="text-on-surface"
                  showLabel
                  size={104}
                  thickness={9}
                  trackClass="text-on-surface opacity-10"
                  value={data.coverage}
                />
                <div className="min-w-0 flex-1">
                  <h2 className="font-headline text-xl font-extrabold text-on-background">
                    You have {data.matchedSkills.length} of {data.requiredSkills.length} expected
                    skills
                  </h2>
                  <p className="font-body text-sm text-on-surface-variant mt-2">
                    {data.mySkillCount === 0
                      ? 'Add skills to your profile to get a sharper picture.'
                      : `Based on the ${data.mySkillCount} skill${data.mySkillCount === 1 ? '' : 's'} on your profile.`}
                  </p>
                  {data.mySkillCount === 0 ? (
                    <button
                      className="mt-3 rounded-full bg-primary px-5 py-2.5 font-headline text-sm font-bold text-on-primary hover:opacity-90"
                      onClick={() => navigate('/my-profile')}
                      type="button"
                    >
                      Add your skills
                    </button>
                  ) : null}
                </div>
              </div>
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <section className="rounded-3xl bg-mint p-6">
                <h2 className="font-headline text-base font-extrabold text-on-mint mb-3">
                  Skills you already have ({data.matchedSkills.length})
                </h2>
                {data.matchedSkills.length ? (
                  <div className="flex flex-wrap gap-2">
                    {data.matchedSkills.map((skill) => (
                      <span
                        className="rounded-full bg-surface-container-lowest/70 px-3 py-1 font-headline text-xs font-bold text-on-mint"
                        key={skill}
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="font-body text-sm text-on-mint/80">
                    None matched yet — that is what the recommendations below are for.
                  </p>
                )}
              </section>

              <section className="rounded-3xl bg-butter p-6">
                <h2 className="font-headline text-base font-extrabold text-on-butter mb-3">
                  Gaps to close ({data.missingSkills.length})
                </h2>
                {data.missingSkills.length ? (
                  <div className="flex flex-wrap gap-2">
                    {data.missingSkills.slice(0, 30).map((skill) => (
                      <span
                        className="rounded-full bg-surface-container-lowest/70 px-3 py-1 font-headline text-xs font-bold text-on-butter"
                        key={skill}
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="font-body text-sm text-on-butter/80">
                    Nothing missing for this target. Pick a different path to stretch further.
                  </p>
                )}
              </section>
            </div>

            <section className="rounded-3xl bg-surface-container-lowest p-6 shadow-soft">
              <h2 className="font-headline text-lg font-extrabold text-on-background mb-1">
                Courses that close the most ground
              </h2>
              <p className="font-body text-xs text-on-surface-variant mb-4">
                Ranked by how many missing skills each one covers.
              </p>

              {data.recommendations.length === 0 ? (
                <p className="font-body text-sm text-on-surface-variant py-6 text-center">
                  Nothing to recommend — you have covered this target.
                </p>
              ) : (
                <div className="space-y-2">
                  {data.recommendations.map((course) => (
                    <button
                      className="w-full rounded-2xl bg-surface-container p-4 text-left hover:bg-surface-container-high transition-colors"
                      key={course.id}
                      onClick={() => navigate(`/learn/course/${course.slug}`)}
                      type="button"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="font-headline text-sm font-extrabold text-on-background">
                            {course.title}
                          </h3>
                          <p className="font-body text-xs text-on-surface-variant mt-1">
                            {course.category} · {course.level}
                          </p>
                        </div>
                        <span className="rounded-full bg-primary-container text-on-primary-container px-3 py-1 font-headline text-xs font-bold shrink-0">
                          +{course.gapClosed} skill{course.gapClosed === 1 ? '' : 's'}
                        </span>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {course.coversSkills.slice(0, 8).map((skill) => (
                          <span
                            className="rounded-full bg-surface-container-lowest px-2.5 py-0.5 font-body text-[11px] text-on-surface-variant"
                            key={skill}
                          >
                            {skill}
                          </span>
                        ))}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </section>
          </>
        ) : null}
      </div>
    </main>
  )
}

export default SkillGapPage
