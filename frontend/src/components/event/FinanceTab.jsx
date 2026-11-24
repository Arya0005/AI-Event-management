import { X } from 'lucide-react'
import { useState } from 'react'
import { useAsync } from '../../hooks/useAsync'
import { eventService } from '../../services/eventService'
import { date, money, titleCase } from '../../utils/format'
import { BarsChart } from '../Charts'
import { Button, Card, EmptyState, ErrorMessage, Field, Input, Select, Spinner, StatCard } from '../ui'

const SOURCES = ['sponsorship', 'merchandise', 'food_beverage', 'other']
const CATEGORIES = ['venue', 'equipment', 'staff', 'marketing', 'catering', 'logistics', 'other']

export default function FinanceTab({ event }) {
  const summary = useAsync(() => eventService.finance(event.id), [event.id])
  const revenue = useAsync(() => eventService.revenue(event.id), [event.id])
  const expenses = useAsync(() => eventService.expenses(event.id), [event.id])
  const reloadAll = () => Promise.all([summary.reload(), revenue.reload(), expenses.reload()])

  const s = summary.data
  if (summary.loading && !s) return <Spinner />
  if (summary.error) return <ErrorMessage error={summary.error} onRetry={summary.reload} />

  const overBudget = s.budget > 0 && s.total_expenses > s.budget
  const breakdown = [
    { name: 'Tickets', amount: s.ticket_revenue },
    ...Object.entries(s.other_revenue_by_source).map(([k, v]) => ({ name: titleCase(k), amount: v })),
  ]

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Total revenue" value={money(s.total_revenue)} hint={`Tickets ${money(s.ticket_revenue)}`} />
        <StatCard label="Total expenses" value={money(s.total_expenses)} />
        <StatCard label="Profit" value={<span className={s.profit < 0 ? 'text-rose-600' : 'text-emerald-700'}>{money(s.profit)}</span>} />
        <StatCard label="Budget remaining" value={<span className={overBudget ? 'text-rose-600' : ''}>{money(s.budget_remaining)}</span>}
          hint={`Budget ${money(s.budget)}${overBudget ? ' · over budget' : ''}`} />
      </div>
      <p className="text-xs text-slate-500">
        Total revenue = ticket revenue (sum of <em>paid</em> attendee tickets) + sponsorship + other revenue. Profit = total revenue − total expenses.
      </p>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Revenue by source">
          {s.total_revenue > 0 ? <BarsChart data={breakdown} xKey="name" formatter={money} series={[{ key: 'amount', label: 'Amount' }]} height={220} />
            : <EmptyState title="No revenue yet" />}
        </Card>
        <Card title="Expenses by category">
          {s.total_expenses > 0 ? (
            <BarsChart data={Object.entries(s.expenses_by_category).map(([k, v]) => ({ name: titleCase(k), amount: v }))}
              xKey="name" formatter={money} series={[{ key: 'amount', label: 'Amount', color: '#ef4444' }]} height={220} />
          ) : <EmptyState title="No expenses yet" />}
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <LedgerCard
          title="Other revenue (non-ticket)"
          state={revenue}
          options={SOURCES}
          field="source"
          onAdd={(data) => eventService.addRevenue(event.id, data)}
          onRemove={(id) => eventService.removeRevenue(id)}
          onChanged={reloadAll}
        />
        <LedgerCard
          title="Expenses"
          state={expenses}
          options={CATEGORIES}
          field="category"
          onAdd={(data) => eventService.addExpense(event.id, data)}
          onRemove={(id) => eventService.removeExpense(id)}
          onChanged={reloadAll}
        />
      </div>
    </div>
  )
}

function LedgerCard({ title, state, options, field, onAdd, onRemove, onChanged }) {
  const [form, setForm] = useState({ [field]: options[0], amount: '', description: '' })
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (!(Number(form.amount) >= 0) || form.amount === '') {
      setError(new Error('Enter an amount of 0 or more'))
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onAdd({ ...form, amount: Number(form.amount), description: form.description || null })
      setForm({ [field]: options[0], amount: '', description: '' })
      await onChanged()
    } catch (err) {
      setError(err)
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id) => {
    setError(null)
    try {
      await onRemove(id)
      await onChanged()
    } catch (err) {
      setError(err)
    }
  }

  return (
    <Card title={title}>
      <form onSubmit={submit} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <Field label={titleCase(field)}>
          <Select value={form[field]} onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}>
            {options.map((o) => <option key={o} value={o}>{titleCase(o)}</option>)}
          </Select>
        </Field>
        <Field label="Amount (₹)">
          <Input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
        </Field>
        <div className="flex items-end"><Button type="submit" disabled={saving} className="w-full">Add</Button></div>
        <Field label="Description" className="sm:col-span-3">
          <Input value={form.description} maxLength={500} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        </Field>
      </form>
      <div className="mt-3"><ErrorMessage error={error || state.error} /></div>
      {state.loading && !state.data ? <Spinner /> : state.data?.length ? (
        <ul className="mt-4 divide-y divide-slate-100 text-sm">
          {state.data.map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="font-medium text-slate-800">{titleCase(row[field])}</p>
                <p className="truncate text-xs text-slate-500">{row.description || '—'} · {date(row.created_at)}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="tabular-nums font-medium">{money(row.amount)}</span>
                <Button size="sm" variant="ghost" onClick={() => remove(row.id)} aria-label="Remove entry"><X className="size-4" /></Button>
              </div>
            </li>
          ))}
        </ul>
      ) : <p className="mt-4 text-sm text-slate-500">No entries yet.</p>}
    </Card>
  )
}
