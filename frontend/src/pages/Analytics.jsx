import { useState } from 'react'
import { AnomalyList } from '../components/AnomalyList'
import { BarsChart, PredictedVsActual, TrendChart } from '../components/Charts'
import { Card, EmptyState, ErrorMessage, PageHeader, Select, Spinner, StatCard } from '../components/ui'
import { useAsync } from '../hooks/useAsync'
import { analyticsService } from '../services/eventService'
import { predictionService } from '../services/predictionService'
import { money, moneyCompact, number, percent, titleCase } from '../utils/format'

export default function Analytics() {
  const dash = useAsync(() => analyticsService.dashboard(), [])
  const fva = useAsync(() => analyticsService.forecastVsActual(), [])
  const anomalies = useAsync(() => analyticsService.anomalies(), [])
  const models = useAsync(() => predictionService.models(), [])
  const [severity, setSeverity] = useState('')

  if (dash.loading && !dash.data) return <Spinner />
  if (dash.error) return <ErrorMessage error={dash.error} onRetry={dash.reload} />
  const { monthly, by_type: byType } = dash.data
  const typed = byType.map((t) => ({ ...t, event_type: titleCase(t.event_type) }))

  const fvaRows = fva.data || []
  const attRows = fvaRows.filter((r) => r.predicted_attendance != null)
  const revRows = fvaRows.filter((r) => r.predicted_revenue != null)
  const mae = (rows, p, a) => rows.length ? rows.reduce((s, r) => s + Math.abs(r[p] - r[a]), 0) / rows.length : null

  const anomalyItems = (anomalies.data?.anomalies || []).filter((a) => !severity || a.severity === severity)

  return (
    <>
      <PageHeader title="Analytics" subtitle="Historical performance, model accuracy and anomalies" />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Registrations & attendance by month">
          {monthly.length ? <TrendChart data={monthly} xKey="month" series={[
            { key: 'registrations', label: 'Registrations' }, { key: 'attended', label: 'Attended' },
          ]} /> : <EmptyState title="No completed events" />}
        </Card>
        <Card title="Revenue & expenses by month">
          {monthly.length ? <TrendChart money data={monthly} xKey="month" series={[
            { key: 'revenue', label: 'Revenue' }, { key: 'expenses', label: 'Expenses', color: '#ef4444' },
          ]} /> : <EmptyState title="No completed events" />}
        </Card>
        <Card title="Average revenue & profit by event type">
          {typed.length ? <BarsChart data={typed} xKey="event_type" formatter={moneyCompact} series={[
            { key: 'avg_revenue', label: 'Avg revenue' }, { key: 'avg_profit', label: 'Avg profit', color: '#10b981' },
          ]} /> : <EmptyState title="No completed events" />}
        </Card>
        <Card title="Fill rate vs attendance rate by type">
          {typed.length ? <BarsChart data={typed} xKey="event_type" formatter={(v) => percent(v, 0)} series={[
            { key: 'fill_rate', label: 'Fill rate (registrations / capacity)' },
            { key: 'attendance_rate', label: 'Attendance rate', color: '#0ea5e9' },
          ]} /> : <EmptyState title="No completed events" />}
        </Card>
      </div>

      <h2 className="mb-3 mt-8 text-base font-semibold text-slate-900">Forecast vs actual</h2>
      <p className="mb-4 text-sm text-slate-500">
        Uses the latest prediction made <em>before</em> each event started, compared with recorded results once the event is completed.
      </p>
      {fva.error ? <ErrorMessage error={fva.error} /> : fvaRows.length === 0 ? (
        <EmptyState title="No completed events with pre-event predictions yet">
          Run a forecast for an upcoming event (linked to it); once it is completed, it appears here.
        </EmptyState>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatCard label="Events tracked" value={number(fvaRows.length)} />
            <StatCard label="Attendance MAE" value={number(mae(attRows, 'predicted_attendance', 'actual_attendance'))} hint="attendees" />
            <StatCard label="Revenue MAE" value={money(mae(revRows, 'predicted_revenue', 'actual_revenue'))} />
            <StatCard label="Attendance bias" hint="+ = over-forecast"
              value={number(attRows.length ? attRows.reduce((s, r) => s + r.predicted_attendance - r.actual_attendance, 0) / attRows.length : null)} />
          </div>
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Card title="Attendance: predicted vs actual">
              <PredictedVsActual data={attRows} xKey="predicted_attendance" yKey="actual_attendance" label="attendance" />
            </Card>
            <Card title="Revenue: predicted vs actual">
              <PredictedVsActual money data={revRows} xKey="predicted_revenue" yKey="actual_revenue" label="revenue" />
            </Card>
          </div>
        </>
      )}

      <h2 className="mb-3 mt-8 text-base font-semibold text-slate-900">Model evaluation</h2>
      {models.loading && !models.data ? <Spinner /> : models.data?.trained ? <ModelEvaluation m={models.data} />
        : <EmptyState title="Models not trained yet" />}

      <Card title="Anomalies" className="mt-8" actions={
        <Select aria-label="Filter severity" value={severity} onChange={(e) => setSeverity(e.target.value)}>
          <option value="">All severities</option><option value="high">High</option><option value="medium">Medium</option>
        </Select>
      }>
        {anomalies.data && <p className="mb-2 text-xs text-slate-500">Baseline: {anomalies.data.baseline}</p>}
        {anomalies.loading && !anomalies.data ? <Spinner /> : anomalies.error ? <ErrorMessage error={anomalies.error} />
          : <AnomalyList items={anomalyItems} />}
      </Card>
    </>
  )
}

export function ModelEvaluation({ m }) {
  const { attendance, revenue, success } = m.models
  const cm = success.test_metrics.confusion_matrix
  const importance = (model) => Object.entries(model.feature_importances).slice(0, 8)
    .map(([k, v]) => ({ feature: titleCase(k), importance: v }))

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-500">
        Trained {new Date(m.trained_at).toLocaleString()} on {m.n_events} completed events — {m.split}
        ({m.n_train} train / {m.n_test} test). Metrics below are on the hold-out set.
      </p>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Attendance (regression)">
          <MetricTable rows={[
            ['MAE', `${number(attendance.test_metrics.attendees.mae)} attendees`],
            ['RMSE', `${number(attendance.test_metrics.attendees.rmse)} attendees`],
            ['R² (headcount)', attendance.test_metrics.attendees.r2.toFixed(3)],
            ['R² (attendance rate)', attendance.test_metrics.rate.r2.toFixed(3)],
            ['Rate MAE', percent(attendance.test_metrics.rate.mae)],
            ['CV MAE (rate)', `${percent(-attendance.cross_validation.mean)} ± ${percent(attendance.cross_validation.std)}`],
          ]} />
          <p className="mt-2 text-xs text-slate-500">Headcount R² is flattered by registrations scaling with event size; the rate R² is the stricter measure.</p>
        </Card>
        <Card title="Revenue (regression)">
          <MetricTable rows={[
            ['MAE', money(revenue.test_metrics.mae)],
            ['RMSE', money(revenue.test_metrics.rmse)],
            ['MSE', revenue.test_metrics.mse.toExponential(2)],
            ['R²', revenue.test_metrics.r2.toFixed(3)],
            ['CV MAE', `${money(-revenue.cross_validation.mean)} ± ${money(revenue.cross_validation.std)}`],
          ]} />
        </Card>
        <Card title="Success (classification)">
          <MetricTable rows={[
            ['Accuracy', percent(success.test_metrics.accuracy)],
            ['Precision', percent(success.test_metrics.precision)],
            ['Recall', percent(success.test_metrics.recall)],
            ['F1-score', success.test_metrics.f1.toFixed(3)],
            ...(success.test_metrics.roc_auc != null ? [['ROC AUC', success.test_metrics.roc_auc.toFixed(3)]] : []),
          ]} />
          <p className="mb-1 mt-3 text-xs font-medium text-slate-500">Confusion matrix (rows = actual)</p>
          <table className="text-center text-xs tabular-nums">
            <thead><tr><th /><th className="px-3 py-1 text-slate-500">Pred. fail</th><th className="px-3 py-1 text-slate-500">Pred. success</th></tr></thead>
            <tbody>
              {['Actual fail', 'Actual success'].map((label, i) => (
                <tr key={label}>
                  <td className="pr-2 text-right text-slate-500">{label}</td>
                  {cm[i].map((v, j) => (
                    <td key={j} className={`px-3 py-1.5 font-semibold ${i === j ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>{v}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Feature importance — attendance">
          <BarsChart layout="vertical" data={importance(attendance)} xKey="feature" formatter={(v) => percent(v, 0)}
            series={[{ key: 'importance', label: 'Importance' }]} height={260} />
        </Card>
        <Card title="Feature importance — revenue">
          <BarsChart layout="vertical" data={importance(revenue)} xKey="feature" formatter={(v) => percent(v, 0)}
            series={[{ key: 'importance', label: 'Importance', color: '#0ea5e9' }]} height={260} />
        </Card>
      </div>
    </div>
  )
}

function MetricTable({ rows }) {
  return (
    <dl className="space-y-1.5 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-3 border-b border-slate-100 pb-1.5">
          <dt className="text-slate-500">{k}</dt><dd className="font-medium tabular-nums text-slate-800">{v}</dd>
        </div>
      ))}
    </dl>
  )
}
