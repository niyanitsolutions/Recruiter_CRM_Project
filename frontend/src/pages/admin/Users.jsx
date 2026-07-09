import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import usePermissions from '../../hooks/usePermissions'
import { useLivePolling } from '../../hooks/useLivePolling'
import {
  Plus, Search, Filter, MoreVertical, Edit, Trash2, Eye, EyeOff,
  UserCheck, UserX, Key, ChevronLeft, ChevronRight, X, ArrowUpFromLine,
  Building, Award, Save, Loader2, Users as UsersIcon, UserCog, CheckCircle2, AlertCircle,
} from 'lucide-react'
import { toast } from 'react-hot-toast'
import userService from '../../services/userService'
import EmployeeAvatar from '../../components/common/EmployeeAvatar'
import departmentService from '../../services/departmentService'
import designationService from '../../services/designationService'
import subscriptionService from '../../services/subscriptionService'
import SeatLimitModal from '../../components/subscription/SeatLimitModal'
import UpgradeSeatsModal from '../../components/subscription/UpgradeSeatsModal'
import SubscriptionBanner from '../../components/subscription/SubscriptionBanner'
import ExportModal from '../../components/common/ExportModal'
import ModalPortal from '../../components/common/ModalPortal'
import TableScroll from '../../components/common/TableScroll'
import { publish, LIVE_TOPICS } from '../../utils/liveUpdateBus'
import { formatDateTime } from '../../utils/format'

// ─── Shared sub-components ───────────────────────────────────────────────────

const EmployeeProfileBadge = ({ user }) => {
  const status = user.employee_profile_status || (user.hrm_employee_id ? 'incomplete' : 'missing')
  if (status === 'complete') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
        <CheckCircle2 className="w-3 h-3" /> Complete
      </span>
    )
  }
  if (status === 'incomplete') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
        <AlertCircle className="w-3 h-3" /> Incomplete
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
      <AlertCircle className="w-3 h-3" /> Missing
    </span>
  )
}

const StatusBadge = ({ status }) => {
  const cls = {
    active: 'bg-green-100 text-green-700',
    inactive: 'bg-surface-100 text-surface-600',
    suspended: 'bg-red-100 text-red-700',
    pending: 'bg-yellow-100 text-yellow-700',
  }
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${cls[status] || cls.inactive}`}>
      {status}
    </span>
  )
}

const UserActions = ({ user, onEdit, onDelete, onStatusChange, onResetPassword, onCompleteProfile }) => {
  const [isOpen, setIsOpen] = useState(false)
  const [dropdownPos, setDropdownPos] = useState({ top: 0, right: 0 })
  const buttonRef = useRef(null)
  const { has } = usePermissions()

  const canEdit   = has('users:edit')
  const canDelete = has('users:delete')

  useEffect(() => {
    if (!isOpen) return
    const close = () => setIsOpen(false)
    window.addEventListener('scroll', close, true)
    return () => window.removeEventListener('scroll', close, true)
  }, [isOpen])

  const handleOpen = () => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      const menuHeight = 220
      const openUpward = rect.bottom + menuHeight > window.innerHeight
      setDropdownPos({
        top: openUpward ? rect.top - menuHeight : rect.bottom + 4,
        right: window.innerWidth - rect.right,
      })
    }
    setIsOpen(prev => !prev)
  }

  return (
    <div>
      <button ref={buttonRef} onClick={handleOpen} className="p-2 hover:bg-surface-100 rounded-lg transition-colors">
        <MoreVertical className="w-4 h-4 text-surface-500" />
      </button>
      {isOpen && (
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setIsOpen(false)} />
          <div
            style={{ top: dropdownPos.top, right: dropdownPos.right }}
            className="fixed w-48 bg-white rounded-lg shadow-lg border border-surface-200 py-1 z-[9999]"
          >
            <Link
              to={`/users/${user.id}`}
              className="flex items-center gap-2 px-4 py-2 text-sm text-surface-700 hover:bg-surface-50"
              onClick={() => setIsOpen(false)}
            >
              <Eye className="w-4 h-4" /> View Details
            </Link>
            {(user.employee_profile_status === 'missing' || user.employee_profile_status === 'incomplete') && user.user_type !== 'partner' && (
              <button
                onClick={() => { onCompleteProfile(user); setIsOpen(false) }}
                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-yellow-700 hover:bg-yellow-50"
              >
                <UserCog className="w-4 h-4" /> Complete Employee Profile
              </button>
            )}
            {canEdit && (
              <button
                onClick={() => { onEdit(user); setIsOpen(false) }}
                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-surface-700 hover:bg-surface-50"
              >
                <Edit className="w-4 h-4" /> Edit User
              </button>
            )}
            {canEdit && (
              <button
                onClick={() => { onResetPassword(user); setIsOpen(false) }}
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
                    onClick={() => { onStatusChange(user, 'inactive'); setIsOpen(false) }}
                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-yellow-600 hover:bg-yellow-50"
                  >
                    <UserX className="w-4 h-4" /> Deactivate
                  </button>
                ) : (
                  <button
                    onClick={() => { onStatusChange(user, 'active'); setIsOpen(false) }}
                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-green-600 hover:bg-green-50"
                  >
                    <UserCheck className="w-4 h-4" /> Activate
                  </button>
                )}
              </>
            )}
            {canDelete && !user.is_owner && (
              <button
                onClick={() => { onDelete(user); setIsOpen(false) }}
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

const ConfirmDialog = ({ isOpen, title, message, onConfirm, onCancel, confirmText = 'Confirm', danger = false }) => {
  if (!isOpen) return null
  return (
    <ModalPortal isOpen={isOpen}>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center">
        <div className="fixed inset-0 bg-black/50" onClick={onCancel} />
        <div className="relative bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
          <h3 className="text-lg font-semibold text-surface-900">{title}</h3>
          <p className="mt-2 text-surface-600">{message}</p>
          <div className="mt-6 flex gap-3 justify-end">
            <button onClick={onCancel} className="px-4 py-2 text-surface-700 hover:bg-surface-100 rounded-lg transition-colors">
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className={`px-4 py-2 rounded-lg text-white transition-colors ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-accent-600 hover:bg-accent-700'}`}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}

const ResetPasswordDialog = ({ isOpen, user, onConfirm, onCancel }) => {
  const [password, setPassword] = useState('')
  const [mustChange, setMustChange] = useState(true)
  const [showPassword, setShowPassword] = useState(false)
  if (!isOpen) return null
  return (
    <ModalPortal isOpen={isOpen}>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center">
        <div className="fixed inset-0 bg-black/50" onClick={onCancel} />
        <div className="relative bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
          <h3 className="text-lg font-semibold text-surface-900">Reset Password</h3>
          <p className="mt-2 text-surface-600">Reset password for {user?.full_name}</p>
          <div className="mt-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">New Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 pr-10 border border-surface-300 rounded-lg focus:ring-2 focus:ring-accent-500"
                  placeholder="Enter new password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(prev => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={mustChange}
                onChange={(e) => setMustChange(e.target.checked)}
                className="rounded border-surface-300 text-accent-600"
              />
              <span className="text-sm text-surface-700">Require password change on next login</span>
            </label>
          </div>
          <div className="mt-6 flex gap-3 justify-end">
            <button onClick={onCancel} className="px-4 py-2 text-surface-700 hover:bg-surface-100 rounded-lg transition-colors">
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
    </ModalPortal>
  )
}

// ─── Department inline modal ─────────────────────────────────────────────────

const DepartmentModal = ({ dept, onClose, onSaved }) => {
  const [form, setForm] = useState({
    name: dept?.name || '',
    description: dept?.description || '',
    head_user_id: dept?.head_user_id || '',
    is_active: dept?.is_active ?? true,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [headUsers, setHeadUsers] = useState([])

  useEffect(() => {
    userService.getUsers({ page_size: 200, status: 'active' })
      .then(r => setHeadUsers(r.data || []))
      .catch(() => {})
  }, [])

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setForm(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) { setError('Department name is required'); return }
    try {
      setSaving(true)
      const data = { ...form }
      Object.keys(data).forEach(k => { if (data[k] === '') delete data[k] })
      if (dept?.id) {
        await departmentService.updateDepartment(dept.id, data)
        toast.success('Department updated')
      } else {
        await departmentService.createDepartment(data)
        toast.success('Department created')
      }
      onSaved()
    } catch (err) {
      const detail = err.response?.data?.detail || err.response?.data?.message
      setError(typeof detail === 'string' ? detail : 'Failed to save department')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalPortal isOpen>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center">
        <div className="fixed inset-0 bg-black/50" onClick={onClose} />
        <div className="relative bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
          <h3 className="text-lg font-semibold text-surface-900 mb-4">
            {dept?.id ? 'Edit Department' : 'Add Department'}
          </h3>
          {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Department Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="name"
                value={form.name}
                onChange={handleChange}
                placeholder="e.g. Human Resources"
                className="w-full px-3 py-2 border border-surface-300 rounded-lg focus:ring-2 focus:ring-accent-500"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">Description</label>
              <textarea
                name="description"
                value={form.description}
                onChange={handleChange}
                rows={2}
                placeholder="Brief description of this department"
                className="w-full px-3 py-2 border border-surface-300 rounded-lg focus:ring-2 focus:ring-accent-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">Department Head</label>
              <select
                name="head_user_id"
                value={form.head_user_id}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-surface-300 rounded-lg focus:ring-2 focus:ring-accent-500"
              >
                <option value="">— Select Head —</option>
                {headUsers.map(u => (
                  <option key={u.id} value={u.id}>{u.full_name}</option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                name="is_active"
                checked={form.is_active}
                onChange={handleChange}
                className="rounded border-surface-300 text-accent-600"
              />
              <span className="text-sm text-surface-700">Active</span>
            </label>
            <div className="flex justify-end gap-3 pt-4 border-t border-surface-100">
              <button type="button" onClick={onClose} className="px-4 py-2 border border-surface-300 rounded-lg text-surface-700 hover:bg-surface-50">
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-accent-600 text-white rounded-lg hover:bg-accent-700 disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </ModalPortal>
  )
}

// ─── Designation inline modal ─────────────────────────────────────────────────

const DesignationModal = ({ desig, deptList, onClose, onSaved }) => {
  const [form, setForm] = useState({
    name: desig?.name || '',
    description: desig?.description || '',
    department_id: desig?.department_id || '',
    is_active: desig?.is_active ?? true,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setForm(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) { setError('Designation name is required'); return }
    try {
      setSaving(true)
      const data = { ...form }
      Object.keys(data).forEach(k => { if (data[k] === '') delete data[k] })
      if (desig?.id) {
        await designationService.updateDesignation(desig.id, data)
        toast.success('Designation updated')
      } else {
        await designationService.createDesignation(data)
        toast.success('Designation created')
      }
      onSaved()
    } catch (err) {
      const detail = err.response?.data?.detail || err.response?.data?.message
      setError(typeof detail === 'string' ? detail : 'Failed to save designation')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalPortal isOpen>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center">
        <div className="fixed inset-0 bg-black/50" onClick={onClose} />
        <div className="relative bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
          <h3 className="text-lg font-semibold text-surface-900 mb-4">
            {desig?.id ? 'Edit Designation' : 'Add Designation'}
          </h3>
          {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Designation Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="name"
                value={form.name}
                onChange={handleChange}
                placeholder="e.g. Software Engineer"
                className="w-full px-3 py-2 border border-surface-300 rounded-lg focus:ring-2 focus:ring-accent-500"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">Description</label>
              <textarea
                name="description"
                value={form.description}
                onChange={handleChange}
                rows={2}
                placeholder="Brief description of this designation"
                className="w-full px-3 py-2 border border-surface-300 rounded-lg focus:ring-2 focus:ring-accent-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">Department</label>
              <select
                name="department_id"
                value={form.department_id}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-surface-300 rounded-lg focus:ring-2 focus:ring-accent-500"
              >
                <option value="">— All Departments —</option>
                {deptList.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                name="is_active"
                checked={form.is_active}
                onChange={handleChange}
                className="rounded border-surface-300 text-accent-600"
              />
              <span className="text-sm text-surface-700">Active</span>
            </label>
            <div className="flex justify-end gap-3 pt-4 border-t border-surface-100">
              <button type="button" onClick={onClose} className="px-4 py-2 border border-surface-300 rounded-lg text-surface-700 hover:bg-surface-50">
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-accent-600 text-white rounded-lg hover:bg-accent-700 disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </ModalPortal>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

const Users = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const { has } = usePermissions()

  // ── User list state ──
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 0 })

  // ── Seat / subscription ──
  const [seatStatus,       setSeatStatus]       = useState(null)
  const [seatModalOpen,    setSeatModalOpen]    = useState(false)
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false)

  // ── Active tab ──
  const activeTab = searchParams.get('tab') || 'active'
  const isUserTab = activeTab === 'active' || activeTab === 'inactive'

  // ── User filters ──
  const [search, setSearch] = useState(searchParams.get('search') || '')
  const [roleFilter, setRoleFilter] = useState(searchParams.get('role') || '')
  const [departmentFilter, setDepartmentFilter] = useState(searchParams.get('department_id') || '')
  const [showFilters, setShowFilters] = useState(false)

  // ── Dropdown data for filters ──
  const [roles, setRoles] = useState([])
  const [deptList, setDeptList] = useState([])

  // ── User dialogs ──
  const [deleteDialog,        setDeleteDialog]        = useState({ open: false, user: null })
  const [statusDialog,        setStatusDialog]        = useState({ open: false, user: null, status: '' })
  const [resetPasswordDialog, setResetPasswordDialog] = useState({ open: false, user: null })
  const [exportOpen,          setExportOpen]          = useState(false)

  // ── Department tab state ──
  const [deptLoading,    setDeptLoading]    = useState(false)
  const [deptModal,      setDeptModal]      = useState({ open: false, item: null })
  const [deptDeleteDialog, setDeptDeleteDialog] = useState({ open: false, item: null })

  // ── Designation tab state ──
  const [desigList,    setDesigList]    = useState([])
  const [desigLoading, setDesigLoading] = useState(false)
  const [desigModal,   setDesigModal]   = useState({ open: false, item: null })
  const [desigDeleteDialog, setDesigDeleteDialog] = useState({ open: false, item: null })

  // ── Seat status on mount ──
  useEffect(() => {
    subscriptionService.getTenantSeatStatus()
      .then(res => setSeatStatus(res.data?.data || null))
      .catch(() => {})
  }, [])

  // ── Roles + departments for filter dropdowns (once) ──
  useEffect(() => {
    Promise.all([
      userService.getAvailableRoles(),
      departmentService.getDepartments(),
    ]).then(([rolesRes, deptsRes]) => {
      setRoles(rolesRes.data || [])
      setDeptList(deptsRes.data || [])
    }).catch(() => {})
  }, [])

  // ── Fetch departments when tab is active ──
  const fetchDeptList = useCallback(async () => {
    try {
      setDeptLoading(true)
      const res = await departmentService.getDepartments()
      setDeptList(res.data || [])
    } catch (err) {
      toast.error('Failed to load departments')
    } finally {
      setDeptLoading(false)
    }
  }, [])

  // ── Fetch designations when tab is active ──
  const fetchDesigList = useCallback(async () => {
    try {
      setDesigLoading(true)
      const res = await designationService.getDesignations()
      setDesigList(res.data || [])
    } catch (err) {
      toast.error('Failed to load designations')
    } finally {
      setDesigLoading(false)
    }
  }, [])

  useEffect(() => {
    if (activeTab === 'departments') fetchDeptList()
    if (activeTab === 'designations') fetchDesigList()
  }, [activeTab, fetchDeptList, fetchDesigList])

  // ── Fetch users (only for active/inactive tabs) ──
  const fetchUsers = useCallback(async (silent = false) => {
    if (!isUserTab) return
    try {
      if (!silent) setLoading(true)
      const params = {
        page: parseInt(searchParams.get('page') || '1'),
        page_size: 10,
        search: searchParams.get('search') || undefined,
        role: searchParams.get('role') || undefined,
        status: activeTab === 'inactive' ? 'inactive' : 'active',
        department_id: searchParams.get('department_id') || undefined,
        user_type: 'internal',
      }
      const response = await userService.getUsers(params)
      setUsers(response.data || [])
      setPagination(response.pagination || { page: 1, total: 0, totalPages: 0 })
    } catch (err) {
      if (!silent) toast.error('Failed to load users')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [searchParams, isUserTab, activeTab])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  // Live background refresh: stays current if another admin creates/deletes/
  // edits a user elsewhere, and refreshes immediately (not after up to 5s)
  // when this tab's own mutations publish to the 'users' topic.
  useLivePolling(() => fetchUsers(true), 5000, isUserTab, [LIVE_TOPICS.USERS])

  // ── Filters ──
  const applyFilters = () => {
    const params = new URLSearchParams()
    params.set('tab', activeTab)
    if (search) params.set('search', search)
    if (roleFilter) params.set('role', roleFilter)
    if (departmentFilter) params.set('department_id', departmentFilter)
    params.set('page', '1')
    setSearchParams(params)
  }

  const clearFilters = () => {
    setSearch('')
    setRoleFilter('')
    setDepartmentFilter('')
    setSearchParams(new URLSearchParams([['tab', activeTab]]))
  }

  const handleTabChange = (tab) => {
    setSearch('')
    setRoleFilter('')
    setDepartmentFilter('')
    setSearchParams(new URLSearchParams([['tab', tab]]))
  }

  const handlePageChange = (newPage) => {
    const params = new URLSearchParams(searchParams)
    params.set('page', newPage.toString())
    setSearchParams(params)
  }

  // ── Guard: seat limit before Add User ──
  const handleAddUserClick = () => {
    if (seatStatus?.seat_limit_reached) setSeatModalOpen(true)
    else navigate('/users/new')
  }

  // ── User actions ──
  const handleDeleteUser = async () => {
    try {
      await userService.deleteUser(deleteDialog.user.id)
      setDeleteDialog({ open: false, user: null })
      fetchUsers()
      publish(LIVE_TOPICS.USERS); publish(LIVE_TOPICS.DASHBOARD)
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to delete user')
    }
  }

  const handleStatusChange = async () => {
    try {
      await userService.updateUserStatus(statusDialog.user.id, statusDialog.status)
      setStatusDialog({ open: false, user: null, status: '' })
      fetchUsers()
      publish(LIVE_TOPICS.USERS); publish(LIVE_TOPICS.DASHBOARD)
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to update user status')
    }
  }

  const handleResetPassword = async (passwordData) => {
    try {
      await userService.resetUserPassword(resetPasswordDialog.user.id, passwordData)
      setResetPasswordDialog({ open: false, user: null })
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to reset password')
    }
  }

  // ── Dept actions ──
  const handleDeleteDept = async () => {
    try {
      await departmentService.deleteDepartment(deptDeleteDialog.item.id)
      setDeptDeleteDialog({ open: false, item: null })
      fetchDeptList()
      toast.success('Department deleted')
    } catch (err) {
      toast.error(err.response?.data?.detail || err.response?.data?.message || 'Failed to delete')
    }
  }

  // ── Desig actions ──
  const handleDeleteDesig = async () => {
    try {
      await designationService.deleteDesignation(desigDeleteDialog.item.id)
      setDesigDeleteDialog({ open: false, item: null })
      fetchDesigList()
      toast.success('Designation deleted')
    } catch (err) {
      toast.error(err.response?.data?.detail || err.response?.data?.message || 'Failed to delete')
    }
  }

  const hasFilters = search || roleFilter || departmentFilter

  // ─── Header CTA ───────────────────────────────────────────────────────────
  const renderHeaderCTA = () => {
    if (activeTab === 'active' || activeTab === 'inactive') {
      return (
        <div className="flex items-center gap-2">
          {has('exports:create') && (
            <button onClick={() => setExportOpen(true)} className="btn-secondary flex items-center gap-2">
              <ArrowUpFromLine className="w-4 h-4" /> Export
            </button>
          )}
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
      )
    }
    if (activeTab === 'departments') {
      return has('departments:create') ? (
        <button
          onClick={() => setDeptModal({ open: true, item: null })}
          className="flex items-center gap-2 px-4 py-2 bg-accent-600 hover:bg-accent-700 text-white rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" /> Add Department
        </button>
      ) : null
    }
    if (activeTab === 'designations') {
      return has('designations:create') ? (
        <button
          onClick={() => setDesigModal({ open: true, item: null })}
          className="flex items-center gap-2 px-4 py-2 bg-accent-600 hover:bg-accent-700 text-white rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" /> Add Designation
        </button>
      ) : null
    }
    return null
  }

  // ─── Departments tab content ───────────────────────────────────────────────
  const renderDepartmentsTab = () => (
    <div className="bg-white rounded-xl shadow-sm border border-surface-100 overflow-hidden">
      <TableScroll>
        <table className="w-full">
          <thead className="bg-surface-50 border-b border-surface-200">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-semibold text-surface-600 uppercase tracking-wider">Department</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-surface-600 uppercase tracking-wider">Code</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-surface-600 uppercase tracking-wider">Head</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-surface-600 uppercase tracking-wider">Users</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-surface-600 uppercase tracking-wider">Status</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-surface-600 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-100">
            {deptLoading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-surface-500">Loading…</td></tr>
            ) : deptList.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-16 text-center">
                  <Building className="w-10 h-10 text-surface-300 mx-auto mb-3" />
                  <p className="text-surface-500 font-medium">No departments yet</p>
                  {has('departments:create') && (
                    <button
                      onClick={() => setDeptModal({ open: true, item: null })}
                      className="mt-3 inline-flex items-center gap-1.5 text-sm text-accent hover:underline"
                    >
                      <Plus className="w-3.5 h-3.5" /> Create your first department
                    </button>
                  )}
                </td>
              </tr>
            ) : (
              deptList.map(dept => (
                <tr key={dept.id} className="hover:bg-surface-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Building className="w-5 h-5 text-surface-400 flex-shrink-0" />
                      <span className="font-medium text-surface-900">{dept.name}</span>
                    </div>
                    {dept.description && <p className="text-xs text-surface-400 mt-0.5 ml-8 line-clamp-1">{dept.description}</p>}
                  </td>
                  <td className="px-4 py-3 text-surface-600 text-sm">{dept.code || '-'}</td>
                  <td className="px-4 py-3 text-surface-600 text-sm">{dept.head_user_name || '-'}</td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1 text-surface-600 text-sm">
                      <UsersIcon className="w-4 h-4" /> {dept.user_count || 0}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${dept.is_active ? 'bg-green-100 text-green-700' : 'bg-surface-100 text-surface-600'}`}>
                      {dept.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {has('departments:edit') && (
                        <button
                          onClick={() => setDeptModal({ open: true, item: dept })}
                          className="p-1.5 hover:bg-surface-100 rounded-lg transition-colors text-surface-500 hover:text-accent"
                          title="Edit"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                      )}
                      {has('departments:delete') && (
                        <button
                          onClick={() => setDeptDeleteDialog({ open: true, item: dept })}
                          className="p-1.5 hover:bg-red-50 rounded-lg transition-colors text-surface-500 hover:text-red-600"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </TableScroll>
    </div>
  )

  // ─── Designations tab content ─────────────────────────────────────────────
  const renderDesignationsTab = () => (
    <div className="bg-white rounded-xl shadow-sm border border-surface-100 overflow-hidden">
      <TableScroll>
        <table className="w-full">
          <thead className="bg-surface-50 border-b border-surface-200">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-semibold text-surface-600 uppercase tracking-wider">Designation</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-surface-600 uppercase tracking-wider">Level</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-surface-600 uppercase tracking-wider">Department</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-surface-600 uppercase tracking-wider">Users</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-surface-600 uppercase tracking-wider">Status</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-surface-600 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-100">
            {desigLoading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-surface-500">Loading…</td></tr>
            ) : desigList.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-16 text-center">
                  <Award className="w-10 h-10 text-surface-300 mx-auto mb-3" />
                  <p className="text-surface-500 font-medium">No designations yet</p>
                  {has('designations:create') && (
                    <button
                      onClick={() => setDesigModal({ open: true, item: null })}
                      className="mt-3 inline-flex items-center gap-1.5 text-sm text-accent hover:underline"
                    >
                      <Plus className="w-3.5 h-3.5" /> Create your first designation
                    </button>
                  )}
                </td>
              </tr>
            ) : (
              desigList.map(desig => (
                <tr key={desig.id} className="hover:bg-surface-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Award className="w-5 h-5 text-surface-400 flex-shrink-0" />
                      <span className="font-medium text-surface-900">{desig.name}</span>
                    </div>
                    {desig.description && <p className="text-xs text-surface-400 mt-0.5 ml-8 line-clamp-1">{desig.description}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-1 bg-surface-100 text-surface-700 rounded text-sm">
                      {desig.level_name || (desig.level ? `Level ${desig.level}` : '-')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-surface-600 text-sm">{desig.department_name || '-'}</td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1 text-surface-600 text-sm">
                      <UsersIcon className="w-4 h-4" /> {desig.user_count || 0}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${desig.is_active ? 'bg-green-100 text-green-700' : 'bg-surface-100 text-surface-600'}`}>
                      {desig.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {has('designations:edit') && (
                        <button
                          onClick={() => setDesigModal({ open: true, item: desig })}
                          className="p-1.5 hover:bg-surface-100 rounded-lg transition-colors text-surface-500 hover:text-accent"
                          title="Edit"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                      )}
                      {has('designations:delete') && (
                        <button
                          onClick={() => setDesigDeleteDialog({ open: true, item: desig })}
                          className="p-1.5 hover:bg-red-50 rounded-lg transition-colors text-surface-500 hover:text-red-600"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </TableScroll>
    </div>
  )

  // ─── JSX ──────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-6">
      <SubscriptionBanner seatStatus={seatStatus} onUpgrade={() => setUpgradeModalOpen(true)} />

      <SeatLimitModal
        isOpen={seatModalOpen}
        onClose={() => setSeatModalOpen(false)}
        onUpgrade={() => { setSeatModalOpen(false); setUpgradeModalOpen(true) }}
        seatStatus={seatStatus}
      />

      <UpgradeSeatsModal
        isOpen={upgradeModalOpen}
        onClose={() => setUpgradeModalOpen(false)}
        seatStatus={seatStatus}
      />

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-surface-900">Users</h1>
          <p className="text-surface-500 mt-1">Manage your organization's users, departments, and designations</p>
        </div>
        {renderHeaderCTA()}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-surface-100 p-1 rounded-xl w-fit">
        {[
          { key: 'active',       label: 'Active Users' },
          { key: 'inactive',     label: 'Inactive Users' },
          { key: 'departments',  label: 'Departments' },
          { key: 'designations', label: 'Designations' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => handleTabChange(tab.key)}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors
              ${activeTab === tab.key
                ? 'bg-white text-accent-600 shadow-sm'
                : 'text-surface-500 hover:text-surface-800'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── User tabs content ── */}
      {isUserTab && (
        <>
          {/* Search & Filters */}
          <div className="bg-white rounded-xl shadow-sm border border-surface-100 p-4">
            <div className="flex flex-col md:flex-row gap-4">
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
                    {[roleFilter, departmentFilter].filter(Boolean).length}
                  </span>
                )}
              </button>
              <button onClick={applyFilters} className="px-4 py-2 bg-accent-600 hover:bg-accent-700 text-white rounded-lg transition-colors">
                Search
              </button>
            </div>

            {showFilters && (
              <div className="mt-4 pt-4 border-t border-surface-200 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-surface-700 mb-1">Role</label>
                  <select
                    value={roleFilter}
                    onChange={(e) => setRoleFilter(e.target.value)}
                    className="w-full px-3 py-2 border border-surface-300 rounded-lg focus:ring-2 focus:ring-accent-500"
                  >
                    <option value="">All Roles</option>
                    {roles.map(role => (
                      <option key={role.value} value={role.value}>{role.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-surface-700 mb-1">Department</label>
                  <select
                    value={departmentFilter}
                    onChange={(e) => setDepartmentFilter(e.target.value)}
                    className="w-full px-3 py-2 border border-surface-300 rounded-lg focus:ring-2 focus:ring-accent-500"
                  >
                    <option value="">All Departments</option>
                    {deptList.map(dept => (
                      <option key={dept.id} value={dept.id}>{dept.name}</option>
                    ))}
                  </select>
                </div>
                {hasFilters && (
                  <div className="md:col-span-2">
                    <button onClick={clearFilters} className="flex items-center gap-1 text-sm text-surface-600 hover:text-surface-900">
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
                    <th className="text-left px-4 py-3 text-xs font-semibold text-surface-600 uppercase tracking-wider" style={{ width: '25%' }}>User</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-surface-600 uppercase tracking-wider" style={{ width: '14%' }}>Designation</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-surface-600 uppercase tracking-wider" style={{ width: '14%' }}>Department</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-surface-600 uppercase tracking-wider" style={{ width: '10%' }}>Status</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-surface-600 uppercase tracking-wider" style={{ width: '16%' }}>Employee Profile</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-surface-600 uppercase tracking-wider" style={{ width: '13%' }}>Last Login</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-surface-600 uppercase tracking-wider" style={{ width: '8%' }}>Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100">
                  {loading ? (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-surface-500">Loading...</td></tr>
                  ) : users.length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-surface-500">No users found</td></tr>
                  ) : (
                    users.map(user => (
                      <tr key={user.id} className="hover:bg-surface-50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <EmployeeAvatar name={user.full_name || 'U'} photoUrl={user.avatar_url || null} size={40} />
                            <div>
                              <p className="font-medium text-surface-900">
                                {user.full_name}
                                {(user.is_owner || user.role === 'owner') && (
                                  <span className="ml-2 px-1.5 py-0.5 bg-yellow-100 text-yellow-700 text-xs rounded">Owner</span>
                                )}
                              </p>
                              <p className="text-sm text-surface-500">{user.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {user.designation === 'Owner' || user.is_owner || user.role === 'owner' ? (
                            <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs font-medium rounded">Owner</span>
                          ) : user.designation === 'Admin' ? (
                            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded">Admin</span>
                          ) : (
                            <span className="text-surface-600 text-sm">{user.designation || '-'}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-surface-600 text-sm">{user.department || '-'}</td>
                        <td className="px-4 py-3"><StatusBadge status={user.status} /></td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1">
                            <EmployeeProfileBadge user={user} />
                            {(user.employee_profile_status === 'missing' || user.employee_profile_status === 'incomplete') && user.user_type !== 'partner' && (
                              <button
                                onClick={() => user.hrm_employee_id
                                  ? navigate(`/hrm/employees/${user.hrm_employee_id}/edit`)
                                  : navigate(`/hrm/employees/new?user_id=${user.id}`)
                                }
                                className="text-xs text-accent-600 hover:underline text-left"
                              >
                                Complete Employee Profile
                              </button>
                            )}
                            {user.employee_profile_status === 'complete' && (
                              <button
                                onClick={() => navigate(`/hrm/employees/${user.hrm_employee_id}/edit`)}
                                className="text-xs text-surface-500 hover:text-accent-600 text-left"
                              >
                                View Profile
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-surface-500">
                          {user.last_login ? formatDateTime(user.last_login) : 'Never'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <UserActions
                            user={user}
                            onEdit={(u) => navigate(`/users/${u.id}/edit`)}
                            onDelete={(u) => setDeleteDialog({ open: true, user: u })}
                            onStatusChange={(u, status) => setStatusDialog({ open: true, user: u, status })}
                            onResetPassword={(u) => setResetPasswordDialog({ open: true, user: u })}
                            onCompleteProfile={(u) => u.hrm_employee_id
                              ? navigate(`/hrm/employees/${u.hrm_employee_id}/edit`)
                              : navigate(`/hrm/employees/new?user_id=${u.id}`)
                            }
                          />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

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
                  <span className="px-4 py-2 text-sm">Page {pagination.page} of {pagination.totalPages}</span>
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
        </>
      )}

      {/* ── Departments tab content ── */}
      {activeTab === 'departments' && renderDepartmentsTab()}

      {/* ── Designations tab content ── */}
      {activeTab === 'designations' && renderDesignationsTab()}

      {/* ── User dialogs ── */}
      <ConfirmDialog
        isOpen={deleteDialog.open}
        title="Delete User"
        message={`Are you sure you want to delete ${deleteDialog.user?.full_name}? This action cannot be undone.`}
        onConfirm={handleDeleteUser}
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

      <ExportModal
        isOpen={exportOpen}
        onClose={() => setExportOpen(false)}
        title="Export Users"
        apiPath="/export/users"
        extraFilters={({ status, setStatus, extra, setExtraField }) => (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">Role</label>
              <select value={extra.role || ''} onChange={e => setExtraField('role', e.target.value)} className="input w-full">
                <option value="">All Roles</option>
                {roles.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">Status</label>
              <select value={status} onChange={e => setStatus(e.target.value)} className="input w-full">
                <option value="">All Statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="suspended">Suspended</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-surface-700 mb-1">Department</label>
              <select value={extra.department || ''} onChange={e => setExtraField('department', e.target.value)} className="input w-full">
                <option value="">All Departments</option>
                {deptList.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
              </select>
            </div>
          </div>
        )}
      />

      {/* ── Dept confirm delete ── */}
      <ConfirmDialog
        isOpen={deptDeleteDialog.open}
        title="Delete Department"
        message={`Are you sure you want to delete "${deptDeleteDialog.item?.name}"? This cannot be undone.`}
        onConfirm={handleDeleteDept}
        onCancel={() => setDeptDeleteDialog({ open: false, item: null })}
        confirmText="Delete"
        danger
      />

      {/* ── Desig confirm delete ── */}
      <ConfirmDialog
        isOpen={desigDeleteDialog.open}
        title="Delete Designation"
        message={`Are you sure you want to delete "${desigDeleteDialog.item?.name}"? This cannot be undone.`}
        onConfirm={handleDeleteDesig}
        onCancel={() => setDesigDeleteDialog({ open: false, item: null })}
        confirmText="Delete"
        danger
      />

      {/* ── Department modal ── */}
      {deptModal.open && (
        <DepartmentModal
          dept={deptModal.item}
          onClose={() => setDeptModal({ open: false, item: null })}
          onSaved={() => {
            setDeptModal({ open: false, item: null })
            fetchDeptList()
          }}
        />
      )}

      {/* ── Designation modal ── */}
      {desigModal.open && (
        <DesignationModal
          desig={desigModal.item}
          deptList={deptList}
          onClose={() => setDesigModal({ open: false, item: null })}
          onSaved={() => {
            setDesigModal({ open: false, item: null })
            fetchDesigList()
          }}
        />
      )}
    </div>
  )
}

export default Users
