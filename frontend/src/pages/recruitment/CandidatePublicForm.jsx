import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { CheckCircle, XCircle, Loader2, Plus, Trash2 } from 'lucide-react'
import api from '../../services/api'

/**
 * Public candidate self-registration form (opened via /apply/:token).
 * Renders the same fields as the internal CandidateForm — no auth required.
 * Token is validated on mount; on submit the full payload is sent to the backend.
 */
const CandidatePublicForm = () => {
  const { token } = useParams()
  const [status, setStatus] = useState('loading') // loading | valid | invalid | submitted
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [newSkill, setNewSkill] = useState('')
  const [newLocation, setNewLocation] = useState('')

  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    mobile: '',
    alternate_mobile: '',
    date_of_birth: '',
    gender: '',
    current_city: '',
    current_state: '',
    total_experience_years: '',
    current_company: '',
    current_designation: '',
    current_ctc: '',
    expected_ctc: '',
    notice_period: 'immediate',
    highest_education: '',
    specialization: '',
    university: '',
    graduation_year: '',
    percentage: '',
    skills: [],
    preferred_locations: [],
    willing_to_relocate: false,
    linkedin_url: '',
    portfolio_url: '',
    summary: '',
  })

  useEffect(() => {
    api.get(`/public/candidate-form/${token}`)
      .then(() => setStatus('valid'))
      .catch(err => {
        setStatus('invalid')
        setError(err.response?.data?.detail || 'Invalid or expired link.')
      })
  }, [token])

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }))

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    set(name, type === 'checkbox' ? checked : value)
  }

  const addSkill = () => {
    const s = newSkill.trim()
    if (s && !form.skills.includes(s)) set('skills', [...form.skills, s])
    setNewSkill('')
  }

  const removeSkill = (s) => set('skills', form.skills.filter(x => x !== s))

  const addLocation = () => {
    const l = newLocation.trim()
    if (l && !form.preferred_locations.includes(l)) set('preferred_locations', [...form.preferred_locations, l])
    setNewLocation('')
  }

  const removeLocation = (l) => set('preferred_locations', form.preferred_locations.filter(x => x !== l))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.first_name.trim() || !form.email.trim()) {
      setError('First name and email are required.')
      return
    }
    if (form.mobile && !/^[6-9]\d{9}$/.test(form.mobile.replace(/\D/g, ''))) {
      setError('Mobile number must start with 6–9 and be 10 digits.')
      return
    }
    try {
      setSaving(true)
      setError('')

      const education = form.highest_education ? [{
        degree: form.highest_education,
        field_of_study: form.specialization || null,
        institution: form.university || 'Not specified',
        year_of_passing: form.graduation_year ? parseInt(form.graduation_year, 10) : null,
      }] : []

      const payload = {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim() || null,
        email: form.email.trim(),
        mobile: form.mobile.trim() || null,
        alternate_mobile: form.alternate_mobile.trim() || null,
        date_of_birth: form.date_of_birth || null,
        gender: form.gender || null,
        current_city: form.current_city.trim() || null,
        current_state: form.current_state.trim() || null,
        total_experience_years: form.total_experience_years !== '' ? Number(form.total_experience_years) : null,
        current_company: form.current_company.trim() || null,
        current_designation: form.current_designation.trim() || null,
        current_ctc: form.current_ctc !== '' ? Number(form.current_ctc) : null,
        expected_ctc: form.expected_ctc !== '' ? Number(form.expected_ctc) : null,
        notice_period: form.notice_period || null,
        skills: form.skills.map(s => ({ name: s })),
        skill_tags: form.skills,
        education,
        percentage: form.percentage !== '' ? Number(form.percentage) : null,
        preferred_locations: form.preferred_locations,
        willing_to_relocate: form.willing_to_relocate,
        linkedin_url: form.linkedin_url.trim() || null,
        portfolio_url: form.portfolio_url.trim() || null,
        summary: form.summary.trim() || null,
        source: 'form_link',
      }

      await api.post(`/public/candidate-form/${token}`, payload)
      setStatus('submitted')
    } catch (err) {
      setError(err.response?.data?.detail || 'Submission failed. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-full px-3 py-2 border border-surface-300 rounded-lg text-sm focus:ring-2 focus:ring-accent-500 focus:border-accent-500 focus:outline-none'
  const labelCls = 'block text-sm font-medium text-surface-700 mb-1'

  if (status === 'loading') return (
    <div className="min-h-screen flex items-center justify-center bg-surface-50">
      <Loader2 className="w-8 h-8 animate-spin text-accent-600" />
    </div>
  )

  if (status === 'invalid') return (
    <div className="min-h-screen flex items-center justify-center bg-surface-50">
      <div className="text-center p-8">
        <XCircle className="w-14 h-14 text-red-400 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-surface-900 mb-2">Link Invalid or Expired</h2>
        <p className="text-surface-500">{error}</p>
      </div>
    </div>
  )

  if (status === 'submitted') return (
    <div className="min-h-screen flex items-center justify-center bg-surface-50">
      <div className="text-center p-8">
        <CheckCircle className="w-14 h-14 text-green-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-surface-900 mb-2">Details Submitted!</h2>
        <p className="text-surface-500">Thank you. Our team will be in touch shortly.</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-surface-50 py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-surface-900">Candidate Registration</h1>
          <p className="text-surface-500 mt-1 text-sm">Fill in your details below to apply.</p>
        </div>

        {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-6">

          {/* Basic Information */}
          <div className="bg-white rounded-xl shadow-sm border border-surface-100 p-6">
            <h2 className="text-base font-semibold text-surface-900 mb-4">Basic Information</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>First Name <span className="text-red-500">*</span></label>
                <input name="first_name" value={form.first_name} onChange={handleChange}
                  className={inputCls} placeholder="John" required />
              </div>
              <div>
                <label className={labelCls}>Last Name</label>
                <input name="last_name" value={form.last_name} onChange={handleChange}
                  className={inputCls} placeholder="Doe" />
              </div>
              <div>
                <label className={labelCls}>Email <span className="text-red-500">*</span></label>
                <input type="email" name="email" value={form.email} onChange={handleChange}
                  className={inputCls} placeholder="john@example.com" required />
              </div>
              <div>
                <label className={labelCls}>Mobile <span className="text-red-500">*</span></label>
                <input type="tel" name="mobile" value={form.mobile} onChange={handleChange}
                  className={inputCls} placeholder="9876543210" />
              </div>
              <div>
                <label className={labelCls}>Alternate Mobile</label>
                <input type="tel" name="alternate_mobile" value={form.alternate_mobile} onChange={handleChange}
                  className={inputCls} placeholder="9876543210" />
              </div>
              <div>
                <label className={labelCls}>Date of Birth</label>
                <input type="date" name="date_of_birth" value={form.date_of_birth} onChange={handleChange}
                  className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Gender</label>
                <select name="gender" value={form.gender} onChange={handleChange} className={inputCls}>
                  <option value="">Select</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Current City</label>
                <input name="current_city" value={form.current_city} onChange={handleChange}
                  className={inputCls} placeholder="Mumbai" />
              </div>
              <div>
                <label className={labelCls}>Current State</label>
                <input name="current_state" value={form.current_state} onChange={handleChange}
                  className={inputCls} placeholder="Maharashtra" />
              </div>
            </div>
          </div>

          {/* Professional Information */}
          <div className="bg-white rounded-xl shadow-sm border border-surface-100 p-6">
            <h2 className="text-base font-semibold text-surface-900 mb-4">Professional Information</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Total Experience (Years)</label>
                <input type="number" name="total_experience_years" value={form.total_experience_years}
                  onChange={handleChange} className={inputCls} min="0" max="50" placeholder="0" />
              </div>
              <div>
                <label className={labelCls}>Current Company</label>
                <input name="current_company" value={form.current_company} onChange={handleChange}
                  className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Current Designation</label>
                <input name="current_designation" value={form.current_designation} onChange={handleChange}
                  className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Current CTC (LPA)</label>
                <input type="number" name="current_ctc" value={form.current_ctc} onChange={handleChange}
                  className={inputCls} step="0.1" min="0" />
              </div>
              <div>
                <label className={labelCls}>Expected CTC (LPA)</label>
                <input type="number" name="expected_ctc" value={form.expected_ctc} onChange={handleChange}
                  className={inputCls} step="0.1" min="0" />
              </div>
              <div>
                <label className={labelCls}>Notice Period</label>
                <select name="notice_period" value={form.notice_period} onChange={handleChange} className={inputCls}>
                  <option value="immediate">Immediate</option>
                  <option value="15_days">15 Days</option>
                  <option value="30_days">30 Days</option>
                  <option value="60_days">60 Days</option>
                  <option value="90_days">90 Days</option>
                  <option value="more_than_90">More than 90 Days</option>
                </select>
              </div>
            </div>
          </div>

          {/* Skills */}
          <div className="bg-white rounded-xl shadow-sm border border-surface-100 p-6">
            <h2 className="text-base font-semibold text-surface-900 mb-4">Skills</h2>
            <div className="flex gap-2 mb-3">
              <input value={newSkill} onChange={e => setNewSkill(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addSkill())}
                className={inputCls} placeholder="e.g. React" />
              <button type="button" onClick={addSkill}
                className="px-3 py-2 bg-accent-50 text-accent-700 text-sm rounded-lg hover:bg-accent-100 flex items-center gap-1">
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {form.skills.map(s => (
                <span key={s} className="flex items-center gap-1 px-2 py-1 bg-accent-50 text-accent-700 text-xs rounded-full">
                  {s}
                  <button type="button" onClick={() => removeSkill(s)} className="hover:text-red-500">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </span>
              ))}
              {form.skills.length === 0 && <p className="text-surface-400 text-sm">No skills added yet.</p>}
            </div>
          </div>

          {/* Education */}
          <div className="bg-white rounded-xl shadow-sm border border-surface-100 p-6">
            <h2 className="text-base font-semibold text-surface-900 mb-4">Education</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Highest Education</label>
                <select name="highest_education" value={form.highest_education} onChange={handleChange} className={inputCls}>
                  <option value="">Select</option>
                  <option value="high_school">High School</option>
                  <option value="diploma">Diploma</option>
                  <option value="bachelors">Bachelor's Degree</option>
                  <option value="masters">Master's Degree</option>
                  <option value="phd">PhD</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Specialization</label>
                <input name="specialization" value={form.specialization} onChange={handleChange}
                  className={inputCls} placeholder="e.g. Computer Science" />
              </div>
              <div>
                <label className={labelCls}>University / College</label>
                <input name="university" value={form.university} onChange={handleChange}
                  className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Graduation Year</label>
                <input type="number" name="graduation_year" value={form.graduation_year} onChange={handleChange}
                  className={inputCls} min="1970" max="2030" />
              </div>
              <div>
                <label className={labelCls}>Aggregate % / CGPA</label>
                <input type="number" name="percentage" value={form.percentage} onChange={handleChange}
                  className={inputCls} step="0.01" min="0" max="100" placeholder="e.g. 72.5" />
              </div>
            </div>
          </div>

          {/* Preferred Locations */}
          <div className="bg-white rounded-xl shadow-sm border border-surface-100 p-6">
            <h2 className="text-base font-semibold text-surface-900 mb-4">Preferred Locations</h2>
            <div className="flex gap-2 mb-3">
              <input value={newLocation} onChange={e => setNewLocation(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addLocation())}
                className={inputCls} placeholder="e.g. Bangalore" />
              <button type="button" onClick={addLocation}
                className="px-3 py-2 bg-accent-50 text-accent-700 text-sm rounded-lg hover:bg-accent-100 flex items-center gap-1">
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {form.preferred_locations.map(l => (
                <span key={l} className="flex items-center gap-1 px-2 py-1 bg-surface-100 text-surface-700 text-xs rounded-full">
                  {l}
                  <button type="button" onClick={() => removeLocation(l)} className="hover:text-red-500">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" name="willing_to_relocate" checked={form.willing_to_relocate}
                onChange={handleChange} className="rounded" />
              <span className="text-sm text-surface-600">Willing to relocate</span>
            </label>
          </div>

          {/* Additional Information */}
          <div className="bg-white rounded-xl shadow-sm border border-surface-100 p-6">
            <h2 className="text-base font-semibold text-surface-900 mb-4">Additional Information</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className={labelCls}>LinkedIn URL</label>
                <input type="url" name="linkedin_url" value={form.linkedin_url} onChange={handleChange}
                  className={inputCls} placeholder="https://linkedin.com/in/..." />
              </div>
              <div>
                <label className={labelCls}>Portfolio URL</label>
                <input type="url" name="portfolio_url" value={form.portfolio_url} onChange={handleChange}
                  className={inputCls} placeholder="https://..." />
              </div>
            </div>
            <div>
              <label className={labelCls}>Brief Summary</label>
              <textarea name="summary" value={form.summary} onChange={handleChange} rows={4}
                className={inputCls} placeholder="Brief description of your background..." />
            </div>
          </div>

          <button type="submit" disabled={saving}
            className="w-full py-3 bg-accent-600 text-white font-medium rounded-lg hover:bg-accent-700 disabled:opacity-50 flex items-center justify-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {saving ? 'Submitting…' : 'Submit Application'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default CandidatePublicForm
