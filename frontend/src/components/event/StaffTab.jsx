import { useState } from 'react'
import { useAsync } from '../../hooks/useAsync'
import { eventService, userService } from '../../services/eventService'
import { titleCase } from '../../utils/format'
import { Button, Card, EmptyState, ErrorMessage, Select, Spinner } from '../ui'

export default function StaffTab({ event }) {
  const staff = useAsync(() => eventService.staff(event.id), [event.id])
  const users = useAsync(() => userService.list(), [])
  const [selected, setSelected] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const assignedIds = new Set((staff.data || []).map((s) => s.id))
  const candidates = (users.data || []).filter((u) => !assignedIds.has(u.id) && u.id !== event.organizer_id)

  const run = async (fn) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      await staff.reload()
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title="Assigned staff">
      <p className="mb-4 text-sm text-slate-500">
        Staff assigned here can view this event and its attendees, register people and check them in.
        They cannot see finances or predictions.
      </p>
      <div className="flex flex-wrap gap-2">
        <div className="min-w-56 flex-1">
          <Select aria-label="User to assign" value={selected} onChange={(e) => setSelected(e.target.value)}>
            <option value="">Select a user…</option>
            {candidates.map((u) => (
              <option key={u.id} value={u.id}>{u.full_name ? `${u.full_name} (${u.email})` : u.email} — {u.role}</option>
            ))}
          </Select>
        </div>
        <Button disabled={!selected || busy} onClick={() => run(async () => {
          await eventService.assignStaff(event.id, selected)
          setSelected('')
        })}>Assign</Button>
      </div>
      <div className="mt-3"><ErrorMessage error={error || staff.error || users.error} /></div>

      {staff.loading && !staff.data ? <Spinner /> : staff.data?.length ? (
        <ul className="mt-4 divide-y divide-slate-100">
          {staff.data.map((s) => (
            <li key={s.id} className="flex items-center justify-between py-2.5 text-sm">
              <div>
                <p className="font-medium text-slate-800">{s.full_name || s.email}</p>
                <p className="text-xs text-slate-500">{s.email} · {titleCase(s.role)}</p>
              </div>
              <Button size="sm" variant="ghost" disabled={busy}
                onClick={() => run(() => eventService.unassignStaff(event.id, s.id))}>Remove</Button>
            </li>
          ))}
        </ul>
      ) : <div className="mt-4"><EmptyState title="No staff assigned" /></div>}
    </Card>
  )
}
