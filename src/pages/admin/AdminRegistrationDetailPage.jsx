import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { apiFetch } from '../../services/api'

function isPermanentAdmin(user) {
  return String(user?.username || '').trim().toLowerCase() === 'admin01'
}

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

function parseProjects(value) {
  if (!value) return [emptyProject()]
  if (Array.isArray(value)) return value

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
  if (!value) return [emptyAchievement()]
  if (Array.isArray(value)) return value

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

function formatDateTime(value) {
  if (!value) return 'N/A'
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
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

function AdminRegistrationDetailPage() {
  const navigate = useNavigate()
  const { userId } = useParams()

  const [user, setUser] = useState(null)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [passwordModal, setPasswordModal] = useState(null)
  const [passwordSuccessModal, setPasswordSuccessModal] = useState(null)
  const [interviewAttempts, setInterviewAttempts] = useState([])
  const [completedRooms, setCompletedRooms] = useState({
    totalCompleted: 0,
    totalXp: 0,
    categoryCounts: {},
    rooms: [],
  })
  const [roomActivity, setRoomActivity] = useState({
    total: 0,
    completed: 0,
    inProgress: 0,
    rooms: [],
  })
  const [selectedInterviewQuestion, setSelectedInterviewQuestion] = useState(null)
  const [changingPassword, setChangingPassword] = useState(false)
  const [passwordForm, setPasswordForm] = useState({
    newPassword: '',
    confirmPassword: '',
  })
  const [form, setForm] = useState({
    username: '',
    registration_number: '',
    first_name: '',
    last_name: '',
    email: '',
    role: 'operator',
    is_active: true,
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

  useEffect(() => {
    const loadUser = async () => {
      if (!userId) {
        setError('Missing user id')
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        const data = await apiFetch(`/users/admin/registrations/${userId}`)
        setUser(data)
        setForm({
          username: data.username || '',
          registration_number: data.registration_number || '',
          first_name: data.first_name || '',
          last_name: data.last_name || '',
          email: data.email || '',
          role: data.role || 'operator',
          is_active: Boolean(data.is_active),
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
        setError('')
      } catch (fetchError) {
        setError(fetchError?.message || 'Failed to load registration details')
      } finally {
        setLoading(false)
      }
    }

    void loadUser()
  }, [userId])

  useEffect(() => {
    let cancelled = false

    const loadCompletedRooms = async () => {
      if (!userId) return

      try {
        const data = await apiFetch(`/users/admin/registrations/${userId}/completed-rooms`)
        if (!cancelled) {
          setCompletedRooms({
            totalCompleted: Number(data?.totalCompleted || 0),
            totalXp: Number(data?.totalXp || 0),
            categoryCounts: data?.categoryCounts || {},
            rooms: Array.isArray(data?.rooms) ? data.rooms : [],
          })
        }
      } catch (completedError) {
        console.error('Failed to load completed rooms:', completedError)
        if (!cancelled) {
          setCompletedRooms({
            totalCompleted: 0,
            totalXp: 0,
            categoryCounts: {},
            rooms: [],
          })
        }
      }
    }

    void loadCompletedRooms()

    return () => {
      cancelled = true
    }
  }, [userId])

  useEffect(() => {
    let cancelled = false

    const loadRoomActivity = async () => {
      if (!userId) return

      try {
        const data = await apiFetch(`/users/admin/registrations/${userId}/room-activity`)
        if (!cancelled) {
          setRoomActivity({
            total: Number(data?.total || 0),
            completed: Number(data?.completed || 0),
            inProgress: Number(data?.inProgress || 0),
            rooms: Array.isArray(data?.rooms) ? data.rooms : [],
          })
        }
      } catch (activityError) {
        console.error('Failed to load room activity:', activityError)
        if (!cancelled) {
          setRoomActivity({ total: 0, completed: 0, inProgress: 0, rooms: [] })
        }
      }
    }

    void loadRoomActivity()

    return () => {
      cancelled = true
    }
  }, [userId])

  useEffect(() => {
    let cancelled = false

    const loadInterviewAttempts = async () => {
      if (!userId) return

      try {
        const data = await apiFetch(`/users/admin/registrations/${userId}/theoretical-attempts`)
        if (!cancelled) {
          setInterviewAttempts(Array.isArray(data) ? data : [])
        }
      } catch (attemptError) {
        console.error('Failed to load interview questions:', attemptError)
        if (!cancelled) {
          setInterviewAttempts([])
        }
      }
    }

    void loadInterviewAttempts()

    return () => {
      cancelled = true
    }
  }, [userId])

  const updateField = (name, value) => {
    setForm((current) => ({ ...current, [name]: value }))
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
    if (!userId) return

    setSaving(true)
    setError('')
    setSuccess('')

    try {
      const payload = {
        registration_number: form.registration_number,
        first_name: form.first_name,
        last_name: form.last_name,
        email: form.email,
        role: form.role,
        is_active: form.is_active,
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

      const updated = await apiFetch(`/users/admin/registrations/${userId}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      })

      setUser(updated)
      setForm((current) => ({
        ...current,
        registration_number: updated.registration_number || '',
        first_name: updated.first_name || '',
        last_name: updated.last_name || '',
        email: updated.email || '',
        role: updated.role || 'operator',
        is_active: Boolean(updated.is_active),
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
      setSuccess('Player details updated successfully')
    } catch (saveError) {
      setError(saveError?.message || 'Failed to update player details')
    } finally {
      setSaving(false)
    }
  }

  const openPasswordModal = () => {
    setPasswordForm({ newPassword: '', confirmPassword: '' })
    setPasswordModal({
      target: user?.username || user?.registration_number || 'Selected user',
    })
  }

  const changePassword = async (event) => {
    event.preventDefault()
    if (!userId) return

    setChangingPassword(true)
    setError('')
    setSuccess('')

    try {
      if (passwordForm.newPassword !== passwordForm.confirmPassword) {
        throw new Error('Passwords do not match')
      }

      await apiFetch(`/users/admin/registrations/${userId}/password`, {
        method: 'POST',
        body: JSON.stringify({ newPassword: passwordForm.newPassword }),
      })

      setPasswordModal(null)
      setPasswordForm({ newPassword: '', confirmPassword: '' })
      setPasswordSuccessModal({
        target: user?.username || user?.registration_number || 'Selected user',
      })
    } catch (passwordError) {
      setError(passwordError?.message || 'Failed to change password')
    } finally {
      setChangingPassword(false)
    }
  }

  return (
    <main className="min-h-screen bg-surface px-6 md:px-10 py-10">
      <section className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4">
          <button
            className="rounded-lg px-4 py-2 bg-surface-container-high text-on-surface font-headline text-xs font-bold"
            onClick={() => navigate('/admin/registrations')}
            type="button"
          >
            Back
          </button>
        </div>

        <header className="rounded-2xl bg-surface-container-lowest shadow-soft p-8 md:p-10">
          <p className="font-headline text-xs text-primary font-bold">
            Player Details
          </p>
          <h1 className="font-headline text-3xl md:text-4xl font-extrabold tracking-tight mt-3">
            {user?.registration_number || user?.username || 'Registration Profile'}
          </h1>
          <p className="text-sm text-on-surface-variant mt-4 max-w-2xl">
            Full player profile data from settings.
          </p>
        </header>

        {loading ? (
          <div className="text-center py-12 text-on-surface-variant">Loading details...</div>
        ) : null}

        {error ? (
          <div className="rounded-2xl bg-error/10 shadow-soft p-4">
            <p className="text-error font-headline text-sm font-bold">{error}</p>
          </div>
        ) : null}

        {success ? (
          <div className="rounded-2xl bg-secondary/10 shadow-soft p-4">
            <p className="text-secondary font-headline text-sm font-bold">{success}</p>
          </div>
        ) : null}

        {!loading && !error && user ? (
          <form className="space-y-4" onSubmit={handleSave}>
            <section className="rounded-2xl bg-surface-container-lowest p-6 md:p-8 space-y-4">
              <h2 className="font-headline text-xl font-bold tracking-tight">Core Details</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                    onChange={(e) => updateField('registration_number', e.target.value)}
                    type="text"
                    value={form.registration_number}
                  />
                </label>

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

                <label className="block">
                  <span className="font-headline text-xs text-on-surface-variant font-bold">Email</span>
                  <input
                    className="rounded-xl mt-2 w-full bg-surface-container-highest  border-t-0 border-r-0 border-b-0 py-3 px-4 outline-none"
                    onChange={(e) => updateField('email', e.target.value)}
                    type="email"
                    value={form.email}
                  />
                </label>

                <label className="block">
                  <span className="font-headline text-xs text-on-surface-variant font-bold">Role</span>
                  <select
                    className="rounded-xl mt-2 w-full bg-surface-container-highest  border-t-0 border-r-0 border-b-0 py-3 px-4 outline-none"
                    disabled={isPermanentAdmin(user)}
                    onChange={(e) => updateField('role', e.target.value)}
                    value={form.role}
                  >
                    <option value="operator">student</option>
                    <option value="developer">developer</option>
                    <option value="admin">admin</option>
                  </select>
                </label>

                <div className="block">
                  <span className="font-headline text-xs text-on-surface-variant font-bold">Password</span>
                  <button
                    className="rounded-full mt-2 w-full bg-primary text-on-primary py-3 px-4 font-headline text-sm font-bold"
                    onClick={openPasswordModal}
                    type="button"
                  >
                    Change Password
                  </button>
                </div>
              </div>

              <label className="flex items-center gap-3">
                <input
                  checked={form.is_active}
                  className="h-4 w-4 accent-[#b6171e]"
                  disabled={isPermanentAdmin(user)}
                  onChange={(e) => updateField('is_active', e.target.checked)}
                  type="checkbox"
                />
                <span className="font-headline text-xs text-on-surface-variant font-bold">Account Active</span>
              </label>
              {isPermanentAdmin(user) ? (
                <p className="text-xs text-secondary font-bold">
                  admin01 is a permanent admin. Role and active status are locked.
                </p>
              ) : null}
            </section>

            <section className="rounded-2xl bg-surface-container-lowest p-6 md:p-8 space-y-4">
              <h2 className="font-headline text-xl font-bold tracking-tight">Platform profiles</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="block">
                  <ProfileLabelWithLogo logo={profileLogos.htb} text="Portfolio Website" />
                  <input
                    className="rounded-xl mt-2 w-full bg-surface-container-highest  border-t-0 border-r-0 border-b-0 py-3 px-4 outline-none"
                    onChange={(e) => updateField('hackthebox_profile', e.target.value)}
                    type="url"
                    value={form.hackthebox_profile}
                  />
                </label>

                <label className="block">
                  <ProfileLabelWithLogo logo={profileLogos.thm} text="Stack Overflow Profile" />
                  <input
                    className="rounded-xl mt-2 w-full bg-surface-container-highest  border-t-0 border-r-0 border-b-0 py-3 px-4 outline-none"
                    onChange={(e) => updateField('tryhackme_profile', e.target.value)}
                    type="url"
                    value={form.tryhackme_profile}
                  />
                </label>

                <label className="block">
                  <ProfileLabelWithLogo logo={profileLogos.pico} text="PicoCTF Profile" />
                  <input
                    className="rounded-xl mt-2 w-full bg-surface-container-highest  border-t-0 border-r-0 border-b-0 py-3 px-4 outline-none"
                    onChange={(e) => updateField('picoctf_profile', e.target.value)}
                    type="url"
                    value={form.picoctf_profile}
                  />
                </label>

                <label className="block">
                  <ProfileLabelWithLogo logo={profileLogos.github} text="GitHub Profile" />
                  <input
                    className="rounded-xl mt-2 w-full bg-surface-container-highest  border-t-0 border-r-0 border-b-0 py-3 px-4 outline-none"
                    onChange={(e) => updateField('github_profile', e.target.value)}
                    type="url"
                    value={form.github_profile}
                  />
                </label>

                <label className="block">
                  <ProfileLabelWithLogo logo={profileLogos.linkedin} text="LinkedIn Profile" />
                  <input
                    className="rounded-xl mt-2 w-full bg-surface-container-highest  border-t-0 border-r-0 border-b-0 py-3 px-4 outline-none"
                    onChange={(e) => updateField('linkedin_profile', e.target.value)}
                    type="url"
                    value={form.linkedin_profile}
                  />
                </label>

                <label className="block md:col-span-2">
                  <ProfileLabelWithLogo logo={profileLogos.resume} text="Resume URL" />
                  <input
                    className="rounded-xl mt-2 w-full bg-surface-container-highest  border-t-0 border-r-0 border-b-0 py-3 px-4 outline-none"
                    onChange={(e) => updateField('resume_url', e.target.value)}
                    type="url"
                    value={form.resume_url}
                  />
                </label>
              </div>
            </section>

            <section className="rounded-2xl bg-surface-container-lowest p-6 md:p-8 space-y-4">
              <h2 className="font-headline text-xl font-bold tracking-tight">About</h2>
              <textarea
                className="rounded-xl w-full min-h-32 bg-surface-container-highest  border-t-0 border-r-0 border-b-0 py-3 px-4 outline-none resize-y"
                onChange={(e) => updateField('about_me', e.target.value)}
                value={form.about_me}
              />
            </section>

            <section className="rounded-2xl bg-surface-container-lowest p-6 md:p-8 space-y-5">
              <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
                <div>
                  <p className="font-headline text-xs text-primary font-bold">
                    Player audit trail
                  </p>
                  <h2 className="mt-2 font-headline text-xl font-bold tracking-tight">
                    Room Activity & Answer Logs
                  </h2>
                  <p className="mt-2 text-sm text-on-surface-variant">
                    Review completed and in-progress rooms, submitted answers, interview bonus responses, and AI evaluation notes.
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-3 min-w-72">
                  <div className="rounded-2xl bg-surface-container-high p-4 border-l-2 border-l-outline">
                    <p className="font-headline text-xs text-on-surface-variant font-bold">
                      Total
                    </p>
                    <p className="mt-1 font-headline text-3xl font-extrabold">{roomActivity.total}</p>
                  </div>
                  <div className="rounded-2xl bg-surface-container-high p-4 ">
                    <p className="font-headline text-xs text-on-surface-variant font-bold">
                      Done
                    </p>
                    <p className="mt-1 font-headline text-3xl font-extrabold">{roomActivity.completed}</p>
                  </div>
                  <div className="rounded-2xl bg-surface-container-high p-4 ">
                    <p className="font-headline text-xs text-on-surface-variant font-bold">
                      Active
                    </p>
                    <p className="mt-1 font-headline text-3xl font-extrabold">{roomActivity.inProgress}</p>
                  </div>
                </div>
              </div>

              {roomActivity.rooms.length ? (
                <div className="space-y-3">
                  {roomActivity.rooms.map((room) => (
                    <details
                      className="group border border-outline-variant/30 bg-surface-container-high"
                      key={`${room.roomId}-${room.status}`}
                    >
                      <summary className="flex cursor-pointer list-none flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-headline text-lg font-bold tracking-tight text-on-surface">
                              {room.title}
                            </h3>
                            <span
                              className={`px-2 py-1 font-headline text-xs font-bold ${
                                room.status === 'completed'
                                  ? 'bg-secondary text-background'
                                  : 'bg-primary text-on-primary'
                              }`}
                            >
                              {room.status}
                            </span>
                            <span className="rounded-full bg-surface-container-highest px-2 py-1 font-headline text-xs font-bold text-on-surface-variant">
                              {room.roomType}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-on-surface-variant">
                            {room.category || 'Uncategorized'} / {room.difficulty || room.level || 'No difficulty'}
                          </p>
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-xs md:min-w-[360px]">
                          <div>
                            <p className="font-headline text-xs text-on-surface-variant">
                              Started
                            </p>
                            <p className="mt-1 text-on-surface">{formatDateTime(room.startedAt)}</p>
                          </div>
                          <div>
                            <p className="font-headline text-xs text-on-surface-variant">
                              Completed
                            </p>
                            <p className="mt-1 text-on-surface">{formatDateTime(room.completedAt)}</p>
                          </div>
                        </div>
                      </summary>

                      <div className="space-y-4 border-t border-outline-variant/30 p-4">
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                          <div className="rounded-xl bg-surface-container-lowest p-3">
                            <p className="font-headline text-xs text-on-surface-variant">
                              XP
                            </p>
                            <p className="mt-1 font-headline text-2xl font-extrabold">{room.xp || 0}</p>
                          </div>
                          <div className="rounded-xl bg-surface-container-lowest p-3">
                            <p className="font-headline text-xs text-on-surface-variant">
                              Technical
                            </p>
                            <p className="mt-1 font-headline text-2xl font-extrabold">
                              {room.technicalScore ?? 'N/A'}
                            </p>
                          </div>
                          <div className="rounded-xl bg-surface-container-lowest p-3">
                            <p className="font-headline text-xs text-on-surface-variant">
                              Grammar
                            </p>
                            <p className="mt-1 font-headline text-2xl font-extrabold">
                              {room.grammarScore ?? 'N/A'}
                            </p>
                          </div>
                          <div className="rounded-xl bg-surface-container-lowest p-3">
                            <p className="font-headline text-xs text-on-surface-variant">
                              AI Result
                            </p>
                            <p className="mt-1 font-headline text-sm font-bold">
                              {room.aiPassed === null || room.aiPassed === undefined
                                ? 'N/A'
                                : room.aiPassed
                                  ? 'Passed'
                                  : 'Not passed'}
                            </p>
                          </div>
                        </div>

                        {room.feedback ? (
                          <div className="rounded-2xl bg-surface-container-lowest p-4 ">
                            <p className="font-headline text-xs text-primary font-bold">
                              AI Analysis
                            </p>
                            <p className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-on-surface-variant">
                              {room.feedback}
                            </p>
                          </div>
                        ) : null}

                        <div className="space-y-3">
                          <h4 className="font-headline text-sm font-bold text-on-surface">
                            Submitted Answers
                          </h4>
                          {room.logs?.length ? (
                            room.logs.map((log) => (
                              <div
                                className="rounded-2xl bg-surface-container-lowest p-4 border border-outline-variant/20"
                                key={`${room.roomId}-${log.type}-${log.id}`}
                              >
                                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                                  <div>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="rounded-full bg-surface-container-highest px-2 py-1 font-headline text-xs font-bold text-on-surface-variant">
                                        {log.type === 'interview-bonus' ? 'Interview bonus' : log.type}
                                      </span>
                                      {log.company ? (
                                        <span className="rounded-lg bg-secondary/20 px-2 py-1 font-headline text-sm font-bold text-secondary">
                                          {log.company}
                                        </span>
                                      ) : null}
                                      {log.answeredCorrectly === null || log.answeredCorrectly === undefined ? null : (
                                        <span
                                          className={`px-2 py-1 font-headline text-xs font-bold ${
                                            log.answeredCorrectly
                                              ? 'bg-secondary text-background'
                                              : 'bg-primary text-on-primary'
                                          }`}
                                        >
                                          {log.answeredCorrectly ? 'Correct' : 'Incorrect'}
                                        </span>
                                      )}
                                    </div>
                                    <p className="mt-3 whitespace-pre-wrap text-sm font-bold text-on-surface">
                                      {log.prompt || 'Question prompt not recorded.'}
                                    </p>
                                  </div>
                                  <p className="text-xs text-on-surface-variant md:text-right">
                                    {formatDateTime(log.answeredAt)}
                                  </p>
                                </div>

                                {log.sourceInfo || log.interview ? (
                                  <p className="mt-3 text-xs text-on-surface-variant">
                                    Source: {log.sourceInfo || log.interview}
                                  </p>
                                ) : null}

                                <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
                                  <div>
                                    <p className="font-headline text-xs text-on-surface-variant">
                                      Player Answer
                                    </p>
                                    <p className="rounded-xl mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap bg-surface-container-high p-3 text-sm text-on-surface">
                                      {log.answer || 'No answer recorded.'}
                                    </p>
                                  </div>
                                  {log.expectedAnswer ? (
                                    <div>
                                      <p className="font-headline text-xs text-on-surface-variant">
                                        Expected Answer
                                      </p>
                                      <p className="rounded-xl mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap bg-surface-container-high p-3 text-sm text-on-surface">
                                        {log.expectedAnswer}
                                      </p>
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            ))
                          ) : (
                            <p className="rounded-2xl bg-surface-container-lowest p-4 text-sm text-on-surface-variant">
                              No answer logs were recorded for this room yet.
                            </p>
                          )}
                        </div>
                      </div>
                    </details>
                  ))}
                </div>
              ) : (
                <p className="rounded-2xl bg-surface-container-high p-4 text-sm text-on-surface-variant">
                  This player has not started any rooms yet.
                </p>
              )}
            </section>

            <section className="rounded-2xl bg-surface-container-lowest p-6 md:p-8 space-y-5">
              <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                <div>
                  <h2 className="font-headline text-xl font-bold tracking-tight">
                    Completed Rooms
                  </h2>
                  <p className="mt-2 text-sm text-on-surface-variant">
                    Rooms this player has completed, including completion time, XP, and AI scores where available.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3 min-w-64">
                  <div className="rounded-2xl bg-surface-container-high p-4 ">
                    <p className="font-headline text-xs text-on-surface-variant font-bold">
                      Completed
                    </p>
                    <p className="mt-1 font-headline text-3xl font-extrabold">
                      {completedRooms.totalCompleted}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-surface-container-high p-4 ">
                    <p className="font-headline text-xs text-on-surface-variant font-bold">
                      Earned XP
                    </p>
                    <p className="mt-1 font-headline text-3xl font-extrabold">
                      {completedRooms.totalXp.toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>

              {Object.keys(completedRooms.categoryCounts).length ? (
                <div className="flex flex-wrap gap-2">
                  {Object.entries(completedRooms.categoryCounts).map(([category, count]) => (
                    <span
                      className="rounded-lg bg-surface-container-high px-3 py-2 font-headline text-xs font-bold text-on-surface-variant"
                      key={category}
                    >
                      {category}: {count}
                    </span>
                  ))}
                </div>
              ) : null}

              {completedRooms.rooms.length ? (
                <div className="overflow-x-auto border border-outline-variant/30">
                  <table className="w-full min-w-[760px] text-left">
                    <thead className="bg-surface-container-high">
                      <tr>
                        <th className="px-4 py-3 font-headline text-xs text-on-surface-variant">
                          Room
                        </th>
                        <th className="px-4 py-3 font-headline text-xs text-on-surface-variant">
                          Category
                        </th>
                        <th className="px-4 py-3 font-headline text-xs text-on-surface-variant">
                          Type
                        </th>
                        <th className="px-4 py-3 font-headline text-xs text-on-surface-variant">
                          XP
                        </th>
                        <th className="px-4 py-3 font-headline text-xs text-on-surface-variant">
                          AI Score
                        </th>
                        <th className="px-4 py-3 font-headline text-xs text-on-surface-variant">
                          Completed
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {completedRooms.rooms.map((room) => (
                        <tr className="border-t border-outline-variant/20" key={room.roomId}>
                          <td className="px-4 py-4">
                            <p className="font-headline text-sm font-bold tracking-wide text-on-surface">
                              {room.title}
                            </p>
                            <p className="mt-1 text-xs text-on-surface-variant">
                              {room.difficulty || room.level || 'No difficulty'}
                            </p>
                          </td>
                          <td className="px-4 py-4 text-sm text-on-surface-variant">{room.category}</td>
                          <td className="px-4 py-4">
                            <span className="rounded-full bg-surface-container-high px-2 py-1 font-headline text-xs font-bold">
                              {room.roomType}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-sm font-bold text-on-surface">{room.xp}</td>
                          <td className="px-4 py-4 text-sm text-on-surface-variant">
                            {room.technicalScore || room.grammarScore
                              ? `${room.technicalScore}/100 tech, ${room.grammarScore}/100 grammar`
                              : 'N/A'}
                          </td>
                          <td className="px-4 py-4 text-sm text-on-surface-variant">
                            {formatDateTime(room.completedAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="rounded-2xl bg-surface-container-high p-4 text-sm text-on-surface-variant">
                  This player has not completed any rooms yet.
                </p>
              )}
            </section>

            <section className="rounded-2xl bg-surface-container-lowest p-6 md:p-8 space-y-4">
              <div>
                <h2 className="font-headline text-xl font-bold tracking-tight">Interview Bonus Questions</h2>
                <p className="mt-2 text-sm text-on-surface-variant">
                  Optional interview questions shown to this player. Click a question to inspect company/source details and the submitted answer.
                </p>
              </div>
              <div className="space-y-3">
                {interviewAttempts.flatMap((attempt) =>
                  attempt.interviewQuestions.map((question) => (
                    <button
                      className="rounded-2xl w-full text-left bg-surface-container-high p-4  hover:bg-surface-container-highest transition-colors"
                      key={`${attempt.roomId}-${question.id}`}
                      onClick={() => setSelectedInterviewQuestion({ ...question, attempt })}
                      type="button"
                    >
                      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                        <div>
                          <p className="font-headline text-xs text-primary font-bold">
                            {attempt.roomTitle}
                          </p>
                          <p className="mt-2 text-sm font-bold text-on-surface">
                            {question.prompt}
                          </p>
                          <p className="mt-2 text-xs text-on-surface-variant">
                            Company: {question.company}
                          </p>
                        </div>
                        <span className={`shrink-0 px-3 py-1 text-xs font-bold ${question.answered ? 'bg-secondary/15 text-secondary' : 'bg-surface-container-lowest text-on-surface-variant'}`}>
                          {question.answered ? 'Answered' : 'Not Answered'}
                        </span>
                      </div>
                    </button>
                  )),
                )}
                {!interviewAttempts.some((attempt) => attempt.interviewQuestions.length) ? (
                  <p className="rounded-2xl text-sm text-on-surface-variant bg-surface-container-high p-4">
                    No interview bonus questions have been generated for this player yet.
                  </p>
                ) : null}
              </div>
            </section>

            <section className="rounded-2xl bg-surface-container-lowest p-6 md:p-8 space-y-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-headline text-xl font-bold tracking-tight">Projects</h2>
                <button
                  className="rounded-full px-3 py-2 bg-primary text-on-primary font-headline text-sm font-bold"
                  onClick={addProject}
                  type="button"
                >
                  Add Project
                </button>
              </div>

              <div className="space-y-4">
                {form.projects.map((project, index) => (
                  <article key={`project-edit-${index + 1}`} className="rounded-2xl bg-surface-container-high p-4 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="font-headline text-sm font-bold">Project {index + 1}</h3>
                      <button
                        className="rounded-lg px-2 py-1 bg-error/10 text-error text-xs font-bold"
                        onClick={() => removeProject(index)}
                        type="button"
                      >
                        Remove
                      </button>
                    </div>

                    <input
                      className="rounded-lg w-full bg-surface-container-highest  py-2 px-3 outline-none"
                      onChange={(e) => updateProjectField(index, 'projectName', e.target.value)}
                      placeholder="Project Name"
                      type="text"
                      value={project.projectName}
                    />
                    <textarea
                      className="rounded-lg w-full min-h-24 bg-surface-container-highest  py-2 px-3 outline-none resize-y"
                      onChange={(e) => updateProjectField(index, 'projectDescription', e.target.value)}
                      placeholder="Project Description"
                      value={project.projectDescription}
                    />
                    <input
                      className="rounded-lg w-full bg-surface-container-highest  py-2 px-3 outline-none"
                      onChange={(e) => updateProjectField(index, 'beneficiaries', e.target.value)}
                      placeholder="Beneficiaries"
                      type="text"
                      value={project.beneficiaries}
                    />
                    <input
                      className="rounded-lg w-full bg-surface-container-highest  py-2 px-3 outline-none"
                      onChange={(e) => updateProjectField(index, 'stackUsed', e.target.value)}
                      placeholder="Stack Used"
                      type="text"
                      value={project.stackUsed}
                    />
                    <input
                      className="rounded-lg w-full bg-surface-container-highest  py-2 px-3 outline-none"
                      onChange={(e) => updateProjectField(index, 'projectLink', e.target.value)}
                      placeholder="Project Link"
                      type="url"
                      value={project.projectLink}
                    />
                  </article>
                ))}
              </div>
            </section>

            <section className="rounded-2xl bg-surface-container-lowest p-6 md:p-8 space-y-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-headline text-xl font-bold tracking-tight">Achievements</h2>
                <button
                  className="rounded-full px-3 py-2 bg-primary text-on-primary font-headline text-sm font-bold"
                  onClick={addAchievement}
                  type="button"
                >
                  Add Achievement
                </button>
              </div>

              <div className="space-y-4">
                {form.achievements.map((achievement, index) => (
                  <article key={`achievement-edit-${index + 1}`} className="rounded-2xl bg-surface-container-high p-4 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="font-headline text-sm font-bold">Achievement {index + 1}</h3>
                      <button
                        className="rounded-lg px-2 py-1 bg-error/10 text-error text-xs font-bold"
                        onClick={() => removeAchievement(index)}
                        type="button"
                      >
                        Remove
                      </button>
                    </div>

                    <input
                      className="rounded-lg w-full bg-surface-container-highest  py-2 px-3 outline-none"
                      onChange={(e) => updateAchievementField(index, 'awardName', e.target.value)}
                      placeholder="Award Name"
                      type="text"
                      value={achievement.awardName}
                    />
                    <textarea
                      className="rounded-lg w-full min-h-24 bg-surface-container-highest  py-2 px-3 outline-none resize-y"
                      onChange={(e) => updateAchievementField(index, 'description', e.target.value)}
                      placeholder="Description"
                      value={achievement.description}
                    />
                    <input
                      className="rounded-lg w-full bg-surface-container-highest  py-2 px-3 outline-none"
                      onChange={(e) => updateAchievementField(index, 'pocLink', e.target.value)}
                      placeholder="Proof of Concept Link"
                      type="url"
                      value={achievement.pocLink}
                    />
                  </article>
                ))}
              </div>
            </section>

            <div className="flex justify-end">
              <button
                className="rounded-full px-6 py-3 bg-primary text-on-primary font-headline text-sm font-bold disabled:opacity-60"
                disabled={saving}
                type="submit"
              >
                {saving ? 'Saving...' : 'Save Details'}
              </button>
            </div>
          </form>
        ) : null}
      </section>
      {passwordModal ? (
        <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-6">
          <form className="w-full max-w-md bg-surface-container-lowest border border-outline-variant shadow-2xl" onSubmit={changePassword}>
            <div className="rounded-xl h-1 bg-primary"></div>
            <div className="p-7">
              <p className="font-headline text-xs font-bold text-primary">
                Admin Password Reset
              </p>
              <h2 className="mt-2 font-headline text-2xl font-extrabold tracking-tight text-on-background">
                Change Password
              </h2>
              <p className="mt-3 text-sm text-on-surface-variant">
                Set a new password for {passwordModal.target}. Current password is not required for admin resets.
              </p>
              <div className="mt-6 space-y-4">
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
                  onClick={() => setPasswordModal(null)}
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
      {passwordSuccessModal ? (
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
                The password for {passwordSuccessModal.target} has been updated.
              </p>
              <button
                className="rounded-full mt-7 w-full px-5 py-3 bg-secondary text-on-secondary font-headline text-sm font-bold"
                onClick={() => setPasswordSuccessModal(null)}
                type="button"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {selectedInterviewQuestion ? (
        <div className="fixed inset-0 z-[110] bg-black/70 backdrop-blur-sm flex items-start justify-center overflow-y-auto p-6">
          <div className="my-6 w-full max-w-2xl bg-surface-container-lowest border border-outline-variant shadow-2xl">
            <div className="rounded-xl h-1 bg-primary"></div>
            <div className="p-7">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-headline text-xs font-bold text-primary">
                    Interview Bonus Detail
                  </p>
                  <h2 className="mt-2 font-headline text-2xl font-extrabold tracking-tight text-on-background">
                    {selectedInterviewQuestion.attempt.roomTitle}
                  </h2>
                </div>
                <button
                  className="rounded-xl inline-flex h-10 w-10 items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high"
                  onClick={() => setSelectedInterviewQuestion(null)}
                  type="button"
                  aria-label="Close interview question details"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-2xl bg-surface-container-high p-4">
                  <p className="font-headline text-xs text-on-surface-variant font-bold">Company</p>
                  <p className="mt-1 font-bold text-on-surface">{selectedInterviewQuestion.company}</p>
                </div>
                <div className="rounded-2xl bg-surface-container-high p-4">
                  <p className="font-headline text-xs text-on-surface-variant font-bold">Interview Context</p>
                  <p className="mt-1 font-bold text-on-surface">{selectedInterviewQuestion.interview || 'Interview-style practice'}</p>
                </div>
              </div>

              {selectedInterviewQuestion.sourceInfo ? (
                <div className="rounded-2xl mt-4 bg-surface-container-high p-4">
                  <p className="font-headline text-xs text-on-surface-variant font-bold">Source Info</p>
                  <p className="mt-1 text-sm text-on-surface-variant">{selectedInterviewQuestion.sourceInfo}</p>
                </div>
              ) : null}

              <div className="rounded-2xl mt-4 bg-surface-container-high p-4">
                <p className="font-headline text-xs text-on-surface-variant font-bold">Question</p>
                <p className="mt-2 text-sm text-on-surface">{selectedInterviewQuestion.prompt}</p>
              </div>

              <div className="rounded-2xl mt-4 bg-surface-container-high p-4">
                <p className="font-headline text-xs text-on-surface-variant font-bold">Player Answer</p>
                <p className="mt-2 whitespace-pre-wrap text-sm text-on-surface-variant">
                  {selectedInterviewQuestion.answer || 'No answer submitted for this optional bonus question.'}
                </p>
              </div>

              <button
                className="rounded-full mt-7 w-full px-5 py-3 bg-primary text-on-primary font-headline text-sm font-bold"
                onClick={() => setSelectedInterviewQuestion(null)}
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

export default AdminRegistrationDetailPage
