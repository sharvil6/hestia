// Date helpers for meal plans. week_start is an ISO date string (YYYY-MM-DD),
// always a Monday (the backend snaps it). All math is local-time, date-only.

export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const
export const DAY_ABBREV = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

/** Parse YYYY-MM-DD as a local date (avoids the UTC shift of new Date(iso)). */
export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

export function toISODate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Monday of the week containing d. */
export function mondayOf(d: Date): Date {
  const out = new Date(d)
  const dow = (out.getDay() + 6) % 7 // 0 = Monday
  out.setDate(out.getDate() - dow)
  return out
}

export function addDays(d: Date, days: number): Date {
  const out = new Date(d)
  out.setDate(out.getDate() + days)
  return out
}

/** "Mar 2 – 8" or "Feb 26 – Mar 3" for the week starting at weekStart. */
export function formatWeekRange(weekStartISO: string): string {
  const start = parseISODate(weekStartISO)
  const end = addDays(start, 6)
  const md = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  if (start.getMonth() === end.getMonth()) {
    return `${md(start)} – ${end.getDate()}`
  }
  return `${md(start)} – ${md(end)}`
}

/** True when today falls inside the plan's week. */
export function isCurrentWeek(weekStartISO: string): boolean {
  return toISODate(mondayOf(new Date())) === weekStartISO
}

/** Date label for day index 0–6 within the week, e.g. "Mar 4". */
export function dayDateLabel(weekStartISO: string, day: number): string {
  return addDays(parseISODate(weekStartISO), day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
