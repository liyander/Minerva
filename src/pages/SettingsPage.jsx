import { useEffect, useState } from 'react'
import { getAuthSession } from '../auth'
import { apiFetch } from '../services/api'

const emptyProject = () => ({
  projectName: '',
  projectDescription: '',
  beneficiaries: '',
  stackUsed: '',
  projectLink: '',
})

const emptyAchievement = () => ({
  awardName: '',
  description: '',
  pocLink: '',
})

const careerEvidenceFields = [
  {
    key: 'hardSkills',
    label: 'Hard Skills',
    placeholder: 'Linux, networking, incident response, Docker, Terraform...',
  },
  {
    key: 'softSkills',
    label: 'Soft Skills',
    placeholder: 'Communication, documentation, teamwork, report writing...',
  },
  {
    key: 'tools',
    label: 'Tools',
    placeholder: 'Splunk, Burp Suite, Wireshark, Nessus, GitHub Actions...',
  },
  {
    key: 'techStack',
    label: 'Stack',
    placeholder: 'AWS, Azure, Python, Bash, Kubernetes, SIEM...',
  },
  {
    key: 'internships',
    label: 'Internships',
    placeholder: 'Company, role, duration, and what you handled...',
  },
  {
    key: 'certifications',
    label: 'Certifications',
    placeholder: 'Security+, AZ-900, AWS Cloud Practitioner, ISC2 CC...',
  },
]

const emptyCareerEvidence = careerEvidenceFields.reduce(
  (acc, field) => ({ ...acc, [field.key]: '' }),
  {},
)

function parseProjects(value) {
  if (!value) {
    return [emptyProject()]
  }

  if (Array.isArray(value)) {
    return value.length ? value : [emptyProject()]
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed) && parsed.length) {
        return parsed.map((project) => ({
          projectName: project.projectName || '',
          projectDescription: project.projectDescription || '',
          beneficiaries: project.beneficiaries || '',
          stackUsed: project.stackUsed || '',
          projectLink: project.projectLink || '',
        }))
      }
    } catch {
      return [{ ...emptyProject(), projectDescription: value }]
    }
  }

  return [emptyProject()]
}

function parseAchievements(value) {
  if (!value) {
    return [emptyAchievement()]
  }

  if (Array.isArray(value)) {
    return value.length ? value : [emptyAchievement()]
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed) && parsed.length) {
        return parsed.map((achievement) => ({
          awardName: achievement.awardName || '',
          description: achievement.description || '',
          pocLink: achievement.pocLink || '',
        }))
      }
    } catch {
      return [{ ...emptyAchievement(), description: value }]
    }
  }

  return [emptyAchievement()]
}

function serializeProjects(projects) {
  const normalized = (projects || []).filter(
    (project) =>
      project.projectName?.trim() ||
      project.projectDescription?.trim() ||
      project.beneficiaries?.trim() ||
      project.stackUsed?.trim() ||
      project.projectLink?.trim(),
  )

  return JSON.stringify(normalized)
}

function serializeAchievements(achievements) {
  const normalized = (achievements || []).filter(
    (achievement) =>
      achievement.awardName?.trim() ||
      achievement.description?.trim() ||
      achievement.pocLink?.trim(),
  )

  return JSON.stringify(normalized)
}

function ProfileLabelWithLogo({ logo, text }) {
  return (
    <span className="flex items-center gap-2 font-headline text-xs text-on-surface-variant font-bold">
      <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full ${logo.bgClass}`}>
        <img alt={logo.alt} className="h-3.5 w-3.5 object-contain" src={logo.src} />
      </span>
      {text}
    </span>
  )
}

const profileLogos = {
  htb: {
    src: 'https://cdn.simpleicons.org/googlechrome',
    alt: 'Portfolio',
    bgClass: 'bg-[#0ea5e9]',
  },
  thm: {
    src: 'https://cdn.simpleicons.org/stackoverflow',
    alt: 'Stack Overflow',
    bgClass: 'bg-[#f48024]',
  },
  pico: {
    src: 'https://cdn.simpleicons.org/kaggle',
    alt: 'Kaggle',
    bgClass: 'bg-[#20beff]',
  },
  resume: {
    src: 'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/icons/file-earmark-person.svg',
    alt: 'Resume',
    bgClass: 'bg-[#0ea5e9]',
  },
  github: {
    src: 'https://cdn.simpleicons.org/github',
    alt: 'GitHub',
    bgClass: 'bg-[#24292f]',
  },
  linkedin: {
    src: 'https://cdn.simpleicons.org/linkedin',
    alt: 'LinkedIn',
    bgClass: 'bg-[#0a66c2]',
  },
}

function SettingsPage() {
  const authSession = getAuthSession()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [passwordModalOpen, setPasswordModalOpen] = useState(false)
  const [passwordSuccessModalOpen, setPasswordSuccessModalOpen] = useState(false)
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })
  const [form, setForm] = useState({
    username: authSession?.username || '',
    registration_number: authSession?.registrationNumber || '',
    first_name: '',
    last_name: '',
    email: authSession?.email || '',
    hackthebox_profile: '',
    tryhackme_profile: '',
    picoctf_profile: '',
    github_profile: '',
    linkedin_profile: '',
    resume_url: '',
    about_me: '',
    projects: [emptyProject()],
    achievements: [emptyAchievement()],
  })
  const [careerEvidence, setCareerEvidence] = useState(emptyCareerEvidence)
  const [resumeVault, setResumeVault] = useState({ eligible: false, rank: null, resume: null })
  const [resumeFile, setResumeFile] = useState(null)
  const [resumeUploading, setResumeUploading] = useState(false)

  useEffect(() => {
    let cancelled = false

    const loadProfile = async () => {
      try {
        const [data, careerData, resumeData] = await Promise.all([
          apiFetch('/users/me'),
          apiFetch('/jobs/profile').catch(() => emptyCareerEvidence),
          apiFetch('/resumes/me').catch(() => ({ eligible: false, rank: null, resume: null })),
        ])
        if (!cancelled) {
          setForm({
            username: data.username || '',
            registration_number: data.registration_number || '',
            first_name: data.first_name || '',
            last_name: data.last_name || '',
            email: data.email || '',
            hackthebox_profile: data.hackthebox_profile || '',
            tryhackme_profile: data.tryhackme_profile || '',
            picoctf_profile: data.picoctf_profile || '',
            github_profile: data.github_profile || '',
            linkedin_profile: data.linkedin_profile || '',
            resume_url: data.resume_url || '',
            about_me: data.about_me || '',
            projects: parseProjects(data.projects),
            achievements: parseAchievements(data.achievements),
          })
          setCareerEvidence({
            ...emptyCareerEvidence,
            internships: careerData?.internships || '',
            softSkills: careerData?.softSkills || '',
            hardSkills: careerData?.hardSkills || '',
            tools: careerData?.tools || '',
            techStack: careerData?.techStack || '',
            certifications: careerData?.certifications || '',
          })
          setResumeVault({
            eligible: Boolean(resumeData?.eligible),
            rank: resumeData?.rank || null,
            resume: resumeData?.resume || null,
          })
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError?.message || 'Failed to load settings')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadProfile()

    return () => {
      cancelled = true
    }
  }, [])

  const updateField = (name, value) => {
    setForm((current) => ({ ...current, [name]: value }))
  }

  const updateCareerEvidence = (name, value) => {
    setCareerEvidence((current) => ({ ...current, [name]: value }))
  }

  const updateProjectField = (index, field, value) => {
    setForm((current) => ({
      ...current,
      projects: current.projects.map((project, projectIndex) =>
        projectIndex === index ? { ...project, [field]: value } : project,
      ),
    }))
  }

  const addProject = () => {
    setForm((current) => ({
      ...current,
      projects: [...current.projects, emptyProject()],
    }))
  }

  const removeProject = (index) => {
    setForm((current) => {
      const next = current.projects.filter((_, projectIndex) => projectIndex !== index)
      return { ...current, projects: next.length ? next : [emptyProject()] }
    })
  }

  const updateAchievementField = (index, field, value) => {
    setForm((current) => ({
      ...current,
      achievements: current.achievements.map((achievement, achievementIndex) =>
        achievementIndex === index ? { ...achievement, [field]: value } : achievement,
      ),
    }))
  }

  const addAchievement = () => {
    setForm((current) => ({
      ...current,
      achievements: [...current.achievements, emptyAchievement()],
    }))
  }

  const removeAchievement = (index) => {
    setForm((current) => {
      const next = current.achievements.filter((_, achievementIndex) => achievementIndex !== index)
      return { ...current, achievements: next.length ? next : [emptyAchievement()] }
    })
  }

  const handleSave = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    setSuccess('')

    try {
      const payload = {
        first_name: form.first_name,
        last_name: form.last_name,
        email: form.email,
        hackthebox_profile: form.hackthebox_profile,
        tryhackme_profile: form.tryhackme_profile,
        picoctf_profile: form.picoctf_profile,
        github_profile: form.github_profile,
        linkedin_profile: form.linkedin_profile,
        resume_url: form.resume_url,
        about_me: form.about_me,
        projects: serializeProjects(form.projects),
        achievements: serializeAchievements(form.achievements),
      }

      const updated = await apiFetch('/users/me', {
        method: 'PUT',
        body: JSON.stringify(payload),
      })

      await apiFetch('/jobs/profile', {
        method: 'PUT',
        body: JSON.stringify({
          ...careerEvidence,
          projects: serializeProjects(form.projects),
          achievements: serializeAchievements(form.achievements),
        }),
      })

      setForm((current) => ({
        ...current,
        email: updated.email || '',
        hackthebox_profile: updated.hackthebox_profile || '',
        tryhackme_profile: updated.tryhackme_profile || '',
        picoctf_profile: updated.picoctf_profile || '',
        github_profile: updated.github_profile || '',
        linkedin_profile: updated.linkedin_profile || '',
        resume_url: updated.resume_url || '',
        about_me: updated.about_me || '',
        projects: parseProjects(updated.projects),
        achievements: parseAchievements(updated.achievements),
      }))
      setSuccess('Settings saved successfully. Job recommendations were re-analyzed from your latest career evidence.')
    } catch (saveError) {
      setError(saveError?.message || 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  const openPasswordModal = () => {
    setPasswordForm({
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    })
    setPasswordModalOpen(true)
  }

  const changePassword = async (event) => {
    event.preventDefault()
    setChangingPassword(true)
    setError('')
    setSuccess('')

    try {
      if (passwordForm.newPassword !== passwordForm.confirmPassword) {
        throw new Error('Passwords do not match')
      }

      await apiFetch('/users/me/password', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        }),
      })

      setPasswordModalOpen(false)
      setPasswordForm({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      })
      setPasswordSuccessModalOpen(true)
    } catch (passwordError) {
      setError(passwordError?.message || 'Failed to change password')
    } finally {
      setChangingPassword(false)
    }
  }

  const uploadResume = async () => {
    if (!resumeFile) {
      setError('Choose a resume file before uploading.')
      return
    }

    setResumeUploading(true)
    setError('')
    setSuccess('')

    try {
      const fileData = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result || '').split(',').pop() || '')
        reader.onerror = () => reject(new Error('Unable to read resume file'))
        reader.readAsDataURL(resumeFile)
      })

      const updated = await apiFetch('/resumes/me', {
        method: 'POST',
        body: JSON.stringify({
          fileName: resumeFile.name,
          mimeType: resumeFile.type || 'application/octet-stream',
          fileSize: resumeFile.size,
          fileData,
        }),
      })

      setResumeVault({
        eligible: Boolean(updated?.eligible),
        rank: updated?.rank || resumeVault.rank,
        resume: updated?.resume || null,
      })
      setResumeFile(null)
      setSuccess('Resume uploaded to the top-player vault.')
    } catch (uploadError) {
      setError(uploadError?.message || 'Failed to upload resume')
    } finally {
      setResumeUploading(false)
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen pt-24 px-6 flex items-center justify-center">
        <p className="text-on-surface-variant">Loading settings...</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen pt-24 px-6 md:px-10 py-10 bg-surface">
      <section className="max-w-5xl mx-auto">
        <header className="rounded-2xl bg-surface-container-lowest shadow-soft p-8 md:p-10 mb-8">
          <p className="font-headline text-xs text-primary font-bold">
            Player Settings
          </p>
          <h1 className="font-headline text-4xl md:text-5xl font-extrabold tracking-tight mt-3">
            Profile & Career Presence
          </h1>
          <p className="text-sm text-on-surface-variant mt-4 max-w-2xl">
            Update your public operator profile, challenge platform handles, resume link, projects, and achievements.
          </p>
        </header>

        {error ? (
          <div className="rounded-2xl mb-6 bg-error/10 shadow-soft p-4">
            <p className="text-error font-headline text-sm font-bold">{error}</p>
          </div>
        ) : null}

        {success ? (
          <div className="rounded-2xl mb-6 bg-secondary/10 shadow-soft p-4">
            <p className="text-secondary font-headline text-sm font-bold">{success}</p>
          </div>
        ) : null}

        <form className="space-y-8" onSubmit={handleSave}>
          <section className="rounded-2xl bg-surface-container-lowest p-8 space-y-5">
            <h2 className="font-headline text-xl font-bold tracking-tight">Identity</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <label className="block">
                <span className="font-headline text-xs text-on-surface-variant font-bold">Username (locked)</span>
                <input
                  className="rounded-xl mt-2 w-full bg-surface-container-highest border-l-2 border-l-outline-variant border-t-0 border-r-0 border-b-0 py-3 px-4 outline-none"
                  disabled
                  type="text"
                  value={form.username}
                />
              </label>
              <label className="block">
                <span className="font-headline text-xs text-on-surface-variant font-bold">Registration Number</span>
                <input
                  className="rounded-xl mt-2 w-full bg-surface-container-highest  border-t-0 border-r-0 border-b-0 py-3 px-4 outline-none"
                  disabled
                  type="text"
                  value={form.registration_number}
                />
              </label>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <label className="block">
                <span className="font-headline text-xs text-on-surface-variant font-bold">First Name</span>
                <input
                  className="rounded-xl mt-2 w-full bg-surface-container-highest  border-t-0 border-r-0 border-b-0 py-3 px-4 outline-none"
                  onChange={(e) => updateField('first_name', e.target.value)}
                  type="text"
                  value={form.first_name}
                />
              </label>
              <label className="block">
                <span className="font-headline text-xs text-on-surface-variant font-bold">Last Name</span>
                <input
                  className="rounded-xl mt-2 w-full bg-surface-container-highest  border-t-0 border-r-0 border-b-0 py-3 px-4 outline-none"
                  onChange={(e) => updateField('last_name', e.target.value)}
                  type="text"
                  value={form.last_name}
                />
              </label>
            </div>
            <label className="block">
              <span className="font-headline text-xs text-on-surface-variant font-bold">Email</span>
              <input
                className="rounded-xl mt-2 w-full bg-surface-container-highest  border-t-0 border-r-0 border-b-0 py-3 px-4 outline-none"
                onChange={(e) => updateField('email', e.target.value)}
                type="email"
                value={form.email}
              />
            </label>
          </section>

          <section className="rounded-2xl bg-surface-container-lowest p-8 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <h2 className="font-headline text-xl font-bold tracking-tight">Password</h2>
                <p className="text-sm text-on-surface-variant mt-2">
                  Change your account password by confirming your current password first.
                </p>
              </div>
              <button
                className="rounded-full px-5 py-3 bg-primary text-on-primary font-headline text-sm font-bold"
                onClick={openPasswordModal}
                type="button"
              >
                Change Password
              </button>
            </div>
          </section>

          <section className="rounded-2xl bg-surface-container-lowest p-8 space-y-5">
            <h2 className="font-headline text-xl font-bold tracking-tight">About & Portfolio</h2>
            <label className="block">
              <span className="font-headline text-xs text-on-surface-variant font-bold">Description About You</span>
              <textarea
                className="rounded-xl mt-2 w-full bg-surface-container-highest  border-t-0 border-r-0 border-b-0 py-3 px-4 outline-none resize-y"
                onChange={(e) => updateField('about_me', e.target.value)}
                rows={4}
                value={form.about_me}
              />
            </label>
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <span className="font-headline text-xs text-on-surface-variant font-bold">Projects</span>
                <button
                  className="rounded-full px-4 py-2 bg-primary text-on-primary font-headline text-sm font-bold"
                  onClick={addProject}
                  type="button"
                >
                  Add Project
                </button>
              </div>
              {form.projects.map((project, index) => (
                <div className="rounded-2xl bg-surface-container-high p-4 space-y-3" key={`project-${index + 1}`}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-headline text-xs font-bold text-on-background">Project {index + 1}</p>
                    <button
                      className="rounded-full px-3 py-1 bg-surface-container-highest text-on-surface-variant font-headline text-xs font-bold hover:text-error transition-colors"
                      onClick={() => removeProject(index)}
                      type="button"
                    >
                      Remove
                    </button>
                  </div>
                  <input
                    className="rounded-xl w-full bg-surface-container-highest  border-t-0 border-r-0 border-b-0 py-3 px-4 outline-none"
                    onChange={(e) => updateProjectField(index, 'projectName', e.target.value)}
                    placeholder="Project Name"
                    type="text"
                    value={project.projectName}
                  />
                  <textarea
                    className="rounded-xl w-full bg-surface-container-highest  border-t-0 border-r-0 border-b-0 py-3 px-4 outline-none resize-y"
                    onChange={(e) => updateProjectField(index, 'projectDescription', e.target.value)}
                    placeholder="Project Description"
                    rows={3}
                    value={project.projectDescription}
                  />
                  <input
                    className="rounded-xl w-full bg-surface-container-highest  border-t-0 border-r-0 border-b-0 py-3 px-4 outline-none"
                    onChange={(e) => updateProjectField(index, 'beneficiaries', e.target.value)}
                    placeholder="Beneficiaries"
                    type="text"
                    value={project.beneficiaries}
                  />
                  <input
                    className="rounded-xl w-full bg-surface-container-highest  border-t-0 border-r-0 border-b-0 py-3 px-4 outline-none"
                    onChange={(e) => updateProjectField(index, 'stackUsed', e.target.value)}
                    placeholder="Stack Used"
                    type="text"
                    value={project.stackUsed}
                  />
                  <input
                    className="rounded-xl w-full bg-surface-container-highest  border-t-0 border-r-0 border-b-0 py-3 px-4 outline-none"
                    onChange={(e) => updateProjectField(index, 'projectLink', e.target.value)}
                    placeholder="Project Link"
                    type="url"
                    value={project.projectLink}
                  />
                </div>
              ))}
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <span className="font-headline text-xs text-on-surface-variant font-bold">Achievements</span>
                <button
                  className="rounded-full px-4 py-2 bg-primary text-on-primary font-headline text-sm font-bold"
                  onClick={addAchievement}
                  type="button"
                >
                  Add Achievement
                </button>
              </div>
              {form.achievements.map((achievement, index) => (
                <div className="rounded-2xl bg-surface-container-high p-4 space-y-3" key={`achievement-${index + 1}`}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-headline text-xs font-bold text-on-background">Achievement {index + 1}</p>
                    <button
                      className="rounded-full px-3 py-1 bg-surface-container-highest text-on-surface-variant font-headline text-xs font-bold hover:text-error transition-colors"
                      onClick={() => removeAchievement(index)}
                      type="button"
                    >
                      Remove
                    </button>
                  </div>
                  <input
                    className="rounded-xl w-full bg-surface-container-highest  border-t-0 border-r-0 border-b-0 py-3 px-4 outline-none"
                    onChange={(e) => updateAchievementField(index, 'awardName', e.target.value)}
                    placeholder="Achievement/Award Name"
                    type="text"
                    value={achievement.awardName}
                  />
                  <textarea
                    className="rounded-xl w-full bg-surface-container-highest  border-t-0 border-r-0 border-b-0 py-3 px-4 outline-none resize-y"
                    onChange={(e) => updateAchievementField(index, 'description', e.target.value)}
                    placeholder="Description"
                    rows={3}
                    value={achievement.description}
                  />
                  <input
                    className="rounded-xl w-full bg-surface-container-highest  border-t-0 border-r-0 border-b-0 py-3 px-4 outline-none"
                    onChange={(e) => updateAchievementField(index, 'pocLink', e.target.value)}
                    placeholder="Link to the POC"
                    type="url"
                    value={achievement.pocLink}
                  />
                </div>
              ))}
            </div>
          </section>
          <section className="rounded-2xl bg-surface-container-lowest p-8 space-y-5 shadow-soft">
            <div>
              <p className="font-headline text-xs font-bold text-secondary">
                Job Matching Evidence
              </p>
              <h2 className="mt-2 font-headline text-xl font-bold tracking-tight">
                Skills, Internships & Stack
              </h2>
              <p className="mt-2 text-sm text-on-surface-variant">
                These details are used with completed skills, projects, achievements, and certificates to generate job recommendations.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {careerEvidenceFields.map((field) => (
                <label className="block" key={field.key}>
                  <span className="font-headline text-xs text-on-surface-variant font-bold">
                    {field.label}
                  </span>
                  <textarea
                    className="rounded-xl mt-2 min-h-28 w-full resize-y bg-surface-container-highest  px-4 py-3 outline-none"
                    onChange={(event) => updateCareerEvidence(field.key, event.target.value)}
                    placeholder={field.placeholder}
                    value={careerEvidence[field.key] || ''}
                  />
                </label>
              ))}
            </div>
          </section>
          <section className="rounded-2xl bg-surface-container-lowest p-8 space-y-5">
            <h2 className="font-headline text-xl font-bold tracking-tight">Platform profiles</h2>
            <div className="space-y-4">
              <label className="block">
                <ProfileLabelWithLogo logo={profileLogos.htb} text="Portfolio Website" />
                <input
                  className="rounded-xl mt-2 w-full bg-surface-container-highest  border-t-0 border-r-0 border-b-0 py-3 px-4 outline-none"
                  onChange={(e) => updateField('hackthebox_profile', e.target.value)}
                  placeholder="https://your-portfolio.com"
                  type="url"
                  value={form.hackthebox_profile}
                />
              </label>
              <label className="block">
                <ProfileLabelWithLogo logo={profileLogos.thm} text="Stack Overflow Profile" />
                <input
                  className="rounded-xl mt-2 w-full bg-surface-container-highest  border-t-0 border-r-0 border-b-0 py-3 px-4 outline-none"
                  onChange={(e) => updateField('tryhackme_profile', e.target.value)}
                  placeholder="https://stackoverflow.com/users/..."
                  type="url"
                  value={form.tryhackme_profile}
                />
              </label>
              <label className="block">
                <ProfileLabelWithLogo logo={profileLogos.pico} text="Kaggle Profile" />
                <input
                  className="rounded-xl mt-2 w-full bg-surface-container-highest  border-t-0 border-r-0 border-b-0 py-3 px-4 outline-none"
                  onChange={(e) => updateField('picoctf_profile', e.target.value)}
                  placeholder="https://kaggle.com/..."
                  type="url"
                  value={form.picoctf_profile}
                />
              </label>
              <label className="block">
                <ProfileLabelWithLogo logo={profileLogos.resume} text="Resume URL" />
                <input
                  className="rounded-xl mt-2 w-full bg-surface-container-highest  border-t-0 border-r-0 border-b-0 py-3 px-4 outline-none"
                  onChange={(e) => updateField('resume_url', e.target.value)}
                  placeholder="https://drive.google.com/..."
                  type="url"
                  value={form.resume_url}
                />
              </label>
              <label className="block">
                <ProfileLabelWithLogo logo={profileLogos.github} text="GitHub Profile" />
                <input
                  className="rounded-xl mt-2 w-full bg-surface-container-highest  border-t-0 border-r-0 border-b-0 py-3 px-4 outline-none"
                  onChange={(e) => updateField('github_profile', e.target.value)}
                  placeholder="https://github.com/username"
                  type="url"
                  value={form.github_profile}
                />
              </label>
              <label className="block">
                <ProfileLabelWithLogo logo={profileLogos.linkedin} text="LinkedIn Profile" />
                <input
                  className="rounded-xl mt-2 w-full bg-surface-container-highest  border-t-0 border-r-0 border-b-0 py-3 px-4 outline-none"
                  onChange={(e) => updateField('linkedin_profile', e.target.value)}
                  placeholder="https://linkedin.com/in/username"
                  type="url"
                  value={form.linkedin_profile}
                />
              </label>
            </div>
          </section>

          <section className="rounded-2xl bg-surface-container-lowest p-8 space-y-5 shadow-soft">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
              <div>
                <p className="font-headline text-xs text-secondary font-bold">
                  Top 10 Resume Vault
                </p>
                <h2 className="font-headline text-xl font-bold tracking-tight mt-2">
                  Placement Resume Upload
                </h2>
                <p className="text-sm text-on-surface-variant mt-2 max-w-2xl">
                  Current top 10 players can upload one resume for admin placement review.
                </p>
              </div>
              <div className="rounded-2xl bg-surface-container-highest px-5 py-4 text-right">
                <p className="font-headline text-xs text-on-surface-variant font-bold">
                  Current Rank
                </p>
                <p className="font-headline text-3xl font-extrabold text-secondary">
                  {resumeVault.rank ? `#${resumeVault.rank}` : 'N/A'}
                </p>
              </div>
            </div>

            {resumeVault.eligible ? (
              <div className="space-y-4">
                {resumeVault.resume ? (
                  <div className="rounded-2xl bg-surface-container-highest p-4 ">
                    <p className="font-headline text-xs text-on-surface-variant font-bold">
                      Uploaded Resume
                    </p>
                    <p className="mt-1 font-headline text-sm font-bold text-on-background break-all">
                      {resumeVault.resume.fileName}
                    </p>
                    <p className="text-xs text-on-surface-variant mt-1">
                      {Math.max(1, Math.round((resumeVault.resume.fileSize || 0) / 1024))} KB
                      {resumeVault.resume.updatedAt ? ` · Updated ${new Date(resumeVault.resume.updatedAt).toLocaleString()}` : ''}
                    </p>
                  </div>
                ) : (
                  <div className="rounded-2xl bg-secondary/10  p-4">
                    <p className="text-sm text-on-surface-variant">
                      You are eligible. Upload a PDF, DOC, or DOCX resume up to 5 MB.
                    </p>
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4">
                  <input
                    accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    className="rounded-xl w-full bg-surface-container-highest  border-t-0 border-r-0 border-b-0 py-3 px-4 outline-none"
                    onChange={(event) => setResumeFile(event.target.files?.[0] || null)}
                    type="file"
                  />
                  <button
                    className="rounded-full bg-secondary text-on-secondary px-6 py-3 font-headline text-sm font-bold disabled:opacity-60"
                    disabled={resumeUploading || !resumeFile}
                    onClick={uploadResume}
                    type="button"
                  >
                    {resumeUploading ? 'Uploading...' : 'Upload Resume'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl bg-surface-container-highest p-5 border-l-2 border-l-outline-variant">
                <p className="font-headline text-sm font-bold text-on-background">
                  Resume upload locked
                </p>
                <p className="text-sm text-on-surface-variant mt-2">
                  This vault opens automatically when your scoreboard position enters the current top 10.
                </p>
              </div>
            )}
          </section>

          <button
            className="rounded-full bg-primary text-on-primary px-8 py-3 font-headline text-sm font-bold hover:opacity-90 transition-colors disabled:opacity-60"
            disabled={saving}
            type="submit"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </form>
      </section>
      {passwordModalOpen ? (
        <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-6">
          <form className="w-full max-w-md bg-surface-container-lowest border border-outline-variant shadow-2xl" onSubmit={changePassword}>
            <div className="rounded-xl h-1 bg-primary"></div>
            <div className="p-7">
              <p className="font-headline text-xs font-bold text-primary">
                Account Security
              </p>
              <h2 className="mt-2 font-headline text-2xl font-extrabold tracking-tight text-on-background">
                Change Password
              </h2>
              <p className="mt-3 text-sm text-on-surface-variant">
                Enter your current password and choose a new password with at least 8 characters.
              </p>
              <div className="mt-6 space-y-4">
                <label className="block">
                  <span className="font-headline text-xs text-on-surface-variant font-bold">Current Password</span>
                  <input
                    className="rounded-xl mt-2 w-full bg-surface-container-highest  border-t-0 border-r-0 border-b-0 py-3 px-4 outline-none"
                    onChange={(event) => setPasswordForm((current) => ({ ...current, currentPassword: event.target.value }))}
                    required
                    type="password"
                    value={passwordForm.currentPassword}
                  />
                </label>
                <label className="block">
                  <span className="font-headline text-xs text-on-surface-variant font-bold">New Password</span>
                  <input
                    className="rounded-xl mt-2 w-full bg-surface-container-highest  border-t-0 border-r-0 border-b-0 py-3 px-4 outline-none"
                    minLength={8}
                    onChange={(event) => setPasswordForm((current) => ({ ...current, newPassword: event.target.value }))}
                    required
                    type="password"
                    value={passwordForm.newPassword}
                  />
                </label>
                <label className="block">
                  <span className="font-headline text-xs text-on-surface-variant font-bold">Confirm Password</span>
                  <input
                    className="rounded-xl mt-2 w-full bg-surface-container-highest  border-t-0 border-r-0 border-b-0 py-3 px-4 outline-none"
                    minLength={8}
                    onChange={(event) => setPasswordForm((current) => ({ ...current, confirmPassword: event.target.value }))}
                    required
                    type="password"
                    value={passwordForm.confirmPassword}
                  />
                </label>
              </div>
              <div className="mt-7 flex flex-col sm:flex-row sm:justify-end gap-3">
                <button
                  className="rounded-xl px-5 py-3 bg-surface-container-high text-on-surface font-headline text-xs font-bold disabled:opacity-50"
                  disabled={changingPassword}
                  onClick={() => setPasswordModalOpen(false)}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="rounded-full px-5 py-3 bg-primary text-on-primary font-headline text-sm font-bold disabled:opacity-50"
                  disabled={changingPassword}
                  type="submit"
                >
                  {changingPassword ? 'Changing...' : 'Change Password'}
                </button>
              </div>
            </div>
          </form>
        </div>
      ) : null}
      {passwordSuccessModalOpen ? (
        <div className="fixed inset-0 z-[110] bg-black/70 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="w-full max-w-md bg-surface-container-lowest border border-outline-variant shadow-2xl">
            <div className="rounded-xl h-1 bg-secondary"></div>
            <div className="p-7">
              <p className="font-headline text-xs font-bold text-secondary">
                Password Updated
              </p>
              <h2 className="mt-2 font-headline text-2xl font-extrabold tracking-tight text-on-background">
                Password Changed Successfully
              </h2>
              <p className="mt-4 text-sm text-on-surface-variant">
                Your password has been updated. Use the new password the next time you sign in.
              </p>
              <button
                className="rounded-full mt-7 w-full px-5 py-3 bg-secondary text-on-secondary font-headline text-sm font-bold"
                onClick={() => setPasswordSuccessModalOpen(false)}
                type="button"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}

export default SettingsPage
