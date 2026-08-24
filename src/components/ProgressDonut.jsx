// A compact donut used on the progress cards. pathLength="100" lets the dash
// array be expressed directly in percent, so the sweep animates cleanly.
function ProgressDonut({
  value = 0,
  size = 64,
  thickness = 6,
  trackClass = 'text-current opacity-20',
  barClass = 'text-current',
  showLabel = false,
  labelClass = 'text-current',
}) {
  const safeValue = Math.max(0, Math.min(100, Math.round(value)))

  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      <svg className="-rotate-90" height={size} viewBox="0 0 42 42" width={size}>
        <circle
          className={trackClass}
          cx="21"
          cy="21"
          fill="none"
          r="15.9155"
          stroke="currentColor"
          strokeWidth={thickness}
        />
        {/* A zero-length dash with a round cap still paints a dot, so skip the bar entirely at 0%. */}
        {safeValue > 0 ? (
          <circle
            className={`${barClass} transition-[stroke-dasharray] duration-700 ease-out`}
            cx="21"
            cy="21"
            fill="none"
            pathLength="100"
            r="15.9155"
            stroke="currentColor"
            strokeDasharray={`${safeValue} ${100 - safeValue}`}
            strokeLinecap="round"
            strokeWidth={thickness}
          />
        ) : null}
      </svg>
      {showLabel ? (
        <span
          className={`absolute inset-0 flex items-center justify-center font-headline font-extrabold ${labelClass}`}
          style={{ fontSize: Math.max(11, Math.round(size * 0.26)) }}
        >
          {safeValue}%
        </span>
      ) : null}
      <span className="sr-only">{safeValue}% complete</span>
    </span>
  )
}

export default ProgressDonut
