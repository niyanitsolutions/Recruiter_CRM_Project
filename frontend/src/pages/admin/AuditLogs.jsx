import React, { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Search, Filter, ChevronLeft, ChevronRight, Eye, X, Activity, LogIn } from 'lucide-react'
import auditService from '../../services/auditService'

/* ─────────────────────────────────────────────
   System Activity Tab
───────────────────────────────────────────── */
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
    search: searchParams.get('search') || '',
    action: searchParams.get('action') || '',
    entity_type: searchParams.get('entity_type') || '',
  })

  useEffect(() => {
    const fetchDropdowns = async () => {
      try {
        const [actionsRes, typesRes] = await Promise.all([
          auditService.getAvailableActions(),
          auditService.getAvailableEntityTypes()
        ])
        setActions(actionsRes.data || [])
        setEntityTypes(typesRes.data || [])
      } catch (err) { console.error(err) }
    }
    fetchDropdowns()
  }, [])

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true)
      const params = {
        page: parseInt(searchParams.get('page') || '1'),
        page_size: 20,
        search: searchParams.get('search') || undefined,
        action: searchParams.get('action') || undefined,
        entity_type: searchParams.get('entity_type') || undefined,
      }
      const response = await auditService.getAuditLogs(params)
      setLogs(response.data || [])
      setPagination(response.pagination || { page: 1, total: 0, totalPages: 0 })
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }, [searchParams])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  const applyFilters = () => {
    const params = new URLSearchParams()
    if (filters.search) params.set('search', filters.search)
    if (filters.action) params.set('action', filters.action)
    if (filters.entity_type) params.set('entity_type', filters.entity_type)
    params.set('page', '1')
    setSearchParams(params)
  }

  const clearFilters = () => {
    setFilters({ search: '', action: '', entity_type: '' })
    setSearchParams(new URLSearchParams())
  }

  const handlePageChange = (newPage) => {
    const params = new URLSearchParams(searchParams)
    params.set('page', newPage.toString())
    setSearchParams(params)
  }

  const getActionColor = (action) => {
    const colors = {
      create: 'bg-green-100 text-green-700',
      update: 'bg-blue-100 text-blue-700',
      delete: 'bg-red-100 text-red-700',
      login: 'bg-purple-100 text-purple-700',
      logout: 'bg-surface-100 text-surface-700',
    }
    return colors[action] || 'bg-surface-100 text-surface-700'
  }

  return (
    <>
      {/* Search & Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-surface-100 p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
            <input type="text" value={filters.search} onChange={(e) => setFilters(f => ({ ...f, search: e.target.value }))}
              onKeyDown={(e) => e.key === 'Enter' && applyFilters()} placeholder="Search logs..."
              className="w-full pl-10 pr-4 py-2 border border-surface-300 rounded-lg" />
          </div>
          <button onClick={() => setShowFilters(!showFilters)} className="flex items-center gap-2 px-4 py-2 border border-surface-300 rounded-lg hover:bg-surface-50">
            <Filter className="w-4 h-4" /> Filters
          </button>
          <button onClick={applyFilters} className="px-4 py-2 bg-accent-600 text-white rounded-lg">Search</button>
        </div>

        {showFilters && (
          <div className="mt-4 pt-4 border-t grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">Action</label>
              <select value={filters.action} onChange={(e) => setFilters(f => ({ ...f, action: e.target.value }))}
                className="w-full px-3 py-2 border border-surface-300 rounded-lg">
                <option value="">All Actions</option>
                {actions.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">Entity Type</label>
              <select value={filters.entity_type} onChange={(e) => setFilters(f => ({ ...f, entity_type: e.target.value }))}
                className="w-full px-3 py-2 border border-surface-300 rounded-lg">
                <option value="">All Types</option>
                {entityTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            {(filters.search || filters.action || filters.entity_type) && (
              <button onClick={clearFilters} className="flex items-center gap-1 text-sm text-surface-600 hover:text-surface-900">
                <X className="w-4 h-4" /> Clear filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* Logs Table */}
      <div className="bg-white rounded-xl shadow-sm border border-surface-100 overflow-hidden">
        <table className="w-full">
          <thead className="bg-surface-50 border-b">
            <tr>
              <th className="text-left px-6 py-3 text-xs font-semibold text-surface-600 uppercase">Action</th>
              <th className="text-left px-6 py-3 text-xs font-semibold text-surface-600 uppercase">Module</th>
              <th className="text-left px-6 py-3 text-xs font-semibold text-surface-600 uppercase">Description</th>
              <th className="text-left px-6 py-3 text-xs font-semibold text-surface-600 uppercase">User</th>
              <th className="text-left px-6 py-3 text-xs font-semibold text-surface-600 uppercase">Time</th>
              <th className="text-right px-6 py-3 text-xs font-semibold text-surface-600 uppercase">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-100">
            {loading ? (
              <tr><td colSpan={6} className="px-6 py-8 text-center text-surface-500">Loading...</td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={6} className="px-6 py-8 text-center text-surface-500">No logs found</td></tr>
            ) : (
              logs.map(log => (
                <tr key={log.id} className="hover:bg-surface-50">
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${getActionColor(log.action)}`}>
                      {log.action_display || log.action}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-surface-600">{log.entity_type_display || log.entity_type}</td>
                  <td className="px-6 py-4 text-surface-900 max-w-md truncate">{log.description}</td>
                  <td className="px-6 py-4 text-surface-600">{log.user_name}</td>
                  <td className="px-6 py-4 text-surface-500 text-sm">{new Date(log.created_at).toLocaleString()}</td>
                  <td className="px-6 py-4 text-right">
                    <button onClick={() => setSelectedLog(log)} className="p-2 hover:bg-surface-100 rounded-lg">
                      <Eye className="w-4 h-4 text-surface-500" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {pagination.totalPages > 1 && (
          <div className="px-6 py-4 border-t flex items-center justify-between">
            <p className="text-sm text-surface-600">Page {pagination.page} of {pagination.totalPages}</p>
            <div className="flex gap-2">
              <button onClick={() => handlePageChange(pagination.page - 1)} disabled={pagination.page === 1}
                className="p-2 border rounded-lg disabled:opacity-50"><ChevronLeft className="w-4 h-4" /></button>
              <button onClick={() => handlePageChange(pagination.page + 1)} disabled={pagination.page === pagination.totalPages}
                className="p-2 border rounded-lg disabled:opacity-50"><ChevronRight className="w-4 h-4" /></button>
            </div>
          </div>
        )}
      </div>

      {/* Log Details Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setSelectedLog(null)} />
          <div className="relative bg-white rounded-xl p-6 w-full max-w-2xl mx-4 max-h-[80vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">Log Details</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><p className="text-sm text-surface-500">Action</p><p className="font-medium">{selectedLog.action_display}</p></div>
                <div><p className="text-sm text-surface-500">Entity</p><p className="font-medium">{selectedLog.entity_type_display}</p></div>
                <div><p className="text-sm text-surface-500">User</p><p className="font-medium">{selectedLog.user_name}</p></div>
                <div><p className="text-sm text-surface-500">Date</p><p className="font-medium">{new Date(selectedLog.created_at).toLocaleString()}</p></div>
              </div>
              <div><p className="text-sm text-surface-500">Description</p><p className="font-medium">{selectedLog.description}</p></div>
              {selectedLog.changed_fields?.length > 0 && (
                <div><p className="text-sm text-surface-500">Changed Fields</p><p className="font-medium">{selectedLog.changed_fields.join(', ')}</p></div>
              )}
              {selectedLog.ip_address && (
                <div><p className="text-sm text-surface-500">IP Address</p><p className="font-medium">{selectedLog.ip_address}</p></div>
              )}
            </div>
            <button onClick={() => setSelectedLog(null)} className="mt-6 w-full px-4 py-2 border border-surface-300 rounded-lg">Close</button>
          </div>
        </div>
      )}
    </>
  )
}

/* ─────────────────────────────────────────────
   Login Activity Tab
───────────────────────────────────────────── */
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
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchLogs(page) }, [fetchLogs, page])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  const getStatusColor = (status) => {
    if (!status) return 'bg-surface-100 text-surface-600'
    return status === 'success'
      ? 'bg-green-100 text-green-700'
      : 'bg-red-100 text-red-700'
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-surface-100 overflow-hidden">
      <table className="w-full">
        <thead className="bg-surface-50 border-b">
          <tr>
            <th className="text-left px-6 py-3 text-xs font-semibold text-surface-600 uppercase">User</th>
            <th className="text-left px-6 py-3 text-xs font-semibold text-surface-600 uppercase">Role</th>
            <th className="text-left px-6 py-3 text-xs font-semibold text-surface-600 uppercase">Status</th>
            <th className="text-left px-6 py-3 text-xs font-semibold text-surface-600 uppercase">Time</th>
            <th className="text-left px-6 py-3 text-xs font-semibold text-surface-600 uppercase">IP Address</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-100">
          {loading ? (
            <tr><td colSpan={5} className="px-6 py-8 text-center text-surface-500">Loading...</td></tr>
          ) : logs.length === 0 ? (
            <tr><td colSpan={5} className="px-6 py-8 text-center text-surface-500">No login activity found</td></tr>
          ) : (
            logs.map(log => (
              <tr key={log.id} className="hover:bg-surface-50">
                <td className="px-6 py-4">
                  <p className="font-medium text-surface-900">{log.username || log.email || '—'}</p>
                  {log.email && log.username && (
                    <p className="text-xs text-surface-400">{log.email}</p>
                  )}
                </td>
                <td className="px-6 py-4 text-surface-600 capitalize">{log.role || '—'}</td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(log.status)}`}>
                    {log.status || 'success'}
                  </span>
                </td>
                <td className="px-6 py-4 text-surface-500 text-sm">
                  {log.login_time ? new Date(log.login_time).toLocaleString() : '—'}
                </td>
                <td className="px-6 py-4 text-surface-500 font-mono text-sm">{log.ip_address || '—'}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {totalPages > 1 && (
        <div className="px-6 py-4 border-t flex items-center justify-between">
          <p className="text-sm text-surface-600">
            Page {page} of {totalPages} &nbsp;·&nbsp; {total} records
          </p>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => p - 1)} disabled={page === 1}
              className="p-2 border rounded-lg disabled:opacity-50"><ChevronLeft className="w-4 h-4" /></button>
            <button onClick={() => setPage(p => p + 1)} disabled={page === totalPages}
              className="p-2 border rounded-lg disabled:opacity-50"><ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────
   Main Page
───────────────────────────────────────────── */
const TABS = [
  { key: 'system', label: 'System Activity', icon: Activity },
  { key: 'login', label: 'Login Activity', icon: LogIn },
]

const AuditLogs = () => {
  const [activeTab, setActiveTab] = useState('system')

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-surface-900">Audit Logs</h1>
        <p className="text-surface-500 mt-1">Track all activities in the system</p>
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
