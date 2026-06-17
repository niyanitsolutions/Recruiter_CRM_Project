import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom'
import { useSelector } from 'react-redux'
import {
  ArrowLeft, Save, ChevronDown, ChevronUp, Loader2,
  User, Briefcase, CreditCard, Phone, GraduationCap,
  ShieldCheck, FileText, Plus, Trash2, Upload, Info,
  KeyRound, Shield, CheckCircle, AlertCircle, UserPlus, X, FolderOpen,
} from 'lucide-react'
import hrmService from '../../services/hrmService'
import userService from '../../services/userService'
import departmentService from '../../services/departmentService'
import designationService from '../../services/designationService'
import toast from 'react-hot-toast'
import ModalPortal from '../../components/common/ModalPortal'
import DraftRecoveryBanner from '../../components/common/DraftRecoveryBanner'
import { useDraftRecovery } from '../../hooks/useDraftRecovery'

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

const Section = ({ icon: Icon, title, color = 'indigo', children, defaultOpen = true, badge, hasError, sectionRef }) => {
  const [open, setOpen] = useState(defaultOpen)
  // Auto-open when an error is present
  useEffect(() => { if (hasError) setOpen(true) }, [hasError])
  const colorMap = {
    indigo:'bg-indigo-50 text-indigo-600', blue:'bg-blue-50 text-blue-600',
    green:'bg-green-50 text-green-600', purple:'bg-purple-50 text-purple-600',
    orange:'bg-orange-50 text-orange-600', red:'bg-red-50 text-red-600',
    teal:'bg-teal-50 text-teal-600', violet:'bg-violet-50 text-violet-600',
  }
  const borderCls = hasError ? 'border-red-300' : 'border-gray-200'
  return (
    <div ref={sectionRef} className={`bg-white rounded-xl border overflow-hidden ${borderCls}`}>
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors">
        <div className="flex items-center gap-3">
          <span className={`w-8 h-8 rounded-lg flex items-center justify-center ${colorMap[color]||colorMap.indigo}`}>
            <Icon className="w-4 h-4" />
          </span>
          <h3 className="font-semibold text-gray-900">{title}</h3>
          {badge}
          {hasError && (
            <span className="flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-600 text-xs rounded-full font-medium">
              <AlertCircle className="w-3 h-3" /> Required
            </span>
          )}
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

const inp    = "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/30 focus:border-indigo-500"
const inpErr = "w-full px-3 py-2 border border-red-400 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-300 focus:border-red-500"
const inpReq = (val) => val?.trim?.() ? inp : inp + ' border-amber-300'   // amber when empty but not yet tried to submit
const sel    = inp + " bg-white"
const selErr = inpErr + " bg-white"

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

const DOC_TYPES = [
  { value:'resume',              label:'Resume / CV' },
  { value:'offer_letter',        label:'Offer Letter' },
  { value:'appointment_letter',  label:'Appointment Letter' },
  { value:'contract',            label:'Employment Contract' },
  { value:'id_proof',            label:'ID Proof' },
  { value:'pan_card',            label:'PAN Card' },
  { value:'aadhaar',             label:'Aadhaar Card' },
  { value:'photo',               label:'Photo' },
  { value:'degree_certificate',  label:'Degree Certificate' },
  { value:'experience_letter',   label:'Experience Letter' },
  { value:'certificate',         label:'Other Certificate' },
  { value:'policy',              label:'Signed Policy' },
  { value:'other',               label:'Other' },
]

const ICON_EXT = { pdf:'📄', jpg:'🖼️', jpeg:'🖼️', png:'🖼️', docx:'📝', doc:'📝', default:'📎' }
function fileIcon(name) { return ICON_EXT[(name?.split('.').pop()||'').toLowerCase()] || ICON_EXT.default }
function fmtBytes(b) {
  if (b < 1024) return `${b} B`
  if (b < 1048576) return `${(b/1024).toFixed(1)} KB`
  return `${(b/1048576).toFixed(1)} MB`
}

// ═══════════════════════════════════════════════════════════════════
// Mandatory section validation
// ═══════════════════════════════════════════════════════════════════

function validateSections(form, emergencyContacts, qualifications, documents, stagedDocs, isEdit) {
  const errors = {}

  // Personal Information
  const piMissing = []
  if (!form.full_name?.trim())    piMissing.push('Full Name')
  if (!form.email?.trim())        piMissing.push('Email')
  if (!form.phone?.trim())        piMissing.push('Phone')
  if (!form.date_of_birth)        piMissing.push('Date of Birth')
  if (!form.gender)               piMissing.push('Gender')
  if (!form.pan_number?.trim())   piMissing.push('PAN Number')
  if (!form.aadhaar_number?.trim()) piMissing.push('Aadhaar Number')
  if (!form.street?.trim())       piMissing.push('Street')
  if (!form.city?.trim())         piMissing.push('City')
  if (!form.state?.trim())        piMissing.push('State')
  if (!form.zip_code?.trim())     piMissing.push('ZIP / PIN')
  if (!form.country?.trim())      piMissing.push('Country')
  if (piMissing.length) errors.personal = `Personal Information incomplete — missing: ${piMissing.join(', ')}.`

  // Employment Details
  const empMissing = []
  if (!form.department_name?.trim())  empMissing.push('Department')
  if (!form.designation_name?.trim()) empMissing.push('Designation')
  if (!form.date_of_joining)          empMissing.push('Date of Joining')
  if (!form.work_location?.trim())    empMissing.push('Work Location')
  if (empMissing.length) errors.employment = `Employment Details incomplete — missing: ${empMissing.join(', ')}.`

  // Bank Details
  const bankMissing = []
  if (!form.bank_name?.trim())      bankMissing.push('Bank Name')
  if (!form.account_number?.trim()) bankMissing.push('Account Number')
  if (!form.ifsc_code?.trim())      bankMissing.push('IFSC Code')
  if (bankMissing.length) errors.bank = `Bank Details incomplete — missing: ${bankMissing.join(', ')}.`

  // Emergency Contacts — at least 1 with name, relationship, phone
  const validContacts = emergencyContacts.filter(c =>
    c.name?.trim() && c.relationship?.trim() && c.phone?.trim()
  )
  if (validContacts.length === 0)
    errors.emergency = 'At least one emergency contact with Name, Relationship, and Phone is required.'

  // Qualifications — at least 1 with title
  const validQuals = qualifications.filter(q => q.title?.trim())
  if (validQuals.length === 0)
    errors.qualifications = 'At least one qualification record is required.'

  // Background Verification — status always has default 'pending', so always passes
  // (included to be explicit)

  // Documents — at least 1
  const totalDocs = isEdit
    ? documents.length
    : stagedDocs.length
  if (totalDocs === 0)
    errors.documents = 'At least one document must be attached (e.g. Resume, PAN, Degree Certificate).'

  return { isValid: Object.keys(errors).length === 0, errors }
}

// ═══════════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════════

export default function EmployeeForm() {
  const navigate  = useNavigate()
  const { id }    = useParams()
  const [searchParams] = useSearchParams()
  const isEdit    = !!id
  const fileRef       = useRef(null)    // edit-mode upload input
  const stageFileRef  = useRef(null)    // create-mode staged upload input
  const permRef       = useRef(null)
  const currentUser   = useSelector(s => s.auth.user)

  // Section refs for scroll-to-error
  const sectionRefs = {
    personal:      useRef(null),
    employment:    useRef(null),
    bank:          useRef(null),
    emergency:     useRef(null),
    qualifications:useRef(null),
    documents:     useRef(null),
  }

  // ── Loading / saving / error ─────────────────────────────────────
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')
  const [sectionErrors, setSectionErrors] = useState({})

  // ── Employee form state ──────────────────────────────────────────
  const [form, setForm]   = useState({ ...EMPTY_EMP })
  const [emergencyContacts, setEmergencyContacts] = useState([{ name:'', relationship:'', phone:'', email:'' }])
  const [qualifications,    setQualifications]    = useState([])
  const [disciplinary,      setDisciplinary]      = useState([])
  const [documents,         setDocuments]         = useState([])  // already-uploaded docs (edit mode)
  const [stagedDocs,        setStagedDocs]        = useState([])  // files staged for create-mode upload
  const [uploadingDoc,      setUploadingDoc]      = useState(false)
  const [docType,           setDocType]           = useState('offer_letter')
  const [docName,           setDocName]           = useState('')
  const [dragOver,          setDragOver]          = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // ── User Account section state ──────────────────────────────────
  const [createAccount, setCreateAccount] = useState(true)
  const [uForm, setUForm]       = useState({ ...EMPTY_USER })

  // Draft recovery (Task 7) — employee + account fields only (lighter, higher-value subset)
  // NOTE: uForm must be declared before draftData to avoid Temporal Dead Zone error
  const [submitted, setSubmitted] = useState(false)
  const draftData = { form, uForm }
  const setDraftData = (next) => {
    if (next.form) setForm(prev => ({ ...prev, ...next.form }))
    if (next.uForm) setUForm(prev => ({ ...prev, ...next.uForm }))
  }
  const { draftAvailable, draftSavedAt, restoreDraft, discardDraft } = useDraftRecovery(
    'employee', id, draftData, setDraftData,
    { isDirty: (d) => !!(d.form?.full_name?.trim() || d.form?.employee_code?.trim()), isSubmitted: submitted }
  )
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
      if (e.qualifications?.length)     setQualifications(e.qualifications)
      if (e.disciplinary_records?.length) setDisciplinary(e.disciplinary_records)
      if (e.documents?.length)           setDocuments(e.documents)

      if (e.crm_user_id) {
        setLinkedUserId(e.crm_user_id)
        setCreateAccount(false)
        userService.getUser(e.crm_user_id).then(u => {
          const user = u.data || u
          setLinkedUserInfo({ username: user.username||'', role: user.role||'', email: user.email||'', mobile: user.mobile||'', status: user.status||'active' })
          setUForm(prev => ({
            ...prev,
            username: user.username||'', full_name: user.full_name||'', email: user.email||'',
            mobile: user.mobile||'', employee_id: user.employee_id||'',
            role: user.role||'candidate_coordinator', user_type: user.user_type||'internal',
            department_id: user.department_id||'', designation_id: user.designation_id||'',
            reporting_to: user.reporting_to||'', joining_date: user.joining_date?.split('T')[0]||'',
            status: user.status||'active',
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
        setCreateAccount(false)
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
      setForm(f => ({
        ...f,
        full_name:        u.full_name  || f.full_name,
        email:            u.email      || f.email,
        phone:            u.mobile     || f.phone,
        department_name:  u.department || f.department_name,
        designation_name: u.designation || f.designation_name,
        date_of_joining:  u.joining_date?.split?.('T')?.[0] || f.date_of_joining,
      }))
      setUForm({
        username: u.username||'', email: u.email||'', full_name: u.full_name||'',
        mobile: u.mobile||'', password: '', employee_id: u.employee_id||'',
        role: u.role||'candidate_coordinator', user_type: u.user_type||'internal',
        department_id: u.department_id||'', designation_id: u.designation_id||'',
        reporting_to: u.reporting_to||'', joining_date: u.joining_date?.split?.('T')?.[0]||'',
        status: u.status||'active',
      })
      setLinkedUserId(userId)
      setLinkedUserInfo({ username: u.username, role: u.role, email: u.email, mobile: u.mobile, status: u.status })
      setCreateAccount(false)
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
        else delete next.full_name; break
      case 'username':
        if (!value.trim()) next.username = 'Username is required'
        else if (value.length < 3) next.username = 'Minimum 3 characters'
        else if (!/^[a-zA-Z0-9_]+$/.test(value)) next.username = 'Letters, numbers, underscores only'
        else delete next.username; break
      case 'email':
        if (!value.trim()) next.email = 'Email is required'
        else if (!/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(value)) next.email = 'Invalid email'
        else delete next.email; break
      case 'mobile': {
        const d = value.replace(/\D/g,'')
        if (!value.trim()) next.mobile = 'Contact is required'
        else if (!/^[6-9]\d{9}$/.test(d)) next.mobile = 'Must start 6–9, exactly 10 digits'
        else delete next.mobile; break
      }
      case 'password':
        if (!value) next.password = 'Password is required'
        else if (value.length < 8) next.password = 'Minimum 8 characters'
        else if (!/[A-Z]/.test(value)) next.password = 'Need uppercase letter'
        else if (!/[a-z]/.test(value)) next.password = 'Need lowercase letter'
        else if (!/\d/.test(value)) next.password = 'Need a number'
        else delete next.password; break
      default: break
    }
    setUErrors(next)
  }

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

  // ── Staged document handlers (create mode) ───────────────────────
  const addStagedFiles = (files) => {
    const newDocs = Array.from(files)
      .filter(f => f.size <= 10 * 1024 * 1024)  // 10 MB limit per file
      .map(f => ({
        key:     `${f.name}-${f.size}-${Date.now()}-${Math.random()}`,
        file:    f,
        docType: guessDocType(f.name),
        docName: f.name.replace(/\.[^.]+$/, ''),
      }))
    if (newDocs.length < files.length)
      toast.error('Files over 10 MB were skipped.')
    setStagedDocs(prev => [...prev, ...newDocs])
  }

  const guessDocType = (name) => {
    const n = name.toLowerCase()
    if (/resume|cv/.test(n))      return 'resume'
    if (/pan/.test(n))            return 'pan_card'
    if (/aadhaar|aadhar/.test(n)) return 'aadhaar'
    if (/degree|marksheet|transcript/.test(n)) return 'degree_certificate'
    if (/experience|relieving/.test(n)) return 'experience_letter'
    if (/offer/.test(n))          return 'offer_letter'
    if (/photo|picture/.test(n))  return 'photo'
    if (/contract/.test(n))       return 'contract'
    return 'other'
  }

  const removeStagedDoc = (key) =>
    setStagedDocs(prev => prev.filter(d => d.key !== key))
  const updateStagedDoc = (key, field, value) =>
    setStagedDocs(prev => prev.map(d => d.key === key ? { ...d, [field]: value } : d))

  const onDrop = (e) => {
    e.preventDefault(); setDragOver(false)
    addStagedFiles(e.dataTransfer.files)
  }
  const onDragOver = (e) => { e.preventDefault(); setDragOver(true) }
  const onDragLeave = () => setDragOver(false)

  // ── Build payload ────────────────────────────────────────────────
  const buildPayload = (overrideDuplicate = false) => {
    const deptId   = uForm.department_id === 'custom'  ? undefined : uForm.department_id
    const deptName = departments.find(d => d.id === deptId)?.name || undefined
    const desigId  = uForm.designation_id === 'custom' ? undefined : uForm.designation_id
    const desigName = designations.find(d => d.id === desigId)?.name || undefined

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

  // ── Upload staged docs after employee creation ───────────────────
  const uploadStagedDocs = async (empId) => {
    if (stagedDocs.length === 0) return
    try {
      const fd = new FormData()
      stagedDocs.forEach(sd => fd.append('files', sd.file))
      fd.append('doc_types', stagedDocs.map(sd => sd.docType).join(','))
      fd.append('doc_names', stagedDocs.map(sd => sd.docName || sd.file.name).join(','))
      await hrmService.multiUploadDocuments(empId, fd)
    } catch (err) {
      console.error('Batch document upload failed:', err)
      toast.error('Some documents could not be uploaded — retry from the employee edit page.')
    }
  }

  // ── Submit ───────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    // Run section validation
    const { isValid, errors: secErrs } = validateSections(
      form, emergencyContacts, qualifications, documents, stagedDocs, isEdit
    )
    setSectionErrors(secErrs)

    if (!isValid) {
      setError('Please complete all required sections before saving.')
      // Scroll to first failing section
      const order = ['personal','employment','bank','emergency','qualifications','documents']
      for (const key of order) {
        if (secErrs[key]) {
          sectionRefs[key]?.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          break
        }
      }
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
        // Upload any staged docs in edit mode (if user dropped new files)
        if (stagedDocs.length > 0) await uploadStagedDocs(id)
        setSubmitted(true)
        toast.success('Employee updated')
        navigate('/hrm/employees')
        return
      }

      // Create mode: create employee, then upload staged docs
      const payload = buildPayload()
      const result = await hrmService.createEmployee(payload)
      const newEmpId = result.data?.id || result.data?._id

      if (newEmpId && stagedDocs.length > 0) {
        await uploadStagedDocs(newEmpId)
      }

      const hasAccount = createAccount && !linkedUserId && uForm.username && uForm.password
      setSubmitted(true)
      toast.success(hasAccount ? 'Employee and login account created' : 'Employee profile created')
      navigate('/hrm/employees')
    } catch (err) {
      const status = err.response?.status
      const detail = err.response?.data?.detail

      if (status === 409 && detail?.duplicate) {
        pendingPayload.current = buildPayload()
        setDuplicateModal({ show: true, fields: detail.fields || {}, overrideChecked: false, overrideTouched: false })
        setSaving(false)
        return
      }
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
      const result = await hrmService.createEmployee(payload)
      const newEmpId = result.data?.id || result.data?._id
      if (newEmpId && stagedDocs.length > 0) await uploadStagedDocs(newEmpId)
      setDuplicateModal({ show: false, fields: {}, overrideChecked: false, overrideTouched: false })
      toast.success('Employee created')
      navigate('/hrm/employees')
    } catch (err) {
      const msg = err.response?.data?.message || err.response?.data?.detail
      setError(typeof msg === 'string' ? msg : 'Failed to create employee')
      setDuplicateModal({ show: false, fields: {}, overrideChecked: false, overrideTouched: false })
    }
    setSaving(false)
  }, [duplicateModal.overrideChecked, navigate, stagedDocs])

  // ── Document upload (edit mode) ──────────────────────────────────
  const handleDocUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !id) return
    if (!docName.trim()) { toast.error('Enter a document name first'); return }
    setUploadingDoc(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('doc_type', docType)
      fd.append('doc_name', docName)
      const res = await hrmService.uploadDocument(id, fd)
      setDocuments(d => [...d, res.data.document])
      setDocName('')
      // Clear section error for documents if now satisfied
      if (sectionErrors.documents) setSectionErrors(prev => { const n={...prev}; delete n.documents; return n })
      toast.success('Document uploaded')
    } catch { toast.error('Upload failed') }
    setUploadingDoc(false)
    e.target.value = ''
  }

  // ── Emergency contacts helpers ───────────────────────────────────
  const addContact    = () => setEmergencyContacts(c => [...c, { name:'', relationship:'', phone:'', email:'' }])
  const removeContact = i  => setEmergencyContacts(c => c.filter((_,idx) => idx !== i))
  const setContact    = (i,k,v) => setEmergencyContacts(c => c.map((x,idx) => idx===i?{...x,[k]:v}:x))

  // ── Qualifications helpers ───────────────────────────────────────
  const addQual    = () => setQualifications(q => [...q, { type:'academic', title:'', institution:'', year:'', grade:'' }])
  const removeQual = i  => setQualifications(q => q.filter((_,idx) => idx !== i))
  const setQual    = (i,k,v) => setQualifications(q => q.map((x,idx) => idx===i?{...x,[k]:v}:x))

  // ── Disciplinary helpers ─────────────────────────────────────────
  const addDisc    = () => setDisciplinary(d => [...d, { date:'', incident:'', action_taken:'' }])
  const removeDisc = i  => setDisciplinary(d => d.filter((_,idx) => idx !== i))
  const setDisc    = (i,k,v) => setDisciplinary(d => d.map((x,idx) => idx===i?{...x,[k]:v}:x))

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
          <p className="text-sm text-gray-500 mt-0.5">Complete onboarding record</p>
        </div>
      </div>

      {prefillBanner && (
        <div className="flex items-center gap-2 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg p-3 text-sm">
          <Info className="w-4 h-4 flex-shrink-0" />
          {prefillBanner} — review and complete the remaining fields.
        </div>
      )}

      {/* ── Section validation summary ── */}
      {Object.keys(sectionErrors).length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
            <p className="text-sm font-semibold text-red-700">Please complete all required sections:</p>
          </div>
          <ul className="space-y-1">
            {Object.values(sectionErrors).map((msg, i) => (
              <li key={i} className="text-sm text-red-600 flex items-start gap-2">
                <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0 mt-1.5" />
                {msg}
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && !Object.keys(sectionErrors).length && (
        <div className="bg-red-50 text-red-700 border border-red-200 rounded-lg p-3 text-sm">{error}</div>
      )}

      {draftAvailable && (
        <DraftRecoveryBanner savedAt={draftSavedAt} onRestore={restoreDraft} onDiscard={discardDraft} />
      )}

      <form onSubmit={handleSubmit} className="space-y-4">

        {/* ═══════════════════════════════════════════════════════════
            SECTION 1 — USER ACCOUNT INFORMATION (unchanged logic)
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
              <Link to={`/users/${linkedUserId}`} className="text-xs text-indigo-600 hover:underline font-medium whitespace-nowrap">
                View / Edit User →
              </Link>
            </div>
          )}

          {isEdit && !linkedUserId && (
            <div className="mt-2 mb-4 flex items-center justify-between p-4 bg-amber-50 border border-amber-200 rounded-xl">
              <div className="flex items-center gap-2 text-amber-700 text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                No CRM login account linked.
              </div>
              <Link to={`/users/new?employee_id=${id}`} className="text-xs text-indigo-600 hover:underline font-medium whitespace-nowrap">
                Create Account →
              </Link>
            </div>
          )}

          {!isEdit && (
            <>
              {!modeB && (
                <div className="flex items-center gap-3 mt-2 mb-4 p-4 bg-violet-50 border border-violet-200 rounded-xl">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input type="checkbox" checked={createAccount} onChange={e => setCreateAccount(e.target.checked)} className="w-4 h-4 accent-indigo-600" />
                    <span className="text-sm font-medium text-violet-800">Create CRM Login Account for this employee</span>
                  </label>
                  {!createAccount && <span className="ml-auto text-xs text-gray-500">Leave unchecked to create Employee only</span>}
                </div>
              )}

              {(createAccount && !modeB) && (
                <div className="space-y-6">
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-3 mt-1">Basic Information</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Full Name <span className="text-red-500">*</span></label>
                        <input type="text" name="full_name" value={uForm.full_name}
                          onChange={e => { handleUChange(e); set('full_name', e.target.value) }}
                          onBlur={handleUBlur} className={uErrors.full_name ? inpErr : inp} />
                        {uErrors.full_name && <p className="mt-1 text-xs text-red-500">{uErrors.full_name}</p>}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Employee ID</label>
                        <input type="text" name="employee_id" value={uForm.employee_id} onChange={handleUChange} className={inp} />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Username <span className="text-red-500">*</span></label>
                        <input type="text" name="username" value={uForm.username}
                          onChange={handleUChange} onBlur={handleUBlur}
                          className={uErrors.username ? inpErr : inp} autoComplete="off" />
                        {uErrors.username && <p className="mt-1 text-xs text-red-500">{uErrors.username}</p>}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Password <span className="text-red-500">*</span></label>
                        <input type="password" name="password" value={uForm.password}
                          onChange={handleUChange} onBlur={handleUBlur}
                          className={uErrors.password ? inpErr : inp} autoComplete="new-password" />
                        <p className="mt-1 text-xs text-gray-400">Min 8 chars, uppercase, lowercase, number.</p>
                        {uErrors.password && <p className="mt-1 text-xs text-red-500">{uErrors.password}</p>}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Email <span className="text-red-500">*</span></label>
                        <input type="email" name="email" value={uForm.email}
                          onChange={e => { handleUChange(e); set('email', e.target.value) }}
                          onBlur={handleUBlur} className={uErrors.email ? inpErr : inp} />
                        {uErrors.email && <p className="mt-1 text-xs text-red-500">{uErrors.email}</p>}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Contact <span className="text-red-500">*</span></label>
                        <input type="text" name="mobile" value={uForm.mobile}
                          onChange={e => { handleUChange(e); set('phone', e.target.value) }}
                          onBlur={handleUBlur} className={uErrors.mobile ? inpErr : inp} />
                        {uErrors.mobile && <p className="mt-1 text-xs text-red-500">{uErrors.mobile}</p>}
                      </div>
                    </div>
                  </div>

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
                            const dName = departments.find(d => d.id === e.target.value)?.name || ''
                            if (dName) set('department_name', dName)
                          }} className={sel}>
                          <option value="">Select</option>
                          {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                          <option value="custom">Custom…</option>
                        </select>
                        {uForm.department_id === 'custom' && (
                          <input type="text" value={deptCustom} onChange={e => setDeptCustom(e.target.value)}
                            placeholder="Enter new department" className={"mt-2 " + inp} />
                        )}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Designation</label>
                        <select name="designation_id" value={uForm.designation_id}
                          onChange={e => {
                            handleUChange(e)
                            if (e.target.value !== 'custom') setDesigCustom('')
                            const dName = designations.find(d => d.id === e.target.value)?.name || ''
                            if (dName) set('designation_name', dName)
                          }} className={sel}>
                          <option value="">Select</option>
                          {designations.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                          <option value="custom">Custom…</option>
                        </select>
                        {uForm.designation_id === 'custom' && (
                          <input type="text" value={desigCustom} onChange={e => setDesigCustom(e.target.value)}
                            placeholder="Enter new designation" className={"mt-2 " + inp} />
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
                          onChange={e => { handleUChange(e); set('date_of_joining', e.target.value) }} className={inp} />
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

                  {!isPartner && (
                    <div ref={permRef} className={`rounded-xl border p-5 ${!uForm.username || uErrors.permissions ? 'border-red-200 bg-red-50/30' : 'border-gray-200 bg-gray-50/40'}`}>
                      <div className="flex items-center gap-2 mb-4">
                        <Shield className="w-4 h-4 text-indigo-600" />
                        <p className="text-sm font-semibold text-gray-800">Permissions <span className="text-red-500">*</span></p>
                      </div>
                      {uErrors.permissions && <p className="mb-3 text-sm text-red-600 font-medium">{uErrors.permissions}</p>}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Department <span className="text-red-500">*</span></label>
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
                            <p className="text-xs font-semibold text-gray-600 mb-2">{computedPermissions.length} permissions will be assigned</p>
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

              {!createAccount && !modeB && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
                  <Field label="Full Name" required error={sectionErrors.personal && !form.full_name.trim() ? 'Required' : ''}>
                    <input className={!form.full_name.trim() && sectionErrors.personal ? inpErr : inp}
                      value={form.full_name} onChange={e => set('full_name', e.target.value)} />
                  </Field>
                  <Field label="Email" required error={sectionErrors.personal && !form.email.trim() ? 'Required' : ''}>
                    <input type="email" className={!form.email.trim() && sectionErrors.personal ? inpErr : inp}
                      value={form.email} onChange={e => set('email', e.target.value)} />
                  </Field>
                  <Field label="Phone" error="">
                    <input type="tel" className={inp} value={form.phone} onChange={e => set('phone', e.target.value)} />
                  </Field>
                  <div className="md:col-span-3 text-xs text-gray-400 -mt-2">
                    Employee will be created without a CRM login account.
                  </div>
                </div>
              )}
            </>
          )}
        </Section>

        {/* ═══════════════════════════════════════════════════════════
            SECTION 2 — PERSONAL INFORMATION
            ═══════════════════════════════════════════════════════════ */}
        <Section icon={User} title="Personal Information" color="indigo"
          hasError={!!sectionErrors.personal} sectionRef={sectionRefs.personal}>
          {isEdit && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 pb-4 border-b border-gray-100">
              <Field label="Full Name" required error={sectionErrors.personal && !form.full_name.trim() ? 'Required' : ''}>
                <input className={sectionErrors.personal && !form.full_name.trim() ? inpErr : inp}
                  value={form.full_name} onChange={e => set('full_name', e.target.value)} />
              </Field>
              <Field label="Email" required error={sectionErrors.personal && !form.email.trim() ? 'Required' : ''}>
                <input type="email" className={sectionErrors.personal && !form.email.trim() ? inpErr : inp}
                  value={form.email} onChange={e => set('email', e.target.value)} />
              </Field>
              <Field label="Phone" required error={sectionErrors.personal && !form.phone.trim() ? 'Required' : ''}>
                <input type="tel" className={sectionErrors.personal && !form.phone.trim() ? inpErr : inp}
                  value={form.phone} onChange={e => set('phone', e.target.value)} />
              </Field>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
            <Field label="Date of Birth" required error={sectionErrors.personal && !form.date_of_birth ? 'Required' : ''}>
              <input type="date" className={sectionErrors.personal && !form.date_of_birth ? inpErr : inp}
                value={form.date_of_birth} onChange={e => set('date_of_birth', e.target.value)} />
            </Field>
            <Field label="Gender" required error={sectionErrors.personal && !form.gender ? 'Required' : ''}>
              <select className={sectionErrors.personal && !form.gender ? selErr : sel}
                value={form.gender} onChange={e => set('gender', e.target.value)}>
                <option value="">— Select —</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
                <option value="prefer_not_to_say">Prefer not to say</option>
              </select>
            </Field>
            <Field label="Blood Group">
              <select className={sel} value={form.blood_group} onChange={e => set('blood_group', e.target.value)}>
                <option value="">— Select —</option>
                {['A+','A-','B+','B-','AB+','AB-','O+','O-'].map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </Field>
            <Field label="PAN Number" required error={sectionErrors.personal && !form.pan_number.trim() ? 'Required' : ''}>
              <input className={sectionErrors.personal && !form.pan_number.trim() ? inpErr : inp}
                value={form.pan_number} onChange={e => set('pan_number', e.target.value.toUpperCase())}
                placeholder="ABCDE1234F" maxLength={10} />
            </Field>
            <Field label="Aadhaar Number" required className="md:col-span-2"
              error={sectionErrors.personal && !form.aadhaar_number.trim() ? 'Required' : ''}>
              <input className={sectionErrors.personal && !form.aadhaar_number.trim() ? inpErr : inp}
                value={form.aadhaar_number} onChange={e => set('aadhaar_number', e.target.value)}
                placeholder="XXXX XXXX XXXX" maxLength={14} />
            </Field>
          </div>
          <p className="text-xs font-semibold text-gray-500 uppercase mt-5 mb-3">Residential Address</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Street" required className="md:col-span-2"
              error={sectionErrors.personal && !form.street.trim() ? 'Required' : ''}>
              <input className={sectionErrors.personal && !form.street.trim() ? inpErr : inp}
                value={form.street} onChange={e => set('street', e.target.value)} />
            </Field>
            <Field label="City" required error={sectionErrors.personal && !form.city.trim() ? 'Required' : ''}>
              <input className={sectionErrors.personal && !form.city.trim() ? inpErr : inp}
                value={form.city} onChange={e => set('city', e.target.value)} />
            </Field>
            <Field label="State" required error={sectionErrors.personal && !form.state.trim() ? 'Required' : ''}>
              <input className={sectionErrors.personal && !form.state.trim() ? inpErr : inp}
                value={form.state} onChange={e => set('state', e.target.value)} />
            </Field>
            <Field label="ZIP / PIN" required error={sectionErrors.personal && !form.zip_code.trim() ? 'Required' : ''}>
              <input className={sectionErrors.personal && !form.zip_code.trim() ? inpErr : inp}
                value={form.zip_code} onChange={e => set('zip_code', e.target.value)} />
            </Field>
            <Field label="Country" required error={sectionErrors.personal && !form.country.trim() ? 'Required' : ''}>
              <input className={sectionErrors.personal && !form.country.trim() ? inpErr : inp}
                value={form.country} onChange={e => set('country', e.target.value)} />
            </Field>
          </div>
        </Section>

        {/* ═══════════════════════════════════════════════════════════
            SECTION 3 — EMPLOYMENT DETAILS
            ═══════════════════════════════════════════════════════════ */}
        <Section icon={Briefcase} title="Employment Details" color="blue"
          hasError={!!sectionErrors.employment} sectionRef={sectionRefs.employment}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
            <Field label="Department" required error={sectionErrors.employment && !form.department_name.trim() ? 'Required' : ''}>
              <input className={sectionErrors.employment && !form.department_name.trim() ? inpErr : inp}
                value={form.department_name} onChange={e => set('department_name', e.target.value)}
                placeholder="e.g. Engineering" />
            </Field>
            <Field label="Designation" required error={sectionErrors.employment && !form.designation_name.trim() ? 'Required' : ''}>
              <input className={sectionErrors.employment && !form.designation_name.trim() ? inpErr : inp}
                value={form.designation_name} onChange={e => set('designation_name', e.target.value)} />
            </Field>
            <Field label="Employment Type">
              <select className={sel} value={form.employment_type} onChange={e => set('employment_type', e.target.value)}>
                <option value="full_time">Full Time</option>
                <option value="part_time">Part Time</option>
                <option value="contract">Contract</option>
                <option value="intern">Intern</option>
                <option value="consultant">Consultant</option>
              </select>
            </Field>
            <Field label="Date of Joining" required error={sectionErrors.employment && !form.date_of_joining ? 'Required' : ''}>
              <input type="date" className={sectionErrors.employment && !form.date_of_joining ? inpErr : inp}
                value={form.date_of_joining} onChange={e => set('date_of_joining', e.target.value)} />
            </Field>
            <Field label="Work Location" required error={sectionErrors.employment && !form.work_location.trim() ? 'Required' : ''}>
              <input className={sectionErrors.employment && !form.work_location.trim() ? inpErr : inp}
                value={form.work_location} onChange={e => set('work_location', e.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Shift Start">
                <input type="time" className={inp} value={form.shift_start_time} onChange={e => set('shift_start_time', e.target.value)} />
              </Field>
              <Field label="Shift End">
                <input type="time" className={inp} value={form.shift_end_time} onChange={e => set('shift_end_time', e.target.value)} />
              </Field>
            </div>
          </div>
          <div className="mt-4">
            <Field label="Role Description / Notes">
              <textarea rows={3} className={inp + " resize-none"} value={form.work_description}
                onChange={e => set('work_description', e.target.value)} placeholder="Responsibilities, notes…" />
            </Field>
          </div>
          <p className="text-xs font-semibold text-gray-500 uppercase mt-5 mb-3">Salary Structure</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[['ctc','Annual CTC (₹)'],['basic','Basic (Monthly)'],['hra','HRA (Monthly)'],['special_allowance','Special Allowance']].map(([k,l]) => (
              <Field key={k} label={l}>
                <input type="number" min="0" className={inp} value={form[k]} onChange={e => set(k, e.target.value)} />
              </Field>
            ))}
          </div>
        </Section>

        {/* ═══════════════════════════════════════════════════════════
            SECTION 4 — BANK DETAILS
            ═══════════════════════════════════════════════════════════ */}
        <Section icon={CreditCard} title="Bank Details" color="green"
          hasError={!!sectionErrors.bank} sectionRef={sectionRefs.bank}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
            <Field label="Bank Name" required error={sectionErrors.bank && !form.bank_name.trim() ? 'Required' : ''}>
              <input className={sectionErrors.bank && !form.bank_name.trim() ? inpErr : inp}
                value={form.bank_name} onChange={e => set('bank_name', e.target.value)} />
            </Field>
            <Field label="Account Number" required error={sectionErrors.bank && !form.account_number.trim() ? 'Required' : ''}>
              <input className={sectionErrors.bank && !form.account_number.trim() ? inpErr : inp}
                value={form.account_number} onChange={e => set('account_number', e.target.value)} />
            </Field>
            <Field label="IFSC Code" required error={sectionErrors.bank && !form.ifsc_code.trim() ? 'Required' : ''}>
              <input className={sectionErrors.bank && !form.ifsc_code.trim() ? inpErr : inp}
                value={form.ifsc_code} onChange={e => set('ifsc_code', e.target.value.toUpperCase())} />
            </Field>
            <Field label="Account Holder Name">
              <input className={inp} value={form.account_holder_name} onChange={e => set('account_holder_name', e.target.value)} />
            </Field>
            <Field label="PF Number">
              <input className={inp} value={form.pf_number} onChange={e => set('pf_number', e.target.value)} />
            </Field>
            <Field label="UAN Number">
              <input className={inp} value={form.uan_number} onChange={e => set('uan_number', e.target.value)} />
            </Field>
          </div>
        </Section>

        {/* ═══════════════════════════════════════════════════════════
            SECTION 5 — EMERGENCY CONTACTS
            ═══════════════════════════════════════════════════════════ */}
        <Section icon={Phone} title="Emergency Contacts" color="orange"
          hasError={!!sectionErrors.emergency} sectionRef={sectionRefs.emergency}>
          {sectionErrors.emergency && (
            <p className="mt-2 mb-3 text-sm text-red-600">{sectionErrors.emergency}</p>
          )}
          <div className="space-y-4 mt-2">
            {emergencyContacts.map((c, i) => (
              <div key={i} className="grid grid-cols-1 md:grid-cols-4 gap-3 p-4 bg-gray-50 rounded-lg">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Name <span className="text-red-500">*</span></label>
                  <input className={sectionErrors.emergency && i === 0 && !c.name?.trim() ? inpErr : inp}
                    placeholder="Name" value={c.name} onChange={e => setContact(i,'name',e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Relationship <span className="text-red-500">*</span></label>
                  <input className={sectionErrors.emergency && i === 0 && !c.relationship?.trim() ? inpErr : inp}
                    placeholder="Relationship" value={c.relationship} onChange={e => setContact(i,'relationship',e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Phone <span className="text-red-500">*</span></label>
                  <input className={sectionErrors.emergency && i === 0 && !c.phone?.trim() ? inpErr : inp}
                    placeholder="Phone" value={c.phone} onChange={e => setContact(i,'phone',e.target.value)} />
                </div>
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <label className="block text-xs text-gray-500 mb-1">Email (opt.)</label>
                    <input className={inp} placeholder="Email" value={c.email||''} onChange={e => setContact(i,'email',e.target.value)} />
                  </div>
                  {emergencyContacts.length > 1 && (
                    <button type="button" onClick={() => removeContact(i)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg flex-shrink-0 mb-0.5">
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
        <Section icon={GraduationCap} title="Qualifications" color="purple"
          hasError={!!sectionErrors.qualifications} sectionRef={sectionRefs.qualifications}
          defaultOpen={false}>
          {sectionErrors.qualifications && (
            <p className="mt-2 mb-3 text-sm text-red-600">{sectionErrors.qualifications}</p>
          )}
          <div className="space-y-3 mt-2">
            {qualifications.map((q, i) => (
              <div key={i} className="grid grid-cols-2 md:grid-cols-5 gap-3 p-4 bg-gray-50 rounded-lg">
                <select className={sel} value={q.type} onChange={e => setQual(i,'type',e.target.value)}>
                  <option value="academic">Academic</option>
                  <option value="professional">Professional</option>
                </select>
                <input className={i === 0 && sectionErrors.qualifications && !q.title?.trim() ? inpErr : inp}
                  placeholder="Degree / Certificate *" value={q.title} onChange={e => setQual(i,'title',e.target.value)} />
                <input className={inp} placeholder="Institution" value={q.institution||''} onChange={e => setQual(i,'institution',e.target.value)} />
                <input className={inp} type="number" min="1950" max="2099" placeholder="Year" value={q.year||''} onChange={e => setQual(i,'year',e.target.value)} />
                <div className="flex gap-2">
                  <input className={inp} placeholder="Grade / Score" value={q.grade||''} onChange={e => setQual(i,'grade',e.target.value)} />
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
            <Field label="Verification Status" required>
              <select className={sel} value={form.bg_status} onChange={e => set('bg_status', e.target.value)}>
                <option value="pending">Pending</option>
                <option value="verified">Verified</option>
                <option value="rejected">Rejected</option>
              </select>
            </Field>
            <Field label="Notes">
              <textarea rows={2} className={inp + " resize-none"} value={form.bg_notes}
                onChange={e => set('bg_notes', e.target.value)} placeholder="Verification notes…" />
            </Field>
          </div>
        </Section>

        {/* ═══════════════════════════════════════════════════════════
            SECTION 8 — DISCIPLINARY RECORDS (optional)
            ═══════════════════════════════════════════════════════════ */}
        <Section icon={FileText} title="Disciplinary Records" color="red" defaultOpen={false}>
          <div className="space-y-3 mt-2">
            {disciplinary.map((d, i) => (
              <div key={i} className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4 bg-red-50 rounded-lg">
                <input type="date" className={inp} value={d.date} onChange={e => setDisc(i,'date',e.target.value)} />
                <input className={inp} placeholder="Incident" value={d.incident} onChange={e => setDisc(i,'incident',e.target.value)} />
                <div className="flex gap-2">
                  <input className={inp} placeholder="Action taken" value={d.action_taken} onChange={e => setDisc(i,'action_taken',e.target.value)} />
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
        <Section icon={FileText} title="Documents" color="blue"
          hasError={!!sectionErrors.documents} sectionRef={sectionRefs.documents}
          badge={
            (isEdit ? documents.length : stagedDocs.length) > 0
              ? <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full font-medium">
                  {isEdit ? documents.length : stagedDocs.length} file{(isEdit ? documents.length : stagedDocs.length) !== 1 ? 's' : ''}
                </span>
              : null
          }
          defaultOpen>
          {sectionErrors.documents && (
            <p className="mt-2 mb-3 text-sm text-red-600">{sectionErrors.documents}</p>
          )}

          {/* ── Create mode: staged upload (drag & drop + browse) ── */}
          {!isEdit && (
            <div className="mt-2 space-y-4">
              {/* Drop zone */}
              <div
                onDrop={onDrop} onDragOver={onDragOver} onDragLeave={onDragLeave}
                onClick={() => stageFileRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                  dragOver
                    ? 'border-indigo-400 bg-indigo-50'
                    : sectionErrors.documents && stagedDocs.length === 0
                    ? 'border-red-300 bg-red-50/30'
                    : 'border-gray-300 bg-gray-50 hover:border-indigo-300 hover:bg-indigo-50/30'
                }`}>
                <input
                  ref={stageFileRef}
                  type="file"
                  multiple
                  accept=".pdf,.jpg,.jpeg,.png,.docx,.doc"
                  className="hidden"
                  onChange={e => { if (e.target.files?.length) addStagedFiles(e.target.files); e.target.value = '' }}
                />
                <FolderOpen className={`w-10 h-10 mx-auto mb-3 ${dragOver ? 'text-indigo-500' : 'text-gray-400'}`} />
                <p className="text-sm font-medium text-gray-700 mb-1">
                  Drop files here or <span className="text-indigo-600">browse</span>
                </p>
                <p className="text-xs text-gray-400">
                  PDF, JPG, PNG, DOCX · Max 10 MB per file · Multiple files supported
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  e.g. Resume.pdf, PAN.pdf, Aadhaar.pdf, Degree.pdf, Photo.jpg
                </p>
              </div>

              {/* Staged file list */}
              {stagedDocs.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase">Staged Files — will upload on save</p>
                  {stagedDocs.map(sd => (
                    <div key={sd.key} className="flex items-start gap-3 p-3 bg-white border border-gray-200 rounded-lg">
                      <span className="text-xl flex-shrink-0 mt-0.5">{fileIcon(sd.file.name)}</span>
                      <div className="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-3 gap-2">
                        <div className="md:col-span-1">
                          <p className="text-sm font-medium text-gray-900 truncate">{sd.file.name}</p>
                          <p className="text-xs text-gray-400">{fmtBytes(sd.file.size)}</p>
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Document Type</label>
                          <select value={sd.docType} className={sel + " text-xs"}
                            onChange={e => updateStagedDoc(sd.key, 'docType', e.target.value)}>
                            {DOC_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Document Name</label>
                          <input value={sd.docName} className={inp + " text-xs"}
                            onChange={e => updateStagedDoc(sd.key, 'docName', e.target.value)}
                            placeholder="Display name" />
                        </div>
                      </div>
                      <button type="button" onClick={() => removeStagedDoc(sd.key)}
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg flex-shrink-0 mt-0.5">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {stagedDocs.length === 0 && (
                <p className="text-xs text-gray-400 text-center">
                  At least 1 document is required (Resume, PAN, Aadhaar, Degree, Photo, etc.)
                </p>
              )}
            </div>
          )}

          {/* ── Edit mode: upload to server immediately ── */}
          {isEdit && (
            <div className="mt-2 space-y-4">
              <div className="flex flex-wrap gap-3 items-end p-4 bg-gray-50 rounded-lg">
                <Field label="Document Type" className="w-44">
                  <select className={sel} value={docType} onChange={e => setDocType(e.target.value)}>
                    {DOC_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </Field>
                <Field label="Document Name" className="flex-1 min-w-48">
                  <input className={inp} placeholder="e.g. Offer Letter – Oct 2024" value={docName} onChange={e => setDocName(e.target.value)} />
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

              {/* Also allow staged files in edit mode for batch upload */}
              <div
                onDrop={onDrop} onDragOver={onDragOver} onDragLeave={onDragLeave}
                onClick={() => stageFileRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-colors ${
                  dragOver ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 bg-gray-50 hover:border-indigo-300'
                }`}>
                <input ref={stageFileRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.docx,.doc"
                  className="hidden" onChange={e => { if (e.target.files?.length) addStagedFiles(e.target.files); e.target.value = '' }} />
                <Upload className="w-6 h-6 mx-auto mb-1 text-gray-400" />
                <p className="text-xs text-gray-500">Drop multiple files here to upload on save</p>
              </div>

              {stagedDocs.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase">Staged Files — will upload on save</p>
                  {stagedDocs.map(sd => (
                    <div key={sd.key} className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <span className="text-lg">{fileIcon(sd.file.name)}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{sd.file.name}</p>
                        <p className="text-xs text-gray-400">{fmtBytes(sd.file.size)}</p>
                      </div>
                      <select value={sd.docType} className={sel + " w-36 text-xs"}
                        onChange={e => updateStagedDoc(sd.key, 'docType', e.target.value)}>
                        {DOC_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                      <button type="button" onClick={() => removeStagedDoc(sd.key)}
                        className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg flex-shrink-0">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {documents.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase">Uploaded Documents</p>
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
              ) : (
                <p className="text-sm text-gray-400 text-center py-2">No documents uploaded yet.</p>
              )}
            </div>
          )}
        </Section>

        {/* ── Actions ── */}
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={() => navigate(-1)}
            className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50">
            Cancel
          </button>
          <button type="submit" disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60">
            {saving
              ? <><Loader2 className="w-4 h-4 animate-spin" />
                  {stagedDocs.length > 0 && !isEdit ? `Saving & uploading ${stagedDocs.length} file${stagedDocs.length>1?'s':''}…` : 'Saving…'}
                </>
              : <><Save className="w-4 h-4" /> {isEdit ? 'Save Changes' : 'Create Employee'}</>
            }
          </button>
        </div>
      </form>
    </div>
  )
}
