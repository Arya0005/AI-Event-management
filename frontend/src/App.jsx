import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import { Spinner } from './components/ui'
import Login from './pages/Login'
import Register from './pages/Register'

// Pages behind login are code-split so the sign-in screen loads fast.
const Analytics = lazy(() => import('./pages/Analytics'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const EventDetails = lazy(() => import('./pages/EventDetails'))
const EventForm = lazy(() => import('./pages/EventForm'))
const Events = lazy(() => import('./pages/Events'))
const Predictions = lazy(() => import('./pages/Predictions'))
const Settings = lazy(() => import('./pages/Settings'))

const MANAGERS = ['admin', 'organizer']

export default function App() {
  return (
    <Suspense fallback={<Spinner />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route index element={<Dashboard />} />
          <Route path="events" element={<Events />} />
          <Route path="events/new" element={<ProtectedRoute roles={MANAGERS}><EventForm /></ProtectedRoute>} />
          <Route path="events/:id" element={<EventDetails />} />
          <Route path="events/:id/edit" element={<ProtectedRoute roles={MANAGERS}><EventForm /></ProtectedRoute>} />
          <Route path="analytics" element={<ProtectedRoute roles={MANAGERS}><Analytics /></ProtectedRoute>} />
          <Route path="predictions" element={<ProtectedRoute roles={MANAGERS}><Predictions /></ProtectedRoute>} />
          <Route path="settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
