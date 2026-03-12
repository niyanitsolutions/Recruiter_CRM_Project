import { useState, useEffect, useRef } from 'react'
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

  // ── Load reference data ──────────────────────────────────────────────────
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [deptsRes, desigsRes, usersRes] = await Promise.all([
          departmentService.getDepartments(),
          designationService.getDesignations(),
          userService.getUsers({ page_size: 100 }),
        ])
        setDepartments(deptsRes.data || [])
        setDesignations(desigsRes.data || [])
        setUsers(usersRes.data || [])
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
    }
    setErrors(newErrors)
    if (Object.keys(newErrors).length > 0) return

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
      const detail = err.response?.data?.detail
      if (Array.isArray(detail)) {
        setError(detail.map(d => d.msg?.replace('Value error, ', '') || d.msg).join('; '))
      } else {
        setError(detail || 'Failed to save')
      }
    } finally { setSaving(false) }
  }

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
        <div className="bg-white rounded-xl shadow-sm border border-surface-100 p-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-accent-600" />
              <h2 className="text-lg font-semibold">Permissions</h2>
            </div>
            <label className="flex items-center gap-2 text-sm text-surface-700 cursor-pointer select-none">
              <input type="checkbox" checked={useCustomPermissions}
                onChange={e => {
                  setUseCustomPermissions(e.target.checked)
                  if (!e.target.checked) setCustomPermissions(new Set())
                }}
                className="rounded border-surface-300 text-accent-600 focus:ring-accent-500" />
              <span>Override role permissions for this user</span>
            </label>
          </div>

          <p className="text-sm text-surface-500 mb-4">
            By default, this user inherits the permissions assigned to their role.
            Enable the toggle above to grant or restrict specific permissions for this user only.
          </p>

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
