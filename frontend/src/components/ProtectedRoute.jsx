import { Loader2, ShieldAlert } from 'lucide-react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { titleCase } from '../utils/format'
import { BrandMark } from './Brand'
import { Button } from './ui'

export default function ProtectedRoute({ roles, children }) {
  const { session, role, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50" role="status">
        <BrandMark size="lg" />
        <Loader2 className="size-5 animate-spin text-indigo-600" aria-label="Loading" />
      </div>
    )
  }
  if (!session) return <Navigate to="/login" replace state={{ from: location }} />
  if (roles && !roles.includes(role)) {
    return (
      <div className="mx-auto mt-16 flex max-w-md flex-col items-center text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
          <ShieldAlert className="size-6" aria-hidden />
        </span>
        <h1 className="mt-4 text-lg font-semibold text-slate-900">Access restricted</h1>
        <p className="mt-2 text-sm text-slate-500">
          Your role ({titleCase(role)}) doesn't have access to this page. Ask an admin if you need organizer access.
        </p>
        <Link to="/" className="mt-6"><Button variant="secondary">Back to dashboard</Button></Link>
      </div>
    )
  }
  return children
}
