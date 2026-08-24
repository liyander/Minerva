import { useCallback, useEffect, useMemo, useState } from 'react'
import { getAuthSession, hasRole, ROLES } from '../auth'
import PageHeader from '../components/PageHeader'
import { API_BASE_URL, getAuthToken } from '../services/api'
import {
  addSkillEvidence, checkInEvent, createExperienceEvent, createGradebookItem,
  createLearningProject, createPortfolioItem, createProjectMilestone, createPublicShare,
  fetchEventAttendance, fetchExperienceEvents, fetchLearningProjects, fetchLeaveRequests,
  fetchMyAttendance, fetchMyGradebook, fetchMyPortfolio, fetchMySkillPassport,
  fetchPortfolioReview, fetchPublicShares, requestEventLeave, revokePublicShare,
  reviewLeaveRequest, reviewProjectMilestone,
  approvePortfolioItem, saveAttendance, saveGatingOverride, saveGrade,
  saveLiveSessionContent, saveModulePrerequisites, searchLearning,
} from '../services/platform'

const TABS = [
  ['calendar', 'Calendar', 'calendar_month'], ['search', 'Search', 'search'],
  ['gradebook', 'Gradebook', 'school'], ['projects', 'Projects', 'account_tree'],
  ['portfolio', 'Portfolio', 'work'], ['skills', 'Skill passport', 'verified'],
  ['gating', 'Progression', 'lock_open'],
]
const input = 'w-full rounded-xl border border-outline-variant bg-surface-container-lowest px-3 py-2.5 font-body text-sm text-on-surface outline-none focus:border-primary'
const button = 'rounded-full bg-primary px-5 py-2.5 font-headline text-sm font-bold text-on-primary disabled:opacity-50'
const initialEvent = { title: '', type: 'class', startsAt: '', endsAt: '', meetingUrl: '', cohortId: '', roomId: '', moduleId: '', capacity: 0, checkinCode: '', shortageThreshold: 75 }

function Panel({ title, children, action }) {
  return <section className="rounded-3xl bg-surface-container-lowest p-5 shadow-soft"><div className="mb-4 flex items-center justify-between gap-3"><h2 className="font-headline text-lg font-extrabold">{title}</h2>{action}</div>{children}</section>
}

export default function LearningExperiencePage() {
  const session = getAuthSession()
  const manager = hasRole(session, ROLES.TRAINER, ROLES.ADMIN)
  const admin = hasRole(session, ROLES.ADMIN)
  const [tab, setTab] = useState('calendar')
  const [events, setEvents] = useState([])
  const [attendance, setAttendance] = useState(null)
  const [gradebook, setGradebook] = useState({ entries: [], totals: {} })
  const [projects, setProjects] = useState([])
  const [portfolio, setPortfolio] = useState([])
  const [passport, setPassport] = useState({ declared: [], evidence: [] })
  const [shares, setShares] = useState([])
  const [leaveRequests, setLeaveRequests] = useState([])
  const [portfolioReview, setPortfolioReview] = useState([])
  const [attendanceRows, setAttendanceRows] = useState([])
  const [attendanceEventId, setAttendanceEventId] = useState('')
  const [eventForm, setEventForm] = useState(initialEvent)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [search, setSearch] = useState({ q: '', type: '', stream: '', subject: '', trainer: '', difficulty: '' })
  const [searchResults, setSearchResults] = useState([])
  const [gradeItem, setGradeItem] = useState({ title: '', category: 'manual', maxScore: 100, passScore: 50, weight: 1, cohortId: '' })
  const [grade, setGrade] = useState({ itemId: '', userId: '', score: '', letterGrade: '', gradePoints: '', feedback: '', moderationStatus: 'released' })
  const [project, setProject] = useState({ title: '', description: '', projectType: 'individual', privacy: 'private', cohortId: '', mentorId: '', reviewOn: '', memberIds: '' })
  const [milestone, setMilestone] = useState({ projectId: '', title: '', dueOn: '', evidenceUrl: '' })
  const [milestoneReview, setMilestoneReview] = useState({ milestoneId: '', status: 'reviewed', score: '', feedback: '' })
  const [portfolioForm, setPortfolioForm] = useState({ title: '', description: '', evidenceUrl: '', skills: '', reflection: '', privacy: 'private' })
  const [skill, setSkill] = useState({ userId: '', skill: '', proficiency: 'beginner', evidenceType: 'demonstrated', evidenceLabel: '', evidenceUrl: '', demonstratedAt: '', expiresAt: '' })
  const [gating, setGating] = useState({ moduleId: '', requires: '', userId: '', reason: '', expiresAt: '' })
  const [sessionContent, setSessionContent] = useState({ eventId: '', recordingFileId: '', transcript: '', materials: '', followUp: '' })

  const load = useCallback(async () => {
    setError('')
    try {
      const [eventRows, attendanceRow, grades, projectRows, portfolioRows, skills, shareRows] = await Promise.all([
        fetchExperienceEvents(), fetchMyAttendance(), fetchMyGradebook(), fetchLearningProjects(),
        fetchMyPortfolio(), fetchMySkillPassport(), fetchPublicShares(),
      ])
      setEvents(eventRows); setAttendance(attendanceRow); setGradebook(grades); setProjects(projectRows)
      setPortfolio(portfolioRows); setPassport(skills)
      setShares(shareRows)
      if (manager) {
        const [leaves, reviews] = await Promise.all([fetchLeaveRequests(), fetchPortfolioReview()])
        setLeaveRequests(leaves); setPortfolioReview(reviews)
      }
    } catch (loadError) { setError(loadError?.message || 'Could not load the learning hub.') }
  }, [manager])
  useEffect(() => { void load() }, [load])

  const submit = async (work, success) => {
    setBusy(true); setError(''); setMessage('')
    try { await work(); setMessage(success); await load() } catch (workError) { setError(workError?.message || 'The action failed.') } finally { setBusy(false) }
  }
  const downloadCalendar = async () => {
    const response = await fetch(`${API_BASE_URL}/experience/calendar.ics`, { headers: { Authorization: `Bearer ${getAuthToken()}` } })
    if (!response.ok) return setError('Could not export the calendar.')
    const url = URL.createObjectURL(await response.blob()); const link = document.createElement('a')
    link.href = url; link.download = 'minerva-calendar.ics'; link.click(); URL.revokeObjectURL(url)
  }
  const openRecording = async (fileId) => {
    const response = await fetch(`${API_BASE_URL}/files/${fileId}?mode=json`, { headers: { Authorization: `Bearer ${getAuthToken()}` } })
    if (!response.ok) return setError('You do not have access to this recording.')
    if (response.headers.get('content-type')?.includes('application/json')) {
      const stored = await response.json()
      window.open(stored.url, '_blank', 'noopener,noreferrer')
      return
    }
    const url = URL.createObjectURL(await response.blob())
    window.open(url, '_blank', 'noopener,noreferrer')
    window.setTimeout(() => URL.revokeObjectURL(url), 60000)
  }
  const update = (setter) => (event) => setter((current) => ({ ...current, [event.target.name]: event.target.value }))
  const upcoming = useMemo(() => events.filter((event) => new Date(event.endsAt) >= new Date()), [events])

  return (
    <main className="min-h-screen bg-surface px-5 pb-20 pt-24 sm:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <PageHeader accent="sky" eyebrow="Learning experience" icon="school" title="Learning hub" description="Your schedule, grades, projects, portfolio, verified skills and progression rules in one place." />
        {error ? <p className="rounded-2xl bg-blush p-4 text-sm text-on-blush">{error}</p> : null}
        {message ? <p className="rounded-2xl bg-mint p-4 text-sm text-on-mint">{message}</p> : null}
        <nav className="flex flex-wrap gap-2" aria-label="Learning hub sections">
          {TABS.filter(([id]) => id !== 'gating' || manager).map(([id, label, icon]) => <button className={`inline-flex items-center gap-2 rounded-full px-4 py-2.5 font-headline text-sm font-bold ${tab === id ? 'bg-primary text-on-primary' : 'bg-surface-container-lowest text-on-surface'}`} key={id} onClick={() => setTab(id)} type="button"><span className="material-symbols-outlined text-base">{icon}</span>{label}</button>)}
        </nav>

        {tab === 'search' ? <div className="grid gap-3 rounded-2xl bg-surface-container-lowest p-4 sm:grid-cols-4">{['stream', 'subject', 'trainer', 'difficulty'].map((name) => <input className={input} key={name} name={name} onChange={update(setSearch)} placeholder={`Filter by ${name}`} value={search[name]}/>)}</div> : null}

        {tab === 'gradebook' ? <div className="flex justify-end"><button className={button} onClick={() => void submit(async () => { const share = await createPublicShare({ type: 'transcript' }); await navigator.clipboard?.writeText(`${window.location.origin}${share.path}`); setMessage(`Verified transcript link copied: ${window.location.origin}${share.path}`) }, 'Verified transcript link created.')} type="button">Create verified transcript link</button></div> : null}

        {tab === 'portfolio' && manager ? <Panel title="Portfolio approval queue"><div className="grid gap-3 md:grid-cols-2">{portfolioReview.map((item) => <article className="rounded-2xl bg-surface-container p-4" key={item.id}><p className="text-xs font-bold text-primary">{item.name}</p><h3 className="font-headline font-extrabold">{item.title}</h3><p className="mt-1 text-sm text-on-surface-variant">{item.description}</p><div className="mt-3 flex gap-2"><button className="text-xs font-bold text-primary" onClick={() => void submit(() => approvePortfolioItem(item.id, true), 'Portfolio item approved.')} type="button">Approve</button><button className="text-xs font-bold text-error" onClick={() => void submit(() => approvePortfolioItem(item.id, false), 'Portfolio item rejected.')} type="button">Reject</button></div></article>)}</div></Panel> : null}

        {tab === 'projects' && manager ? <Panel title="Assess milestone"><form className="grid gap-3 sm:grid-cols-4" onSubmit={(event) => { event.preventDefault(); void submit(() => reviewProjectMilestone(milestoneReview.milestoneId, milestoneReview), 'Milestone assessment saved.') }}>{['milestoneId', 'score', 'feedback'].map((name) => <input className={input} key={name} name={name} onChange={update(setMilestoneReview)} placeholder={name} value={milestoneReview[name]}/>)}<button className={button}>Save review</button></form></Panel> : null}

        {['portfolio', 'skills', 'gradebook'].includes(tab) && shares.some((share) => share.active) ? <Panel title="Active public links"><div className="flex flex-wrap gap-2">{shares.filter((share) => share.active).map((share) => <button className="rounded-full bg-surface-container-high px-3 py-2 text-xs font-bold" key={share.id} onClick={() => void submit(() => revokePublicShare(share.id), 'Public link revoked.')} type="button">Revoke {share.share_type} link #{share.id}</button>)}</div></Panel> : null}

        {tab === 'calendar' ? <div className="grid gap-5 lg:grid-cols-[1.35fr_.65fr]">
          {manager ? <Panel title="Attendance & leave review"><form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); void submit(async () => setAttendanceRows(await fetchEventAttendance(attendanceEventId)), 'Attendance loaded.') }}><input className={input} onChange={(event) => setAttendanceEventId(event.target.value)} placeholder="Event ID" required value={attendanceEventId}/><button className={button}>Load</button></form><div className="mt-4 space-y-2">{attendanceRows.map((row) => <div className="flex items-center justify-between gap-3 rounded-xl bg-surface-container p-3" key={row.id}><span className="text-sm font-bold">{row.name}</span><select className={input} onChange={(event) => void submit(() => saveAttendance(attendanceEventId, row.id, { status: event.target.value }), 'Attendance corrected.')} value={row.status}>{['present', 'late', 'absent', 'excused'].map((status) => <option key={status}>{status}</option>)}</select></div>)}</div><div className="mt-5 space-y-2">{leaveRequests.map((request) => <div className="rounded-xl bg-surface-container p-3" key={request.id}><p className="text-sm font-bold">{request.name} · {request.title}</p><p className="text-xs text-on-surface-variant">{request.reason}</p>{request.status === 'pending' ? <div className="mt-2 flex gap-2"><button className="text-xs font-bold text-primary" onClick={() => void submit(() => reviewLeaveRequest(request.id, 'approved'), 'Leave approved.')} type="button">Approve</button><button className="text-xs font-bold text-error" onClick={() => void submit(() => reviewLeaveRequest(request.id, 'rejected'), 'Leave rejected.')} type="button">Reject</button></div> : <span className="text-xs font-bold">{request.status}</span>}</div>)}</div></Panel> : null}
          <Panel title="Timetable" action={<button className="text-sm font-bold text-primary" onClick={downloadCalendar} type="button">Export .ics</button>}>
            <div className="space-y-3">{upcoming.length ? upcoming.map((event) => <article className="rounded-2xl bg-surface-container p-4" key={event.id}>
              <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-headline font-extrabold">{event.title}</p><p className="mt-1 text-xs text-on-surface-variant">{event.type} · {new Date(event.startsAt).toLocaleString()} · {event.trainerName || 'Trainer'}{event.cohortName ? ` · ${event.cohortName}` : ''}</p></div><span className="rounded-full bg-sky px-3 py-1 text-xs font-bold text-on-sky">{event.myAttendance || event.leaveStatus || 'scheduled'}</span></div>
              <div className="mt-3 flex flex-wrap gap-2">{event.meetingUrl ? <a className={button} href={event.meetingUrl} rel="noreferrer" target="_blank">Join class</a> : null}{!manager ? <><button className="rounded-full bg-secondary px-4 py-2 text-xs font-bold text-on-secondary" onClick={() => { const code = window.prompt('Check-in code (leave blank if none)') ?? ''; void submit(() => checkInEvent(event.id, code), 'Checked in.') }} type="button">Check in</button><button className="rounded-full bg-surface-container-high px-4 py-2 text-xs font-bold" onClick={() => { const reason = window.prompt('Reason for leave'); if (reason) void submit(() => requestEventLeave(event.id, reason), 'Leave request sent.') }} type="button">Request leave</button></> : null}</div>
              {event.recordingFileId ? <button className="mt-3 block text-xs font-bold text-primary" onClick={() => void openRecording(event.recordingFileId)} type="button">Open authorized recording</button> : null}{event.transcript ? <details className="mt-3 text-sm"><summary className="cursor-pointer font-bold">Transcript</summary><p className="mt-2 whitespace-pre-wrap text-on-surface-variant">{event.transcript}</p></details> : null}
            </article>) : <p className="py-8 text-center text-sm text-on-surface-variant">No upcoming events.</p>}</div>
          </Panel>
          <div className="space-y-5">{attendance ? <Panel title="My attendance"><p className="text-4xl font-extrabold text-primary">{attendance.percentage}%</p><p className="mt-2 text-sm text-on-surface-variant">{attendance.attended}/{attendance.total} attended · threshold {attendance.threshold}%</p>{attendance.shortage ? <p className="mt-3 rounded-xl bg-blush p-3 text-xs font-bold text-on-blush">Attendance shortage</p> : null}</Panel> : null}
          {manager ? <Panel title="Schedule an event"><form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); void submit(() => createExperienceEvent(eventForm), 'Event scheduled.'); setEventForm(initialEvent) }}><input className={input} name="title" onChange={update(setEventForm)} placeholder="Title" required value={eventForm.title}/><select className={input} name="type" onChange={update(setEventForm)} value={eventForm.type}>{['class','practical','assessment','availability','live'].map((value) => <option key={value}>{value}</option>)}</select><div className="grid grid-cols-2 gap-2"><input className={input} name="startsAt" onChange={update(setEventForm)} required type="datetime-local" value={eventForm.startsAt}/><input className={input} name="endsAt" onChange={update(setEventForm)} required type="datetime-local" value={eventForm.endsAt}/></div>{['meetingUrl','cohortId','roomId','moduleId','checkinCode'].map((name) => <input className={input} key={name} name={name} onChange={update(setEventForm)} placeholder={name} value={eventForm[name]}/>) }<button className={button} disabled={busy}>Schedule</button></form></Panel> : null}</div>
          {manager ? <Panel title="Publish recording & follow-up"><form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); void submit(() => saveLiveSessionContent(sessionContent.eventId, { ...sessionContent, materials: sessionContent.materials.split('\n').filter(Boolean), followUp: sessionContent.followUp.split('\n').filter(Boolean) }), 'Session content published.') }}><input className={input} name="eventId" onChange={update(setSessionContent)} placeholder="Event ID" required value={sessionContent.eventId}/><input className={input} name="recordingFileId" onChange={update(setSessionContent)} placeholder="Uploaded recording file ID" value={sessionContent.recordingFileId}/><textarea className={input} name="transcript" onChange={update(setSessionContent)} placeholder="Transcript" rows={3} value={sessionContent.transcript}/><textarea className={input} name="materials" onChange={update(setSessionContent)} placeholder="Material links, one per line" value={sessionContent.materials}/><textarea className={input} name="followUp" onChange={update(setSessionContent)} placeholder="Follow-up activities, one per line" value={sessionContent.followUp}/><button className={button}>Publish</button></form></Panel> : null}</div> : null}

        {tab === 'search' ? <Panel title="Unified search"><form className="flex flex-wrap gap-3" onSubmit={(e) => { e.preventDefault(); void submit(async () => { const result = await searchLearning(search); setSearchResults(result.results || []) }, 'Search complete.') }}><input className={`${input} flex-1`} name="q" onChange={update(setSearch)} placeholder="Search courses, paths, modules, lectures and research" value={search.q}/><select className={`${input} w-48`} name="type" onChange={update(setSearch)} value={search.type}><option value="">All content</option>{['course','path','module','library','resource','research','assessment','assignment'].map((value) => <option key={value}>{value}</option>)}</select><button className={button}>Search</button></form><div className="mt-5 grid gap-3 md:grid-cols-2">{searchResults.map((result) => <a className="rounded-2xl bg-surface-container p-4" href={result.link} key={`${result.type}-${result.id}`}><p className="text-xs font-bold uppercase text-primary">{result.type}</p><h3 className="mt-1 font-headline font-extrabold">{result.title}</h3><p className="mt-1 line-clamp-2 text-sm text-on-surface-variant">{result.snippet || result.subtitle}</p></a>)}{search.q && !searchResults.length ? <p className="col-span-full py-8 text-center text-sm text-on-surface-variant">No accessible content matches your filters.</p> : null}</div></Panel> : null}

        {tab === 'gradebook' ? <div className="grid gap-5 lg:grid-cols-[1.3fr_.7fr]"><Panel title="Report card"><div className="mb-5 grid grid-cols-3 gap-3">{[['Overall',`${gradebook.totals?.percentage || 0}%`],['Grade',gradebook.totals?.letterGrade || '—'],['GPA',gradebook.totals?.gpa ?? '—']].map(([label,value]) => <div className="rounded-2xl bg-sky p-4 text-on-sky" key={label}><p className="text-2xl font-extrabold">{value}</p><p className="text-xs">{label}</p></div>)}</div><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>{['Item','Type','Score','Percent','Grade'].map((head) => <th className="p-2 text-left" key={head}>{head}</th>)}</tr></thead><tbody>{gradebook.entries?.map((entry,index) => <tr className="border-t border-outline-variant" key={`${entry.title}-${index}`}><td className="p-2 font-bold">{entry.title}</td><td className="p-2">{entry.category}</td><td className="p-2">{entry.score}/{entry.max_score}</td><td className="p-2">{entry.percentage}%</td><td className="p-2">{entry.letter_grade || entry.outcome || '—'}</td></tr>)}</tbody></table></div><button className="mt-4 text-sm font-bold text-primary" onClick={() => window.print()} type="button">Print / save report card</button></Panel>{manager ? <div className="space-y-5"><Panel title="Create grade item"><form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); void submit(() => createGradebookItem(gradeItem), 'Grade item created.') }}>{['title','cohortId'].map((name) => <input className={input} key={name} name={name} onChange={update(setGradeItem)} placeholder={name} value={gradeItem[name]}/>)}<div className="grid grid-cols-3 gap-2">{['maxScore','passScore','weight'].map((name) => <input className={input} key={name} name={name} onChange={update(setGradeItem)} placeholder={name} type="number" value={gradeItem[name]}/>)}</div><button className={button}>Create</button></form></Panel><Panel title="Enter or moderate grade"><form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); void submit(() => saveGrade(grade.itemId, grade.userId, { ...grade, moderationStatus: 'released' }), 'Grade saved with history.') }}>{['itemId','userId','score','letterGrade','gradePoints','feedback'].map((name) => <input className={input} key={name} name={name} onChange={update(setGrade)} placeholder={name} value={grade[name]}/>)}<button className={button}>Save grade</button></form></Panel></div> : null}</div> : null}

        {tab === 'projects' ? <div className="grid gap-5 lg:grid-cols-[1.2fr_.8fr]"><Panel title="My projects"><div className="grid gap-3 md:grid-cols-2">{projects.map((item) => <article className="rounded-2xl bg-surface-container p-4" key={item.id}><p className="text-xs font-bold uppercase text-primary">{item.project_type} · {item.status}</p><h3 className="mt-1 font-headline font-extrabold">{item.title}</h3><p className="mt-2 line-clamp-3 text-sm text-on-surface-variant">{item.description}</p><p className="mt-3 text-xs">{item.member_count} members · {item.milestone_count} milestones · mentor {item.mentorName || 'unassigned'}</p></article>)}</div></Panel><div className="space-y-5">{manager ? <Panel title="Create project"><form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); void submit(() => createLearningProject({ ...project, memberIds: project.memberIds.split(',').map((id) => id.trim()).filter(Boolean) }), 'Project created.') }}>{['title','description','cohortId','mentorId','reviewOn','memberIds'].map((name) => <input className={input} key={name} name={name} onChange={update(setProject)} placeholder={name === 'memberIds' ? 'Member user IDs, comma separated' : name} value={project[name]}/>) }<select className={input} name="projectType" onChange={update(setProject)} value={project.projectType}><option>individual</option><option>group</option></select><button className={button}>Create</button></form></Panel> : null}<Panel title="Add milestone"><form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); void submit(() => createProjectMilestone(milestone.projectId, milestone), 'Milestone added.') }}>{['projectId','title','dueOn','evidenceUrl'].map((name) => <input className={input} key={name} name={name} onChange={update(setMilestone)} placeholder={name} type={name === 'dueOn' ? 'date' : 'text'} value={milestone[name]}/>) }<button className={button}>Add milestone</button></form></Panel></div></div> : null}

        {tab === 'portfolio' ? <div className="grid gap-5 lg:grid-cols-[1.2fr_.8fr]"><Panel title="Portfolio items"><div className="grid gap-3 md:grid-cols-2">{portfolio.map((item) => <article className="rounded-2xl bg-surface-container p-4" key={item.id}><div className="flex justify-between"><span className="text-xs font-bold uppercase text-primary">{item.privacy}</span><span className="text-xs">{item.isApproved ? 'Approved' : 'Awaiting approval'}</span></div><h3 className="mt-1 font-headline font-extrabold">{item.title}</h3><p className="mt-2 text-sm text-on-surface-variant">{item.description}</p><div className="mt-3 flex flex-wrap gap-1">{item.skills?.map((value) => <span className="rounded-full bg-mint px-2 py-1 text-xs text-on-mint" key={value}>{value}</span>)}</div></article>)}</div></Panel><div className="space-y-5"><Panel title="Add evidence"><form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); void submit(() => createPortfolioItem({ ...portfolioForm, skills: portfolioForm.skills.split(',').map((value) => value.trim()).filter(Boolean) }), 'Portfolio item added.') }}>{['title','description','evidenceUrl','skills','reflection'].map((name) => <input className={input} key={name} name={name} onChange={update(setPortfolioForm)} placeholder={name} value={portfolioForm[name]}/>)}<select className={input} name="privacy" onChange={update(setPortfolioForm)} value={portfolioForm.privacy}><option>private</option><option>organisation</option><option>public</option></select><button className={button}>Add item</button></form></Panel><Panel title="Share portfolio"><button className={button} onClick={() => void submit(async () => { const share = await createPublicShare({ type: 'portfolio' }); await navigator.clipboard?.writeText(`${window.location.origin}${share.path}`); setMessage(`Share link copied: ${window.location.origin}${share.path}`) }, 'Share link created.')} type="button">Create share link</button></Panel></div></div> : null}

        {tab === 'skills' ? <div className="grid gap-5 lg:grid-cols-[1.2fr_.8fr]"><Panel title="Verified skill passport"><div className="space-y-3">{[...(passport.declared || []), ...(passport.evidence || [])].map((item,index) => <article className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface-container p-4" key={`${item.skill}-${index}`}><div><h3 className="font-headline font-extrabold">{item.skill}</h3><p className="text-xs text-on-surface-variant">{item.evidence_type || item.evidenceType} · {item.evidence_label || 'Declared profile evidence'}{item.expires_at ? ` · expires ${new Date(item.expires_at).toLocaleDateString()}` : ''}</p></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${item.verified ? 'bg-mint text-on-mint' : 'bg-butter text-on-butter'}`}>{item.proficiency}{item.verified ? ' · verified' : ''}</span></article>)}</div></Panel><div className="space-y-5"><Panel title={manager ? 'Verify skill evidence' : 'Add demonstrated evidence'}><form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); void submit(() => addSkillEvidence(skill), 'Skill evidence added.') }}>{manager ? <input className={input} name="userId" onChange={update(setSkill)} placeholder="Trainee user ID" value={skill.userId}/> : null}{['skill','evidenceLabel','evidenceUrl'].map((name) => <input className={input} key={name} name={name} onChange={update(setSkill)} placeholder={name} value={skill[name]}/>)}<select className={input} name="proficiency" onChange={update(setSkill)} value={skill.proficiency}>{['beginner','intermediate','advanced','expert'].map((value) => <option key={value}>{value}</option>)}</select><div className="grid grid-cols-2 gap-2"><input className={input} name="demonstratedAt" onChange={update(setSkill)} type="date" value={skill.demonstratedAt}/><input className={input} name="expiresAt" onChange={update(setSkill)} type="date" value={skill.expiresAt}/></div><button className={button}>Add evidence</button></form></Panel><Panel title="Share passport"><button className={button} onClick={() => void submit(async () => { const share = await createPublicShare({ type: 'passport' }); await navigator.clipboard?.writeText(`${window.location.origin}${share.path}`); setMessage(`Share link copied: ${window.location.origin}${share.path}`) }, 'Share link created.')} type="button">Create controlled link</button></Panel></div></div> : null}

        {tab === 'gating' ? <div className="grid gap-5 md:grid-cols-2"><Panel title="Configure prerequisites"><form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); void submit(() => saveModulePrerequisites(gating.moduleId, gating.requires.split(',').map((id) => id.trim()).filter(Boolean)), 'Prerequisites saved.') }}><input className={input} name="moduleId" onChange={update(setGating)} placeholder="Module ID" value={gating.moduleId}/><input className={input} name="requires" onChange={update(setGating)} placeholder="Required module IDs, comma separated" value={gating.requires}/><button className={button}>Save rules</button></form></Panel>{admin ? <Panel title="Administrative unlock override"><form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); void submit(() => saveGatingOverride(gating.moduleId, gating.userId, { granted: true, reason: gating.reason, expiresAt: gating.expiresAt || null }), 'Override granted.') }}><input className={input} name="moduleId" onChange={update(setGating)} placeholder="Module ID" value={gating.moduleId}/><input className={input} name="userId" onChange={update(setGating)} placeholder="Trainee user ID" value={gating.userId}/><input className={input} name="reason" onChange={update(setGating)} placeholder="Reason" value={gating.reason}/><input className={input} name="expiresAt" onChange={update(setGating)} type="datetime-local" value={gating.expiresAt}/><button className={button}>Grant override</button></form></Panel> : null}</div> : null}
      </div>
    </main>
  )
}
