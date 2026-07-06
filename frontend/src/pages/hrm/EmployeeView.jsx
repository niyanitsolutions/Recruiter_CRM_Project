import React, { useState, useEffect } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import {
  ArrowLeft, Edit2, Loader2, CheckCircle, AlertCircle, ExternalLink,
  Mail, Phone, MapPin, Calendar, Briefcase, CreditCard,
  GraduationCap, ShieldCheck, FileText, KeyRound, User,
} from 'lucide-react'
import hrmService from '../../services/hrmService'
import userService from '../../services/userService'
import EmployeeAvatar from '../../components/common/EmployeeAvatar'

// ── Constants ────────────────────────────────────────────────────────────────

const STATUS_STYLE = {
  active:     { bg: '#dcfce7', color: '#15803d', label: 'Active' },
  inactive:   { bg: '#f1f5f9', color: '#64748b', label: 'Inactive' },
  terminated: { bg: '#fee2e2', color: '#dc2626', label: 'Terminated' },
  on_leave:   { bg: '#fef9c3', color: '#ca8a04', label: 'On Leave' },
  resigned:   { bg: '#f1f5f9', color: '#64748b', label: 'Resigned' },
}

const TABS = ['Overview', 'Personal', 'Employment', 'Bank', 'Emergency', 'Documents']

// ── Profile completion ───────────────────────────────────────────────────────

function calcProfilePct(emp) {
  if (!emp) return 0
  const addr = emp.address_info || {}
  const bank = emp.bank_details || {}
  const sections = [
    Boolean(emp.phone && emp.date_of_birth && emp.gender && emp.blood_group &&
      emp.pan_number && emp.aadhaar_number && addr.street && addr.city && addr.state && addr.zip_code),
    Boolean((emp.department_id || emp.department_name) &&
      (emp.designation_id || emp.designation_name) && emp.date_of_joining),
    Boolean(bank.bank_name && bank.account_number && bank.ifsc_code && bank.account_holder_name),
    (emp.emergency_contacts || []).some(c => c?.name && c?.relationship && c?.phone) ||
      Boolean(emp.emergency_contact?.name),
    (emp.qualifications || []).length >= 1,
    Boolean(emp.background_check?.status),
    (emp.documents || []).length >= 1,
  ]
  return Math.round((sections.filter(Boolean).length / sections.length) * 100)
}

// ── UI helpers ───────────────────────────────────────────────────────────────

function InfoRow({ label, value, mono = false }) {
  return (
    <div className="py-2.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      <p className="text-xs font-semibold uppercase mb-0.5" style={{ color: 'var(--text-muted)' }}>{label}</p>
      <p className={`text-sm ${mono ? 'font-mono' : ''}`} style={{ color: value ? 'var(--text-primary)' : 'var(--text-muted)' }}>
        {value || '—'}
      </p>
    </div>
  )
}

function prettifyComponentKey(key) {
  return key.replace(/^custom_(earn|ded)_\d+$/, '$1')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

function Card({ title, icon: Icon, accent = '#6366f1', children }) {
  return (
    <div className="rounded-xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
      {title && (
        <div className="flex items-center gap-2 mb-4">
          {Icon && (
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: accent + '1a' }}>
              <Icon className="w-3.5 h-3.5" style={{ color: accent }} />
            </div>
          )}
          <h4 className="font-semibold text-sm" style={{ color: 'var(--text-heading)' }}>{title}</h4>
        </div>
      )}
      {children}
    </div>
  )
}

function CircularProgress({ pct, size = 80 }) {
  const r   = (size - 8) / 2
  const circ = 2 * Math.PI * r
  const dash = (pct / 100) * circ
  const color = pct >= 80 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444'
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border-subtle)" strokeWidth={7} />
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke={color} strokeWidth={7}
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.6s ease' }}
      />
      <text
        x={size / 2} y={size / 2}
        fill={color} fontSize={size * 0.22} fontWeight={700}
        textAnchor="middle" dominantBaseline="middle"
        transform={`rotate(90, ${size / 2}, ${size / 2})`}
      >
        {pct}%
      </text>
    </svg>
  )
}

// ── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({ emp, linkedUser }) {
  const addr = emp.address_info
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {/* Left column */}
      <div className="space-y-4">
        <Card title="Personal Information" icon={User} accent="#6366f1">
          <InfoRow label="Full Name"  value={emp.full_name} />
          <InfoRow label="Email"      value={emp.email} />
          <InfoRow label="Phone"      value={emp.phone} />
          <InfoRow label="Gender"     value={emp.gender} />
          <InfoRow label="Date of Birth" value={emp.date_of_birth} />
          <InfoRow label="Blood Group"   value={emp.blood_group} />
        </Card>

        {addr && (
          <Card title="Address" icon={MapPin} accent="#0ea5e9">
            <InfoRow label="Street"  value={addr.street} />
            <InfoRow label="City"    value={addr.city} />
            <InfoRow label="State"   value={addr.state} />
            <InfoRow label="ZIP"     value={addr.zip_code} />
            <InfoRow label="Country" value={addr.country} />
          </Card>
        )}
      </div>

      {/* Right column */}
      <div className="space-y-4">
        <Card title="Employment Summary" icon={Briefcase} accent="#10b981">
          <InfoRow label="Department"       value={emp.department_name} />
          <InfoRow label="Designation"      value={emp.designation_name} />
          <InfoRow label="Employment Type"  value={emp.employment_type?.replace(/_/g, ' ')} />
          <InfoRow label="Date of Joining"  value={emp.date_of_joining} />
          <InfoRow label="Work Location"    value={emp.work_location} />
          <InfoRow label="Shift"
            value={emp.shift_start_time && emp.shift_end_time
              ? `${emp.shift_start_time} – ${emp.shift_end_time}` : null} />
        </Card>

        {linkedUser ? (
          <Card title="User Account" icon={KeyRound} accent="#8b5cf6">
            <div className="flex items-center gap-2 mb-3 p-2.5 rounded-lg" style={{ background: '#dcfce7' }}>
              <CheckCircle className="w-4 h-4 text-green-600" />
              <span className="text-xs font-medium text-green-700">CRM Login Account linked</span>
              <Link to={`/users/${emp.crm_user_id}`}
                className="ml-auto flex items-center gap-1 text-xs text-indigo-600 hover:underline">
                <ExternalLink className="w-3 h-3" /> View
              </Link>
            </div>
            <InfoRow label="Username" value={linkedUser.username} mono />
            <InfoRow label="Role"     value={linkedUser.role} />
            <InfoRow label="Status"   value={linkedUser.status} />
          </Card>
        ) : (
          <Card title="User Account" icon={KeyRound} accent="#8b5cf6">
            <div className="flex items-center justify-between p-3 rounded-lg" style={{ background: '#fef9c3' }}>
              <div className="flex items-center gap-2 text-sm text-amber-700">
                <AlertCircle className="w-4 h-4" /> No login account linked
              </div>
              <Link to={`/users/new?employee_id=${emp.id}`}
                className="text-xs text-indigo-600 hover:underline font-medium">
                Create →
              </Link>
            </div>
          </Card>
        )}

        {emp.work_description && (
          <Card title="Role Description" icon={FileText} accent="#f59e0b">
            <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>
              {emp.work_description}
            </p>
          </Card>
        )}
      </div>
    </div>
  )
}

// ── Personal Tab ─────────────────────────────────────────────────────────────

function PersonalTab({ emp }) {
  const addr = emp.address_info
  return (
    <div className="space-y-5">
      <Card title="Personal Details" icon={User} accent="#6366f1">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-6">
          <InfoRow label="Full Name"     value={emp.full_name} />
          <InfoRow label="Email"         value={emp.email} />
          <InfoRow label="Phone"         value={emp.phone} />
          <InfoRow label="Gender"        value={emp.gender} />
          <InfoRow label="Date of Birth" value={emp.date_of_birth} />
          <InfoRow label="Blood Group"   value={emp.blood_group} />
          <InfoRow label="PAN Number"    value={emp.pan_number}    mono />
          <InfoRow label="Aadhaar"       value={emp.aadhaar_number} mono />
        </div>
      </Card>

      {addr && (
        <Card title="Residential Address" icon={MapPin} accent="#0ea5e9">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-6">
            <InfoRow label="Street"  value={addr.street}   />
            <InfoRow label="City"    value={addr.city}     />
            <InfoRow label="State"   value={addr.state}    />
            <InfoRow label="ZIP"     value={addr.zip_code} />
            <InfoRow label="Country" value={addr.country}  />
          </div>
        </Card>
      )}

      {emp.qualifications?.length > 0 && (
        <Card title="Qualifications" icon={GraduationCap} accent="#8b5cf6">
          <div className="space-y-3">
            {emp.qualifications.map((q, i) => (
              <div key={i} className="p-3 rounded-lg" style={{ background: 'var(--bg-card-alt)' }}>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <InfoRow label="Type"        value={q.type} />
                  <InfoRow label="Degree"      value={q.title} />
                  <InfoRow label="Institution" value={q.institution} />
                  <InfoRow label="Year"        value={q.year?.toString()} />
                  <InfoRow label="Grade"       value={q.grade} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

// ── Employment Tab ────────────────────────────────────────────────────────────

function EmploymentTab({ emp, payrollStructure }) {
  const salary = emp.salary
  const salaryComps = emp.salary_components || {}
  const structureComponents = payrollStructure?.components || []

  // Resolve each saved component to its configured label/type; fall back to a
  // prettified key so a value is never silently dropped if the structure
  // definition doesn't have it (e.g. custom or since-removed component).
  const compEntries = Object.entries(salaryComps)
    .filter(([, v]) => Number(v) > 0)
    .map(([key, value]) => {
      const def = structureComponents.find(c => c.key === key)
      return {
        key,
        label: def?.label || prettifyComponentKey(key),
        type: def?.component_type || (key.includes('ded') ? 'deduction' : 'earning'),
        value: Number(value) || 0,
      }
    })
  const earningRows   = compEntries.filter(c => c.type === 'earning')
  const deductionRows = compEntries.filter(c => c.type === 'deduction')
  const grossSalary   = earningRows.reduce((s, c) => s + c.value, 0)
  const totalDeductions = deductionRows.reduce((s, c) => s + c.value, 0)
  const netSalary = grossSalary - totalDeductions

  return (
    <div className="space-y-5">
      <Card title="Employment Details" icon={Briefcase} accent="#10b981">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-6">
          <InfoRow label="Department"      value={emp.department_name} />
          <InfoRow label="Designation"     value={emp.designation_name} />
          <InfoRow label="Employment Type" value={emp.employment_type?.replace(/_/g, ' ')} />
          <InfoRow label="Date of Joining" value={emp.date_of_joining} />
          <InfoRow label="Work Location"   value={emp.work_location} />
          <InfoRow label="Shift"
            value={emp.shift_start_time && emp.shift_end_time
              ? `${emp.shift_start_time} – ${emp.shift_end_time}` : null} />
        </div>
        {emp.work_description && (
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase mb-1" style={{ color: 'var(--text-muted)' }}>Role Description</p>
            <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>{emp.work_description}</p>
          </div>
        )}
      </Card>

      {salary && (salary.ctc > 0 || compEntries.length > 0) && (
        <Card title="Salary Structure" icon={CreditCard} accent="#f59e0b">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6">
            <InfoRow label="Annual CTC (₹)" value={salary.ctc ? salary.ctc.toLocaleString('en-IN') : null} />
            {earningRows.map(c => (
              <InfoRow key={c.key} label={`${c.label} (Monthly)`} value={c.value.toLocaleString('en-IN')} />
            ))}
            {deductionRows.map(c => (
              <InfoRow key={c.key} label={`${c.label} (Monthly)`} value={c.value.toLocaleString('en-IN')} />
            ))}
            {compEntries.length > 0 && (
              <>
                <InfoRow label="Gross Salary (Monthly)" value={grossSalary.toLocaleString('en-IN')} />
                <InfoRow label="Net Salary (Monthly)"    value={netSalary.toLocaleString('en-IN')} />
              </>
            )}
          </div>
        </Card>
      )}

      <Card title="Background Verification" icon={ShieldCheck} accent="#14b8a6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
          <InfoRow label="Status" value={emp.background_check?.status || 'pending'} />
          <InfoRow label="Notes"  value={emp.background_check?.notes} />
        </div>
      </Card>

      {emp.disciplinary_records?.length > 0 && (
        <Card title="Disciplinary Records" icon={FileText} accent="#ef4444">
          <div className="space-y-3">
            {emp.disciplinary_records.map((d, i) => (
              <div key={i} className="p-3 rounded-lg" style={{ background: '#fee2e21a' }}>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <InfoRow label="Date"         value={d.date?.toString()} />
                  <InfoRow label="Incident"     value={d.incident} />
                  <InfoRow label="Action Taken" value={d.action_taken} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

// ── Bank Tab ──────────────────────────────────────────────────────────────────

function BankTab({ emp }) {
  const bank = emp.bank_details
  return (
    <div className="space-y-5">
      <Card title="Bank Details" icon={CreditCard} accent="#10b981">
        {bank ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-6">
            <InfoRow label="Bank Name"           value={bank.bank_name} />
            <InfoRow label="Account Number"      value={bank.account_number} mono />
            <InfoRow label="IFSC Code"           value={bank.ifsc_code} mono />
            <InfoRow label="Account Holder Name" value={bank.account_holder_name} />
            <InfoRow label="PF Number"           value={emp.pf_number} mono />
            <InfoRow label="UAN Number"          value={emp.uan_number} mono />
          </div>
        ) : (
          <p className="text-sm text-center py-4" style={{ color: 'var(--text-muted)' }}>
            No bank details on record.
          </p>
        )}
      </Card>
    </div>
  )
}

// ── Emergency Tab ──────────────────────────────────────────────────────────────

function EmergencyTab({ emp }) {
  const contacts = emp.emergency_contacts?.length
    ? emp.emergency_contacts
    : emp.emergency_contact ? [emp.emergency_contact] : []
  return (
    <div className="space-y-4">
      {contacts.length > 0 ? contacts.map((c, i) => (
        <Card key={i} title={`Contact ${contacts.length > 1 ? i + 1 : ''}`} icon={Phone} accent="#f97316">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6">
            <InfoRow label="Name"         value={c.name} />
            <InfoRow label="Relationship" value={c.relationship} />
            <InfoRow label="Phone"        value={c.phone} />
            <InfoRow label="Email"        value={c.email} />
          </div>
        </Card>
      )) : (
        <div className="text-center py-10" style={{ color: 'var(--text-muted)' }}>
          <Phone className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p>No emergency contacts on record.</p>
        </div>
      )}
    </div>
  )
}

// ── Documents Tab ──────────────────────────────────────────────────────────────

function DocumentsTab({ emp }) {
  const docs = emp.documents || []
  return (
    <div className="space-y-3">
      {docs.length > 0 ? docs.map((doc, i) => (
        <div key={i}
          className="flex items-center justify-between p-4 rounded-xl"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center text-lg"
              style={{ background: 'var(--bg-card-alt)' }}>
              📄
            </div>
            <div>
              <p className="font-medium text-sm" style={{ color: 'var(--text-heading)' }}>{doc.doc_name}</p>
              <p className="text-xs capitalize" style={{ color: 'var(--text-muted)' }}>{doc.doc_type?.replace(/_/g, ' ')}</p>
            </div>
          </div>
          <a href={doc.file_url} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg"
            style={{ background: 'var(--bg-info)', color: 'var(--text-info)' }}>
            <ExternalLink className="w-3 h-3" /> View
          </a>
        </div>
      )) : (
        <div className="text-center py-10" style={{ color: 'var(--text-muted)' }}>
          <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p>No documents uploaded.</p>
        </div>
      )}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function EmployeeView() {
  const navigate       = useNavigate()
  const { id }         = useParams()
  const [loading, setLoading]       = useState(true)
  const [emp, setEmp]               = useState(null)
  const [linkedUser, setLinkedUser] = useState(null)
  const [tab, setTab]               = useState('Overview')
  const [payrollStructure, setPayrollStructure] = useState(null)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    hrmService.getEmployee(id)
      .then(r => {
        const e = r.data
        setEmp(e)
        if (e.crm_user_id) {
          userService.getUser(e.crm_user_id)
            .then(u => setLinkedUser(u.data || u))
            .catch(() => {})
        }
      })
      .catch(() => setEmp(null))
      .finally(() => setLoading(false))
    hrmService.getPayrollStructure()
      .then(r => setPayrollStructure(r.data))
      .catch(() => {})
  }, [id])

  if (loading) {
    return (
      <div className="p-10 flex items-center justify-center" style={{ color: 'var(--text-muted)' }}>
        <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading…
      </div>
    )
  }

  if (!emp) {
    return (
      <div className="p-10 text-center" style={{ color: 'var(--text-muted)' }}>
        Employee not found.{' '}
        <button onClick={() => navigate('/hrm/employees')} className="text-indigo-600 underline">Go back</button>
      </div>
    )
  }

  const pct    = calcProfilePct(emp)
  const ss     = STATUS_STYLE[emp.employment_status] || STATUS_STYLE.inactive

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">

      {/* ── Back ── */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-sm hover:underline"
        style={{ color: 'var(--text-muted)' }}
      >
        <ArrowLeft className="w-4 h-4" /> Back to Employees
      </button>

      {/* ── Hero card ── */}
      <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
        {/* Coloured banner */}
        <div className="h-24" style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }} />

        <div className="px-6 pb-6">
          {/* Photo row */}
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 -mt-10">
            <div className="flex items-end gap-4">
              <div
                className="rounded-2xl ring-4"
                style={{ ringColor: 'var(--bg-card)', background: 'var(--bg-card)' }}
              >
                <EmployeeAvatar
                  name={emp.full_name}
                  photoUrl={emp.photo_url}
                  size={80}
                  style={{ borderRadius: 16, border: '4px solid var(--bg-card)' }}
                />
              </div>
              <div className="pb-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-2xl font-bold" style={{ color: 'var(--text-heading)' }}>
                    {emp.full_name}
                  </h1>
                  <span
                    className="px-2.5 py-0.5 rounded-full text-xs font-semibold"
                    style={{ background: ss.bg, color: ss.color }}
                  >
                    {ss.label}
                  </span>
                </div>
                <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {[emp.designation_name, emp.department_name].filter(Boolean).join(' · ')}
                </p>
              </div>
            </div>

            <Link
              to={`/hrm/employees/${id}/edit`}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white self-end sm:self-auto"
              style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
            >
              <Edit2 className="w-4 h-4" /> Edit Profile
            </Link>
          </div>

          {/* Metadata chips */}
          <div className="flex flex-wrap gap-4 mt-4">
            <span className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--text-muted)' }}>
              <Briefcase className="w-4 h-4" />
              {emp.employee_id}
            </span>
            {emp.date_of_joining && (
              <span className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--text-muted)' }}>
                <Calendar className="w-4 h-4" />
                Joined {emp.date_of_joining}
              </span>
            )}
            {emp.work_location && (
              <span className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--text-muted)' }}>
                <MapPin className="w-4 h-4" />
                {emp.work_location}
              </span>
            )}
            {emp.email && (
              <a href={`mailto:${emp.email}`} className="flex items-center gap-1.5 text-sm hover:underline" style={{ color: 'var(--text-muted)' }}>
                <Mail className="w-4 h-4" />
                {emp.email}
              </a>
            )}
            {emp.phone && (
              <a href={`tel:${emp.phone}`} className="flex items-center gap-1.5 text-sm hover:underline" style={{ color: 'var(--text-muted)' }}>
                <Phone className="w-4 h-4" />
                {emp.phone}
              </a>
            )}
          </div>

          {/* Profile completion */}
          <div className="mt-4 flex items-center gap-4 p-4 rounded-xl" style={{ background: 'var(--bg-card-alt)' }}>
            <CircularProgress pct={pct} size={64} />
            <div>
              <p className="font-semibold text-sm" style={{ color: 'var(--text-heading)' }}>Profile Completion</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                {pct === 100
                  ? 'All sections complete'
                  : `${7 - Math.round((pct / 100) * 7)} of 7 sections remaining`}
              </p>
              {pct < 100 && (
                <Link
                  to={`/hrm/employees/${id}/edit`}
                  className="text-xs font-medium hover:underline mt-1 inline-block"
                  style={{ color: '#6366f1' }}
                >
                  Complete Profile →
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div
        className="flex gap-1 p-1 rounded-xl overflow-x-auto"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}
      >
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all"
            style={
              tab === t
                ? { background: '#6366f1', color: '#fff' }
                : { color: 'var(--text-muted)', background: 'transparent' }
            }
          >
            {t}
          </button>
        ))}
      </div>

      {/* ── Tab content ── */}
      {tab === 'Overview'    && <OverviewTab emp={emp} linkedUser={linkedUser} />}
      {tab === 'Personal'    && <PersonalTab emp={emp} />}
      {tab === 'Employment'  && <EmploymentTab emp={emp} payrollStructure={payrollStructure} />}
      {tab === 'Bank'        && <BankTab emp={emp} />}
      {tab === 'Emergency'   && <EmergencyTab emp={emp} />}
      {tab === 'Documents'   && <DocumentsTab emp={emp} />}

      {/* ── Bottom actions ── */}
      <div className="flex justify-end gap-3 pt-2">
        <button
          onClick={() => navigate(-1)}
          className="px-5 py-2.5 rounded-xl text-sm font-medium"
          style={{ border: '1px solid var(--border-card)', color: 'var(--text-secondary)' }}
        >
          Back
        </button>
        <Link
          to={`/hrm/employees/${id}/edit`}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white"
          style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
        >
          <Edit2 className="w-4 h-4" /> Edit Employee
        </Link>
      </div>

    </div>
  )
}
