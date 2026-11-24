const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
const inrCompact = new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', notation: 'compact', maximumFractionDigits: 1,
})
const num = new Intl.NumberFormat('en-IN')

export const money = (v) => (v === null || v === undefined ? '—' : inr.format(v))
export const moneyCompact = (v) => (v === null || v === undefined ? '—' : inrCompact.format(v))
export const number = (v) => (v === null || v === undefined ? '—' : num.format(Math.round(v)))
export const percent = (v, digits = 1) =>
  v === null || v === undefined ? '—' : `${(v * 100).toFixed(digits)}%`

export const date = (v) =>
  v ? new Date(v).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
export const dateTime = (v) =>
  v ? new Date(v).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

/** ISO string -> value for <input type="datetime-local"> in local time. */
export const toLocalInput = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export const titleCase = (s) => (s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

export const STATUS_LABELS = {
  draft: 'Draft',
  published: 'Published',
  registration_open: 'Registration open',
  registration_closed: 'Registration closed',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

// Mirrors backend TRANSITIONS in app/routes/events.py
export const STATUS_TRANSITIONS = {
  draft: ['published', 'cancelled'],
  published: ['registration_open', 'draft', 'cancelled'],
  registration_open: ['registration_closed', 'cancelled'],
  registration_closed: ['completed', 'registration_open', 'cancelled'],
  completed: [],
  cancelled: ['draft'],
}

export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December']
