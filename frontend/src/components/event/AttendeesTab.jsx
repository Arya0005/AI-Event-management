import { X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAsync } from '../../hooks/useAsync'
import { eventService } from '../../services/eventService'
import { dateTime, money } from '../../utils/format'
import {
  Badge, Button, Card, ConfirmModal, EmptyState, ErrorMessage, Field, Input, Modal, Pagination, Select, Spinner,
} from '../ui'

const PAGE_SIZE = 50
const ATTENDANCE = ['registered', 'attended', 'no_show', 'cancelled']
const PAYMENT = ['pending', 'paid', 'refunded']
const OPEN_STATUSES = ['published', 'registration_open']

const attendanceStyle = {
  registered: 'bg-sky-100 text-sky-800',
  attended: 'bg-emerald-100 text-emerald-800',
  no_show: 'bg-amber-100 text-amber-800',
  cancelled: 'bg-slate-100 text-slate-600',
}

export default function AttendeesTab({ event, canManage, onChange }) {
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [attendance, setAttendance] = useState('')
  const [page, setPage] = useState(1)
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    const t = setTimeout(() => { setQuery(search); setPage(1) }, 300)
    return () => clearTimeout(t)
  }, [search])

  const list = useAsync(
    () => eventService.attendees(event.id, { search: query, attendance_status: attendance, page, page_size: PAGE_SIZE }),
    [event.id, query, attendance, page],
  )

  const canRegister = OPEN_STATUSES.includes(event.status) || (canManage && event.status === 'registration_closed')
  const lockedForStaff = event.status === 'completed' && !canManage

  const patch = async (attendee, changes) => {
    setBusyId(attendee.id)
    setError(null)
    try {
      await eventService.updateAttendee(attendee.id, changes)
      await list.reload()
      onChange()
    } catch (err) {
      setError(err)
    } finally {
      setBusyId(null)
    }
  }

  const remove = async () => {
    setBusyId(removing.id)
    try {
      await eventService.removeAttendee(removing.id)
      await list.reload()
      onChange()
    } catch (err) {
      setError(err)
    } finally {
      setBusyId(null)
      setRemoving(null)
    }
  }

  return (
    <Card
      title="Attendees"
      actions={
        <Button size="sm" onClick={() => setAdding(true)} disabled={!canRegister}
          title={canRegister ? '' : 'Registration is not open for this event'}>
          + Register attendee
        </Button>
      }
    >
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Input type="search" placeholder="Search name, email, phone…" aria-label="Search attendees"
          value={search} onChange={(e) => setSearch(e.target.value)} className="sm:col-span-2" />
        <Select aria-label="Attendance filter" value={attendance} onChange={(e) => { setAttendance(e.target.value); setPage(1) }}>
          <option value="">All attendance statuses</option>
          {ATTENDANCE.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </Select>
      </div>
      <ErrorMessage error={error || list.error} />

      {list.loading && !list.data ? <Spinner /> : list.data?.items.length === 0 ? (
        <EmptyState title="No attendees found" />
      ) : list.data && (
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th className="pb-2 pr-3">Name</th>
                <th className="pb-2 pr-3">Ticket</th>
                <th className="pb-2 pr-3">Payment</th>
                <th className="pb-2 pr-3">Attendance</th>
                <th className="pb-2 pr-3">Registered</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {list.data.items.map((a) => (
                <tr key={a.id} className={busyId === a.id ? 'opacity-50' : ''}>
                  <td className="py-2 pr-3">
                    <p className="font-medium text-slate-800">{a.name}</p>
                    <p className="text-xs text-slate-500">{a.email}{a.phone ? ` · ${a.phone}` : ''}</p>
                  </td>
                  <td className="py-2 pr-3 text-slate-600">
                    {a.ticket_type.replace('_', ' ')}<br /><span className="text-xs">{a.ticket_price ? money(a.ticket_price) : 'Free'}</span>
                  </td>
                  <td className="py-2 pr-3">
                    {canManage ? (
                      <select aria-label="Payment status" value={a.payment_status} disabled={busyId === a.id}
                        onChange={(e) => patch(a, { payment_status: e.target.value })}
                        className="rounded border border-slate-200 bg-white px-1.5 py-1 text-xs">
                        {PAYMENT.map((p) => <option key={p} value={p}>{p}</option>)}
                      </select>
                    ) : <Badge>{a.payment_status}</Badge>}
                  </td>
                  <td className="py-2 pr-3">
                    {lockedForStaff ? (
                      <Badge className={attendanceStyle[a.attendance_status]}>{a.attendance_status.replace('_', ' ')}</Badge>
                    ) : (
                      <select aria-label="Attendance status" value={a.attendance_status} disabled={busyId === a.id}
                        onChange={(e) => patch(a, { attendance_status: e.target.value })}
                        className={`rounded border-0 px-1.5 py-1 text-xs font-medium ${attendanceStyle[a.attendance_status]}`}>
                        {ATTENDANCE.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                      </select>
                    )}
                  </td>
                  <td className="whitespace-nowrap py-2 pr-3 text-xs text-slate-500">{dateTime(a.registered_at)}</td>
                  <td className="py-2 text-right">
                    <div className="flex justify-end gap-1">
                      {a.attendance_status === 'registered' && !lockedForStaff && (
                        <Button size="sm" variant="secondary" disabled={busyId === a.id}
                          onClick={() => patch(a, { attendance_status: 'attended' })}>Check in</Button>
                      )}
                      {canManage && (
                        <Button size="sm" variant="ghost" onClick={() => setRemoving(a)} aria-label={`Remove ${a.name}`}><X className="size-4" /></Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={page} pageSize={PAGE_SIZE} total={list.data.total} onChange={setPage} />
        </div>
      )}

      {adding && <AddAttendeeModal open event={event} canManage={canManage} onClose={() => setAdding(false)}
        onSaved={() => { setAdding(false); list.reload(); onChange() }} />}
      <ConfirmModal open={Boolean(removing)} danger title="Remove attendee" confirmLabel="Remove"
        message={`Remove ${removing?.name} from this event? To keep the record, set attendance to "cancelled" instead.`}
        busy={busyId === removing?.id} onConfirm={remove} onClose={() => setRemoving(null)} />
    </Card>
  )
}

function AddAttendeeModal({ open, event, canManage, onClose, onSaved }) {
  // Mounted only while open, so the form starts blank every time.
  const [form, setForm] = useState({
    name: '', email: '', phone: '', ticket_type: 'general',
    payment_status: event.ticket_price > 0 ? 'pending' : 'paid',
  })
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const payload = { ...form, phone: form.phone || null }
      if (!canManage) delete payload.payment_status
      await eventService.addAttendee(event.id, payload)
      onSaved()
    } catch (err) {
      setError(err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} title="Register attendee" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <ErrorMessage error={error} />
        <Field label="Name *"><Input required value={form.name} onChange={set('name')} /></Field>
        <Field label="Email *"><Input type="email" required value={form.email} onChange={set('email')} /></Field>
        <Field label="Phone"><Input value={form.phone} onChange={set('phone')} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Ticket type">
            <Select value={form.ticket_type} onChange={set('ticket_type')}>
              <option value="general">General</option>
              <option value="early_bird">Early bird</option>
              <option value="vip">VIP</option>
            </Select>
          </Field>
          {canManage && (
            <Field label="Payment">
              <Select value={form.payment_status} onChange={set('payment_status')}>
                {PAYMENT.map((p) => <option key={p} value={p}>{p}</option>)}
              </Select>
            </Field>
          )}
        </div>
        <p className="text-xs text-slate-500">Ticket price defaults to the event price ({event.ticket_price ? money(event.ticket_price) : 'free'}).</p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Register'}</Button>
        </div>
      </form>
    </Modal>
  )
}
