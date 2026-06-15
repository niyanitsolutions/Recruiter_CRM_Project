import React, { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom'
import {
  ArrowLeft, Save, ChevronDown, ChevronUp,
  User, Briefcase, CreditCard, Phone, GraduationCap,
  ShieldCheck, FileText, Plus, Trash2, Upload, X, Info, Link2, KeyRound,
  CheckCircle, AlertCircle,
} from 'lucide-react'
import hrmService from '../../services/hrmService'
import userService from '../../services/userService'
import toast from 'react-hot-toast'
import { useFormValidation, validators } from '../../hooks/useFormValidation'

// ── Collapsible section wrapper ───────────────────────────────────────────────
const Section = ({ icon: Icon, title, color = 'indigo', children, defaultOpen = true }) => {
  const [open, setOpen] = useState(defaultOpen)
  const colorMap = {
    indigo: 'bg-indigo-50 text-indigo-600',
    blue:   'bg-blue-50 text-blue-600',
    green:  'bg-green-50 text-green-600',
    purple: 'bg-purple-50 text-purple-600',
    orange: 'bg-orange-50 text-orange-600',
    red:    'bg-red-50 text-red-600',
    teal:   'bg-teal-50 text-teal-600',
    violet: 'bg-violet-50 text-violet-600',
  }
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className={`w-8 h-8 rounded-lg flex items-center justify-center ${colorMap[color] || colorMap.indigo}`}>
            <Icon className="w-4 h-4" />
          </span>
          <h3 className="font-semibold text-gray-900">{title}</h3>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>
      {open && <div className="px-6 pb-6 pt-2 border-t border-gray-100">{children}</div>}
    </div>
  )
}

// ── Reusable field components ─────────────────────────────────────────────────
const Field = ({ label, required, error, children, className = '' }) => (
  <div className={className}>
    <label className="block text-sm font-medium text-gray-700 mb-1">
      {label}{required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
    {children}
    {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
  </div>
)

const Input = ({ ...props }) => (
  <input className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/30 focus:border-indigo-500" {...props} />
)

const Select = ({ options = [], ...props }) => (
  <select className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/30 focus:border-indigo-500 bg-white" {...props}>
    {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
  </select>
)

const Textarea = ({ ...props }) => (
  <textarea rows={3} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/30 focus:border-indigo-500 resize-none" {...props} />
)

const ROLE_OPTIONS = [
  { value: 'hr',                   label: 'HR' },
  { value: 'candidate_coordinator', label: 'Candidate Coordinator' },
  { value: 'client_coordinator',    label: 'Client Coordinator' },
  { value: 'accounts',              label: 'Accounts' },
  { value: 'admin',                 label: 'Admin' },
]

// ── Main form ─────────────────────────────────────────────────────────────────
const EMPTY_FORM = {
  // Account Information (section 1 — drives both employee + user creation)
  full_name: '', email: '', phone: '', department_name: '',
  username: '', password: '', role: 'hr',
  // Personal
  gender: '', date_of_birth: '', blood_group: '',
  // Address
  street: '', city: '', state: '', zip_code: '', country: 'India',
  // IDs
  pan_number: '', aadhaar_number: '',
  // Employment (department moved to Account Info)
  designation_name: '',
  reporting_manager_id: '', employment_type: 'full_time',
  date_of_joining: '', work_location: '',
  shift_start_time: '09:00', shift_end_time: '18:00',
  work_description: '',
  // Salary
  ctc: '', basic: '', hra: '', special_allowance: '',
  // Bank
  bank_name: '', account_number: '', ifsc_code: '', account_holder_name: '',
  // Compliance
  pf_number: '', uan_number: '',
  // Background
  bg_status: 'pending', bg_notes: '',
}

export default function EmployeeForm() {
  const navigate = useNavigate()
  const { id }   = useParams()
  const [searchParams] = useSearchParams()
  const isEdit   = !!id
  const fileRef  = useRef(null)

  const [saving, setSaving]             = useState(false)
  const [error, setError]               = useState('')
  const [form, setForm]                 = useState({ ...EMPTY_FORM })
  const [linkedUserId, setLinkedUserId] = useState('')   // crm_user_id from employee doc
  const [linkedUserInfo, setLinkedUserInfo] = useState(null) // { username, role, email, mobile }
  const [prefillBanner, setPrefillBanner]   = useState('')

  const { errors: fErrors, touched: fTouched, touch, validate: fValidate } = useFormValidation({
    full_name: validators.required('Full name'),
    email:     validators.compose(validators.required('Email'), validators.email()),
    phone:     validators.compose(validators.mobile()),
  })

  // Dynamic lists
  const [emergencyContacts, setEmergencyContacts] = useState([{ name: '', relationship: '', phone: '', email: '' }])
  const [qualifications,    setQualifications]    = useState([])
  const [disciplinary,      setDisciplinary]      = useState([])
  const [documents,         setDocuments]         = useState([])
  const [uploadingDoc,      setUploadingDoc]      = useState(false)
  const [docType,           setDocType]           = useState('offer_letter')
  const [docName,           setDocName]           = useState('')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // ── Load existing employee ────────────────────────────────────────────────
  useEffect(() => {
    if (!isEdit) return
    hrmService.getEmployee(id).then(r => {
      const e = r.data
      setForm({
        full_name:        e.full_name          || '',
        email:            e.email              || '',
        phone:            e.phone              || '',
        department_name:  e.department_name   || '',
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
        // account fields unused in edit mode but keep defaults
        username: '', password: '', role: 'hr',
      })
      if (e.emergency_contacts?.length)  setEmergencyContacts(e.emergency_contacts)
      if (e.qualifications?.length)       setQualifications(e.qualifications)
      if (e.disciplinary_records?.length) setDisciplinary(e.disciplinary_records)
      if (e.documents?.length)            setDocuments(e.documents)

      // Load linked user info for MODE B display
      if (e.crm_user_id) {
        setLinkedUserId(e.crm_user_id)
        userService.getUser(e.crm_user_id).then(u => {
          setLinkedUserInfo({
            username: u.username || '',
            role:     u.role     || '',
            email:    u.email    || '',
            mobile:   u.mobile   || '',
          })
        }).catch(() => {})
      }
    }).catch(() => {})
  }, [id])

  // ── Prefill from User when ?user_id query param is present ───────────────
  useEffect(() => {
    if (isEdit) return
    const userId = searchParams.get('user_id')
    if (!userId) return
    userService.getUser(userId).then(u => {
      setForm(f => ({
        ...f,
        full_name:       u.full_name   || f.full_name,
        email:           u.email       || f.email,
        phone:           u.mobile      || f.phone,
        department_name: u.department  || f.department_name,
        designation_name: u.designation || f.designation_name,
        date_of_joining: u.joining_date
          ? (typeof u.joining_date === 'string' ? u.joining_date.slice(0, 10) : '')
          : f.date_of_joining,
      }))
      setPrefillBanner(`Prefilled from User Account: ${u.full_name}`)
    }).catch(() => {})
  }, [isEdit, searchParams])

  // ── Build payload ─────────────────────────────────────────────────────────
  const buildPayload = () => {
    const payload = {
      full_name:       form.full_name,
      email:           form.email,
      phone:           form.phone,
      gender:          form.gender || undefined,
      date_of_birth:   form.date_of_birth || undefined,
      blood_group:     form.blood_group || undefined,
      pan_number:      form.pan_number || undefined,
      aadhaar_number:  form.aadhaar_number || undefined,
      address_info: {
        street:   form.street,
        city:     form.city,
        state:    form.state,
        zip_code: form.zip_code,
        country:  form.country,
      },
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
      disciplinary_records: isEdit ? disciplinary : undefined,
      background_check: { status: form.bg_status, notes: form.bg_notes || undefined },
    }

    // Phase 3: include account_info only in create mode when all three fields are filled
    if (!isEdit && form.username.trim() && form.password.trim()) {
      payload.account_info = {
        username: form.username.trim().toLowerCase(),
        password: form.password,
        role:     form.role || 'hr',
      }
    }

    return payload
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!fValidate(form)) {
      setError('Please fix the highlighted fields.')
      return
    }
    setSaving(true); setError('')
    try {
      if (isEdit) {
        await hrmService.updateEmployee(id, buildPayload())
        toast.success('Employee updated')
      } else {
        await hrmService.createEmployee(buildPayload())
        const hasAccount = form.username.trim() && form.password.trim()
        toast.success(hasAccount ? 'Employee and login account created' : 'Employee created')
      }
      navigate('/hrm/employees')
    } catch (err) {
      setError(err.response?.data?.detail || err.response?.data?.message || 'Failed to save employee')
    }
    setSaving(false)
  }

  // ── Document upload ───────────────────────────────────────────────────────
  const handleDocUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !id) return
    if (!docName.trim()) { toast.error('Please enter a document name first'); return }
    setUploadingDoc(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('doc_type', docType)
      fd.append('doc_name', docName)
      const res = await hrmService.uploadDocument(id, fd)
      setDocuments(d => [...d, res.data.document])
      setDocName('')
      toast.success('Document uploaded')
    } catch {
      toast.error('Upload failed')
    }
    setUploadingDoc(false)
    e.target.value = ''
  }

  // ── Emergency contacts helpers ────────────────────────────────────────────
  const addContact = () => setEmergencyContacts(c => [...c, { name: '', relationship: '', phone: '', email: '' }])
  const removeContact = (i) => setEmergencyContacts(c => c.filter((_, idx) => idx !== i))
  const setContact = (i, k, v) => setEmergencyContacts(c => c.map((item, idx) => idx === i ? { ...item, [k]: v } : item))

  // ── Qualifications helpers ────────────────────────────────────────────────
  const addQual = () => setQualifications(q => [...q, { type: 'academic', title: '', institution: '', year: '', grade: '' }])
  const removeQual = (i) => setQualifications(q => q.filter((_, idx) => idx !== i))
  const setQual = (i, k, v) => setQualifications(q => q.map((item, idx) => idx === i ? { ...item, [k]: v } : item))

  // ── Disciplinary helpers (edit mode only) ────────────────────────────────
  const addDisc = () => setDisciplinary(d => [...d, { date: '', incident: '', action_taken: '' }])
  const removeDisc = (i) => setDisciplinary(d => d.filter((_, idx) => idx !== i))
  const setDisc = (i, k, v) => setDisciplinary(d => d.map((item, idx) => idx === i ? { ...item, [k]: v } : item))

  // MODE A = create mode OR editing an employee without a linked user
  const modeB = isEdit && !!linkedUserId
  const modeA = !modeB

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{isEdit ? 'Edit Employee' : 'Add Employee'}</h1>
          <p className="text-sm text-gray-500 mt-0.5">Complete HR file</p>
        </div>
      </div>

      {/* Prefill banner */}
      {prefillBanner && (
        <div className="flex items-center gap-2 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg p-3 text-sm">
          <Info className="w-4 h-4 flex-shrink-0" />
          {prefillBanner} — review and complete the remaining fields.
        </div>
      )}

      {error && (
        <div className="bg-red-50 text-red-700 border border-red-200 rounded-lg p-3 text-sm">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">

        {/* ── SECTION 1: ACCOUNT INFORMATION ───────────────────────────────── */}
        <Section icon={KeyRound} title="Account Information" color="violet">
          {/* Shared identity fields — always editable */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
            <Field label="Full Name" required error={fTouched.full_name ? fErrors.full_name : ''}>
              <Input value={form.full_name} onChange={e => set('full_name', e.target.value)} onBlur={() => touch('full_name', form.full_name, form)} />
            </Field>
            <Field label="Email" required error={fTouched.email ? fErrors.email : ''}>
              <Input type="email" value={form.email} onChange={e => set('email', e.target.value)} onBlur={() => touch('email', form.email, form)} />
            </Field>
            <Field label="Mobile" error={fTouched.phone ? fErrors.phone : ''}>
              <Input type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} onBlur={() => touch('phone', form.phone, form)} />
            </Field>
            <Field label="Department">
              <Input value={form.department_name} onChange={e => set('department_name', e.target.value)} placeholder="e.g. Engineering" />
            </Field>
          </div>

          {/* MODE A — create mode or no linked user: show account creation fields */}
          {modeA && (
            <div className="mt-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="flex-1 h-px bg-gray-200" />
                <p className="text-xs font-semibold text-gray-500 uppercase whitespace-nowrap px-2">
                  CRM Login Account <span className="text-gray-400 normal-case font-normal">(optional — leave blank to skip)</span>
                </p>
                <div className="flex-1 h-px bg-gray-200" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Field label="Username">
                  <Input
                    value={form.username}
                    onChange={e => set('username', e.target.value.toLowerCase().replace(/\s/g, '_'))}
                    placeholder="e.g. john_doe"
                    autoComplete="off"
                  />
                </Field>
                <Field label="Password">
                  <Input
                    type="password"
                    value={form.password}
                    onChange={e => set('password', e.target.value)}
                    placeholder="Min 6 characters"
                    autoComplete="new-password"
                  />
                </Field>
                <Field label="Role">
                  <Select value={form.role} onChange={e => set('role', e.target.value)} options={ROLE_OPTIONS} />
                </Field>
              </div>
              {form.username && form.password && (
                <p className="text-xs text-violet-600 mt-2 flex items-center gap-1.5">
                  <CheckCircle className="w-3.5 h-3.5" />
                  A CRM account will be created with role <strong>{ROLE_OPTIONS.find(r => r.value === form.role)?.label}</strong> on save.
                </p>
              )}
              {(form.username && !form.password) || (!form.username && form.password) ? (
                <p className="text-xs text-amber-600 mt-2 flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5" />
                  Fill both Username and Password to create a login account.
                </p>
              ) : null}
            </div>
          )}

          {/* MODE B — editing with a linked user: show readonly account card */}
          {modeB && (
            <div className="mt-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="flex-1 h-px bg-gray-200" />
                <p className="text-xs font-semibold text-gray-500 uppercase whitespace-nowrap px-2">Linked CRM Account</p>
                <div className="flex-1 h-px bg-gray-200" />
              </div>
              {linkedUserInfo ? (
                <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-green-50 border border-green-200 rounded-xl">
                  <div className="flex items-center gap-2 text-green-700">
                    <CheckCircle className="w-4 h-4 flex-shrink-0" />
                    <span className="text-sm font-medium">Account linked</span>
                  </div>
                  <div className="flex flex-wrap gap-4 text-sm text-gray-700">
                    <span><span className="text-gray-500">Username:</span> <strong>{linkedUserInfo.username}</strong></span>
                    <span><span className="text-gray-500">Role:</span> <strong>{ROLE_OPTIONS.find(r => r.value === linkedUserInfo.role)?.label || linkedUserInfo.role}</strong></span>
                    {linkedUserInfo.mobile && (
                      <span><span className="text-gray-500">Mobile:</span> {linkedUserInfo.mobile}</span>
                    )}
                  </div>
                  <Link
                    to={`/users/${linkedUserId}`}
                    className="text-xs text-indigo-600 hover:underline font-medium whitespace-nowrap"
                  >
                    View / Edit User →
                  </Link>
                </div>
              ) : (
                <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-500 flex items-center gap-2">
                  <Link2 className="w-4 h-4" />
                  Loading linked account…
                </div>
              )}
            </div>
          )}

          {/* Edit mode, no linked user — offer navigation to create account */}
          {isEdit && !linkedUserId && (
            <div className="mt-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="flex-1 h-px bg-gray-200" />
                <p className="text-xs font-semibold text-gray-500 uppercase whitespace-nowrap px-2">CRM Account</p>
                <div className="flex-1 h-px bg-gray-200" />
              </div>
              <div className="flex items-center justify-between p-4 bg-amber-50 border border-amber-200 rounded-xl">
                <div className="flex items-center gap-2 text-amber-700 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  No CRM login account linked to this employee.
                </div>
                <Link
                  to={`/users/new?employee_id=${id}`}
                  className="text-xs text-indigo-600 hover:underline font-medium whitespace-nowrap"
                >
                  Create Account →
                </Link>
              </div>
            </div>
          )}
        </Section>

        {/* ── PERSONAL INFORMATION (trimmed — Full Name / Email / Phone moved above) ── */}
        <Section icon={User} title="Personal Information" color="indigo">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
            <Field label="Date of Birth">
              <Input type="date" value={form.date_of_birth} onChange={e => set('date_of_birth', e.target.value)} />
            </Field>
            <Field label="Gender">
              <Select value={form.gender} onChange={e => set('gender', e.target.value)} options={[
                { value: '', label: '— Select —' },
                { value: 'male', label: 'Male' },
                { value: 'female', label: 'Female' },
                { value: 'other', label: 'Other' },
                { value: 'prefer_not_to_say', label: 'Prefer not to say' },
              ]} />
            </Field>
            <Field label="Blood Group">
              <Select value={form.blood_group} onChange={e => set('blood_group', e.target.value)} options={[
                { value: '', label: '— Select —' },
                ...['A+','A-','B+','B-','AB+','AB-','O+','O-'].map(g => ({ value: g, label: g })),
              ]} />
            </Field>
            <Field label="PAN Number">
              <Input value={form.pan_number} onChange={e => set('pan_number', e.target.value.toUpperCase())} placeholder="ABCDE1234F" maxLength={10} />
            </Field>
            <Field label="Aadhaar Number" className="md:col-span-2">
              <Input value={form.aadhaar_number} onChange={e => set('aadhaar_number', e.target.value)} placeholder="XXXX XXXX XXXX" maxLength={14} />
            </Field>
          </div>
          {/* Address */}
          <p className="text-xs font-semibold text-gray-500 uppercase mt-5 mb-3">Residential Address</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Street" className="md:col-span-2">
              <Input value={form.street} onChange={e => set('street', e.target.value)} />
            </Field>
            <Field label="City"><Input value={form.city} onChange={e => set('city', e.target.value)} /></Field>
            <Field label="State"><Input value={form.state} onChange={e => set('state', e.target.value)} /></Field>
            <Field label="ZIP / PIN"><Input value={form.zip_code} onChange={e => set('zip_code', e.target.value)} /></Field>
            <Field label="Country"><Input value={form.country} onChange={e => set('country', e.target.value)} /></Field>
          </div>
        </Section>

        {/* ── EMPLOYMENT (Department moved to Account Info) ─────────────────── */}
        <Section icon={Briefcase} title="Employment Details" color="blue">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
            <Field label="Designation"><Input value={form.designation_name} onChange={e => set('designation_name', e.target.value)} /></Field>
            <Field label="Employment Type">
              <Select value={form.employment_type} onChange={e => set('employment_type', e.target.value)} options={[
                { value: 'full_time', label: 'Full Time' },
                { value: 'part_time', label: 'Part Time' },
                { value: 'contract', label: 'Contract' },
                { value: 'intern', label: 'Intern' },
                { value: 'consultant', label: 'Consultant' },
              ]} />
            </Field>
            <Field label="Date of Joining">
              <Input type="date" value={form.date_of_joining} onChange={e => set('date_of_joining', e.target.value)} />
            </Field>
            <Field label="Work Location"><Input value={form.work_location} onChange={e => set('work_location', e.target.value)} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Shift Start"><Input type="time" value={form.shift_start_time} onChange={e => set('shift_start_time', e.target.value)} /></Field>
              <Field label="Shift End"><Input type="time" value={form.shift_end_time} onChange={e => set('shift_end_time', e.target.value)} /></Field>
            </div>
          </div>
          <div className="mt-4">
            <Field label="Role Description / Notes">
              <Textarea value={form.work_description} onChange={e => set('work_description', e.target.value)} placeholder="Responsibilities, notes…" />
            </Field>
          </div>
          {/* Salary */}
          <p className="text-xs font-semibold text-gray-500 uppercase mt-5 mb-3">Salary Structure</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[['ctc','Annual CTC (₹)'],['basic','Basic (Monthly)'],['hra','HRA (Monthly)'],['special_allowance','Special Allowance']].map(([k,l]) => (
              <Field key={k} label={l}>
                <Input type="number" min="0" value={form[k]} onChange={e => set(k, e.target.value)} />
              </Field>
            ))}
          </div>
        </Section>

        {/* ── BANK DETAILS ─────────────────────────────────────────────────── */}
        <Section icon={CreditCard} title="Bank Details" color="green">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
            <Field label="Bank Name"><Input value={form.bank_name} onChange={e => set('bank_name', e.target.value)} /></Field>
            <Field label="Account Number"><Input value={form.account_number} onChange={e => set('account_number', e.target.value)} /></Field>
            <Field label="IFSC Code"><Input value={form.ifsc_code} onChange={e => set('ifsc_code', e.target.value.toUpperCase())} /></Field>
            <Field label="Account Holder Name"><Input value={form.account_holder_name} onChange={e => set('account_holder_name', e.target.value)} /></Field>
            <Field label="PF Number"><Input value={form.pf_number} onChange={e => set('pf_number', e.target.value)} /></Field>
            <Field label="UAN Number"><Input value={form.uan_number} onChange={e => set('uan_number', e.target.value)} /></Field>
          </div>
        </Section>

        {/* ── EMERGENCY CONTACTS ───────────────────────────────────────────── */}
        <Section icon={Phone} title="Emergency Contacts" color="orange">
          <div className="space-y-4 mt-2">
            {emergencyContacts.map((c, i) => (
              <div key={i} className="grid grid-cols-1 md:grid-cols-4 gap-3 p-4 bg-gray-50 rounded-lg relative">
                <Input placeholder="Name" value={c.name} onChange={e => setContact(i,'name',e.target.value)} />
                <Input placeholder="Relationship" value={c.relationship} onChange={e => setContact(i,'relationship',e.target.value)} />
                <Input placeholder="Phone" value={c.phone} onChange={e => setContact(i,'phone',e.target.value)} />
                <div className="flex gap-2">
                  <Input placeholder="Email (optional)" value={c.email || ''} onChange={e => setContact(i,'email',e.target.value)} />
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

        {/* ── QUALIFICATIONS ───────────────────────────────────────────────── */}
        <Section icon={GraduationCap} title="Qualifications" color="purple" defaultOpen={false}>
          <div className="space-y-3 mt-2">
            {qualifications.map((q, i) => (
              <div key={i} className="grid grid-cols-2 md:grid-cols-5 gap-3 p-4 bg-gray-50 rounded-lg">
                <Select value={q.type} onChange={e => setQual(i,'type',e.target.value)} options={[
                  { value: 'academic', label: 'Academic' },
                  { value: 'professional', label: 'Professional' },
                ]} />
                <Input placeholder="Degree / Certificate" value={q.title} onChange={e => setQual(i,'title',e.target.value)} />
                <Input placeholder="Institution" value={q.institution || ''} onChange={e => setQual(i,'institution',e.target.value)} />
                <Input placeholder="Year" type="number" min="1950" max="2099" value={q.year || ''} onChange={e => setQual(i,'year',e.target.value)} />
                <div className="flex gap-2">
                  <Input placeholder="Grade / Score" value={q.grade || ''} onChange={e => setQual(i,'grade',e.target.value)} />
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

        {/* ── BACKGROUND VERIFICATION ──────────────────────────────────────── */}
        <Section icon={ShieldCheck} title="Background Verification" color="teal" defaultOpen={false}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
            <Field label="Verification Status">
              <Select value={form.bg_status} onChange={e => set('bg_status', e.target.value)} options={[
                { value: 'pending', label: 'Pending' },
                { value: 'verified', label: 'Verified' },
                { value: 'rejected', label: 'Rejected' },
              ]} />
            </Field>
            <Field label="Notes">
              <Textarea value={form.bg_notes} onChange={e => set('bg_notes', e.target.value)} placeholder="Verification notes…" rows={2} />
            </Field>
          </div>
        </Section>

        {/* ── DISCIPLINARY RECORDS (edit only) ─────────────────────────────── */}
        {isEdit && (
          <Section icon={FileText} title="Disciplinary Records" color="red" defaultOpen={false}>
            <div className="space-y-3 mt-2">
              {disciplinary.map((d, i) => (
                <div key={i} className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4 bg-red-50 rounded-lg">
                  <Input type="date" value={d.date} onChange={e => setDisc(i,'date',e.target.value)} />
                  <Input placeholder="Incident description" value={d.incident} onChange={e => setDisc(i,'incident',e.target.value)} />
                  <div className="flex gap-2">
                    <Input placeholder="Action taken" value={d.action_taken} onChange={e => setDisc(i,'action_taken',e.target.value)} />
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
        )}

        {/* ── DOCUMENTS (upload; only visible in edit mode) ─────────────────── */}
        {isEdit && (
          <Section icon={FileText} title="Documents" color="blue" defaultOpen={false}>
            <div className="mt-2 space-y-4">
              {/* Upload row */}
              <div className="flex flex-wrap gap-3 items-end p-4 bg-gray-50 rounded-lg">
                <Field label="Document Type" className="w-44">
                  <Select value={docType} onChange={e => setDocType(e.target.value)} options={[
                    { value: 'offer_letter', label: 'Offer Letter' },
                    { value: 'appointment_letter', label: 'Appointment Letter' },
                    { value: 'contract', label: 'Employment Contract' },
                    { value: 'id_proof', label: 'ID Proof' },
                    { value: 'certificate', label: 'Certificate' },
                    { value: 'policy', label: 'Signed Policy' },
                    { value: 'other', label: 'Other' },
                  ]} />
                </Field>
                <Field label="Document Name" className="flex-1 min-w-48">
                  <Input placeholder="e.g. Offer Letter – Oct 2024" value={docName} onChange={e => setDocName(e.target.value)} />
                </Field>
                <div className="mb-0.5">
                  <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.docx" className="hidden" onChange={handleDocUpload} />
                  <button type="button" disabled={uploadingDoc}
                    onClick={() => fileRef.current?.click()}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition-colors">
                    <Upload className="w-4 h-4" />
                    {uploadingDoc ? 'Uploading…' : 'Upload'}
                  </button>
                </div>
              </div>
              {/* Document list */}
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
              ) : (
                <p className="text-sm text-gray-400 text-center py-4">No documents uploaded yet</p>
              )}
            </div>
          </Section>
        )}

        {/* ── Actions ──────────────────────────────────────────────────────── */}
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={() => navigate(-1)}
            className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button type="submit" disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60 transition-colors">
            <Save className="w-4 h-4" />
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Employee'}
          </button>
        </div>
      </form>
    </div>
  )
}
