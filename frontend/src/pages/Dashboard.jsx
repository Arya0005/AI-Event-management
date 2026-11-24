import {
  ArrowRight, Ban, BarChart3, CalendarCheck, CalendarDays, IndianRupee, Percent, PiggyBank, Plus, Receipt, Sparkles,
  Target, Ticket, TrendingUp, Users,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { BarsChart, DonutChart, TrendChart } from '../components/Charts'
import {
  Button, Card, EmptyState, ErrorMessage, PageHeader, PageSkeleton, ProgressBar, StatCard, StatusBadge,
} from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useAsync } from '../hooks/useAsync'
import { analyticsService } from '../services/eventService'
import { date, money, moneyCompact, number, percent, STATUS_LABELS, titleCase } from '../utils/format'

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

export default function Dashboard() {
  const { user, canManage } = useAuth()
  const { data, error, loading, reload } = useAsync(() => analyticsService.dashboard(), [])

  if (loading && !data) return <PageSkeleton />
  if (error) return <ErrorMessage error={error} onRetry={reload} />

  const { kpis, monthly, by_type: byType, by_status: byStatus, upcoming, financials_visible: fin } = data
  const monthlyRows = monthly.map((m) => ({
    ...m,
    attendance_rate: m.registrations ? m.attended / m.registrations : null,
  }))
  const profit = kpis.total_revenue - kpis.total_expenses
  const firstName = user?.user_metadata?.full_name?.split(' ')[0]

  return (
    <>
      <PageHeader
        eyebrow={new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
        title={`${greeting()}${firstName ? `, ${firstName}` : ''}`}
        subtitle={canManage ? 'Here is how the events you manage are performing.' : 'Here are the events you are assigned to.'}
        actions={canManage && <Link to="/events/new"><Button icon={Plus}>New event</Button></Link>}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total events" value={number(kpis.total_events)} icon={CalendarDays} tone="indigo"
          hint={`${number(kpis.upcoming_events)} upcoming · ${number(kpis.completed_events)} completed`} />
        <StatCard label="Registrations" value={number(kpis.total_registrations)} icon={Ticket} tone="sky"
          hint={`Avg ${number(kpis.avg_attendance)} attendees / event`} />
        <StatCard label="Attendance rate" value={percent(kpis.attendance_rate)} icon={Users} tone="emerald"
          hint="Across completed events" />
        {fin ? (
          <StatCard label="Total revenue" value={moneyCompact(kpis.total_revenue)} icon={IndianRupee} tone="violet"
            hint={`Avg ${moneyCompact(kpis.avg_revenue_per_event)} / event`} />
        ) : (
          <StatCard label="Attended" value={number(kpis.total_attended)} icon={CalendarCheck} tone="violet" hint="Completed events" />
        )}
      </div>
      {fin && (
        <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Total expenses" value={moneyCompact(kpis.total_expenses)} icon={Receipt} tone="amber" />
          <StatCard label="Net profit" value={moneyCompact(profit)} icon={PiggyBank} tone={profit >= 0 ? 'emerald' : 'rose'}
            trend={kpis.total_revenue ? { value: `${percent(profit / kpis.total_revenue, 0)} margin`, positive: profit >= 0 } : undefined} />
          <StatCard label="Success rate" value={percent(kpis.success_rate)} icon={Target} tone="indigo" hint="≥75% attendance & profitable" />
          <StatCard label="Cancelled" value={number(kpis.cancelled_events)} icon={Ban} tone="slate" />
        </div>
      )}

      {canManage && <AiBanner />}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card title="Attendance trend" subtitle="Completed events, last 24 months" icon={TrendingUp} className="lg:col-span-2">
          {monthlyRows.length ? (
            <TrendChart data={monthlyRows} xKey="month" series={[
              { key: 'registrations', label: 'Registrations' },
              { key: 'attended', label: 'Attended' },
            ]} />
          ) : <EmptyState title="No completed events yet">Trends appear once events are completed.</EmptyState>}
        </Card>
        <Card title="Events by status" icon={CalendarDays}>
          {byStatus.length ? (
            <DonutChart data={byStatus.map((s) => ({ label: STATUS_LABELS[s.status], count: s.events }))} height={260} />
          ) : <EmptyState title="No events" />}
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {fin && (
          <Card title="Revenue vs expenses" subtitle="Monthly, completed events" icon={IndianRupee}>
            {monthlyRows.length ? (
              <TrendChart money data={monthlyRows} xKey="month" series={[
                { key: 'revenue', label: 'Revenue', color: '#10b981' },
                { key: 'expenses', label: 'Expenses', color: '#f43f5e' },
              ]} />
            ) : <EmptyState title="No completed events yet" />}
          </Card>
        )}
        <Card title="Attendance rate by event type" icon={Percent} className={fin ? '' : 'lg:col-span-2'}>
          {byType.length ? (
            <BarsChart layout="vertical" formatter={(v) => percent(v, 0)}
              data={byType.map((t) => ({ ...t, event_type: titleCase(t.event_type) }))}
              xKey="event_type" series={[{ key: 'attendance_rate', label: 'Attendance rate' }]} />
          ) : <EmptyState title="No completed events yet" />}
        </Card>
      </div>

      <Card title="Upcoming events" icon={CalendarCheck} className="mt-6"
        actions={
          <Link to="/events" className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-700">
            View all <ArrowRight className="size-4" aria-hidden />
          </Link>
        }>
        {upcoming.length ? (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr><th>Event</th><th>Date</th><th>Status</th><th className="w-48 text-right">Registered</th></tr>
              </thead>
              <tbody>
                {upcoming.map((e) => (
                  <tr key={e.id}>
                    <td className="pr-4">
                      <Link to={`/events/${e.id}`} className="font-medium text-slate-900 hover:text-indigo-600">{e.name}</Link>
                      <p className="text-xs text-slate-500">{titleCase(e.event_type)} · {e.venue || 'No venue'}</p>
                    </td>
                    <td className="pr-4 whitespace-nowrap text-slate-600">{date(e.start_date)}</td>
                    <td className="pr-4"><StatusBadge status={e.status} /></td>
                    <td className="text-right">
                      <p className="text-slate-700 tabular-nums">{number(e.registrations)} <span className="text-slate-400">/ {number(e.capacity)}</span></p>
                      <ProgressBar value={e.registrations} max={e.capacity} className="mt-1.5 ml-auto max-w-40" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No upcoming events" icon={CalendarDays}
            action={canManage && <Link to="/events/new"><Button size="sm" icon={Plus}>Create an event</Button></Link>} />
        )}
      </Card>

      {fin && byType.length > 0 && (
        <Card title="Event type performance" icon={BarChart3} className="mt-6">
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Type</th><th className="text-right">Events</th>
                  <th className="text-right">Fill rate</th><th className="text-right">Attendance</th>
                  <th className="text-right">Avg revenue</th><th className="text-right">Avg profit</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {byType.map((t) => (
                  <tr key={t.event_type}>
                    <td className="font-medium text-slate-900">{titleCase(t.event_type)}</td>
                    <td className="text-right">{t.events}</td>
                    <td className="text-right">{percent(t.fill_rate)}</td>
                    <td className="text-right">{percent(t.attendance_rate)}</td>
                    <td className="text-right">{money(t.avg_revenue)}</td>
                    <td className={`text-right font-medium ${t.avg_profit < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{money(t.avg_profit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  )
}

function AiBanner() {
  return (
    <div className="relative mt-6 overflow-hidden rounded-2xl bg-gradient-to-r from-indigo-600 via-indigo-600 to-violet-600 p-5 text-on-accent shadow-glow sm:p-6">
      <div className="pointer-events-none absolute -top-16 -right-10 size-56 rounded-full bg-on-accent/10 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-20 left-1/3 size-48 rounded-full bg-fuchsia-400/20 blur-2xl" />
      <div className="relative flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-on-accent/15 ring-1 ring-on-accent/20">
            <Sparkles className="size-5" aria-hidden />
          </span>
          <div>
            <p className="font-semibold">Forecast your next event before you commit budget</p>
            <p className="mt-0.5 max-w-xl text-sm text-on-accent/75">
              Predict attendance, revenue and success probability, and get venue and equipment recommendations from your historical data.
            </p>
          </div>
        </div>
        <Link to="/predictions"
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#fff] px-4 text-sm font-semibold text-[#4338ca] shadow-sm transition-transform hover:scale-[1.02]">
          Open AI Forecasts <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
    </div>
  )
}
