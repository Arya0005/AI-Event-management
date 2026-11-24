import { BrainCircuit, History, IndianRupee, SlidersHorizontal, Sparkles, Target, TriangleAlert, Users } from 'lucide-react'
import { useState } from 'react'
import { ForecastResults } from '../components/ForecastResults'
import { Button, Card, ErrorMessage, Field, Input, PageHeader, Select, Skeleton, TableSkeleton } from '../components/ui'
import { useToast } from '../context/ToastContext'
import { useAsync } from '../hooks/useAsync'
import { eventService } from '../services/eventService'
import { predictionService } from '../services/predictionService'
import { DAYS, dateTime, money, MONTHS, number, percent, titleCase } from '../utils/format'

const DEFAULTS = {
  event_type: 'conference', capacity: '1000', ticket_price: '750', registration_count: '800',
  month: '10', day_of_week: '5', duration_days: '1', marketing_budget: '50000', budget: '500000',
}

export default function Predictions() {
  const [form, setForm] = useState(DEFAULTS)
  const [eventId, setEventId] = useState('')
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [running, setRunning] = useState(false)
  const toast = useToast()

  const models = useAsync(() => predictionService.models(), [])
  const upcoming = useAsync(() => eventService.list({
    status: 'draft,published,registration_open,registration_closed', sort: 'start_date', page_size: 100,
  }), [])
  const history = useAsync(() => predictionService.history({ limit: 15 }), [])

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const prefill = async (id) => {
    setEventId(id)
    setResult(null)
    if (!id) return
    try {
      const i = await predictionService.inputsForEvent(id)
      setForm(Object.fromEntries(Object.entries(DEFAULTS).map(([k]) => [k, String(i[k])])))
    } catch (err) {
      setError(err)
    }
  }

  const submit = async (e) => {
    e.preventDefault()
    const payload = {
      event_type: form.event_type,
      ...Object.fromEntries(Object.entries(form).filter(([k]) => k !== 'event_type').map(([k, v]) => [k, Number(v)])),
      ...(eventId ? { event_id: eventId } : {}),
    }
    if (payload.registration_count > payload.capacity) {
      setError(new Error('Expected registrations cannot exceed capacity'))
      return
    }
    setRunning(true)
    setError(null)
    try {
      const [forecast, venue, equipment] = await Promise.all([
        predictionService.forecast(payload),
        predictionService.venue(payload),
        predictionService.equipment(payload),
      ])
      setResult({ forecast, venue, equipment })
      history.reload()
      toast.success('Forecast generated', { title: 'AI forecast ready' })
      requestAnimationFrame(() => document.getElementById('forecast-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    } catch (err) {
      setError(err)
      toast.error(err)
    } finally {
      setRunning(false)
    }
  }

  const m = models.data
  const types = m?.event_types || []

  return (
    <>
      <PageHeader eyebrow="Machine learning" title="AI Forecasts"
        subtitle="Random Forest models trained on your completed events predict attendance, revenue and success" />

      {models.loading && !m ? (
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
        </div>
      ) : m && !m.trained ? (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
          <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
          <p>
            No trained models yet. An admin can train them from <strong>Settings → ML models</strong> once there are at
            least 30 completed events (or run <code className="rounded bg-amber-100 px-1 font-mono text-xs">python -m app.ml.train</code>).
          </p>
        </div>
      ) : m && (
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <MetricTile icon={Users} title="Attendance model" value={`±${number(m.models.attendance.test_metrics.attendees.mae)} attendees`}
            sub={`MAE on hold-out · rate R² ${m.models.attendance.test_metrics.rate.r2.toFixed(2)}`} />
          <MetricTile icon={IndianRupee} title="Revenue model" value={`±${money(m.models.revenue.test_metrics.mae)}`}
            sub={`MAE on hold-out · R² ${m.models.revenue.test_metrics.r2.toFixed(2)}`} />
          <MetricTile icon={Target} title="Success classifier" value={`${percent(m.models.success.test_metrics.accuracy, 0)} accuracy`}
            sub={`F1 ${m.models.success.test_metrics.f1.toFixed(2)} · trained on ${m.n_events} events`} />
        </div>
      )}

      <form onSubmit={submit}>
        <Card title="Event parameters" subtitle="Describe the event you want to forecast" icon={SlidersHorizontal}>
          <div className="space-y-4">
            <Field label="Prefill from an event (optional — also links the prediction to it)">
              <Select value={eventId} onChange={(e) => prefill(e.target.value)}>
                <option value="">— Hypothetical event —</option>
                {(upcoming.data?.items || []).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </Select>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Event type">
                <Input list="model-types" required value={form.event_type} onChange={set('event_type')} />
                <datalist id="model-types">{types.map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}</datalist>
              </Field>
              <Field label="Capacity"><Input type="number" min="1" required value={form.capacity} onChange={set('capacity')} /></Field>
              <Field label="Expected registrations" hint="Final registrations you expect at close">
                <Input type="number" min="0" required value={form.registration_count} onChange={set('registration_count')} />
              </Field>
              <Field label="Ticket price (₹)"><Input type="number" min="0" required value={form.ticket_price} onChange={set('ticket_price')} /></Field>
              <Field label="Month">
                <Select value={form.month} onChange={set('month')}>
                  {MONTHS.map((name, i) => <option key={name} value={i + 1}>{name}</option>)}
                </Select>
              </Field>
              <Field label="Day of week">
                <Select value={form.day_of_week} onChange={set('day_of_week')}>
                  {DAYS.map((name, i) => <option key={name} value={i}>{name}</option>)}
                </Select>
              </Field>
              <Field label="Duration (days)"><Input type="number" min="1" max="60" required value={form.duration_days} onChange={set('duration_days')} /></Field>
              <Field label="Marketing budget (₹)"><Input type="number" min="0" value={form.marketing_budget} onChange={set('marketing_budget')} /></Field>
              <Field label="Total budget (₹)"><Input type="number" min="0" value={form.budget} onChange={set('budget')} /></Field>
            </div>
            <ErrorMessage error={error} />
            <div className="flex justify-end">
              <Button type="submit" variant="gradient" size="lg" icon={Sparkles} loading={running} disabled={m && !m.trained}>
                {running ? 'Running models…' : 'Generate forecast'}
              </Button>
            </div>
          </div>
        </Card>
      </form>

      {result && <div id="forecast-results" className="mt-6 scroll-mt-24"><ForecastResults {...result} /></div>}

      <Card title="Recent predictions" icon={History} className="mt-6">
        {history.loading && !history.data ? <TableSkeleton rows={4} /> : history.data?.length ? (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr><th className="pb-2">When</th><th className="pb-2">Type</th><th className="pb-2">Event type</th><th className="pb-2 text-right">Prediction</th><th className="pb-2">Model</th></tr>
              </thead>
              <tbody>
                {history.data.map((p) => (
                  <tr key={p.id}>
                    <td className="py-2 text-slate-600">{dateTime(p.created_at)}</td>
                    <td className="py-2">{titleCase(p.prediction_type)}</td>
                    <td className="py-2">{titleCase(p.input_snapshot.event_type)}{p.event_id ? ' · linked' : ''}</td>
                    <td className="py-2 text-right font-medium tabular-nums">
                      {p.prediction_type === 'revenue' ? money(p.predicted_value)
                        : p.prediction_type === 'success' ? percent(p.predicted_value) : number(p.predicted_value)}
                    </td>
                    <td className="py-2 font-mono text-xs text-slate-500">{p.model_version}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="text-sm text-slate-500">No predictions yet.</p>}
      </Card>
    </>
  )
}

function MetricTile({ icon: Icon = BrainCircuit, title, value, sub }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-violet-50 p-4 shadow-card">
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-indigo-600" aria-hidden />
        <p className="text-xs font-semibold text-indigo-700">{title}</p>
      </div>
      <p className="mt-2 text-lg font-semibold tracking-tight text-slate-900 tabular-nums">{value}</p>
      <p className="mt-0.5 text-xs text-slate-500">{sub}</p>
    </div>
  )
}
