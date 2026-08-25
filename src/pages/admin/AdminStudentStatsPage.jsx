import { useCallback, useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import PageHeader from '../../components/PageHeader'
import { apiFetch } from '../../services/api'
import { defaultCourses } from '../../data/coursesData'
import { fetchStudentProgression, fastTrackModule, saveGatingOverride } from '../../services/platform'

// Simple CSS Bar Chart for XP by Category
function CategoryXpChart({ completedRooms }) {
  if (!completedRooms || !completedRooms.categoryCounts) return null;
  
  const categoryXp = {};
  let maxCategoryXp = 0;
  
  completedRooms.rooms.forEach(room => {
    const xp = Number(String(room.xp || '').replace(/[^0-9]/g, '')) || 0;
    categoryXp[room.category] = (categoryXp[room.category] || 0) + xp;
    if (categoryXp[room.category] > maxCategoryXp) {
      maxCategoryXp = categoryXp[room.category];
    }
  });

  const categories = Object.keys(categoryXp).sort((a, b) => categoryXp[b] - categoryXp[a]);

  if (categories.length === 0) {
    return <p className="text-sm text-on-surface-variant text-center mt-6">No XP earned yet.</p>
  }

  return (
    <div className="space-y-4 mt-6">
      <h4 className="font-headline text-sm font-bold text-on-background mb-4">XP by Category</h4>
      {categories.map(category => {
        const xp = categoryXp[category];
        const percentage = maxCategoryXp > 0 ? (xp / maxCategoryXp) * 100 : 0;
        return (
          <div key={category} className="space-y-1">
            <div className="flex justify-between text-xs font-bold text-on-surface-variant">
              <span>{category}</span>
              <span>{xp} XP</span>
            </div>
            <div className="w-full h-3 bg-surface rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary transition-all duration-1000 ease-out rounded-full" 
                style={{ width: `${percentage}%` }}
              ></div>
            </div>
          </div>
        );
      })}
    </div>
  )
}

// Simple CSS Bar Chart for Technical Scores of recent completed theoretical rooms
function RecentScoresChart({ rooms }) {
  const scoredRooms = rooms?.filter(r => r.status === 'completed' && r.technicalScore !== null)
    .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt))
    .slice(0, 5)
    .reverse() || [];

  if (scoredRooms.length === 0) {
    return <p className="text-sm text-on-surface-variant text-center mt-6">No technical evaluations found.</p>
  }

  return (
    <div className="mt-6">
      <h4 className="font-headline text-sm font-bold text-on-background mb-6">Recent Technical Scores</h4>
      <div className="flex items-end justify-around h-40 gap-2 border-b border-outline-variant/30 pb-2">
        {scoredRooms.map(room => (
          <div key={room.roomId} className="flex flex-col items-center w-full h-full group relative justify-end">
            {/* Tooltip */}
            <div className="absolute -top-8 opacity-0 group-hover:opacity-100 transition-opacity bg-inverse-surface text-inverse-on-surface text-[10px] rounded px-2 py-1 whitespace-nowrap z-10 pointer-events-none">
              {room.title}: {room.technicalScore}%
            </div>
            {/* Bar */}
            <div className="w-full max-w-[40px] bg-surface rounded-t-sm relative flex-1 flex items-end justify-center">
              <div 
                className={`w-full rounded-t-sm transition-all duration-1000 ease-out ${
                  room.technicalScore >= 80 ? 'bg-mint' : room.technicalScore >= 60 ? 'bg-butter' : 'bg-blush'
                }`}
                style={{ height: `${room.technicalScore}%` }}
              ></div>
            </div>
            {/* Label */}
            <span className="text-[10px] font-bold text-on-surface-variant mt-2 truncate w-full text-center" title={room.title}>
              {room.title.substring(0, 10)}{room.title.length > 10 ? '...' : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function RadarChart({ rooms }) {
  const categoryScores = {};
  const categoryCounts = {};
  
  (rooms || []).forEach(room => {
    if (room.status === 'completed' && room.technicalScore !== null) {
       categoryScores[room.category] = (categoryScores[room.category] || 0) + room.technicalScore;
       categoryCounts[room.category] = (categoryCounts[room.category] || 0) + 1;
    }
  });
  
  const avgScores = {};
  Object.keys(categoryScores).forEach(cat => {
    avgScores[cat] = categoryScores[cat] / categoryCounts[cat];
  });
  
  const categories = Object.keys(avgScores);
  if (categories.length < 3) {
    return <p className="text-sm text-on-surface-variant text-center mt-6">Need at least 3 distinct categories with scores for radar chart.</p>
  }
  
  const size = 200;
  const center = size / 2;
  const radius = (size / 2) - 30; // padding for labels
  
  const points = categories.map((cat, i) => {
    const angle = (Math.PI * 2 * i) / categories.length;
    const score = avgScores[cat];
    const x = center + radius * (score / 100) * Math.sin(angle);
    const y = center - radius * (score / 100) * Math.cos(angle);
    return `${x},${y}`;
  }).join(' ');

  const webPoints = [20, 40, 60, 80, 100].map(level => {
    return categories.map((_, i) => {
      const angle = (Math.PI * 2 * i) / categories.length;
      const x = center + radius * (level / 100) * Math.sin(angle);
      const y = center - radius * (level / 100) * Math.cos(angle);
      return `${x},${y}`;
    }).join(' ');
  });

  return (
    <div className="flex justify-center items-center mt-6 relative w-full h-[200px]">
      <svg width="100%" height="100%" viewBox={`0 0 ${size} ${size}`} className="overflow-visible">
        {webPoints.map((pts, i) => (
          <polygon key={i} points={pts} fill="none" stroke="currentColor" className="text-outline-variant/30" strokeWidth="1" />
        ))}
        {categories.map((_, i) => {
           const angle = (Math.PI * 2 * i) / categories.length;
           const x = center + radius * Math.sin(angle);
           const y = center - radius * Math.cos(angle);
           return <line key={i} x1={center} y1={center} x2={x} y2={y} stroke="currentColor" className="text-outline-variant/30" strokeWidth="1" />
        })}
        <polygon points={points} fill="currentColor" className="text-primary" stroke="currentColor" strokeWidth="2" fillOpacity="0.25" />
        {categories.map((cat, i) => {
           const angle = (Math.PI * 2 * i) / categories.length;
           const score = avgScores[cat];
           const px = center + radius * (score / 100) * Math.sin(angle);
           const py = center - radius * (score / 100) * Math.cos(angle);
           const lx = center + (radius + 20) * Math.sin(angle);
           const ly = center - (radius + 15) * Math.cos(angle);
           
           return (
             <g key={cat}>
               <circle cx={px} cy={py} r="3" fill="currentColor" className="text-primary" />
               <text x={lx} y={ly} textAnchor="middle" alignmentBaseline="middle" className="text-[8px] font-bold fill-on-surface-variant" fill="currentColor">{cat.substring(0,10)}</text>
             </g>
           )
        })}
      </svg>
    </div>
  )
}

function TimelineChart({ rooms }) {
  const scoredRooms = rooms?.filter(r => r.status === 'completed' && r.technicalScore !== null)
    .sort((a, b) => new Date(a.completedAt) - new Date(b.completedAt)) || [];
    
  if (scoredRooms.length < 2) {
    return <p className="text-sm text-on-surface-variant text-center mt-6">Not enough data for timeline progression.</p>
  }

  const width = 350;
  const height = 160;
  const paddingX = 35;
  const paddingY = 30;
  
  const minScore = 0;
  const maxScore = 100;
  
  const points = scoredRooms.map((room, i) => {
    const x = paddingX + (i / (scoredRooms.length - 1)) * (width - 2 * paddingX);
    const y = height - paddingY - ((room.technicalScore - minScore) / (maxScore - minScore)) * (height - 2 * paddingY);
    return `${x},${y}`;
  }).join(' ');

  return (
    <div className="mt-6 flex flex-col w-full h-[220px] overflow-x-auto">
      <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="overflow-visible min-w-[300px]">
        {[0, 25, 50, 75, 100].map(score => {
          const y = height - paddingY - (score / 100) * (height - 2 * paddingY);
          return (
             <g key={score}>
               <line x1={paddingX} y1={y} x2={width-paddingX} y2={y} stroke="currentColor" className="text-outline-variant/20" strokeWidth="1" strokeDasharray="2" />
               <text x={paddingX - 5} y={y} textAnchor="end" alignmentBaseline="middle" className="text-[8px] fill-on-surface-variant">{score}</text>
             </g>
          )
        })}
        <polyline points={points} fill="none" stroke="currentColor" className="text-primary" strokeWidth="2" />
        {scoredRooms.map((room, i) => {
          const x = paddingX + (i / (scoredRooms.length - 1)) * (width - 2 * paddingX);
          const y = height - paddingY - ((room.technicalScore - minScore) / (maxScore - minScore)) * (height - 2 * paddingY);
          return (
             <g key={i}>
               <circle cx={x} cy={y} r="4" fill="currentColor" className="text-surface" stroke="currentColor" strokeWidth="2" />
               <circle cx={x} cy={y} r="4" fill="transparent" className="text-primary" stroke="currentColor" strokeWidth="2" />
               <text x={x} y={height - paddingY + 12} textAnchor="middle" className="text-[8px] fill-on-surface-variant">{new Date(room.completedAt).toLocaleDateString([], {month:'short', day:'numeric'})}</text>
             </g>
          )
        })}
      </svg>
    </div>
  )
}

function SkillGapAndProgressionAnalysis({ roomActivity, defaultCourses, progressionData, onFastTrack, actionBusy }) {
  const categoryScores = {};
  const categoryCounts = {};
  
  if (roomActivity?.rooms) {
    roomActivity.rooms.forEach(room => {
      if (room.status === 'completed' && room.technicalScore !== null) {
        categoryScores[room.category] = (categoryScores[room.category] || 0) + room.technicalScore;
        categoryCounts[room.category] = (categoryCounts[room.category] || 0) + 1;
      }
    });
  }
  
  const weakCategories = Object.keys(categoryScores)
    .map(cat => ({ category: cat, avgScore: categoryScores[cat] / categoryCounts[cat] }))
    .filter(cat => cat.avgScore < 75)
    .sort((a, b) => a.avgScore - b.avgScore);

  // Find modules currently blocked by dynamic rules or prerequisites
  const blockedModules = [];
  if (progressionData?.pathProgress) {
    progressionData.pathProgress.forEach(path => {
      path.modules.forEach(mod => {
        if (!mod.isUnlocked && !mod.isComplete) {
          blockedModules.push({ ...mod, pathTitle: path.pathTitle });
        }
      });
    });
  }

  const dynamicRecs = progressionData?.recommendations || [];

  return (
    <div className="space-y-6 mt-6">
      {/* 1. Dynamic Adaptive Progression & Bottlenecks Analysis */}
      <div className="rounded-3xl bg-surface-container-lowest p-6 shadow-soft">
        <h3 className="font-headline text-lg font-bold text-on-background flex items-center gap-2 mb-2">
          <span className="material-symbols-outlined text-primary">account_tree</span>
          Dynamic Progression & Gating Analysis
        </h3>
        <p className="text-sm text-on-surface-variant mb-6">
          Real-time tracking of module unlock conditions, diagnostic pre-tests, and prerequisite gating across career paths.
        </p>

        {blockedModules.length > 0 ? (
          <div className="space-y-3">
            <h4 className="font-headline text-xs font-bold uppercase tracking-wider text-blush flex items-center gap-1">
              <span className="material-symbols-outlined text-sm">lock</span>
              {blockedModules.length} Module Gating Bottleneck(s) Detected
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {blockedModules.map(mod => (
                <div key={mod.id} className="p-4 rounded-2xl bg-surface border border-blush/30 flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-start">
                      <span className="text-[10px] uppercase font-bold text-on-surface-variant">{mod.pathTitle}</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blush/20 text-blush">Locked</span>
                    </div>
                    <h5 className="font-headline text-sm font-bold text-on-background mt-1">{mod.title}</h5>
                    
                    {mod.blockedReasons?.length > 0 && (
                      <div className="mt-2 text-xs text-blush space-y-0.5 bg-blush/5 p-2.5 rounded-xl">
                        <span className="font-bold">Blocking Criteria:</span>
                        {mod.blockedReasons.map((r, i) => (
                          <p key={i} className="pl-1 text-[11px]">• {r}</p>
                        ))}
                      </div>
                    )}
                  </div>

                  {onFastTrack && (
                    <button
                      disabled={actionBusy}
                      onClick={() => onFastTrack(mod.id)}
                      className="mt-3 w-full py-2 px-3 rounded-xl bg-primary text-on-primary font-headline text-xs font-bold flex items-center justify-center gap-1 hover:opacity-90 disabled:opacity-50"
                      type="button"
                    >
                      <span className="material-symbols-outlined text-sm">bolt</span>
                      Fast-Track & Unlock Module
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl bg-mint/10 p-4 border border-mint/20 flex items-center gap-3">
            <span className="material-symbols-outlined text-mint text-2xl">check_circle</span>
            <div>
              <p className="font-bold text-sm text-mint">No Gating Bottlenecks</p>
              <p className="text-xs text-on-surface-variant">All current learning path modules are unlocked and accessible.</p>
            </div>
          </div>
        )}
      </div>

      {/* 2. AI Dynamic Remedial & Next-Step Recommendations */}
      {dynamicRecs.length > 0 && (
        <div className="rounded-3xl bg-surface-container-lowest p-6 shadow-soft">
          <h3 className="font-headline text-lg font-bold text-on-background flex items-center gap-2 mb-2">
            <span className="material-symbols-outlined text-primary">psychology_alt</span>
            Adaptive Learning Recommendations
          </h3>
          <p className="text-sm text-on-surface-variant mb-4">
            Generated dynamically by evaluating recent quiz attempts ($&lt; 70\%$), demonstrated skills, and path pacing.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {dynamicRecs.map((rec, i) => (
              <div key={i} className="p-4 rounded-2xl bg-surface border border-outline-variant/20 space-y-2">
                <div className="flex justify-between items-start gap-2">
                  <h5 className="font-headline text-sm font-bold text-on-background">{rec.title}</h5>
                  <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-primary/10 text-primary">
                    {rec.tag}
                  </span>
                </div>
                <p className="text-xs font-body text-on-surface-variant">{rec.reason}</p>
                <div className="pt-2 flex justify-between items-center text-[10px] text-on-surface-variant font-bold">
                  <span>Subject: {rec.subject}</span>
                  <a href={rec.actionUrl} className="text-primary hover:underline">Inspect Action →</a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. Category Score Weaknesses */}
      <div className="rounded-3xl bg-surface-container-lowest p-6 shadow-soft">
        <h3 className="font-headline text-lg font-bold text-on-background flex items-center gap-2 mb-2">
          <span className="material-symbols-outlined text-butter">school</span>
          Category Technical Performance & Skill Gaps
        </h3>
        <p className="text-sm text-on-surface-variant mb-6">Identifies category areas where average score is below 75%.</p>

        {weakCategories.length > 0 ? (
          <div className="space-y-4">
            {weakCategories.map(weak => {
              const recommendations = defaultCourses ? defaultCourses.filter(c => c.category === weak.category || c.tags?.includes(weak.category)).slice(0, 2) : [];
              return (
                <div key={weak.category} className="bg-surface p-5 rounded-2xl border border-blush/20">
                  <div className="flex justify-between items-center mb-3">
                    <h4 className="font-headline text-base font-bold text-on-background">{weak.category}</h4>
                    <span className="bg-blush/20 text-blush px-3 py-1 rounded-full text-xs font-bold">Avg Score: {Math.round(weak.avgScore)}%</span>
                  </div>
                  {recommendations.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                      {recommendations.map(rec => (
                        <a key={rec.id} href={`/courses/${rec.slug}`} className="flex flex-col gap-1 p-3 rounded-xl bg-surface-container-lowest border border-outline-variant/20 hover:border-primary transition-colors">
                          <span className="font-bold text-sm text-on-background truncate">{rec.title}</span>
                          <span className="text-xs text-on-surface-variant truncate">{rec.description}</span>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-2xl bg-mint/10 p-4 border border-mint/20 flex items-center gap-3">
            <span className="material-symbols-outlined text-mint text-2xl">verified</span>
            <div>
              <p className="font-bold text-sm text-mint">All Categories Performing Well (≥ 75%)</p>
              <p className="text-xs text-on-surface-variant">The trainee has satisfied all category benchmarks.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AdminStudentStatsPage() {
  const { userId } = useParams()
  const navigate = useNavigate()
  
  const [student, setStudent] = useState(null)
  const [completedRooms, setCompletedRooms] = useState(null)
  const [roomActivity, setRoomActivity] = useState(null)
  const [profile, setProfile] = useState(null)
  const [progressionData, setProgressionData] = useState(null)
  
  const [activeTab, setActiveTab] = useState('overview')
  const [isLoading, setIsLoading] = useState(true)
  const [actionBusy, setActionBusy] = useState(false)
  const [actionMessage, setActionMessage] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      // Fetch basic details
      const studentData = await apiFetch(`/users/admin/registrations/${userId}`)
      setStudent(studentData)

      // Fetch completed rooms & activity & progression
      const [completedData, activityData, progression] = await Promise.all([
        apiFetch(`/users/admin/registrations/${userId}/completed-rooms`),
        apiFetch(`/users/admin/registrations/${userId}/room-activity`),
        fetchStudentProgression(userId).catch(() => null),
      ])
      
      setCompletedRooms(completedData)
      setRoomActivity(activityData)
      setProgressionData(progression)

      // Fetch full public profile (ignore errors if profile doesn't exist)
      try {
        const profileData = await apiFetch(`/profiles/${userId}`)
        setProfile(profileData)
      } catch (e) {
        console.error('Could not load public profile', e)
      }

    } catch (loadError) {
      setError(loadError?.message || 'Could not load student statistics.')
    } finally {
      setIsLoading(false)
    }
  }, [userId])

  useEffect(() => {
    void load()
  }, [load])

  const handleFastTrack = async (moduleId) => {
    setActionBusy(true)
    setActionMessage('')
    try {
      await fastTrackModule(userId, { moduleId, reason: 'Admin fast-track override' })
      setActionMessage('Module fast-tracked and unlocked successfully.')
      await load()
    } catch (err) {
      setError(err?.message || 'Failed to fast-track module.')
    } finally {
      setActionBusy(false)
    }
  }

  const handleRevokeOverride = async (moduleId) => {
    setActionBusy(true)
    setActionMessage('')
    try {
      await saveGatingOverride(moduleId, userId, { granted: false })
      setActionMessage('Module override revoked.')
      await load()
    } catch (err) {
      setError(err?.message || 'Failed to revoke override.')
    } finally {
      setActionBusy(false)
    }
  }

  if (isLoading) {
    return (
      <main className="min-h-screen bg-surface px-5 py-8 sm:px-8 lg:px-10 pt-24 flex items-center justify-center">
        <div className="mx-auto h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
      </main>
    )
  }

  if (error && !student) {
    return (
      <main className="min-h-screen bg-surface px-5 py-8 sm:px-8 lg:px-10 pt-24">
        <div className="mx-auto max-w-4xl space-y-6">
          <button
            className="inline-flex items-center gap-1 font-headline text-sm font-bold text-on-surface-variant hover:text-on-surface transition-colors"
            onClick={() => navigate('/admin/students')}
            type="button"
          >
            <span className="material-symbols-outlined text-base">arrow_back</span>
            Back to students
          </button>
          <div className="rounded-2xl bg-blush p-4">
            <p className="font-body text-sm text-on-blush">{error || 'Student not found.'}</p>
          </div>
        </div>
      </main>
    )
  }

  const name = [student.first_name, student.last_name].filter(Boolean).join(' ') || student.username
  
  const TABS = [
    { id: 'overview', label: 'Overview', icon: 'monitoring' },
    { id: 'progression', label: 'Dynamic Progression', icon: 'account_tree' },
    { id: 'enrollments', label: 'Enrollments', icon: 'school' },
    { id: 'profile', label: 'Full Profile', icon: 'person' }
  ]

  return (
    <main className="min-h-screen bg-surface px-5 py-8 sm:px-8 lg:px-10 pt-24">
      <div className="mx-auto max-w-6xl space-y-6">
        <button
          className="inline-flex items-center gap-1 font-headline text-sm font-bold text-on-surface-variant hover:text-on-surface transition-colors"
          onClick={() => navigate('/admin/students')}
          type="button"
        >
          <span className="material-symbols-outlined text-base">arrow_back</span>
          Back to students
        </button>

        <PageHeader
          accent="secondary"
          description={`Detailed tracking and statistics for ${name}.`}
          eyebrow="Student Monitor"
          icon="insights"
          title={name}
        />

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar: Profile Card */}
          <div className="lg:col-span-1 space-y-6">
            <div className="rounded-3xl bg-surface-container-lowest p-6 shadow-soft">
              <div className="flex flex-col items-center text-center">
                <span className="h-20 w-20 shrink-0 rounded-full bg-secondary-container text-on-secondary-container inline-flex items-center justify-center font-headline font-bold text-2xl mb-4">
                  {name.slice(0, 2).toUpperCase()}
                </span>
                <h2 className="font-headline text-xl font-bold text-on-background">{name}</h2>
                <p className="text-sm text-on-surface-variant">@{student.username}</p>
                
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <span className="rounded-full bg-surface-container-high px-3 py-1 font-headline text-xs font-bold text-on-surface-variant">
                    {student.role}
                  </span>
                  {student.is_active ? (
                    <span className="rounded-full bg-mint/20 text-mint px-3 py-1 font-headline text-xs font-bold">
                      Active
                    </span>
                  ) : (
                    <span className="rounded-full bg-blush/20 text-blush px-3 py-1 font-headline text-xs font-bold">
                      Inactive
                    </span>
                  )}
                </div>
              </div>

              <hr className="my-6 border-outline-variant/20" />
              
              <div className="space-y-4">
                <div>
                  <p className="text-[10px] uppercase font-bold text-on-surface-variant tracking-wider">Email</p>
                  <p className="text-sm font-body mt-1 truncate" title={student.email}>{student.email || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase font-bold text-on-surface-variant tracking-wider">Reg. Number</p>
                  <p className="text-sm font-body mt-1 truncate">{student.registration_number || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase font-bold text-on-surface-variant tracking-wider">Joined</p>
                  <p className="text-sm font-body mt-1">
                    {new Date(student.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </div>
            
            {/* Tab Navigation */}
            <div className="rounded-3xl bg-surface-container-lowest p-2 shadow-soft flex flex-col gap-1">
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-2xl transition-all font-headline text-sm font-bold w-full text-left ${
                    activeTab === tab.id 
                      ? 'bg-primary text-on-primary shadow-sm' 
                      : 'hover:bg-surface-container-high text-on-surface-variant'
                  }`}
                >
                  <span className="material-symbols-outlined text-xl">{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Main Content Area */}
          <div className="lg:col-span-3 space-y-6">
            
            {/* TAB: OVERVIEW */}
            {activeTab === 'overview' && (
              <div className="space-y-6 animate-in fade-in duration-300">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="rounded-2xl bg-primary p-5 text-on-primary shadow-soft">
                    <p className="text-xs uppercase font-bold tracking-wider opacity-80">Completed</p>
                    <p className="text-3xl font-headline font-bold mt-2">
                      {completedRooms?.totalCompleted || 0}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-secondary p-5 text-on-secondary shadow-soft">
                    <p className="text-xs uppercase font-bold tracking-wider opacity-80">Total XP</p>
                    <p className="text-3xl font-headline font-bold mt-2">
                      {completedRooms?.totalXp || 0}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-surface-container-lowest p-5 shadow-soft border border-outline-variant/10">
                    <p className="text-xs uppercase font-bold tracking-wider text-on-surface-variant">In Progress</p>
                    <p className="text-3xl font-headline font-bold mt-2 text-on-background">
                      {roomActivity?.inProgress || 0}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-surface-container-lowest p-5 shadow-soft border border-outline-variant/10">
                    <p className="text-xs uppercase font-bold tracking-wider text-on-surface-variant">Total Enrolled</p>
                    <p className="text-3xl font-headline font-bold mt-2 text-on-background">
                      {roomActivity?.total || 0}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="rounded-3xl bg-surface-container-lowest p-6 shadow-soft">
                    <h3 className="font-headline text-lg font-bold text-on-background flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary">leaderboard</span>
                      Category Breakdown
                    </h3>
                    <CategoryXpChart completedRooms={completedRooms} />
                  </div>
                  <div className="rounded-3xl bg-surface-container-lowest p-6 shadow-soft">
                    <h3 className="font-headline text-lg font-bold text-on-background flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary">ssid_chart</span>
                      Recent Scores
                    </h3>
                    <RecentScoresChart rooms={roomActivity?.rooms} />
                  </div>
                  <div className="rounded-3xl bg-surface-container-lowest p-6 shadow-soft">
                    <h3 className="font-headline text-lg font-bold text-on-background flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary">radar</span>
                      Strength Radar
                    </h3>
                    <RadarChart rooms={roomActivity?.rooms} />
                  </div>
                  <div className="rounded-3xl bg-surface-container-lowest p-6 shadow-soft">
                    <h3 className="font-headline text-lg font-bold text-on-background flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary">timeline</span>
                      Score Progression
                    </h3>
                    <TimelineChart rooms={roomActivity?.rooms} />
                  </div>
                </div>

                <SkillGapAndProgressionAnalysis
                  roomActivity={roomActivity}
                  defaultCourses={defaultCourses}
                  progressionData={progressionData}
                  onFastTrack={handleFastTrack}
                  actionBusy={actionBusy}
                />
              </div>
            )}

            {/* TAB: DYNAMIC PROGRESSION */}
            {activeTab === 'progression' && (
              <div className="space-y-6 animate-in fade-in duration-300">
                {actionMessage && (
                  <div className="rounded-2xl bg-mint/20 border border-mint/40 p-4 text-mint flex items-center justify-between">
                    <span className="text-sm font-bold">{actionMessage}</span>
                    <button onClick={() => setActionMessage('')} className="text-xs font-bold underline">Dismiss</button>
                  </div>
                )}

                {/* Risk / Stalling Indicator */}
                {progressionData?.risk?.isStalling && (
                  <div className="rounded-3xl bg-blush/15 border border-blush/30 p-6 shadow-soft">
                    <div className="flex items-start gap-4">
                      <span className="material-symbols-outlined text-3xl text-blush">warning</span>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-headline text-base font-bold text-on-background">At-Risk Progression Stalling Detected</h4>
                          <span className="bg-blush text-on-blush text-xs px-2.5 py-0.5 rounded-full font-bold uppercase">
                            {progressionData.risk.riskLevel} Risk
                          </span>
                        </div>
                        <ul className="mt-2 space-y-1 text-sm font-body text-on-surface-variant list-disc list-inside">
                          {progressionData.risk.reasons.map((r, i) => (
                            <li key={i}>{r}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}

                {/* Gamification & Mastery Overview */}
                <div className="rounded-3xl bg-surface-container-lowest p-6 shadow-soft">
                  <h3 className="font-headline text-lg font-bold text-on-background flex items-center gap-2 mb-6">
                    <span className="material-symbols-outlined text-primary">military_tech</span>
                    Learner Mastery & XP Tier
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Current Rank & Tier */}
                    <div className="flex flex-col items-center justify-center p-6 bg-surface rounded-2xl border border-outline-variant/20 text-center">
                      <span className="material-symbols-outlined text-5xl text-primary mb-2">
                        {progressionData?.gamification?.tierIcon || 'shield'}
                      </span>
                      <span className="text-xs uppercase font-bold text-on-surface-variant tracking-wider">Current Tier</span>
                      <h4 className="font-headline text-2xl font-bold text-on-background mt-1">
                        {progressionData?.gamification?.currentTier || 'Novice'}
                      </h4>
                      <p className="text-xs text-on-surface-variant mt-1">Level {progressionData?.gamification?.level || 1}</p>

                      {progressionData?.gamification?.nextTier && (
                        <div className="w-full mt-4 space-y-1">
                          <div className="flex justify-between text-[10px] font-bold text-on-surface-variant">
                            <span>Next: {progressionData.gamification.nextTier}</span>
                            <span>{progressionData.gamification.progressToNextTier}%</span>
                          </div>
                          <div className="w-full h-2 bg-surface-container-high rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full transition-all duration-500"
                              style={{ width: `${progressionData.gamification.progressToNextTier}%` }}
                            ></div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Streak & Multiplier */}
                    <div className="flex flex-col justify-between p-6 bg-surface rounded-2xl border border-outline-variant/20">
                      <div>
                        <div className="flex items-center gap-2 text-butter mb-2">
                          <span className="material-symbols-outlined text-2xl">local_fire_department</span>
                          <span className="font-headline text-sm font-bold uppercase tracking-wider text-on-background">Study Streak</span>
                        </div>
                        <p className="text-3xl font-headline font-bold text-on-background mt-2">
                          {progressionData?.gamification?.streakDays || 0} <span className="text-sm font-normal text-on-surface-variant">days</span>
                        </p>
                      </div>
                      <div className="pt-4 border-t border-outline-variant/10 flex justify-between items-center text-xs text-on-surface-variant">
                        <span>XP Multiplier:</span>
                        <span className="font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">
                          {progressionData?.gamification?.streakMultiplier || 1.0}x
                        </span>
                      </div>
                    </div>

                    {/* XP Distribution */}
                    <div className="p-6 bg-surface rounded-2xl border border-outline-variant/20 space-y-3">
                      <span className="font-headline text-xs font-bold uppercase tracking-wider text-on-surface-variant">XP Breakdown</span>
                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between">
                          <span className="text-on-surface-variant">Rooms Completed:</span>
                          <span className="font-bold text-on-background">{progressionData?.gamification?.roomXp || 0} XP</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-on-surface-variant">Assessments:</span>
                          <span className="font-bold text-on-background">{progressionData?.gamification?.assessmentXp || 0} XP</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-on-surface-variant">Project Milestones:</span>
                          <span className="font-bold text-on-background">{progressionData?.gamification?.projectXp || 0} XP</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-on-surface-variant">Attendance:</span>
                          <span className="font-bold text-on-background">{progressionData?.gamification?.attendanceXp || 0} XP</span>
                        </div>
                      </div>
                      <div className="pt-2 border-t border-outline-variant/10 flex justify-between font-bold text-sm text-primary">
                        <span>Total XP:</span>
                        <span>{progressionData?.gamification?.totalXp || 0} XP</span>
                      </div>
                    </div>
                  </div>

                  {/* Milestone Badges */}
                  <div className="mt-6 pt-6 border-t border-outline-variant/20">
                    <h4 className="font-headline text-sm font-bold text-on-background mb-4">Earned Milestones & Badges</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                      {progressionData?.gamification?.allMilestones?.map((m) => (
                        <div
                          key={m.key}
                          className={`p-3 rounded-2xl border text-center transition-all ${
                            m.unlocked
                              ? 'bg-primary/5 border-primary/30 text-on-background'
                              : 'bg-surface/50 border-outline-variant/10 opacity-40'
                          }`}
                        >
                          <span className={`material-symbols-outlined text-2xl mb-1 ${m.unlocked ? 'text-primary' : 'text-on-surface-variant'}`}>
                            {m.icon}
                          </span>
                          <p className="font-headline text-xs font-bold truncate" title={m.title}>{m.title}</p>
                          <p className="text-[10px] text-on-surface-variant mt-0.5">{m.unlocked ? `+${m.xp} XP` : 'Locked'}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Career Paths & Adaptive Gating Matrix */}
                <div className="rounded-3xl bg-surface-container-lowest p-6 shadow-soft space-y-6">
                  <div className="flex justify-between items-center">
                    <h3 className="font-headline text-lg font-bold text-on-background flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary">account_tree</span>
                      Path Progression & Gating Rules
                    </h3>
                    <span className="text-xs text-on-surface-variant font-bold">
                      {progressionData?.pathProgress?.length || 0} Enrolled Path(s)
                    </span>
                  </div>

                  {progressionData?.pathProgress?.length > 0 ? (
                    progressionData.pathProgress.map((path) => (
                      <div key={path.pathId} className="border border-outline-variant/20 rounded-2xl p-5 bg-surface space-y-4">
                        <div className="flex justify-between items-center border-b border-outline-variant/10 pb-3">
                          <h4 className="font-headline text-base font-bold text-on-background">{path.pathTitle}</h4>
                          <span className="text-xs bg-surface-container-high px-3 py-1 rounded-full font-bold text-on-surface-variant">
                            {path.modules.filter((m) => m.isComplete).length} / {path.modules.length} Modules Complete
                          </span>
                        </div>

                        <div className="space-y-3">
                          {path.modules.map((mod) => (
                            <div
                              key={mod.id}
                              className={`p-4 rounded-xl border transition-all ${
                                mod.isComplete
                                  ? 'bg-mint/5 border-mint/30'
                                  : mod.isUnlocked
                                  ? 'bg-surface-container-lowest border-primary/30'
                                  : 'bg-surface-container-high/40 border-outline-variant/20 opacity-75'
                              }`}
                            >
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="material-symbols-outlined text-sm">
                                      {mod.isComplete
                                        ? 'check_circle'
                                        : mod.isFastTracked
                                        ? 'bolt'
                                        : mod.isUnlocked
                                        ? 'lock_open'
                                        : 'lock'}
                                    </span>
                                    <h5 className="font-headline text-sm font-bold text-on-background">
                                      {mod.title}
                                    </h5>
                                    {mod.phase && (
                                      <span className="text-[10px] bg-surface px-2 py-0.5 rounded font-bold text-on-surface-variant">
                                        {mod.phase}
                                      </span>
                                    )}
                                    {mod.isOverridden && (
                                      <span className="text-[10px] bg-secondary/15 text-secondary px-2 py-0.5 rounded font-bold">
                                        Overridden
                                      </span>
                                    )}
                                    {mod.isFastTracked && (
                                      <span className="text-[10px] bg-butter/20 text-butter px-2 py-0.5 rounded font-bold">
                                        Fast-Tracked
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-xs text-on-surface-variant mt-1">
                                    Courses: {mod.completedCourses} / {mod.totalCourses} completed
                                  </p>

                                  {/* Dynamic Rules / Blockers Breakdown */}
                                  {mod.dynamicRules?.length > 0 && (
                                    <div className="mt-2 space-y-1">
                                      {mod.dynamicRules.map((rule, idx) => (
                                        <div key={idx} className="flex items-center gap-1.5 text-xs">
                                          <span className={`material-symbols-outlined text-xs ${rule.met ? 'text-mint' : 'text-blush'}`}>
                                            {rule.met ? 'check' : 'close'}
                                          </span>
                                          <span className={rule.met ? 'text-on-surface' : 'text-blush font-bold'}>
                                            {rule.description}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                  {mod.blockedReasons?.length > 0 && !mod.isUnlocked && (
                                    <div className="mt-2 text-xs text-blush space-y-0.5">
                                      <p className="font-bold">Blocked by:</p>
                                      {mod.blockedReasons.map((reason, idx) => (
                                        <p key={idx} className="pl-2">• {reason}</p>
                                      ))}
                                    </div>
                                  )}
                                </div>

                                <div className="flex items-center gap-2">
                                  {!mod.isUnlocked ? (
                                    <button
                                      disabled={actionBusy}
                                      onClick={() => handleFastTrack(mod.id)}
                                      className="px-3 py-1.5 rounded-full bg-primary text-on-primary font-headline text-xs font-bold hover:opacity-90 disabled:opacity-50 flex items-center gap-1"
                                      type="button"
                                    >
                                      <span className="material-symbols-outlined text-sm">bolt</span>
                                      Fast-Track Unlock
                                    </button>
                                  ) : mod.isOverridden ? (
                                    <button
                                      disabled={actionBusy}
                                      onClick={() => handleRevokeOverride(mod.id)}
                                      className="px-3 py-1.5 rounded-full bg-surface-container-high text-on-surface-variant hover:text-blush font-headline text-xs font-bold disabled:opacity-50"
                                      type="button"
                                    >
                                      Revoke Override
                                    </button>
                                  ) : (
                                    <span className="text-xs font-bold text-mint flex items-center gap-1">
                                      <span className="material-symbols-outlined text-sm">check</span>
                                      Active
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-on-surface-variant text-center py-6">No enrolled career paths found.</p>
                  )}
                </div>

                {/* Personalized Recommendations Engine Inspector */}
                <div className="rounded-3xl bg-surface-container-lowest p-6 shadow-soft space-y-4">
                  <h3 className="font-headline text-lg font-bold text-on-background flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary">psychology_alt</span>
                    Dynamic Learning Recommendations for this Student
                  </h3>
                  <p className="text-xs text-on-surface-variant">
                    Generated dynamically based on assessment diagnostic scores, active path gating, and demonstrated skill gaps.
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                    {progressionData?.recommendations?.length > 0 ? (
                      progressionData.recommendations.map((rec, i) => (
                        <div key={i} className="p-4 rounded-2xl bg-surface border border-outline-variant/20 space-y-2">
                          <div className="flex justify-between items-start gap-2">
                            <h5 className="font-headline text-sm font-bold text-on-background">{rec.title}</h5>
                            <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-primary/10 text-primary">
                              {rec.tag}
                            </span>
                          </div>
                          <p className="text-xs font-body text-on-surface-variant">{rec.reason}</p>
                          <div className="pt-2 flex justify-between items-center text-[10px] text-on-surface-variant font-bold">
                            <span>Subject: {rec.subject}</span>
                            <span className="text-primary">{rec.actionUrl}</span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-on-surface-variant italic col-span-2">No active recommendation flags.</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* TAB: ENROLLMENTS */}
            {activeTab === 'enrollments' && (
              <div className="rounded-3xl bg-surface-container-lowest shadow-soft overflow-hidden animate-in fade-in duration-300">
                <div className="p-6 border-b border-outline-variant/20 flex justify-between items-center bg-surface-container-lowest sticky top-0 z-10">
                  <h3 className="font-headline text-lg font-bold text-on-background flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary">school</span>
                    Enrollment History
                  </h3>
                  <span className="bg-surface-container-highest px-3 py-1 rounded-full text-xs font-bold text-on-surface-variant">
                    {roomActivity?.rooms?.length || 0} total
                  </span>
                </div>
                <div className="divide-y divide-outline-variant/20">
                  {roomActivity?.rooms?.length > 0 ? (
                    roomActivity.rooms.map((room) => (
                      <div key={room.roomId} className="p-6 hover:bg-surface-container-highest transition-colors">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="font-headline text-base font-bold text-on-background">{room.title}</h4>
                              {room.status === 'completed' ? (
                                <span className="material-symbols-outlined text-mint text-sm" title="Completed">check_circle</span>
                              ) : (
                                <span className="material-symbols-outlined text-butter text-sm" title="In Progress">schedule</span>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-2 mt-2">
                              <span className="bg-surface px-2 py-0.5 rounded text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">{room.category}</span>
                              <span className="bg-surface px-2 py-0.5 rounded text-[10px] font-bold text-on-surface-variant uppercase tracking-wider border-l border-outline-variant/30">{room.difficulty}</span>
                              <span className="bg-surface px-2 py-0.5 rounded text-[10px] font-bold text-on-surface-variant uppercase tracking-wider border-l border-outline-variant/30">{room.xp}</span>
                            </div>
                          </div>
                          <div className="text-left sm:text-right">
                            <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Started</p>
                            <p className="text-sm font-body mb-2">{room.startedAt ? new Date(room.startedAt).toLocaleDateString() : 'N/A'}</p>
                            
                            {room.status === 'completed' && room.completedAt && (
                              <>
                                <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Completed</p>
                                <p className="text-sm font-body">{new Date(room.completedAt).toLocaleDateString()}</p>
                              </>
                            )}
                          </div>
                        </div>
                        
                        {/* Technical Scores for completed theory rooms */}
                        {room.status === 'completed' && room.technicalScore !== null && (
                          <div className="mt-4 pt-4 border-t border-outline-variant/10 flex flex-wrap gap-6 bg-surface-container-lowest p-3 rounded-xl">
                            <div>
                              <p className="text-[10px] uppercase font-bold text-on-surface-variant tracking-wider">Tech Score</p>
                              <p className={`text-base font-headline font-bold mt-1 ${room.technicalScore >= 80 ? 'text-mint' : room.technicalScore >= 60 ? 'text-butter' : 'text-blush'}`}>
                                {room.technicalScore}%
                              </p>
                            </div>
                            {room.grammarScore !== null && (
                              <div>
                                <p className="text-[10px] uppercase font-bold text-on-surface-variant tracking-wider">Grammar</p>
                                <p className="text-base font-headline font-bold mt-1 text-on-surface">
                                  {room.grammarScore}%
                                </p>
                              </div>
                            )}
                            {room.feedback && (
                              <div className="w-full mt-2">
                                <p className="text-[10px] uppercase font-bold text-on-surface-variant tracking-wider mb-1">AI Feedback</p>
                                <p className="text-xs font-body text-on-surface-variant bg-surface p-3 rounded-lg border border-outline-variant/10 italic">"{room.feedback}"</p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="p-12 text-center flex flex-col items-center">
                      <span className="material-symbols-outlined text-4xl text-on-surface-variant/40 mb-4">school</span>
                      <p className="text-on-surface-variant font-body">No enrollment history found.</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB: PROFILE */}
            {activeTab === 'profile' && (
              <div className="space-y-6 animate-in fade-in duration-300">
                {!profile ? (
                  <div className="rounded-3xl bg-surface-container-lowest p-12 text-center shadow-soft">
                    <span className="material-symbols-outlined text-4xl text-on-surface-variant/40 mb-4">person_off</span>
                    <p className="text-on-surface-variant font-body">Detailed public profile is not available or hasn't been set up.</p>
                  </div>
                ) : (
                  <>
                    <div className="rounded-3xl bg-surface-container-lowest p-6 shadow-soft">
                      <h3 className="font-headline text-lg font-bold text-on-background mb-4 flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary">account_circle</span>
                        About
                      </h3>
                      {profile.user?.headline && (
                        <p className="font-headline text-base font-bold text-primary mb-2">{profile.user.headline}</p>
                      )}
                      <p className="font-body text-sm text-on-surface whitespace-pre-wrap">
                        {profile.user?.aboutMe || 'No description provided.'}
                      </p>
                      
                      <div className="mt-6 flex flex-wrap gap-4">
                        {profile.user?.githubProfile && (
                          <a href={profile.user.githubProfile} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm font-bold text-on-surface-variant hover:text-primary transition-colors bg-surface px-4 py-2 rounded-full border border-outline-variant/20">
                            <span className="material-symbols-outlined text-base">code</span> Github
                          </a>
                        )}
                        {profile.user?.linkedinProfile && (
                          <a href={profile.user.linkedinProfile} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm font-bold text-on-surface-variant hover:text-primary transition-colors bg-surface px-4 py-2 rounded-full border border-outline-variant/20">
                            <span className="material-symbols-outlined text-base">work</span> LinkedIn
                          </a>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Skills */}
                      <div className="rounded-3xl bg-surface-container-lowest p-6 shadow-soft">
                        <h3 className="font-headline text-lg font-bold text-on-background mb-4 flex items-center gap-2">
                          <span className="material-symbols-outlined text-primary">psychology</span>
                          Skills
                        </h3>
                        {profile.skills?.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {profile.skills.map((s, i) => (
                              <span key={i} className="bg-surface-container-highest px-3 py-1.5 rounded-lg text-sm font-body text-on-surface">
                                {s.skill} <span className="text-on-surface-variant opacity-70 ml-1 text-xs">({s.proficiency})</span>
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-on-surface-variant italic">No skills listed.</p>
                        )}
                      </div>
                      
                      {/* Interests */}
                      <div className="rounded-3xl bg-surface-container-lowest p-6 shadow-soft">
                        <h3 className="font-headline text-lg font-bold text-on-background mb-4 flex items-center gap-2">
                          <span className="material-symbols-outlined text-primary">favorite</span>
                          Interests
                        </h3>
                        {profile.interests?.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {profile.interests.map((int, i) => (
                              <span key={i} className="bg-primary/10 text-primary px-3 py-1.5 rounded-lg text-sm font-bold">
                                {int.interest}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-on-surface-variant italic">No interests listed.</p>
                        )}
                      </div>
                    </div>

                    {/* Experience & Qualifications */}
                    <div className="rounded-3xl bg-surface-container-lowest p-6 shadow-soft">
                      <h3 className="font-headline text-lg font-bold text-on-background mb-6 flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary">work_history</span>
                        Experience & Qualifications
                      </h3>
                      
                      <div className="space-y-6">
                        {profile.experience?.length > 0 && (
                          <div>
                            <h4 className="font-bold text-sm text-on-surface-variant uppercase tracking-wider mb-4 border-b border-outline-variant/20 pb-2">Experience</h4>
                            <div className="space-y-4">
                              {profile.experience.map((exp, i) => (
                                <div key={i} className="relative pl-4 border-l-2 border-primary/30">
                                  <div className="absolute w-2 h-2 bg-primary rounded-full -left-[5px] top-1.5"></div>
                                  <h5 className="font-bold text-on-background">{exp.jobTitle} at {exp.organisation}</h5>
                                  <p className="text-xs text-on-surface-variant mt-1 mb-2">
                                    {exp.startedOn ? new Date(exp.startedOn).getFullYear() : ''} - {exp.isCurrent ? 'Present' : exp.endedOn ? new Date(exp.endedOn).getFullYear() : ''}
                                  </p>
                                  <p className="text-sm font-body text-on-surface">{exp.description}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {profile.qualifications?.length > 0 && (
                          <div className="pt-2">
                            <h4 className="font-bold text-sm text-on-surface-variant uppercase tracking-wider mb-4 border-b border-outline-variant/20 pb-2">Qualifications</h4>
                            <div className="space-y-4">
                              {profile.qualifications.map((q, i) => (
                                <div key={i} className="relative pl-4 border-l-2 border-secondary/30">
                                  <div className="absolute w-2 h-2 bg-secondary rounded-full -left-[5px] top-1.5"></div>
                                  <h5 className="font-bold text-on-background">{q.qualification} <span className="font-normal text-on-surface-variant">in</span> {q.fieldOfStudy}</h5>
                                  <p className="text-xs text-on-surface-variant mt-1">
                                    {q.institution} ({q.startYear} - {q.endYear})
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {!profile.experience?.length && !profile.qualifications?.length && (
                          <p className="text-sm text-on-surface-variant italic">No experience or qualifications listed.</p>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}

export default AdminStudentStatsPage
