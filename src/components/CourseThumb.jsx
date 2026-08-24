const PALETTES = [
  { from: '#7dd3fc', to: '#6d55e0', icon: 'code' },
  { from: '#6ee7b7', to: '#0f9b76', icon: 'database' },
  { from: '#fcd34d', to: '#f97316', icon: 'palette' },
  { from: '#f9a8d4', to: '#c026d3', icon: 'insights' },
  { from: '#a5b4fc', to: '#4338ca', icon: 'terminal' },
]

function hashOf(value) {
  const text = String(value || '')
  let hash = 0
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) % 9973
  }
  return hash
}

// Courses rarely ship artwork, so derive a stable illustrated tile from the
// title instead of falling back to an empty grey box.
function CourseThumb({ course, size = 'md', className = '' }) {
  const palette = PALETTES[hashOf(course?.slug || course?.title) % PALETTES.length]
  const icon = course?.icon || palette.icon
  const gradientId = `thumb-${hashOf(course?.slug || course?.title)}`

  const dimension = size === 'lg' ? 'h-full w-full' : size === 'sm' ? 'h-11 w-11' : 'h-14 w-14'

  if (course?.image) {
    return (
      <div className={`relative overflow-hidden rounded-2xl ${dimension} ${className}`}>
        <img
          alt={course.title}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
          src={course.image}
        />
      </div>
    )
  }

  return (
    <div
      className={`relative overflow-hidden rounded-2xl ${dimension} ${className} transition-transform duration-500 group-hover:scale-105 group-hover:-rotate-2`}
    >
      <svg className="h-full w-full" viewBox="0 0 64 64" role="presentation">
        <defs>
          <linearGradient id={gradientId} x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor={palette.from} />
            <stop offset="100%" stopColor={palette.to} />
          </linearGradient>
        </defs>
        <rect fill={`url(#${gradientId})`} height="64" rx="16" width="64" />
        <circle cx="50" cy="14" fill="#ffffff" opacity="0.18" r="16" />
        <circle cx="12" cy="54" fill="#ffffff" opacity="0.12" r="12" />
      </svg>
      <span className="material-symbols-outlined absolute inset-0 flex items-center justify-center text-white/90 text-[26px]">
        {icon}
      </span>
    </div>
  )
}

export default CourseThumb
