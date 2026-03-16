import React, { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import usePermissions from '../../hooks/usePermissions'
import {
  Plus,
  Search,
  Filter,
  MoreVertical,
  Edit,
  Trash2,
  Eye,
  UserCheck,
  UserX,
  Key,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react'
import userService from '../../services/userService'
import departmentService from '../../services/departmentService'
import subscriptionService from '../../services/subscriptionService'
import SeatLimitModal from '../../components/subscription/SeatLimitModal'
import UpgradeSeatsModal from '../../components/subscription/UpgradeSeatsModal'
import SubscriptionBanner from '../../components/subscription/SubscriptionBanner'

// Status Badge Component
const StatusBadge = ({ status }) => {
  const statusClasses = {
    active: 'bg-green-100 text-green-700',
    inactive: 'bg-surface-100 text-surface-600',
    suspended: 'bg-red-100 text-red-700',
    pending: 'bg-yellow-100 text-yellow-700',
  }

  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusClasses[status] || statusClasses.inactive}`}>
      {status}
    </span>
  )
}

// User Actions Dropdown
const UserActions = ({ user, onEdit, onDelete, onStatusChange, onResetPassword }) => {
  const [isOpen, setIsOpen] = useState(false)
  const { has } = usePermissions()

  const canEdit   = has('users:edit')
  const canDelete = has('users:delete')

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 hover:bg-surface-100 rounded-lg transition-colors"
      >
        <MoreVertical className="w-4 h-4 text-surface-500" />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-surface-200 py-1 z-20">
            <Link
              to={`/users/${user.id}`}
              className="flex items-center gap-2 px-4 py-2 text-sm text-surface-700 hover:bg-surface-50"
            >
              <Eye className="w-4 h-4" /> View Details
            </Link>
            {canEdit && (
              <button
                onClick={() => { onEdit(user); setIsOpen(false); }}
                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-surface-700 hover:bg-surface-50"
              >
                <Edit className="w-4 h-4" /> Edit User
              </button>
            )}
            {canEdit && (
              <button
                onClick={() => { onResetPassword(user); setIsOpen(false); }}
                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-surface-700 hover:bg-surface-50"
              >
                <Key className="w-4 h-4" /> Reset Password
              </button>
            )}
            {canEdit && (
              <>
                <hr className="my-1" />
                {user.status === 'active' ? (
                  <button
                    onClick={() => { onStatusChange(user, 'inactive'); setIsOpen(false); }}
                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-yellow-600 hover:bg-yellow-50"
                  >
                    <UserX className="w-4 h-4" /> Deactivate
                  </button>
                ) : (
                  <button
                    onClick={() => { onStatusChange(user, 'active'); setIsOpen(false); }}
                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-green-600 hover:bg-green-50"
                  >
                    <UserCheck className="w-4 h-4" /> Activate
                  </button>
                )}
              </>
            )}
            {canDelete && !user.is_owner && (
              <button
                onClick={() => { onDelete(user); setIsOpen(false); }}
                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
              >
                <Trash2 className="w-4 h-4" /> Delete User
              </button>
            )}
          </div>
        </>
      )}
    </div>
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

// Reset Password Dialog
const ResetPasswordDialog = ({ isOpen, user, onConfirm, onCancel }) => {
  const [password, setPassword] = useState('')
  const [mustChange, setMustChange] = useState(true)

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onCancel} />
      <div className="relative bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
        <h3 className="text-lg font-semibold text-surface-900">Reset Password</h3>
        <p className="mt-2 text-surface-600">Reset password for {user?.full_name}</p>
        
        <div className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">
              New Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-surface-300 rounded-lg focus:ring-2 focus:ring-accent-500 focus:border-accent-500"
              placeholder="Enter new password"
            />
          </div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={mustChange}
              onChange={(e) => setMustChange(e.target.checked)}
              className="rounded border-surface-300 text-accent-600 focus:ring-accent-500"
            />
            <span className="text-sm text-surface-700">Require password change on next login</span>
          </label>
        </div>

        <div className="mt-6 flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-surface-700 hover:bg-surface-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm({ new_password: password, must_change_password: mustChange })}
            disabled={!password || password.length < 8}
            className="px-4 py-2 bg-accent-600 hover:bg-accent-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Reset Password
          </button>
        </div>
      </div>
    </div>
  )
}

const Users = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const { has } = usePermissions()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 0 })

  // Seat / subscription state
  const [seatStatus,       setSeatStatus]       = useState(null)
  const [seatModalOpen,    setSeatModalOpen]    = useState(false)
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false)

  // Filters
  const [search, setSearch] = useState(searchParams.get('search') || '')
  const [roleFilter, setRoleFilter] = useState(searchParams.get('role') || '')
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '')
  const [departmentFilter, setDepartmentFilter] = useState(searchParams.get('department_id') || '')
  const [showFilters, setShowFilters] = useState(false)

  // Dropdown data
  const [roles, setRoles] = useState([])
  const [statuses, setStatuses] = useState([])
  const [departments, setDepartments] = useState([])

  // Dialogs
  const [deleteDialog, setDeleteDialog] = useState({ open: false, user: null })
  const [statusDialog, setStatusDialog] = useState({ open: false, user: null, status: '' })
  const [resetPasswordDialog, setResetPasswordDialog] = useState({ open: false, user: null })

  // Fetch seat status once on mount
  useEffect(() => {
    subscriptionService.getTenantSeatStatus()
      .then(res => setSeatStatus(res.data?.data || null))
      .catch(() => {})
  }, [])

  // Fetch dropdown data
  useEffect(() => {
    const fetchDropdownData = async () => {
      try {
        const [rolesRes, statusesRes, deptsRes] = await Promise.all([
          userService.getAvailableRoles(),
          userService.getAvailableStatuses(),
          departmentService.getDepartments()
        ])
        setRoles(rolesRes.data || [])
        setStatuses(statusesRes.data || [])
        setDepartments(deptsRes.data || [])
      } catch (err) {
        console.error('Failed to fetch dropdown data:', err)
      }
    }
    fetchDropdownData()
  }, [])

  // Guard: check seat limit before navigating to Add User form
  const handleAddUserClick = () => {
    if (seatStatus?.seat_limit_reached) {
      setSeatModalOpen(true)
    } else {
      navigate('/users/new')
    }
  }

  // Fetch users
  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true)
      const params = {
        page: parseInt(searchParams.get('page') || '1'),
        page_size: 10,
        search: searchParams.get('search') || undefined,
        role: searchParams.get('role') || undefined,
        status: searchParams.get('status') || undefined,
        department_id: searchParams.get('department_id') || undefined,
      }
      
      const response = await userService.getUsers(params)
      setUsers(response.data || [])
      setPagination(response.pagination || { page: 1, total: 0, totalPages: 0 })
    } catch (err) {
      console.error('Failed to fetch users:', err)
    } finally {
      setLoading(false)
    }
  }, [searchParams])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  // Apply filters
  const applyFilters = () => {
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (roleFilter) params.set('role', roleFilter)
    if (statusFilter) params.set('status', statusFilter)
    if (departmentFilter) params.set('department_id', departmentFilter)
    params.set('page', '1')
    setSearchParams(params)
  }

  // Clear filters
  const clearFilters = () => {
    setSearch('')
    setRoleFilter('')
    setStatusFilter('')
    setDepartmentFilter('')
    setSearchParams(new URLSearchParams())
  }

  // Handle page change
  const handlePageChange = (newPage) => {
    const params = new URLSearchParams(searchParams)
    params.set('page', newPage.toString())
    setSearchParams(params)
  }

  // Handle delete
  const handleDelete = async () => {
    try {
      await userService.deleteUser(deleteDialog.user.id)
      setDeleteDialog({ open: false, user: null })
      fetchUsers()
    } catch (err) {
      console.error('Failed to delete user:', err)
    }
  }

  // Handle status change
  const handleStatusChange = async () => {
    try {
      await userService.updateUserStatus(statusDialog.user.id, statusDialog.status)
      setStatusDialog({ open: false, user: null, status: '' })
      fetchUsers()
    } catch (err) {
      console.error('Failed to update status:', err)
    }
  }

  // Handle reset password
  const handleResetPassword = async (passwordData) => {
    try {
      await userService.resetUserPassword(resetPasswordDialog.user.id, passwordData)
      setResetPasswordDialog({ open: false, user: null })
    } catch (err) {
      console.error('Failed to reset password:', err)
    }
  }

  const hasFilters = search || roleFilter || statusFilter || departmentFilter

  return (
    <div className="p-6 space-y-6">
      {/* Subscription banner (expiry warning + seat summary) */}
      <SubscriptionBanner
        seatStatus={seatStatus}
        onUpgrade={() => setUpgradeModalOpen(true)}
      />

      {/* Seat limit modal */}
      <SeatLimitModal
        isOpen={seatModalOpen}
        onClose={() => setSeatModalOpen(false)}
        onUpgrade={() => { setSeatModalOpen(false); setUpgradeModalOpen(true) }}
        seatStatus={seatStatus}
      />

      {/* Upgrade seats modal */}
      <UpgradeSeatsModal
        isOpen={upgradeModalOpen}
        onClose={() => setUpgradeModalOpen(false)}
        seatStatus={seatStatus}
      />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Users</h1>
          <p className="text-surface-500 mt-1">Manage your organization's users</p>
        </div>
        {has('users:create') && (
          <button
            onClick={handleAddUserClick}
            disabled={seatStatus?.is_expired}
            title={seatStatus?.seat_limit_reached ? 'User seat limit reached — upgrade to add more' : undefined}
            className="flex items-center gap-2 px-4 py-2 bg-accent-600 hover:bg-accent-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add User
            {seatStatus?.seat_limit_reached && (
              <span className="ml-1 text-xs bg-white/20 px-1.5 py-0.5 rounded">
                {seatStatus.current_active_users}/{seatStatus.total_user_seats}
              </span>
            )}
          </button>
        )}
      </div>

      {/* Search & Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-surface-100 p-4">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
              placeholder="Search by name, email, username..."
              className="w-full pl-10 pr-4 py-2 border border-surface-300 rounded-lg focus:ring-2 focus:ring-accent-500 focus:border-accent-500"
            />
          </div>

          {/* Filter Toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-4 py-2 border rounded-lg transition-colors ${
              hasFilters ? 'border-accent-500 text-accent-600 bg-accent-50' : 'border-surface-300 text-surface-700 hover:bg-surface-50'
            }`}
          >
            <Filter className="w-4 h-4" />
            Filters
            {hasFilters && (
              <span className="w-5 h-5 bg-accent-600 text-white text-xs rounded-full flex items-center justify-center">
                {[roleFilter, statusFilter, departmentFilter].filter(Boolean).length}
              </span>
            )}
          </button>

          <button
            onClick={applyFilters}
            className="px-4 py-2 bg-accent-600 hover:bg-accent-700 text-white rounded-lg transition-colors"
          >
            Search
          </button>
        </div>

        {/* Filter Dropdowns */}
        {showFilters && (
          <div className="mt-4 pt-4 border-t border-surface-200 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">Role</label>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="w-full px-3 py-2 border border-surface-300 rounded-lg focus:ring-2 focus:ring-accent-500 focus:border-accent-500"
              >
                <option value="">All Roles</option>
                {roles.map(role => (
                  <option key={role.value} value={role.value}>{role.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 border border-surface-300 rounded-lg focus:ring-2 focus:ring-accent-500 focus:border-accent-500"
              >
                <option value="">All Statuses</option>
                {statuses.map(status => (
                  <option key={status.value} value={status.value}>{status.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">Department</label>
              <select
                value={departmentFilter}
                onChange={(e) => setDepartmentFilter(e.target.value)}
                className="w-full px-3 py-2 border border-surface-300 rounded-lg focus:ring-2 focus:ring-accent-500 focus:border-accent-500"
              >
                <option value="">All Departments</option>
                {departments.map(dept => (
                  <option key={dept.id} value={dept.id}>{dept.name}</option>
                ))}
              </select>
            </div>
            {hasFilters && (
              <div className="md:col-span-3">
                <button
                  onClick={clearFilters}
                  className="flex items-center gap-1 text-sm text-surface-600 hover:text-surface-900"
                >
                  <X className="w-4 h-4" /> Clear all filters
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-xl shadow-sm border border-surface-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-surface-50 border-b border-surface-200">
              <tr>
                <th className="text-left px-6 py-3 text-xs font-semibold text-surface-600 uppercase tracking-wider">User</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-surface-600 uppercase tracking-wider">Designation</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-surface-600 uppercase tracking-wider">Department</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-surface-600 uppercase tracking-wider">Status</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-surface-600 uppercase tracking-wider">Last Login</th>
                <th className="text-right px-6 py-3 text-xs font-semibold text-surface-600 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-surface-500">
                    Loading...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-surface-500">
                    No users found
                  </td>
                </tr>
              ) : (
                users.map(user => (
                  <tr key={user.id} className="hover:bg-surface-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-accent-100 flex items-center justify-center text-accent-700 font-semibold">
                          {user.full_name?.charAt(0) || 'U'}
                        </div>
                        <div>
                          <p className="font-medium text-surface-900">
                            {user.full_name}
                            {user.is_owner && (
                              <span className="ml-2 px-1.5 py-0.5 bg-yellow-100 text-yellow-700 text-xs rounded">Owner</span>
                            )}
                          </p>
                          <p className="text-sm text-surface-500">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-surface-700">{user.designation || '-'}</span>
                    </td>
                    <td className="px-6 py-4 text-surface-600">
                      {user.department || '-'}
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={user.status} />
                    </td>
                    <td className="px-6 py-4 text-sm text-surface-500">
                      {user.last_login ? new Date(user.last_login).toLocaleDateString() : 'Never'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <UserActions
                        user={user}
                        onEdit={(u) => window.location.href = `/users/${u.id}/edit`}
                        onDelete={(u) => setDeleteDialog({ open: true, user: u })}
                        onStatusChange={(u, status) => setStatusDialog({ open: true, user: u, status })}
                        onResetPassword={(u) => setResetPasswordDialog({ open: true, user: u })}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="px-6 py-4 border-t border-surface-200 flex items-center justify-between">
            <p className="text-sm text-surface-600">
              Showing {((pagination.page - 1) * 10) + 1} to {Math.min(pagination.page * 10, pagination.total)} of {pagination.total} users
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handlePageChange(pagination.page - 1)}
                disabled={pagination.page === 1}
                className="p-2 border border-surface-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-surface-50"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-4 py-2 text-sm">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <button
                onClick={() => handlePageChange(pagination.page + 1)}
                disabled={pagination.page === pagination.totalPages}
                className="p-2 border border-surface-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-surface-50"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Dialogs */}
      <ConfirmDialog
        isOpen={deleteDialog.open}
        title="Delete User"
        message={`Are you sure you want to delete ${deleteDialog.user?.full_name}? This action cannot be undone.`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteDialog({ open: false, user: null })}
        confirmText="Delete"
        danger
      />

      <ConfirmDialog
        isOpen={statusDialog.open}
        title={statusDialog.status === 'active' ? 'Activate User' : 'Deactivate User'}
        message={`Are you sure you want to ${statusDialog.status === 'active' ? 'activate' : 'deactivate'} ${statusDialog.user?.full_name}?`}
        onConfirm={handleStatusChange}
        onCancel={() => setStatusDialog({ open: false, user: null, status: '' })}
        confirmText={statusDialog.status === 'active' ? 'Activate' : 'Deactivate'}
      />

      <ResetPasswordDialog
        isOpen={resetPasswordDialog.open}
        user={resetPasswordDialog.user}
        onConfirm={handleResetPassword}
        onCancel={() => setResetPasswordDialog({ open: false, user: null })}
      />
    </div>
  )
}

export default Users