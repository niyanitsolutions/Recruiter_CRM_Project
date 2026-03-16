import React, { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import usePermissions from '../../hooks/usePermissions'
import {
  UserCheck,
  Trash2,
  Eye,
  ChevronLeft,
  ChevronRight,
  Search,
  Users,
} from 'lucide-react'
import userService from '../../services/userService'
import toast from 'react-hot-toast'

// Status Badge
const StatusBadge = ({ status }) => {
  const classes = {
    active:    'bg-green-100 text-green-700',
    inactive:  'bg-surface-100 text-surface-600',
    suspended: 'bg-red-100 text-red-700',
    pending:   'bg-yellow-100 text-yellow-700',
  }
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${classes[status] || classes.inactive}`}>
      {status}
    </span>
  )
}

// Confirm Dialog
const ConfirmDialog = ({ isOpen, title, message, onConfirm, onCancel, confirmText = 'Confirm', danger = false }) => {
  if (!isOpen) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onCancel} />
      <div className="relative bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
        <h3 className="text-lg font-semibold text-surface-900">{title}</h3>
        <p className="mt-2 text-surface-600">{message}</p>
        <div className="mt-6 flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-surface-700 hover:bg-surface-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 rounded-lg text-white transition-colors ${
              danger ? 'bg-red-600 hover:bg-red-700' : 'bg-accent-600 hover:bg-accent-700'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}

const InactiveUsers = () => {
  const { has } = usePermissions()
  const [users,      setUsers]      = useState([])
  const [loading,    setLoading]    = useState(true)
  const [search,     setSearch]     = useState('')
  const [page,       setPage]       = useState(1)
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 })

  const [activateDialog, setActivateDialog] = useState({ open: false, user: null })
  const [deleteDialog,   setDeleteDialog]   = useState({ open: false, user: null })

  const PAGE_SIZE = 10

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true)
      const response = await userService.getUsers({
        page,
        page_size: PAGE_SIZE,
        status: 'inactive',
        search: search || undefined,
      })
      setUsers(response.data || [])
      setPagination(response.pagination || { total: 0, totalPages: 1 })
    } catch (err) {
      console.error('Failed to fetch inactive users:', err)
    } finally {
      setLoading(false)
    }
  }, [page, search])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  // Reset page when search changes
  const handleSearch = (e) => {
    setSearch(e.target.value)
    setPage(1)
  }

  const handleActivate = async () => {
    try {
      await userService.updateUserStatus(activateDialog.user.id, 'active')
      toast.success(`${activateDialog.user.full_name} has been activated.`)
      setActivateDialog({ open: false, user: null })
      fetchUsers()
    } catch (err) {
      toast.error('Failed to activate user.')
      console.error(err)
    }
  }

  const handleDelete = async () => {
    try {
      await userService.deleteUser(deleteDialog.user.id)
      toast.success(`${deleteDialog.user.full_name} has been deleted.`)
      setDeleteDialog({ open: false, user: null })
      fetchUsers()
    } catch (err) {
      toast.error('Failed to delete user.')
      console.error(err)
    }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Inactive Users</h1>
          <p className="text-surface-500 mt-1">
            Users with inactive status — activate or remove them.
          </p>
        </div>
        <Link
          to="/users"
          className="text-sm text-accent-600 hover:text-accent-700 font-medium"
        >
          ← All Users
        </Link>
      </div>

      {/* Search */}
      <div className="bg-white rounded-xl border border-surface-200 p-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
          <input
            type="text"
            placeholder="Search inactive users…"
            value={search}
            onChange={handleSearch}
            className="w-full pl-9 pr-4 py-2 border border-surface-200 rounded-lg text-sm focus:ring-2 focus:ring-accent-500 focus:border-accent-500"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-surface-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <div className="w-8 h-8 border-4 border-accent-500 border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        ) : users.length === 0 ? (
          <div className="p-12 text-center">
            <Users className="w-12 h-12 text-surface-300 mx-auto mb-3" />
            <p className="text-surface-500 font-medium">No inactive users found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-surface-50 border-b border-surface-200">
                  <th className="text-left px-6 py-3 text-xs font-medium text-surface-500 uppercase tracking-wide">Name</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-surface-500 uppercase tracking-wide">Email</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-surface-500 uppercase tracking-wide">Role</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-surface-500 uppercase tracking-wide">Status</th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-surface-500 uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {users.map(user => (
                  <tr key={user.id} className="hover:bg-surface-50 transition-colors">
                    <td className="px-6 py-4">
                      <div>
                        <p className="text-sm font-medium text-surface-900">{user.full_name}</p>
                        <p className="text-xs text-surface-500">@{user.username}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-surface-700">{user.email}</td>
                    <td className="px-6 py-4 text-sm text-surface-700 capitalize">
                      {user.role_name || user.role?.replace(/_/g, ' ')}
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={user.status} />
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          to={`/users/${user.id}`}
                          className="p-1.5 text-surface-500 hover:text-surface-700 hover:bg-surface-100 rounded-lg transition-colors"
                          title="View details"
                        >
                          <Eye className="w-4 h-4" />
                        </Link>
                        {has('users:edit') && (
                          <button
                            onClick={() => setActivateDialog({ open: true, user })}
                            className="p-1.5 text-green-600 hover:text-green-700 hover:bg-green-50 rounded-lg transition-colors"
                            title="Activate user"
                          >
                            <UserCheck className="w-4 h-4" />
                          </button>
                        )}
                        {has('users:delete') && !user.is_owner && (
                          <button
                            onClick={() => setDeleteDialog({ open: true, user })}
                            className="p-1.5 text-red-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete user"
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
          </div>
        )}

        {/* Pagination */}
        {!loading && pagination.totalPages > 1 && (
          <div className="px-6 py-4 border-t border-surface-200 flex items-center justify-between">
            <p className="text-sm text-surface-500">
              Showing {users.length} of {pagination.total} users
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded-lg border border-surface-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-surface-50 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm text-surface-700">
                {page} / {pagination.totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
                disabled={page === pagination.totalPages}
                className="p-1.5 rounded-lg border border-surface-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-surface-50 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Activate dialog */}
      <ConfirmDialog
        isOpen={activateDialog.open}
        title="Activate User"
        message={`Activate ${activateDialog.user?.full_name}? They will regain access to the system.`}
        onConfirm={handleActivate}
        onCancel={() => setActivateDialog({ open: false, user: null })}
        confirmText="Activate"
      />

      {/* Delete dialog */}
      <ConfirmDialog
        isOpen={deleteDialog.open}
        title="Delete User"
        message={`Permanently delete ${deleteDialog.user?.full_name}? This action cannot be undone.`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteDialog({ open: false, user: null })}
        confirmText="Delete"
        danger
      />
    </div>
  )
}

export default InactiveUsers
