import React, { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Building2, Plus, Search, Filter,
  Edit, Trash2, Eye, Phone, Mail, MapPin, Briefcase, Download, Upload,
  List, LayoutGrid
} from 'lucide-react'
import { toast } from 'react-hot-toast'
import clientService from '../../services/clientService'
import usePermissions from '../../hooks/usePermissions'
import { formatDate } from '../../utils/format'
import ExportModal from '../../components/common/ExportModal'
import ClientImportModal from '../../components/common/ClientImportModal'
import { SkeletonTableRows, SkeletonCards } from '../../components/common/SkeletonLoader'
import TableScroll from '../../components/common/TableScroll'

const _dropdownCache = { statuses: null, types: null }

const STATUS_STYLES = {
  active:      { background: 'rgba(67,233,123,0.15)',  color: '#43E97B' },
  inactive:    { background: 'rgba(139,143,168,0.15)', color: '#8B8FA8' },
  on_hold:     { background: 'rgba(245,158,11,0.15)',  color: '#F59E0B' },
  blacklisted: { background: 'rgba(255,71,87,0.15)',   color: '#FF4757' },
  rejected:    { background: 'rgba(255,71,87,0.15)',   color: '#FF4757' },
}

const TYPE_STYLES = {
  direct:      { background: 'rgba(79,172,254,0.15)',  color: '#4FACFE' },
  vendor:      { background: 'rgba(156,99,255,0.15)', color: '#9C63FF' },
  recruitment: { background: 'rgba(108,99,255,0.15)', color: '#6C63FF' },
}

const getStatusStyle = (s) => STATUS_STYLES[s] || STATUS_STYLES.inactive
const getTypeStyle   = (t) => TYPE_STYLES[t]   || { background: 'var(--bg-hover)', color: 'var(--text-muted)' }

const Clients = () => {
  const navigate = useNavigate()
  const { has } = usePermissions()
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 0 })
  const [filters, setFilters] = useState({ search: '', status: '', client_type: '', city: '' })
  const [activeTab, setActiveTab] = useState('all')
  const [showFilters, setShowFilters] = useState(false)
  const [statuses, setStatuses] = useState([])
  const [types, setTypes] = useState([])
  const [exportOpen, setExportOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [viewMode, setViewMode] = useState('table')
  const _debounceTimer = useRef(null)
  const _prevSearch = useRef(filters.search)

  useEffect(() => { loadDropdowns() }, [])

  useEffect(() => {
    if (_debounceTimer.current) clearTimeout(_debounceTimer.current)
    const searchChanged = filters.search !== _prevSearch.current
    _prevSearch.current = filters.search
    const delay = searchChanged ? 400 : 0
    _debounceTimer.current = setTimeout(() => { loadClients() }, delay)
    return () => clearTimeout(_debounceTimer.current)
  }, [pagination.page, filters, activeTab]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadDropdowns = async () => {
    if (_dropdownCache.statuses) {
      setStatuses(_dropdownCache.statuses)
      setTypes(_dropdownCache.types)
      return
    }
    try {
      const [statusRes, typeRes] = await Promise.all([
        clientService.getStatuses(),
        clientService.getTypes()
      ])
      _dropdownCache.statuses = statusRes.data || []
      _dropdownCache.types    = typeRes.data || []
      setStatuses(_dropdownCache.statuses)
      setTypes(_dropdownCache.types)
    } catch (error) {
      console.error('Error loading dropdowns:', error)
    }
  }

  const loadClients = async () => {
    try {
      setLoading(true)
      const params = {
        page: pagination.page,
        page_size: 20,
        ...Object.fromEntries(Object.entries(filters).filter(([_, v]) => v))
      }
      if (activeTab === 'active') params.status = 'active'
      if (activeTab === 'rejected') params.status = 'rejected'
      const response = await clientService.getClients(params)
      setClients(response.data || [])
      setPagination(prev => ({
        ...prev,
        total: response.pagination?.total || 0,
        totalPages: response.pagination?.total_pages || 0
      }))
    } catch {
      toast.error('Failed to load clients')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (clientId, clientName) => {
    if (!confirm(`Are you sure you want to delete "${clientName}"?`)) return
    try {
      await clientService.deleteClient(clientId)
      toast.success('Client deleted successfully')
      loadClients()
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete client')
    }
  }

  return (
    <div className="p-6 page-enter">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-heading)' }}>Clients</h1>
          <p style={{ color: 'var(--text-muted)' }}>Manage hiring companies and vendors</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {has('exports:create') && (
            <button onClick={() => setExportOpen(true)} className="btn-secondary flex items-center gap-2">
              <Download className="w-4 h-4" />
              Export
            </button>
          )}
          {has('clients:create') && (
            <button onClick={() => setImportOpen(true)} className="btn-secondary flex items-center gap-2">
              <Upload className="w-4 h-4" />
              Import
            </button>
          )}
          {has('clients:create') && (
            <Link to="/clients/new" className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Add Client
            </Link>
          )}
        </div>
      </div>

      {/* Tabs + View Toggle */}
      <div className="flex items-center justify-between mb-6" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="flex gap-1">
          {[['all', 'All'], ['active', 'Active'], ['rejected', 'Rejected']].map(([key, label]) => (
            <button
              key={key}
              onClick={() => { setActiveTab(key); setPagination(p => ({ ...p, page: 1 })) }}
              className="px-4 py-2 text-sm font-medium border-b-2 transition-colors"
              style={activeTab === key
                ? { borderColor: 'var(--accent)', color: 'var(--accent)', marginBottom: '-1px' }
                : { borderColor: 'transparent', color: 'var(--text-muted)' }
              }
            >
              {label}
            </button>
          ))}
        </div>
        <div
          className="flex items-center rounded-lg p-1 mb-1"
          style={{ border: '1px solid var(--border)', background: 'var(--bg-card-alt)' }}
        >
          <button
            onClick={() => setViewMode('table')}
            className="p-1.5 rounded-md transition-colors"
            style={viewMode === 'table' ? { background: 'var(--accent)', color: '#fff' } : { color: 'var(--text-muted)' }}
            title="Table view"
          >
            <List className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('card')}
            className="p-1.5 rounded-md transition-colors"
            style={viewMode === 'card' ? { background: 'var(--accent)', color: '#fff' } : { color: 'var(--text-muted)' }}
            title="Card view"
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="rounded-xl p-4 mb-6" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="Search clients..."
                value={filters.search}
                onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                className="input pl-10 w-full"
              />
            </div>
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="btn-secondary flex items-center gap-2"
            style={showFilters ? { background: 'var(--bg-active)', color: 'var(--accent)' } : {}}
          >
            <Filter className="w-4 h-4" />
            Filters
          </button>
        </div>

        {showFilters && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
            <select
              value={filters.status}
              onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
              className="input"
            >
              <option value="">All Statuses</option>
              {statuses.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <select
              value={filters.client_type}
              onChange={(e) => setFilters(prev => ({ ...prev, client_type: e.target.value }))}
              className="input"
            >
              <option value="">All Types</option>
              {types.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <input
              type="text"
              placeholder="Filter by city..."
              value={filters.city}
              onChange={(e) => setFilters(prev => ({ ...prev, city: e.target.value }))}
              className="input"
            />
          </div>
        )}
      </div>

      {/* Card View */}
      {viewMode === 'card' && (
        <div className="mb-6">
          {loading ? (
            <SkeletonCards count={6} />
          ) : clients.length === 0 ? (
            <div className="p-8 text-center rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
              <Building2 className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--text-disabled)' }} />
              <p style={{ color: 'var(--text-muted)' }}>No clients found</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {clients.map(client => (
                <div
                  key={client.id}
                  className="rounded-xl p-4 animate-stagger"
                  style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-card)',
                    transition: 'transform 0.18s ease, box-shadow 0.18s ease',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.transform = 'translateY(-2px)'
                    e.currentTarget.style.boxShadow = 'var(--shadow-elevated)'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.transform = ''
                    e.currentTarget.style.boxShadow = ''
                  }}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center"
                        style={{ background: 'var(--accent-light)' }}
                      >
                        <Building2 className="w-5 h-5" style={{ color: 'var(--accent)' }} />
                      </div>
                      <div>
                        <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>{client.name}</p>
                        {client.code && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{client.code}</p>}
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0" style={getStatusStyle(client.status)}>
                      {client.status?.replace('_', ' ')}
                    </span>
                  </div>

                  <div className="space-y-1.5 mb-3">
                    <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium" style={getTypeStyle(client.client_type)}>
                      {client.client_type?.replace('_', ' ')}
                    </span>
                    {(client.city || client.state) && (
                      <div className="flex items-center gap-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
                        <MapPin className="w-3 h-3" />
                        {client.city && client.state ? `${client.city}, ${client.state}` : client.city || client.state}
                      </div>
                    )}
                    <div className="flex items-center gap-1 text-sm">
                      <Briefcase className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
                      <span style={{ color: 'var(--text-primary)' }}>{client.active_jobs || 0}</span>
                      <span style={{ color: 'var(--text-muted)' }}>active jobs</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-1 pt-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                    <button
                      onClick={() => navigate(`/clients/${client.id}`)}
                      className="p-2 rounded-lg transition-colors"
                      style={{ color: 'var(--text-muted)' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                      onMouseLeave={e => e.currentTarget.style.background = ''}
                      title="View"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    {has('clients:edit') && (
                      <button
                        onClick={() => navigate(`/clients/${client.id}/edit`)}
                        className="p-2 rounded-lg transition-colors"
                        style={{ color: 'var(--text-muted)' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                        onMouseLeave={e => e.currentTarget.style.background = ''}
                        title="Edit"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                    )}
                    {has('clients:delete') && (
                      <button
                        onClick={() => handleDelete(client.id, client.name)}
                        className="p-2 rounded-lg transition-colors"
                        style={{ color: '#FF4757' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,71,87,0.10)'}
                        onMouseLeave={e => e.currentTarget.style.background = ''}
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Table View */}
      {viewMode === 'table' && (
        <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
          {loading ? (
            <SkeletonTableRows rows={8} cols={6} />
          ) : clients.length === 0 ? (
            <div className="p-8 text-center">
              <Building2 className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--text-disabled)' }} />
              <p style={{ color: 'var(--text-muted)' }}>No clients found</p>
            </div>
          ) : (
            <TableScroll>
            <table className="w-full">
              <thead style={{ background: 'var(--bg-card-alt)', borderBottom: '1px solid var(--border)' }}>
                <tr>
                  <th className="text-left px-4 py-3 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Client</th>
                  <th className="text-left px-4 py-3 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Type</th>
                  <th className="text-left px-4 py-3 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Location</th>
                  {activeTab !== 'rejected' && (
                    <th className="text-left px-4 py-3 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Jobs</th>
                  )}
                  {activeTab === 'rejected' && (
                    <>
                      <th className="text-left px-4 py-3 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Rejection Reason</th>
                      <th className="text-left px-4 py-3 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Rejected On</th>
                    </>
                  )}
                  <th className="text-left px-4 py-3 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Status</th>
                  <th className="text-right px-4 py-3 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {clients.map(client => (
                  <tr
                    key={client.id}
                    className="transition-colors cursor-pointer"
                    style={{ borderBottom: '1px solid var(--border-subtle)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}
                    onClick={() => navigate(`/clients/${client.id}`)}
                  >
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ background: 'var(--accent-light)' }}
                        >
                          <Building2 className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                        </div>
                        <div>
                          <p className="font-medium" style={{ color: 'var(--text-primary)' }}>{client.name}</p>
                          {client.code && (
                            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{client.code}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={getTypeStyle(client.client_type)}>
                        {client.client_type?.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      {(client.city || client.state) ? (
                        <div className="flex items-center gap-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
                          <MapPin className="w-3 h-3" />
                          {client.city && client.state ? `${client.city}, ${client.state}` : client.city || client.state}
                        </div>
                      ) : <span style={{ color: 'var(--text-disabled)' }}>—</span>}
                    </td>
                    {activeTab !== 'rejected' && (
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-1 text-sm">
                          <Briefcase className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
                          <span style={{ color: 'var(--text-primary)' }}>{client.active_jobs || 0}</span>
                          <span style={{ color: 'var(--text-muted)' }}>active</span>
                        </div>
                      </td>
                    )}
                    {activeTab === 'rejected' && (
                      <>
                        <td className="px-4 py-4">
                          <span
                            className="text-xs px-2 py-0.5 rounded-full"
                            style={{ background: 'rgba(255,71,87,0.10)', color: '#FF4757' }}
                          >
                            {client.rejection_reason || 'Not specified'}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-sm" style={{ color: 'var(--text-muted)' }}>
                          {formatDate(client.rejected_at)}
                        </td>
                      </>
                    )}
                    <td className="px-4 py-4">
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={getStatusStyle(client.status)}>
                        {client.status?.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-4" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => navigate(`/clients/${client.id}`)}
                          className="p-2 rounded-lg transition-colors"
                          style={{ color: 'var(--text-muted)' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                          onMouseLeave={e => e.currentTarget.style.background = ''}
                          title="View"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {has('clients:edit') && (
                          <button
                            onClick={() => navigate(`/clients/${client.id}/edit`)}
                            className="p-2 rounded-lg transition-colors"
                            style={{ color: 'var(--text-muted)' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                            onMouseLeave={e => e.currentTarget.style.background = ''}
                            title="Edit"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                        )}
                        {has('clients:delete') && (
                          <button
                            onClick={() => handleDelete(client.id, client.name)}
                            className="p-2 rounded-lg transition-colors"
                            style={{ color: '#FF4757' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,71,87,0.10)'}
                            onMouseLeave={e => e.currentTarget.style.background = ''}
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </TableScroll>
          )}

          {/* Pagination */}
          {!loading && pagination.totalPages > 1 && (
            <div className="px-4 py-3 flex items-center justify-between" style={{ borderTop: '1px solid var(--border)' }}>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                Showing {clients.length} of {pagination.total} clients
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                  disabled={pagination.page === 1}
                  className="btn-secondary text-sm disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                  disabled={pagination.page === pagination.totalPages}
                  className="btn-secondary text-sm disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Card view pagination */}
      {viewMode === 'card' && !loading && pagination.totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Showing {clients.length} of {pagination.total} clients
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
              disabled={pagination.page === 1}
              className="btn-secondary text-sm disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
              disabled={pagination.page === pagination.totalPages}
              className="btn-secondary text-sm disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}

      <ExportModal
        isOpen={exportOpen}
        onClose={() => setExportOpen(false)}
        title="Export Clients"
        apiPath="/export/clients"
        extraFilters={({ status, setStatus }) => (
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-label)' }}>Status</label>
            <select value={status} onChange={e => setStatus(e.target.value)} className="input w-full">
              <option value="">All Statuses</option>
              {statuses.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
        )}
      />

      {importOpen && (
        <ClientImportModal
          onClose={() => setImportOpen(false)}
          onImported={() => {
            loadClients()
            toast.success('Clients imported successfully!')
          }}
        />
      )}
    </div>
  )
}

export default Clients
