import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAsync } from '../../hooks/useAsync'
import { analyticsService } from '../../services/eventService'
import { predictionService } from '../../services/predictionService'
import { dateTime, money, number, percent, titleCase } from '../../utils/format'
import { ForecastResults } from '../ForecastResults'
import { AnomalyList } from '../AnomalyList'
import { Button, Card, ErrorMessage, Field, Input, Spinner } from '../ui'

export default function InsightsTab({ event }) {
  const [inputs, setInputs] = useState(null)
  const [expected, setExpected] = useState('')
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [running, setRunning] = useState(false)

  const history = useAsync(() => predictionService.history({ event_id: event.id, limit: 30 }), [event.id])
  const anomalies = useAsync(() => analyticsService.anomalies(event.id), [event.id])

  useEffect(() => {
    predictionService.inputsForEvent(event.id)
      .then((i) => { setInputs(i); setExpected(String(i.registration_count)) })
      .catch(setError)
  }, [event.id])

  const run = async () => {
    setRunning(true)
    setError(null)
    try {
      const payload = { ...inputs, registration_count: Number(expected) }
      const [forecast, venue, equipment] = await Promise.all([
        predictionService.forecast(payload),
        predictionService.venue(payload),
        predictionService.equipment(payload),
      ])
      setResult({ forecast, venue, equipment })
      history.reload()
    } catch (err) {
      setError(err)
    } finally {
      setRunning(false)
    }
  }

  const completed = event.status === 'completed'

  return (
    <div className="space-y-6">
      <Card title="Forecast this event">
        {!inputs && !error ? <Spinner /> : inputs && (
          <div className="space-y-4">
            {completed && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                This event is completed — a forecast now is only useful for comparing against actuals. Forecast-vs-actual
                analytics only count predictions made before the event started.
              </p>
            )}
            <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
              <Field label="Expected final registrations"
                hint={`Currently ${number(inputs.registration_count)} registered of ${number(inputs.capacity)} capacity. While registration is open, enter the count you expect at close.`}>
                <Input type="number" min="0" max={inputs.capacity} value={expected} onChange={(e) => setExpected(e.target.value)} />
              </Field>
              <div className="flex items-end">
                <Button onClick={run} disabled={running || expected === '' || Number(expected) > inputs.capacity}>
                  {running ? 'Running models…' : 'Run forecast'}
                </Button>
              </div>
            </div>
            <p className="text-xs text-slate-500">
              Inputs from the event: {titleCase(inputs.event_type)} · capacity {number(inputs.capacity)} ·
              ticket {money(inputs.ticket_price)} · {inputs.duration_days} day(s) · marketing {money(inputs.marketing_budget)}
            </p>
          </div>
        )}
        <div className="mt-3"><ErrorMessage error={error} /></div>
      </Card>

      {result && <ForecastResults {...result} />}

      <Card title="Anomalies for this event">
        {anomalies.loading && !anomalies.data ? <Spinner /> : anomalies.error ? <ErrorMessage error={anomalies.error} />
          : <AnomalyList items={anomalies.data.anomalies} compact />}
      </Card>

      <Card title="Prediction history" actions={<Link to="/predictions" className="text-sm font-medium text-indigo-600">Open forecasting →</Link>}>
        {history.loading && !history.data ? <Spinner /> : history.data?.length ? (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr><th className="pb-2">When</th><th className="pb-2">Type</th><th className="pb-2 text-right">Prediction</th><th className="pb-2">Registrations used</th><th className="pb-2">Model</th></tr>
              </thead>
              <tbody>
                {history.data.map((p) => (
                  <tr key={p.id}>
                    <td className="py-2 text-slate-600">{dateTime(p.created_at)}</td>
                    <td className="py-2">{titleCase(p.prediction_type)}</td>
                    <td className="py-2 text-right tabular-nums font-medium">
                      {p.prediction_type === 'revenue' ? money(p.predicted_value)
                        : p.prediction_type === 'success' ? percent(p.predicted_value) : number(p.predicted_value)}
                    </td>
                    <td className="py-2 tabular-nums">{number(p.input_snapshot.registration_count)}</td>
                    <td className="py-2 font-mono text-xs text-slate-500">{p.model_version}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="text-sm text-slate-500">No predictions recorded for this event yet.</p>}
      </Card>
    </div>
  )
}
