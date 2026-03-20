import { useState, useEffect, useRef, useCallback } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Save, Loader2, Shield, GitBranch, ChevronDown } from 'lucide-react'
import userService from '../../services/userService'
import departmentService from '../../services/departmentService'
import designationService from '../../services/designationService'
import OrgTree from '../../components/OrgTree'

// ── Hierarchical permission sections ─────────────────────────────────────────
const PERMISSION_SECTIONS = [
  {
    section: 'Admin Management',
    modules: [
      { label: 'Users',        perms: ['users:view','users:create','users:edit','users:delete'] },
      { label: 'Partners',     perms: ['partners:view','partners:create','partners:edit','partners:delete'] },
      { label: 'Departments',  perms: ['departments:view','departments:create','departments:edit','departments:delete'] },
      { label: 'Designations', perms: ['designations:view','designations:create','designations:edit','designations:delete'] },
    ],
  },
  {
    section: 'Client Management',
    modules: [
      { label: 'Clients',            perms: ['clients:view','clients:create','clients:edit','clients:delete'] },
      { label: 'Jobs',               perms: ['jobs:view','jobs:create','jobs:edit','jobs:delete'] },
      { label: 'Interviews',         perms: ['interviews:view','interviews:schedule','interviews:update_status'] },
      { label: 'Interview Settings', perms: ['interview_settings:view','interview_settings:create','interview_settings:edit','interview_settings:delete'] },
      { label: 'Onboards',           perms: ['onboards:view','onboards:create','onboards:edit'] },
    ],
  },
  {
    section: 'Candidate Management',
    modules: [
      { label: 'Candidates', perms: ['candidates:view','candidates:create','candidates:edit','candidates:delete','candidates:assign'] },
      { label: 'Interviews', perms: ['interviews:view','interviews:schedule','interviews:update_status'] },
      { label: 'Jobs',       perms: ['jobs:view','jobs:create','jobs:edit','jobs:delete'] },
    ],
  },
  {
    section: 'HR Management',
    modules: [
      { label: 'Users',      perms: ['users:view','users:create','users:edit','users:delete'] },
      { label: 'Candidates', perms: ['candidates:view','candidates:create','candidates:edit','candidates:delete','candidates:assign'] },
      { label: 'Onboards',   perms: ['onboards:view','onboards:create','onboards:edit'] },
    ],
  },
  {
    section: 'Accounts Management',
    modules: [
      { label: 'Accounts', perms: ['accounts:view','accounts:invoices','accounts:payouts'] },
      { label: 'Partners', perms: ['partners:view','partners:create','partners:edit','partners:delete'] },
    ],
  },
  {
    section: 'Partner',
    modules: [
      { label: 'Candidates', perms: ['candidates:view','candidates:create'] },
      { label: 'Jobs',       perms: ['jobs:view'] },
      { label: 'Interviews', perms: ['interviews:view'] },
      { label: 'Payouts',    perms: ['payouts:view','payouts:edit'] },
    ],
  },
  {
    section: 'Others',
    modules: [
      { label: 'Payouts',       perms: ['payouts:view','payouts:edit'] },
      { label: 'Invoices',      perms: ['invoices:view','invoices:approve'] },
      { label: 'Imports',       perms: ['imports:view','imports:create'] },
      { label: 'Exports',       perms: ['exports:view','exports:create'] },
      { label: 'Targets',       perms: ['targets:view','targets:create','targets:edit','targets:delete','targets:admin'] },
      { label: 'Analytics',     perms: ['analytics:view','analytics:edit'] },
      { label: 'Reports',       perms: ['reports:view','reports:export'] },
      { label: 'CRM Settings',  perms: ['crm_settings:view','crm_settings:edit'] },
      { label: 'Audit',         perms: ['audit:view','audit:sessions','audit:alerts','audit:admin'] },
      { label: 'Notifications', perms: ['notifications:create'] },
    ],
  },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

const getSectionPerms = (sec) => [...new Set(sec.modules.flatMap(m => m.perms))]

// Returns 'checked' | 'indeterminate' | 'unchecked'
const getCheckState = (perms, selectedSet) => {
  if (perms.length === 0) return 'unchecked'
  const n = perms.filter(p => selectedSet.has(p)).length
  if (n === 0) return 'unchecked'
  if (n === perms.length) return 'checked'
  return 'indeterminate'
}

// Checkbox that supports indeterminate state via a DOM ref
const TriCheckbox = ({ state, onChange, className = '' }) => {
  const ref = useRef(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === 'indeterminate'
  }, [state])
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={state === 'checked'}
      onChange={onChange}
      className={`w-4 h-4 rounded border-surface-300 text-accent-600 focus:ring-accent-500 cursor-pointer ${className}`}
    />
  )
}

// ─────────────────────────────────────────────────────────────────────────────

const UserForm = () => {
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const currentUser = useSelector(state => state.auth.user)
  const auth = useSelector(state => state.auth)
  const { id } = useParams()
  const isEdit = Boolean(id)

  const [loading, setLoading]   = useState(false)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState(null)

  // Duplicate user modal state
  const [duplicateModal, setDuplicateModal] = useState({
    show: false,
    fields: {},          // e.g. { username: "john", email: "j@x.com" }
    overrideChecked: false,
    overrideTouched: false,  // tracks if user tried to submit without checking
  })
  // Holds the fully-built payload from the last submit attempt so we can
  // resend it with override_duplicate=true without rebuilding everything.
  const pendingSubmitData = useRef(null)

  const [formData, setFormData] = useState({
    username: '', email: '', full_name: '', mobile: '', password: '',
    employee_id: '',
    // role is tracked internally — not shown as a dropdown
    role: 'candidate_coordinator',
    user_type: 'internal',
    department_id: '', designation_id: '', reporting_to: '',
    joining_date: '', status: 'active',
  })

  const [departments,  setDepartments]  = useState([])
  const [designations, setDesignations] = useState([])
  const [users,        setUsers]        = useState([])
  const [roles,        setRoles]        = useState([])
  const [errors,       setErrors]       = useState({})
  const [deptCustom,   setDeptCustom]   = useState('')
  const [desigCustom,  setDesigCustom]  = useState('')

  // ── Org tree state ───────────────────────────────────────────────────────
  const [showOrgTree,  setShowOrgTree]  = useState(false)
  const [orgTree,      setOrgTree]      = useState([])
  const [orgTreeLoading, setOrgTreeLoading] = useState(false)

  // ── Org tree loader ───────────────────────────────────────────────────
  const loadOrgTree = async () => {
    try {
      setOrgTreeLoading(true)
      const response = await userService.getOrgTree()
      setOrgTree(response.data || [])
    } catch (err) {
      console.error('Failed to load org tree:', err)
    } finally {
      setOrgTreeLoading(false)
    }
  }

  // ── Permission override state ────────────────────────────────────────────
  const [useCustomPermissions, setUseCustomPermissions] = useState(false)
  const [customPermissions,    setCustomPermissions]    = useState(new Set())
  // Ref used to scroll the permissions card into view when validation fails
  const permissionsSectionRef = useRef(null)

  // ── Load reference data ──────────────────────────────────────────────────
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [deptsRes, desigsRes, usersRes, rolesRes] = await Promise.all([
          departmentService.getDepartments(),
          designationService.getDesignations(),
          userService.getUsers({ page_size: 100 }),
          userService.getAvailableRoles(),
        ])
        setDepartments(deptsRes.data || [])
        setDesignations(desigsRes.data || [])
        setUsers(usersRes.data || [])
        setRoles(rolesRes.data || [])
      } catch (err) { console.error(err) }
    }
    fetchData()
  }, [])

  // ── Load existing user on edit ───────────────────────────────────────────
  useEffect(() => {
    if (!isEdit) return
    const fetchUser = async () => {
      try {
        setLoading(true)
        const response = await userService.getUser(id)
        const user = response.data
        setFormData({
          username:      user.username       || '',
          email:         user.email          || '',
          full_name:     user.full_name      || '',
          mobile:        user.mobile         || '',
          password:      '',
          employee_id:   user.employee_id    || '',
          role:          user.role           || 'candidate_coordinator',
          user_type:     user.user_type      || 'internal',
          department_id: user.department_id  || '',
          designation_id:user.designation_id || '',
          reporting_to:  user.reporting_to   || '',
          joining_date:  user.joining_date?.split('T')[0] || '',
          status:        user.status         || 'active',
        })
        if (user.override_permissions) {
          setUseCustomPermissions(true)
          setCustomPermissions(new Set(user.permissions || []))
        }
      } catch (err) { setError('Failed to load user') }
      finally { setLoading(false) }
    }
    fetchUser()
  }, [id, isEdit])

  // ── Form change ──────────────────────────────────────────────────────────
  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: null }))
  }

  // ── Permission toggle helpers ─────────────────────────────────────────────

  const togglePermission = (perm) => {
    setCustomPermissions(prev => {
      const next = new Set(prev)
      next.has(perm) ? next.delete(perm) : next.add(perm)
      return next
    })
  }

  const toggleModule = (mod) => {
    setCustomPermissions(prev => {
      const state = getCheckState(mod.perms, prev)
      const next  = new Set(prev)
      if (state === 'checked' || state === 'indeterminate') {
        mod.perms.forEach(p => next.delete(p))
      } else {
        mod.perms.forEach(p => next.add(p))
      }
      return next
    })
  }

  const toggleSection = (sec) => {
    const allPerms = getSectionPerms(sec)
    setCustomPermissions(prev => {
      const state = getCheckState(allPerms, prev)
      const next  = new Set(prev)
      if (state === 'checked' || state === 'indeterminate') {
        allPerms.forEach(p => next.delete(p))
      } else {
        allPerms.forEach(p => next.add(p))
      }
      return next
    })
  }

  // ── Validation & submit ──────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault()
    const newErrors = {}
    if (!formData.full_name) newErrors.full_name = 'Required'
    if (!formData.username)  newErrors.username  = 'Required'
    if (!formData.email)     newErrors.email     = 'Required'
    if (!formData.mobile) {
      newErrors.mobile = 'Required'
    } else if (!/^[6-9]\d{9}$/.test(formData.mobile.replace(/\D/g, ''))) {
      newErrors.mobile = 'Must start with 6–9 and be 10 digits'
    }
    if (!isEdit) {
      if (!formData.password) {
        newErrors.password = 'Required'
      } else {
        if (formData.password.length < 8)          newErrors.password = 'Minimum 8 characters'
        else if (!/[A-Z]/.test(formData.password)) newErrors.password = 'Must contain at least one uppercase letter'
        else if (!/[a-z]/.test(formData.password)) newErrors.password = 'Must contain at least one lowercase letter'
        else if (!/\d/.test(formData.password))    newErrors.password = 'Must contain at least one number'
      }
      // Override permissions is mandatory on create
      if (!useCustomPermissions) {
        newErrors.permissions = 'Please enable "Override role permissions" and select at least the required permissions before creating a user.'
      }
    }
    setErrors(newErrors)
    if (Object.keys(newErrors).length > 0) {
      // Scroll to the permissions section if that is the only / last error
      if (newErrors.permissions) {
        setTimeout(() => permissionsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50)
      }
      return
    }

    try {
      setSaving(true)

      const normalizeName = (v) =>
        v.trim().replace(/\s+/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

      // ── On-the-fly Department creation ────────────────────────────────
      let departmentId   = formData.department_id
      let departmentName = departments.find(d => d.id === departmentId)?.name || ''
      if (!isEdit && departmentId === 'custom' && deptCustom.trim()) {
        const deptName = normalizeName(deptCustom)
        try {
          const deptRes = await departmentService.createDepartment({
            name: deptName,
            code: deptName.slice(0, 10).toUpperCase().replace(/\s+/g, '_'),
          })
          const created = deptRes.data
          if (created?.id) {
            departmentId   = created.id
            departmentName = created.name || deptName
            setDepartments(prev => [...prev, created])
          }
        } catch (createErr) {
          const msg = createErr?.response?.data?.detail || ''
          if (typeof msg === 'string' && msg.toLowerCase().includes('already exists')) {
            const listRes = await departmentService.getDepartments()
            const existing = (listRes.data || []).find(d => d.name?.toLowerCase().trim() === deptName.toLowerCase().trim())
            if (existing) { departmentId = existing.id; departmentName = existing.name || deptName } else throw createErr
          } else throw createErr
        }
      }

      // ── On-the-fly Designation creation ──────────────────────────────
      let designationId   = formData.designation_id
      let designationName = designations.find(d => d.id === designationId)?.name || ''
      if (!isEdit && designationId === 'custom' && desigCustom.trim()) {
        const desigName = normalizeName(desigCustom)
        try {
          const desigRes = await designationService.createDesignation({
            name: desigName, code: null,
            department_id: departmentId && departmentId !== 'custom' ? departmentId : undefined,
          })
          const created = desigRes.data
          if (created?.id) {
            designationId   = created.id
            designationName = created.name || desigName
            setDesignations(prev => [...prev, created])
          }
        } catch (createErr) {
          const msg = createErr?.response?.data?.detail || ''
          if (typeof msg === 'string' && msg.toLowerCase().includes('already exists')) {
            const listRes = await designationService.getDesignations()
            const existing = (listRes.data || []).find(d => d.name?.toLowerCase().trim() === desigName.toLowerCase().trim())
            if (existing) { designationId = existing.id; designationName = existing.name || desigName } else throw createErr
          } else throw createErr
        }
      }

      // ── Build submit payload ──────────────────────────────────────────
      const submitData = {
        ...formData,
        department_id:  departmentId  === 'custom' ? undefined : departmentId,
        department:     departmentId && departmentId !== 'custom' ? departmentName : undefined,
        designation_id: designationId === 'custom' ? undefined : designationId,
        designation:    designationId && designationId !== 'custom' ? designationName : undefined,
      }

      if (isEdit && !submitData.password) delete submitData.password
      Object.keys(submitData).forEach(k => { if (submitData[k] === '') delete submitData[k] })

      if (submitData.joining_date && !submitData.joining_date.includes('T')) {
        submitData.joining_date = submitData.joining_date + 'T00:00:00'
      }

      if (useCustomPermissions) {
        submitData.permissions          = Array.from(customPermissions)
        submitData.override_permissions = true
      } else {
        delete submitData.permissions
        submitData.override_permissions = false
      }

      // ── API call ──────────────────────────────────────────────────────
      if (isEdit) {
        const response = await userService.updateUser(id, submitData)
        if (currentUser?.id === id && response?.data) {
          const updated = response.data
          dispatch({
            type: 'auth/setCredentials',
            payload: {
              user: {
                ...currentUser,
                id:          updated.id,
                username:    updated.username,
                fullName:    updated.full_name,
                email:       updated.email,
                role:        updated.role,
                userType:    updated.user_type || 'internal',
                permissions: updated.permissions || [],
                isOwner:     updated.is_owner,
              },
              access_token:  auth.token,
              refresh_token: null,
            },
          })
        }
      } else {
        await userService.createUser(submitData)
      }

      navigate('/users')
    } catch (err) {
      const status = err.response?.status
      const detail = err.response?.data?.detail

      // 409 — duplicate user: show the override modal
      if (status === 409 && detail?.duplicate) {
        pendingSubmitData.current = submitData
        setDuplicateModal({ show: true, fields: detail.fields || {}, overrideChecked: false, overrideTouched: false })
        return
      }

      // 402 — seat limit reached
      if (status === 402 && detail?.seat_limit_reached) {
        setError(`User seat limit reached. You have used ${detail.current_active_users} of ${detail.total_user_seats} seats. Please upgrade your plan to add more users.`)
      } else if (Array.isArray(detail)) {
        // 422 Pydantic validation errors
        setError(detail.map(d => d.msg?.replace('Value error, ', '') || d.msg).join('; '))
      } else {
        setError(typeof detail === 'string' ? detail : 'Failed to save user. Please try again.')
      }
    } finally { setSaving(false) }
  }

  // ── Override submit (called from the duplicate modal) ────────────────────
  const handleOverrideSubmit = useCallback(async () => {
    if (!duplicateModal.overrideChecked) {
      setDuplicateModal(prev => ({ ...prev, overrideTouched: true }))
      return
    }
    if (!pendingSubmitData.current) return
    try {
      setSaving(true)
      await userService.createUser({ ...pendingSubmitData.current, override_duplicate: true })
      setDuplicateModal({ show: false, fields: {}, overrideChecked: false, overrideTouched: false })
      navigate('/users')
    } catch (err) {
      const detail = err.response?.data?.detail
      setError(typeof detail === 'string' ? detail : 'Failed to create user')
      setDuplicateModal({ show: false, fields: {}, overrideChecked: false, overrideTouched: false })
    } finally { setSaving(false) }
  }, [duplicateModal.overrideChecked, navigate])

  if (loading) return (
    <div className="p-6 flex justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-accent-600" />
    </div>
  )

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <button onClick={() => navigate('/users')} className="flex items-center gap-2 text-surface-600 hover:text-surface-900 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to Users
      </button>
      <h1 className="text-2xl font-bold text-surface-900 mb-6">{isEdit ? 'Edit User' : 'Add New User'}</h1>

      {error && <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-lg">{error}</div>}

      {/* ── Duplicate User Modal ──────────────────────────────────────────── */}
      {duplicateModal.show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md animate-fade-in">

            {/* Header */}
            <div className="flex items-center gap-3 mb-5">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-bold text-surface-900">Duplicate User Detected</h3>
                <p className="text-sm text-surface-500">The following data already exists in the system.</p>
              </div>
            </div>

            {/* Duplicate fields */}
            <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 space-y-1.5">
              {Object.entries(duplicateModal.fields).map(([field, value]) => (
                <div key={field} className="flex items-center gap-2 text-sm">
                  <span className="font-semibold text-amber-800 capitalize w-20">{field}:</span>
                  <span className="text-amber-700 font-mono">{value}</span>
                </div>
              ))}
            </div>

            {/* Override section */}
            <div className="mb-5 rounded-xl border border-surface-200 bg-surface-50 px-4 py-4">
              <label className="flex items-start gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={duplicateModal.overrideChecked}
                  onChange={e =>
                    setDuplicateModal(prev => ({ ...prev, overrideChecked: e.target.checked, overrideTouched: true }))
                  }
                  className="mt-0.5 w-4 h-4 rounded border-surface-300 text-accent-600 focus:ring-accent-500 cursor-pointer"
                />
                <span className="text-sm text-surface-700">
                  <span className="font-semibold">Override and create user anyway</span>
                  <br />
                  <span className="text-surface-500">
                    Enable only if this user requires special permissions or belongs to a different role.
                  </span>
                </span>
              </label>
              {duplicateModal.overrideTouched && !duplicateModal.overrideChecked && (
                <p className="mt-2 text-xs text-red-600 font-medium">
                  You must check this box to proceed with creating the duplicate user.
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setDuplicateModal({ show: false, fields: {}, overrideChecked: false, overrideTouched: false })}
                className="px-4 py-2 border border-surface-300 text-surface-700 text-sm font-medium rounded-xl hover:bg-surface-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleOverrideSubmit}
                disabled={saving}
                className={`px-4 py-2 text-sm font-semibold rounded-xl transition-colors flex items-center gap-2
                  ${duplicateModal.overrideChecked
                    ? 'bg-accent-600 hover:bg-accent-700 text-white'
                    : 'bg-surface-200 text-surface-400 cursor-not-allowed'}`}
              >
                {saving && <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>}
                Create User
              </button>
            </div>

          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">

        {/* ── Basic Information ─────────────────────────────────────────── */}
        <div className="bg-white rounded-xl shadow-sm border border-surface-100 p-6">
          <h2 className="text-lg font-semibold mb-4">Basic Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Full Name <span className="text-red-500">*</span>
              </label>
              <input type="text" name="full_name" value={formData.full_name} onChange={handleChange}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-accent-500 ${errors.full_name ? 'border-red-500' : 'border-surface-300'}`} />
              {errors.full_name && <p className="mt-1 text-sm text-red-500">{errors.full_name}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">Employee ID</label>
              <input type="text" name="employee_id" value={formData.employee_id} onChange={handleChange}
                className="w-full px-3 py-2 border border-surface-300 rounded-lg focus:ring-2 focus:ring-accent-500" />
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Username <span className="text-red-500">*</span>
              </label>
              <input type="text" name="username" value={formData.username} onChange={handleChange}
                disabled={isEdit}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-accent-500 ${errors.username ? 'border-red-500' : 'border-surface-300'} ${isEdit ? 'bg-surface-100' : ''}`} />
              {errors.username && <p className="mt-1 text-sm text-red-500">{errors.username}</p>}
            </div>

            {!isEdit && (
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1">
                  Password <span className="text-red-500">*</span>
                </label>
                <input type="password" name="password" value={formData.password} onChange={handleChange}
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-accent-500 ${errors.password ? 'border-red-500' : 'border-surface-300'}`} />
                <p className="mt-1 text-xs text-surface-500">Min 8 chars, uppercase, lowercase, number.</p>
                {errors.password && <p className="mt-1 text-sm text-red-500">{errors.password}</p>}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Email <span className="text-red-500">*</span>
              </label>
              <input type="email" name="email" value={formData.email} onChange={handleChange}
                disabled={isEdit}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-accent-500 ${errors.email ? 'border-red-500' : 'border-surface-300'} ${isEdit ? 'bg-surface-100' : ''}`} />
              {errors.email && <p className="mt-1 text-sm text-red-500">{errors.email}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Contact <span className="text-red-500">*</span>
              </label>
              <input type="text" name="mobile" value={formData.mobile} onChange={handleChange}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-accent-500 ${errors.mobile ? 'border-red-500' : 'border-surface-300'}`} />
              {errors.mobile && <p className="mt-1 text-sm text-red-500">{errors.mobile}</p>}
            </div>
          </div>
        </div>

        {/* ── Organization ─────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl shadow-sm border border-surface-100 p-6">
          <h2 className="text-lg font-semibold mb-4">Organization</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Role <span className="text-red-500">*</span>
              </label>
              <select name="role" value={formData.role} onChange={handleChange}
                className="w-full px-3 py-2 border border-surface-300 rounded-lg focus:ring-2 focus:ring-accent-500">
                {roles.length > 0
                  ? roles.map(r => <option key={r.value} value={r.value}>{r.label}</option>)
                  : <option value={formData.role}>{formData.role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
                }
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">User Type</label>
              <select name="user_type" value={formData.user_type} onChange={handleChange}
                className="w-full px-3 py-2 border border-surface-300 rounded-lg">
                <option value="internal">Internal Employee</option>
                <option value="partner">Partner</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">Department</label>
              <select name="department_id" value={formData.department_id}
                onChange={e => { handleChange(e); if (e.target.value !== 'custom') setDeptCustom('') }}
                className="w-full px-3 py-2 border border-surface-300 rounded-lg">
                <option value="">Select</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                <option value="custom">Custom…</option>
              </select>
              {formData.department_id === 'custom' && (
                <input type="text" value={deptCustom} onChange={e => setDeptCustom(e.target.value)}
                  placeholder="Enter new department"
                  className="mt-2 w-full px-3 py-2 border border-surface-300 rounded-lg focus:ring-2 focus:ring-accent-500" />
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">Designation</label>
              <select name="designation_id" value={formData.designation_id}
                onChange={e => { handleChange(e); if (e.target.value !== 'custom') setDesigCustom('') }}
                className="w-full px-3 py-2 border border-surface-300 rounded-lg">
                <option value="">Select</option>
                {designations.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                <option value="custom">Custom…</option>
              </select>
              {formData.designation_id === 'custom' && (
                <input type="text" value={desigCustom} onChange={e => setDesigCustom(e.target.value)}
                  placeholder="Enter new designation"
                  className="mt-2 w-full px-3 py-2 border border-surface-300 rounded-lg focus:ring-2 focus:ring-accent-500" />
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">Reports To</label>
              <select name="reporting_to" value={formData.reporting_to} onChange={handleChange}
                className="w-full px-3 py-2 border border-surface-300 rounded-lg">
                <option value="">Select</option>
                {users.filter(u => u.id !== id).map(u => (
                  <option key={u.id} value={u.id}>{u.full_name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">Joining Date</label>
              <input type="date" name="joining_date" value={formData.joining_date} onChange={handleChange}
                className="w-full px-3 py-2 border border-surface-300 rounded-lg" />
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">Status</label>
              <select name="status" value={formData.status} onChange={handleChange}
                className="w-full px-3 py-2 border border-surface-300 rounded-lg">
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="pending">Pending</option>
              </select>
            </div>
          </div>
        </div>

        {/* ── Organisation Chart ───────────────────────────────────────── */}
        {isEdit && (
          <div className="bg-white rounded-xl shadow-sm border border-surface-200 overflow-hidden">
            <button
              type="button"
              onClick={() => {
                if (!showOrgTree && orgTree.length === 0) loadOrgTree()
                setShowOrgTree(v => !v)
              }}
              className="w-full flex items-center justify-between px-6 py-4 hover:bg-surface-50 transition-colors"
            >
              <div className="flex items-center gap-2 text-surface-700 font-medium">
                <GitBranch className="w-4 h-4" />
                Organisation Chart
              </div>
              <ChevronDown className={`w-4 h-4 text-surface-400 transition-transform ${showOrgTree ? 'rotate-180' : ''}`} />
            </button>
            {showOrgTree && (
              <div className="px-6 pb-6 border-t border-surface-100">
                {orgTreeLoading ? (
                  <div className="py-8 flex justify-center">
                    <Loader2 className="w-6 h-6 animate-spin text-accent-500" />
                  </div>
                ) : (
                  <OrgTree
                    nodes={orgTree}
                    highlightId={id}
                    filterUserId={currentUser?.role === 'admin' ? null : currentUser?.id}
                  />
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Permissions ───────────────────────────────────────────────── */}
        <div
          ref={permissionsSectionRef}
          className={`bg-white rounded-xl shadow-sm border p-6 ${!isEdit && errors.permissions ? 'border-red-400' : 'border-surface-100'}`}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-accent-600" />
              <h2 className="text-lg font-semibold">
                Permissions
                {!isEdit && <span className="text-red-500 ml-1">*</span>}
              </h2>
            </div>
            <label className="flex items-center gap-2 text-sm text-surface-700 cursor-pointer select-none">
              <input type="checkbox" checked={useCustomPermissions}
                onChange={e => {
                  setUseCustomPermissions(e.target.checked)
                  if (!e.target.checked) setCustomPermissions(new Set())
                  if (errors.permissions) setErrors(prev => ({ ...prev, permissions: null }))
                }}
                className={`rounded text-accent-600 focus:ring-accent-500 ${!isEdit && errors.permissions ? 'border-red-500' : 'border-surface-300'}`} />
              <span className={!isEdit && errors.permissions ? 'text-red-600 font-medium' : ''}>
                Override role permissions for this user
              </span>
            </label>
          </div>

          {/* Permissions required error banner */}
          {!isEdit && errors.permissions && (
            <div className="mb-4 flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3">
              <svg className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
              <p className="text-sm text-red-700 font-medium">{errors.permissions}</p>
            </div>
          )}

          {/* Informational note */}
          <div className="mb-4 rounded-lg bg-blue-50 border border-blue-100 px-4 py-3">
            <p className="text-sm text-blue-800 font-medium mb-1">What is Permission Override?</p>
            <p className="text-sm text-blue-700">
              Every user inherits a default set of permissions based on their <strong>role</strong> (e.g. Admin, Candidate Coordinator).
              When you enable <em>Override role permissions</em>, those role defaults are <strong>replaced</strong> by the exact permissions
              you select below — giving you full control over what this specific user can see and do.
              Use this when a user needs more or fewer permissions than their role normally provides.
            </p>
          </div>

          {useCustomPermissions && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-surface-600">
                  <span className="inline-flex items-center justify-center w-5 h-5 bg-accent-600 text-white text-xs rounded-full mr-1.5">
                    {customPermissions.size}
                  </span>
                  permission{customPermissions.size !== 1 ? 's' : ''} selected
                </p>
                <button type="button" onClick={() => setCustomPermissions(new Set())}
                  className="text-xs text-surface-400 hover:text-red-500 underline">
                  Clear all
                </button>
              </div>

              {/* ── 3-level hierarchical permission matrix ──────────────── */}
              <div className="space-y-3">
                {PERMISSION_SECTIONS.map(sec => {
                  const secPerms = getSectionPerms(sec)
                  const secState = getCheckState(secPerms, customPermissions)
                  return (
                    <div key={sec.section} className="border border-surface-200 rounded-xl overflow-hidden shadow-md">

                      {/* LEVEL 1 – Section header */}
                      <div
                        style={{ background: 'linear-gradient(135deg, #0F0C29 0%, #1C1A4A 100%)' }}
                        className={`flex items-center gap-3 px-4 py-3 border-b border-white/10 border-l-4 transition-all duration-300 hover:brightness-125 ${
                          secState === 'checked'       ? 'border-l-accent-400' :
                          secState === 'indeterminate' ? 'border-l-blue-400'   :
                                                         'border-l-white/20'
                        }`}
                      >
                        <TriCheckbox state={secState} onChange={() => toggleSection(sec)} />
                        <span className={`text-sm font-bold uppercase tracking-widest ${
                          secState === 'checked'       ? 'text-white'    :
                          secState === 'indeterminate' ? 'text-white/80' : 'text-white/60'
                        }`}>
                          {sec.section}
                        </span>
                      </div>

                      {/* LEVEL 2 + 3 – Module rows */}
                      <div className="divide-y divide-surface-100 bg-white">
                        {sec.modules.map(mod => {
                          const modState = getCheckState(mod.perms, customPermissions)
                          return (
                            <div key={`${sec.section}-${mod.label}`}
                              className="flex items-center gap-4 px-4 py-2.5 hover:bg-surface-50">

                              {/* LEVEL 2 – Module checkbox */}
                              <TriCheckbox state={modState} onChange={() => toggleModule(mod)} />
                              <span className="w-40 text-sm font-medium text-surface-800 shrink-0">
                                {mod.label}
                              </span>

                              {/* LEVEL 3 – Individual permission chips */}
                              <div className="flex flex-wrap gap-1.5">
                                {mod.perms.map(perm => {
                                  const on = customPermissions.has(perm)
                                  const action = perm.split(':')[1].replace(/_/g, ' ')
                                  return (
                                    <button
                                      key={perm}
                                      type="button"
                                      onClick={() => togglePermission(perm)}
                                      title={perm}
                                      className={`px-2.5 py-0.5 rounded-full text-xs font-medium border transition-all ${
                                        on
                                          ? 'bg-accent-600 text-white border-accent-600'
                                          : 'bg-white text-surface-500 border-surface-300 hover:border-accent-400 hover:text-accent-600'
                                      }`}
                                    >
                                      {action}
                                    </button>
                                  )
                                })}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* ── Actions ──────────────────────────────────────────────────── */}
        <div className="flex justify-end gap-4">
          <button type="button" onClick={() => navigate('/users')}
            className="px-6 py-2 border border-surface-300 rounded-lg hover:bg-surface-50">
            Cancel
          </button>
          <button type="submit" disabled={saving}
            className="flex items-center gap-2 px-6 py-2 bg-accent-600 hover:bg-accent-700 text-white rounded-lg disabled:opacity-50">
            {saving
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
              : <><Save className="w-4 h-4" /> {isEdit ? 'Update' : 'Create'}</>
            }
          </button>
        </div>
      </form>
    </div>
  )
}

export default UserForm
