import { ChevronDown, LogOut, Menu, Moon, Plus, Search, Settings, Sun, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { titleCase } from '../utils/format'
import Brand from './Brand'
import CommandPalette from './CommandPalette'
import { titleForPath, visibleSections } from './nav'
import { Avatar, Badge, Button, IconButton, Kbd } from './ui'

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

export default function Layout() {
  const { user, role, canManage, signOut } = useAuth()
  const location = useLocation()
  const [drawer, setDrawer] = useState(false)
  const [palette, setPalette] = useState(false)

  // Global ⌘K / Ctrl+K.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPalette((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    document.title = `${titleForPath(location.pathname)} · EventIQ`
  }, [location.pathname])

  const sidebar = (
    <SidebarContent canManage={canManage} user={user} role={role} onSignOut={signOut} onNavigate={() => setDrawer(false)} />
  )

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-slate-200 bg-white lg:block">
        {sidebar}
      </aside>

      {/* Mobile drawer */}
      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in" onClick={() => setDrawer(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] border-r border-slate-200 bg-white shadow-elevated animate-slide-in-left">
            <IconButton icon={X} label="Close menu" onClick={() => setDrawer(false)} className="absolute top-4 right-3" />
            {sidebar}
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        <TopBar
          title={titleForPath(location.pathname)}
          canManage={canManage}
          user={user}
          role={role}
          onMenu={() => setDrawer(true)}
          onSearch={() => setPalette(true)}
          onSignOut={signOut}
        />
        <main className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {/* Keyed by path so each page fades in on navigation. */}
          <div key={location.pathname} className="mx-auto max-w-7xl animate-fade-in">
            <Outlet />
          </div>
        </main>
      </div>

      {palette && <CommandPalette onClose={() => setPalette(false)} />}
    </div>
  )
}

function SidebarContent({ canManage, user, role, onSignOut, onNavigate }) {
  const sections = visibleSections(canManage)
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center px-5">
        <Link to="/" onClick={onNavigate} className="rounded-lg focus-visible:outline-2 focus-visible:outline-indigo-500"><Brand /></Link>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4" aria-label="Main">
        {sections.map((s) => (
          <div key={s.label}>
            <p className="mb-1.5 px-3 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">{s.label}</p>
            <div className="space-y-0.5">
              {s.items.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  end={n.end}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    `group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                      isActive
                        ? 'bg-indigo-50 text-indigo-700'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-r-full bg-indigo-600" aria-hidden />}
                      <n.icon className={`size-[18px] ${isActive ? 'text-indigo-600' : 'text-slate-400 group-hover:text-slate-600'}`} aria-hidden />
                      <span className="flex-1">{n.label}</span>
                      {n.badge && (
                        <span className="rounded-md bg-gradient-to-r from-indigo-600 to-violet-600 px-1.5 py-0.5 text-[10px] font-semibold text-on-accent">
                          {n.badge}
                        </span>
                      )}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-slate-200 p-3">
        <div className="flex items-center gap-3 rounded-xl p-2">
          <Avatar name={user?.user_metadata?.full_name} email={user?.email} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-900" title={user?.email}>
              {user?.user_metadata?.full_name || user?.email}
            </p>
            <p className="text-xs text-slate-500">{titleCase(role)}</p>
          </div>
          <IconButton icon={LogOut} label="Sign out" onClick={onSignOut} className="size-8" />
        </div>
      </div>
    </div>
  )
}

function TopBar({ title, canManage, user, role, onMenu, onSearch, onSignOut }) {
  const { resolved, toggle } = useTheme()
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/80 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
      <IconButton icon={Menu} label="Open menu" onClick={onMenu} className="-ml-2 lg:hidden" />
      <h2 className="truncate text-sm font-semibold text-slate-900">{title}</h2>

      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
        <button
          onClick={onSearch}
          className="hidden h-9 w-64 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-400 transition-colors hover:border-slate-300 hover:bg-white md:flex"
        >
          <Search className="size-4" aria-hidden />
          <span className="flex-1 text-left">Search…</span>
          <span className="flex gap-0.5"><Kbd>{isMac ? '⌘' : 'Ctrl'}</Kbd><Kbd>K</Kbd></span>
        </button>
        <IconButton icon={Search} label="Search" onClick={onSearch} className="md:hidden" />
        <IconButton icon={resolved === 'dark' ? Sun : Moon} label={resolved === 'dark' ? 'Light mode' : 'Dark mode'} onClick={toggle} />
        {canManage && (
          <Link to="/events/new" className="hidden sm:block">
            <Button size="sm" icon={Plus}>New event</Button>
          </Link>
        )}
        <UserMenu user={user} role={role} onSignOut={onSignOut} />
      </div>
    </header>
  )
}

function UserMenu({ user, role, onSignOut }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e) => !ref.current?.contains(e.target) && setOpen(false)
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const name = user?.user_metadata?.full_name
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 rounded-full p-0.5 transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-indigo-500"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
      >
        <Avatar name={name} email={user?.email} size="sm" />
        <ChevronDown className="mr-1 hidden size-3.5 text-slate-400 sm:block" aria-hidden />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 mt-2 w-64 origin-top-right rounded-xl border border-slate-200 bg-white p-1.5 shadow-elevated animate-scale-in">
          <div className="flex items-center gap-3 px-2.5 py-2.5">
            <Avatar name={name} email={user?.email} />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-900">{name || 'Signed in'}</p>
              <p className="truncate text-xs text-slate-500">{user?.email}</p>
            </div>
          </div>
          <div className="px-2.5 pb-2"><Badge className="bg-indigo-50 text-indigo-700">{titleCase(role)}</Badge></div>
          <div className="my-1 h-px bg-slate-100" />
          <Link to="/settings" role="menuitem" onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-slate-700 hover:bg-slate-100">
            <Settings className="size-4 text-slate-400" aria-hidden /> Settings
          </Link>
          <button role="menuitem" onClick={onSignOut}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-rose-600 hover:bg-rose-50">
            <LogOut className="size-4" aria-hidden /> Sign out
          </button>
        </div>
      )}
    </div>
  )
}
