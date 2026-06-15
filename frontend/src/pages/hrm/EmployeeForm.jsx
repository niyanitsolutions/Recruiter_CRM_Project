import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom'
import { useSelector } from 'react-redux'
import {
  ArrowLeft, Save, ChevronDown, ChevronUp, Loader2,
  User, Briefcase, CreditCard, Phone, GraduationCap,
  ShieldCheck, FileText, Plus, Trash2, Upload, Info, Link2,
  KeyRound, Shield, CheckCircle, AlertCircle, UserPlus,
} from 'lucide-react'
import hrmService from '../../services/hrmService'
import userService from '../../services/userService'
import departmentService from '../../services/departmentService'
import designationService from '../../services/designationService'
import toast from 'react-hot-toast'
import { useFormValidation, validators } from '../../hooks/useFormValidation'
import ModalPortal from '../../components/common/ModalPortal'

// ═══════════════════════════════════════════════════════════════════
// Permission computation — identical to UserForm.jsx
// ═══════════════════════════════════════════════════════════════════

const MODULE_PERMS = {
  users: ['users:view','users:create','users:edit','users:delete','users:manage_roles'],
  roles: ['roles:view','roles:create','roles:edit','roles:delete'],
  partners: ['partners:view','partners:create','partners:edit','partners:delete'],
  departments: ['departments:view','departments:create','departments:edit','departments:delete'],
  designations: ['designations:view','designations:create','designations:edit','designations:delete'],
  clients: ['clients:view','clients:create','clients:edit','clients:delete'],
  jobs: ['jobs:view','jobs:create','jobs:edit','jobs:delete'],
  interviews: ['interviews:view','interviews:schedule','interviews:update_status'],
  interviews_no_schedule: ['interviews:view','interviews:update_status'],
  interview_settings: ['interview_settings:view','interview_settings:create','interview_settings:edit','interview_settings:delete'],
  onboards: ['onboards:view','onboards:create','onboards:edit'],
  candidates: ['candidates:view','candidates:create','candidates:edit','candidates:delete','candidates:assign'],
  accounts: ['accounts:view','accounts:invoices','accounts:payouts'],
  payouts: ['payouts:view','payouts:edit'],
  invoices: ['invoices:view','invoices:approve'],
  imports: ['imports:view','imports:create'],
  exports: ['exports:view','exports:create'],
  targets: ['targets:view','targets:create','targets:edit','targets:delete','targets:admin'],
  tasks: ['tasks:view','tasks:create','tasks:edit'],
  analytics: ['analytics:view','analytics:edit'],
  reports: ['reports:view','reports:export'],
  crm_settings: ['crm_settings:view','crm_settings:edit'],
  audit: ['audit:view','audit:sessions','audit:alerts','audit:admin'],
  notifications: ['notifications:create'],
  hrm_employees: ['hrm:employees:view','hrm:employees:manage'],
  hrm_attendance: ['hrm:attendance:self','hrm:attendance:team','hrm:attendance:manage'],
  hrm_leaves: ['hrm:leave:apply','hrm:leave:team_approve','hrm:leave:manage'],
  hrm_payroll: ['hrm:payroll:view_self','hrm:payroll:manage'],
  hrm_performance: ['hrm:performance:self','hrm:performance:team','hrm:performance:manage'],
  hrm_announcements: ['hrm:announcements:view','hrm:announcements:manage'],
  hrm_requisitions: ['hrm:hiring:view','hrm:hiring:manage'],
  hrm_internal_jobs: ['hrm:hiring:view','hrm:hiring:manage'],
  hrm_internal_apps: ['hrm:hiring:view','hrm:hiring:manage'],
  hrm_referrals: ['hrm:hiring:view','hrm:hiring:manage'],
  hrm_assets: ['hrm:assets:view','hrm:assets:manage'],
  hrm_exit: ['hrm:exit:view','hrm:exit:manage'],
}

const MODULE_LABELS = {
  users:'Users', roles:'Roles', partners:'Partners', departments:'Departments',
  designations:'Designations', clients:'Clients', jobs:'Jobs',
  interviews:'Interviews', interview_settings:'Interview Settings',
  onboards:'Onboards', candidates:'Candidates', accounts:'Accounts',
  payouts:'Payouts', invoices:'Invoices', imports:'Imports',
  exports:'Exports', targets:'Targets', tasks:'Tasks', analytics:'Analytics',
  reports:'Reports', crm_settings:'CRM Settings', audit:'Audit',
  notifications:'Notifications',
  hrm_employees:'Employees', hrm_attendance:'Attendance', hrm_leaves:'Leaves',
  hrm_payroll:'Payroll', hrm_performance:'Performance', hrm_announcements:'Announcements',
  hrm_requisitions:'Job Requisitions', hrm_internal_jobs:'Internal Job Board',
  hrm_internal_apps:'Internal Applications', hrm_referrals:'Referrals',
  hrm_assets:'Assets', hrm_exit:'Exit Management',
}

const DEPT_MODULES = {
  owner:                { full: Object.keys(MODULE_PERMS), view_only: [] },
  admin:                { full: ['users','roles','partners','departments','designations','interview_settings','targets','tasks','imports','exports','crm_settings','audit','notifications'], view_only: ['reports','analytics'] },
  client_coordinator:   { full: ['clients','jobs','interviews','interview_settings','onboards'], view_only: ['candidates','reports'] },
  candidate_coordinator:{ full: ['candidates','interviews_no_schedule','interview_settings'], view_only: ['jobs','clients','onboards','reports'] },
  recruiter:            { full: ['candidates','interviews','clients','jobs','interview_settings'], view_only: ['onboards','reports'] },
  hr:                   { full: ['users','candidates','onboards','hrm_employees','hrm_attendance','hrm_leaves','hrm_payroll','hrm_performance','hrm_announcements','hrm_requisitions','hrm_internal_jobs','hrm_internal_apps','hrm_referrals','hrm_assets','hrm_exit'], view_only: ['reports'] },
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
  owner:'admin', admin:'admin', client_coordinator:'client_coordinator',
  candidate_coordinator:'candidate_coordinator', recruiter:'recruiter',
  hr:'hr', accounts:'accounts', partner:'partner',
}

const ROLE_TO_DEPT = {
  admin:'admin', client_coordinator:'client_coordinator',
  candidate_coordinator:'candidate_coordinator', recruiter:'recruiter',
  hr:'hr', accounts:'accounts', partner:'partner',
}

function guessDeptFromName(name) {
  if (!name) return ''
  const n = name.toLowerCase()
  if (/partner/.test(n)) return 'partner'
  if (/account|finance|billing|payment/.test(n)) return 'accounts'
  if (/hr|human.?resource/.test(n)) return 'hr'
  if (/client|sales|business.?dev|bd/.test(n)) return 'client_coordinator'
  if (/recruit|talent|sourcing/.test(n)) return 'recruiter'
  if (/candidate/.test(n)) return 'candidate_coordinator'
  if (/admin|management|operation/.test(n)) return 'admin'
  return ''
}

function computePermissions(dept, level, restrictedMods, additionalDepts) {
  if (!dept) return ['dashboard:view']
  const cfg = DEPT_MODULES[dept]
  if (!cfg) return ['dashboard:view']
  if (dept === 'owner') {
    const all = new Set(['dashboard:view'])
    Object.values(MODULE_PERMS).forEach(perms => perms.forEach(p => all.add(p)))
    return [...all]
  }
  const fullMods = new Set(cfg.full)
  const viewMods = new Set(cfg.view_only)
  ;(additionalDepts || []).forEach(d => {
    const c = DEPT_MODULES[d]
    if (!c) return
    c.full.forEach(m => fullMods.add(m))
    c.view_only.forEach(m => viewMods.add(m))
  })
  const perms = new Set(['dashboard:view'])
  fullMods.forEach(mod => {
    ;(MODULE_PERMS[mod] || []).forEach(p => {
      if (level === 'executive' && p.endsWith(':delete')) return
      perms.add(p)
    })
  })
  viewMods.forEach(mod => {
    ;(MODULE_PERMS[mod] || []).filter(p =>
      p.endsWith(':view') || p.endsWith(':self') || p.endsWith(':view_self')
    ).forEach(p => perms.add(p))
  })
  ;(restrictedMods || []).forEach(mod => {
    ;(MODULE_PERMS[mod] || []).forEach(p => perms.delete(p))
  })
  return [...perms]
}

// ═══════════════════════════════════════════════════════════════════
// UI building blocks
// ═══════════════════════════════════════════════════════════════════

const Section = ({ icon: Icon, title, color = 'indigo', children, defaultOpen = true, badge }) => {
  const [open, setOpen] = useState(defaultOpen)
  const colorMap = {
    indigo:'bg-indigo-50 text-indigo-600', blue:'bg-blue-50 text-blue-600',
    green:'bg-green-50 text-green-600', purple:'bg-purple-50 text-purple-600',
    orange:'bg-orange-50 text-orange-600', red:'bg-red-50 text-red-600',
    teal:'bg-teal-50 text-teal-600', violet:'bg-violet-50 text-violet-600',
  }
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors">
        <div className="flex items-center gap-3">
          <span className={`w-8 h-8 rounded-lg flex items-center justify-center ${colorMap[color]||colorMap.indigo}`}>
            <Icon className="w-4 h-4" />
          </span>
          <h3 className="font-semibold text-gray-900">{title}</h3>
          {badge}
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>
      {open && <div className="px-6 pb-6 pt-2 border-t border-gray-100">{children}</div>}
    </div>
  )
}

const Field = ({ label, required, error, children, className='' }) => (
  <div className={className}>
    <label className="block text-sm font-medium text-gray-700 mb-1">
      {label}{required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
    {children}
    {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
  </div>
)

const inp = "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/30 focus:border-indigo-500"
const inpErr = "w-full px-3 py-2 border border-red-400 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-300 focus:border-red-500"
const sel = inp + " bg-white"

const EmpInput = (props) => <input className={inp} {...props} />
const EmpSelect = ({ options=[], ...props }) => (
  <select className={sel} {...props}>
    {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
  </select>
)
const EmpTextarea = (props) => (
  <textarea rows={3} className={inp + " resize-none"} {...props} />
)

// ═══════════════════════════════════════════════════════════════════
// Employee form constants
// ═══════════════════════════════════════════════════════════════════

const EMPTY_EMP = {
  full_name:'', email:'', phone:'',
  gender:'', date_of_birth:'', blood_group:'',
  street:'', city:'', state:'', zip_code:'', country:'India',
  pan_number:'', aadhaar_number:'',
  designation_name:'', department_name:'',
  reporting_manager_id:'', employment_type:'full_time',
  date_of_joining:'', work_location:'',
  shift_start_time:'09:00', shift_end_time:'18:00', work_description:'',
  ctc:'', basic:'', hra:'', special_allowance:'',
  bank_name:'', account_number:'', ifsc_code:'', account_holder_name:'',
  pf_number:'', uan_number:'',
  bg_status:'pending', bg_notes:'',
}

const EMPTY_USER = {
  username:'', email:'', full_name:'', mobile:'', password:'',
  employee_id:'', role:'candidate_coordinator', user_type:'internal',
  department_id:'', designation_id:'', reporting_to:'',
  joining_date:'', status:'active',
}

// ═══════════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════════

export default function EmployeeForm() {
  const navigate  = useNavigate()
  const { id }    = useParams()
  const [searchParams] = useSearchParams()
  const isEdit    = !!id
  const fileRef   = useRef(null)
  const permRef   = useRef(null)
  const currentUser = useSelector(s => s.auth.user)

  // ── Loading / saving / error ─────────────────────────────────────
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')

  // ── Employee form state ──────────────────────────────────────────
  const [form, setForm]   = useState({ ...EMPTY_EMP })
  const [emergencyContacts, setEmergencyContacts] = useState([{ name:'', relationship:'', phone:'', email:'' }])
  const [qualifications,    setQualifications]    = useState([])
  const [disciplinary,      setDisciplinary]      = useState([])
  const [documents,         setDocuments]         = useState([])
  const [uploadingDoc,      setUploadingDoc]      = useState(false)
  const [docType,           setDocType]           = useState('offer_letter')
  const [docName,           setDocName]           = useState('')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // ── Employee validation ──────────────────────────────────────────
  const { errors: fErrors, touched: fTouched, touch, validate: fValidate } = useFormValidation({
    full_name: validators.required('Full name'),
    email:     validators.compose(validators.required('Email'), validators.email()),
    phone:     validators.compose(validators.mobile()),
  })

  // ── User Account section state ──────────────────────────────────
  const [createAccount, setCreateAccount] = useState(true)   // default ON
  const [uForm, setUForm]       = useState({ ...EMPTY_USER })
  const [uErrors, setUErrors]   = useState({})
  const [deptCustom, setDeptCustom]   = useState('')
  const [desigCustom, setDesigCustom] = useState('')
  const [departments,  setDepartments]  = useState([])
  const [designations, setDesignations] = useState([])
  const [users,        setUsers]        = useState([])
  const [permDept,     setPermDept]     = useState('')
  const [permLevel,    setPermLevel]    = useState('executive')
  const [restrictOn,   setRestrictOn]   = useState(false)
  const [restrictMods, setRestrictMods] = useState([])
  const [addDeptsOn,   setAddDeptsOn]   = useState(false)
  const [addDepts,     setAddDepts]     = useState([])
  const [duplicateModal, setDuplicateModal] = useState({
    show: false, fields: {}, overrideChecked: false, overrideTouched: false,
  })
  const pendingPayload = useRef(null)

  const isPartner = uForm.user_type === 'partner'
  const computedPermissions = useMemo(
    () => computePermissions(permDept, permLevel, restrictOn ? restrictMods : [], addDeptsOn ? addDepts : []),
    [permDept, permLevel, restrictOn, restrictMods, addDeptsOn, addDepts]
  )

  // ── Linked user state (MODE B) ──────────────────────────────────
  const [linkedUserId, setLinkedUserId]   = useState('')
  const [linkedUserInfo, setLinkedUserInfo] = useState(null)
  const [prefillBanner, setPrefillBanner]   = useState('')

  // ── Reference data load — identical calls to UserForm ───────────
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
      } catch (err) { console.error('EmployeeForm: reference data load failed', err) }
    }
    fetchData()
  }, [])

  // ── Load existing employee (edit mode) ──────────────────────────
  useEffect(() => {
    if (!isEdit) return
    hrmService.getEmployee(id).then(r => {
      const e = r.data
      setForm({
        full_name:        e.full_name          || '',
        email:            e.email              || '',
        phone:            e.phone              || '',
        gender:           e.gender             || '',
        date_of_birth:    e.date_of_birth      || '',
        blood_group:      e.blood_group        || '',
        street:           e.address_info?.street    || '',
        city:             e.address_info?.city      || '',
        state:            e.address_info?.state     || '',
        zip_code:         e.address_info?.zip_code  || '',
        country:          e.address_info?.country   || 'India',
        pan_number:       e.pan_number         || '',
        aadhaar_number:   e.aadhaar_number     || '',
        designation_name: e.designation_name  || '',
        department_name:  e.department_name   || '',
        reporting_manager_id: e.reporting_manager_id || '',
        employment_type:  e.employment_type   || 'full_time',
        date_of_joining:  e.date_of_joining   || '',
        work_location:    e.work_location     || '',
        shift_start_time: e.shift_start_time  || '09:00',
        shift_end_time:   e.shift_end_time    || '18:00',
        work_description: e.work_description  || '',
        ctc:              e.salary?.ctc            || '',
        basic:            e.salary?.basic          || '',
        hra:              e.salary?.hra             || '',
        special_allowance: e.salary?.special_allowance || '',
        bank_name:        e.bank_details?.bank_name   || '',
        account_number:   e.bank_details?.account_number || '',
        ifsc_code:        e.bank_details?.ifsc_code   || '',
        account_holder_name: e.bank_details?.account_holder_name || '',
        pf_number:        e.pf_number         || '',
        uan_number:       e.uan_number        || '',
        bg_status:        e.background_check?.status || 'pending',
        bg_notes:         e.background_check?.notes  || '',
      })
      if (e.emergency_contacts?.length) setEmergencyContacts(e.emergency_contacts)
      if (e.qualifications?.length)      setQualifications(e.qualifications)
      if (e.disciplinary_records?.length) setDisciplinary(e.disciplinary_records)
      if (e.documents?.length)            setDocuments(e.documents)

      // MODE B: load linked user info
      if (e.crm_user_id) {
        setLinkedUserId(e.crm_user_id)
        setCreateAccount(false)  // user already linked — no need to create
        userService.getUser(e.crm_user_id).then(u => {
          const user = u.data || u
          setLinkedUserInfo({
            username: user.username || '',
            role:     user.role     || '',
            email:    user.email    || '',
            mobile:   user.mobile   || '',
            status:   user.status   || 'active',
          })
          // Also prefill uForm for display
          setUForm(prev => ({
            ...prev,
            username:      user.username || '',
            full_name:     user.full_name || '',
            email:         user.email    || '',
            mobile:        user.mobile   || '',
            employee_id:   user.employee_id || '',
            role:          user.role || 'candidate_coordinator',
            user_type:     user.user_type || 'internal',
            department_id: user.department_id || '',
            designation_id:user.designation_id || '',
            reporting_to:  user.reporting_to || '',
            joining_date:  user.joining_date?.split('T')[0] || '',
            status:        user.status || 'active',
          }))
          if (user.user_type !== 'partner') {
            const dept = user.primary_department || ROLE_TO_DEPT[user.role] || 'hr'
            setPermDept(dept)
            setPermLevel(user.level || 'executive')
            if (user.restricted_modules?.length) { setRestrictOn(true); setRestrictMods(user.restricted_modules) }
            if (user.assigned_departments?.length) { setAddDeptsOn(true); setAddDepts(user.assigned_departments) }
          }
        }).catch(() => {})
      } else {
        setCreateAccount(false)  // no linked user in edit mode — show Create Account CTA instead
      }
    }).catch(() => {})
  }, [id])

  // ── Prefill from existing User (create mode, ?user_id) ─────────
  useEffect(() => {
    if (isEdit) return
    const userId = searchParams.get('user_id')
    if (!userId) return
    userService.getUser(userId).then(r => {
      const u = r.data || r
      // Prefill employee identity fields
      setForm(f => ({
        ...f,
        full_name:        u.full_name  || f.full_name,
        email:            u.email      || f.email,
        phone:            u.mobile     || f.phone,
        department_name:  u.department || f.department_name,
        designation_name: u.designation || f.designation_name,
        date_of_joining:  u.joining_date?.split?.('T')?.[0] || f.date_of_joining,
      }))
      // Pre-load user account section in read-only (user already exists)
      setUForm({
        username:      u.username || '',
        email:         u.email    || '',
        full_name:     u.full_name || '',
        mobile:        u.mobile   || '',
        password:      '',
        employee_id:   u.employee_id || '',
        role:          u.role || 'candidate_coordinator',
        user_type:     u.user_type || 'internal',
        department_id: u.department_id || '',
        designation_id:u.designation_id || '',
        reporting_to:  u.reporting_to || '',
        joining_date:  u.joining_date?.split?.('T')?.[0] || '',
        status:        u.status || 'active',
      })
      setLinkedUserId(userId)
      setLinkedUserInfo({ username: u.username, role: u.role, email: u.email, mobile: u.mobile, status: u.status })
      setCreateAccount(false)  // user exists — no need to create
      setPrefillBanner(`Prefilled from User Account: ${u.full_name}`)
    }).catch(() => {})
  }, [isEdit, searchParams])

  // ── User form field change ───────────────────────────────────────
  const handleUChange = (e) => {
    const { name, value } = e.target
    setUForm(prev => ({ ...prev, [name]: value }))
    if (uErrors[name]) setUErrors(prev => ({ ...prev, [name]: null }))
  }

  // ── User form blur validation ────────────────────────────────────
  const handleUBlur = (e) => {
    const { name, value } = e.target
    const next = { ...uErrors }
    switch (name) {
      case 'full_name':
        if (!value.trim()) next.full_name = 'Full name is required'
        else if (value.trim().length < 2) next.full_name = 'Minimum 2 characters'
        else delete next.full_name
        break
      case 'username':
        if (!value.trim()) next.username = 'Username is required'
        else if (value.length < 3) next.username = 'Minimum 3 characters'
        else if (!/^[a-zA-Z0-9_]+$/.test(value)) next.username = 'Letters, numbers, underscores only'
        else delete next.username
        break
      case 'email':
        if (!value.trim()) next.email = 'Email is required'
        else if (!/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(value)) next.email = 'Invalid email'
        else delete next.email
        break
      case 'mobile': {
        const d = value.replace(/\D/g,'')
        if (!value.trim()) next.mobile = 'Contact is required'
        else if (!/^[6-9]\d{9}$/.test(d)) next.mobile = 'Must start 6–9, exactly 10 digits'
        else delete next.mobile
        break
      }
      case 'password':
        if (!value) next.password = 'Password is required'
        else if (value.length < 8) next.password = 'Minimum 8 characters'
        else if (!/[A-Z]/.test(value)) next.password = 'Need uppercase letter'
        else if (!/[a-z]/.test(value)) next.password = 'Need lowercase letter'
        else if (!/\d/.test(value)) next.password = 'Need a number'
        else delete next.password
        break
      default: break
    }
    setUErrors(next)
  }

  // ── Validate user account section ────────────────────────────────
  const validateUserSection = () => {
    const errs = {}
    if (!uForm.full_name.trim()) errs.full_name = 'Full name is required'
    else if (uForm.full_name.trim().length < 2) errs.full_name = 'Minimum 2 characters'
    if (!uForm.username.trim()) errs.username = 'Username is required'
    else if (!/^[a-zA-Z0-9_]+$/.test(uForm.username)) errs.username = 'Letters, numbers, underscores only'
    if (!uForm.email.trim()) errs.email = 'Email is required'
    else if (!/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(uForm.email)) errs.email = 'Invalid email'
    const d = uForm.mobile.replace(/\D/g,'')
    if (!uForm.mobile.trim()) errs.mobile = 'Contact is required'
    else if (!/^[6-9]\d{9}$/.test(d)) errs.mobile = 'Must start 6–9, exactly 10 digits'
    if (!uForm.password) errs.password = 'Password is required'
    else if (uForm.password.length < 8) errs.password = 'Minimum 8 characters'
    else if (!/[A-Z]/.test(uForm.password)) errs.password = 'Need uppercase letter'
    else if (!/[a-z]/.test(uForm.password)) errs.password = 'Need lowercase letter'
    else if (!/\d/.test(uForm.password)) errs.password = 'Need a number'
    if (!isPartner && !permDept) errs.permissions = 'Select a department to assign permissions.'
    setUErrors(errs)
    return Object.keys(errs).length === 0
  }

  // ── Build payload ────────────────────────────────────────────────
  const buildPayload = (overrideDuplicate = false) => {
    // Resolve department / designation for on-the-fly created ones
    const deptId   = uForm.department_id === 'custom'  ? undefined : uForm.department_id
    const deptName = departments.find(d => d.id === deptId)?.name || undefined
    const desigId  = uForm.designation_id === 'custom' ? undefined : uForm.designation_id
    const desigName = designations.find(d => d.id === desigId)?.name || undefined

    // account_info — only when creating AND not in MODE B (linked user)
    let account_info = undefined
    if (createAccount && !linkedUserId && uForm.username && uForm.password) {
      account_info = {
        username:           uForm.username.toLowerCase().trim(),
        password:           uForm.password,
        employee_id:        uForm.employee_id || undefined,
        user_type:          isPartner ? 'partner' : (uForm.user_type || 'internal'),
        role:               isPartner ? 'partner' : (DEPT_TO_ROLE[permDept] || uForm.role),
        department_id:      deptId  || undefined,
        department:         deptName || undefined,
        designation_id:     desigId  || undefined,
        designation:        desigName || undefined,
        reporting_to:       uForm.reporting_to || undefined,
        joining_date:       uForm.joining_date || undefined,
        status:             uForm.status || 'active',
        permissions:        isPartner ? undefined : computedPermissions,
        primary_department: isPartner ? undefined : permDept || undefined,
        level:              isPartner ? undefined : permLevel || undefined,
        assigned_departments: isPartner ? [] : (addDeptsOn ? addDepts : []),
        restricted_modules:   isPartner ? [] : (restrictOn ? restrictMods : []),
        override_duplicate:   overrideDuplicate,
      }
    }

    return {
      full_name:       form.full_name,
      email:           form.email,
      phone:           form.phone,
      gender:          form.gender || undefined,
      date_of_birth:   form.date_of_birth || undefined,
      blood_group:     form.blood_group || undefined,
      pan_number:      form.pan_number || undefined,
      aadhaar_number:  form.aadhaar_number || undefined,
      address_info: { street:form.street, city:form.city, state:form.state, zip_code:form.zip_code, country:form.country },
      department_name:     form.department_name  || undefined,
      designation_name:    form.designation_name || undefined,
      reporting_manager_id: form.reporting_manager_id || undefined,
      employment_type:     form.employment_type,
      date_of_joining:     form.date_of_joining  || undefined,
      work_location:       form.work_location    || undefined,
      shift_start_time:    form.shift_start_time,
      shift_end_time:      form.shift_end_time,
      work_description:    form.work_description || undefined,
      salary: {
        ctc:               Number(form.ctc)               || 0,
        basic:             Number(form.basic)             || 0,
        hra:               Number(form.hra)               || 0,
        special_allowance: Number(form.special_allowance) || 0,
      },
      bank_details: {
        bank_name:           form.bank_name           || undefined,
        account_number:      form.account_number      || undefined,
        ifsc_code:           form.ifsc_code           || undefined,
        account_holder_name: form.account_holder_name || undefined,
      },
      pf_number:  form.pf_number  || undefined,
      uan_number: form.uan_number || undefined,
      emergency_contacts: emergencyContacts.filter(c => c.name || c.phone),
      qualifications:     qualifications.filter(q => q.title),
      disciplinary_records: disciplinary.filter(d => d.date || d.incident),
      background_check: { status: form.bg_status, notes: form.bg_notes || undefined },
      account_info,
    }
  }

  // ── Submit ───────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    // Validate employee identity fields
    if (!fValidate(form)) {
      setError('Please fix the highlighted fields.')
      return
    }

    // Validate user account section when creating an account
    if (!isEdit && createAccount && !linkedUserId && uForm.username && uForm.password) {
      if (!validateUserSection()) {
        setError('Please fix the highlighted fields in the User Account section.')
        if (uErrors.permissions) permRef.current?.scrollIntoView({ behavior:'smooth', block:'center' })
        return
      }
    }

    setSaving(true)
    try {
      if (isEdit) {
        await hrmService.updateEmployee(id, buildPayload())
        toast.success('Employee updated')
        navigate('/hrm/employees')
        return
      }

      // Create mode
      const payload = buildPayload()
      await hrmService.createEmployee(payload)
      const hasAccount = createAccount && !linkedUserId && uForm.username && uForm.password
      toast.success(hasAccount ? 'Employee and login account created' : 'Employee profile created')
      navigate('/hrm/employees')
    } catch (err) {
      const status = err.response?.status
      const detail = err.response?.data?.detail

      // 409 duplicate — show override modal
      if (status === 409 && detail?.duplicate) {
        pendingPayload.current = buildPayload()
        setDuplicateModal({ show: true, fields: detail.fields || {}, overrideChecked: false, overrideTouched: false })
        setSaving(false)
        return
      }

      // 402 seat limit
      if (status === 402 && detail?.seat_limit_reached) {
        setError(`User seat limit reached. You have used ${detail.current_active_users} of ${detail.total_user_seats} seats.`)
      } else {
        const msg = err.response?.data?.message || (typeof detail === 'string' ? detail : null)
        setError(msg || 'Failed to save employee. Please try again.')
      }
    }
    setSaving(false)
  }

  // ── Override submit (from duplicate modal) ──────────────────────
  const handleOverrideSubmit = useCallback(async () => {
    if (!duplicateModal.overrideChecked) {
      setDuplicateModal(prev => ({ ...prev, overrideTouched: true }))
      return
    }
    if (!pendingPayload.current) return
    setSaving(true)
    try {
      const payload = { ...pendingPayload.current }
      if (payload.account_info) payload.account_info.override_duplicate = true
      await hrmService.createEmployee(payload)
      setDuplicateModal({ show: false, fields: {}, overrideChecked: false, overrideTouched: false })
      toast.success('Employee created')
      navigate('/hrm/employees')
    } catch (err) {
      const msg = err.response?.data?.message || err.response?.data?.detail
      setError(typeof msg === 'string' ? msg : 'Failed to create employee')
      setDuplicateModal({ show: false, fields: {}, overrideChecked: false, overrideTouched: false })
    }
    setSaving(false)
  }, [duplicateModal.overrideChecked, navigate])

  // ── Document upload ──────────────────────────────────────────────
  const handleDocUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !id) return
    if (!docName.trim()) { toast.error('Enter a document name first'); return }
    setUploadingDoc(true)
    try {
      const fd = new FormData()
      fd.append('file', file); fd.append('doc_type', docType); fd.append('doc_name', docName)
      const res = await hrmService.uploadDocument(id, fd)
      setDocuments(d => [...d, res.data.document])
      setDocName('')
      toast.success('Document uploaded')
    } catch { toast.error('Upload failed') }
    setUploadingDoc(false)
    e.target.value = ''
  }

  // ── Emergency contacts helpers ───────────────────────────────────
  const addContact = () => setEmergencyContacts(c => [...c, { name:'', relationship:'', phone:'', email:'' }])
  const removeContact = i => setEmergencyContacts(c => c.filter((_,idx) => idx !== i))
  const setContact = (i,k,v) => setEmergencyContacts(c => c.map((x,idx) => idx===i?{...x,[k]:v}:x))

  // ── Qualifications helpers ───────────────────────────────────────
  const addQual = () => setQualifications(q => [...q, { type:'academic', title:'', institution:'', year:'', grade:'' }])
  const removeQual = i => setQualifications(q => q.filter((_,idx) => idx !== i))
  const setQual = (i,k,v) => setQualifications(q => q.map((x,idx) => idx===i?{...x,[k]:v}:x))

  // ── Disciplinary helpers ─────────────────────────────────────────
  const addDisc = () => setDisciplinary(d => [...d, { date:'', incident:'', action_taken:'' }])
  const removeDisc = i => setDisciplinary(d => d.filter((_,idx) => idx !== i))
  const setDisc = (i,k,v) => setDisciplinary(d => d.map((x,idx) => idx===i?{...x,[k]:v}:x))

  // MODE B = edit mode with a linked user, OR create mode with ?user_id (user already exists)
  const modeB = !!linkedUserId

  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">

      {/* ── Duplicate Modal ── */}
      <ModalPortal isOpen={duplicateModal.show}>
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 px-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                <AlertCircle className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h3 className="text-base font-bold">Duplicate User Detected</h3>
                <p className="text-sm text-gray-500">The following data already exists.</p>
              </div>
            </div>
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 space-y-1">
              {Object.entries(duplicateModal.fields).map(([f,v]) => (
                <div key={f} className="flex gap-2 text-sm">
                  <span className="font-semibold text-amber-800 capitalize w-20">{f}:</span>
                  <span className="text-amber-700 font-mono">{v}</span>
                </div>
              ))}
            </div>
            <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={duplicateModal.overrideChecked}
                  onChange={e => setDuplicateModal(p => ({ ...p, overrideChecked: e.target.checked, overrideTouched: true }))}
                  className="mt-0.5 w-4 h-4 text-indigo-600" />
                <span className="text-sm text-gray-700">
                  <span className="font-semibold">Override and create anyway</span><br />
                  <span className="text-gray-500">Use only if this person requires different credentials.</span>
                </span>
              </label>
              {duplicateModal.overrideTouched && !duplicateModal.overrideChecked && (
                <p className="mt-2 text-xs text-red-600">Check this box to proceed.</p>
              )}
            </div>
            <div className="flex gap-3 justify-end">
              <button type="button"
                onClick={() => setDuplicateModal({ show:false, fields:{}, overrideChecked:false, overrideTouched:false })}
                className="px-4 py-2 border border-gray-300 text-gray-700 text-sm rounded-xl hover:bg-gray-50">
                Cancel
              </button>
              <button type="button" onClick={handleOverrideSubmit} disabled={saving}
                className={`px-4 py-2 text-sm font-semibold rounded-xl flex items-center gap-2 ${
                  duplicateModal.overrideChecked ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}>
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Create Employee
              </button>
            </div>
          </div>
        </div>
      </ModalPortal>

      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{isEdit ? 'Edit Employee' : 'Add Employee'}</h1>
          <p className="text-sm text-gray-500 mt-0.5">Complete HR file</p>
        </div>
      </div>

      {prefillBanner && (
        <div className="flex items-center gap-2 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg p-3 text-sm">
          <Info className="w-4 h-4 flex-shrink-0" />
          {prefillBanner} — review and complete the remaining employee fields.
        </div>
      )}

      {error && (
        <div className="bg-red-50 text-red-700 border border-red-200 rounded-lg p-3 text-sm">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">

        {/* ═══════════════════════════════════════════════════════════
            SECTION 1 — USER ACCOUNT INFORMATION
            ═══════════════════════════════════════════════════════════ */}
        <Section icon={KeyRound} title="User Account Information" color="violet"
          badge={
            modeB
              ? <span className="ml-2 px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full font-medium flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" /> Linked
                </span>
              : createAccount && !isEdit
              ? <span className="ml-2 px-2 py-0.5 bg-violet-100 text-violet-700 text-xs rounded-full font-medium flex items-center gap-1">
                  <UserPlus className="w-3 h-3" /> Will create account
                </span>
              : null
          }
        >

          {/* MODE B — user already linked (create w/?user_id OR edit with crm_user_id) */}
          {modeB && linkedUserInfo && (
            <div className="mt-2 mb-4 flex flex-wrap items-center justify-between gap-3 p-4 bg-green-50 border border-green-200 rounded-xl">
              <div className="flex items-center gap-2 text-green-700">
                <CheckCircle className="w-4 h-4 flex-shrink-0" />
                <span className="text-sm font-medium">CRM Account linked</span>
              </div>
              <div className="flex flex-wrap gap-4 text-sm text-gray-700">
                <span><span className="text-gray-500">Username:</span> <strong>{linkedUserInfo.username}</strong></span>
                <span><span className="text-gray-500">Role:</span> <strong>
                  {PERM_DEPT_OPTIONS.find(o => o.value === ROLE_TO_DEPT[linkedUserInfo.role])?.label || linkedUserInfo.role}
                </strong></span>
                <span><span className="text-gray-500">Email:</span> {linkedUserInfo.email}</span>
                {linkedUserInfo.mobile && <span><span className="text-gray-500">Mobile:</span> {linkedUserInfo.mobile}</span>}
              </div>
              <Link to={`/users/${linkedUserId}`}
                className="text-xs text-indigo-600 hover:underline font-medium whitespace-nowrap">
                View / Edit User →
              </Link>
            </div>
          )}

          {/* Edit mode, no linked user — offer to create account */}
          {isEdit && !linkedUserId && (
            <div className="mt-2 mb-4 flex items-center justify-between p-4 bg-amber-50 border border-amber-200 rounded-xl">
              <div className="flex items-center gap-2 text-amber-700 text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                No CRM login account linked.
              </div>
              <Link to={`/users/new?employee_id=${id}`}
                className="text-xs text-indigo-600 hover:underline font-medium whitespace-nowrap">
                Create Account →
              </Link>
            </div>
          )}

          {/* Identity fields (always shown in create mode) */}
          {!isEdit && (
            <>
              {/* Toggle */}
              {!modeB && (
                <div className="flex items-center gap-3 mt-2 mb-4 p-4 bg-violet-50 border border-violet-200 rounded-xl">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input type="checkbox" checked={createAccount}
                      onChange={e => setCreateAccount(e.target.checked)}
                      className="w-4 h-4 accent-indigo-600" />
                    <span className="text-sm font-medium text-violet-800">
                      Create CRM Login Account for this employee
                    </span>
                  </label>
                  {!createAccount && (
                    <span className="ml-auto text-xs text-gray-500">
                      Leave unchecked to create Employee only (Account Pending)
                    </span>
                  )}
                </div>
              )}

              {/* Full User Form — shown when creating an account */}
              {(createAccount && !modeB) && (
                <div className="space-y-6">

                  {/* Basic Information */}
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-3 mt-1">Basic Information</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Full Name <span className="text-red-500">*</span>
                        </label>
                        <input type="text" name="full_name" value={uForm.full_name}
                          onChange={e => {
                            handleUChange(e)
                            set('full_name', e.target.value)  // sync to employee record
                          }}
                          onBlur={handleUBlur}
                          className={uErrors.full_name ? inpErr : inp} />
                        {uErrors.full_name && <p className="mt-1 text-xs text-red-500">{uErrors.full_name}</p>}
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Employee ID</label>
                        <input type="text" name="employee_id" value={uForm.employee_id}
                          onChange={handleUChange} className={inp} />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Username <span className="text-red-500">*</span>
                        </label>
                        <input type="text" name="username" value={uForm.username}
                          onChange={handleUChange} onBlur={handleUBlur}
                          className={uErrors.username ? inpErr : inp}
                          autoComplete="off" />
                        {uErrors.username && <p className="mt-1 text-xs text-red-500">{uErrors.username}</p>}
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Password <span className="text-red-500">*</span>
                        </label>
                        <input type="password" name="password" value={uForm.password}
                          onChange={handleUChange} onBlur={handleUBlur}
                          className={uErrors.password ? inpErr : inp}
                          autoComplete="new-password" />
                        <p className="mt-1 text-xs text-gray-400">Min 8 chars, uppercase, lowercase, number.</p>
                        {uErrors.password && <p className="mt-1 text-xs text-red-500">{uErrors.password}</p>}
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Email <span className="text-red-500">*</span>
                        </label>
                        <input type="email" name="email" value={uForm.email}
                          onChange={e => {
                            handleUChange(e)
                            set('email', e.target.value)  // sync to employee record
                          }}
                          onBlur={handleUBlur}
                          className={uErrors.email ? inpErr : inp} />
                        {uErrors.email && <p className="mt-1 text-xs text-red-500">{uErrors.email}</p>}
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Contact <span className="text-red-500">*</span>
                        </label>
                        <input type="text" name="mobile" value={uForm.mobile}
                          onChange={e => {
                            handleUChange(e)
                            set('phone', e.target.value)  // sync to employee record
                          }}
                          onBlur={handleUBlur}
                          className={uErrors.mobile ? inpErr : inp} />
                        {uErrors.mobile && <p className="mt-1 text-xs text-red-500">{uErrors.mobile}</p>}
                      </div>

                    </div>
                  </div>

                  {/* Organization */}
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-3">Organization</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">User Type</label>
                        <select name="user_type" value={uForm.user_type} onChange={handleUChange} className={sel}>
                          <option value="internal">Internal Employee</option>
                          <option value="partner">Partner</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                        <select name="department_id" value={uForm.department_id}
                          onChange={e => {
                            handleUChange(e)
                            if (e.target.value !== 'custom') setDeptCustom('')
                            if (!permDept && e.target.value && e.target.value !== 'custom') {
                              const n = departments.find(d => d.id === e.target.value)?.name || ''
                              const s = guessDeptFromName(n)
                              if (s) setPermDept(s)
                            }
                            // sync dept name to employee record
                            const dName = departments.find(d => d.id === e.target.value)?.name || ''
                            if (dName) set('department_name', dName)
                          }}
                          className={sel}>
                          <option value="">Select</option>
                          {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                          <option value="custom">Custom…</option>
                        </select>
                        {uForm.department_id === 'custom' && (
                          <input type="text" value={deptCustom} onChange={e => setDeptCustom(e.target.value)}
                            placeholder="Enter new department"
                            className={"mt-2 " + inp} />
                        )}
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Designation</label>
                        <select name="designation_id" value={uForm.designation_id}
                          onChange={e => {
                            handleUChange(e)
                            if (e.target.value !== 'custom') setDesigCustom('')
                            // sync desig name to employee record
                            const dName = designations.find(d => d.id === e.target.value)?.name || ''
                            if (dName) set('designation_name', dName)
                          }}
                          className={sel}>
                          <option value="">Select</option>
                          {designations.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                          <option value="custom">Custom…</option>
                        </select>
                        {uForm.designation_id === 'custom' && (
                          <input type="text" value={desigCustom} onChange={e => setDesigCustom(e.target.value)}
                            placeholder="Enter new designation"
                            className={"mt-2 " + inp} />
                        )}
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Reports To</label>
                        <select name="reporting_to" value={uForm.reporting_to} onChange={handleUChange} className={sel}>
                          <option value="">Select</option>
                          {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Joining Date</label>
                        <input type="date" name="joining_date" value={uForm.joining_date}
                          onChange={e => {
                            handleUChange(e)
                            set('date_of_joining', e.target.value)  // sync to employee record
                          }}
                          className={inp} />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                        <select name="status" value={uForm.status} onChange={handleUChange} className={sel}>
                          <option value="active">Active</option>
                          <option value="inactive">Inactive</option>
                          <option value="pending">Pending</option>
                        </select>
                      </div>

                    </div>
                  </div>

                  {/* Permissions (hidden for partners) */}
                  {!isPartner && (
                    <div ref={permRef}
                      className={`rounded-xl border p-5 ${!uForm.username || uErrors.permissions ? 'border-red-200 bg-red-50/30' : 'border-gray-200 bg-gray-50/40'}`}>
                      <div className="flex items-center gap-2 mb-4">
                        <Shield className="w-4 h-4 text-indigo-600" />
                        <p className="text-sm font-semibold text-gray-800">
                          Permissions <span className="text-red-500">*</span>
                        </p>
                      </div>
                      {uErrors.permissions && (
                        <p className="mb-3 text-sm text-red-600 font-medium">{uErrors.permissions}</p>
                      )}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Department <span className="text-red-500">*</span>
                          </label>
                          <select value={permDept}
                            onChange={e => { setPermDept(e.target.value); setRestrictMods([]); setAddDepts([]) }}
                            className={sel}>
                            <option value="">Select department…</option>
                            {PERM_DEPT_OPTIONS.filter(o => o.value !== 'owner' || currentUser?.isOwner).map(o => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>
                        </div>
                        {permDept && permDept !== 'owner' && (
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Level</label>
                            <select value={permLevel} onChange={e => setPermLevel(e.target.value)} className={sel}>
                              <option value="executive">Executive (view / create / modify)</option>
                              <option value="manager">Manager (view / create / modify / delete)</option>
                            </select>
                          </div>
                        )}
                      </div>
                      {permDept && (
                        <div className="mt-4 space-y-3">
                          <div>
                            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
                              <input type="checkbox" checked={restrictOn}
                                onChange={e => { setRestrictOn(e.target.checked); setRestrictMods([]) }}
                                className="rounded text-indigo-600" />
                              Restrict Modules
                            </label>
                            {restrictOn && (
                              <div className="mt-2 pl-6 flex flex-wrap gap-3">
                                {[...(DEPT_MODULES[permDept]?.full||[]),...(DEPT_MODULES[permDept]?.view_only||[])].map(m => (
                                  <label key={m} className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
                                    <input type="checkbox" checked={restrictMods.includes(m)}
                                      onChange={() => setRestrictMods(p => p.includes(m)?p.filter(x=>x!==m):[...p,m])}
                                      className="rounded text-red-500" />
                                    {MODULE_LABELS[m]}
                                  </label>
                                ))}
                              </div>
                            )}
                          </div>
                          <div>
                            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
                              <input type="checkbox" checked={addDeptsOn}
                                onChange={e => { setAddDeptsOn(e.target.checked); setAddDepts([]) }}
                                className="rounded text-indigo-600" />
                              Assign Other Departments
                            </label>
                            {addDeptsOn && (
                              <div className="mt-2 pl-6 flex flex-wrap gap-3">
                                {PERM_DEPT_OPTIONS.filter(o => o.value !== permDept && o.value !== 'owner').map(o => (
                                  <label key={o.value} className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
                                    <input type="checkbox" checked={addDepts.includes(o.value)}
                                      onChange={() => setAddDepts(p => p.includes(o.value)?p.filter(x=>x!==o.value):[...p,o.value])}
                                      className="rounded text-indigo-600" />
                                    {o.label}
                                  </label>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="rounded-lg bg-white border border-gray-200 px-4 py-3">
                            <p className="text-xs font-semibold text-gray-600 mb-2">
                              {computedPermissions.length} permissions will be assigned
                            </p>
                            <div className="flex flex-wrap gap-1 max-h-28 overflow-y-auto">
                              {[...computedPermissions].sort().map(p => (
                                <span key={p} className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-xs rounded-full font-mono">{p}</span>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Account toggle is OFF — minimal identity fields */}
              {!createAccount && !modeB && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
                  <Field label="Full Name" required error={fTouched.full_name ? fErrors.full_name : ''}>
                    <EmpInput value={form.full_name} onChange={e => set('full_name', e.target.value)}
                      onBlur={() => touch('full_name', form.full_name, form)} />
                  </Field>
                  <Field label="Email" required error={fTouched.email ? fErrors.email : ''}>
                    <EmpInput type="email" value={form.email} onChange={e => set('email', e.target.value)}
                      onBlur={() => touch('email', form.email, form)} />
                  </Field>
                  <Field label="Phone" error={fTouched.phone ? fErrors.phone : ''}>
                    <EmpInput type="tel" value={form.phone} onChange={e => set('phone', e.target.value)}
                      onBlur={() => touch('phone', form.phone, form)} />
                  </Field>
                  <div className="md:col-span-3 text-xs text-gray-400 -mt-2">
                    Employee will be created without a CRM login account (Account Pending status).
                  </div>
                </div>
              )}
            </>
          )}
        </Section>

        {/* ═══════════════════════════════════════════════════════════
            SECTION 2 — PERSONAL INFORMATION
            ═══════════════════════════════════════════════════════════ */}
        <Section icon={User} title="Personal Information" color="indigo">
          {/* In edit mode: show editable identity fields at the top of Personal Information */}
          {isEdit && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 pb-4 border-b border-gray-100">
              <Field label="Full Name" required error={fTouched.full_name ? fErrors.full_name : ''}>
                <EmpInput value={form.full_name} onChange={e => set('full_name', e.target.value)}
                  onBlur={() => touch('full_name', form.full_name, form)} />
              </Field>
              <Field label="Email" required error={fTouched.email ? fErrors.email : ''}>
                <EmpInput type="email" value={form.email} onChange={e => set('email', e.target.value)}
                  onBlur={() => touch('email', form.email, form)} />
              </Field>
              <Field label="Phone" error={fTouched.phone ? fErrors.phone : ''}>
                <EmpInput type="tel" value={form.phone} onChange={e => set('phone', e.target.value)}
                  onBlur={() => touch('phone', form.phone, form)} />
              </Field>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
            <Field label="Date of Birth">
              <EmpInput type="date" value={form.date_of_birth} onChange={e => set('date_of_birth', e.target.value)} />
            </Field>
            <Field label="Gender">
              <EmpSelect value={form.gender} onChange={e => set('gender', e.target.value)} options={[
                { value:'', label:'— Select —' },
                { value:'male', label:'Male' }, { value:'female', label:'Female' },
                { value:'other', label:'Other' }, { value:'prefer_not_to_say', label:'Prefer not to say' },
              ]} />
            </Field>
            <Field label="Blood Group">
              <EmpSelect value={form.blood_group} onChange={e => set('blood_group', e.target.value)} options={[
                { value:'', label:'— Select —' },
                ...['A+','A-','B+','B-','AB+','AB-','O+','O-'].map(g => ({ value:g, label:g })),
              ]} />
            </Field>
            <Field label="PAN Number">
              <EmpInput value={form.pan_number} onChange={e => set('pan_number', e.target.value.toUpperCase())}
                placeholder="ABCDE1234F" maxLength={10} />
            </Field>
            <Field label="Aadhaar Number" className="md:col-span-2">
              <EmpInput value={form.aadhaar_number} onChange={e => set('aadhaar_number', e.target.value)}
                placeholder="XXXX XXXX XXXX" maxLength={14} />
            </Field>
          </div>
          <p className="text-xs font-semibold text-gray-500 uppercase mt-5 mb-3">Residential Address</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Street" className="md:col-span-2">
              <EmpInput value={form.street} onChange={e => set('street', e.target.value)} />
            </Field>
            <Field label="City"><EmpInput value={form.city} onChange={e => set('city', e.target.value)} /></Field>
            <Field label="State"><EmpInput value={form.state} onChange={e => set('state', e.target.value)} /></Field>
            <Field label="ZIP / PIN"><EmpInput value={form.zip_code} onChange={e => set('zip_code', e.target.value)} /></Field>
            <Field label="Country"><EmpInput value={form.country} onChange={e => set('country', e.target.value)} /></Field>
          </div>
        </Section>

        {/* ═══════════════════════════════════════════════════════════
            SECTION 3 — EMPLOYMENT DETAILS
            ═══════════════════════════════════════════════════════════ */}
        <Section icon={Briefcase} title="Employment Details" color="blue">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
            <Field label="Department">
              <EmpInput value={form.department_name} onChange={e => set('department_name', e.target.value)}
                placeholder="e.g. Engineering" />
            </Field>
            <Field label="Designation">
              <EmpInput value={form.designation_name} onChange={e => set('designation_name', e.target.value)} />
            </Field>
            <Field label="Employment Type">
              <EmpSelect value={form.employment_type} onChange={e => set('employment_type', e.target.value)} options={[
                { value:'full_time', label:'Full Time' }, { value:'part_time', label:'Part Time' },
                { value:'contract', label:'Contract' }, { value:'intern', label:'Intern' },
                { value:'consultant', label:'Consultant' },
              ]} />
            </Field>
            <Field label="Date of Joining">
              <EmpInput type="date" value={form.date_of_joining} onChange={e => set('date_of_joining', e.target.value)} />
            </Field>
            <Field label="Work Location">
              <EmpInput value={form.work_location} onChange={e => set('work_location', e.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Shift Start">
                <EmpInput type="time" value={form.shift_start_time} onChange={e => set('shift_start_time', e.target.value)} />
              </Field>
              <Field label="Shift End">
                <EmpInput type="time" value={form.shift_end_time} onChange={e => set('shift_end_time', e.target.value)} />
              </Field>
            </div>
          </div>
          <div className="mt-4">
            <Field label="Role Description / Notes">
              <EmpTextarea value={form.work_description} onChange={e => set('work_description', e.target.value)}
                placeholder="Responsibilities, notes…" />
            </Field>
          </div>
          <p className="text-xs font-semibold text-gray-500 uppercase mt-5 mb-3">Salary Structure</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[['ctc','Annual CTC (₹)'],['basic','Basic (Monthly)'],['hra','HRA (Monthly)'],['special_allowance','Special Allowance']].map(([k,l]) => (
              <Field key={k} label={l}>
                <EmpInput type="number" min="0" value={form[k]} onChange={e => set(k, e.target.value)} />
              </Field>
            ))}
          </div>
        </Section>

        {/* ═══════════════════════════════════════════════════════════
            SECTION 4 — BANK DETAILS
            ═══════════════════════════════════════════════════════════ */}
        <Section icon={CreditCard} title="Bank Details" color="green">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
            <Field label="Bank Name"><EmpInput value={form.bank_name} onChange={e => set('bank_name', e.target.value)} /></Field>
            <Field label="Account Number"><EmpInput value={form.account_number} onChange={e => set('account_number', e.target.value)} /></Field>
            <Field label="IFSC Code"><EmpInput value={form.ifsc_code} onChange={e => set('ifsc_code', e.target.value.toUpperCase())} /></Field>
            <Field label="Account Holder Name"><EmpInput value={form.account_holder_name} onChange={e => set('account_holder_name', e.target.value)} /></Field>
            <Field label="PF Number"><EmpInput value={form.pf_number} onChange={e => set('pf_number', e.target.value)} /></Field>
            <Field label="UAN Number"><EmpInput value={form.uan_number} onChange={e => set('uan_number', e.target.value)} /></Field>
          </div>
        </Section>

        {/* ═══════════════════════════════════════════════════════════
            SECTION 5 — EMERGENCY CONTACTS
            ═══════════════════════════════════════════════════════════ */}
        <Section icon={Phone} title="Emergency Contacts" color="orange">
          <div className="space-y-4 mt-2">
            {emergencyContacts.map((c, i) => (
              <div key={i} className="grid grid-cols-1 md:grid-cols-4 gap-3 p-4 bg-gray-50 rounded-lg">
                <EmpInput placeholder="Name" value={c.name} onChange={e => setContact(i,'name',e.target.value)} />
                <EmpInput placeholder="Relationship" value={c.relationship} onChange={e => setContact(i,'relationship',e.target.value)} />
                <EmpInput placeholder="Phone" value={c.phone} onChange={e => setContact(i,'phone',e.target.value)} />
                <div className="flex gap-2">
                  <EmpInput placeholder="Email (opt.)" value={c.email||''} onChange={e => setContact(i,'email',e.target.value)} />
                  {emergencyContacts.length > 1 && (
                    <button type="button" onClick={() => removeContact(i)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg flex-shrink-0">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
            <button type="button" onClick={addContact}
              className="flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-700 font-medium">
              <Plus className="w-4 h-4" /> Add Contact
            </button>
          </div>
        </Section>

        {/* ═══════════════════════════════════════════════════════════
            SECTION 6 — QUALIFICATIONS
            ═══════════════════════════════════════════════════════════ */}
        <Section icon={GraduationCap} title="Qualifications" color="purple" defaultOpen={false}>
          <div className="space-y-3 mt-2">
            {qualifications.map((q, i) => (
              <div key={i} className="grid grid-cols-2 md:grid-cols-5 gap-3 p-4 bg-gray-50 rounded-lg">
                <EmpSelect value={q.type} onChange={e => setQual(i,'type',e.target.value)} options={[
                  { value:'academic', label:'Academic' }, { value:'professional', label:'Professional' },
                ]} />
                <EmpInput placeholder="Degree / Certificate" value={q.title} onChange={e => setQual(i,'title',e.target.value)} />
                <EmpInput placeholder="Institution" value={q.institution||''} onChange={e => setQual(i,'institution',e.target.value)} />
                <EmpInput placeholder="Year" type="number" min="1950" max="2099" value={q.year||''} onChange={e => setQual(i,'year',e.target.value)} />
                <div className="flex gap-2">
                  <EmpInput placeholder="Grade / Score" value={q.grade||''} onChange={e => setQual(i,'grade',e.target.value)} />
                  <button type="button" onClick={() => removeQual(i)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg flex-shrink-0">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
            <button type="button" onClick={addQual}
              className="flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-700 font-medium">
              <Plus className="w-4 h-4" /> Add Qualification
            </button>
          </div>
        </Section>

        {/* ═══════════════════════════════════════════════════════════
            SECTION 7 — BACKGROUND VERIFICATION
            ═══════════════════════════════════════════════════════════ */}
        <Section icon={ShieldCheck} title="Background Verification" color="teal" defaultOpen={false}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
            <Field label="Verification Status">
              <EmpSelect value={form.bg_status} onChange={e => set('bg_status', e.target.value)} options={[
                { value:'pending', label:'Pending' }, { value:'verified', label:'Verified' }, { value:'rejected', label:'Rejected' },
              ]} />
            </Field>
            <Field label="Notes">
              <EmpTextarea value={form.bg_notes} onChange={e => set('bg_notes', e.target.value)} rows={2}
                placeholder="Verification notes…" />
            </Field>
          </div>
        </Section>

        {/* ═══════════════════════════════════════════════════════════
            SECTION 8 — DISCIPLINARY RECORDS
            ═══════════════════════════════════════════════════════════ */}
        <Section icon={FileText} title="Disciplinary Records" color="red" defaultOpen={false}>
          <div className="space-y-3 mt-2">
            {disciplinary.map((d, i) => (
              <div key={i} className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4 bg-red-50 rounded-lg">
                <EmpInput type="date" value={d.date} onChange={e => setDisc(i,'date',e.target.value)} />
                <EmpInput placeholder="Incident" value={d.incident} onChange={e => setDisc(i,'incident',e.target.value)} />
                <div className="flex gap-2">
                  <EmpInput placeholder="Action taken" value={d.action_taken} onChange={e => setDisc(i,'action_taken',e.target.value)} />
                  <button type="button" onClick={() => removeDisc(i)} className="p-2 text-red-500 hover:bg-red-100 rounded-lg flex-shrink-0">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
            <button type="button" onClick={addDisc}
              className="flex items-center gap-2 text-sm text-red-600 hover:text-red-700 font-medium">
              <Plus className="w-4 h-4" /> Add Record
            </button>
          </div>
        </Section>

        {/* ═══════════════════════════════════════════════════════════
            SECTION 9 — DOCUMENTS
            ═══════════════════════════════════════════════════════════ */}
        <Section icon={FileText} title="Documents" color="blue" defaultOpen={false}>
          <div className="mt-2 space-y-4">
            {!isEdit && (
              <div className="flex items-center gap-2 p-3 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-sm">
                <Info className="w-4 h-4 flex-shrink-0" />
                Documents can be uploaded after the employee profile is saved.
              </div>
            )}
            {isEdit && (
              <div className="flex flex-wrap gap-3 items-end p-4 bg-gray-50 rounded-lg">
                <Field label="Document Type" className="w-44">
                  <EmpSelect value={docType} onChange={e => setDocType(e.target.value)} options={[
                    { value:'offer_letter', label:'Offer Letter' }, { value:'appointment_letter', label:'Appointment Letter' },
                    { value:'contract', label:'Employment Contract' }, { value:'id_proof', label:'ID Proof' },
                    { value:'certificate', label:'Certificate' }, { value:'policy', label:'Signed Policy' },
                    { value:'other', label:'Other' },
                  ]} />
                </Field>
                <Field label="Document Name" className="flex-1 min-w-48">
                  <EmpInput placeholder="e.g. Offer Letter – Oct 2024" value={docName} onChange={e => setDocName(e.target.value)} />
                </Field>
                <div className="mb-0.5">
                  <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.docx" className="hidden" onChange={handleDocUpload} />
                  <button type="button" disabled={uploadingDoc} onClick={() => fileRef.current?.click()}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-60">
                    <Upload className="w-4 h-4" />
                    {uploadingDoc ? 'Uploading…' : 'Upload'}
                  </button>
                </div>
              </div>
            )}
            {documents.length > 0 ? (
              <div className="space-y-2">
                {documents.map((doc, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{doc.doc_name}</p>
                      <p className="text-xs text-gray-500">{doc.doc_type}</p>
                    </div>
                    <a href={doc.file_url} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-indigo-600 hover:underline">View</a>
                  </div>
                ))}
              </div>
            ) : isEdit ? (
              <p className="text-sm text-gray-400 text-center py-4">No documents uploaded yet</p>
            ) : null}
          </div>
        </Section>

        {/* ── Actions ──────────────────────────────────────────────────── */}
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={() => navigate(-1)}
            className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50">
            Cancel
          </button>
          <button type="submit" disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60">
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : <><Save className="w-4 h-4" /> {isEdit ? 'Save Changes' : 'Create Employee'}</>}
          </button>
        </div>
      </form>
    </div>
  )
}
