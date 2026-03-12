import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Building2, Plus, Search, Filter, MoreVertical,
  Edit, Trash2, Eye, Phone, Mail, MapPin, Briefcase
} from 'lucide-react'
import { toast } from 'react-hot-toast'
import clientService from '../../services/clientService'
import usePermissions from '../../hooks/usePermissions'

const Clients = () => {
  const navigate = useNavigate()
  const { has } = usePermissions()
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 0 })
  const [filters, setFilters] = useState({
    search: '',
    status: '',
    client_type: '',
    city: ''
  })
  const [activeTab, setActiveTab] = useState('all')
  const [showFilters, setShowFilters] = useState(false)
  const [statuses, setStatuses] = useState([])
  const [types, setTypes] = useState([])

  useEffect(() => {
    loadClients()
    loadDropdowns()
  }, [pagination.page, filters, activeTab])

  const loadDropdowns = async () => {
    try {
      const [statusRes, typeRes] = await Promise.all([
        clientService.getStatuses(),
        clientService.getTypes()
      ])
      setStatuses(statusRes.data || [])
      setTypes(typeRes.data || [])
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
    } catch (error) {
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

  const getStatusBadge = (status) => {
    const colors = {
      active: 'bg-green-100 text-green-800',
      inactive: 'bg-gray-100 text-gray-800',
      on_hold: 'bg-yellow-100 text-yellow-800',
      blacklisted: 'bg-red-100 text-red-800',
      rejected: 'bg-red-200 text-red-900'
    }
    return colors[status] || 'bg-gray-100 text-gray-800'
  }

  const getTypeBadge = (type) => {
    const colors = {
      direct: 'bg-blue-100 text-blue-800',
      vendor: 'bg-purple-100 text-purple-800',
      recruitment: 'bg-indigo-100 text-indigo-800'
    }
    return colors[type] || 'bg-gray-100 text-gray-800'
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Clients</h1>
          <p className="text-surface-500">Manage hiring companies and vendors</p>
        </div>
        {has('clients:create') && (
          <Link
            to="/clients/new"
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Client
          </Link>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-surface-200">
        {[['all', 'All'], ['active', 'Active'], ['rejected', 'Rejected']].map(([key, label]) => (
          <button
            key={key}
            onClick={() => { setActiveTab(key); setPagination(p => ({ ...p, page: 1 })) }}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === key
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-surface-500 hover:text-surface-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Search & Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-surface-200 p-4 mb-6">
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
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
            className={`btn-secondary flex items-center gap-2 ${showFilters ? 'bg-surface-100' : ''}`}
          >
            <Filter className="w-4 h-4" />
            Filters
          </button>
        </div>

        {showFilters && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 pt-4 border-t border-surface-200">
            <select
              value={filters.status}
              onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
              className="input"
            >
              <option value="">All Statuses</option>
              {statuses.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            
            <select
              value={filters.client_type}
              onChange={(e) => setFilters(prev => ({ ...prev, client_type: e.target.value }))}
              className="input"
            >
              <option value="">All Types</option>
              {types.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
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

      {/* Clients Table */}
      <div className="bg-white rounded-xl shadow-sm border border-surface-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full mx-auto"></div>
            <p className="mt-2 text-surface-500">Loading clients...</p>
          </div>
        ) : clients.length === 0 ? (
          <div className="p-8 text-center">
            <Building2 className="w-12 h-12 text-surface-300 mx-auto mb-4" />
            <p className="text-surface-500">No clients found</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-surface-50 border-b border-surface-200">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium text-surface-600">Client</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-surface-600">Type</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-surface-600">Location</th>
                {activeTab !== 'rejected' && (
                  <th className="text-left px-4 py-3 text-sm font-medium text-surface-600">Jobs</th>
                )}
                {activeTab === 'rejected' && (
                  <>
                    <th className="text-left px-4 py-3 text-sm font-medium text-surface-600">Rejection Reason</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-surface-600">Rejected On</th>
                  </>
                )}
                <th className="text-left px-4 py-3 text-sm font-medium text-surface-600">Status</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-surface-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {clients.map(client => (
                <tr key={client.id} className="hover:bg-surface-50 transition-colors">
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary-100 flex items-center justify-center">
                        <Building2 className="w-5 h-5 text-primary-600" />
                      </div>
                      <div>
                        <p className="font-medium text-surface-900">{client.name}</p>
                        {client.code && (
                          <p className="text-sm text-surface-500">{client.code}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getTypeBadge(client.client_type)}`}>
                      {client.client_type?.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    {client.city && (
                      <div className="flex items-center gap-1 text-sm text-surface-600">
                        <MapPin className="w-3 h-3" />
                        {client.city}
                      </div>
                    )}
                  </td>
                  {activeTab !== 'rejected' && (
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-1 text-sm">
                        <Briefcase className="w-3 h-3 text-surface-400" />
                        <span className="text-surface-900">{client.active_jobs || 0}</span>
                        <span className="text-surface-400">active</span>
                      </div>
                    </td>
                  )}
                  {activeTab === 'rejected' && (
                    <>
                      <td className="px-4 py-4">
                        <span className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded-full">
                          {client.rejection_reason || 'Not specified'}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-sm text-surface-500">
                        {client.rejected_at ? new Date(client.rejected_at).toLocaleDateString() : '-'}
                      </td>
                    </>
                  )}
                  <td className="px-4 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadge(client.status)}`}>
                      {client.status?.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => navigate(`/clients/${client.id}`)}
                        className="p-2 hover:bg-surface-100 rounded-lg transition-colors"
                        title="View"
                      >
                        <Eye className="w-4 h-4 text-surface-500" />
                      </button>
                      {has('clients:edit') && (
                        <button
                          onClick={() => navigate(`/clients/${client.id}/edit`)}
                          className="p-2 hover:bg-surface-100 rounded-lg transition-colors"
                          title="Edit"
                        >
                          <Edit className="w-4 h-4 text-surface-500" />
                        </button>
                      )}
                      {has('clients:delete') && (
                        <button
                          onClick={() => handleDelete(client.id, client.name)}
                          className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="px-4 py-3 border-t border-surface-200 flex items-center justify-between">
            <p className="text-sm text-surface-500">
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
    </div>
  )
}

export default Clients