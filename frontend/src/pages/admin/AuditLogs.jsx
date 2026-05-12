import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import {
  Search, Filter, ChevronLeft, ChevronRight, Eye, X, Activity,
  LogIn, LogOut, Plus, Pencil, Trash2, Shield, Clock, Globe,
  Monitor, User, CheckCircle, XCircle, RefreshCw, Hash,
  ChevronDown, ChevronUp, Wifi, WifiOff, AlertTriangle,
  BarChart2, Users, TrendingUp, Zap, Calendar, ArrowRight,
  Layers, Database, Lock, Unlock,
} from 'lucide-react'
import auditService from '../../services/auditService'
import ModalPortal from '../../components/common/ModalPortal'
import { formatDateTime, formatRelativeTime } from '../../utils/format'

// ── Shared helpers ─────────────────────────────────────────────────────────────

const ROLE_COLORS = {
  owner:                  '#7c3aed',
  admin:                  '#2563eb',
  candidate_coordinator:  '#059669',
  client_coordinator:     '#0891b2',
  hr:                     '#d97706',
  accounts:               '#dc2626',
  partner:                '#7c3aed',
}

const CHART_PALETTE = ['#6366f1','#8b5cf6','#06b6d4','#10b981','#f59e0b','#ef4444','#ec4899']

const roleColor = (role = '') => ROLE_COLORS[role.toLowerCase()] || '#6366f1'

const RoleBadge = ({ role }) => {
  if (!role || role === '—') return <span className="text-sm" style={{ color: 'var(--text-muted)' }}>—</span>
  const color = roleColor(role)
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold"
      style={{ background: color + '18', color, border: `1px solid ${color}30` }}>
      {role.replace(/_/g, ' ')}
    </span>
  )
}

const SessionBadge = ({ active }) => active
  ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold"
      style={{ background: '#10b98118', color: '#059669', border: '1px solid #10b98130' }}>
      <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />Active
    </span>
  : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold"
      style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--text-disabled)' }} />Offline
    </span>

const UserAvatar = ({ name, size = 'md' }) => {
  const initials = name
    ? name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()
    : '?'
  const COLORS = ['#6366f1','#8b5cf6','#06b6d4','#10b981','#f59e0b','#ef4444','#ec4899']
  const bg = COLORS[initials.charCodeAt(0) % COLORS.length]
  const cls = size === 'sm' ? 'w-7 h-7 text-xs' : size === 'lg' ? 'w-10 h-10 text-sm' : 'w-8 h-8 text-xs'
  return (
    <div className={`${cls} rounded-full flex items-center justify-center text-white font-bold flex-shrink-0`}
      style={{ background: bg }}>
      {initials}
    </div>
  )
}

const ActionBadge = ({ action }) => {
  const MAP = {
    create: { bg: '#10b98118', color: '#059669', icon: Plus,    label: 'Create'  },
    update: { bg: '#6366f118', color: '#4f46e5', icon: Pencil,  label: 'Update'  },
    delete: { bg: '#ef444418', color: '#dc2626', icon: Trash2,  label: 'Delete'  },
    login:  { bg: '#8b5cf618', color: '#7c3aed', icon: LogIn,   label: 'Login'   },
    logout: { bg: 'var(--bg-hover)', color: 'var(--text-muted)', icon: LogOut, label: 'Logout' },
  }
  const cfg = MAP[action] || MAP.update
  const Icon = cfg.icon
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold"
      style={{ background: cfg.bg, color: cfg.color }}>
      <Icon className="w-3 h-3" />{cfg.label || action}
    </span>
  )
}

// ── KPI card ──────────────────────────────────────────────────────────────────
const KpiCard = ({ icon: Icon, label, value, sub, accent = '#6366f1', loading }) => (
  <div className="rounded-xl p-4 flex items-start gap-3" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
      style={{ background: accent + '18' }}>
      <Icon className="w-5 h-5" style={{ color: accent }} />
    </div>
    <div className="min-w-0">
      <p className="text-xs font-medium truncate" style={{ color: 'var(--text-muted)' }}>{label}</p>
      {loading
        ? <div className="h-7 w-16 rounded mt-1 animate-pulse" style={{ background: 'var(--bg-hover)' }} />
        : <p className="text-2xl font-bold mt-0.5 leading-none" style={{ color: 'var(--text-heading)' }}>{value ?? '—'}</p>
      }
      {sub && <p className="text-xs mt-1 truncate" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
    </div>
  </div>
)

// ── Custom tooltip for recharts ───────────────────────────────────────────────
const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl p-3 shadow-xl text-xs" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', minWidth: 100 }}>
      <p className="font-semibold mb-1" style={{ color: 'var(--text-heading)' }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }}>{p.name}: <strong>{p.value}</strong></p>
      ))}
    </div>
  )
}

// ── User History Drawer ───────────────────────────────────────────────────────
const UserHistoryDrawer = ({ user, onClose }) => {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const PAGE_SIZE = 20

  const fetchHistory = useCallback(async (p = 1) => {
    if (!user) return
    try {
      setLoading(true)
      const res = await auditService.getLoginHistoryByUser(user.user_id, { page: p, page_size: PAGE_SIZE })
      setLogs(res.data || [])
      setTotal(res.total || 0)
    } catch { /* non-critical */ }
    finally { setLoading(false) }
  }, [user])

  useEffect(() => { fetchHistory(page) }, [fetchHistory, page])

  if (!user) return null
  const totalPages = Math.ceil(total / PAGE_SIZE)

  // Group logs by date label
  const groupedLogs = (() => {
    const now = new Date()
    const IST_MS = 5.5 * 3600 * 1000
    const todayIST  = new Date(now.getTime() + IST_MS)
    todayIST.setUTCHours(0, 0, 0, 0)
    const yesterdayIST = new Date(todayIST.getTime() - 86400000)
    const groups = {}
    for (const log of logs) {
      const dt = new Date(log.login_time)
      const dtIST = new Date(dt.getTime() + IST_MS)
      dtIST.setUTCHours(0, 0, 0, 0)
      let label
      if (dtIST.getTime() === todayIST.getTime()) label = 'Today'
      else if (dtIST.getTime() === yesterdayIST.getTime()) label = 'Yesterday'
      else {
        label = dt.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' })
      }
      if (!groups[label]) groups[label] = []
      groups[label].push(log)
    }
    return groups
  })()

  return (
    <ModalPortal isOpen={!!user}>
      <div className="fixed inset-0 z-[9999] flex">
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
        <div className="relative ml-auto h-full w-full max-w-xl flex flex-col shadow-2xl"
          style={{ background: 'var(--bg-card)', borderLeft: '1px solid var(--border)' }}>

          {/* Drawer header */}
          <div className="flex items-center gap-3 px-5 py-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
            <UserAvatar name={user.full_name} size="lg" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold truncate" style={{ color: 'var(--text-heading)' }}>{user.full_name}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <RoleBadge role={user.role} />
                <SessionBadge active={user.is_active} />
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg transition-colors flex-shrink-0"
              style={{ color: 'var(--text-muted)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = ''}>
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Stats strip */}
          <div className="grid grid-cols-3 gap-px flex-shrink-0" style={{ background: 'var(--border)' }}>
            {[
              { label: 'Today',   value: user.total_today  },
              { label: 'Week',    value: user.total_week   },
              { label: 'Month',   value: user.total_month  },
            ].map(s => (
              <div key={s.label} className="text-center py-3" style={{ background: 'var(--bg-card)' }}>
                <p className="text-xl font-bold" style={{ color: 'var(--text-heading)' }}>{s.value}</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{s.label}</p>
              </div>
            ))}
          </div>

          {/* History list */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
            {loading
              ? [...Array(6)].map((_, i) => (
                  <div key={i} className="flex gap-3 animate-pulse">
                    <div className="w-px flex-shrink-0 ml-3 rounded" style={{ background: 'var(--border)' }} />
                    <div className="flex-1 space-y-1.5 pb-4">
                      <div className="h-3.5 w-32 rounded" style={{ background: 'var(--bg-hover)' }} />
                      <div className="h-3 w-48 rounded" style={{ background: 'var(--bg-hover)' }} />
                    </div>
                  </div>
                ))
              : Object.entries(groupedLogs).map(([dateLabel, items]) => (
                  <div key={dateLabel}>
                    <p className="text-xs font-semibold uppercase tracking-wider mb-3"
                      style={{ color: 'var(--text-muted)' }}>
                      {dateLabel} <span style={{ color: 'var(--text-disabled)' }}>({items.length})</span>
                    </p>
                    <div className="space-y-2.5">
                      {items.map((log, idx) => (
                        <div key={log.id || idx} className="flex items-start gap-3 rounded-xl p-3"
                          style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)' }}>
                          <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                            style={{ background: '#6366f118' }}>
                            <LogIn className="w-3.5 h-3.5" style={{ color: '#6366f1' }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                              {log.login_time ? formatDateTime(log.login_time) : '—'}
                            </p>
                            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                              {log.ip_address && (
                                <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                                  {log.ip_address}
                                </span>
                              )}
                              {log.device && (
                                <span className="text-xs truncate max-w-[160px]" style={{ color: 'var(--text-muted)' }}
                                  title={log.device}>
                                  {log.device}
                                </span>
                              )}
                            </div>
                          </div>
                          <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-disabled)' }}>
                            {log.login_time ? formatRelativeTime(log.login_time) : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
            }
            {!loading && logs.length === 0 && (
              <div className="text-center py-12">
                <LogIn className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--text-disabled)' }} />
                <p style={{ color: 'var(--text-muted)' }}>No login history</p>
              </div>
            )}
          </div>

          {/* Drawer pagination */}
          {totalPages > 1 && (
            <div className="px-5 py-3 flex items-center justify-between flex-shrink-0"
              style={{ borderTop: '1px solid var(--border)' }}>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Page {page} of {totalPages} · {total} records
              </p>
              <div className="flex gap-2">
                <button onClick={() => setPage(p => p - 1)} disabled={page === 1}
                  className="p-1.5 rounded-lg disabled:opacity-40 transition-colors"
                  style={{ border: '1px solid var(--border)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}>
                  <ChevronLeft className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                </button>
                <button onClick={() => setPage(p => p + 1)} disabled={page === totalPages}
                  className="p-1.5 rounded-lg disabled:opacity-40 transition-colors"
                  style={{ border: '1px solid var(--border)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}>
                  <ChevronRight className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </ModalPortal>
  )
}

// ── Analytics Charts Panel ────────────────────────────────────────────────────
const AnalyticsPanel = ({ analytics, loading }) => {
  const axisStyle = { fontSize: 11, fill: 'var(--text-muted)' }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
      {/* Daily trend — spans 2 cols */}
      <div className="xl:col-span-2 rounded-xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <p className="text-sm font-semibold mb-4" style={{ color: 'var(--text-heading)' }}>Daily Login Trend (Last 30 Days)</p>
        {loading
          ? <div className="h-48 rounded animate-pulse" style={{ background: 'var(--bg-hover)' }} />
          : (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={analytics?.daily_trend || []} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date"
                  tickFormatter={d => { const p = d.split('-'); return `${p[2]}/${p[1]}` }}
                  tick={axisStyle} interval="preserveStartEnd" />
                <YAxis tick={axisStyle} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} />
                <Line type="monotone" dataKey="count" name="Logins" stroke="#6366f1" strokeWidth={2}
                  dot={false} activeDot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          )
        }
      </div>

      {/* Role breakdown */}
      <div className="rounded-xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <p className="text-sm font-semibold mb-4" style={{ color: 'var(--text-heading)' }}>Logins by Role</p>
        {loading
          ? <div className="h-48 rounded animate-pulse" style={{ background: 'var(--bg-hover)' }} />
          : analytics?.role_breakdown?.length
            ? (
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={analytics.role_breakdown} dataKey="count" nameKey="role"
                    cx="50%" cy="50%" outerRadius={70} innerRadius={40}
                    paddingAngle={3}>
                    {analytics.role_breakdown.map((entry, i) => (
                      <Cell key={entry.role} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={({ active, payload }) =>
                    active && payload?.length
                      ? <div className="rounded-xl p-2.5 shadow-xl text-xs"
                          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                          <p style={{ color: 'var(--text-heading)' }}><strong>{payload[0].name}</strong>: {payload[0].value}</p>
                        </div>
                      : null
                  } />
                  <Legend formatter={v => <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{v}</span>} />
                </PieChart>
              </ResponsiveContainer>
            )
            : <div className="h-48 flex items-center justify-center">
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No data</p>
              </div>
        }
      </div>

      {/* Hourly heatmap bar chart */}
      <div className="xl:col-span-3 rounded-xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <p className="text-sm font-semibold mb-4" style={{ color: 'var(--text-heading)' }}>Login Activity by Hour (IST)</p>
        {loading
          ? <div className="h-36 rounded animate-pulse" style={{ background: 'var(--bg-hover)' }} />
          : (
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={analytics?.hourly_dist || []} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="hour"
                  tickFormatter={h => `${h}:00`}
                  tick={axisStyle} interval={2} />
                <YAxis tick={axisStyle} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} formatter={(v) => [v, 'Logins']}
                  labelFormatter={h => `${h}:00 – ${h}:59 IST`} />
                <Bar dataKey="count" name="Logins" radius={[3, 3, 0, 0]}>
                  {(analytics?.hourly_dist || []).map((entry, i) => (
                    <Cell key={i} fill={entry.count > 0 ? '#6366f1' : 'var(--bg-hover)'} fillOpacity={0.7 + (entry.count > 5 ? 0.3 : 0)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )
        }
      </div>
    </div>
  )
}

// ── Login Summary Tab ─────────────────────────────────────────────────────────
const LoginSummary = () => {
  const [summary, setSummary]       = useState([])
  const [analytics, setAnalytics]   = useState(null)
  const [loadingSummary, setLoadingSummary] = useState(true)
  const [loadingAnalytics, setLoadingAnalytics] = useState(true)
  const [selectedUser, setSelectedUser] = useState(null)
  const [search, setSearch]         = useState('')
  const [showCharts, setShowCharts] = useState(true)

  const fetchAll = useCallback(async () => {
    setLoadingSummary(true)
    setLoadingAnalytics(true)
    try {
      const res = await auditService.getLoginSummary()
      setSummary(res.data || [])
    } catch { /* ignore */ }
    finally { setLoadingSummary(false) }
    try {
      const res = await auditService.getLoginAnalytics(30)
      setAnalytics(res)
    } catch { /* ignore */ }
    finally { setLoadingAnalytics(false) }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const filtered = summary.filter(u =>
    !search ||
    u.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    u.role?.toLowerCase().includes(search.toLowerCase())
  )

  const kpi = analytics?.kpi || {}

  return (
    <div className="space-y-5">
      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={LogIn}  label="Logins Today"     value={kpi.total_today}     sub="across all users"    accent="#6366f1" loading={loadingAnalytics} />
        <KpiCard icon={Users}  label="Unique Users Today" value={kpi.unique_today}  sub="distinct accounts"   accent="#8b5cf6" loading={loadingAnalytics} />
        <KpiCard icon={Wifi}   label="Active Sessions"  value={kpi.active_sessions} sub="currently online"    accent="#10b981" loading={loadingAnalytics} />
        <KpiCard icon={BarChart2} label="Logins (30 Days)" value={kpi.total_range}  sub="this month total"    accent="#f59e0b" loading={loadingAnalytics} />
      </div>

      {/* Charts toggle */}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
        <button
          onClick={() => setShowCharts(v => !v)}
          className="w-full flex items-center justify-between px-5 py-3 text-sm font-semibold transition-colors"
          style={{ background: 'var(--bg-card)', color: 'var(--text-heading)' }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
          onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-card)'}>
          <span className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4" style={{ color: '#6366f1' }} />
            Analytics Charts
          </span>
          {showCharts ? <ChevronUp className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                      : <ChevronDown className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />}
        </button>
        {showCharts && (
          <div className="p-5" style={{ background: 'var(--bg-secondary)', borderTop: '1px solid var(--border)' }}>
            <AnalyticsPanel analytics={analytics} loading={loadingAnalytics} />
          </div>
        )}
      </div>

      {/* Summary table */}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
        {/* Table toolbar */}
        <div className="flex items-center gap-3 px-5 py-3 flex-wrap" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-muted)' }} />
            <input
              type="text" value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search users or roles..."
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg outline-none transition-all"
              style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
            />
          </div>
          <p className="text-xs flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
            {filtered.length} user{filtered.length !== 1 ? 's' : ''}
          </p>
          <button onClick={fetchAll}
            className="p-2 rounded-lg transition-colors flex-shrink-0"
            style={{ border: '1px solid var(--border)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = ''}>
            <RefreshCw className={`w-4 h-4 ${loadingSummary ? 'animate-spin' : ''}`} style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead style={{ background: 'var(--bg-hover)', borderBottom: '1px solid var(--border)' }}>
              <tr>
                {['User','Role','Today','This Week','This Month','Total','Last Login','Last IP','Session','Actions'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider whitespace-nowrap"
                    style={{ color: 'var(--text-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loadingSummary
                ? [...Array(5)].map((_, i) => (
                    <tr key={i} className="animate-pulse" style={{ borderBottom: '1px solid var(--border)' }}>
                      <td className="px-4 py-3.5"><div className="flex items-center gap-2.5"><div className="w-8 h-8 rounded-full" style={{ background: 'var(--bg-hover)' }} /><div className="h-4 w-28 rounded" style={{ background: 'var(--bg-hover)' }} /></div></td>
                      {[...Array(9)].map((_, j) => <td key={j} className="px-4 py-3.5"><div className="h-4 w-16 rounded" style={{ background: 'var(--bg-hover)' }} /></td>)}
                    </tr>
                  ))
                : filtered.length === 0
                  ? (
                    <tr>
                      <td colSpan={10} className="px-5 py-14 text-center">
                        <Users className="w-9 h-9 mx-auto mb-2" style={{ color: 'var(--text-disabled)' }} />
                        <p style={{ color: 'var(--text-muted)' }}>No users found</p>
                      </td>
                    </tr>
                  )
                  : filtered.map(user => (
                      <tr key={user.user_id} className="transition-colors"
                        style={{ borderBottom: '1px solid var(--border)' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                        onMouseLeave={e => e.currentTarget.style.background = ''}>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <UserAvatar name={user.full_name} />
                            <span className="text-sm font-medium truncate max-w-[140px]"
                              style={{ color: 'var(--text-primary)' }}>{user.full_name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5"><RoleBadge role={user.role} /></td>
                        <td className="px-4 py-3.5">
                          <span className="text-sm font-semibold" style={{ color: user.total_today > 0 ? '#6366f1' : 'var(--text-muted)' }}>
                            {user.total_today}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{user.total_week}</span>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{user.total_month}</span>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="text-sm" style={{ color: 'var(--text-muted)' }}>{user.total_all}</span>
                        </td>
                        <td className="px-4 py-3.5">
                          <p className="text-xs whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>
                            {user.last_login ? formatDateTime(user.last_login) : '—'}
                          </p>
                          {user.last_login && (
                            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                              {formatRelativeTime(user.last_login)}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{user.last_ip}</span>
                        </td>
                        <td className="px-4 py-3.5"><SessionBadge active={user.is_active} /></td>
                        <td className="px-4 py-3.5">
                          <button
                            onClick={() => setSelectedUser(user)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                            style={{ background: '#6366f118', color: '#6366f1', border: '1px solid #6366f130' }}
                            onMouseEnter={e => { e.currentTarget.style.background = '#6366f128' }}
                            onMouseLeave={e => { e.currentTarget.style.background = '#6366f118' }}>
                            <ArrowRight className="w-3.5 h-3.5" />History
                          </button>
                        </td>
                      </tr>
                    ))
              }
            </tbody>
          </table>
        </div>
      </div>

      {/* User history drawer */}
      <UserHistoryDrawer user={selectedUser} onClose={() => setSelectedUser(null)} />
    </div>
  )
}

// ── System Activity Tab (unchanged logic, restyled) ───────────────────────────
const LogModal = ({ log, onClose }) => {
  if (!log) return null
  return (
    <ModalPortal isOpen={!!log}>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
        <div className="relative rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between p-5" style={{ borderBottom: '1px solid var(--border)' }}>
            <div className="flex items-center gap-3">
              <ActionBadge action={log.action} />
              <span className="text-sm font-semibold" style={{ color: 'var(--text-heading)' }}>
                {log.entity_type_display || log.entity_type}
              </span>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg transition-colors"
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = ''}>
              <X className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
            </button>
          </div>
          <div className="p-5 space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'var(--bg-hover)' }}>
              <UserAvatar name={log.user_name || log.user_full_name} />
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--text-heading)' }}>{log.user_name || log.user_full_name || 'Unknown'}</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{log.user_role || ''}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'Module',      value: log.entity_type_display || log.entity_type },
                { label: 'Action',      value: log.action_display || log.action },
                { label: 'Timestamp',   value: formatDateTime(log.created_at) },
                { label: 'IP Address',  value: log.ip_address },
                { label: 'Entity ID',   value: log.entity_id },
                { label: 'Entity Name', value: log.entity_name },
              ].filter(f => f.value).map(({ label, value }) => (
                <div key={label}>
                  <p className="text-xs mb-0.5" style={{ color: 'var(--text-muted)' }}>{label}</p>
                  <p className="text-sm font-medium break-all" style={{ color: 'var(--text-heading)' }}>{value}</p>
                </div>
              ))}
            </div>
            {log.description && (
              <div>
                <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Description</p>
                <p className="text-sm rounded-lg p-3" style={{ background: 'var(--bg-hover)', color: 'var(--text-primary)' }}>{log.description}</p>
              </div>
            )}
            {log.changed_fields?.length > 0 && (
              <div>
                <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>Changed Fields</p>
                <div className="flex flex-wrap gap-1.5">
                  {log.changed_fields.map(f => (
                    <span key={f} className="px-2 py-0.5 rounded text-xs"
                      style={{ background: '#6366f118', color: '#6366f1', border: '1px solid #6366f130' }}>{f}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="px-5 pb-5">
            <button onClick={onClose} className="w-full py-2.5 rounded-xl text-sm font-medium transition-colors"
              style={{ border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = ''}>
              Close
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}

const SystemActivity = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const [logs, setLogs]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 0 })
  const [actions, setActions]   = useState([])
  const [entityTypes, setEntityTypes] = useState([])
  const [showFilters, setShowFilters] = useState(false)
  const [selectedLog, setSelectedLog] = useState(null)
  const [filters, setFilters]   = useState({
    search:      searchParams.get('search')      || '',
    action:      searchParams.get('action')      || '',
    entity_type: searchParams.get('entity_type') || '',
  })

  useEffect(() => {
    Promise.all([auditService.getAvailableActions(), auditService.getAvailableEntityTypes()])
      .then(([a, t]) => { setActions(a.data || []); setEntityTypes(t.data || []) })
      .catch(() => {})
  }, [])

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true)
      const res = await auditService.getAuditLogs({
        page:        parseInt(searchParams.get('page') || '1'),
        page_size:   20,
        search:      searchParams.get('search')      || undefined,
        action:      searchParams.get('action')      || undefined,
        entity_type: searchParams.get('entity_type') || undefined,
      })
      setLogs(res.data || [])
      const pg = res.pagination || {}
      setPagination({ page: pg.page || 1, total: pg.total || 0, totalPages: pg.total_pages || 0 })
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [searchParams])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  const applyFilters = () => {
    const p = new URLSearchParams()
    if (filters.search)      p.set('search',      filters.search)
    if (filters.action)      p.set('action',      filters.action)
    if (filters.entity_type) p.set('entity_type', filters.entity_type)
    p.set('page', '1')
    setSearchParams(p)
  }

  const clearFilters = () => {
    setFilters({ search: '', action: '', entity_type: '' })
    setSearchParams(new URLSearchParams())
  }

  const hasFilters = filters.search || filters.action || filters.entity_type

  const inputCls = {
    background: 'var(--bg-hover)', border: '1px solid var(--border)', color: 'var(--text-primary)',
  }

  return (
    <>
      <div className="rounded-xl p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <div className="flex gap-3 flex-wrap">
          <div className="flex-1 min-w-48 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-muted)' }} />
            <input type="text" value={filters.search}
              onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && applyFilters()}
              placeholder="Search logs..."
              className="w-full pl-10 pr-4 py-2.5 rounded-lg text-sm outline-none"
              style={inputCls} />
          </div>
          <button onClick={() => setShowFilters(v => !v)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
            style={{ border: `1px solid ${showFilters ? '#6366f1' : 'var(--border)'}`, color: showFilters ? '#6366f1' : 'var(--text-muted)', background: showFilters ? '#6366f118' : 'var(--bg-hover)' }}>
            <Filter className="w-4 h-4" />Filters{hasFilters && <span className="w-2 h-2 rounded-full bg-indigo-500" />}
          </button>
          <button onClick={applyFilters}
            className="px-4 py-2.5 rounded-lg text-sm font-semibold text-white transition-colors"
            style={{ background: '#6366f1' }}
            onMouseEnter={e => e.currentTarget.style.background = '#4f46e5'}
            onMouseLeave={e => e.currentTarget.style.background = '#6366f1'}>
            Search
          </button>
          <button onClick={fetchLogs} className="p-2.5 rounded-lg transition-colors"
            style={{ border: '1px solid var(--border)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = ''}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>

        {showFilters && (
          <div className="mt-4 pt-4 grid grid-cols-1 sm:grid-cols-3 gap-3" style={{ borderTop: '1px solid var(--border)' }}>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Action Type</label>
              <select value={filters.action} onChange={e => setFilters(f => ({ ...f, action: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputCls}>
                <option value="">All Actions</option>
                {actions.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Module</label>
              <select value={filters.entity_type} onChange={e => setFilters(f => ({ ...f, entity_type: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputCls}>
                <option value="">All Modules</option>
                {entityTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            {hasFilters && (
              <div className="flex items-end">
                <button onClick={clearFilters} className="flex items-center gap-1.5 text-sm font-medium px-3 py-2"
                  style={{ color: '#ef4444' }}>
                  <X className="w-4 h-4" />Clear
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {pagination.total > 0 ? `${pagination.total} records` : 'No records'}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead style={{ background: 'var(--bg-hover)', borderBottom: '1px solid var(--border)' }}>
              <tr>
                {['Action','Module','Description','User','Time (IST)',''].map(h => (
                  <th key={h} className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider"
                    style={{ color: 'var(--text-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading
                ? [...Array(8)].map((_, i) => (
                    <tr key={i} className="animate-pulse" style={{ borderBottom: '1px solid var(--border)' }}>
                      <td className="px-5 py-4"><div className="h-5 w-16 rounded" style={{ background: 'var(--bg-hover)' }} /></td>
                      <td className="px-5 py-4"><div className="h-4 w-20 rounded" style={{ background: 'var(--bg-hover)' }} /></td>
                      <td className="px-5 py-4"><div className="h-4 w-48 rounded" style={{ background: 'var(--bg-hover)' }} /></td>
                      <td className="px-5 py-4"><div className="flex items-center gap-2"><div className="w-7 h-7 rounded-full" style={{ background: 'var(--bg-hover)' }} /><div className="h-4 w-24 rounded" style={{ background: 'var(--bg-hover)' }} /></div></td>
                      <td className="px-5 py-4"><div className="h-4 w-32 rounded" style={{ background: 'var(--bg-hover)' }} /></td>
                      <td className="px-5 py-4"><div className="h-7 w-7 rounded-lg ml-auto" style={{ background: 'var(--bg-hover)' }} /></td>
                    </tr>
                  ))
                : logs.length === 0
                  ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-14 text-center">
                        <Activity className="w-9 h-9 mx-auto mb-2" style={{ color: 'var(--text-disabled)' }} />
                        <p style={{ color: 'var(--text-muted)' }}>No audit logs found</p>
                        {hasFilters && <button onClick={clearFilters} className="mt-2 text-sm" style={{ color: '#6366f1' }}>Clear filters</button>}
                      </td>
                    </tr>
                  )
                  : logs.map(log => (
                      <tr key={log.id} className="transition-colors" style={{ borderBottom: '1px solid var(--border)' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                        onMouseLeave={e => e.currentTarget.style.background = ''}>
                        <td className="px-5 py-3.5"><ActionBadge action={log.action} /></td>
                        <td className="px-5 py-3.5">
                          <span className="text-sm font-medium capitalize" style={{ color: 'var(--text-primary)' }}>
                            {log.entity_type_display || log.entity_type || '—'}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 max-w-xs">
                          <p className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>{log.description || '—'}</p>
                          {log.entity_name && <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>{log.entity_name}</p>}
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            <UserAvatar name={log.user_name || log.user_full_name} size="sm" />
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{log.user_name || log.user_full_name || '—'}</p>
                              {log.ip_address && <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{log.ip_address}</p>}
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{formatDateTime(log.created_at)}</p>
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <button onClick={() => setSelectedLog(log)} className="p-1.5 rounded-lg transition-colors"
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                            onMouseLeave={e => e.currentTarget.style.background = ''}>
                            <Eye className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                          </button>
                        </td>
                      </tr>
                    ))
              }
            </tbody>
          </table>
        </div>

        {pagination.totalPages > 1 && (
          <div className="px-5 py-4 flex items-center justify-between" style={{ borderTop: '1px solid var(--border)' }}>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Page {pagination.page} of {pagination.totalPages} · {pagination.total} records
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => { const p = new URLSearchParams(searchParams); p.set('page', pagination.page - 1); setSearchParams(p) }}
                disabled={pagination.page === 1}
                className="p-2 rounded-lg disabled:opacity-40 transition-colors"
                style={{ border: '1px solid var(--border)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = ''}>
                <ChevronLeft className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
              </button>
              <button
                onClick={() => { const p = new URLSearchParams(searchParams); p.set('page', pagination.page + 1); setSearchParams(p) }}
                disabled={pagination.page === pagination.totalPages}
                className="p-2 rounded-lg disabled:opacity-40 transition-colors"
                style={{ border: '1px solid var(--border)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = ''}>
                <ChevronRight className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
              </button>
            </div>
          </div>
        )}
      </div>
      <LogModal log={selectedLog} onClose={() => setSelectedLog(null)} />
    </>
  )
}

// ── Raw Login Events Tab ──────────────────────────────────────────────────────
const RawLoginEvents = () => {
  const [logs, setLogs]       = useState([])
  const [loading, setLoading] = useState(true)
  const [page, setPage]       = useState(1)
  const [total, setTotal]     = useState(0)
  const [search, setSearch]   = useState('')
  const PAGE_SIZE = 25

  const fetchLogs = useCallback(async (p = 1) => {
    try {
      setLoading(true)
      const res = await auditService.getLoginActivity({ page: p, page_size: PAGE_SIZE })
      setLogs(res.data || [])
      setTotal(res.total || 0)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchLogs(page) }, [fetchLogs, page])

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const filtered = search
    ? logs.filter(l => (l.full_name || '').toLowerCase().includes(search.toLowerCase()) || (l.role || '').toLowerCase().includes(search.toLowerCase()))
    : logs

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      <div className="px-5 py-3 flex items-center gap-3 flex-wrap" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-muted)' }} />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Filter by name or role..."
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg outline-none"
            style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
        </div>
        <p className="text-xs flex-shrink-0" style={{ color: 'var(--text-muted)' }}>{total} total records</p>
        <button onClick={() => fetchLogs(page)} className="p-1.5 rounded-lg transition-colors"
          onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
          onMouseLeave={e => e.currentTarget.style.background = ''}>
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} style={{ color: 'var(--text-muted)' }} />
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead style={{ background: 'var(--bg-hover)', borderBottom: '1px solid var(--border)' }}>
            <tr>
              {['User','Role','Login Time (IST)','IP Address','Device / User-Agent'].map(h => (
                <th key={h} className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider whitespace-nowrap"
                  style={{ color: 'var(--text-muted)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading
              ? [...Array(8)].map((_, i) => (
                  <tr key={i} className="animate-pulse" style={{ borderBottom: '1px solid var(--border)' }}>
                    <td className="px-5 py-4"><div className="flex items-center gap-2"><div className="w-7 h-7 rounded-full" style={{ background: 'var(--bg-hover)' }} /><div className="h-4 w-28 rounded" style={{ background: 'var(--bg-hover)' }} /></div></td>
                    {[...Array(4)].map((_, j) => <td key={j} className="px-5 py-4"><div className="h-4 w-24 rounded" style={{ background: 'var(--bg-hover)' }} /></td>)}
                  </tr>
                ))
              : filtered.length === 0
                ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-14 text-center">
                      <LogIn className="w-9 h-9 mx-auto mb-2" style={{ color: 'var(--text-disabled)' }} />
                      <p style={{ color: 'var(--text-muted)' }}>No login events found</p>
                    </td>
                  </tr>
                )
                : filtered.map((log, idx) => (
                    <tr key={log.id || idx} className="transition-colors" style={{ borderBottom: '1px solid var(--border)' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                      onMouseLeave={e => e.currentTarget.style.background = ''}>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <UserAvatar name={log.full_name} size="sm" />
                          <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{log.full_name || '—'}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5"><RoleBadge role={log.role} /></td>
                      <td className="px-5 py-3.5">
                        <p className="text-sm whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>
                          {log.login_time ? formatDateTime(log.login_time) : '—'}
                        </p>
                        {log.login_time && (
                          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                            {formatRelativeTime(log.login_time)}
                          </p>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{log.ip_address || '—'}</span>
                      </td>
                      <td className="px-5 py-3.5 max-w-xs">
                        <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }} title={log.device}>{log.device || '—'}</p>
                      </td>
                    </tr>
                  ))
            }
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="px-5 py-4 flex items-center justify-between" style={{ borderTop: '1px solid var(--border)' }}>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Page {page} of {totalPages} · {total} records
          </p>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => p - 1)} disabled={page === 1}
              className="p-2 rounded-lg disabled:opacity-40 transition-colors"
              style={{ border: '1px solid var(--border)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = ''}>
              <ChevronLeft className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
            </button>
            <button onClick={() => setPage(p => p + 1)} disabled={page === totalPages}
              className="p-2 rounded-lg disabled:opacity-40 transition-colors"
              style={{ border: '1px solid var(--border)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = ''}>
              <ChevronRight className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
const TABS = [
  { key: 'overview',  label: 'Login Overview',   icon: BarChart2  },
  { key: 'system',    label: 'System Activity',  icon: Activity   },
  { key: 'raw',       label: 'Raw Login Events', icon: Database   },
]

const AuditLogs = () => {
  const [activeTab, setActiveTab] = useState('overview')

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-heading)' }}>
            Audit & Session Intelligence
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Enterprise login analytics, session tracking, and system activity · IST (Asia/Kolkata)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs"
            style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
            <Clock className="w-3.5 h-3.5" />All times in IST
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs"
            style={{ background: '#6366f118', border: '1px solid #6366f130', color: '#6366f1' }}>
            <Shield className="w-3.5 h-3.5" />Audit Mode
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: 'var(--bg-hover)' }}>
        {TABS.map(tab => {
          const Icon = tab.icon
          const active = activeTab === tab.key
          return (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
              style={{
                background: active ? 'var(--bg-card)' : 'transparent',
                color: active ? 'var(--text-heading)' : 'var(--text-muted)',
                boxShadow: active ? '0 1px 4px rgba(0,0,0,0.12)' : 'none',
              }}>
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {activeTab === 'overview' && <LoginSummary />}
      {activeTab === 'system'   && <SystemActivity />}
      {activeTab === 'raw'      && <RawLoginEvents />}
    </div>
  )
}

export default AuditLogs
