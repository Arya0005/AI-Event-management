import { ArrowLeft, Lock, Mail, MailCheck, User } from 'lucide-react'
import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { Button, ErrorMessage, Field } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { AuthShell, IconInput } from './Login'

function passwordStrength(p) {
  let score = 0
  if (p.length >= 8) score++
  if (p.length >= 12) score++
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) score++
  if (/\d/.test(p) && /[^A-Za-z0-9]/.test(p)) score++
  return score
}
const STRENGTH = [
  ['Too short', 'bg-rose-500'], ['Weak', 'bg-rose-500'], ['Fair', 'bg-amber-500'], ['Good', 'bg-emerald-500'], ['Strong', 'bg-emerald-500'],
]

export default function Register() {
  const { session, signUp } = useAuth()
  const [form, setForm] = useState({ fullName: '', email: '', password: '' })
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  if (session) return <Navigate to="/" replace />

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const data = await signUp(form.email, form.password, form.fullName)
      // When email confirmation is enabled, Supabase returns no session yet.
      if (!data.session) setDone(true)
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <AuthShell title="Check your email" subtitle="Confirm your address to finish registering">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-card">
          <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <MailCheck className="size-6" aria-hidden />
          </span>
          <p className="mt-4 text-sm leading-relaxed text-slate-600">
            We sent a confirmation link to <strong className="text-slate-900">{form.email}</strong>. New accounts start with
            the <strong className="text-slate-900">staff</strong> role; an admin can grant organizer access.
          </p>
        </div>
        <Link to="/login" className="mt-6 flex items-center justify-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-700">
          <ArrowLeft className="size-4" aria-hidden /> Back to sign in
        </Link>
      </AuthShell>
    )
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const strength = passwordStrength(form.password)
  return (
    <AuthShell title="Create your account" subtitle="New accounts start as staff; admins assign roles">
      <form onSubmit={submit} className="space-y-5">
        <ErrorMessage error={error} />
        <Field label="Full name">
          <IconInput icon={User} required autoComplete="name" placeholder="Priya Sharma" value={form.fullName} onChange={set('fullName')} />
        </Field>
        <Field label="Email">
          <IconInput icon={Mail} type="email" required autoComplete="email" placeholder="you@company.com" value={form.email} onChange={set('email')} />
        </Field>
        <div>
          <Field label="Password">
            <IconInput icon={Lock} type="password" required minLength={8} autoComplete="new-password" placeholder="At least 8 characters"
              value={form.password} onChange={set('password')} />
          </Field>
          {form.password && (
            <div className="mt-2 flex items-center gap-3" aria-live="polite">
              <div className="flex flex-1 gap-1">
                {[0, 1, 2, 3].map((i) => (
                  <span key={i} className={`h-1 flex-1 rounded-full transition-colors ${i < strength ? STRENGTH[strength][1] : 'bg-slate-200'}`} />
                ))}
              </div>
              <span className="w-16 text-right text-xs text-slate-500">{form.password.length < 8 ? STRENGTH[0][0] : STRENGTH[strength][0]}</span>
            </div>
          )}
        </div>
        <Button type="submit" variant="gradient" size="lg" className="w-full" loading={busy}>
          {busy ? 'Creating account…' : 'Create account'}
        </Button>
      </form>
      <p className="mt-8 text-center text-sm text-slate-500">
        Already registered? <Link to="/login" className="font-medium text-indigo-600 hover:text-indigo-700">Sign in</Link>
      </p>
    </AuthShell>
  )
}
