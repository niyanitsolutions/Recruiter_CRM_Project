import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { CheckCircle, XCircle, Loader2, Plus, Trash2, Upload, X } from 'lucide-react'
import { publicApplyService } from '../../services/publicFormService'

const EMPTY_EDU = () => ({ degree: '', field_of_study: '', institution: '', from_year: '', to_year: '', percentage: '' })
const EMPTY_EXP = () => ({ company_name: '', designation: '', start_date: '', end_date: '', is_current: false })

/**
 * Public permanent apply form — opened via /apply/public/:slug.
 * No auth required. Each submission creates a new Candidate.
 * Separate from the one-time token form at /apply/:token.
 */
const PublicApplyForm = () => {
  const { slug } = useParams()
  const [status, setStatus] = useState('loading') // loading | valid | disabled | expired | error | submitted
  const [formMeta, setFormMeta] = useState(null)
  const [saving, setSaving] = useState(false)
  const [newSkill, setNewSkill] = useState('')
  const [newLocation, setNewLocation] = useState('')
  const [isFresher, setIsFresher] = useState(false)
  const [errors, setErrors] = useState({})
  const [resumeFile, setResumeFile] = useState(null)
  const [openTracked, setOpenTracked] = useState(false)
  const [education, setEducation] = useState([EMPTY_EDU()])
  const [workExperience, setWorkExperience] = useState([EMPTY_EXP()])

  const [form, setForm] = useState({
    first_name: '', last_name: '', email: '', mobile: '',
    alternate_mobile: '', date_of_birth: '', gender: '',
    current_city: '', current_state: '', total_experience_years: '',
    current_company: '', current_designation: '',
    current_ctc: '', expected_ctc: '', notice_period: 'immediate',
    skills: [], preferred_locations: [], willing_to_relocate: false,
    linkedin_url: '', portfolio_url: '', summary: '',
  })

  useEffect(() => {
    publicApplyService.getFormMeta(slug)
      .then(res => {
        if (res.expired) { setStatus('expired'); return }
        if (res.disabled) { setStatus('disabled'); return }
        setFormMeta(res.form)
        setStatus('valid')
      })
      .catch(() => setStatus('error'))
  }, [slug])

  const set = (field, value) => {
    setForm(f => ({ ...f, [field]: value }))
    if (errors[field]) setErrors(p => ({ ...p, [field]: '' }))
  }
  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    set(name, type === 'checkbox' ? checked : value)
  }

  const trackOpen = () => {
    if (!openTracked) {
      setOpenTracked(true)
      publicApplyService.trackOpen(slug)
    }
  }

  // ── Education helpers ────────────────────────────────────────────────────────
  const updateEducation = (i, f, v) =>
    setEducation(p => p.map((e, idx) => idx === i ? { ...e, [f]: v } : e))
  const addEducation = () => setEducation(p => [...p, EMPTY_EDU()])
  const removeEducation = (i) => {
    if (education.length > 1) setEducation(p => p.filter((_, idx) => idx !== i))
  }

  // ── Work experience helpers ──────────────────────────────────────────────────
  const updateExperience = (i, f, v) =>
    setWorkExperience(p => p.map((e, idx) => {
      if (idx !== i) return e
      const u = { ...e, [f]: v }
      if (f === 'is_current' && v) u.end_date = ''
      return u
    }))
  const addExperience = () => setWorkExperience(p => [...p, EMPTY_EXP()])
  const removeExperience = (i) => {
    if (workExperience.length > 1) setWorkExperience(p => p.filter((_, idx) => idx !== i))
  }

  const addSkill = () => {
    const s = newSkill.trim()
    if (s && !form.skills.includes(s)) set('skills', [...form.skills, s])
    setNewSkill('')
  }
  const removeSkill = s => set('skills', form.skills.filter(x => x !== s))

  const addLocation = () => {
    const l = newLocation.trim()
    if (l && !form.preferred_locations.includes(l)) set('preferred_locations', [...form.preferred_locations, l])
    setNewLocation('')
  }
  const removeLocation = l => set('preferred_locations', form.preferred_locations.filter(x => x !== l))

  const handleResumeChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const ext = '.' + file.name.split('.').pop().toLowerCase()
    if (!['.pdf', '.doc', '.docx'].includes(ext)) {
      setErrors(p => ({ ...p, resume: 'Only PDF, DOC, or DOCX files are allowed' }))
      e.target.value = ''
      return
    }
    setResumeFile(file)
    if (errors.resume) setErrors(p => ({ ...p, resume: '' }))
  }

  const validate = () => {
    const e = {}
    if (!form.first_name.trim()) e.first_name = 'First name is required'
    if (!form.email.trim()) e.email = 'Email is required'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Invalid email address'
    if (!form.mobile.trim()) e.mobile = 'Mobile number is required'
    if (!form.gender) e.gender = 'Gender is required'
    if (!form.date_of_birth) e.date_of_birth = 'Date of birth is required'
    if (!isFresher && form.skills.length === 0) e.skills = 'At least one skill is required'
    if (form.preferred_locations.length === 0) e.preferred_locations = 'At least one preferred location is required'
    return e
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const ve = validate()
    if (Object.keys(ve).length > 0) {
      setErrors(ve)
      const firstKey = Object.keys(ve)[0]
      document.getElementById(`paf-${firstKey}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }

    setSaving(true)
    try {
      const payload = {
        ...form,
        education: education.filter(e => e.degree && e.institution),
        work_experience: isFresher ? [] : workExperience.filter(e => e.company_name),
        total_experience_years: isFresher ? 0 : (parseFloat(form.total_experience_years) || 0),
        skill_tags: form.skills,
      }
      const res = await publicApplyService.submitForm(slug, payload)
      if (resumeFile && res.candidate_id) {
        try {
          await publicApplyService.uploadResume(slug, res.candidate_id, resumeFile)
        } catch (_) {
          // Non-fatal: form is submitted, resume upload failed
        }
      }
      setStatus('submitted')
    } catch (err) {
      const msg = err.response?.data?.detail
      if (err.response?.status === 409) {
        setErrors({ email: 'A candidate with this email already exists.' })
        document.getElementById('paf-email')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      } else {
        setErrors({ _global: msg || 'Something went wrong. Please try again.' })
      }
    } finally {
      setSaving(false)
    }
  }

  // ── Status screens ──────────────────────────────────────────────────────────

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    )
  }

  if (status === 'submitted') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="bg-white rounded-2xl shadow-lg p-10 max-w-md w-full text-center">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Application Submitted!</h2>
          <p className="text-gray-500">
            Thank you for applying. Your details have been submitted successfully.
            We will get back to you soon.
          </p>
        </div>
      </div>
    )
  }

  if (status === 'expired') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="bg-white rounded-2xl shadow-lg p-10 max-w-md w-full text-center">
          <XCircle className="w-16 h-16 text-yellow-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Form Expired</h2>
          <p className="text-gray-500">This application form is no longer accepting submissions.</p>
        </div>
      </div>
    )
  }

  if (status === 'disabled') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="bg-white rounded-2xl shadow-lg p-10 max-w-md w-full text-center">
          <XCircle className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Form Unavailable</h2>
          <p className="text-gray-500">This application form is currently not accepting submissions.</p>
        </div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="bg-white rounded-2xl shadow-lg p-10 max-w-md w-full text-center">
          <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Form Not Found</h2>
          <p className="text-gray-500">This link is invalid or no longer available.</p>
        </div>
      </div>
    )
  }

  // ── Main form ───────────────────────────────────────────────────────────────

  const inp = 'w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'
  const lbl = 'block text-sm font-medium text-gray-700 mb-1'
  const err = 'text-xs text-red-500 mt-1'

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-sm p-8 mb-6 text-center">
          <h1 className="text-2xl font-bold text-gray-800 mb-1">
            {formMeta?.job_title || 'Job Application'}
          </h1>
          {formMeta?.company_name && (
            <p className="text-gray-500 text-sm">{formMeta.company_name}</p>
          )}
        </div>

        <form onSubmit={handleSubmit} onFocus={trackOpen} noValidate>
          {errors._global && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-600">
              {errors._global}
            </div>
          )}

          {/* Personal Info */}
          <div className="bg-white rounded-2xl shadow-sm p-6 mb-5">
            <h3 className="text-base font-semibold text-gray-700 mb-4">Personal Information</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div id="paf-first_name">
                <label className={lbl}>First Name <span className="text-red-500">*</span></label>
                <input className={inp} name="first_name" value={form.first_name} onChange={handleChange} placeholder="First name" />
                {errors.first_name && <p className={err}>{errors.first_name}</p>}
              </div>
              <div>
                <label className={lbl}>Last Name</label>
                <input className={inp} name="last_name" value={form.last_name} onChange={handleChange} placeholder="Last name" />
              </div>
              <div id="paf-email">
                <label className={lbl}>Email <span className="text-red-500">*</span></label>
                <input className={inp} name="email" type="email" value={form.email} onChange={handleChange} placeholder="your@email.com" />
                {errors.email && <p className={err}>{errors.email}</p>}
              </div>
              <div id="paf-mobile">
                <label className={lbl}>Mobile <span className="text-red-500">*</span></label>
                <input className={inp} name="mobile" value={form.mobile} onChange={handleChange} placeholder="Mobile number" />
                {errors.mobile && <p className={err}>{errors.mobile}</p>}
              </div>
              <div id="paf-gender">
                <label className={lbl}>Gender <span className="text-red-500">*</span></label>
                <select className={inp} name="gender" value={form.gender} onChange={handleChange}>
                  <option value="">Select gender</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                  <option value="prefer_not_to_say">Prefer not to say</option>
                </select>
                {errors.gender && <p className={err}>{errors.gender}</p>}
              </div>
              <div id="paf-date_of_birth">
                <label className={lbl}>Date of Birth <span className="text-red-500">*</span></label>
                <input className={inp} name="date_of_birth" type="date" value={form.date_of_birth} onChange={handleChange} />
                {errors.date_of_birth && <p className={err}>{errors.date_of_birth}</p>}
              </div>
              <div>
                <label className={lbl}>Current City</label>
                <input className={inp} name="current_city" value={form.current_city} onChange={handleChange} placeholder="City" />
              </div>
              <div>
                <label className={lbl}>Current State</label>
                <input className={inp} name="current_state" value={form.current_state} onChange={handleChange} placeholder="State" />
              </div>
            </div>
          </div>

          {/* Professional Info */}
          <div className="bg-white rounded-2xl shadow-sm p-6 mb-5">
            <h3 className="text-base font-semibold text-gray-700 mb-3">Professional Information</h3>
            <div className="flex items-center gap-2 mb-4">
              <input type="checkbox" id="paf-fresher" checked={isFresher} onChange={e => setIsFresher(e.target.checked)} className="rounded" />
              <label htmlFor="paf-fresher" className="text-sm text-gray-600 cursor-pointer">I am a Fresher (0 years experience)</label>
            </div>
            {!isFresher && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className={lbl}>Years of Experience</label>
                  <input className={inp} name="total_experience_years" type="number" min="0" max="50" step="0.5" value={form.total_experience_years} onChange={handleChange} placeholder="e.g. 3.5" />
                </div>
                <div>
                  <label className={lbl}>Current Company</label>
                  <input className={inp} name="current_company" value={form.current_company} onChange={handleChange} placeholder="Current company" />
                </div>
                <div>
                  <label className={lbl}>Current Designation</label>
                  <input className={inp} name="current_designation" value={form.current_designation} onChange={handleChange} placeholder="Current designation" />
                </div>
                <div>
                  <label className={lbl}>Current CTC (LPA)</label>
                  <input className={inp} name="current_ctc" type="number" min="0" value={form.current_ctc} onChange={handleChange} placeholder="e.g. 5.5" />
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={lbl}>Expected CTC (LPA)</label>
                <input className={inp} name="expected_ctc" type="number" min="0" value={form.expected_ctc} onChange={handleChange} placeholder="e.g. 8" />
              </div>
              <div>
                <label className={lbl}>Notice Period</label>
                <select className={inp} name="notice_period" value={form.notice_period} onChange={handleChange}>
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
          <div className="bg-white rounded-2xl shadow-sm p-6 mb-5" id="paf-skills">
            <h3 className="text-base font-semibold text-gray-700 mb-3">
              Skills {!isFresher && <span className="text-red-500">*</span>}
            </h3>
            <div className="flex gap-2 mb-3">
              <input
                className={inp}
                value={newSkill}
                onChange={e => setNewSkill(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addSkill())}
                placeholder="Type a skill and press Enter or Add"
              />
              <button type="button" onClick={addSkill} className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 flex items-center gap-1 shrink-0">
                <Plus className="w-4 h-4" /> Add
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {form.skills.map(s => (
                <span key={s} className="inline-flex items-center gap-1 px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-sm">
                  {s}
                  <button type="button" onClick={() => removeSkill(s)} className="hover:text-red-500">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            {errors.skills && <p className={err}>{errors.skills}</p>}
          </div>

          {/* Preferred Locations */}
          <div className="bg-white rounded-2xl shadow-sm p-6 mb-5" id="paf-preferred_locations">
            <h3 className="text-base font-semibold text-gray-700 mb-3">Preferred Locations <span className="text-red-500">*</span></h3>
            <div className="flex gap-2 mb-3">
              <input
                className={inp}
                value={newLocation}
                onChange={e => setNewLocation(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addLocation())}
                placeholder="Type a city and press Enter or Add"
              />
              <button type="button" onClick={addLocation} className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 flex items-center gap-1 shrink-0">
                <Plus className="w-4 h-4" /> Add
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {form.preferred_locations.map(l => (
                <span key={l} className="inline-flex items-center gap-1 px-3 py-1 bg-green-50 text-green-700 rounded-full text-sm">
                  {l}
                  <button type="button" onClick={() => removeLocation(l)} className="hover:text-red-500">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <input type="checkbox" id="paf-relocate" name="willing_to_relocate" checked={form.willing_to_relocate} onChange={handleChange} className="rounded" />
              <label htmlFor="paf-relocate" className="text-sm text-gray-600 cursor-pointer">Willing to relocate anywhere</label>
            </div>
            {errors.preferred_locations && <p className={err}>{errors.preferred_locations}</p>}
          </div>

          {/* Education */}
          <div className="bg-white rounded-2xl shadow-sm p-6 mb-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-gray-700">Education</h3>
              <button type="button" onClick={addEducation} className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1">
                <Plus className="w-3 h-3" /> Add
              </button>
            </div>
            {education.map((edu, i) => (
              <div key={i} className="border border-gray-100 rounded-xl p-4 mb-3">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-sm font-medium text-gray-500">Education {i + 1}</span>
                  {education.length > 1 && (
                    <button type="button" onClick={() => removeEducation(i)} className="text-gray-400 hover:text-red-500">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={lbl}>Degree</label>
                    <input className={inp} value={edu.degree} onChange={e => updateEducation(i, 'degree', e.target.value)} placeholder="e.g. B.Tech, MBA" />
                  </div>
                  <div>
                    <label className={lbl}>Field of Study</label>
                    <input className={inp} value={edu.field_of_study} onChange={e => updateEducation(i, 'field_of_study', e.target.value)} placeholder="e.g. Computer Science" />
                  </div>
                  <div>
                    <label className={lbl}>Institution</label>
                    <input className={inp} value={edu.institution} onChange={e => updateEducation(i, 'institution', e.target.value)} placeholder="College / University name" />
                  </div>
                  <div>
                    <label className={lbl}>Year of Passing</label>
                    <input className={inp} type="number" min="1950" max="2050" value={edu.to_year} onChange={e => updateEducation(i, 'to_year', e.target.value)} placeholder="e.g. 2022" />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Work Experience (for non-freshers) */}
          {!isFresher && (
            <div className="bg-white rounded-2xl shadow-sm p-6 mb-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-semibold text-gray-700">Work Experience</h3>
                <button type="button" onClick={addExperience} className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1">
                  <Plus className="w-3 h-3" /> Add
                </button>
              </div>
              {workExperience.map((exp, i) => (
                <div key={i} className="border border-gray-100 rounded-xl p-4 mb-3">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-sm font-medium text-gray-500">Experience {i + 1}</span>
                    {workExperience.length > 1 && (
                      <button type="button" onClick={() => removeExperience(i)} className="text-gray-400 hover:text-red-500">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className={lbl}>Company Name</label>
                      <input className={inp} value={exp.company_name} onChange={e => updateExperience(i, 'company_name', e.target.value)} placeholder="Company name" />
                    </div>
                    <div>
                      <label className={lbl}>Designation</label>
                      <input className={inp} value={exp.designation} onChange={e => updateExperience(i, 'designation', e.target.value)} placeholder="Your role/title" />
                    </div>
                    <div>
                      <label className={lbl}>Start Date</label>
                      <input className={inp} type="date" value={exp.start_date} onChange={e => updateExperience(i, 'start_date', e.target.value)} />
                    </div>
                    <div>
                      <label className={lbl}>End Date</label>
                      <input className={inp} type="date" value={exp.end_date} disabled={exp.is_current} onChange={e => updateExperience(i, 'end_date', e.target.value)} />
                      <div className="flex items-center gap-1 mt-1">
                        <input type="checkbox" checked={exp.is_current} onChange={e => updateExperience(i, 'is_current', e.target.checked)} className="rounded" />
                        <span className="text-xs text-gray-500">Currently working here</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Links & Summary */}
          <div className="bg-white rounded-2xl shadow-sm p-6 mb-5">
            <h3 className="text-base font-semibold text-gray-700 mb-4">Links & Summary</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className={lbl}>LinkedIn URL</label>
                <input className={inp} name="linkedin_url" value={form.linkedin_url} onChange={handleChange} placeholder="https://linkedin.com/in/..." />
              </div>
              <div>
                <label className={lbl}>Portfolio / GitHub URL</label>
                <input className={inp} name="portfolio_url" value={form.portfolio_url} onChange={handleChange} placeholder="https://..." />
              </div>
            </div>
            <div>
              <label className={lbl}>Professional Summary</label>
              <textarea className={inp} name="summary" rows={3} value={form.summary} onChange={handleChange} placeholder="Brief summary about yourself..." />
            </div>
          </div>

          {/* Resume Upload */}
          <div className="bg-white rounded-2xl shadow-sm p-6 mb-6">
            <h3 className="text-base font-semibold text-gray-700 mb-3">Resume Upload</h3>
            <p className="text-xs text-gray-400 mb-3">Accepted formats: PDF, DOC, DOCX (max 10 MB)</p>
            {resumeFile ? (
              <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                <Upload className="w-4 h-4 text-green-600" />
                <span className="text-sm text-green-700 flex-1 truncate">{resumeFile.name}</span>
                <button type="button" onClick={() => setResumeFile(null)} className="text-gray-400 hover:text-red-500">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors">
                <Upload className="w-6 h-6 text-gray-400 mb-1" />
                <span className="text-sm text-gray-500">Click to upload your resume</span>
                <input type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={handleResumeChange} />
              </label>
            )}
            {errors.resume && <p className={err}>{errors.resume}</p>}
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm transition-colors"
          >
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting...</> : 'Submit Application'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default PublicApplyForm
