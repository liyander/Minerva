import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PageHeader from '../../components/PageHeader'
import {
  fetchAssessmentSubjects,
  fetchTrainers,
  matchTrainers,
  verifyCompetency,
} from '../../services/training'

function scoreTone(score) {
  if (score >= 70) return 'bg-mint text-on-mint'
  if (score >= 45) return 'bg-butter text-on-butter'
  return 'bg-surface-container-high text-on-surface-variant'
}

function AdminCompetencyPage() {
  const navigate = useNavigate()
  const [subjects, setSubjects] = useState([])
  const [subject, setSubject] = useState('')
  const [matches, setMatches] = useState(null)
  const [trainers, setTrainers] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([fetchAssessmentSubjects(), fetchTrainers()])
      .then(([subjectRows, trainerRows]) => {
        setSubjects(subjectRows)
        setTrainers(trainerRows)
      })
      .catch((loadError) => setError(loadError?.message || 'Could not load data.'))
  }, [])

  const runMatch = useCallback(async (target) => {
    if (!target) return
    setIsLoading(true)
    setError('')
    try {
      setMatches(await matchTrainers(target))
    } catch (matchError) {
      setError(matchError?.message || 'Could not run the match.')
      setMatches(null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  return (
    <main className="min-h-screen bg-surface px-5 py-8 sm:px-8 lg:px-10 pt-24">
      <div className="mx-auto max-w-5xl space-y-6">
        <button
          className="inline-flex items-center gap-1 font-headline text-sm font-bold text-on-surface-variant hover:text-on-surface transition-colors"
          onClick={() => navigate('/admin')}
          type="button"
        >
          <span className="material-symbols-outlined text-base">arrow_back</span>
          Back to admin
        </button>

        <PageHeader
          accent="mint"
          description="Find the best-suited trainers for a subject. Ranking combines declared proficiency and experience with published material, authored assessments and how their trainees actually score."
          eyebrow="Competency mapping"
          icon="hub"
          title="Match trainers to subjects"
        />

        {error ? (
          <div className="rounded-2xl bg-blush p-4">
            <p className="font-body text-sm text-on-blush">{error}</p>
          </div>
        ) : null}

        <section className="rounded-3xl bg-surface-container-lowest p-6 shadow-soft">
          <h2 className="font-headline text-lg font-extrabold text-on-background mb-4">
            Choose a subject
          </h2>
          <div className="flex flex-wrap gap-2">
            {subjects.map((item) => (
              <button
                className={`rounded-full px-4 py-2 font-headline text-sm font-bold transition-colors ${
                  subject === item
                    ? 'bg-primary text-on-primary'
                    : 'bg-surface-container text-on-surface-variant hover:text-on-surface'
                }`}
                key={item}
                onClick={() => {
                  setSubject(item)
                  void runMatch(item)
                }}
                type="button"
              >
                {item}
              </button>
            ))}
          </div>
          {subjects.length === 0 ? (
            <p className="font-body text-sm text-on-surface-variant">
              No subjects defined yet — add course categories first.
            </p>
          ) : null}
        </section>

        {isLoading ? (
          <div className="rounded-3xl bg-surface-container-lowest p-12 text-center shadow-soft">
            <div className="mx-auto h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
          </div>
        ) : null}

        {matches && !isLoading ? (
          <section className="rounded-3xl bg-surface-container-lowest p-6 shadow-soft">
            <h2 className="font-headline text-lg font-extrabold text-on-background mb-4">
              Suitable trainers for {matches.subject}
            </h2>

            {matches.trainers.length === 0 ? (
              <p className="font-body text-sm text-on-surface-variant py-6 text-center">
                No trainer has declared competency in this subject yet.
              </p>
            ) : (
              <div className="space-y-3">
                {matches.trainers.map((trainer, index) => (
                  <article className="rounded-2xl bg-surface-container p-5" key={trainer.trainerId}>
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="flex items-start gap-3 min-w-0">
                        <span className="h-10 w-10 shrink-0 rounded-full bg-primary-container text-on-primary-container inline-flex items-center justify-center font-headline font-bold">
                          {index + 1}
                        </span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-headline text-base font-extrabold text-on-background">
                              {trainer.name}
                            </h3>
                            {trainer.isVerified ? (
                              <span className="rounded-full bg-mint text-on-mint px-2.5 py-0.5 font-headline text-xs font-bold">
                                Verified
                              </span>
                            ) : null}
                          </div>
                          <p className="font-body text-xs text-on-surface-variant mt-1">
                            {trainer.headline || trainer.email}
                            {trainer.department ? ` · ${trainer.department}` : ''}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <span
                          className={`rounded-full px-4 py-2 font-headline text-sm font-bold ${scoreTone(trainer.matchScore)}`}
                        >
                          {trainer.matchScore}/100
                        </span>
                        <button
                          className="rounded-full bg-surface-container-high px-4 py-2 font-headline text-xs font-bold text-on-surface hover:opacity-90 transition-opacity"
                          onClick={async () => {
                            const competencyId = trainer.competencyId
                            if (!competencyId) {
                              setError(
                                'Verification needs the competency id — reload the page and try again.',
                              )
                              return
                            }
                            await verifyCompetency(competencyId, !trainer.isVerified)
                            await runMatch(matches.subject)
                          }}
                          type="button"
                        >
                          {trainer.isVerified ? 'Unverify' : 'Verify'}
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 sm:grid-cols-5 gap-3">
                      {[
                        { label: 'Level', value: trainer.proficiency },
                        { label: 'Experience', value: `${trainer.yearsExperience} yrs` },
                        { label: 'Resources', value: trainer.resourcesPublished },
                        { label: 'Assessments', value: trainer.assessmentsAuthored },
                        {
                          label: 'Trainee avg',
                          value:
                            trainer.avgTraineeScore === null ? '—' : `${trainer.avgTraineeScore}%`,
                        },
                      ].map((stat) => (
                        <div className="rounded-xl bg-surface-container-lowest px-3 py-2" key={stat.label}>
                          <p className="font-headline text-sm font-bold text-on-surface">
                            {stat.value}
                          </p>
                          <p className="font-body text-[11px] text-on-surface-variant">{stat.label}</p>
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        ) : null}

        <section className="rounded-3xl bg-surface-container-lowest p-6 shadow-soft">
          <h2 className="font-headline text-lg font-extrabold text-on-background mb-4">
            All trainers ({trainers.length})
          </h2>

          {trainers.length === 0 ? (
            <p className="font-body text-sm text-on-surface-variant py-4">
              No approved trainers yet.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {trainers.map((trainer) => (
                <article className="rounded-2xl bg-surface-container p-4" key={trainer.id}>
                  <h3 className="font-headline text-sm font-extrabold text-on-background">
                    {trainer.name}
                  </h3>
                  <p className="font-body text-xs text-on-surface-variant mt-1">
                    {trainer.headline || 'No headline'} · {trainer.resources} resources
                    {trainer.rating ? ` · ★ ${trainer.rating}` : ''}
                  </p>
                  {trainer.subjects.length ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {trainer.subjects.map((item) => (
                        <span
                          className="rounded-full bg-secondary-container text-on-secondary-container px-2.5 py-0.5 font-headline text-[11px] font-bold"
                          key={item}
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="font-body text-xs text-on-surface-variant mt-2">
                      No subjects declared.
                    </p>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}

export default AdminCompetencyPage
