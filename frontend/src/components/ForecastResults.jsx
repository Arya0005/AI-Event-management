import { Building2, IndianRupee, ListChecks, Package, Target, TriangleAlert, Users } from 'lucide-react'
import { money, number, percent, titleCase } from '../utils/format'
import { Badge, Card } from './ui'

/** Headline forecast tile with an accent icon and optional 0–1 gauge. */
function ForecastTile({ icon: Icon, tone, label, value, sub, gauge, children }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
      <div className={`pointer-events-none absolute -top-10 -right-10 size-32 rounded-full blur-2xl ${tone.glow}`} />
      <div className="relative flex items-center gap-2.5">
        <span className={`flex size-8 items-center justify-center rounded-lg ${tone.icon}`}><Icon className="size-4" aria-hidden /></span>
        <p className="text-xs font-medium text-slate-500">{label}</p>
      </div>
      <p className="relative mt-3 text-3xl font-semibold tracking-tight text-slate-900 tabular-nums">{value}</p>
      {sub && <div className="relative mt-1 text-sm text-slate-500">{sub}</div>}
      {gauge !== undefined && (
        <div className="relative mt-4 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div className={`h-full rounded-full transition-[width] duration-1000 ease-out ${tone.bar}`} style={{ width: `${Math.min(1, Math.max(0, gauge)) * 100}%` }} />
        </div>
      )}
      {children}
    </div>
  )
}

const TILE_TONES = {
  indigo: { glow: 'bg-indigo-500/15', icon: 'bg-indigo-50 text-indigo-600', bar: 'bg-indigo-500' },
  emerald: { glow: 'bg-emerald-500/15', icon: 'bg-emerald-50 text-emerald-600', bar: 'bg-emerald-500' },
  amber: { glow: 'bg-amber-500/15', icon: 'bg-amber-50 text-amber-600', bar: 'bg-amber-500' },
  rose: { glow: 'bg-rose-500/15', icon: 'bg-rose-50 text-rose-600', bar: 'bg-rose-500' },
  violet: { glow: 'bg-violet-500/15', icon: 'bg-violet-50 text-violet-600', bar: 'bg-violet-500' },
}

function Big({ label, value, sub }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums text-slate-900">{value}</p>
      {sub && <p className="mt-1 text-sm text-slate-500">{sub}</p>}
    </div>
  )
}

function featureValue(k, v) {
  if (v === null || v === undefined) return '— (no history)'
  if (k === 'prior_type_attendance_rate' || k === 'fill_rate') return percent(v)
  if (['ticket_price', 'marketing_budget', 'budget'].includes(k)) return money(v)
  if (k === 'is_weekend') return v ? 'Yes' : 'No'
  if (k === 'day_of_week') return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][v]
  if (typeof v === 'number') return number(v)
  return titleCase(String(v))
}

export function ForecastResults({ forecast, venue, equipment }) {
  const { attendance, revenue, success } = forecast
  const p = success.success_probability
  const successKey = p >= 0.6 ? 'emerald' : p >= 0.4 ? 'amber' : 'rose'
  const successBadge = { emerald: 'bg-emerald-50 text-emerald-700', amber: 'bg-amber-50 text-amber-700', rose: 'bg-rose-50 text-rose-700' }[successKey]

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="grid gap-4 md:grid-cols-3">
        <ForecastTile icon={Users} tone={TILE_TONES.indigo} label="Predicted attendance"
          value={number(attendance.predicted_attendance)} gauge={attendance.attendance_rate}
          sub={`${percent(attendance.attendance_rate)} of ${number(attendance.registration_count)} registrations`} />
        <ForecastTile icon={IndianRupee} tone={TILE_TONES.violet} label="Predicted revenue"
          value={money(revenue.predicted_revenue)} sub="Tickets + sponsorship + other" />
        <ForecastTile icon={Target} tone={TILE_TONES[successKey]} label="Success probability"
          value={percent(p, 0)} gauge={p}
          sub={<Badge className={successBadge}>{success.is_likely_successful ? 'Likely successful' : 'At risk'}</Badge>}>
          <p className="relative mt-3 text-xs text-slate-500">Success = {success.success_definition}</p>
        </ForecastTile>
      </div>

      {(venue || equipment) && (
        <div className="grid gap-6 lg:grid-cols-2">
          {venue && (
            <Card title="Venue recommendation" icon={Building2}>
              <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
                <Big label="Recommended capacity" value={number(venue.recommended_capacity)} />
                <div className="text-sm text-slate-600">
                  Current {number(venue.current_capacity)} · utilisation {percent(venue.capacity_utilisation, 0)}
                </div>
              </div>
              <p className="mt-3 text-sm font-medium text-slate-800">{venue.assessment}</p>
              <p className="mt-1 text-xs text-slate-500">{venue.rationale}</p>
              {venue.venues.length > 0 && (
                <table className="data-table mt-4">
                  <thead>
                    <tr><th className="pb-1">Venue</th><th className="pb-1 text-right">Capacity</th><th className="pb-1 text-right">Success</th><th className="pb-1 text-right">Attendance</th><th className="pb-1 text-right">Events</th></tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {venue.venues.map((v) => (
                      <tr key={v.venue}>
                        <td className="py-1.5 font-medium text-slate-800">{v.venue}</td>
                        <td className="py-1.5 text-right">{number(v.capacity)}</td>
                        <td className="py-1.5 text-right">{percent(v.success_rate, 0)}</td>
                        <td className="py-1.5 text-right">{percent(v.mean_attendance_rate, 0)}</td>
                        <td className="py-1.5 text-right">{v.events}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          )}
          {equipment && (
            <Card title="Equipment & resource budget" icon={Package}>
              <Big label="Suggested total" value={money(equipment.recommended_total_budget)} />
              <p className="mt-1 text-xs text-slate-500">{equipment.rationale}</p>
              {equipment.items.length > 0 && (
                <table className="data-table mt-4">
                  <thead>
                    <tr><th className="pb-1">Category</th><th className="pb-1 text-right">Per attendee</th><th className="pb-1 text-right">Suggested</th></tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {equipment.items.map((i) => (
                      <tr key={i.category}>
                        <td className="py-1.5 font-medium text-slate-800">{titleCase(i.category)}</td>
                        <td className="py-1.5 text-right">{money(i.median_spend_per_attendee)}</td>
                        <td className="py-1.5 text-right">{money(i.recommended_budget)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          )}
        </div>
      )}

      <Card title="Model inputs" subtitle="The exact features the models used — for explainability" icon={ListChecks}>
        <div className="grid gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(attendance.features).filter(([k]) => k !== 'note').map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 border-b border-slate-100 py-1">
              <span className="text-slate-500">{titleCase(k)}</span>
              <span className="font-medium tabular-nums text-slate-800">{featureValue(k, v)}</span>
            </div>
          ))}
        </div>
        {attendance.features.note && <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800"><TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />{attendance.features.note}</p>}
        <p className="mt-3 font-mono text-xs text-slate-400">
          {attendance.model_version} · {revenue.model_version} · {success.model_version}
        </p>
      </Card>
    </div>
  )
}
