import { useCallback, useEffect, useState } from 'react'
import PageHeader from '../components/PageHeader'
import { roleLabel } from '../auth'
import {
  addProfileEntry,
  deleteProfileEntry,
  fetchMyProfile,
  updateMyProfile,
} from '../services/training'

// Each section is a flat list with its own small form, so one config drives them all.
const SECTIONS = [
  {
    key: 'qualifications',
    title: 'Qualifications',
    icon: 'school',
    accent: 'bg-sky text-on-sky',
    fields: [
      { name: 'qualification', label: 'Qualification', required: true, placeholder: 'BSc Computer Science' },
      { name: 'institution', label: 'Institution', placeholder: 'University of…' },
      { name: 'fieldOfStudy', label: 'Field of study', placeholder: 'Computer Science' },
      { name: 'grade', label: 'Grade', placeholder: 'First class' },
      { name: 'startYear', label: 'From', type: 'number', placeholder: '2019' },
      { name: 'endYear', label: 'To', type: 'number', placeholder: '2022' },
    ],
    primary: (row) => row.qualification,
    secondary: (row) =>
      [row.institution, row.fieldOfStudy, [row.startYear, row.endYear].filter(Boolean).join('–')]
        .filter(Boolean)
        .join(' · '),
  },
  {
    key: 'experience',
    title: 'Work experience',
    icon: 'work',
    accent: 'bg-mint text-on-mint',
    fields: [
      { name: 'jobTitle', label: 'Job title', required: true, placeholder: 'Data Analyst' },
      { name: 'organisation', label: 'Organisation', placeholder: 'Acme Ltd' },
      { name: 'location', label: 'Location', placeholder: 'Chennai' },
      { name: 'startedOn', label: 'Started', type: 'date' },
      { name: 'endedOn', label: 'Ended', type: 'date' },
      { name: 'description', label: 'What you did', type: 'textarea', full: true },
    ],
    primary: (row) => row.jobTitle,
    secondary: (row) =>
      [row.organisation, row.location, row.startedOn ? new Date(row.startedOn).getFullYear() : null]
        .filter(Boolean)
        .join(' · '),
  },
  {
    key: 'skills',
    title: 'Skills',
    icon: 'bolt',
    accent: 'bg-butter text-on-butter',
    fields: [
      { name: 'skill', label: 'Skill', required: true, placeholder: 'SQL' },
      {
        name: 'proficiency',
        label: 'Level',
        type: 'select',
        options: ['Beginner', 'Intermediate', 'Advanced', 'Expert'],
      },
    ],
    primary: (row) => row.skill,
    secondary: (row) => row.proficiency,
    compact: true,
  },
  {
    key: 'interests',
    title: 'Interests',
    icon: 'interests',
    accent: 'bg-lavender text-on-lavender',
    fields: [{ name: 'interest', label: 'Interest', required: true, placeholder: 'Machine learning' }],
    primary: (row) => row.interest,
    secondary: () => '',
    compact: true,
  },
  {
    key: 'certificates',
    title: 'Certificates',
    icon: 'workspace_premium',
    accent: 'bg-blush text-on-blush',
    fields: [
      { name: 'title', label: 'Title', required: true, placeholder: 'AWS Cloud Practitioner' },
      { name: 'issuer', label: 'Issued by', placeholder: 'Amazon Web Services' },
      { name: 'credentialId', label: 'Credential ID' },
      { name: 'credentialUrl', label: 'Verification link', placeholder: 'https://…' },
      { name: 'issuedOn', label: 'Issued on', type: 'date' },
      { name: 'expiresOn', label: 'Expires on', type: 'date' },
    ],
    primary: (row) => row.title,
    secondary: (row) =>
      [row.issuer, row.issuedOn ? new Date(row.issuedOn).toLocaleDateString() : null]
        .filter(Boolean)
        .join(' · '),
  },
]

const fieldClass =
  'mt-1.5 w-full rounded-xl bg-surface-container-lowest border border-transparent focus:border-primary focus:ring-0 font-body text-sm py-2.5 px-3.5 outline-none'

function SectionForm({ section, onSubmit, onCancel }) {
  const [values, setValues] = useState({})
  const [busy, setBusy] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    try {
      await onSubmit(values)
      setValues({})
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="rounded-2xl bg-surface-container p-5 space-y-4" onSubmit={submit}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {section.fields.map((field) => (
          <label className={`block ${field.full ? 'sm:col-span-2' : ''}`} key={field.name}>
            <span className="font-headline text-xs font-bold text-on-surface-variant">
              {field.label}
              {field.required ? ' *' : ''}
            </span>
            {field.type === 'textarea' ? (
              <textarea
                className={fieldClass}
                onChange={(e) => setValues((v) => ({ ...v, [field.name]: e.target.value }))}
                rows={3}
                value={values[field.name] || ''}
              />
            ) : field.type === 'select' ? (
              <select
                className={fieldClass}
                onChange={(e) => setValues((v) => ({ ...v, [field.name]: e.target.value }))}
                value={values[field.name] || field.options[1]}
              >
                {field.options.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className={fieldClass}
                onChange={(e) => setValues((v) => ({ ...v, [field.name]: e.target.value }))}
                placeholder={field.placeholder}
                type={field.type || 'text'}
                value={values[field.name] || ''}
              />
            )}
          </label>
        ))}
      </div>

      <div className="flex gap-3">
        <button
          className="rounded-full bg-primary px-5 py-2.5 font-headline text-sm font-bold text-on-primary hover:opacity-90 transition-opacity disabled:opacity-60"
          disabled={busy}
          type="submit"
        >
          {busy ? 'Saving…' : 'Add'}
        </button>
        <button
          className="rounded-full bg-surface-container-high px-5 py-2.5 font-headline text-sm font-bold text-on-surface"
          onClick={onCancel}
          type="button"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

function ProfessionalProfilePage() {
  const [profile, setProfile] = useState(null)
  const [openSection, setOpenSection] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [about, setAbout] = useState({ headline: '', aboutMe: '', department: '', phone: '' })
  const [savingAbout, setSavingAbout] = useState(false)

  const load = useCallback(async () => {
    setError('')
    try {
      const data = await fetchMyProfile()
      setProfile(data)
      setAbout({
        headline: data.user.headline || '',
        aboutMe: data.user.aboutMe || '',
        department: data.user.department || '',
        phone: data.user.phone || '',
      })
    } catch (loadError) {
      setError(loadError?.message || 'Could not load your profile.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const handleAdd = async (sectionKey, values) => {
    try {
      await addProfileEntry(sectionKey, values)
      setOpenSection('')
      await load()
    } catch (addError) {
      setError(addError?.message || 'Could not save that entry.')
    }
  }

  const handleDelete = async (sectionKey, id) => {
    try {
      await deleteProfileEntry(sectionKey, id)
      await load()
    } catch (deleteError) {
      setError(deleteError?.message || 'Could not remove that entry.')
    }
  }

  const saveAbout = async (event) => {
    event.preventDefault()
    setSavingAbout(true)
    try {
      await updateMyProfile(about)
      await load()
    } catch (saveError) {
      setError(saveError?.message || 'Could not save your details.')
    } finally {
      setSavingAbout(false)
    }
  }

  if (isLoading) {
    return (
      <main className="min-h-screen bg-surface flex items-center justify-center pt-24">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
      </main>
    )
  }

  const completeness = SECTIONS.filter((section) => (profile?.[section.key] || []).length).length
  const percentage = Math.round((completeness / SECTIONS.length) * 100)

  return (
    <main className="min-h-screen bg-surface px-5 py-8 sm:px-8 lg:px-10 pt-24 pb-24 md:pb-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <PageHeader
          accent="primary"
          description="Qualifications, experience, skills, interests and certificates — the profile trainers and admins see."
          eyebrow={roleLabel(profile?.user?.role)}
          icon="badge"
          title={
            [profile?.user?.firstName, profile?.user?.lastName].filter(Boolean).join(' ') ||
            profile?.user?.username ||
            'Your profile'
          }
        />

        {error ? (
          <div className="rounded-2xl bg-blush p-4">
            <p className="font-body text-sm text-on-blush">{error}</p>
          </div>
        ) : null}

        <section className="rounded-3xl bg-surface-container-lowest p-6 shadow-soft">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 className="font-headline text-lg font-extrabold text-on-background">
              Profile completeness
            </h2>
            <span className="font-headline text-2xl font-extrabold text-primary">{percentage}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-surface-container-high overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-700"
              style={{ width: `${Math.max(percentage, 2)}%` }}
            ></div>
          </div>
          <p className="font-body text-xs text-on-surface-variant mt-2">
            {completeness} of {SECTIONS.length} sections filled in.
          </p>
        </section>

        <section className="rounded-3xl bg-surface-container-lowest p-6 shadow-soft">
          <h2 className="font-headline text-lg font-extrabold text-on-background mb-4">About you</h2>
          <form className="space-y-4" onSubmit={saveAbout}>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <label className="block sm:col-span-2">
                <span className="font-headline text-xs font-bold text-on-surface-variant">
                  Headline
                </span>
                <input
                  className={fieldClass}
                  onChange={(e) => setAbout((a) => ({ ...a, headline: e.target.value }))}
                  placeholder="Aspiring data analyst"
                  value={about.headline}
                />
              </label>
              <label className="block">
                <span className="font-headline text-xs font-bold text-on-surface-variant">
                  Department
                </span>
                <input
                  className={fieldClass}
                  onChange={(e) => setAbout((a) => ({ ...a, department: e.target.value }))}
                  value={about.department}
                />
              </label>
            </div>
            <label className="block">
              <span className="font-headline text-xs font-bold text-on-surface-variant">
                Summary
              </span>
              <textarea
                className={fieldClass}
                onChange={(e) => setAbout((a) => ({ ...a, aboutMe: e.target.value }))}
                placeholder="A short paragraph about your background and what you want to learn."
                rows={3}
                value={about.aboutMe}
              />
            </label>
            <button
              className="rounded-full bg-primary px-5 py-2.5 font-headline text-sm font-bold text-on-primary hover:opacity-90 transition-opacity disabled:opacity-60"
              disabled={savingAbout}
              type="submit"
            >
              {savingAbout ? 'Saving…' : 'Save details'}
            </button>
          </form>
        </section>

        {SECTIONS.map((section) => {
          const rows = profile?.[section.key] || []

          return (
            <section className="rounded-3xl bg-surface-container-lowest p-6 shadow-soft" key={section.key}>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-3">
                  <span className={`h-10 w-10 rounded-2xl flex items-center justify-center ${section.accent}`}>
                    <span className="material-symbols-outlined text-[20px]">{section.icon}</span>
                  </span>
                  <h2 className="font-headline text-lg font-extrabold text-on-background">
                    {section.title}
                  </h2>
                  <span className="rounded-full bg-surface-container-high px-2.5 py-0.5 font-headline text-xs font-bold text-on-surface-variant">
                    {rows.length}
                  </span>
                </div>
                <button
                  className="rounded-full bg-surface-container-high px-4 py-2 font-headline text-sm font-bold text-on-surface hover:opacity-90 transition-opacity"
                  onClick={() =>
                    setOpenSection((current) => (current === section.key ? '' : section.key))
                  }
                  type="button"
                >
                  {openSection === section.key ? 'Close' : 'Add'}
                </button>
              </div>

              {openSection === section.key ? (
                <div className="mb-4">
                  <SectionForm
                    onCancel={() => setOpenSection('')}
                    onSubmit={(values) => handleAdd(section.key, values)}
                    section={section}
                  />
                </div>
              ) : null}

              {rows.length === 0 ? (
                <p className="font-body text-sm text-on-surface-variant py-4">
                  Nothing added yet.
                </p>
              ) : section.compact ? (
                <div className="flex flex-wrap gap-2">
                  {rows.map((row) => (
                    <span
                      className="inline-flex items-center gap-2 rounded-full bg-surface-container px-4 py-2"
                      key={row.id}
                    >
                      <span className="font-headline text-sm font-bold text-on-surface">
                        {section.primary(row)}
                      </span>
                      {section.secondary(row) ? (
                        <span className="font-body text-xs text-on-surface-variant">
                          {section.secondary(row)}
                        </span>
                      ) : null}
                      <button
                        aria-label={`Remove ${section.primary(row)}`}
                        className="text-on-surface-variant hover:text-error transition-colors"
                        onClick={() => handleDelete(section.key, row.id)}
                        type="button"
                      >
                        <span className="material-symbols-outlined text-sm">close</span>
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {rows.map((row) => (
                    <article
                      className="rounded-2xl bg-surface-container p-4 flex items-start justify-between gap-3"
                      key={row.id}
                    >
                      <div className="min-w-0">
                        <p className="font-headline text-sm font-extrabold text-on-background">
                          {section.primary(row)}
                        </p>
                        {section.secondary(row) ? (
                          <p className="font-body text-xs text-on-surface-variant mt-1">
                            {section.secondary(row)}
                          </p>
                        ) : null}
                        {row.description ? (
                          <p className="font-body text-sm text-on-surface-variant mt-2">
                            {row.description}
                          </p>
                        ) : null}
                        {row.credentialUrl ? (
                          <a
                            className="font-body text-xs text-primary hover:underline mt-1 inline-block"
                            href={row.credentialUrl}
                            rel="noreferrer"
                            target="_blank"
                          >
                            Verify credential
                          </a>
                        ) : null}
                      </div>
                      <button
                        aria-label="Remove entry"
                        className="text-on-surface-variant hover:text-error transition-colors shrink-0"
                        onClick={() => handleDelete(section.key, row.id)}
                        type="button"
                      >
                        <span className="material-symbols-outlined text-base">delete</span>
                      </button>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )
        })}
      </div>
    </main>
  )
}

export default ProfessionalProfilePage
