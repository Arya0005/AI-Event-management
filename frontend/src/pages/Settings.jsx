import { BrainCircuit, Monitor, Moon, Palette, RefreshCw, ScrollText, Sun, UserRound, UsersRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Avatar, Badge, Button, Card, ErrorMessage, PageHeader, Select, TableSkeleton } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { useToast } from '../context/ToastContext'
import { useAsync } from '../hooks/useAsync'
import { userService } from '../services/eventService'
import { predictionService } from '../services/predictionService'
import { dateTime, titleCase } from '../utils/format'

export default function Settings() {
  const { user, role, isAdmin, refresh } = useAuth()
  const [refreshing, setRefreshing] = useState(false)
  const toast = useToast()
  const name = user?.user_metadata?.full_name

  const refreshPermissions = async () => {
    setRefreshing(true)
    try {
      await refresh()
      toast.success('Permissions refreshed')
    } catch (err) {
      toast.error(err)
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <>
      <PageHeader title="Settings" subtitle="Manage your account, appearance and workspace" />
      <div className="space-y-6">
        <Card title="Your account" icon={UserRound}>
          <div className="flex flex-wrap items-center gap-4">
            <Avatar name={name} email={user?.email} size="lg" />
            <div className="min-w-0 flex-1">
              <p className="text-base font-semibold text-slate-900">{name || user?.email}</p>
              <p className="text-sm text-slate-500">{user?.email}</p>
            </div>
            <Badge className="bg-indigo-50 text-indigo-700">{titleCase(role)}</Badge>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
            <Button variant="secondary" size="sm" icon={RefreshCw} loading={refreshing} onClick={refreshPermissions}>
              {refreshing ? 'Refreshing…' : 'Refresh permissions'}
            </Button>
            <span className="text-xs text-slate-500">Use this after an admin changes your role.</span>
          </div>
        </Card>
        <AppearanceCard />
        {isAdmin && <UsersCard currentUserId={user?.id} />}
        {isAdmin && <ModelsCard />}
        {isAdmin && <AuditCard />}
      </div>
    </>
  )
}

const THEMES = [
  { id: 'light', label: 'Light', icon: Sun },
  { id: 'dark', label: 'Dark', icon: Moon },
  { id: 'system', label: 'System', icon: Monitor },
]

function AppearanceCard() {
  const { preference, setTheme } = useTheme()
  return (
    <Card title="Appearance" subtitle="Choose how EventIQ looks on this device" icon={Palette}>
      <div className="grid max-w-lg grid-cols-3 gap-3" role="radiogroup" aria-label="Theme">
        {THEMES.map((t) => {
          const selected = preference === t.id
          return (
            <button key={t.id} role="radio" aria-checked={selected} onClick={() => setTheme(t.id)}
              className={`flex flex-col items-center gap-2 rounded-xl border p-4 text-sm font-medium transition-all ${
                selected
                  ? 'border-indigo-500 bg-indigo-50 text-indigo-700 ring-4 ring-indigo-500/15'
                  : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
              }`}>
              <t.icon className="size-5" aria-hidden />
              {t.label}
            </button>
          )
        })}
      </div>
    </Card>
  )
}

function UsersCard({ currentUserId }) {
  const users = useAsync(() => userService.list(), [])
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)
  const toast = useToast()

  const change = async (u, role) => {
    setBusy(u.id)
    setError(null)
    try {
      await userService.setRole(u.id, role)
      await users.reload()
      toast.success(`${u.full_name || u.email} is now ${titleCase(role)}`)
    } catch (err) {
      setError(err)
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card title="Users & roles" icon={UsersRound}>
      <p className="mb-3 text-sm text-slate-500">
        <strong>Admin</strong>: everything. <strong>Organizer</strong>: creates and fully manages their own events.
        <strong> Staff</strong>: works on assigned events (attendees and check-in only). Users must refresh their session to pick up a change.
      </p>
      <ErrorMessage error={error || users.error} />
      {users.loading && !users.data ? <TableSkeleton rows={3} /> : (
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr><th className="pb-2">User</th><th className="pb-2">Joined</th><th className="pb-2">Role</th></tr>
            </thead>
            <tbody>
              {(users.data || []).map((u) => (
                <tr key={u.id}>
                  <td className="py-2">
                    <p className="font-medium text-slate-800">{u.full_name || u.email}</p>
                    <p className="text-xs text-slate-500">{u.email}</p>
                  </td>
                  <td className="py-2 text-slate-600">{dateTime(u.created_at)}</td>
                  <td className="py-2">
                    {u.id === currentUserId ? <Badge>{u.role} (you)</Badge> : (
                      <Select aria-label={`Role for ${u.email}`} value={u.role} disabled={busy === u.id}
                        onChange={(e) => change(u, e.target.value)} className="max-w-40">
                        <option value="admin">Admin</option>
                        <option value="organizer">Organizer</option>
                        <option value="staff">Staff</option>
                      </Select>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

function ModelsCard() {
  const models = useAsync(() => predictionService.models(), [])
  const [error, setError] = useState(null)
  const toast = useToast()
  const training = models.data?.training?.running

  // Poll while a retrain is in progress.
  useEffect(() => {
    if (!training) return
    const t = setInterval(models.reload, 3000)
    return () => clearInterval(t)
  }, [training, models.reload])

  const retrain = async () => {
    setError(null)
    try {
      await predictionService.retrain()
      await models.reload()
      toast.info('Retraining started — models hot-swap when it finishes')
    } catch (err) {
      setError(err)
      toast.error(err)
    }
  }

  const m = models.data
  return (
    <Card title="ML models" icon={BrainCircuit}
      actions={<Button size="sm" icon={RefreshCw} onClick={retrain} loading={training}>{training ? 'Training…' : 'Retrain now'}</Button>}>
      <ErrorMessage error={error || models.error} />
      {m?.training?.error && <ErrorMessage error={new Error(`Last training failed: ${m.training.error}`)} />}
      {models.loading && !m ? <TableSkeleton rows={2} /> : m?.trained ? (
        <div className="space-y-3 text-sm">
          <p className="text-slate-600">
            Trained {dateTime(m.trained_at)} on <strong>{m.n_events}</strong> completed events. Retraining folds newly completed
            events back into the dataset (the feedback loop) and hot-swaps the models without a restart.
          </p>
          <ul className="space-y-1 font-mono text-xs text-slate-600">
            {Object.values(m.models).map((mm) => <li key={mm.version}>{mm.version} · {mm.algorithm}</li>)}
          </ul>
          <details className="text-xs text-slate-600">
            <summary className="cursor-pointer font-medium text-slate-700">Data quality report</summary>
            <pre className="mt-2 overflow-x-auto rounded bg-slate-50 p-3">{JSON.stringify(m.data_quality, null, 2)}</pre>
          </details>
        </div>
      ) : <p className="text-sm text-slate-600">No models trained yet. At least 30 completed events are required.</p>}
    </Card>
  )
}

function AuditCard() {
  const logs = useAsync(() => userService.auditLogs(50), [])
  return (
    <Card title="Audit log" subtitle="Last 50 administrative actions" icon={ScrollText}
      actions={<Button size="sm" variant="secondary" icon={RefreshCw} onClick={logs.reload} loading={logs.loading && Boolean(logs.data)}>Refresh</Button>}>
      <ErrorMessage error={logs.error} />
      {logs.loading && !logs.data ? <TableSkeleton rows={4} /> : logs.data?.length ? (
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr><th className="pb-2">When</th><th className="pb-2">User</th><th className="pb-2">Action</th><th className="pb-2">Record</th></tr>
            </thead>
            <tbody>
              {logs.data.map((l) => (
                <tr key={l.id}>
                  <td className="whitespace-nowrap py-1.5 text-slate-600">{dateTime(l.created_at)}</td>
                  <td className="py-1.5">{l.user_email || '—'}</td>
                  <td className="py-1.5"><Badge>{l.action}</Badge> <span className="text-slate-600">{l.table_name}</span></td>
                  <td className="py-1.5 font-mono text-xs text-slate-500">{l.record_id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="text-sm text-slate-500">No audited actions yet.</p>}
    </Card>
  )
}
