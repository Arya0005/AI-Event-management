import { ArrowLeft, CalendarClock, Check, FileText, Wallet } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button, Card, ErrorMessage, Field, Input, PageHeader, PageSkeleton, Select, Textarea } from '../components/ui'
import { useToast } from '../context/ToastContext'
import { eventService } from '../services/eventService'
import { toLocalInput, titleCase } from '../utils/format'

const EMPTY = {
  name: '', description: '', event_type: '', venue: '',
  start_date: '', end_date: '', capacity: '', ticket_price: '0',
  budget: '0', marketing_budget: '0', status: 'draft',
}

function validate(f) {
  const errors = {}
  if (!f.name.trim()) errors.name = 'Required'
  if (!f.event_type.trim()) errors.event_type = 'Required'
  if (!f.start_date) errors.start_date = 'Required'
  if (!f.end_date) errors.end_date = 'Required'
  if (f.start_date && f.end_date && new Date(f.end_date) < new Date(f.start_date)) errors.end_date = 'Must be after start'
  if (!(Number(f.capacity) > 0)) errors.capacity = 'Must be greater than 0'
  for (const k of ['ticket_price', 'budget', 'marketing_budget']) {
    if (f[k] === '' || Number(f[k]) < 0) errors[k] = 'Must be 0 or more'
  }
  return errors
}

export default function EventForm() {
  const { id } = useParams()
  const editing = Boolean(id)
  const navigate = useNavigate()
  const toast = useToast()
  const [form, setForm] = useState(EMPTY)
  const [types, setTypes] = useState([])
  const [errors, setErrors] = useState({})
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(editing)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    eventService.types().then(setTypes).catch(() => {})
    if (!editing) return
    eventService.get(id)
      .then((e) => setForm({
        ...e,
        description: e.description || '',
        venue: e.venue || '',
        start_date: toLocalInput(e.start_date),
        end_date: toLocalInput(e.end_date),
        capacity: String(e.capacity),
        ticket_price: String(e.ticket_price),
        budget: String(e.budget),
        marketing_budget: String(e.marketing_budget),
      }))
      .catch(setError)
      .finally(() => setLoading(false))
  }, [id, editing])

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    const v = validate(form)
    setErrors(v)
    if (Object.keys(v).length) return
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      event_type: form.event_type.trim(),
      venue: form.venue.trim() || null,
      start_date: new Date(form.start_date).toISOString(),
      end_date: new Date(form.end_date).toISOString(),
      capacity: Number(form.capacity),
      ticket_price: Number(form.ticket_price),
      budget: Number(form.budget),
      marketing_budget: Number(form.marketing_budget),
    }
    setSaving(true)
    setError(null)
    try {
      const saved = editing
        ? await eventService.update(id, payload)
        : await eventService.create({ ...payload, status: form.status })
      toast.success(editing ? 'Changes saved' : `“${saved.name}” created`)
      navigate(`/events/${saved.id}`)
    } catch (err) {
      setError(err)
      toast.error(err)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <PageSkeleton stats={0} />

  const cancelTo = editing ? `/events/${id}` : '/events'
  return (
    <div className="mx-auto max-w-4xl">
      <Link to={cancelTo} className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-slate-900">
        <ArrowLeft className="size-4" aria-hidden /> {editing ? 'Back to event' : 'All events'}
      </Link>
      <PageHeader title={editing ? 'Edit event' : 'Create a new event'}
        subtitle={editing ? form.name : 'Fill in the event details. You can change the status later.'} />
      <form onSubmit={submit} noValidate className="space-y-6">
        <ErrorMessage error={error} />
        <Card title="Basics" subtitle="What and where" icon={FileText}>
          <div className="grid gap-5 md:grid-cols-2">
              <Field label="Event name *" error={errors.name} className="md:col-span-2">
                <Input value={form.name} onChange={set('name')} maxLength={200} placeholder="e.g. Bengaluru Product Summit 2027" />
              </Field>
              <Field label="Event type *" error={errors.event_type} hint="Pick an existing type for better predictions, or type a new one">
                <Input list="event-types" value={form.event_type} onChange={set('event_type')} maxLength={50} placeholder="conference" />
                <datalist id="event-types">{types.map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}</datalist>
              </Field>
              <Field label="Venue">
                <Input value={form.venue} onChange={set('venue')} maxLength={200} placeholder="Venue name" />
              </Field>
              <Field label="Description" className="md:col-span-2">
                <Textarea rows={4} maxLength={5000} value={form.description} onChange={set('description')}
                  placeholder="What attendees should know about this event" />
              </Field>
          </div>
        </Card>

        <Card title="Schedule & capacity" subtitle="When it happens and how many can attend" icon={CalendarClock}>
          <div className="grid gap-5 md:grid-cols-2">
              <Field label="Start *" error={errors.start_date}>
                <Input type="datetime-local" value={form.start_date} onChange={set('start_date')} />
              </Field>
              <Field label="End *" error={errors.end_date}>
                <Input type="datetime-local" value={form.end_date} onChange={set('end_date')} />
              </Field>
              <Field label="Capacity *" error={errors.capacity}>
                <Input type="number" min="1" value={form.capacity} onChange={set('capacity')} />
              </Field>
              {!editing && (
                <Field label="Initial status">
                  <Select value={form.status} onChange={set('status')}>
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                    <option value="registration_open">Registration open</option>
                  </Select>
                </Field>
              )}
          </div>
        </Card>

        <Card title="Pricing & budget" subtitle="Used by the revenue forecast and financial tracking" icon={Wallet}>
          <div className="grid gap-5 md:grid-cols-3">
              <Field label="Ticket price (₹)" error={errors.ticket_price} hint="0 for a free event">
                <Input type="number" min="0" step="0.01" value={form.ticket_price} onChange={set('ticket_price')} />
              </Field>
              <Field label="Total budget (₹)" error={errors.budget}>
                <Input type="number" min="0" step="1" value={form.budget} onChange={set('budget')} />
              </Field>
              <Field label="Marketing budget (₹)" error={errors.marketing_budget}>
                <Input type="number" min="0" step="1" value={form.marketing_budget} onChange={set('marketing_budget')} />
              </Field>
          </div>
        </Card>

        <div className="sticky bottom-0 -mx-4 flex justify-end gap-2 border-t border-slate-200 bg-slate-50/85 px-4 py-4 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border sm:bg-white/85 sm:px-5">
          <Link to={cancelTo}><Button type="button" variant="secondary">Cancel</Button></Link>
          <Button type="submit" icon={Check} loading={saving}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Create event'}</Button>
        </div>
      </form>
    </div>
  )
}
