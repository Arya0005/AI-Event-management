import {
  ArrowLeft, BrainCircuit, CalendarClock, IndianRupee, LayoutGrid, MapPin, Pencil, Tag, Ticket, Trash2, UserCheck,
  Users, UsersRound, Wallet,
} from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { BarsChart, DonutChart } from '../components/Charts'
import AttendeesTab from '../components/event/AttendeesTab'
import FinanceTab from '../components/event/FinanceTab'
import InsightsTab from '../components/event/InsightsTab'
import StaffTab from '../components/event/StaffTab'
import {
  Button, Card, ConfirmModal, EmptyState, ErrorMessage, PageSkeleton, ProgressBar, StatCard, StatusBadge, Tabs,
} from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useAsync } from '../hooks/useAsync'
import { analyticsService, eventService } from '../services/eventService'
import { dateTime, money, number, percent, STATUS_LABELS, STATUS_TRANSITIONS, titleCase } from '../utils/format'

export default function EventDetails() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { user, isAdmin, role } = useAuth()
  const [tab, setTab] = useState('overview')
  const [confirm, setConfirm] = useState(null) // {type: 'status'|'delete', status?}
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState(null)

  const event = useAsync(() => eventService.get(id), [id])
  const ev = event.data
  const canManage = ev && (isAdmin || (role === 'organizer' && ev.organizer_id === user?.id))

  if (event.loading && !ev) return <PageSkeleton />
  if (event.error) return <ErrorMessage error={event.error} onRetry={event.reload} />

  const tabs = [
    { id: 'overview', label: 'Overview', icon: LayoutGrid },
    { id: 'attendees', label: `Attendees (${ev.registration_count})`, icon: Users },
    ...(canManage ? [
      { id: 'finance', label: 'Finance', icon: Wallet },
      { id: 'staff', label: 'Staff', icon: UsersRound },
      { id: 'insights', label: 'AI insights', icon: BrainCircuit },
    ] : []),
  ]

  const runConfirm = async () => {
    setBusy(true)
    setActionError(null)
    try {
      if (confirm.type === 'delete') {
        await eventService.remove(id)
        toast.success(`“${ev.name}” was deleted`)
        navigate('/events', { replace: true })
        return
      }
      await eventService.setStatus(id, confirm.status)
      await event.reload()
      toast.success(`Status changed to ${STATUS_LABELS[confirm.status]}`)
    } catch (err) {
      setActionError(err)
      toast.error(err)
    } finally {
      setBusy(false)
      setConfirm(null)
    }
  }

  const editable = canManage && !['completed', 'cancelled'].includes(ev.status)

  return (
    <>
      <Link to="/events" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-slate-900">
        <ArrowLeft className="size-4" aria-hidden /> All events
      </Link>
      <div className="relative mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-card sm:p-6">
        <div className="pointer-events-none absolute -top-24 -right-24 size-64 rounded-full bg-indigo-500/10 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{ev.name}</h1>
              <StatusBadge status={ev.status} />
            </div>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-500">
              <span className="inline-flex items-center gap-1.5"><Tag className="size-4 text-slate-400" aria-hidden />{titleCase(ev.event_type)}</span>
              <span className="inline-flex items-center gap-1.5"><MapPin className="size-4 text-slate-400" aria-hidden />{ev.venue || 'No venue'}</span>
              <span className="inline-flex items-center gap-1.5"><CalendarClock className="size-4 text-slate-400" aria-hidden />{dateTime(ev.start_date)} – {dateTime(ev.end_date)}</span>
            </div>
          </div>
          {canManage && (
            <div className="flex flex-wrap gap-2">
              {STATUS_TRANSITIONS[ev.status].map((s) => (
                <Button key={s} variant={s === 'cancelled' ? 'ghost' : 'secondary'} size="sm"
                  onClick={() => setConfirm({ type: 'status', status: s })}>
                  {s === 'cancelled' ? 'Cancel event' : `Move to ${STATUS_LABELS[s]}`}
                </Button>
              ))}
              {editable && <Link to={`/events/${id}/edit`}><Button size="sm" variant="secondary" icon={Pencil}>Edit</Button></Link>}
              <Button size="sm" variant="danger" icon={Trash2} onClick={() => setConfirm({ type: 'delete' })}>Delete</Button>
            </div>
          )}
        </div>
        <div className="relative mt-5 max-w-md">
          <div className="mb-1.5 flex justify-between text-xs text-slate-500">
            <span>Registrations</span>
            <span className="tabular-nums"><strong className="font-semibold text-slate-800">{number(ev.registration_count)}</strong> / {number(ev.capacity)} · {percent(ev.registration_count / ev.capacity, 0)} full</span>
          </div>
          <ProgressBar value={ev.registration_count} max={ev.capacity} className="h-2" />
        </div>
      </div>

      <ErrorMessage error={actionError} />
      <div className={actionError ? 'mt-4' : ''}><Tabs tabs={tabs} active={tab} onChange={setTab} /></div>
      <div className="mt-6">
        {tab === 'overview' && <Overview ev={ev} canManage={canManage} />}
        {tab === 'attendees' && <AttendeesTab event={ev} canManage={canManage} onChange={event.reload} />}
        {tab === 'finance' && canManage && <FinanceTab event={ev} />}
        {tab === 'staff' && canManage && <StaffTab event={ev} />}
        {tab === 'insights' && canManage && <InsightsTab event={ev} />}
      </div>

      <ConfirmModal
        open={Boolean(confirm)}
        busy={busy}
        danger={confirm?.type === 'delete' || confirm?.status === 'cancelled'}
        title={confirm?.type === 'delete' ? 'Delete event' : `Change status to ${STATUS_LABELS[confirm?.status]}`}
        message={
          confirm?.type === 'delete'
            ? 'This permanently deletes the event with all its attendees, revenue, expenses and predictions.'
            : confirm?.status === 'completed'
              ? 'Completing records the actual results: attendees not checked in are marked as no-shows, and the event joins the historical dataset used to retrain the models. This cannot be undone.'
              : `The event will move from ${STATUS_LABELS[ev.status]} to ${STATUS_LABELS[confirm?.status]}.`
        }
        confirmLabel={confirm?.type === 'delete' ? 'Delete' : 'Confirm'}
        onConfirm={runConfirm}
        onClose={() => setConfirm(null)}
      />
    </>
  )
}

function Overview({ ev, canManage }) {
  const analytics = useAsync(() => analyticsService.event(ev.id), [ev.id, ev.registration_count, ev.status])
  const a = analytics.data

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Registrations" value={`${number(ev.registration_count)} / ${number(ev.capacity)}`} icon={Users} tone="sky"
          hint={`${percent(ev.registration_count / ev.capacity)} full`} />
        <StatCard label="Attended" value={number(ev.attended_count)} icon={UserCheck} tone="emerald"
          hint={a?.attendance_rate != null ? `${percent(a.attendance_rate)} attendance` : 'Checked in so far'} />
        <StatCard label="Ticket price" value={ev.ticket_price ? money(ev.ticket_price) : 'Free'} icon={Ticket} tone="violet" />
        {canManage && a?.total_revenue !== undefined ? (
          <StatCard label="Profit" value={money(a.profit)} icon={IndianRupee} tone={a.profit >= 0 ? 'emerald' : 'rose'}
            hint={`Revenue ${money(a.total_revenue)}`} />
        ) : (
          <StatCard label="Capacity" value={number(ev.capacity)} icon={Users} tone="indigo" />
        )}
      </div>

      {ev.description && <Card title="Description"><p className="text-sm leading-relaxed whitespace-pre-line text-slate-700">{ev.description}</p></Card>}

      {analytics.error && <ErrorMessage error={analytics.error} onRetry={analytics.reload} />}
      {a && (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card title="Registrations per day" className="lg:col-span-2">
            {a.registration_timeline.length
              ? <BarsChart data={a.registration_timeline} xKey="day" series={[{ key: 'registrations', label: 'Registrations' }]} />
              : <EmptyState title="No registrations yet" />}
          </Card>
          <Card title="Attendance status">
            {a.attendance_breakdown.length
              ? <DonutChart data={a.attendance_breakdown.map((b) => ({ ...b, label: titleCase(b.label) }))} />
              : <EmptyState title="No attendees" />}
          </Card>
          <Card title="Payment status">
            {a.payment_breakdown.length
              ? <DonutChart data={a.payment_breakdown.map((b) => ({ ...b, label: titleCase(b.label) }))} />
              : <EmptyState title="No attendees" />}
          </Card>
          <Card title="Ticket types">
            {a.ticket_type_breakdown.length
              ? <DonutChart data={a.ticket_type_breakdown.map((b) => ({ ...b, label: titleCase(b.label) }))} />
              : <EmptyState title="No attendees" />}
          </Card>
          <Card title="Details">
            <dl className="space-y-2 text-sm">
              {[
                ['Budget', canManage ? money(ev.budget) : '—'],
                ['Marketing budget', canManage ? money(ev.marketing_budget) : '—'],
                ['Created', dateTime(ev.created_at)],
                ['Last updated', dateTime(ev.updated_at)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4"><dt className="text-slate-500">{k}</dt><dd className="font-medium text-slate-800">{v}</dd></div>
              ))}
            </dl>
          </Card>
        </div>
      )}
    </div>
  )
}
