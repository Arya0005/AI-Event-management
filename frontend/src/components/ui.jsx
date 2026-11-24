import { AlertCircle, ChevronLeft, ChevronRight, Inbox, Loader2, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { STATUS_LABELS } from '../utils/format'

const cx = (...c) => c.filter(Boolean).join(' ')

/* ───────────────────────────── Buttons ───────────────────────────── */

const BUTTON_VARIANTS = {
  primary:
    'bg-indigo-600 text-on-accent shadow-sm shadow-indigo-600/20 hover:brightness-110 active:brightness-95',
  secondary:
    'bg-white text-slate-700 border border-slate-200 shadow-card hover:bg-slate-50 hover:border-slate-300',
  danger: 'bg-rose-600 text-on-accent shadow-sm shadow-rose-600/20 hover:brightness-110 active:brightness-95',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
  gradient:
    'bg-gradient-to-r from-indigo-600 to-violet-600 text-on-accent shadow-glow hover:brightness-110 active:brightness-95',
}
const BUTTON_SIZES = {
  xs: 'h-7 px-2 text-xs gap-1',
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-9 px-4 text-sm gap-2',
  lg: 'h-11 px-5 text-sm gap-2',
}

export function Button({
  variant = 'primary', size = 'md', icon: Icon, loading = false, className = '', children, disabled, ...props
}) {
  return (
    <button
      className={cx(
        'inline-flex select-none items-center justify-center whitespace-nowrap rounded-lg font-medium',
        'transition-all duration-150 disabled:pointer-events-none disabled:opacity-50',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500',
        BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className,
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : Icon && <Icon className="size-4" aria-hidden />}
      {children}
    </button>
  )
}

export function IconButton({ icon: Icon, label, className = '', ...props }) {
  return (
    <button
      aria-label={label}
      title={label}
      className={cx(
        'inline-flex size-9 items-center justify-center rounded-lg text-slate-500 transition-colors',
        'hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-indigo-500',
        className,
      )}
      {...props}
    >
      <Icon className="size-[18px]" aria-hidden />
    </button>
  )
}

/* ───────────────────────────── Surfaces ───────────────────────────── */

export function Card({ title, subtitle, icon: Icon, actions, children, className = '', bodyClassName = 'p-5' }) {
  return (
    <section className={cx('rounded-2xl border border-slate-200 bg-white shadow-card', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
          <div className="flex min-w-0 items-center gap-2.5">
            {Icon && (
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                <Icon className="size-4" aria-hidden />
              </span>
            )}
            <div className="min-w-0">
              {title && <h2 className="truncate text-sm font-semibold text-slate-900">{title}</h2>}
              {subtitle && <p className="truncate text-xs text-slate-500">{subtitle}</p>}
            </div>
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  )
}

const TONES = {
  indigo: 'bg-indigo-50 text-indigo-600 ring-indigo-100',
  sky: 'bg-sky-50 text-sky-600 ring-sky-100',
  emerald: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
  amber: 'bg-amber-50 text-amber-600 ring-amber-100',
  rose: 'bg-rose-50 text-rose-600 ring-rose-100',
  violet: 'bg-violet-50 text-violet-600 ring-violet-100',
  slate: 'bg-slate-100 text-slate-600 ring-slate-200',
}

/** KPI tile. `trend` is an optional { value: string, positive: boolean } chip. */
export function StatCard({ label, value, hint, icon: Icon, tone = 'indigo', trend }) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-elevated sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        {Icon && (
          <span className={cx('flex size-8 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset', TONES[tone])}>
            <Icon className="size-4" aria-hidden />
          </span>
        )}
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">{value}</p>
      {(hint || trend) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          {trend && (
            <span className={cx('rounded-md px-1.5 py-0.5 font-medium',
              trend.positive ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700')}>
              {trend.value}
            </span>
          )}
          {hint && <span className="truncate">{hint}</span>}
        </div>
      )}
    </div>
  )
}

/* ───────────────────────────── Badges ───────────────────────────── */

const STATUS_STYLES = {
  draft: ['bg-slate-100 text-slate-700', 'bg-slate-400'],
  published: ['bg-sky-50 text-sky-700 ring-sky-200', 'bg-sky-500'],
  registration_open: ['bg-emerald-50 text-emerald-700 ring-emerald-200', 'bg-emerald-500'],
  registration_closed: ['bg-amber-50 text-amber-700 ring-amber-200', 'bg-amber-500'],
  completed: ['bg-indigo-50 text-indigo-700 ring-indigo-200', 'bg-indigo-500'],
  cancelled: ['bg-rose-50 text-rose-700 ring-rose-200', 'bg-rose-500'],
}

export function StatusBadge({ status }) {
  const [className, dot] = STATUS_STYLES[status] || STATUS_STYLES.draft
  return <Badge className={className} dot={dot}>{STATUS_LABELS[status] || status}</Badge>
}

export function Badge({ children, className = 'bg-slate-100 text-slate-700', dot }) {
  return (
    <span className={cx(
      'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ring-transparent',
      className,
    )}>
      {dot && <span className={cx('size-1.5 rounded-full', dot)} aria-hidden />}
      {children}
    </span>
  )
}

/* ───────────────────────────── Feedback ───────────────────────────── */

export function Spinner({ label = 'Loading…' }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500" role="status">
      <Loader2 className="size-4 animate-spin text-indigo-600" aria-hidden />
      {label}
    </div>
  )
}

export function Skeleton({ className = '' }) {
  return <div className={cx('skeleton', className)} aria-hidden />
}

/** Placeholder shaped like a typical page: header, KPI row and two chart cards. */
export function PageSkeleton({ stats = 4 }) {
  return (
    <div role="status" aria-label="Loading">
      <Skeleton className="h-7 w-48" />
      <Skeleton className="mt-2 h-4 w-72" />
      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: stats }, (_, i) => (
          <div key={i} className="rounded-2xl border border-slate-200 bg-white p-5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-3 h-7 w-24" />
            <Skeleton className="mt-2 h-3 w-28" />
          </div>
        ))}
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 lg:col-span-2"><Skeleton className="h-64 w-full" /></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5"><Skeleton className="h-64 w-full" /></div>
      </div>
    </div>
  )
}

export function TableSkeleton({ rows = 6 }) {
  return (
    <div className="space-y-3" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-9 flex-1" />
          <Skeleton className="hidden h-9 w-28 sm:block" />
          <Skeleton className="hidden h-9 w-24 md:block" />
        </div>
      ))}
    </div>
  )
}

export function ErrorMessage({ error, onRetry }) {
  if (!error) return null
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800" role="alert">
      <span className="flex items-start gap-2">
        <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>{error.message || String(error)}</span>
      </span>
      {onRetry && <Button variant="secondary" size="sm" onClick={onRetry}>Retry</Button>}
    </div>
  )
}

export function EmptyState({ title, children, icon: Icon = Inbox, action }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-slate-300 px-6 py-10 text-center">
      <span className="flex size-10 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        <Icon className="size-5" aria-hidden />
      </span>
      <p className="mt-3 text-sm font-medium text-slate-800">{title}</p>
      {children && <div className="mt-1 max-w-sm text-sm text-slate-500">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

/** Horizontal fill bar, e.g. registrations / capacity. */
export function ProgressBar({ value, max = 1, className = '' }) {
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0
  const color = ratio >= 0.9 ? 'bg-emerald-500' : ratio >= 0.5 ? 'bg-indigo-500' : 'bg-amber-500'
  return (
    <div className={cx('h-1.5 w-full overflow-hidden rounded-full bg-slate-100', className)}
      role="progressbar" aria-valuenow={Math.round(ratio * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cx('h-full rounded-full transition-[width] duration-700 ease-out', color)} style={{ width: `${ratio * 100}%` }} />
    </div>
  )
}

/* ───────────────────────────── Identity ───────────────────────────── */

const AVATAR_COLORS = [
  'from-indigo-500 to-violet-500', 'from-sky-500 to-indigo-500', 'from-emerald-500 to-teal-500',
  'from-amber-500 to-orange-500', 'from-rose-500 to-pink-500', 'from-violet-500 to-fuchsia-500',
]

export function Avatar({ name, email, size = 'md' }) {
  const source = (name || email || '?').trim()
  const parts = source.includes('@') ? [source[0]] : source.split(/\s+/)
  const initials = parts.slice(0, 2).map((p) => p[0]).join('').toUpperCase()
  const hash = [...source].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 0)
  const sizes = { sm: 'size-7 text-[11px]', md: 'size-9 text-xs', lg: 'size-12 text-base' }
  return (
    <span className={cx(
      'inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-semibold text-on-accent',
      AVATAR_COLORS[hash % AVATAR_COLORS.length], sizes[size],
    )} aria-hidden>
      {initials}
    </span>
  )
}

export function Kbd({ children }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-slate-200 bg-slate-50 px-1 font-sans text-[10px] font-medium text-slate-500">
      {children}
    </kbd>
  )
}

/* ───────────────────────────── Forms ───────────────────────────── */

export function Field({ label, error, hint, children, className = '' }) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1.5 block text-xs font-medium text-slate-700">{label}</span>
      {children}
      {hint && !error && <span className="mt-1.5 block text-xs text-slate-500">{hint}</span>}
      {error && <span className="mt-1.5 block text-xs font-medium text-rose-600">{error}</span>}
    </label>
  )
}

export const inputClass =
  'block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-card ' +
  'transition-[border-color,box-shadow] placeholder:text-slate-400 hover:border-slate-300 ' +
  'focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/15 ' +
  'disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500'

export function Input({ className = '', ...props }) {
  return <input className={cx(inputClass, className)} {...props} />
}

export function Textarea({ className = '', ...props }) {
  return <textarea className={cx(inputClass, 'resize-y', className)} {...props} />
}

export function Select({ children, className = '', ...props }) {
  return <select className={cx(inputClass, 'pr-8', className)} {...props}>{children}</select>
}

/* ───────────────────────────── Overlays ───────────────────────────── */

export function Modal({ open, title, onClose, children, footer, size = 'md' }) {
  const panel = useRef(null)

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    panel.current?.focus()
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      previous?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null
  const widths = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl' }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-fade-in" onMouseDown={onClose}>
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cx('max-h-[90vh] w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-elevated outline-none animate-scale-in', widths[size])}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <IconButton icon={X} label="Close" onClick={onClose} className="-mr-2 size-8" />
        </header>
        <div className="p-5">{children}</div>
        {footer && <footer className="flex justify-end gap-2 rounded-b-2xl border-t border-slate-100 bg-slate-50 px-5 py-3">{footer}</footer>}
      </div>
    </div>
  )
}

export function ConfirmModal({ open, title, message, confirmLabel = 'Confirm', danger, busy, onConfirm, onClose }) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={busy}>
            {busy ? 'Working…' : confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-slate-600">{message}</p>
    </Modal>
  )
}

/* ───────────────────────────── Navigation ───────────────────────────── */

export function Tabs({ tabs, active, onChange }) {
  return (
    <div className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 shadow-card" role="tablist">
      {tabs.map((t) => {
        const selected = active === t.id
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(t.id)}
            className={cx(
              'inline-flex items-center gap-2 whitespace-nowrap rounded-lg px-3.5 py-1.5 text-sm font-medium transition-all',
              selected ? 'bg-indigo-600 text-on-accent shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
            )}
          >
            {t.icon && <t.icon className="size-4" aria-hidden />}
            {t.label}
          </button>
        )
      })}
    </div>
  )
}

export function Pagination({ page, pageSize, total, onChange }) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (pages <= 1) return null
  const from = (page - 1) * pageSize + 1
  const to = Math.min(total, page * pageSize)
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 text-sm text-slate-500">
      <span>Showing <strong className="font-medium text-slate-800">{from}–{to}</strong> of {total}</span>
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" icon={ChevronLeft} disabled={page <= 1} onClick={() => onChange(page - 1)}>Previous</Button>
        <span className="px-1 tabular-nums">{page} / {pages}</span>
        <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => onChange(page + 1)}>
          Next <ChevronRight className="size-4" aria-hidden />
        </Button>
      </div>
    </div>
  )
}

export function PageHeader({ title, subtitle, actions, eyebrow }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <p className="mb-1 text-xs font-semibold tracking-wider text-indigo-600 uppercase">{eyebrow}</p>}
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}
