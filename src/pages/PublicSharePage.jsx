import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { fetchPublicShare } from '../services/platform'

export default function PublicSharePage() {
  const { token } = useParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => { fetchPublicShare(token).then(setData).catch((requestError) => setError(requestError.message)) }, [token])
  if (error) return <main className="min-h-screen bg-background p-10 text-center text-error">{error}</main>
  if (!data) return <main className="min-h-screen bg-background p-10 text-center">Loading shared profile…</main>

  if (data.type === 'transcript') {
    return <main className="min-h-screen bg-background px-5 py-12"><section className="mx-auto max-w-4xl rounded-3xl bg-surface-container-lowest p-8 shadow-soft"><p className="font-headline text-lg font-extrabold text-primary">Minerva verified transcript</p><h1 className="mt-4 font-headline text-4xl font-extrabold">{data.person.name}</h1><p className="mt-2 text-sm text-on-surface-variant">Verified {new Date(data.verifiedAt).toLocaleDateString()} · Overall {data.report.totals.percentage}% · Grade {data.report.totals.letterGrade} · GPA {data.report.totals.gpa}</p><div className="mt-8 overflow-x-auto"><table className="w-full text-sm"><thead><tr>{['Item', 'Category', 'Score', 'Percent', 'Outcome'].map((head) => <th className="p-3 text-left" key={head}>{head}</th>)}</tr></thead><tbody>{data.report.entries.map((entry, index) => <tr className="border-t border-outline-variant" key={`${entry.title}-${index}`}><td className="p-3 font-bold">{entry.title}</td><td className="p-3">{entry.category}</td><td className="p-3">{entry.score}/{entry.max_score}</td><td className="p-3">{entry.percentage}%</td><td className="p-3">{entry.letter_grade || entry.outcome || '—'}</td></tr>)}</tbody></table></div></section></main>
  }

  const items = data.type === 'portfolio' ? data.items : data.skills
  return <main className="min-h-screen bg-background px-5 py-12"><section className="mx-auto max-w-4xl"><p className="font-headline text-lg font-extrabold text-primary">Minerva verified profile</p><h1 className="mt-4 font-headline text-4xl font-extrabold">{data.person.name}</h1><p className="mt-2 text-on-surface-variant">{data.person.headline}</p><h2 className="mt-10 font-headline text-xl font-extrabold capitalize">{data.type}</h2><div className="mt-4 grid gap-4 md:grid-cols-2">{items.map((item, index) => <article className="rounded-3xl bg-surface-container-lowest p-5 shadow-soft" key={item.id || `${item.skill}-${index}`}><h3 className="font-headline font-extrabold">{item.title || item.skill}</h3><p className="mt-2 text-sm text-on-surface-variant">{item.description || `${item.proficiency} · ${item.evidence_label || item.evidence_type}`}</p>{item.verified ? <span className="mt-3 inline-block rounded-full bg-mint px-3 py-1 text-xs font-bold text-on-mint">Trainer verified</span> : null}</article>)}</div></section></main>
}
