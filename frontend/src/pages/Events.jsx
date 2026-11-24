import { CalendarDays, MapPin, Plus, Search, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Button, Card, EmptyState, ErrorMessage, inputClass, PageHeader, Pagination, ProgressBar, Select, StatusBadge,
  TableSkeleton,
} from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useAsync } from '../hooks/useAsync'
import { eventService } from '../services/eventService'
import { date, money, number, STATUS_LABELS, titleCase } from '../utils/format'

const SORTS = [
  ['-start_date', 'Newest first'],
  ['start_date', 'Oldest first'],
  ['name', 'Name A–Z'],
  ['-capacity', 'Largest capacity'],
  ['-ticket_price', 'Highest price'],
  ['-created_at', 'Recently created'],
]

const PAGE_SIZE = 20

export default function Events() {
  const { canManage } = useAuth()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const filters = {
    search: params.get('search') || '',
    status: params.get('status') || '',
    event_type: params.get('event_type') || '',
    sort: params.get('sort') || '-start_date',
    page: Number(params.get('page') || 1),
  }
  const [searchText, setSearchText] = useState(filters.search)

  const update = (patch) => {
    const next = { ...filters, page: 1, ...patch }
    setParams(Object.fromEntries(Object.entries(next).filter(([, v]) => v !== '' && v !== null)), { replace: true })
  }

  // Debounce the search box.
  useEffect(() => {
    if (searchText === filters.search) return
    const t = setTimeout(() => update({ search: searchText }), 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchText])

  const types = useAsync(() => eventService.types(), [])
  const { data, error, loading, reload } = useAsync(
    () => eventService.list({ ...filters, page_size: PAGE_SIZE }),
    [filters.search, filters.status, filters.event_type, filters.sort, filters.page],
  )

  const filtered = Boolean(filters.search || filters.status || filters.event_type)
  const clear = () => {
    setSearchText('')
    setParams(filters.sort !== '-start_date' ? { sort: filters.sort } : {}, { replace: true })
  }

  return (
    <>
      <PageHeader
        title="Events"
        subtitle={data ? `${number(data.total)} event${data.total === 1 ? '' : 's'}${filtered ? ' match your filters' : ''}` : 'Search, filter and manage events'}
        actions={canManage && <Link to="/events/new"><Button icon={Plus}>New event</Button></Link>}
      />

      <Card bodyClassName="p-0">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input type="search" placeholder="Search name, venue, description…" aria-label="Search events"
              className={`${inputClass} pl-9`} value={searchText} onChange={(e) => setSearchText(e.target.value)} />
          </div>
          <Select aria-label="Filter by status" className="w-auto min-w-40" value={filters.status} onChange={(e) => update({ status: e.target.value })}>
            <option value="">All statuses</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          <Select aria-label="Filter by type" className="w-auto min-w-36" value={filters.event_type} onChange={(e) => update({ event_type: e.target.value })}>
            <option value="">All types</option>
            {(types.data || []).map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}
          </Select>
          <Select aria-label="Sort" className="w-auto min-w-40" value={filters.sort} onChange={(e) => update({ sort: e.target.value })}>
            {SORTS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          {filtered && <Button variant="ghost" size="sm" icon={X} onClick={clear}>Clear</Button>}
        </div>

        <div className="p-4 sm:p-5">
          <ErrorMessage error={error} onRetry={reload} />
          {loading && !data ? <TableSkeleton /> : data && data.items.length === 0 ? (
            <EmptyState title={filtered ? 'No events match these filters' : 'No events yet'} icon={CalendarDays}
              action={filtered
                ? <Button variant="secondary" size="sm" onClick={clear}>Clear filters</Button>
                : canManage && <Link to="/events/new"><Button size="sm" icon={Plus}>Create your first event</Button></Link>}>
              {filtered ? 'Try a different search or remove a filter.' : canManage ? 'Create an event to get started.' : 'You have no events assigned yet.'}
            </EmptyState>
          ) : data && (
            <div className={`overflow-x-auto transition-opacity ${loading ? 'opacity-60' : ''}`}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="pr-4">Event</th>
                    <th className="pr-4">Date</th>
                    <th className="pr-4">Status</th>
                    <th className="w-44 pr-4 text-right">Registered</th>
                    <th className="pr-4 text-right">Attended</th>
                    <th className="text-right">Ticket</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((e) => (
                    <tr key={e.id} className="cursor-pointer" onClick={() => navigate(`/events/${e.id}`)}>
                      <td className="pr-4">
                        <Link to={`/events/${e.id}`} onClick={(ev) => ev.stopPropagation()} className="font-medium text-slate-900 hover:text-indigo-600">{e.name}</Link>
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                          <span>{titleCase(e.event_type)}</span>
                          <span aria-hidden>·</span>
                          <MapPin className="size-3" aria-hidden />
                          <span className="truncate">{e.venue || 'No venue'}</span>
                        </p>
                      </td>
                      <td className="pr-4 whitespace-nowrap text-slate-600">{date(e.start_date)}</td>
                      <td className="pr-4"><StatusBadge status={e.status} /></td>
                      <td className="pr-4 text-right">
                        <p className="tabular-nums text-slate-700">{number(e.registration_count)} <span className="text-slate-400">/ {number(e.capacity)}</span></p>
                        <ProgressBar value={e.registration_count} max={e.capacity} className="mt-1.5 ml-auto max-w-36" />
                      </td>
                      <td className="pr-4 text-right tabular-nums text-slate-700">{e.status === 'completed' ? number(e.attended_count) : <span className="text-slate-400">—</span>}</td>
                      <td className="text-right tabular-nums text-slate-700">{e.ticket_price ? money(e.ticket_price) : <span className="font-medium text-emerald-600">Free</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination page={filters.page} pageSize={PAGE_SIZE} total={data.total}
                onChange={(p) => setParams({ ...Object.fromEntries(params), page: p }, { replace: true })} />
            </div>
          )}
        </div>
      </Card>
    </>
  )
}
