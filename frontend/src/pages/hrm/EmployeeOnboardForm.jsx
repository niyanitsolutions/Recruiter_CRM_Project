import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import {
  CheckCircle, XCircle, Loader2, Plus, Trash2,
  Upload, User, Phone, CreditCard, GraduationCap, FileText,
  AlertTriangle,
} from 'lucide-react'
import api from '../../services/api'

const EMPTY_QUAL = () => ({ degree: '', institution: '', year: '', grade: '' })

const DEGREES = [
  'High School', 'Diploma', "Bachelor's Degree", "Master's Degree", 'PhD', 'Other',
]

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']

// ── Doc upload helper ─────────────────────────────────────────────────────────

function DocUpload({ docKey, label, required, docFiles, fieldErrors, onDocChange }) {
  const file = docFiles[docKey]
  const errKey = `doc_${docKey}`
  const inp =
    'block flex-1 text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg ' +
    'file:border-0 file:text-xs file:font-medium file:bg-indigo-50 file:text-indigo-700 ' +
    'hover:file:bg-indigo-100'

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <div
        className={`flex items-center gap-3 border rounded-lg px-3 py-2 ${
          fieldErrors[errKey] ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-gray-50'
        }`}
      >
        <input
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
          onChange={e => onDocChange(docKey, e)}
          className={inp}
        />
        {file && (
          <span className="flex items-center gap-1 text-xs text-green-600 font-medium flex-shrink-0">
            <Upload className="w-3.5 h-3.5" />
            {file.name.length > 20 ? file.name.slice(0, 20) + '…' : file.name}
          </span>
        )}
      </div>
      {fieldErrors[errKey] && (
        <p className="text-red-500 text-xs mt-1">{fieldErrors[errKey]}</p>
      )}
    </div>
  )
}

/**
 * Centered validation-error popup listing all issues in plain language.
 */
function ValidationModal({ messages, onClose }) {
  if (!messages.length) return null
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 px-4">
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md animate-fade-in">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-red-600" />
          </div>
          <h3 className="text-base font-bold text-gray-900">Please Complete Required Fields</h3>
        </div>
        <ul className="space-y-2 mb-5 max-h-60 overflow-y-auto">
          {messages.map((msg, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
              <span className="text-red-500 mt-0.5 flex-shrink-0">•</span>
              {msg}
            </li>
          ))}
        </ul>
        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-xl"
          >
            Fix Issues
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Public employee self-onboarding form opened via /employee-onboard/:token.
 * No auth required. Collects personal info, emergency contact, bank details,
 * qualifications, and documents. Creates HRM employee record on submission.
 */
export default function EmployeeOnboardForm() {
  const { token } = useParams()

  // page state
  const [pageStatus,  setPageStatus]  = useState('loading') // loading | valid | invalid | submitted
  const [pageError,   setPageError]   = useState('')
  const [saving,      setSaving]      = useState(false)
  const [fieldErrors, setFieldErrors] = useState({})
  const [serverError, setServerError] = useState('')

  // Validation modal
  const [validationMsgs, setValidationMsgs] = useState([])

  // Photo
  const [photoFile,    setPhotoFile]    = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)

  // Address same-as checkbox
  const [sameAddress, setSameAddress] = useState(false)

  // "I Have Prior Work Experience" checkbox
  const [hasExperience, setHasExperience] = useState(false)

  // Document files — mandatory + optional + experience
  const [docFiles, setDocFiles] = useState({
    aadhaar:           null,
    pan:               null,
    degree_cert:       null,
    resume:            null,
    other:             null,
    experience_letter: null,
    relieving_letter:  null,
    payslip:           null,
  })

  // Qualifications (array)
  const [qualifications, setQualifications] = useState([EMPTY_QUAL()])

  // Main form
  const [form, setForm] = useState({
    full_name:         '',
    email:             '',
    mobile:            '',
    date_of_birth:     '',
    gender:            '',
    blood_group:       '',
    current_address:   '',
    permanent_address: '',
    pan_number:        '',
    aadhaar_number:    '',
    // Emergency contact
    ec_name:           '',
    ec_relationship:   '',
    ec_mobile:         '',
    // Bank details
    bank_name:             '',
    account_holder_name:   '',
    account_number:        '',
    ifsc_code:             '',
  })

  // ── Validate token on mount ────────────────────────────────────────────────
  useEffect(() => {
    api.get(`/public/employee-onboarding/${token}`)
      .then(() => setPageStatus('valid'))
      .catch(err => {
        setPageStatus('invalid')
        setPageError(err.response?.data?.detail || 'This link is invalid or has expired.')
      })
  }, [token])

  // ── Helpers ────────────────────────────────────────────────────────────────
  const set = (field, value) => {
    setForm(f => ({ ...f, [field]: value }))
    if (fieldErrors[field]) setFieldErrors(prev => ({ ...prev, [field]: '' }))
  }

  const handleChange = e => {
    const { name, value } = e.target
    set(name, value)
    // Keep permanent address in sync while the same-address checkbox is ticked
    if (name === 'current_address' && sameAddress) {
      setForm(f => ({ ...f, current_address: value, permanent_address: value }))
    }
  }

  const handleSameAddress = e => {
    const checked = e.target.checked
    setSameAddress(checked)
    if (checked) set('permanent_address', form.current_address)
  }

  // Photo
  const handlePhotoChange = e => {
    const file = e.target.files?.[0]
    if (!file) return
    const allowed = ['.jpg', '.jpeg', '.png', '.webp']
    const ext = '.' + file.name.split('.').pop().toLowerCase()
    if (!allowed.includes(ext)) {
      setFieldErrors(prev => ({ ...prev, photo: 'Only JPG, PNG, or WEBP images are allowed.' }))
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setFieldErrors(prev => ({ ...prev, photo: 'Photo must be under 5 MB.' }))
      return
    }
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
    setFieldErrors(prev => ({ ...prev, photo: '' }))
  }

  const removePhoto = () => {
    setPhotoFile(null)
    if (photoPreview) URL.revokeObjectURL(photoPreview)
    setPhotoPreview(null)
  }

  // Documents
  const handleDocChange = (docType, e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const allowed = ['.pdf', '.jpg', '.jpeg', '.png', '.doc', '.docx']
    const ext = '.' + file.name.split('.').pop().toLowerCase()
    if (!allowed.includes(ext)) {
      setFieldErrors(prev => ({
        ...prev, [`doc_${docType}`]: 'Only PDF, images, or Word documents are allowed.',
      }))
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setFieldErrors(prev => ({ ...prev, [`doc_${docType}`]: 'Document must be under 10 MB.' }))
      return
    }
    setDocFiles(prev => ({ ...prev, [docType]: file }))
    setFieldErrors(prev => ({ ...prev, [`doc_${docType}`]: '' }))
  }

  // Qualifications
  const updateQual = (i, field, value) =>
    setQualifications(prev => prev.map((q, idx) => idx === i ? { ...q, [field]: value } : q))
  const addQual    = () => setQualifications(prev => [...prev, EMPTY_QUAL()])
  const removeQual = i => {
    if (qualifications.length === 1) return
    setQualifications(prev => prev.filter((_, idx) => idx !== i))
  }

  // ── Validation ─────────────────────────────────────────────────────────────
  const validate = () => {
    const errs    = {}
    const messages = []

    // Personal info
    if (!form.full_name.trim()) {
      errs.full_name = 'Required'
      messages.push('Please enter your full name.')
    }
    if (!form.email.trim()) {
      errs.email = 'Required'
      messages.push('Please enter your email address.')
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      errs.email = 'Invalid format'
      messages.push('Please enter a valid email address.')
    }
    const mobileCleaned = form.mobile.replace(/\D/g, '')
    if (!form.mobile.trim()) {
      errs.mobile = 'Required'
      messages.push('Please enter your mobile number.')
    } else if (!/^[6-9]\d{9}$/.test(mobileCleaned)) {
      errs.mobile = 'Must start with 6–9 and be 10 digits'
      messages.push('Mobile number must start with 6–9 and be 10 digits.')
    }
    if (!form.date_of_birth) {
      errs.date_of_birth = 'Required'
      messages.push('Please enter your date of birth.')
    }
    if (!form.gender) {
      errs.gender = 'Required'
      messages.push('Please select your gender.')
    }
    if (!form.current_address.trim()) {
      errs.current_address = 'Required'
      messages.push('Please enter your current address.')
    }

    // Emergency contact — all 3 fields mandatory
    if (!form.ec_name.trim()) {
      errs.ec_name = 'Required'
      messages.push('Please enter your emergency contact name.')
    }
    if (!form.ec_relationship) {
      errs.ec_relationship = 'Required'
      messages.push('Please select your relationship with the emergency contact.')
    }
    const ecMobileCleaned = form.ec_mobile.replace(/\D/g, '')
    if (!form.ec_mobile.trim()) {
      errs.ec_mobile = 'Required'
      messages.push('Please enter your emergency contact mobile number.')
    } else if (ecMobileCleaned === mobileCleaned && mobileCleaned.length > 0) {
      errs.ec_mobile = 'Must be different from your mobile'
      messages.push('Emergency Contact Number must be different from Employee Mobile Number.')
    }

    // Mandatory documents
    if (!docFiles.aadhaar) {
      errs.doc_aadhaar = 'Required'
      messages.push('Please upload your Aadhaar Card.')
    }
    if (!docFiles.pan) {
      errs.doc_pan = 'Required'
      messages.push('Please upload your PAN Card.')
    }
    if (!docFiles.degree_cert) {
      errs.doc_degree_cert = 'Required'
      messages.push('Please upload your Degree / Provisional Certificate.')
    }

    // Experience documents (conditional)
    if (hasExperience) {
      if (!docFiles.experience_letter) {
        errs.doc_experience_letter = 'Required'
        messages.push('Please upload your Experience Letter.')
      }
      if (!docFiles.relieving_letter) {
        errs.doc_relieving_letter = 'Required'
        messages.push('Please upload your Relieving Letter.')
      }
      if (!docFiles.payslip) {
        errs.doc_payslip = 'Required'
        messages.push('Please upload your Latest Payslip.')
      }
    }

    return { errs, messages }
  }

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async e => {
    e.preventDefault()
    setServerError('')

    const { errs, messages } = validate()
    if (messages.length > 0) {
      setFieldErrors(errs)
      setValidationMsgs(messages)
      return
    }
    setFieldErrors({})

    try {
      setSaving(true)

      const payload = {
        full_name:         form.full_name.trim(),
        email:             form.email.trim().toLowerCase(),
        mobile:            form.mobile.replace(/\D/g, ''),
        date_of_birth:     form.date_of_birth || null,
        gender:            form.gender || null,
        blood_group:       form.blood_group || null,
        current_address:   form.current_address.trim() || null,
        permanent_address: form.permanent_address.trim() || null,
        pan_number:        form.pan_number.trim().toUpperCase() || null,
        aadhaar_number:    form.aadhaar_number.trim() || null,
        emergency_contact: {
          name:         form.ec_name.trim(),
          relationship: form.ec_relationship.trim(),
          phone:        form.ec_mobile.trim(),
        },
        bank_details: (form.bank_name.trim() || form.account_number.trim()) ? {
          bank_name:           form.bank_name.trim(),
          account_holder_name: form.account_holder_name.trim(),
          account_number:      form.account_number.trim(),
          ifsc_code:           form.ifsc_code.trim().toUpperCase(),
        } : null,
        qualifications: qualifications
          .filter(q => q.degree.trim())
          .map(q => ({
            degree:      q.degree,
            institution: q.institution.trim() || '',
            year:        q.year ? parseInt(q.year, 10) : null,
            grade:       q.grade.trim() || '',
          })),
      }

      // 1. Submit main form — creates employee record
      const res = await api.post(`/public/employee-onboarding/${token}`, payload)
      const employeeId = res.data?.employee_id

      if (employeeId) {
        // 2. Upload photo (non-fatal)
        if (photoFile) {
          try {
            const fd = new FormData()
            fd.append('file', photoFile)
            await api.post(`/public/employee-onboarding/${token}/photo`, fd, {
              headers: { 'Content-Type': 'multipart/form-data' },
            })
          } catch {
            // non-fatal
          }
        }

        // 3. Upload all selected documents (non-fatal per file)
        for (const [docType, file] of Object.entries(docFiles)) {
          if (!file) continue
          try {
            const fd = new FormData()
            fd.append('file', file)
            await api.post(
              `/public/employee-onboarding/${token}/document?doc_type=${docType}`,
              fd,
              { headers: { 'Content-Type': 'multipart/form-data' } },
            )
          } catch {
            // non-fatal
          }
        }
      }

      setPageStatus('submitted')
    } catch (err) {
      setServerError(err.response?.data?.detail || 'Submission failed. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  // ── Styles ─────────────────────────────────────────────────────────────────
  const inp    = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus:outline-none'
  const inpErr = field => fieldErrors[field]
    ? 'w-full px-3 py-2 border border-red-400 rounded-lg text-sm focus:ring-2 focus:ring-red-400 focus:border-red-400 focus:outline-none'
    : inp
  const lbl    = 'block text-sm font-medium text-gray-700 mb-1'
  const err    = 'text-red-500 text-xs mt-1'
  const card   = 'bg-white rounded-xl shadow-sm border border-gray-100 p-6'
  const sec    = 'text-base font-semibold text-gray-900 mb-4 flex items-center gap-2'

  // ── Page states ────────────────────────────────────────────────────────────
  if (pageStatus === 'loading') return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
    </div>
  )

  if (pageStatus === 'invalid') return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center p-8 max-w-sm">
        <XCircle className="w-14 h-14 text-red-400 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-gray-900 mb-2">Link Invalid or Expired</h2>
        <p className="text-gray-500 text-sm">{pageError}</p>
      </div>
    </div>
  )

  if (pageStatus === 'submitted') return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center p-8 max-w-sm">
        <CheckCircle className="w-14 h-14 text-green-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-gray-900 mb-2">Details Submitted!</h2>
        <p className="text-gray-500 text-sm">
          Thank you. Your onboarding information has been received.
          HR will review your details and get in touch shortly.
        </p>
      </div>
    </div>
  )

  // ── Form render ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">

      {/* Validation error modal */}
      <ValidationModal
        messages={validationMsgs}
        onClose={() => setValidationMsgs([])}
      />

      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Employee Onboarding</h1>
          <p className="text-gray-500 mt-1 text-sm">
            Please fill in your personal details to complete onboarding.
          </p>
        </div>

        {serverError && (
          <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm border border-red-200">
            {serverError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">

          {/* ── Section 1: Profile Photo ─────────────────────────────── */}
          <div className={card}>
            <h2 className={sec}><User className="w-5 h-5 text-indigo-500" /> Profile Photo</h2>
            <div className="flex items-start gap-5">
              <div className="flex-shrink-0">
                {photoPreview ? (
                  <img
                    src={photoPreview}
                    alt="Preview"
                    className="w-24 h-24 rounded-full object-cover border-2 border-indigo-200"
                  />
                ) : (
                  <div className="w-24 h-24 rounded-full bg-gray-100 border-2 border-dashed border-gray-300 flex items-center justify-center">
                    <User className="w-10 h-10 text-gray-300" />
                  </div>
                )}
              </div>

              <div className="flex-1">
                <label className={lbl}>Upload Photo (optional)</label>
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp"
                  onChange={handlePhotoChange}
                  className="block w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                />
                <p className="text-xs text-gray-400 mt-1">JPG, PNG, WEBP — max 5 MB</p>
                {photoFile && (
                  <button
                    type="button"
                    onClick={removePhoto}
                    className="mt-2 text-xs text-red-500 hover:text-red-700 font-medium"
                  >
                    Remove
                  </button>
                )}
                {fieldErrors.photo && <p className={err}>{fieldErrors.photo}</p>}
              </div>
            </div>
          </div>

          {/* ── Section 2: Personal Information ─────────────────────── */}
          <div className={card}>
            <h2 className={sec}><User className="w-5 h-5 text-indigo-500" /> Personal Information</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

              <div className="sm:col-span-2">
                <label className={lbl}>Full Name <span className="text-red-500">*</span></label>
                <input
                  name="full_name" value={form.full_name} onChange={handleChange}
                  className={inpErr('full_name')} placeholder="e.g. Priya Sharma"
                />
                {fieldErrors.full_name && <p className={err}>{fieldErrors.full_name}</p>}
              </div>

              <div>
                <label className={lbl}>Email Address <span className="text-red-500">*</span></label>
                <input
                  type="email" name="email" value={form.email} onChange={handleChange}
                  className={inpErr('email')} placeholder="you@example.com"
                />
                {fieldErrors.email && <p className={err}>{fieldErrors.email}</p>}
              </div>

              <div>
                <label className={lbl}>Mobile Number <span className="text-red-500">*</span></label>
                <input
                  type="tel" name="mobile" value={form.mobile} onChange={handleChange}
                  className={inpErr('mobile')} placeholder="9876543210"
                />
                {fieldErrors.mobile && <p className={err}>{fieldErrors.mobile}</p>}
              </div>

              <div>
                <label className={lbl}>Date of Birth <span className="text-red-500">*</span></label>
                <input
                  type="date" name="date_of_birth" value={form.date_of_birth} onChange={handleChange}
                  className={inpErr('date_of_birth')}
                />
                {fieldErrors.date_of_birth && <p className={err}>{fieldErrors.date_of_birth}</p>}
              </div>

              <div>
                <label className={lbl}>Gender <span className="text-red-500">*</span></label>
                <select name="gender" value={form.gender} onChange={handleChange} className={inpErr('gender')}>
                  <option value="">Select</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                  <option value="prefer_not_to_say">Prefer not to say</option>
                </select>
                {fieldErrors.gender && <p className={err}>{fieldErrors.gender}</p>}
              </div>

              <div>
                <label className={lbl}>Blood Group</label>
                <select name="blood_group" value={form.blood_group} onChange={handleChange} className={inp}>
                  <option value="">Select</option>
                  {BLOOD_GROUPS.map(bg => <option key={bg} value={bg}>{bg}</option>)}
                </select>
              </div>

              {/* Current Address */}
              <div className="sm:col-span-2">
                <label className={lbl}>
                  Current Address <span className="text-red-500">*</span>
                </label>
                <textarea
                  name="current_address" value={form.current_address} onChange={handleChange}
                  rows={2}
                  className={inpErr('current_address')}
                  placeholder="House / Street / City / State / PIN"
                />
                {fieldErrors.current_address && <p className={err}>{fieldErrors.current_address}</p>}
              </div>

              {/* Same-address checkbox */}
              <div className="sm:col-span-2">
                <label className="flex items-center gap-2 cursor-pointer select-none w-fit">
                  <input
                    type="checkbox"
                    checked={sameAddress}
                    onChange={handleSameAddress}
                    className="w-4 h-4 rounded border-gray-400 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-sm text-gray-700">Permanent Address Same as Current Address</span>
                </label>
              </div>

              {/* Permanent Address */}
              <div className="sm:col-span-2">
                <label className={lbl}>Permanent Address</label>
                <textarea
                  name="permanent_address"
                  value={form.permanent_address}
                  onChange={handleChange}
                  rows={2}
                  disabled={sameAddress}
                  className={
                    sameAddress
                      ? 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-100 text-gray-400 cursor-not-allowed'
                      : inp
                  }
                  placeholder="Permanent address (if different from above)"
                />
              </div>

            </div>
          </div>

          {/* ── Section 3: Emergency Contact ─────────────────────────── */}
          <div className={card}>
            <h2 className={sec}><Phone className="w-5 h-5 text-indigo-500" /> Emergency Contact</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={lbl}>Contact Name <span className="text-red-500">*</span></label>
                <input
                  name="ec_name" value={form.ec_name} onChange={handleChange}
                  className={inpErr('ec_name')} placeholder="e.g. Rahul Sharma"
                />
                {fieldErrors.ec_name && <p className={err}>{fieldErrors.ec_name}</p>}
              </div>
              <div>
                <label className={lbl}>Relationship <span className="text-red-500">*</span></label>
                <select
                  name="ec_relationship" value={form.ec_relationship} onChange={handleChange}
                  className={inpErr('ec_relationship')}
                >
                  <option value="">Select</option>
                  <option value="Spouse">Spouse</option>
                  <option value="Parent">Parent</option>
                  <option value="Sibling">Sibling</option>
                  <option value="Child">Child</option>
                  <option value="Friend">Friend</option>
                  <option value="Other">Other</option>
                </select>
                {fieldErrors.ec_relationship && <p className={err}>{fieldErrors.ec_relationship}</p>}
              </div>
              <div>
                <label className={lbl}>Mobile Number <span className="text-red-500">*</span></label>
                <input
                  type="tel" name="ec_mobile" value={form.ec_mobile} onChange={handleChange}
                  className={inpErr('ec_mobile')} placeholder="9988776655"
                />
                {fieldErrors.ec_mobile && <p className={err}>{fieldErrors.ec_mobile}</p>}
              </div>
            </div>
          </div>

          {/* ── Section 4: Bank Details ───────────────────────────────── */}
          <div className={card}>
            <h2 className={sec}><CreditCard className="w-5 h-5 text-indigo-500" /> Bank Details</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={lbl}>Account Holder Name</label>
                <input
                  name="account_holder_name" value={form.account_holder_name} onChange={handleChange}
                  className={inp} placeholder="As on bank account"
                />
              </div>
              <div>
                <label className={lbl}>Bank Name</label>
                <input
                  name="bank_name" value={form.bank_name} onChange={handleChange}
                  className={inp} placeholder="e.g. State Bank of India"
                />
              </div>
              <div>
                <label className={lbl}>Account Number</label>
                <input
                  name="account_number" value={form.account_number} onChange={handleChange}
                  className={inp} placeholder="e.g. 1234567890"
                />
              </div>
              <div>
                <label className={lbl}>IFSC Code</label>
                <input
                  name="ifsc_code" value={form.ifsc_code} onChange={handleChange}
                  className={inp} placeholder="e.g. SBIN0001234"
                  style={{ textTransform: 'uppercase' }}
                />
              </div>
            </div>
          </div>

          {/* ── Section 5: Qualifications ─────────────────────────────── */}
          <div className={card}>
            <div className="flex items-center justify-between mb-4">
              <h2 className={sec.replace(' mb-4', '')}>
                <GraduationCap className="w-5 h-5 text-indigo-500" /> Qualifications
              </h2>
              <button
                type="button" onClick={addQual}
                className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-800 font-medium"
              >
                <Plus className="w-4 h-4" /> Add
              </button>
            </div>
            <div className="space-y-4">
              {qualifications.map((q, i) => (
                <div key={i} className="border border-gray-200 rounded-lg p-4 relative">
                  {qualifications.length > 1 && (
                    <button
                      type="button" onClick={() => removeQual(i)}
                      className="absolute top-3 right-3 text-red-400 hover:text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className={lbl}>Education / Degree</label>
                      <select
                        value={q.degree}
                        onChange={e => updateQual(i, 'degree', e.target.value)}
                        className={inp}
                      >
                        <option value="">Select</option>
                        {DEGREES.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={lbl}>College / University</label>
                      <input
                        value={q.institution}
                        onChange={e => updateQual(i, 'institution', e.target.value)}
                        className={inp} placeholder="e.g. Anna University"
                      />
                    </div>
                    <div>
                      <label className={lbl}>Passing Year</label>
                      <input
                        type="number" value={q.year}
                        onChange={e => updateQual(i, 'year', e.target.value)}
                        className={inp} min="1970" max="2030" placeholder="e.g. 2020"
                      />
                    </div>
                    <div>
                      <label className={lbl}>Percentage / CGPA</label>
                      <input
                        value={q.grade}
                        onChange={e => updateQual(i, 'grade', e.target.value)}
                        className={inp} placeholder="e.g. 75% or 8.5 CGPA"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Section 6: Documents ──────────────────────────────────── */}
          <div className={card}>
            <h2 className={sec}><FileText className="w-5 h-5 text-indigo-500" /> Documents</h2>
            <p className="text-xs text-gray-400 mb-5">
              PDF, images, and Word files are accepted (max 10 MB each).
            </p>

            {/* Mandatory documents */}
            <div className="mb-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Mandatory Documents
              </p>
              <div className="space-y-4">
                <DocUpload
                  docKey="aadhaar" label="Aadhaar Card" required
                  docFiles={docFiles} fieldErrors={fieldErrors} onDocChange={handleDocChange}
                />
                <DocUpload
                  docKey="pan" label="PAN Card" required
                  docFiles={docFiles} fieldErrors={fieldErrors} onDocChange={handleDocChange}
                />
                <DocUpload
                  docKey="degree_cert" label="Degree / Provisional Certificate" required
                  docFiles={docFiles} fieldErrors={fieldErrors} onDocChange={handleDocChange}
                />
              </div>
            </div>

            {/* Work experience checkbox */}
            <div className="my-5 border-t border-gray-100 pt-5">
              <label className="flex items-center gap-2 cursor-pointer select-none w-fit">
                <input
                  type="checkbox"
                  checked={hasExperience}
                  onChange={e => {
                    setHasExperience(e.target.checked)
                    if (!e.target.checked) {
                      setDocFiles(prev => ({
                        ...prev,
                        experience_letter: null,
                        relieving_letter:  null,
                        payslip:           null,
                      }))
                    }
                  }}
                  className="w-4 h-4 rounded border-gray-400 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-sm font-medium text-gray-800">I Have Prior Work Experience</span>
              </label>
            </div>

            {/* Experience documents — shown only when checkbox is checked */}
            {hasExperience && (
              <div className="mb-5 p-4 bg-indigo-50 border border-indigo-100 rounded-xl">
                <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wide mb-3">
                  Experience Documents <span className="text-red-500 normal-case">(Required)</span>
                </p>
                <div className="space-y-4">
                  <DocUpload
                    docKey="experience_letter" label="Experience Letter" required
                    docFiles={docFiles} fieldErrors={fieldErrors} onDocChange={handleDocChange}
                  />
                  <DocUpload
                    docKey="relieving_letter" label="Relieving Letter" required
                    docFiles={docFiles} fieldErrors={fieldErrors} onDocChange={handleDocChange}
                  />
                  <DocUpload
                    docKey="payslip" label="Latest Payslip" required
                    docFiles={docFiles} fieldErrors={fieldErrors} onDocChange={handleDocChange}
                  />
                </div>
              </div>
            )}

            {/* Optional documents */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Optional Documents
              </p>
              <div className="space-y-4">
                <DocUpload
                  docKey="resume" label="Resume / CV"
                  docFiles={docFiles} fieldErrors={fieldErrors} onDocChange={handleDocChange}
                />
                <DocUpload
                  docKey="other" label="Other Supporting Document"
                  docFiles={docFiles} fieldErrors={fieldErrors} onDocChange={handleDocChange}
                />
              </div>
            </div>
          </div>

          {/* ── Submit ────────────────────────────────────────────────── */}
          <button
            type="submit"
            disabled={saving}
            className="w-full py-3 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
          >
            {saving ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</>
            ) : (
              'Submit Onboarding Details'
            )}
          </button>

          <p className="text-center text-xs text-gray-400 pb-6">
            Your information is securely stored and only accessible to authorised HR personnel.
          </p>
        </form>
      </div>
    </div>
  )
}
