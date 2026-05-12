import React, { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Search, Filter, ChevronLeft, ChevronRight, Eye, X, Activity,
  LogIn, LogOut, Plus, Pencil, Trash2, Shield, Clock, Globe,
  Monitor, User, CheckCircle, XCircle, RefreshCw, Hash,
} from 'lucide-react'
import auditService from '../../services/auditService'
import ModalPortal from '../../components/common/ModalPortal'
import { formatDateTime } from '../../utils/format'

// ── Action config ─────────────────────────────────────────────────────────────
const ACTION_CFG = {
  create: { bg: 'bg-success-100', text: 'text-success-700', icon: Plus,    label: 'Create'  },
  update: { bg: 'bg-accent-100',  text: 'text-accent-700',  icon: Pencil,  label: 'Update'  },
  delete: { bg: 'bg-danger-100',  text: 'text-danger-700',  icon: Trash2,  label: 'Delete'  },
  login:  { bg: 'bg-purple-100',  text: 'text-purple-700',  icon: LogIn,   label: 'Login'   },
  logout: { bg: 'bg-surface-100', text: 'text-surface-600', icon: LogOut,  label: 'Logout'  },
}

// ── Avatar initials ───────────────────────────────────────────────────────────
const UserAvatar = ({ name }) => {
  const initials = name
    ? name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()
    : '?'
  const COLORS = ['bg-accent-500','bg-purple-500','bg-indigo-500','bg-teal-500','bg-orange-500','bg-pink-500']
  const idx = initials.charCodeAt(0) % COLORS.length
  return (
    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${COLORS[idx]}`}>
      {initials}
    </div>
  )
}

const ActionBadge = ({ action }) => {
  const cfg = ACTION_CFG[action] || { bg: 'bg-surface-100', text: 'text-surface-600', label: action }
  const Icon = cfg.icon || Activity
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold ${cfg.bg} ${cfg.text}`}>
      <Icon className="w-3 h-3" />
      {cfg.label || action}
    </span>
  )
}

// ── Log detail modal ──────────────────────────────────────────────────────────
const LogModal = ({ log, onClose }) => {
  if (!log) return null
  return (
    <ModalPortal isOpen={!!log}>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
        <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-surface-200">
            <div className="flex items-center gap-3">
              <ActionBadge action={log.action} />
              <span className="text-sm font-semibold text-surface-900">{log.entity_type_display || log.entity_type}</span>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-surface-100 rounded-lg transition-colors">
              <X className="w-4 h-4 text-surface-500" />
            </button>
          </div>

          {/* Body */}
          <div className="p-5 space-y-4">
            {/* User */}
            <div className="flex items-center gap-3 p-3 bg-surface-50 rounded-xl">
              <UserAvatar name={log.user_name || log.user_full_name} />
              <div>
                <p className="text-sm font-semibold text-surface-900">{log.user_name || log.user_full_name || 'Unknown User'}</p>
                <p className="text-xs text-surface-500">{log.user_role || ''}</p>
              </div>
            </div>

            {/* Grid */}
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'Module',      value: log.entity_type_display || log.entity_type },
                { label: 'Action',      value: log.action_display || log.action  },
                { label: 'Timestamp',   value: formatDateTime(log.created_at) },
                { label: 'IP Address',  value: log.ip_address },
                { label: 'Entity ID',   value: log.entity_id },
                { label: 'Entity Name', value: log.entity_name },
              ].filter(f => f.value).map(({ label, value }) => (
                <div key={label}>
                  <p className="text-xs text-surface-400 mb-0.5">{label}</p>
                  <p className="text-sm font-medium text-surface-900 break-all">{value}</p>
                </div>
              ))}
            </div>

            {/* Description */}
            {log.description && (
              <div>
                <p className="text-xs text-surface-400 mb-1">Description</p>
                <p className="text-sm text-surface-700 bg-surface-50 rounded-lg p-3">{log.description}</p>
              </div>
            )}

            {/* Changed fields */}
            {log.changed_fields?.length > 0 && (
              <div>
                <p className="text-xs text-surface-400 mb-2">Changed Fields</p>
                <div className="flex flex-wrap gap-1.5">
                  {log.changed_fields.map(f => (
                    <span key={f} className="px-2 py-0.5 bg-accent-50 text-accent-700 border border-accent-200 rounded text-xs">{f}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="px-5 pb-5">
            <button onClick={onClose} className="w-full py-2.5 border border-surface-200 rounded-xl text-sm font-medium text-surface-700 hover:bg-surface-50 transition-colors">
              Close
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}

// ── System Activity Tab ───────────────────────────────────────────────────────
const SystemActivity = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 0 })
  const [actions, setActions] = useState([])
  const [entityTypes, setEntityTypes] = useState([])
  const [showFilters, setShowFilters] = useState(false)
  const [selectedLog, setSelectedLog] = useState(null)

  const [filters, setFilters] = useState({
    search:      searchParams.get('search')      || '',
    action:      searchParams.get('action')      || '',
    entity_type: searchParams.get('entity_type') || '',
  })

  useEffect(() => {
    const fetchMeta = async () => {
      try {
        const [aRes, tRes] = await Promise.all([
          auditService.getAvailableActions(),
          auditService.getAvailableEntityTypes(),
        ])
        setActions(aRes.data || [])
        setEntityTypes(tRes.data || [])
      } catch { /* non-critical */ }
    }
    fetchMeta()
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
      setPagination(res.pagination || { page: 1, total: 0, totalPages: 0 })
    } catch { /* non-critical */ }
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

  const hasActiveFilters = filters.search || filters.action || filters.entity_type

  return (
    <>
      {/* Search & Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-surface-200 p-4">
        <div className="flex gap-3 flex-wrap">
          <div className="flex-1 min-w-48 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
            <input
              type="text"
              value={filters.search}
              onChange={(e) => setFilters(f => ({ ...f, search: e.target.value }))}
              onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
              placeholder="Search logs..."
              className="w-full pl-10 pr-4 py-2.5 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-4 py-2.5 border rounded-lg text-sm font-medium transition-colors ${
              showFilters ? 'border-accent-500 text-accent-600 bg-accent-50' : 'border-surface-200 text-surface-600 hover:bg-surface-50'
            }`}
          >
            <Filter className="w-4 h-4" />
            Filters
            {hasActiveFilters && <span className="w-2 h-2 bg-accent-500 rounded-full" />}
          </button>
          <button
            onClick={applyFilters}
            className="px-4 py-2.5 bg-accent-600 hover:bg-accent-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Search
          </button>
          <button
            onClick={fetchLogs}
            className="p-2.5 border border-surface-200 hover:bg-surface-50 rounded-lg text-surface-500 transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {showFilters && (
          <div className="mt-4 pt-4 border-t border-surface-100 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-surface-500 mb-1.5">Action Type</label>
              <select
                value={filters.action}
                onChange={(e) => setFilters(f => ({ ...f, action: e.target.value }))}
                className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
              >
                <option value="">All Actions</option>
                {actions.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-500 mb-1.5">Module</label>
              <select
                value={filters.entity_type}
                onChange={(e) => setFilters(f => ({ ...f, entity_type: e.target.value }))}
                className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
              >
                <option value="">All Modules</option>
                {entityTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            {hasActiveFilters && (
              <div className="flex items-end">
                <button onClick={clearFilters} className="flex items-center gap-1.5 text-sm text-danger-600 hover:text-danger-700 font-medium px-3 py-2">
                  <X className="w-4 h-4" /> Clear filters
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Logs Table */}
      <div className="bg-white rounded-xl shadow-sm border border-surface-200 overflow-hidden">
        {/* Summary bar */}
        <div className="px-5 py-3 border-b border-surface-100 flex items-center justify-between">
          <p className="text-sm text-surface-500">
            {pagination.total > 0 ? `${pagination.total} total records` : 'No records'}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-surface-50 border-b border-surface-200">
              <tr>
                <th className="text-left px-5 py-3 text-xs font-semibold text-surface-500 uppercase tracking-wider">Action</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-surface-500 uppercase tracking-wider">Module</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-surface-500 uppercase tracking-wider">Description</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-surface-500 uppercase tracking-wider">User</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-surface-500 uppercase tracking-wider">Time (IST)</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-surface-500 uppercase tracking-wider">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {loading ? (
                [...Array(8)].map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-5 py-4"><div className="h-5 w-16 bg-surface-200 rounded" /></td>
                    <td className="px-5 py-4"><div className="h-4 w-20 bg-surface-200 rounded" /></td>
                    <td className="px-5 py-4"><div className="h-4 w-48 bg-surface-200 rounded" /></td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 bg-surface-200 rounded-full" />
                        <div className="h-4 w-24 bg-surface-200 rounded" />
                      </div>
                    </td>
                    <td className="px-5 py-4"><div className="h-4 w-32 bg-surface-200 rounded" /></td>
                    <td className="px-5 py-4 text-right"><div className="h-7 w-7 bg-surface-200 rounded-lg ml-auto" /></td>
                  </tr>
                ))
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-16 text-center">
                    <Activity className="w-10 h-10 text-surface-300 mx-auto mb-3" />
                    <p className="text-surface-500 font-medium">No audit logs found</p>
                    {hasActiveFilters && (
                      <button onClick={clearFilters} className="mt-2 text-sm text-accent-600 hover:text-accent-700">Clear filters</button>
                    )}
                  </td>
                </tr>
              ) : (
                logs.map(log => {
                  const userName = log.user_name || log.user_full_name || '—'
                  return (
                    <tr key={log.id} className="hover:bg-surface-50 transition-colors">
                      <td className="px-5 py-3.5">
                        <ActionBadge action={log.action} />
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="text-sm text-surface-700 font-medium capitalize">
                          {log.entity_type_display || log.entity_type || '—'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 max-w-xs">
                        <p className="text-sm text-surface-800 truncate">{log.description || '—'}</p>
                        {log.entity_name && (
                          <p className="text-xs text-surface-400 mt-0.5 truncate">{log.entity_name}</p>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <UserAvatar name={userName} />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-surface-900 truncate">{userName}</p>
                            {log.ip_address && (
                              <p className="text-xs text-surface-400 font-mono">{log.ip_address}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <p className="text-sm text-surface-600">{formatDateTime(log.created_at)}</p>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <button
                          onClick={() => setSelectedLog(log)}
                          className="p-1.5 hover:bg-surface-100 rounded-lg transition-colors"
                          title="View details"
                        >
                          <Eye className="w-4 h-4 text-surface-500" />
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {pagination.totalPages > 1 && (
          <div className="px-5 py-4 border-t border-surface-100 flex items-center justify-between">
            <p className="text-sm text-surface-500">
              Page {pagination.page} of {pagination.totalPages} &nbsp;·&nbsp; {pagination.total} records
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => { const p = new URLSearchParams(searchParams); p.set('page', pagination.page - 1); setSearchParams(p) }}
                disabled={pagination.page === 1}
                className="p-2 border border-surface-200 rounded-lg disabled:opacity-40 hover:bg-surface-50 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => { const p = new URLSearchParams(searchParams); p.set('page', pagination.page + 1); setSearchParams(p) }}
                disabled={pagination.page === pagination.totalPages}
                className="p-2 border border-surface-200 rounded-lg disabled:opacity-40 hover:bg-surface-50 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      <LogModal log={selectedLog} onClose={() => setSelectedLog(null)} />
    </>
  )
}

// ── Login Activity Tab ────────────────────────────────────────────────────────
const LoginActivity = () => {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const PAGE_SIZE = 20

  const fetchLogs = useCallback(async (p = 1) => {
    try {
      setLoading(true)
      const res = await auditService.getLoginActivity({ page: p, page_size: PAGE_SIZE })
      setLogs(res.data || [])
      setTotal(res.total || 0)
    } catch { /* non-critical */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchLogs(page) }, [fetchLogs, page])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="bg-white rounded-xl shadow-sm border border-surface-200 overflow-hidden">
      {/* Summary bar */}
      <div className="px-5 py-3 border-b border-surface-100 flex items-center justify-between">
        <p className="text-sm text-surface-500">{total > 0 ? `${total} login records` : 'No records'}</p>
        <button onClick={() => fetchLogs(page)} className="p-1.5 hover:bg-surface-100 rounded-lg text-surface-400">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-surface-50 border-b border-surface-200">
            <tr>
              <th className="text-left px-5 py-3 text-xs font-semibold text-surface-500 uppercase tracking-wider">User</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-surface-500 uppercase tracking-wider">Role</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-surface-500 uppercase tracking-wider">Status</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-surface-500 uppercase tracking-wider">Login Time (IST)</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-surface-500 uppercase tracking-wider">IP Address</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-100">
            {loading ? (
              [...Array(8)].map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td className="px-5 py-4"><div className="flex items-center gap-2"><div className="w-7 h-7 bg-surface-200 rounded-full" /><div className="h-4 w-28 bg-surface-200 rounded" /></div></td>
                  <td className="px-5 py-4"><div className="h-4 w-20 bg-surface-200 rounded" /></td>
                  <td className="px-5 py-4"><div className="h-5 w-16 bg-surface-200 rounded-full" /></td>
                  <td className="px-5 py-4"><div className="h-4 w-36 bg-surface-200 rounded" /></td>
                  <td className="px-5 py-4"><div className="h-4 w-28 bg-surface-200 rounded" /></td>
                </tr>
              ))
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-16 text-center">
                  <LogIn className="w-10 h-10 text-surface-300 mx-auto mb-3" />
                  <p className="text-surface-500 font-medium">No login activity found</p>
                </td>
              </tr>
            ) : (
              logs.map(log => {
                const displayName = log.full_name || log.username || log.email || '—'
                const isSuccess   = !log.status || log.status === 'success'
                return (
                  <tr key={log.id} className="hover:bg-surface-50 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <UserAvatar name={displayName} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-surface-900 truncate">{displayName}</p>
                          {log.email && log.full_name && (
                            <p className="text-xs text-surface-400 truncate">{log.email}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-sm text-surface-600 capitalize">{log.role || '—'}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1.5">
                        {isSuccess
                          ? <CheckCircle className="w-3.5 h-3.5 text-success-500" />
                          : <XCircle    className="w-3.5 h-3.5 text-danger-500"   />}
                        <span className={`text-xs font-semibold ${isSuccess ? 'text-success-600' : 'text-danger-600'}`}>
                          {isSuccess ? 'Success' : 'Failed'}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <p className="text-sm text-surface-600">
                        {log.login_time ? formatDateTime(log.login_time) : '—'}
                      </p>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-sm text-surface-500 font-mono">{log.ip_address || '—'}</span>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="px-5 py-4 border-t border-surface-100 flex items-center justify-between">
          <p className="text-sm text-surface-500">Page {page} of {totalPages} &nbsp;·&nbsp; {total} records</p>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => p - 1)} disabled={page === 1} className="p-2 border border-surface-200 rounded-lg disabled:opacity-40 hover:bg-surface-50 transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button onClick={() => setPage(p => p + 1)} disabled={page === totalPages} className="p-2 border border-surface-200 rounded-lg disabled:opacity-40 hover:bg-surface-50 transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
const TABS = [
  { key: 'system', label: 'System Activity', icon: Activity },
  { key: 'login',  label: 'Login Activity',  icon: LogIn   },
]

const AuditLogs = () => {
  const [activeTab, setActiveTab] = useState('system')

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Audit Logs</h1>
          <p className="text-surface-500 mt-0.5">Track all system activities and login events · Timestamps shown in IST</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="px-3 py-1.5 bg-surface-100 rounded-lg text-xs text-surface-500 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            All times in IST (Asia/Kolkata)
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-surface-100 p-1 rounded-xl w-fit">
        {TABS.map(tab => {
          const Icon = tab.icon
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.key
                  ? 'bg-white text-surface-900 shadow-sm'
                  : 'text-surface-500 hover:text-surface-700'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {activeTab === 'system' ? <SystemActivity /> : <LoginActivity />}
    </div>
  )
}

export default AuditLogs
