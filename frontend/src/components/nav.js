import { BarChart3, CalendarDays, LayoutDashboard, Settings, Sparkles } from 'lucide-react'

/** Single source of truth for app navigation (sidebar, top bar title, command palette). */
export const NAV_SECTIONS = [
  {
    label: 'Workspace',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
      { to: '/events', label: 'Events', icon: CalendarDays },
    ],
  },
  {
    label: 'Intelligence',
    manage: true,
    items: [
      { to: '/analytics', label: 'Analytics', icon: BarChart3, manage: true },
      { to: '/predictions', label: 'AI Forecasts', icon: Sparkles, manage: true, badge: 'AI' },
    ],
  },
  {
    label: 'System',
    items: [{ to: '/settings', label: 'Settings', icon: Settings }],
  },
]

export const visibleSections = (canManage) =>
  NAV_SECTIONS.filter((s) => !s.manage || canManage).map((s) => ({
    ...s,
    items: s.items.filter((i) => !i.manage || canManage),
  }))

/** Human title for the current path, used in the top bar. */
export function titleForPath(pathname) {
  if (pathname === '/') return 'Dashboard'
  if (pathname === '/events/new') return 'New event'
  if (/^\/events\/[^/]+\/edit$/.test(pathname)) return 'Edit event'
  if (/^\/events\/[^/]+$/.test(pathname)) return 'Event details'
  for (const s of NAV_SECTIONS) {
    for (const i of s.items) if (i.to !== '/' && pathname.startsWith(i.to)) return i.label
  }
  return 'EventIQ'
}
