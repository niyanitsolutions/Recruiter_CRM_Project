import React, { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { User, ArrowLeft, Save, Plus, Trash2, Sparkles, Upload } from 'lucide-react'
import { toast } from 'react-hot-toast'
import candidateService from '../../services/candidateService'

const CandidateForm = () => {
  const navigate = useNavigate()
  const { id } = useParams()
  const isEdit = Boolean(id)

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [resumeUploading, setResumeUploading] = useState(false)
  const [statuses, setStatuses] = useState([])
  const [sources, setSources] = useState([])
  const [noticePeriods, setNoticePeriods] = useState([])
  const [resumeText, setResumeText] = useState('')
  const [showResumeParser, setShowResumeParser] = useState(false)
  const [pendingResumeFile, setPendingResumeFile] = useState(null)

  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    mobile: '',
    alternate_mobile: '',
    date_of_birth: '',
    gender: '',
    current_city: '',
    current_state: '',
    preferred_locations: [],
    willing_to_relocate: false,
    total_experience_years: 0,
    total_experience_months: 0,
    current_company: '',
    current_designation: '',
    current_ctc: '',
    expected_ctc: '',
    notice_period: 'immediate',
    last_working_day: '',
    highest_education: '',
    specialization: '',
    university: '',
    graduation_year: '',
    skills: [],
    certifications: [],
    percentage: '',
    source: 'direct',
    linkedin_url: '',
    portfolio_url: '',
    summary: '',
    status: 'active'
  })

  const [newSkill, setNewSkill] = useState('')
  const [newLocation, setNewLocation] = useState('')

  useEffect(() => {
    loadDropdowns()
    if (isEdit) {
      loadCandidate()
    }
  }, [id])

  const loadDropdowns = async () => {
    try {
      const [statusRes, sourceRes, noticeRes] = await Promise.all([
        candidateService.getStatuses(),
        candidateService.getSources(),
        candidateService.getNoticePeriods()
      ])
      setStatuses(statusRes.data || [])
      setSources(sourceRes.data || [])
      setNoticePeriods(noticeRes.data || [])
    } catch (error) {
      console.error('Error loading dropdowns:', error)
    }
  }

  const loadCandidate = async () => {
    try {
      setLoading(true)
      const response = await candidateService.getCandidate(id)
      if (response.data) {
        const data = response.data
        const edu = data.education?.[0] || {}
        setFormData(prev => ({
          ...prev,
          ...data,
          skills: data.skill_tags || [],
          preferred_locations: data.preferred_locations || [],
          percentage: data.percentage ?? '',
          summary: data.notes || '',
          highest_education: edu.degree || '',
          specialization: edu.field_of_study || '',
          university: edu.institution || '',
          graduation_year: edu.year_of_passing || ''
        }))
      }
    } catch (error) {
      toast.error('Failed to load candidate')
      navigate('/candidates')
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }))
  }

  const addSkill = () => {
    if (newSkill.trim() && !formData.skills.includes(newSkill.trim())) {
      setFormData(prev => ({
        ...prev,
        skills: [...prev.skills, newSkill.trim()]
      }))
      setNewSkill('')
    }
  }

  const removeSkill = (skill) => {
    setFormData(prev => ({
      ...prev,
      skills: prev.skills.filter(s => s !== skill)
    }))
  }

  const addLocation = () => {
    if (newLocation.trim() && !formData.preferred_locations.includes(newLocation.trim())) {
      setFormData(prev => ({
        ...prev,
        preferred_locations: [...prev.preferred_locations, newLocation.trim()]
      }))
      setNewLocation('')
    }
  }

  const removeLocation = (location) => {
    setFormData(prev => ({
      ...prev,
      preferred_locations: prev.preferred_locations.filter(l => l !== location)
    }))
  }

  const handleResumeUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const allowed = ['.pdf', '.doc', '.docx']
    const ext = '.' + file.name.split('.').pop().toLowerCase()
    if (!allowed.includes(ext)) {
      toast.error('Only PDF, DOC, or DOCX files are allowed')
      e.target.value = ''
      return
    }
    if (!isEdit) {
      setPendingResumeFile(file)
      // Auto-parse the resume to pre-fill the form
      try {
        setParsing(true)
        const res = await candidateService.parseResumeFile(file)
        if (res.data) {
          const p = res.data
          setFormData(prev => ({
            ...prev,
            first_name: p.first_name || prev.first_name,
            last_name: p.last_name || prev.last_name,
            email: p.email || prev.email,
            mobile: p.mobile || prev.mobile,
            skills: p.skills?.length ? p.skills : prev.skills,
          }))
          if (p.first_name || p.email) toast.success('Resume parsed — form auto-filled')
          if (p.raw_text) setResumeText(p.raw_text)
        }
      } catch {
        // Parsing failure is non-fatal — user still has the file set
      } finally {
        setParsing(false)
      }
      return
    }
    try {
      setResumeUploading(true)
      const res = await candidateService.uploadResume(id, file)
      setFormData(prev => ({ ...prev, resume_url: res.data?.resume_url }))
      toast.success('Resume uploaded successfully')
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to upload resume')
    } finally {
      setResumeUploading(false)
      e.target.value = ''
    }
  }

  const handleParseResume = async () => {
    if (!resumeText.trim()) {
      toast.error('Please paste resume text')
      return
    }

    try {
      setParsing(true)
      const response = await candidateService.parseResume(resumeText, isEdit ? id : null)
      
      if (response.data) {
        const parsed = response.data
        setFormData(prev => ({
          ...prev,
          first_name: parsed.first_name || prev.first_name,
          last_name: parsed.last_name || prev.last_name,
          email: parsed.email || prev.email,
          mobile: parsed.mobile || prev.mobile,
          skills: parsed.skills || prev.skills,
          total_experience_years: parsed.experience_years || prev.total_experience_years,
          current_company: parsed.current_company || prev.current_company,
          current_designation: parsed.current_designation || prev.current_designation,
          summary: parsed.summary || prev.summary
        }))
        toast.success(`Resume parsed with ${response.data.confidence || 0}% confidence`)
        setShowResumeParser(false)
      }
    } catch (error) {
      toast.error('Failed to parse resume')
    } finally {
      setParsing(false)
    }
  }

  const MOBILE_RE = /^[6-9]\d{9}$/

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!formData.first_name.trim() || !formData.email.trim()) {
      toast.error('First name and email are required')
      return
    }

    if (!formData.mobile) {
      toast.error('Mobile number is required')
      return
    }
    if (!MOBILE_RE.test(formData.mobile.replace(/\D/g, ''))) {
      toast.error('Mobile number must start with 6–9 and be 10 digits.')
      return
    }
    if (formData.alternate_mobile && !MOBILE_RE.test(formData.alternate_mobile.replace(/\D/g, ''))) {
      toast.error('Alternate mobile must start with 6–9 and be 10 digits.')
      return
    }

    try {
      setSaving(true)

      // Helper: empty string → null for numeric fields
      const toFloat = (v) => (v !== '' && v !== null && v !== undefined) ? Number(v) : null
      const toInt = (v) => (v !== '' && v !== null && v !== undefined) ? parseInt(v, 10) : null

      // Build education array from flat form fields
      const education = formData.highest_education ? [{
        degree: formData.highest_education,
        field_of_study: formData.specialization || null,
        institution: formData.university || 'Not specified',
        year_of_passing: toInt(formData.graduation_year)
      }] : []

      const payload = {
        first_name: formData.first_name,
        last_name: formData.last_name || null,
        email: formData.email,
        mobile: formData.mobile,
        alternate_mobile: formData.alternate_mobile || null,
        // Empty string → null so Pydantic Optional[date] doesn't choke
        date_of_birth: formData.date_of_birth || null,
        gender: formData.gender || null,
        current_city: formData.current_city || null,
        current_state: formData.current_state || null,
        total_experience_years: toFloat(formData.total_experience_years),
        total_experience_months: toInt(formData.total_experience_months),
        current_company: formData.current_company || null,
        current_designation: formData.current_designation || null,
        // Empty string → null so Pydantic Optional[float] doesn't choke
        current_ctc: toFloat(formData.current_ctc),
        expected_ctc: toFloat(formData.expected_ctc),
        notice_period: formData.notice_period || null,
        // Convert string[] → SkillItem[] so Pydantic List[SkillItem] validates
        skills: formData.skills.map(s => ({ name: s })),
        skill_tags: formData.skills,
        education,
        source: formData.source,
        notes: formData.summary || null,
        preferred_locations: formData.preferred_locations,
        willing_to_relocate: formData.willing_to_relocate,
        percentage: toFloat(formData.percentage),
        status: formData.status,
        tags: []
      }

      if (isEdit) {
        await candidateService.updateCandidate(id, payload)
        toast.success('Candidate updated successfully')
      } else {
        const res = await candidateService.createCandidate(payload)
        const newId = res.data?.id || res.data?._id
        if (pendingResumeFile && newId) {
          try {
            await candidateService.uploadResume(newId, pendingResumeFile)
          } catch {
            toast.success('Candidate created successfully')
            toast.error('Resume upload failed — you can upload it from the edit form')
            navigate('/candidates')
            return
          }
        }
        toast.success('Candidate created successfully')
      }

      navigate('/candidates')
    } catch (error) {
      console.error('Candidate save error:', error?.response?.data ?? error)
      const detail = error?.response?.data?.detail
      let message
      if (Array.isArray(detail)) {
        message = detail.map(d => d.msg?.replace('Value error, ', '') || JSON.stringify(d)).join('; ')
      } else if (typeof detail === 'string') {
        message = detail
      } else {
        message = error?.response?.data?.message || error?.message || 'Failed to save candidate'
      }
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="animate-spin w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full"></div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/candidates')}
            className="p-2 hover:bg-surface-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-surface-900">
              {isEdit ? 'Edit Candidate' : 'Add Candidate'}
            </h1>
            <p className="text-surface-500">
              {isEdit ? 'Update candidate profile' : 'Create a new candidate profile'}
            </p>
          </div>
        </div>
        
        <button
          onClick={() => setShowResumeParser(!showResumeParser)}
          className="btn-secondary flex items-center gap-2"
        >
          <Sparkles className="w-4 h-4" />
          AI Resume Parser
        </button>
      </div>

      {/* Resume Parser */}
      {showResumeParser && (
        <div className="bg-gradient-to-r from-accent-50 to-primary-50 rounded-xl border border-accent-200 p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="w-5 h-5 text-accent-600" />
            <h2 className="text-lg font-semibold text-surface-900">AI Resume Parser</h2>
          </div>
          <p className="text-sm text-surface-600 mb-4">
            Paste the resume text below and our AI will extract candidate information automatically.
          </p>
          <textarea
            value={resumeText}
            onChange={(e) => setResumeText(e.target.value)}
            className="input w-full h-48 mb-4"
            placeholder="Paste resume text here..."
          />
          <div className="flex justify-end gap-3">
            <button
              onClick={() => setShowResumeParser(false)}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              onClick={handleParseResume}
              disabled={parsing}
              className="btn-primary flex items-center gap-2"
            >
              {parsing ? (
                <>
                  <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>
                  Parsing...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Parse Resume
                </>
              )}
            </button>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Information */}
        <div className="bg-white rounded-xl shadow-sm border border-surface-200 p-6">
          <h2 className="text-lg font-semibold text-surface-900 mb-4">Basic Information</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                First Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="first_name"
                value={formData.first_name}
                onChange={handleChange}
                className="input w-full"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Last Name
              </label>
              <input
                type="text"
                name="last_name"
                value={formData.last_name}
                onChange={handleChange}
                className="input w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Email <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                className="input w-full"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Mobile <span className="text-red-500">*</span>
              </label>
              <input
                type="tel"
                name="mobile"
                value={formData.mobile}
                onChange={handleChange}
                className="input w-full"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Alternate Mobile
              </label>
              <input
                type="tel"
                name="alternate_mobile"
                value={formData.alternate_mobile}
                onChange={handleChange}
                className="input w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Date of Birth
              </label>
              <input
                type="date"
                name="date_of_birth"
                value={formData.date_of_birth}
                onChange={handleChange}
                className="input w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Gender
              </label>
              <select
                name="gender"
                value={formData.gender}
                onChange={handleChange}
                className="input w-full"
              >
                <option value="">Select</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Current City
              </label>
              <input
                type="text"
                name="current_city"
                value={formData.current_city}
                onChange={handleChange}
                className="input w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Source
              </label>
              <select
                name="source"
                value={formData.source}
                onChange={handleChange}
                className="input w-full"
              >
                {sources.map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Professional Information */}
        <div className="bg-white rounded-xl shadow-sm border border-surface-200 p-6">
          <h2 className="text-lg font-semibold text-surface-900 mb-4">Professional Information</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Total Experience (Years)
              </label>
              <input
                type="number"
                name="total_experience_years"
                value={formData.total_experience_years}
                onChange={handleChange}
                className="input w-full"
                min="0"
                max="50"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Current Company
              </label>
              <input
                type="text"
                name="current_company"
                value={formData.current_company}
                onChange={handleChange}
                className="input w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Current Designation
              </label>
              <input
                type="text"
                name="current_designation"
                value={formData.current_designation}
                onChange={handleChange}
                className="input w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Current CTC (LPA)
              </label>
              <input
                type="number"
                name="current_ctc"
                value={formData.current_ctc}
                onChange={handleChange}
                className="input w-full"
                step="0.1"
                min="0"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Expected CTC (LPA)
              </label>
              <input
                type="number"
                name="expected_ctc"
                value={formData.expected_ctc}
                onChange={handleChange}
                className="input w-full"
                step="0.1"
                min="0"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Notice Period
              </label>
              <select
                name="notice_period"
                value={formData.notice_period}
                onChange={handleChange}
                className="input w-full"
              >
                {noticePeriods.map(n => (
                  <option key={n.value} value={n.value}>{n.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Skills */}
        <div className="bg-white rounded-xl shadow-sm border border-surface-200 p-6">
          <h2 className="text-lg font-semibold text-surface-900 mb-4">Skills</h2>
          
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={newSkill}
              onChange={(e) => setNewSkill(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addSkill())}
              className="input flex-1"
              placeholder="Add a skill..."
            />
            <button
              type="button"
              onClick={addSkill}
              className="btn-secondary"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
          
          <div className="flex flex-wrap gap-2">
            {formData.skills.map((skill, index) => (
              <span
                key={index}
                className="px-3 py-1 bg-primary-100 text-primary-700 rounded-full text-sm flex items-center gap-2"
              >
                {skill}
                <button
                  type="button"
                  onClick={() => removeSkill(skill)}
                  className="hover:text-primary-900"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </span>
            ))}
            {formData.skills.length === 0 && (
              <p className="text-surface-500 text-sm">No skills added</p>
            )}
          </div>
        </div>

        {/* Education */}
        <div className="bg-white rounded-xl shadow-sm border border-surface-200 p-6">
          <h2 className="text-lg font-semibold text-surface-900 mb-4">Education</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Highest Education
              </label>
              <select
                name="highest_education"
                value={formData.highest_education}
                onChange={handleChange}
                className="input w-full"
              >
                <option value="">Select</option>
                <option value="high_school">High School</option>
                <option value="diploma">Diploma</option>
                <option value="bachelors">Bachelor's Degree</option>
                <option value="masters">Master's Degree</option>
                <option value="phd">PhD</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Specialization
              </label>
              <input
                type="text"
                name="specialization"
                value={formData.specialization}
                onChange={handleChange}
                className="input w-full"
                placeholder="e.g., Computer Science"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                University/College
              </label>
              <input
                type="text"
                name="university"
                value={formData.university}
                onChange={handleChange}
                className="input w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Graduation Year
              </label>
              <input
                type="number"
                name="graduation_year"
                value={formData.graduation_year}
                onChange={handleChange}
                className="input w-full"
                min="1970"
                max="2030"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Aggregate Percentage / CGPA (%)
              </label>
              <input
                type="number"
                name="percentage"
                value={formData.percentage}
                onChange={handleChange}
                className="input w-full"
                step="0.01"
                min="0"
                max="100"
                placeholder="e.g. 72.5"
              />
              <p className="text-xs text-surface-400 mt-1">Used for eligibility matching</p>
            </div>
          </div>
        </div>

        {/* Preferred Locations */}
        <div className="bg-white rounded-xl shadow-sm border border-surface-200 p-6">
          <h2 className="text-lg font-semibold text-surface-900 mb-4">Preferred Locations</h2>
          
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={newLocation}
              onChange={(e) => setNewLocation(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addLocation())}
              className="input flex-1"
              placeholder="Add a location..."
            />
            <button
              type="button"
              onClick={addLocation}
              className="btn-secondary"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
          
          <div className="flex flex-wrap gap-2 mb-4">
            {formData.preferred_locations.map((location, index) => (
              <span
                key={index}
                className="px-3 py-1 bg-surface-100 text-surface-700 rounded-full text-sm flex items-center gap-2"
              >
                {location}
                <button
                  type="button"
                  onClick={() => removeLocation(location)}
                  className="hover:text-surface-900"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="willing_to_relocate"
              checked={formData.willing_to_relocate}
              onChange={handleChange}
              className="rounded"
            />
            <span className="text-sm text-surface-600">Willing to relocate</span>
          </label>
        </div>

        {/* Links & Summary */}
        <div className="bg-white rounded-xl shadow-sm border border-surface-200 p-6">
          <h2 className="text-lg font-semibold text-surface-900 mb-4">Additional Information</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                LinkedIn URL
              </label>
              <input
                type="url"
                name="linkedin_url"
                value={formData.linkedin_url}
                onChange={handleChange}
                className="input w-full"
                placeholder="https://linkedin.com/in/..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Portfolio URL
              </label>
              <input
                type="url"
                name="portfolio_url"
                value={formData.portfolio_url}
                onChange={handleChange}
                className="input w-full"
                placeholder="https://..."
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">
              Summary / Notes
            </label>
            <textarea
              name="summary"
              value={formData.summary}
              onChange={handleChange}
              className="input w-full"
              rows={4}
              placeholder="Brief summary about the candidate..."
            />
          </div>
        </div>

        {/* Status */}
        <div className="bg-white rounded-xl shadow-sm border border-surface-200 p-6">
          <h2 className="text-lg font-semibold text-surface-900 mb-4">Status</h2>

          <div className="max-w-xs">
            <select
              name="status"
              value={formData.status}
              onChange={handleChange}
              className="input w-full"
            >
              {(statuses.length
                ? statuses
                : [
                    { value: 'active', label: 'Active' },
                    { value: 'blacklisted', label: 'Blacklisted' }
                  ]
              ).map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Resume Upload */}
        <div className="bg-white rounded-xl shadow-sm border border-surface-200 p-6">
          <h2 className="text-lg font-semibold text-surface-900 mb-4">Resume</h2>
          {isEdit ? (
            <div className="space-y-3">
              {formData.resume_url ? (
                <div className="flex items-center gap-3 p-3 bg-surface-50 rounded-lg border border-surface-200">
                  <Upload className="w-5 h-5 text-primary-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-surface-700 truncate">Resume on file</p>
                    <p className="text-xs text-surface-500 truncate">{formData.resume_url.split('/').pop()}</p>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <a
                      href={formData.resume_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary-600 hover:text-primary-800 font-medium"
                    >
                      View
                    </a>
                    <a
                      href={formData.resume_url}
                      download
                      className="text-xs text-primary-600 hover:text-primary-800 font-medium"
                    >
                      Download
                    </a>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-surface-500">No resume uploaded yet.</p>
              )}
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1">
                  {formData.resume_url ? 'Replace Resume' : 'Upload Resume'}
                </label>
                <input
                  type="file"
                  accept=".pdf,.doc,.docx"
                  onChange={handleResumeUpload}
                  disabled={resumeUploading}
                  className="block w-full text-sm text-surface-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100 disabled:opacity-50"
                />
                <p className="text-xs text-surface-400 mt-1">PDF, DOC, DOCX — max 5 MB</p>
                {resumeUploading && (
                  <p className="text-xs text-primary-600 mt-1 flex items-center gap-1">
                    <span className="animate-spin inline-block w-3 h-3 border border-primary-500 border-t-transparent rounded-full" />
                    Uploading…
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {pendingResumeFile && (
                <div className="flex items-center gap-3 p-3 bg-surface-50 rounded-lg border border-surface-200">
                  <Upload className="w-5 h-5 text-primary-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-surface-700 truncate">{pendingResumeFile.name}</p>
                    <p className="text-xs text-surface-500">Will be uploaded after saving</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPendingResumeFile(null)}
                    className="text-xs text-red-500 hover:text-red-700 font-medium flex-shrink-0"
                  >
                    Remove
                  </button>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1">
                  {pendingResumeFile ? 'Change Resume' : 'Upload Resume'} <span className="text-surface-400 font-normal">(optional)</span>
                </label>
                <input
                  type="file"
                  accept=".pdf,.doc,.docx"
                  onChange={handleResumeUpload}
                  className="block w-full text-sm text-surface-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100"
                />
                <p className="text-xs text-surface-400 mt-1">PDF, DOC, DOCX — max 5 MB</p>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => navigate('/candidates')}
            className="btn-secondary"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="btn-primary flex items-center gap-2"
          >
            {saving ? (
              <>
                <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                {isEdit ? 'Update Candidate' : 'Create Candidate'}
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  )
}

export default CandidateForm