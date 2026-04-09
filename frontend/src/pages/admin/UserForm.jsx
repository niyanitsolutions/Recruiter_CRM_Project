import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Save, Loader2, Shield, GitBranch, ChevronDown } from 'lucide-react'
import toast from 'react-hot-toast'
import userService from '../../services/userService'
import departmentService from '../../services/departmentService'
import designationService from '../../services/designationService'
import OrgTree from '../../components/OrgTree'

// ── Department-based permission system ───────────────────────────────────────

const MODULE_PERMS = {
  users:              ['users:view','users:create','users:edit','users:delete','users:manage_roles'],
  roles:              ['roles:view','roles:create','roles:edit','roles:delete'],
  partners:           ['partners:view','partners:create','partners:edit','partners:delete'],
  departments:        ['departments:view','departments:create','departments:edit','departments:delete'],
  designations:       ['designations:view','designations:create','designations:edit','designations:delete'],
  clients:            ['clients:view','clients:create','clients:edit','clients:delete'],
  jobs:               ['jobs:view','jobs:create','jobs:edit','jobs:delete'],
  interviews:         ['interviews:view','interviews:schedule','interviews:update_status'],
  interview_settings: ['interview_settings:view','interview_settings:create','interview_settings:edit','interview_settings:delete'],
  onboards:           ['onboards:view','onboards:create','onboards:edit'],
  candidates:         ['candidates:view','candidates:create','candidates:edit','candidates:delete','candidates:assign'],
  accounts:           ['accounts:view','accounts:invoices','accounts:payouts'],
  payouts:            ['payouts:view','payouts:edit'],
  invoices:           ['invoices:view','invoices:approve'],
  imports:            ['imports:view','imports:create'],
  exports:            ['exports:view','exports:create'],
  targets:            ['targets:view','targets:create','targets:edit','targets:delete','targets:admin'],
  analytics:          ['analytics:view','analytics:edit'],
  reports:            ['reports:view','reports:export'],
  crm_settings:       ['crm_settings:view','crm_settings:edit'],
  audit:              ['audit:view','audit:sessions','audit:alerts','audit:admin'],
  notifications:      ['notifications:create'],
}

const MODULE_LABELS = {
  users: 'Users', roles: 'Roles', partners: 'Partners', departments: 'Departments',
  designations: 'Designations', clients: 'Clients', jobs: 'Jobs',
  interviews: 'Interviews', interview_settings: 'Interview Settings',
  onboards: 'Onboards', candidates: 'Candidates', accounts: 'Accounts',
  payouts: 'Payouts', invoices: 'Invoices', imports: 'Imports',
  exports: 'Exports', targets: 'Targets', analytics: 'Analytics',
  reports: 'Reports', crm_settings: 'CRM Settings', audit: 'Audit',
  notifications: 'Notifications',
}

const DEPT_MODULES = {
  owner:                { full: Object.keys(MODULE_PERMS), view_only: [] },
  admin:                { full: ['users','roles','partners','departments','designations','clients','jobs','interviews','interview_settings','candidates','onboards','accounts','payouts','invoices','imports','exports','targets','analytics','crm_settings','audit','notifications'], view_only: ['reports'] },
  client_coordinator:   { full: ['clients','jobs','interviews','interview_settings','onboards'], view_only: ['candidates','reports'] },
  candidate_coordinator:{ full: ['candidates','interviews','interview_settings'], view_only: ['jobs','clients','onboards','reports'] },
  recruiter:            { full: ['candidates','interviews','clients','jobs'], view_only: ['onboards','reports'] },
  hr:                   { full: ['users','candidates','onboards'], view_only: ['reports'] },
  accounts:             { full: ['accounts','payouts','invoices','imports','exports'], view_only: ['clients','partners','reports'] },
  partner:              { full: ['candidates'], view_only: ['jobs','interviews'] },
}

const PERM_DEPT_OPTIONS = [
  { value: 'owner',                 label: 'Owner' },
  { value: 'admin',                 label: 'Admin' },
  { value: 'client_coordinator',    label: 'Client Coordinator' },
  { value: 'candidate_coordinator', label: 'Candidate Coordinator' },
  { value: 'recruiter',             label: 'Recruiter' },
  { value: 'hr',                    label: 'HR' },
  { value: 'accounts',              label: 'Accounts' },
  { value: 'partner',               label: 'Partner' },
]

const DEPT_TO_ROLE = {
  owner:                'admin',
  admin:                'admin',
  client_coordinator:   'client_coordinator',
  candidate_coordinator:'candidate_coordinator',
  recruiter:            'candidate_coordinator',
  hr:                   'hr',
  accounts:             'accounts',
  partner:              'partner',
}

const ROLE_TO_DEPT = {
  admin:                'admin',
  client_coordinator:   'client_coordinator',
  candidate_coordinator:'candidate_coordinator',
  hr:                   'hr',
  accounts:             'accounts',
  partner:              'partner',
}

// Guess permDept from a free-form department name string
function guessDeptFromName(name) {
  if (!name) return ''
  const n = name.toLowerCase()
  if (/partner/.test(n)) return 'partner'
  if (/account|finance|billing|payment/.test(n)) return 'accounts'
  if (/hr|human.?resource/.test(n)) return 'hr'
  if (/client|sales|business.?dev|bd/.test(n)) return 'client_coordinator'
  if (/recruit|talent|candidate|sourcing/.test(n)) return 'candidate_coordinator'
  if (/admin|management|operation/.test(n)) return 'admin'
  return ''
}

function computePermissions(dept, level, restrictedMods, additionalDepts) {
  if (!dept) return ['dashboard:view']
  const cfg = DEPT_MODULES[dept]
  if (!cfg) return ['dashboard:view']

  // Owner = full access to every module at every level — no delete restriction, no restrict-modules
  if (dept === 'owner') {
    const all = new Set(['dashboard:view'])
    Object.values(MODULE_PERMS).forEach(perms => perms.forEach(p => all.add(p)))
    return [...all]
  }

  const fullMods = new Set(cfg.full)
  const viewMods = new Set(cfg.view_only)

  // Issue 6: merge additional departments (union of permissions)
  ;(additionalDepts || []).forEach(d => {
    const addCfg = DEPT_MODULES[d]
    if (!addCfg) return
    addCfg.full.forEach(m => fullMods.add(m))
    addCfg.view_only.forEach(m => viewMods.add(m))
  })

  const perms = new Set(['dashboard:view'])

  // Issue 7: executive → no delete; manager → all including delete
  fullMods.forEach(mod => {
    ;(MODULE_PERMS[mod] || []).forEach(p => {
      if (level === 'executive' && p.endsWith(':delete')) return
      perms.add(p)
    })
  })

  viewMods.forEach(mod => {
    ;(MODULE_PERMS[mod] || []).filter(p => p.endsWith(':view')).forEach(p => perms.add(p))
  })

  // Issue 5: remove all permissions for restricted modules
  ;(restrictedMods || []).forEach(mod => {
    ;(MODULE_PERMS[mod] || []).forEach(p => perms.delete(p))
  })

  return [...perms]
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

  // ── Permission system state ──────────────────────────────────────────────
  const [permDept,     setPermDept]     = useState('')
  const [permLevel,    setPermLevel]    = useState('executive')
  const [restrictOn,   setRestrictOn]   = useState(false)
  const [restrictMods, setRestrictMods] = useState([])
  const [addDeptsOn,   setAddDeptsOn]   = useState(false)
  const [addDepts,     setAddDepts]     = useState([])
  const permissionsSectionRef = useRef(null)

  const computedPermissions = useMemo(
    () => computePermissions(permDept, permLevel, restrictOn ? restrictMods : [], addDeptsOn ? addDepts : []),
    [permDept, permLevel, restrictOn, restrictMods, addDeptsOn, addDepts]
  )

  // Partner users get a fixed permission set — permissions section is hidden
  const isPartner = formData.user_type === 'partner'

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
        // Restore permission configuration for internal users.
        // Use stored config fields as source of truth; fall back to inference
        // for legacy users created before these fields were introduced.
        if (user.user_type !== 'partner') {
          const dept =
            user.primary_department ||
            (user.designation === 'Owner' ? 'owner' : (ROLE_TO_DEPT[user.role] || 'admin'))
          setPermDept(dept)

          const lvl =
            user.level ||
            ((user.permissions || []).some(p => p.endsWith(':delete')) ? 'manager' : 'executive')
          setPermLevel(lvl)

          // Restore Restrict Modules
          if (user.restricted_modules && user.restricted_modules.length > 0) {
            setRestrictOn(true)
            setRestrictMods(user.restricted_modules)
          } else {
            setRestrictOn(false)
            setRestrictMods([])
          }

          // Restore Assign Other Departments
          if (user.assigned_departments && user.assigned_departments.length > 0) {
            setAddDeptsOn(true)
            setAddDepts(user.assigned_departments)
          } else {
            setAddDeptsOn(false)
            setAddDepts([])
          }
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
    // Clear error for this field as soon as user starts correcting it
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: null }))
  }

  // ── Per-field blur validation ─────────────────────────────────────────────
  const handleBlur = (e) => {
    const { name, value } = e.target
    const next = { ...errors }

    switch (name) {
      case 'full_name':
        if (!value.trim()) next.full_name = 'Full name is required'
        else if (value.trim().length < 2) next.full_name = 'Minimum 2 characters'
        else delete next.full_name
        break
      case 'username':
        if (!value.trim()) next.username = 'Username is required'
        else if (value.length < 3) next.username = 'Minimum 3 characters'
        else if (!/^[a-zA-Z0-9_]+$/.test(value)) next.username = 'Letters, numbers, and underscores only'
        else delete next.username
        break
      case 'email':
        if (!value.trim()) next.email = 'Email is required'
        else if (!/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(value)) next.email = 'Invalid email format'
        else delete next.email
        break
      case 'mobile': {
        const digits = value.replace(/\D/g, '')
        if (!value.trim()) next.mobile = 'Contact number is required'
        else if (!/^[6-9]\d{9}$/.test(digits)) next.mobile = 'Must start with 6–9 and be exactly 10 digits'
        else delete next.mobile
        break
      }
      case 'password':
        if (!isEdit) {
          if (!value) next.password = 'Password is required'
          else if (value.length < 8) next.password = 'Minimum 8 characters'
          else if (!/[A-Z]/.test(value)) next.password = 'Must contain at least one uppercase letter'
          else if (!/[a-z]/.test(value)) next.password = 'Must contain at least one lowercase letter'
          else if (!/\d/.test(value)) next.password = 'Must contain at least one number'
          else delete next.password
        }
        break
      default:
        break
    }
    setErrors(next)
  }

  // ── Validation & submit ──────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault()
    const newErrors = {}
    if (!formData.full_name.trim()) {
      newErrors.full_name = 'Full name is required'
    } else if (formData.full_name.trim().length < 2) {
      newErrors.full_name = 'Minimum 2 characters'
    }
    if (!formData.username.trim()) {
      newErrors.username = 'Username is required'
    } else if (!isEdit && !/^[a-zA-Z0-9_]+$/.test(formData.username)) {
      newErrors.username = 'Letters, numbers, and underscores only'
    }
    if (!formData.email.trim()) {
      newErrors.email = 'Email is required'
    } else if (!/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(formData.email)) {
      newErrors.email = 'Invalid email format'
    }
    const mobileDigits = formData.mobile.replace(/\D/g, '')
    if (!formData.mobile.trim()) {
      newErrors.mobile = 'Contact number is required'
    } else if (!/^[6-9]\d{9}$/.test(mobileDigits)) {
      newErrors.mobile = 'Must start with 6–9 and be exactly 10 digits'
    }
    if (!isEdit) {
      if (!formData.password) {
        newErrors.password = 'Password is required'
      } else {
        if (formData.password.length < 8)          newErrors.password = 'Minimum 8 characters'
        else if (!/[A-Z]/.test(formData.password)) newErrors.password = 'Must contain at least one uppercase letter'
        else if (!/[a-z]/.test(formData.password)) newErrors.password = 'Must contain at least one lowercase letter'
        else if (!/\d/.test(formData.password))    newErrors.password = 'Must contain at least one number'
      }
      if (!isPartner && !permDept) {
        newErrors.permissions = 'Please select a Department to assign permissions.'
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
          const deptRes = await departmentService.createDepartment({ name: deptName })
          const created = deptRes.data
          if (created?.id) {
            departmentId   = created.id
            departmentName = created.name || deptName
            setDepartments(prev => [...prev, created])
          }
        } catch (createErr) {
          const msg = createErr?.response?.data?.detail || createErr?.response?.data?.message || ''
          if (typeof msg === 'string' && msg.toLowerCase().includes('already exists')) {
            // Department already exists — reuse it instead of failing
            const listRes = await departmentService.getDepartments()
            const existing = (listRes.data || []).find(
              d => d.name?.toLowerCase().trim() === deptName.toLowerCase().trim()
            )
            if (existing) {
              departmentId   = existing.id
              departmentName = existing.name || deptName
            } else {
              throw createErr
            }
          } else {
            throw createErr
          }
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

      if (isPartner) {
        // Partner: fixed role + user_type, no permissions sent (backend uses ROLE_PERMISSIONS['partner'])
        submitData.role      = 'partner'
        submitData.user_type = 'partner'
        delete submitData.permissions
        // Clear config fields for partners — they have no department-based config
        delete submitData.primary_department
        delete submitData.level
        delete submitData.assigned_departments
        delete submitData.restricted_modules
      } else if (permDept) {
        // Internal: send computed permissions AND the config fields that generated them
        submitData.permissions          = computedPermissions
        submitData.role                 = DEPT_TO_ROLE[permDept] || submitData.role
        submitData.user_type            = 'internal'
        submitData.primary_department   = permDept
        submitData.level                = permLevel
        submitData.assigned_departments = addDeptsOn ? addDepts : []
        submitData.restricted_modules   = restrictOn ? restrictMods : []
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
        toast.success('User created successfully. Share credentials manually.')
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
      } else {
        // Use clean message from backend (422 now returns {success, message}, others return detail string)
        const msg = err.response?.data?.message || (typeof detail === 'string' ? detail : null)
        setError(msg || 'Failed to save user. Please try again.')
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
      const msg = err.response?.data?.message
      setError(typeof detail === 'string' ? detail : msg || 'Failed to create user')
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
              <input type="text" name="full_name" value={formData.full_name} onChange={handleChange} onBlur={handleBlur}
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
              <input type="text" name="username" value={formData.username} onChange={handleChange} onBlur={handleBlur}
                disabled={isEdit}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-accent-500 ${errors.username ? 'border-red-500' : 'border-surface-300'} ${isEdit ? 'bg-surface-100' : ''}`} />
              {errors.username && <p className="mt-1 text-sm text-red-500">{errors.username}</p>}
            </div>

            {!isEdit && (
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1">
                  Password <span className="text-red-500">*</span>
                </label>
                <input type="password" name="password" value={formData.password} onChange={handleChange} onBlur={handleBlur}
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-accent-500 ${errors.password ? 'border-red-500' : 'border-surface-300'}`} />
                <p className="mt-1 text-xs text-surface-500">Min 8 chars, uppercase, lowercase, number.</p>
                {errors.password && <p className="mt-1 text-sm text-red-500">{errors.password}</p>}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Email <span className="text-red-500">*</span>
              </label>
              <input type="email" name="email" value={formData.email} onChange={handleChange} onBlur={handleBlur}
                disabled={isEdit}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-accent-500 ${errors.email ? 'border-red-500' : 'border-surface-300'} ${isEdit ? 'bg-surface-100' : ''}`} />
              {errors.email && <p className="mt-1 text-sm text-red-500">{errors.email}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Contact <span className="text-red-500">*</span>
              </label>
              <input type="text" name="mobile" value={formData.mobile} onChange={handleChange} onBlur={handleBlur}
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
                onChange={e => {
                  handleChange(e)
                  if (e.target.value !== 'custom') setDeptCustom('')
                  // Auto-suggest permDept only if not already set
                  if (!permDept && e.target.value && e.target.value !== 'custom') {
                    const deptName = departments.find(d => d.id === e.target.value)?.name || ''
                    const suggested = guessDeptFromName(deptName)
                    if (suggested) setPermDept(suggested)
                  }
                }}
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

        {/* ── Permissions (hidden for partner — they get a fixed set) ──── */}
        {!isPartner && <div
          ref={permissionsSectionRef}
          className={`bg-white rounded-xl shadow-sm border p-6 ${!isEdit && errors.permissions ? 'border-red-400' : 'border-surface-100'}`}
        >
          <div className="flex items-center gap-2 mb-4">
            <Shield className="w-5 h-5 text-accent-600" />
            <h2 className="text-lg font-semibold">
              Permissions
              {!isEdit && <span className="text-red-500 ml-1">*</span>}
            </h2>
          </div>

          {!isEdit && errors.permissions && (
            <div className="mb-4 flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3">
              <p className="text-sm text-red-700 font-medium">{errors.permissions}</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* A: Department */}
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Department <span className="text-red-500">*</span>
              </label>
              <select
                value={permDept}
                onChange={e => {
                  setPermDept(e.target.value)
                  setRestrictMods([])
                  setAddDepts([])
                  if (errors.permissions) setErrors(prev => ({ ...prev, permissions: null }))
                }}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-accent-500 ${!isEdit && errors.permissions ? 'border-red-500' : 'border-surface-300'}`}
              >
                <option value="">Select department…</option>
                {PERM_DEPT_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            {/* B: Level */}
            {permDept && permDept !== 'owner' && (
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1">Level</label>
                <select
                  value={permLevel}
                  onChange={e => setPermLevel(e.target.value)}
                  className="w-full px-3 py-2 border border-surface-300 rounded-lg focus:ring-2 focus:ring-accent-500"
                >
                  <option value="executive">Executive (view / create / modify)</option>
                  <option value="manager">Manager (view / create / modify / delete)</option>
                </select>
              </div>
            )}
          </div>

          {permDept && (
            <div className="mt-4 space-y-3">
              {/* C: Restrict Modules */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-surface-700 cursor-pointer select-none">
                  <input type="checkbox" checked={restrictOn}
                    onChange={e => { setRestrictOn(e.target.checked); setRestrictMods([]) }}
                    className="rounded border-surface-300 text-accent-600 focus:ring-accent-500" />
                  Restrict Modules
                </label>
                {restrictOn && (
                  <div className="mt-2 pl-6 flex flex-wrap gap-3">
                    {[...(DEPT_MODULES[permDept]?.full || []), ...(DEPT_MODULES[permDept]?.view_only || [])].map(mod => (
                      <label key={mod} className="flex items-center gap-1.5 text-sm text-surface-700 cursor-pointer">
                        <input type="checkbox"
                          checked={restrictMods.includes(mod)}
                          onChange={() => setRestrictMods(prev =>
                            prev.includes(mod) ? prev.filter(m => m !== mod) : [...prev, mod]
                          )}
                          className="rounded border-surface-300 text-red-500 focus:ring-red-400" />
                        {MODULE_LABELS[mod]}
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* D: Assign Other Departments */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-surface-700 cursor-pointer select-none">
                  <input type="checkbox" checked={addDeptsOn}
                    onChange={e => { setAddDeptsOn(e.target.checked); setAddDepts([]) }}
                    className="rounded border-surface-300 text-accent-600 focus:ring-accent-500" />
                  Assign Other Departments
                </label>
                {addDeptsOn && (
                  <div className="mt-2 pl-6 flex flex-wrap gap-3">
                    {PERM_DEPT_OPTIONS.filter(o => o.value !== permDept && o.value !== 'owner').map(opt => (
                      <label key={opt.value} className="flex items-center gap-1.5 text-sm text-surface-700 cursor-pointer">
                        <input type="checkbox"
                          checked={addDepts.includes(opt.value)}
                          onChange={() => setAddDepts(prev =>
                            prev.includes(opt.value) ? prev.filter(d => d !== opt.value) : [...prev, opt.value]
                          )}
                          className="rounded border-surface-300 text-accent-600 focus:ring-accent-500" />
                        {opt.label}
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Permission Preview */}
              <div className="rounded-lg bg-surface-50 border border-surface-200 px-4 py-3">
                <p className="text-xs font-semibold text-surface-600 mb-2">
                  {computedPermissions.length} permissions will be assigned
                </p>
                <div className="flex flex-wrap gap-1">
                  {[...computedPermissions].sort().map(p => (
                    <span key={p} className="px-2 py-0.5 bg-accent-100 text-accent-700 text-xs rounded-full font-mono">
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>}

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
