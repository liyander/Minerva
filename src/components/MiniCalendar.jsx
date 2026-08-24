import { useMemo, useState } from 'react'
import { EVENT_KINDS } from './calendarEventKinds'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

function sameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function MiniCalendar({ events = [], selectedDate, onSelectDate }) {
  const today = useMemo(() => new Date(), [])
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))

  const active = selectedDate || today

  const days = useMemo(() => {
    const firstOfMonth = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
    // Back up to the Sunday on or before the 1st so the grid always starts on a week boundary.
    const gridStart = new Date(firstOfMonth)
    gridStart.setDate(firstOfMonth.getDate() - firstOfMonth.getDay())

    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(gridStart)
      date.setDate(gridStart.getDate() + index)
      return date
    })
  }, [cursor])

  const eventsByDay = useMemo(() => {
    const map = new Map()
    events.forEach((event) => {
      const date = new Date(event.date)
      if (Number.isNaN(date.getTime())) {
        return
      }
      const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
      map.set(key, [...(map.get(key) || []), event])
    })
    return map
  }, [events])

  const dayEvents = (date) =>
    eventsByDay.get(`${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`) || []

  const shiftMonth = (offset) => {
    setCursor((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1))
  }

  const navButton =
    'h-7 w-7 inline-flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors'

  return (
    <div className="rounded-3xl bg-surface-container-lowest p-5 shadow-soft">
      <div className="flex items-center justify-between mb-4">
        <p className="font-headline text-base font-extrabold text-on-background">
          {MONTHS[cursor.getMonth()]} {cursor.getFullYear()}
        </p>
        <div className="flex items-center gap-1">
          <button
            aria-label="Previous month"
            className={navButton}
            onClick={() => shiftMonth(-1)}
            type="button"
          >
            <span className="material-symbols-outlined text-base">chevron_left</span>
          </button>
          <button
            aria-label="Next month"
            className={navButton}
            onClick={() => shiftMonth(1)}
            type="button"
          >
            <span className="material-symbols-outlined text-base">chevron_right</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-y-1 text-center">
        {WEEKDAYS.map((day) => (
          <span className="font-headline text-xs font-bold text-on-surface-variant" key={day}>
            {day}
          </span>
        ))}

        {days.map((date) => {
          const inMonth = date.getMonth() === cursor.getMonth()
          const isToday = sameDay(date, today)
          const isActive = sameDay(date, active)
          const marks = dayEvents(date)

          return (
            <button
              className="relative flex flex-col items-center justify-start pt-1 pb-2 group"
              key={date.toISOString()}
              onClick={() => onSelectDate?.(date)}
              type="button"
            >
              <span
                className={`h-7 w-7 inline-flex items-center justify-center rounded-full font-body text-xs transition-all duration-200 group-hover:scale-110 ${
                  isActive
                    ? 'bg-primary text-on-primary font-bold'
                    : isToday
                      ? 'ring-1 ring-primary text-primary font-bold'
                      : inMonth
                        ? 'text-on-surface group-hover:bg-surface-container-high'
                        : 'text-on-surface-variant/40'
                }`}
              >
                {date.getDate()}
              </span>
              <span className="mt-1 flex h-1 items-center gap-0.5">
                {marks.slice(0, 3).map((mark, index) => (
                  <span
                    className={`h-1 w-1 rounded-full ${
                      EVENT_KINDS[mark.kind]?.dot || 'bg-on-surface-variant'
                    }`}
                    key={`${mark.id}-${index}`}
                  ></span>
                ))}
              </span>
            </button>
          )
        })}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-outline-variant pt-3">
        {Object.entries(EVENT_KINDS).map(([key, kind]) => (
          <span className="flex items-center gap-1.5 font-body text-[11px] text-on-surface-variant" key={key}>
            <span className={`h-1.5 w-1.5 rounded-full ${kind.dot}`}></span>
            {kind.label}
          </span>
        ))}
      </div>
    </div>
  )
}

export default MiniCalendar
