import { CalendarDays, CornerDownLeft, LogOut, Moon, Plus, Search, Sun } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { eventService } from '../services/eventService'
import { date, titleCase } from '../utils/format'
import { visibleSections } from './nav'
import { Kbd, StatusBadge } from './ui'

/**
 * Global ⌘K / Ctrl+K palette: jump to pages, run quick actions, search events.
 * Layout mounts it only while open, so every opening starts with fresh state.
 */
export default function CommandPalette({ onClose }) {
  const navigate = useNavigate()
  const { canManage, signOut } = useAuth()
  const { resolved, toggle } = useTheme()
  const [query, setQuery] = useState('')
  const [result, setResult] = useState({ q: '', items: [] }) // last completed event search
  const [active, setActive] = useState(0)
  const list = useRef(null)

  const q = query.trim()
  const canSearch = q.length >= 2
  // Only show results that belong to the current query; stale ones are ignored.
  const events = useMemo(() => (canSearch && result.q === q ? result.items : []), [canSearch, result, q])
  const searching = canSearch && result.q !== q

  // Debounced server-side event search.
  useEffect(() => {
    if (!canSearch) return
    let cancelled = false
    const t = setTimeout(async () => {
      let items = []
      try {
        items = (await eventService.list({ search: q, page_size: 6, sort: '-start_date' })).items
      } catch {
        // Search is best-effort; pages and actions still work.
      }
      if (!cancelled) {
        setResult({ q, items })
        setActive(0)
      }
    }, 200)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [q, canSearch])

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const match = (label) => !q || label.toLowerCase().includes(q)
    const pages = visibleSections(canManage).flatMap((s) => s.items)
      .filter((i) => match(i.label))
      .map((i) => ({ id: `nav-${i.to}`, label: i.label, icon: i.icon, hint: 'Page', run: () => navigate(i.to) }))
    const actions = [
      canManage && { id: 'new-event', label: 'Create new event', icon: Plus, run: () => navigate('/events/new') },
      {
        id: 'theme', label: resolved === 'dark' ? 'Switch to light mode' : 'Switch to dark mode',
        icon: resolved === 'dark' ? Sun : Moon, run: toggle,
      },
      { id: 'sign-out', label: 'Sign out', icon: LogOut, run: signOut },
    ].filter(Boolean).filter((a) => match(a.label))
    const found = events.map((e) => ({
      id: `event-${e.id}`, label: e.name, icon: CalendarDays,
      hint: `${titleCase(e.event_type)} · ${date(e.start_date)}`, status: e.status,
      run: () => navigate(`/events/${e.id}`),
    }))
    return [
      { label: 'Events', items: found },
      { label: 'Pages', items: pages },
      { label: 'Actions', items: actions },
    ].filter((g) => g.items.length)
  }, [query, events, canManage, resolved, navigate, toggle, signOut])

  const flat = groups.flatMap((g) => g.items)

  useEffect(() => {
    list.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const run = (item) => {
    onClose()
    item.run()
  }

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => (flat.length ? (i + 1) % flat.length : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => (flat.length ? (i - 1 + flat.length) % flat.length : 0))
    } else if (e.key === 'Enter' && flat[active]) {
      e.preventDefault()
      run(flat[active])
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  let index = -1
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-[12vh] backdrop-blur-sm animate-fade-in" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-elevated animate-scale-in"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-slate-100 px-4">
          <Search className="size-4 shrink-0 text-slate-400" aria-hidden />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
            onKeyDown={onKeyDown}
            placeholder="Search events, pages and actions…"
            className="h-12 w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
            role="combobox"
            aria-expanded="true"
            aria-controls="command-list"
            aria-activedescendant={flat[active]?.id}
          />
          <Kbd>Esc</Kbd>
        </div>

        <div ref={list} id="command-list" role="listbox" className="max-h-[50vh] overflow-y-auto p-2">
          {groups.length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-slate-500">
              {searching ? 'Searching…' : `No results for “${query}”`}
            </p>
          )}
          {groups.map((g) => (
            <div key={g.label} className="mb-1">
              <p className="px-3 pb-1 pt-2 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">{g.label}</p>
              {g.items.map((item) => {
                index += 1
                const i = index
                const selected = i === active
                return (
                  <button
                    key={item.id}
                    id={item.id}
                    role="option"
                    aria-selected={selected}
                    data-active={selected}
                    onMouseMove={() => setActive(i)}
                    onClick={() => run(item)}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                      selected ? 'bg-indigo-50 text-indigo-900' : 'text-slate-700'
                    }`}
                  >
                    <item.icon className={`size-4 shrink-0 ${selected ? 'text-indigo-600' : 'text-slate-400'}`} aria-hidden />
                    <span className="min-w-0 flex-1 truncate font-medium">{item.label}</span>
                    {item.status && <StatusBadge status={item.status} />}
                    {item.hint && <span className="hidden truncate text-xs text-slate-400 sm:inline">{item.hint}</span>}
                    {selected && <CornerDownLeft className="size-3.5 shrink-0 text-slate-400" aria-hidden />}
                  </button>
                )
              })}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-4 border-t border-slate-100 bg-slate-50 px-4 py-2 text-[11px] text-slate-500">
          <span className="flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> navigate</span>
          <span className="flex items-center gap-1"><Kbd>↵</Kbd> open</span>
          {query.trim().length > 0 && query.trim().length < 2 && <span>Type 2+ characters to search events</span>}
        </div>
      </div>
    </div>
  )
}
