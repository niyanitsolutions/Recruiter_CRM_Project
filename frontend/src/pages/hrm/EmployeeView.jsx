import React, { useState, useEffect } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import {
  ArrowLeft, Edit2, ChevronDown, ChevronUp, Loader2,
  User, Briefcase, CreditCard, Phone, GraduationCap,
  ShieldCheck, FileText, KeyRound, CheckCircle, AlertCircle,
  ExternalLink,
} from 'lucide-react'
import hrmService from '../../services/hrmService'
import userService from '../../services/userService'

// ── UI building blocks ────────────────────────────────────────────────
const Section = ({ icon: Icon, title, color = 'indigo', children, defaultOpen = true }) => {
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
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>
      {open && <div className="px-6 pb-6 pt-2 border-t border-gray-100">{children}</div>}
    </div>
  )
}

const ViewField = ({ label, value, mono = false, className = '' }) => (
  <div className={className}>
    <p className="text-xs font-semibold text-gray-400 uppercase mb-1">{label}</p>
    <p className={`text-sm text-gray-900 ${mono ? 'font-mono' : ''} ${!value ? 'text-gray-400 italic' : ''}`}>
      {value || '—'}
    </p>
  </div>
)

const ROLE_TO_DEPT = {
  admin:'admin', client_coordinator:'client_coordinator',
  candidate_coordinator:'candidate_coordinator', recruiter:'recruiter',
  hr:'hr', accounts:'accounts', partner:'partner',
}

const PERM_DEPT_LABELS = {
  owner:'Owner', admin:'Admin', client_coordinator:'Client Coordinator',
  candidate_coordinator:'Candidate Coordinator', recruiter:'Recruiter',
  hr:'HR', accounts:'Accounts', partner:'Partner',
}

const STATUS_CHIP = {
  active:     'bg-green-100 text-green-700',
  inactive:   'bg-gray-100 text-gray-600',
  terminated: 'bg-red-100 text-red-700',
  on_leave:   'bg-yellow-100 text-yellow-700',
  resigned:   'bg-orange-100 text-orange-700',
}

export default function EmployeeView() {
  const navigate = useNavigate()
  const { id }   = useParams()

  const [loading, setLoading]         = useState(true)
  const [emp, setEmp]                 = useState(null)
  const [linkedUser, setLinkedUser]   = useState(null)

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
  }, [id])

  if (loading) {
    return (
      <div className="p-10 flex items-center justify-center text-gray-400">
        <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading…
      </div>
    )
  }

  if (!emp) {
    return (
      <div className="p-10 text-center text-gray-500">
        Employee not found.{' '}
        <button onClick={() => navigate('/hrm/employees')} className="text-indigo-600 underline">Go back</button>
      </div>
    )
  }

  const statusStyle = STATUS_CHIP[emp.employment_status] || 'bg-gray-100 text-gray-600'

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => navigate(-1)}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">{emp.full_name}</h1>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusStyle}`}>
                {emp.employment_status}
              </span>
            </div>
            <p className="text-sm text-gray-500 mt-0.5">
              {emp.employee_id} {emp.designation_name ? `· ${emp.designation_name}` : ''} {emp.department_name ? `· ${emp.department_name}` : ''}
            </p>
          </div>
        </div>
        <Link to={`/hrm/employees/${id}/edit`}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700">
          <Edit2 className="w-4 h-4" /> Edit
        </Link>
      </div>

      {/* ── SECTION 1 — USER ACCOUNT INFORMATION ── */}
      <Section icon={KeyRound} title="User Account Information" color="violet">
        {linkedUser ? (
          <div className="mt-2 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-green-50 border border-green-200 rounded-xl">
              <div className="flex items-center gap-2 text-green-700">
                <CheckCircle className="w-4 h-4" />
                <span className="text-sm font-medium">CRM Login Account linked</span>
              </div>
              <Link to={`/users/${emp.crm_user_id}`}
                className="flex items-center gap-1 text-xs text-indigo-600 hover:underline font-medium">
                <ExternalLink className="w-3 h-3" /> View User Account
              </Link>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-2">
              <ViewField label="Username" value={linkedUser.username} mono />
              <ViewField label="Email" value={linkedUser.email} />
              <ViewField label="Mobile" value={linkedUser.mobile} />
              <ViewField label="Role" value={PERM_DEPT_LABELS[ROLE_TO_DEPT[linkedUser.role]] || linkedUser.role} />
              <ViewField label="User Type" value={linkedUser.user_type === 'partner' ? 'Partner' : 'Internal Employee'} />
              <ViewField label="Account Status" value={linkedUser.status} />
              {linkedUser.joining_date && (
                <ViewField label="Joining Date" value={linkedUser.joining_date?.split?.('T')?.[0]} />
              )}
              {linkedUser.department && (
                <ViewField label="Department" value={linkedUser.department} />
              )}
              {linkedUser.designation && (
                <ViewField label="Designation" value={linkedUser.designation} />
              )}
            </div>
          </div>
        ) : (
          <div className="mt-2 flex items-center justify-between p-4 bg-amber-50 border border-amber-200 rounded-xl">
            <div className="flex items-center gap-2 text-amber-700 text-sm">
              <AlertCircle className="w-4 h-4" />
              No CRM login account linked to this employee.
            </div>
            <Link to={`/users/new?employee_id=${id}`}
              className="text-xs text-indigo-600 hover:underline font-medium whitespace-nowrap">
              Create Account →
            </Link>
          </div>
        )}
      </Section>

      {/* ── SECTION 2 — PERSONAL INFORMATION ── */}
      <Section icon={User} title="Personal Information" color="indigo">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-5 mt-2">
          <ViewField label="Full Name" value={emp.full_name} />
          <ViewField label="Email" value={emp.email} />
          <ViewField label="Phone" value={emp.phone} />
          <ViewField label="Gender" value={emp.gender} />
          <ViewField label="Date of Birth" value={emp.date_of_birth} />
          <ViewField label="Blood Group" value={emp.blood_group} />
          <ViewField label="PAN Number" value={emp.pan_number} mono />
          <ViewField label="Aadhaar Number" value={emp.aadhaar_number} mono />
        </div>
        {emp.address_info && (
          <>
            <div className="mt-5 mb-3 text-xs font-semibold text-gray-400 uppercase">Residential Address</div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <ViewField label="Street" value={emp.address_info.street} className="md:col-span-3" />
              <ViewField label="City" value={emp.address_info.city} />
              <ViewField label="State" value={emp.address_info.state} />
              <ViewField label="ZIP / PIN" value={emp.address_info.zip_code} />
              <ViewField label="Country" value={emp.address_info.country} />
            </div>
          </>
        )}
      </Section>

      {/* ── SECTION 3 — EMPLOYMENT DETAILS ── */}
      <Section icon={Briefcase} title="Employment Details" color="blue">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-5 mt-2">
          <ViewField label="Department" value={emp.department_name} />
          <ViewField label="Designation" value={emp.designation_name} />
          <ViewField label="Employment Type" value={emp.employment_type?.replace('_', ' ')} />
          <ViewField label="Date of Joining" value={emp.date_of_joining} />
          <ViewField label="Work Location" value={emp.work_location} />
          <ViewField label="Shift" value={emp.shift_start_time && emp.shift_end_time ? `${emp.shift_start_time} – ${emp.shift_end_time}` : null} />
        </div>
        {emp.work_description && (
          <div className="mt-4">
            <p className="text-xs font-semibold text-gray-400 uppercase mb-1">Role Description</p>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{emp.work_description}</p>
          </div>
        )}
        {emp.salary && (emp.salary.ctc > 0 || emp.salary.basic > 0) && (
          <>
            <div className="mt-5 mb-3 text-xs font-semibold text-gray-400 uppercase">Salary Structure</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <ViewField label="Annual CTC (₹)" value={emp.salary.ctc ? emp.salary.ctc.toLocaleString('en-IN') : null} />
              <ViewField label="Basic (Monthly)" value={emp.salary.basic ? emp.salary.basic.toLocaleString('en-IN') : null} />
              <ViewField label="HRA (Monthly)" value={emp.salary.hra ? emp.salary.hra.toLocaleString('en-IN') : null} />
              <ViewField label="Special Allowance" value={emp.salary.special_allowance ? emp.salary.special_allowance.toLocaleString('en-IN') : null} />
            </div>
          </>
        )}
      </Section>

      {/* ── SECTION 4 — BANK DETAILS ── */}
      <Section icon={CreditCard} title="Bank Details" color="green" defaultOpen={false}>
        {emp.bank_details ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-5 mt-2">
            <ViewField label="Bank Name" value={emp.bank_details.bank_name} />
            <ViewField label="Account Number" value={emp.bank_details.account_number} mono />
            <ViewField label="IFSC Code" value={emp.bank_details.ifsc_code} mono />
            <ViewField label="Account Holder Name" value={emp.bank_details.account_holder_name} />
            <ViewField label="PF Number" value={emp.pf_number} mono />
            <ViewField label="UAN Number" value={emp.uan_number} mono />
          </div>
        ) : (
          <p className="text-sm text-gray-400 text-center py-4 mt-2">No bank details on record.</p>
        )}
      </Section>

      {/* ── SECTION 5 — EMERGENCY CONTACTS ── */}
      <Section icon={Phone} title="Emergency Contacts" color="orange" defaultOpen={false}>
        {emp.emergency_contacts?.length > 0 ? (
          <div className="space-y-3 mt-2">
            {emp.emergency_contacts.map((c, i) => (
              <div key={i} className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-gray-50 rounded-lg">
                <ViewField label="Name" value={c.name} />
                <ViewField label="Relationship" value={c.relationship} />
                <ViewField label="Phone" value={c.phone} />
                <ViewField label="Email" value={c.email} />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400 text-center py-4 mt-2">No emergency contacts on record.</p>
        )}
      </Section>

      {/* ── SECTION 6 — QUALIFICATIONS ── */}
      <Section icon={GraduationCap} title="Qualifications" color="purple" defaultOpen={false}>
        {emp.qualifications?.length > 0 ? (
          <div className="space-y-3 mt-2">
            {emp.qualifications.map((q, i) => (
              <div key={i} className="grid grid-cols-2 md:grid-cols-5 gap-4 p-4 bg-gray-50 rounded-lg">
                <ViewField label="Type" value={q.type} />
                <ViewField label="Degree / Certificate" value={q.title} />
                <ViewField label="Institution" value={q.institution} />
                <ViewField label="Year" value={q.year?.toString()} />
                <ViewField label="Grade / Score" value={q.grade} />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400 text-center py-4 mt-2">No qualifications on record.</p>
        )}
      </Section>

      {/* ── SECTION 7 — BACKGROUND VERIFICATION ── */}
      <Section icon={ShieldCheck} title="Background Verification" color="teal" defaultOpen={false}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-2">
          <ViewField label="Verification Status" value={emp.background_check?.status || 'pending'} />
          <ViewField label="Notes" value={emp.background_check?.notes} />
        </div>
      </Section>

      {/* ── SECTION 8 — DISCIPLINARY RECORDS ── */}
      <Section icon={FileText} title="Disciplinary Records" color="red" defaultOpen={false}>
        {emp.disciplinary_records?.length > 0 ? (
          <div className="space-y-3 mt-2">
            {emp.disciplinary_records.map((d, i) => (
              <div key={i} className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-red-50 rounded-lg">
                <ViewField label="Date" value={d.date?.toString()} />
                <ViewField label="Incident" value={d.incident} />
                <ViewField label="Action Taken" value={d.action_taken} />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400 text-center py-4 mt-2">No disciplinary records.</p>
        )}
      </Section>

      {/* ── SECTION 9 — DOCUMENTS ── */}
      <Section icon={FileText} title="Documents" color="blue" defaultOpen={false}>
        {emp.documents?.length > 0 ? (
          <div className="space-y-2 mt-2">
            {emp.documents.map((doc, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg">
                <div>
                  <p className="text-sm font-medium text-gray-900">{doc.doc_name}</p>
                  <p className="text-xs text-gray-500">{doc.doc_type}</p>
                </div>
                <a href={doc.file_url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-indigo-600 hover:underline">
                  <ExternalLink className="w-3 h-3" /> View
                </a>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400 text-center py-4 mt-2">No documents uploaded.</p>
        )}
      </Section>

      {/* Footer action */}
      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={() => navigate(-1)}
          className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50">
          Back
        </button>
        <Link to={`/hrm/employees/${id}/edit`}
          className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700">
          <Edit2 className="w-4 h-4" /> Edit Employee
        </Link>
      </div>

    </div>
  )
}
