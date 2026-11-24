import { BarChart3, BrainCircuit, Eye, EyeOff, Lock, Mail, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import Brand, { BrandMark } from '../components/Brand'
import { Button, ErrorMessage, Field, inputClass } from '../components/ui'
import { useAuth } from '../context/AuthContext'

const FEATURES = [
  { icon: BrainCircuit, title: 'Forecast every event', text: 'Random Forest models predict attendance, revenue and success probability from your own history.' },
  { icon: BarChart3, title: 'Live performance analytics', text: 'KPIs, trends and anomaly detection across every event you run.' },
  { icon: ShieldCheck, title: 'Secure by design', text: 'Role-based access enforced in the API and by row-level security in Postgres.' },
]

export function AuthShell({ title, subtitle, children }) {
  return (
    <div className="flex min-h-screen bg-white">
      {/* Brand panel */}
      <div className="relative hidden w-[46%] overflow-hidden bg-[#0b0b1f] p-12 text-on-accent lg:flex lg:flex-col">
        <div className="pointer-events-none absolute -top-40 -left-32 size-[34rem] rounded-full bg-indigo-600/40 blur-3xl" />
        <div className="pointer-events-none absolute -right-40 -bottom-40 size-[30rem] rounded-full bg-violet-600/30 blur-3xl" />
        <div className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '44px 44px' }} />

        <div className="relative flex items-center gap-2.5">
          <BrandMark />
          <span className="text-[15px] font-semibold tracking-tight">EventIQ</span>
        </div>

        <div className="relative my-auto max-w-md">
          <p className="inline-flex items-center gap-2 rounded-full border border-on-accent/15 bg-on-accent/5 px-3 py-1 text-xs font-medium text-indigo-200">
            <span className="size-1.5 rounded-full bg-emerald-400" /> AI-powered event intelligence
          </p>
          <h2 className="mt-6 text-4xl leading-[1.1] font-semibold tracking-tight">
            Plan smarter events with{' '}
            <span className="bg-gradient-to-r from-indigo-300 via-violet-300 to-fuchsia-300 bg-clip-text text-transparent">data you already have</span>.
          </h2>
          <ul className="mt-10 space-y-6">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex gap-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-on-accent/10 bg-on-accent/5">
                  <f.icon className="size-5 text-indigo-300" aria-hidden />
                </span>
                <div>
                  <p className="text-sm font-semibold">{f.title}</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-on-accent/60">{f.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-on-accent/40">© {new Date().getFullYear()} EventIQ</p>
      </div>

      {/* Form panel */}
      <div className="flex flex-1 items-center justify-center bg-slate-50 px-4 py-12 sm:px-8 lg:bg-white">
        <div className="w-full max-w-sm animate-fade-in">
          <div className="mb-8 lg:hidden"><Brand /></div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
          <p className="mt-1.5 text-sm text-slate-500">{subtitle}</p>
          <div className="mt-8">{children}</div>
        </div>
      </div>
    </div>
  )
}

/** Input with a leading icon; password fields get a show/hide toggle. */
export function IconInput({ icon: Icon, type = 'text', ...props }) {
  const [reveal, setReveal] = useState(false)
  const isPassword = type === 'password'
  return (
    <div className="relative">
      <Icon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
      <input type={isPassword && reveal ? 'text' : type} className={`${inputClass} h-10 pl-9 ${isPassword ? 'pr-10' : ''}`} {...props} />
      {isPassword && (
        <button type="button" onClick={() => setReveal((v) => !v)}
          className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:text-slate-600"
          aria-label={reveal ? 'Hide password' : 'Show password'}>
          {reveal ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      )}
    </div>
  )
}

export default function Login() {
  const { session, signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  if (session) return <Navigate to={location.state?.from?.pathname || '/'} replace />

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await signIn(email, password)
      navigate(location.state?.from?.pathname || '/', { replace: true })
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to your EventIQ workspace">
      <form onSubmit={submit} className="space-y-5">
        <ErrorMessage error={error} />
        <Field label="Email">
          <IconInput icon={Mail} type="email" autoComplete="email" required placeholder="you@company.com"
            value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password">
          <IconInput icon={Lock} type="password" autoComplete="current-password" required placeholder="••••••••"
            value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Button type="submit" variant="gradient" size="lg" className="w-full" loading={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
      <p className="mt-8 text-center text-sm text-slate-500">
        New to EventIQ?{' '}
        <Link to="/register" className="font-medium text-indigo-600 hover:text-indigo-700">Create an account</Link>
      </p>
    </AuthShell>
  )
}
