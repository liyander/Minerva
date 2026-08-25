import { useRef } from 'react'
import { getAssessmentLanguage } from '../utils/assessmentLanguages'

function AssessmentCodeEditor({ code, language, label = 'Code', onChange, readOnly = false }) {
  const textareaRef = useRef(null)
  const gutterRef = useRef(null)
  const languageInfo = getAssessmentLanguage(language)
  const lineCount = Math.max(1, String(code || '').split('\n').length)

  const handleKeyDown = (event) => {
    if (readOnly || event.key !== 'Tab') return
    event.preventDefault()
    const target = event.currentTarget
    const start = target.selectionStart
    const end = target.selectionEnd
    const nextCode = `${code.slice(0, start)}  ${code.slice(end)}`
    onChange(nextCode)
    requestAnimationFrame(() => {
      target.selectionStart = start + 2
      target.selectionEnd = start + 2
    })
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-700 bg-[#0b1220] shadow-inner">
      <div className="flex items-center justify-between border-b border-slate-700 bg-[#111b2e] px-4 py-2 text-xs text-slate-300">
        <span className="font-headline font-bold">{label}</span>
        <span className="rounded-full bg-slate-700 px-2.5 py-1 font-mono">{languageInfo.label} · .{languageInfo.extension}</span>
      </div>
      <div className="grid min-h-80 grid-cols-[3.25rem_1fr]">
        <pre ref={gutterRef} aria-hidden="true" className="m-0 select-none overflow-hidden border-r border-slate-700 bg-[#0e1728] py-4 pr-3 text-right font-mono text-sm leading-6 text-slate-500">
          {Array.from({ length: lineCount }, (_, index) => index + 1).join('\n')}
        </pre>
        <textarea
          ref={textareaRef}
          aria-label={`${languageInfo.label} ${label}`}
          className="m-0 min-h-80 w-full resize-y overflow-auto whitespace-pre bg-transparent p-4 font-mono text-sm leading-6 text-slate-100 caret-cyan-300 outline-none selection:bg-primary/40"
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          onScroll={(event) => { if (gutterRef.current) gutterRef.current.scrollTop = event.currentTarget.scrollTop }}
          readOnly={readOnly}
          spellCheck="false"
          value={code}
        />
      </div>
    </div>
  )
}

export default AssessmentCodeEditor
