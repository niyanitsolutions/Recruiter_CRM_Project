import React, { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import {
  Search, Users2, Briefcase, Building2, X, ArrowRight,
  LayoutDashboard, Calendar, FileText, Settings, Target,
  Loader2, Clock, ChevronRight,
} from 'lucide-react'
import candidateService from '../../services/candidateService'
import jobService from '../../services/jobService'
import clientService from '../../services/clientService'

const QUICK_NAV = [
  { label: 'Dashboard',    icon: LayoutDashboard, path: '/dashboard' },
  { label: 'Candidates',   icon: Users2,          path: '/candidates' },
  { label: 'Jobs',         icon: Briefcase,       path: '/jobs' },
  { label: 'Clients',      icon: Building2,       path: '/clients' },
  { label: 'Interviews',   icon: Calendar,        path: '/interviews' },
  { label: 'Reports',      icon: FileText,        path: '/reports' },
  { label: 'Targets',      icon: Target,          path: '/targets' },
  { label: 'Settings',     icon: Settings,        path: '/settings' },
]

const RESULT_ICONS = {
  candidate: Users2,
  job:       Briefcase,
  client:    Building2,
}

const RESULT_COLORS = {
  candidate: 'var(--stat-teal)',
  job:       'var(--stat-orange)',
  client:    'var(--stat-blue)',
}

const RECENT_KEY = 'crm_recent_searches'

function getRecent() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') } catch { return [] }
}

function addRecent(item) {
  try {
    const prev = getRecent().filter(r => r.path !== item.path)
    const next = [item, ...prev].slice(0, 5)
    localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch {}
}

const ResultRow = ({ item, isActive, onSelect }) => {
  const Icon = RESULT_ICONS[item.type] || FileText
  const color = RESULT_COLORS[item.type] || 'var(--accent)'

  return (
    <button
      onClick={() => onSelect(item)}
      className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors"
      style={{
        background: isActive ? 'var(--bg-active)' : 'transparent',
        color: 'var(--text-primary)',
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
      onMouseLeave={e => e.currentTarget.style.background = isActive ? 'var(--bg-active)' : 'transparent'}
    >
      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: `${color}20` }}>
        <Icon className="w-4 h-4" style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate" style={{ color: 'var(--text-heading)' }}>{item.label}</p>
        {item.sub && <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{item.sub}</p>}
      </div>
      <span className="text-xs px-2 py-0.5 rounded-full flex-shrink-0 capitalize"
        style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)' }}>
        {item.type}
      </span>
      <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--text-disabled)' }} />
    </button>
  )
}

const NavRow = ({ item, isActive, onSelect }) => {
  const Icon = item.icon
  return (
    <button
      onClick={() => onSelect({ label: item.label, path: item.path, type: 'nav' })}
      className="w-full flex items-center gap-3 px-4 py-2 text-left transition-colors"
      style={{
        background: isActive ? 'var(--bg-active)' : 'transparent',
        color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-primary)' }}
      onMouseLeave={e => { e.currentTarget.style.background = isActive ? 'var(--bg-active)' : 'transparent'; e.currentTarget.style.color = isActive ? 'var(--accent)' : 'var(--text-secondary)' }}
    >
      <Icon className="w-4 h-4 flex-shrink-0" />
      <span className="text-sm">{item.label}</span>
    </button>
  )
}

const GlobalSearch = ({ onClose }) => {
  const navigate = useNavigate()
  const inputRef = useRef(null)
  const containerRef = useRef(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [activeIdx, setActiveIdx] = useState(0)
  const [recent] = useState(getRecent)

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [])

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const search = useCallback(async (q) => {
    if (!q.trim()) { setResults([]); return }
    setLoading(true)
    try {
      const [cRes, jRes, clRes] = await Promise.allSettled([
        candidateService.getCandidates({ search: q, page_size: 4 }),
        jobService.getJobs({ search: q, page_size: 4 }),
        clientService.getClients({ search: q, page_size: 4 }),
      ])
      const mapped = []
      if (cRes.status === 'fulfilled') {
        const items = cRes.value?.data?.items || cRes.value?.data?.data || cRes.value?.data || []
        items.slice(0, 4).forEach(c => mapped.push({
          type: 'candidate',
          label: c.full_name || c.name,
          sub: c.current_designation || c.email || '',
          path: `/candidates/${c.id || c._id}`,
        }))
      }
      if (jRes.status === 'fulfilled') {
        const items = jRes.value?.data?.items || jRes.value?.data?.data || jRes.value?.data || []
        items.slice(0, 4).forEach(j => mapped.push({
          type: 'job',
          label: j.title || j.job_title,
          sub: j.client_name || j.department || '',
          path: `/jobs/${j.id || j._id}`,
        }))
      }
      if (clRes.status === 'fulfilled') {
        const items = clRes.value?.data?.items || clRes.value?.data?.data || clRes.value?.data || []
        items.slice(0, 4).forEach(c => mapped.push({
          type: 'client',
          label: c.company_name || c.name,
          sub: c.industry || c.email || '',
          path: `/clients/${c.id || c._id}`,
        }))
      }
      setResults(mapped)
      setActiveIdx(0)
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => {
    const tid = setTimeout(() => search(query), 280)
    return () => clearTimeout(tid)
  }, [query, search])

  const allRows = query ? results : recent.map(r => ({ ...r, isRecent: true }))
  const navRows = query
    ? QUICK_NAV.filter(n => n.label.toLowerCase().includes(query.toLowerCase()))
    : QUICK_NAV

  const handleSelect = (item) => {
    addRecent(item)
    navigate(item.path)
    onClose()
  }

  const handleKeyDown = (e) => {
    const total = allRows.length + navRows.length
    if (e.key === 'Escape') { onClose(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => (i + 1) % Math.max(total, 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIdx(i => (i - 1 + Math.max(total, 1)) % Math.max(total, 1)) }
    if (e.key === 'Enter') {
      if (activeIdx < allRows.length) {
        if (allRows[activeIdx]) handleSelect(allRows[activeIdx])
      } else {
        const navItem = navRows[activeIdx - allRows.length]
        if (navItem) handleSelect({ label: navItem.label, path: navItem.path, type: 'nav' })
      }
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-start justify-center" style={{ paddingTop: '12vh' }}>
      <div className="absolute inset-0 bg-black/60" style={{ backdropFilter: 'blur(4px)' }} onClick={onClose} />
      <div
        ref={containerRef}
        className="relative w-full mx-4 rounded-2xl overflow-hidden"
        style={{
          maxWidth: 560,
          background: 'var(--bg-card)',
          border: '1px solid var(--border-strong)',
          boxShadow: 'var(--shadow-elevated)',
          animation: 'slideUp 0.15s ease-out',
        }}
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3.5" style={{ borderBottom: '1px solid var(--border)' }}>
          {loading
            ? <Loader2 className="w-5 h-5 flex-shrink-0 animate-spin" style={{ color: 'var(--accent)' }} />
            : <Search className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
          }
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); setActiveIdx(0) }}
            placeholder="Search candidates, jobs, clients..."
            className="flex-1 text-sm bg-transparent outline-none"
            style={{
              color: 'var(--text-primary)',
              background: 'transparent',
              border: 'none',
              boxShadow: 'none',
            }}
          />
          {query
            ? <button onClick={() => setQuery('')} className="p-1 rounded-md transition-colors"
                style={{ color: 'var(--text-muted)' }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--text-primary)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}>
                <X className="w-4 h-4" />
              </button>
            : <kbd className="text-xs px-1.5 py-0.5 rounded border font-mono"
                style={{ color: 'var(--text-disabled)', borderColor: 'var(--border)', background: 'var(--bg-hover)' }}>
                ESC
              </kbd>
          }
        </div>

        {/* Results area */}
        <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
          {/* Recent / Search results */}
          {allRows.length > 0 && (
            <div>
              <p className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider"
                style={{ color: 'var(--text-disabled)' }}>
                {query ? 'Results' : 'Recent'}
              </p>
              {allRows.map((item, i) => (
                <ResultRow key={item.path + i} item={item} isActive={activeIdx === i} onSelect={handleSelect} />
              ))}
            </div>
          )}

          {/* No results */}
          {query && !loading && results.length === 0 && (
            <div className="px-4 py-8 text-center">
              <Search className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--text-disabled)' }} />
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No results for "{query}"</p>
            </div>
          )}

          {/* Quick navigation */}
          {navRows.length > 0 && (
            <div style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <p className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider"
                style={{ color: 'var(--text-disabled)' }}>
                {query ? 'Navigation' : 'Quick Navigation'}
              </p>
              <div className="grid grid-cols-2 gap-0">
                {navRows.map((item, i) => (
                  <NavRow key={item.path} item={item} isActive={activeIdx === allRows.length + i} onSelect={handleSelect} />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2.5"
          style={{ borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-card-alt)' }}>
          <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--text-disabled)' }}>
            <span><kbd className="font-mono">↑↓</kbd> navigate</span>
            <span><kbd className="font-mono">↵</kbd> select</span>
            <span><kbd className="font-mono">ESC</kbd> close</span>
          </div>
          <div className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-disabled)' }}>
            <Clock className="w-3 h-3" />
            <span>recent saved</span>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

export default GlobalSearch
