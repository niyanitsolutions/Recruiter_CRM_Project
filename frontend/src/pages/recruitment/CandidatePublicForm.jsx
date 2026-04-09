import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { CheckCircle, XCircle, Loader2, Plus, Trash2, Upload } from 'lucide-react'
import api from '../../services/api'
import candidateService from '../../services/candidateService'

const EMPTY_EDU = () => ({ degree: '', field_of_study: '', institution: '', from_year: '', to_year: '', percentage: '' })
const EMPTY_EXP = () => ({ company_name: '', designation: '', start_date: '', end_date: '', is_current: false })

/**
 * Public candidate self-registration form (opened via /apply/:token).
 * No auth required. Validates token on mount, submits to backend.
 */
const CandidatePublicForm = () => {
  const { token } = useParams()
  const [status, setStatus] = useState('loading') // loading | valid | invalid | submitted
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [newSkill, setNewSkill] = useState('')
  const [newLocation, setNewLocation] = useState('')
  const [isFresher, setIsFresher] = useState(false)
  const [errors, setErrors] = useState({})
  const [resumeFile, setResumeFile] = useState(null)

  // Array states
  const [education, setEducation] = useState([EMPTY_EDU()])
  const [workExperience, setWorkExperience] = useState([EMPTY_EXP()])

  // Refs for scroll-to-error
  const resumeRef = useRef(null)
  const genderRef = useRef(null)
  const dobRef = useRef(null)
  const educationRef = useRef(null)
  const skillsRef = useRef(null)
  const locationsRef = useRef(null)
  const professionalRef = useRef(null)

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
    current_ctc: '',
    expected_ctc: '',
    notice_period: 'immediate',
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

  const set = (field, value) => {
    setForm(f => ({ ...f, [field]: value }))
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }))
  }

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    set(name, type === 'checkbox' ? checked : value)
  }

  // Education helpers
  const updateEducation = (index, field, value) => {
    setEducation(prev => prev.map((e, i) => i === index ? { ...e, [field]: value } : e))
    if (errors.education) setErrors(prev => ({ ...prev, education: '' }))
  }
  const addEducation = () => setEducation(prev => [...prev, EMPTY_EDU()])
  const removeEducation = (index) => {
    if (education.length === 1) return
    setEducation(prev => prev.filter((_, i) => i !== index))
  }

  // Work experience helpers
  const updateExperience = (index, field, value) => {
    setWorkExperience(prev => prev.map((e, i) => {
      if (i !== index) return e
      const updated = { ...e, [field]: value }
      if (field === 'is_current' && value) updated.end_date = ''
      return updated
    }))
    if (errors.work_experience) setErrors(prev => ({ ...prev, work_experience: '' }))
  }
  const addExperience = () => setWorkExperience(prev => [...prev, EMPTY_EXP()])
  const removeExperience = (index) => {
    if (workExperience.length === 1) return
    setWorkExperience(prev => prev.filter((_, i) => i !== index))
  }

  const addSkill = () => {
    const s = newSkill.trim()
    if (s && !form.skills.includes(s)) {
      set('skills', [...form.skills, s])
      if (errors.skills) setErrors(prev => ({ ...prev, skills: '' }))
    }
    setNewSkill('')
  }
  const removeSkill = (s) => set('skills', form.skills.filter(x => x !== s))

  const addLocation = () => {
    const l = newLocation.trim()
    if (l && !form.preferred_locations.includes(l)) {
      set('preferred_locations', [...form.preferred_locations, l])
      if (errors.preferred_locations) setErrors(prev => ({ ...prev, preferred_locations: '' }))
    }
    setNewLocation('')
  }
  const removeLocation = (l) => set('preferred_locations', form.preferred_locations.filter(x => x !== l))

  const handleResumeChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const allowed = ['.pdf', '.doc', '.docx']
    const ext = '.' + file.name.split('.').pop().toLowerCase()
    if (!allowed.includes(ext)) {
      setErrors(prev => ({ ...prev, resume: 'Only PDF, DOC, or DOCX files are allowed' }))
      e.target.value = ''
      return
    }
    setResumeFile(file)
    if (errors.resume) setErrors(prev => ({ ...prev, resume: '' }))

    try {
      setParsing(true)
      const res = await candidateService.parseResumeFilePublic(file)
      if (res.data) {
        const p = res.data
        setForm(prev => ({
          ...prev,
          first_name: p.first_name || prev.first_name,
          last_name: p.last_name || prev.last_name,
          email: p.email || prev.email,
          mobile: p.mobile || prev.mobile,
          skills: p.skills?.length ? p.skills : prev.skills,
          current_city: p.current_city || prev.current_city,
          total_experience_years: p.experience_years != null ? String(p.experience_years) : prev.total_experience_years,
        }))
        if (p.education_degree || p.institution || p.graduation_year) {
          setEducation(prev => prev.map((e, i) => i === 0 ? {
            ...e,
            degree: p.education_degree || e.degree,
            institution: p.institution || e.institution,
            to_year: p.graduation_year ? String(p.graduation_year) : e.to_year
          } : e))
        }
        if (p.current_company || p.current_designation) {
          setWorkExperience(prev => prev.map((e, i) => i === 0 ? {
            ...e,
            company_name: p.current_company || e.company_name,
            designation: p.current_designation || e.designation,
            is_current: true
          } : e))
        }
      }
    } catch {
      // non-fatal
    } finally {
      setParsing(false)
    }
  }

  const validate = () => {
    const errs = {}
    if (!resumeFile) errs.resume = 'Resume is required'
    if (!form.gender) errs.gender = 'Gender is required'
    if (!form.date_of_birth) errs.date_of_birth = 'Date of birth is required'
    const firstEdu = education[0]
    if (!firstEdu?.degree) errs.education = 'Degree is required'
    else if (!firstEdu?.from_year) errs.education = 'From Year is required for education'
    else if (!firstEdu?.to_year) errs.education = 'To Year is required for education'
    if (form.skills.length === 0) errs.skills = 'At least one skill is required'
    if (form.preferred_locations.length === 0) errs.preferred_locations = 'At least one preferred location is required'
    if (!isFresher) {
      const firstExp = workExperience[0]
      if (!firstExp?.company_name?.trim()) errs.work_experience = 'Company name is required'
      else if (!firstExp?.designation?.trim()) errs.work_experience = 'Designation is required'
    }
    return errs
  }

  const scrollToFirstError = (errs) => {
    const order = [
      { key: 'resume', ref: resumeRef },
      { key: 'gender', ref: genderRef },
      { key: 'date_of_birth', ref: dobRef },
      { key: 'education', ref: educationRef },
      { key: 'skills', ref: skillsRef },
      { key: 'preferred_locations', ref: locationsRef },
      { key: 'work_experience', ref: professionalRef },
    ]
    for (const { key, ref } of order) {
      if (errs[key] && ref?.current) {
        ref.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
        break
      }
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.first_name.trim() || !form.email.trim()) {
      setError('First name and email are required.'); return
    }
    if (form.mobile && !/^[6-9]\d{9}$/.test(form.mobile.replace(/\D/g, ''))) {
      setError('Mobile number must start with 6–9 and be 10 digits.'); return
    }

    const validationErrors = validate()
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors)
      scrollToFirstError(validationErrors)
      setError(`Please fill in all required fields (${Object.keys(validationErrors).length} missing)`)
      return
    }
    setErrors({})
    setError('')

    try {
      setSaving(true)

      const toInt = (v) => (v !== '' && v !== null && v !== undefined) ? parseInt(v, 10) : null
      const toFloat = (v) => (v !== '' && v !== null && v !== undefined) ? Number(v) : null

      const eduPayload = education
        .filter(e => e.degree)
        .map(e => ({
          degree: e.degree,
          field_of_study: e.field_of_study || null,
          institution: e.institution || null,
          from_year: toInt(e.from_year),
          to_year: toInt(e.to_year),
          year_of_passing: toInt(e.to_year),
          percentage: toFloat(e.percentage)
        }))

      const expPayload = isFresher ? [] : workExperience
        .filter(e => e.company_name)
        .map(e => ({
          company_name: e.company_name,
          designation: e.designation || null,
          start_date: e.start_date || null,
          end_date: e.is_current ? null : (e.end_date || null),
          is_current: e.is_current || false
        }))

      const currentExp = expPayload.find(e => e.is_current) || expPayload[expPayload.length - 1]

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
        total_experience_years: isFresher ? 0 : (form.total_experience_years !== '' ? Number(form.total_experience_years) : null),
        current_company: isFresher ? null : (currentExp?.company_name || null),
        current_designation: isFresher ? null : (currentExp?.designation || null),
        current_ctc: toFloat(form.current_ctc),
        expected_ctc: toFloat(form.expected_ctc),
        notice_period: isFresher ? 'immediate' : (form.notice_period || null),
        skills: form.skills.map(s => ({ name: s })),
        skill_tags: form.skills,
        education: eduPayload,
        work_experience: expPayload,
        preferred_locations: form.preferred_locations,
        willing_to_relocate: form.willing_to_relocate,
        linkedin_url: form.linkedin_url.trim() || null,
        portfolio_url: form.portfolio_url.trim() || null,
        summary: form.summary.trim() || null,
        source: 'form_link',
      }

      const submitRes = await api.post(`/public/candidate-form/${token}`, payload)
      const candidateId = submitRes.data?.candidate_id

      if (resumeFile && candidateId) {
        try {
          await candidateService.uploadResumePublic(token, candidateId, resumeFile)
        } catch {
          // Resume upload failure is non-fatal
        }
      }

      setStatus('submitted')
    } catch (err) {
      setError(err.response?.data?.detail || 'Submission failed. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-full px-3 py-2 border border-surface-300 rounded-lg text-sm focus:ring-2 focus:ring-accent-500 focus:border-accent-500 focus:outline-none'
  const inputErrCls = (field) => errors[field]
    ? 'w-full px-3 py-2 border border-red-400 rounded-lg text-sm focus:ring-2 focus:ring-red-400 focus:border-red-400 focus:outline-none'
    : inputCls
  const labelCls = 'block text-sm font-medium text-surface-700 mb-1'
  const errCls = 'text-red-500 text-xs mt-1'

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

          {/* Resume Upload */}
          <div ref={resumeRef} className="bg-white rounded-xl shadow-sm border border-surface-100 p-6">
            <h2 className="text-base font-semibold text-surface-900 mb-1">Resume <span className="text-red-500">*</span></h2>
            <p className="text-xs text-surface-400 mb-4">Upload your resume to auto-fill the form fields below</p>
            {resumeFile && (
              <div className="flex items-center gap-3 p-3 bg-surface-50 rounded-lg border border-surface-200 mb-3">
                <Upload className="w-5 h-5 text-accent-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-surface-700 truncate">{resumeFile.name}</p>
                  {parsing && <p className="text-xs text-accent-600">Parsing resume…</p>}
                </div>
                <button type="button" onClick={() => { setResumeFile(null); setErrors(prev => ({ ...prev, resume: 'Resume is required' })) }}
                  className="text-xs text-red-500 hover:text-red-700 font-medium flex-shrink-0">Remove</button>
              </div>
            )}
            {parsing && !resumeFile && <p className="text-xs text-accent-600 mb-2 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" />Parsing resume…</p>}
            <input type="file" accept=".pdf,.doc,.docx" onChange={handleResumeChange}
              className={`block w-full text-sm text-surface-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-accent-50 file:text-accent-700 hover:file:bg-accent-100 ${errors.resume ? 'border border-red-400 rounded-lg p-1' : ''}`} />
            <p className="text-xs text-surface-400 mt-1">PDF, DOC, DOCX — max 5 MB</p>
            {errors.resume && <p className={errCls}>{errors.resume}</p>}
          </div>

          {/* Basic Information */}
          <div className="bg-white rounded-xl shadow-sm border border-surface-100 p-6">
            <h2 className="text-base font-semibold text-surface-900 mb-4">Basic Information</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>First Name <span className="text-red-500">*</span></label>
                <input name="first_name" value={form.first_name} onChange={handleChange} className={inputCls} placeholder="John" required />
              </div>
              <div>
                <label className={labelCls}>Last Name</label>
                <input name="last_name" value={form.last_name} onChange={handleChange} className={inputCls} placeholder="Doe" />
              </div>
              <div>
                <label className={labelCls}>Email <span className="text-red-500">*</span></label>
                <input type="email" name="email" value={form.email} onChange={handleChange} className={inputCls} placeholder="john@example.com" required />
              </div>
              <div>
                <label className={labelCls}>Mobile <span className="text-red-500">*</span></label>
                <input type="tel" name="mobile" value={form.mobile} onChange={handleChange} className={inputCls} placeholder="9876543210" />
              </div>
              <div>
                <label className={labelCls}>Alternate Mobile</label>
                <input type="tel" name="alternate_mobile" value={form.alternate_mobile} onChange={handleChange} className={inputCls} placeholder="9876543210" />
              </div>
              <div ref={dobRef}>
                <label className={labelCls}>Date of Birth <span className="text-red-500">*</span></label>
                <input type="date" name="date_of_birth" value={form.date_of_birth} onChange={handleChange} className={inputErrCls('date_of_birth')} />
                {errors.date_of_birth && <p className={errCls}>{errors.date_of_birth}</p>}
              </div>
              <div ref={genderRef}>
                <label className={labelCls}>Gender <span className="text-red-500">*</span></label>
                <select name="gender" value={form.gender} onChange={handleChange} className={inputErrCls('gender')}>
                  <option value="">Select</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
                {errors.gender && <p className={errCls}>{errors.gender}</p>}
              </div>
              <div>
                <label className={labelCls}>Current City</label>
                <input name="current_city" value={form.current_city} onChange={handleChange} className={inputCls} placeholder="Mumbai" />
              </div>
              <div>
                <label className={labelCls}>Current State</label>
                <input name="current_state" value={form.current_state} onChange={handleChange} className={inputCls} placeholder="Maharashtra" />
              </div>
            </div>
          </div>

          {/* I am a fresher */}
          <div className="bg-white rounded-xl shadow-sm border border-surface-100 p-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={isFresher} onChange={e => setIsFresher(e.target.checked)}
                className="w-4 h-4 rounded border-surface-300 text-accent-600" />
              <span className="text-sm font-medium text-surface-700">I am a Fresher (no professional experience)</span>
            </label>
            {isFresher && <p className="text-xs text-surface-400 mt-1 ml-7">Professional / Work Experience section will be skipped</p>}
          </div>

          {/* Work Experience */}
          {!isFresher && (
            <div ref={professionalRef} className="bg-white rounded-xl shadow-sm border border-surface-100 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-surface-900">Work Experience <span className="text-red-500">*</span></h2>
                <button type="button" onClick={addExperience}
                  className="flex items-center gap-1 text-sm text-accent-600 hover:text-accent-800 font-medium">
                  <Plus className="w-4 h-4" /> Add
                </button>
              </div>
              {errors.work_experience && <p className={`${errCls} mb-3`}>{errors.work_experience}</p>}
              <div className="space-y-4">
                {workExperience.map((exp, index) => (
                  <div key={index} className="border border-surface-200 rounded-lg p-4 relative">
                    {workExperience.length > 1 && (
                      <button type="button" onClick={() => removeExperience(index)}
                        className="absolute top-3 right-3 text-red-400 hover:text-red-600">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className={labelCls}>Company {index === 0 && <span className="text-red-500">*</span>}</label>
                        <input value={exp.company_name}
                          onChange={e => updateExperience(index, 'company_name', e.target.value)}
                          className={inputCls} placeholder="e.g., Infosys" />
                      </div>
                      <div>
                        <label className={labelCls}>Designation {index === 0 && <span className="text-red-500">*</span>}</label>
                        <input value={exp.designation}
                          onChange={e => updateExperience(index, 'designation', e.target.value)}
                          className={inputCls} placeholder="e.g., Software Engineer" />
                      </div>
                      <div>
                        <label className={labelCls}>Start Date</label>
                        <input type="date" value={exp.start_date}
                          onChange={e => updateExperience(index, 'start_date', e.target.value)}
                          className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>End Date</label>
                        <input type="date" value={exp.end_date} disabled={exp.is_current}
                          onChange={e => updateExperience(index, 'end_date', e.target.value)}
                          className={`${inputCls} ${exp.is_current ? 'opacity-50' : ''}`} />
                      </div>
                    </div>
                    <label className="flex items-center gap-2 mt-3">
                      <input type="checkbox" checked={exp.is_current}
                        onChange={e => updateExperience(index, 'is_current', e.target.checked)}
                        className="rounded border-surface-300 text-accent-600" />
                      <span className="text-sm text-surface-600">Currently working here</span>
                    </label>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4 pt-4 border-t border-surface-100">
                <div>
                  <label className={labelCls}>Total Experience (Years)</label>
                  <input type="number" name="total_experience_years" value={form.total_experience_years}
                    onChange={handleChange} className={inputCls} min="0" max="50" placeholder="0" />
                </div>
                <div>
                  <label className={labelCls}>Current CTC (LPA)</label>
                  <input type="number" name="current_ctc" value={form.current_ctc} onChange={handleChange} className={inputCls} step="0.1" min="0" />
                </div>
                <div>
                  <label className={labelCls}>Expected CTC (LPA)</label>
                  <input type="number" name="expected_ctc" value={form.expected_ctc} onChange={handleChange} className={inputCls} step="0.1" min="0" />
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
          )}

          {/* Skills */}
          <div ref={skillsRef} className="bg-white rounded-xl shadow-sm border border-surface-100 p-6">
            <h2 className="text-base font-semibold text-surface-900 mb-1">Skills <span className="text-red-500">*</span></h2>
            {errors.skills && <p className={`${errCls} mb-3`}>{errors.skills}</p>}
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
          <div ref={educationRef} className="bg-white rounded-xl shadow-sm border border-surface-100 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-surface-900">Education <span className="text-red-500">*</span></h2>
              <button type="button" onClick={addEducation}
                className="flex items-center gap-1 text-sm text-accent-600 hover:text-accent-800 font-medium">
                <Plus className="w-4 h-4" /> Add
              </button>
            </div>
            {errors.education && <p className={`${errCls} mb-3`}>{errors.education}</p>}
            <div className="space-y-4">
              {education.map((edu, index) => (
                <div key={index} className="border border-surface-200 rounded-lg p-4 relative">
                  {education.length > 1 && (
                    <button type="button" onClick={() => removeEducation(index)}
                      className="absolute top-3 right-3 text-red-400 hover:text-red-600">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>Degree {index === 0 && <span className="text-red-500">*</span>}</label>
                      <select value={edu.degree} onChange={e => updateEducation(index, 'degree', e.target.value)}
                        className={inputCls}>
                        <option value="">Select</option>
                        <option value="High School">High School</option>
                        <option value="Diploma">Diploma</option>
                        <option value="Bachelor's">Bachelor's Degree</option>
                        <option value="Master's">Master's Degree</option>
                        <option value="PhD">PhD</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>Field of Study</label>
                      <input value={edu.field_of_study}
                        onChange={e => updateEducation(index, 'field_of_study', e.target.value)}
                        className={inputCls} placeholder="e.g. Computer Science" />
                    </div>
                    <div>
                      <label className={labelCls}>University / College</label>
                      <input value={edu.institution}
                        onChange={e => updateEducation(index, 'institution', e.target.value)}
                        className={inputCls} placeholder="e.g. Anna University" />
                    </div>
                    <div>
                      <label className={labelCls}>Percentage / CGPA</label>
                      <input type="number" value={edu.percentage}
                        onChange={e => updateEducation(index, 'percentage', e.target.value)}
                        className={inputCls} step="0.01" min="0" max="100" placeholder="e.g. 72.5" />
                    </div>
                    <div>
                      <label className={labelCls}>From Year {index === 0 && <span className="text-red-500">*</span>}</label>
                      <input type="number" value={edu.from_year}
                        onChange={e => updateEducation(index, 'from_year', e.target.value)}
                        className={inputCls} min="1970" max="2030" placeholder="e.g. 2018" />
                    </div>
                    <div>
                      <label className={labelCls}>To Year {index === 0 && <span className="text-red-500">*</span>}</label>
                      <input type="number" value={edu.to_year}
                        onChange={e => updateEducation(index, 'to_year', e.target.value)}
                        className={inputCls} min="1970" max="2030" placeholder="e.g. 2022" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Preferred Locations */}
          <div ref={locationsRef} className="bg-white rounded-xl shadow-sm border border-surface-100 p-6">
            <h2 className="text-base font-semibold text-surface-900 mb-1">Preferred Locations <span className="text-red-500">*</span></h2>
            {errors.preferred_locations && <p className={`${errCls} mb-3`}>{errors.preferred_locations}</p>}
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
              <input type="checkbox" name="willing_to_relocate" checked={form.willing_to_relocate} onChange={handleChange} className="rounded" />
              <span className="text-sm text-surface-600">Willing to relocate</span>
            </label>
          </div>

          {/* Additional Information */}
          <div className="bg-white rounded-xl shadow-sm border border-surface-100 p-6">
            <h2 className="text-base font-semibold text-surface-900 mb-4">Additional Information</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className={labelCls}>LinkedIn URL</label>
                <input type="url" name="linkedin_url" value={form.linkedin_url} onChange={handleChange} className={inputCls} placeholder="https://linkedin.com/in/..." />
              </div>
              <div>
                <label className={labelCls}>Portfolio URL</label>
                <input type="url" name="portfolio_url" value={form.portfolio_url} onChange={handleChange} className={inputCls} placeholder="https://..." />
              </div>
            </div>
            <div>
              <label className={labelCls}>Brief Summary</label>
              <textarea name="summary" value={form.summary} onChange={handleChange} rows={4} className={inputCls} placeholder="Brief description of your background..." />
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
