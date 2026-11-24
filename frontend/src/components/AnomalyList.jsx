import { Link } from 'react-router-dom'
import { percent, titleCase } from '../utils/format'
import { Badge, EmptyState } from './ui'

const SEVERITY = {
  high: 'bg-rose-100 text-rose-800',
  medium: 'bg-amber-100 text-amber-800',
  low: 'bg-slate-100 text-slate-700',
}

const RATIO_METRICS = new Set(['fill_rate', 'attendance_rate', 'expense_budget_ratio'])

export function AnomalyList({ items, compact = false }) {
  if (!items.length) return <EmptyState title="No anomalies detected" />
  return (
    <ul className="divide-y divide-slate-100">
      {items.map((a, i) => (
        <li key={`${a.event_id}-${a.type}-${i}`} className="flex flex-wrap items-start justify-between gap-3 py-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={SEVERITY[a.severity]}>{a.severity}</Badge>
              <span className="text-sm font-medium text-slate-800">{titleCase(a.type)}</span>
              {!compact && (
                <Link to={`/events/${a.event_id}`} className="truncate text-sm text-indigo-600 hover:text-indigo-800">{a.event_name}</Link>
              )}
            </div>
            <p className="mt-1 text-sm text-slate-600">{a.message}</p>
          </div>
          <div className="text-right text-xs text-slate-500 tabular-nums">
            {a.expected != null && (
              <p>
                {titleCase(a.metric)}: {RATIO_METRICS.has(a.metric) ? percent(a.value, 0) : Math.round(a.value)}
                {' '}vs typical {RATIO_METRICS.has(a.metric) ? percent(a.expected, 0) : Math.round(a.expected)}
              </p>
            )}
            {a.z_score != null && <p>z-score {a.z_score}</p>}
          </div>
        </li>
      ))}
    </ul>
  )
}
