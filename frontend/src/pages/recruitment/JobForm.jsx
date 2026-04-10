import React, { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Briefcase, ArrowLeft, Save, Plus, Trash2 } from 'lucide-react'
import { toast } from 'react-hot-toast'
import jobService from '../../services/jobService'
import clientService from '../../services/clientService'
import pipelineService from '../../services/pipelineService'

const JobForm = () => {
  const navigate = useNavigate()
  const { id } = useParams()
  const isEdit = Boolean(id)

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState({})
  const [clients, setClients] = useState([])
  const [statuses, setStatuses] = useState([])
  const [jobTypes, setJobTypes] = useState([])
  const [workModes, setWorkModes] = useState([])
  const [priorities, setPriorities] = useState([])
  const [pipelines, setPipelines] = useState([])

  const [formData, setFormData] = useState({
    title: '',
    client_id: '',
    description: '',
    requirements: '',
    responsibilities: '',
    job_type: 'full_time',
    work_mode: 'onsite',
    city: '',
    state: '',
    country: 'India',
    total_positions: 1,
    priority: 'medium',
    salary_min: '',
    salary_max: '',
    salary_currency: 'INR',
    experience_min: 0,
    experience_max: '',
    mandatory_skills: [],
    optional_skills: [],
    education_required: '',
    notice_period_max: '',
    ctc_max: '',
    visible_to_partners: true,
    partner_commission: '',
    target_date: '',
    notes: '',
    status: 'draft',
    min_percentage: '',
    pipeline_id: '',
    gender_eligibility: 'all'
  })

  const [newMandatorySkill, setNewMandatorySkill] = useState('')
  const [newOptionalSkill, setNewOptionalSkill] = useState('')

  useEffect(() => {
    loadDropdowns()
    if (isEdit) {
      loadJob()
    }
  }, [id])

  const loadDropdowns = async () => {
    try {
      const [clientRes, statusRes, typeRes, modeRes, priorityRes, pipelineRes] = await Promise.all([
        clientService.getClientsDropdown(),
        jobService.getStatuses(),
        jobService.getJobTypes(),
        jobService.getWorkModes(),
        jobService.getPriorities(),
        pipelineService.getPipelines({ page_size: 100 })
      ])
      setClients(clientRes.data || [])
      setStatuses(statusRes.data || [])
      setJobTypes(typeRes.data || [])
      setWorkModes(modeRes.data || [])
      setPriorities(priorityRes.data || [])
      setPipelines(pipelineRes.data || [])
    } catch (error) {
      console.error('Error loading dropdowns:', error)
    }
  }

  const loadJob = async () => {
    try {
      setLoading(true)
      const response = await jobService.getJob(id)
      if (response.data) {
        const job = response.data
        setFormData(prev => ({
          ...prev,
          title: job.title || '',
          client_id: job.client_id || '',
          description: job.description || '',
          requirements: job.requirements || '',
          responsibilities: job.responsibilities || '',
          job_type: job.job_type || 'full_time',
          work_mode: job.work_mode || 'onsite',
          city: job.city || '',
          state: job.state || '',
          country: job.country || 'India',
          total_positions: job.total_positions || 1,
          priority: job.priority || 'medium',
          status: job.status || 'draft',
          visible_to_partners: job.visible_to_partners ?? true,
          partner_commission: job.partner_commission || '',
          target_date: job.target_date || '',
          salary_min: job.salary?.min_salary || '',
          salary_max: job.salary?.max_salary || '',
          salary_currency: job.salary?.currency || 'INR',
          experience_min: job.experience?.min_years ?? 0,
          experience_max: job.experience?.max_years || '',
          mandatory_skills: job.eligibility?.mandatory_skills || [],
          optional_skills: job.eligibility?.required_skills || [],
          notice_period_max: '',
          ctc_max: job.eligibility?.max_ctc || '',
          min_percentage: job.min_percentage ?? '',
          pipeline_id: job.pipeline_id || '',
          gender_eligibility: job.gender_eligibility || 'all'
        }))
      }
    } catch (error) {
      toast.error('Failed to load job')
      navigate('/jobs')
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
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: undefined }))
  }

  const validate = () => {
    const e = {}
    // Location
    if (!formData.city.trim()) e.city = 'City is required'
    if (!formData.state.trim()) e.state = 'State is required'
    if (!formData.country.trim()) e.country = 'Country is required'
    // Compensation
    if (formData.salary_min === '' || formData.salary_min === null) e.salary_min = 'Min salary is required'
    if (formData.salary_max === '' || formData.salary_max === null) e.salary_max = 'Max salary is required'
    // Eligibility Criteria
    if (formData.experience_max === '' || formData.experience_max === null) e.experience_max = 'Max experience is required'
    if (!formData.notice_period_max) e.notice_period_max = 'Notice period is required'
    if (formData.ctc_max === '' || formData.ctc_max === null) e.ctc_max = 'Max CTC is required'
    if (formData.min_percentage === '' || formData.min_percentage === null) e.min_percentage = 'Min percentage is required'
    if (!formData.pipeline_id) e.pipeline_id = 'Interview pipeline is required'
    if (formData.mandatory_skills.length === 0) e.mandatory_skills = 'At least one mandatory skill is required'
    // Job Description
    if (!formData.description.trim()) e.description = 'Description is required'
    if (!formData.requirements.trim()) e.requirements = 'Requirements are required'
    if (!formData.responsibilities.trim()) e.responsibilities = 'Responsibilities are required'
    return e
  }

  const addSkill = (type) => {
    const raw = type === 'mandatory' ? newMandatorySkill : newOptionalSkill
    const skill = raw.trim().toLowerCase()
    const field = type === 'mandatory' ? 'mandatory_skills' : 'optional_skills'

    if (skill && !formData[field].includes(skill)) {
      setFormData(prev => ({
        ...prev,
        [field]: [...prev[field], skill]
      }))
      if (type === 'mandatory') {
        setNewMandatorySkill('')
      } else {
        setNewOptionalSkill('')
      }
    }
  }

  const removeSkill = (type, skill) => {
    const field = type === 'mandatory' ? 'mandatory_skills' : 'optional_skills'
    setFormData(prev => ({
      ...prev,
      [field]: prev[field].filter(s => s !== skill)
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!formData.title.trim() || !formData.client_id) {
      toast.error('Title and Client are required')
      return
    }

    const validationErrors = validate()
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors)
      toast.error('Please fill in all required fields')
      return
    }
    setErrors({})

    try {
      setSaving(true)

      const payload = {
        title: formData.title,
        client_id: formData.client_id,
        description: formData.description || null,
        requirements: formData.requirements || null,
        responsibilities: formData.responsibilities || null,
        job_type: formData.job_type,
        work_mode: formData.work_mode,
        city: formData.city || null,
        state: formData.state || null,
        country: formData.country || 'India',
        total_positions: Number(formData.total_positions) || 1,
        priority: formData.priority,
        status: formData.status,
        visible_to_partners: formData.visible_to_partners,
        partner_commission: formData.partner_commission ? Number(formData.partner_commission) : null,
        target_date: formData.target_date || null,
        salary: (formData.salary_min || formData.salary_max) ? {
          min_salary: formData.salary_min ? Number(formData.salary_min) : null,
          max_salary: formData.salary_max ? Number(formData.salary_max) : null,
          currency: formData.salary_currency
        } : null,
        experience: {
          min_years: Number(formData.experience_min) || 0,
          max_years: formData.experience_max ? Number(formData.experience_max) : null
        },
        eligibility: {
          min_experience_years: Number(formData.experience_min) || 0,
          max_experience_years: formData.experience_max ? Number(formData.experience_max) : null,
          mandatory_skills: formData.mandatory_skills.map(s => s.trim().toLowerCase()).filter(Boolean),
          required_skills: formData.optional_skills.map(s => s.trim().toLowerCase()).filter(Boolean),
          max_ctc: formData.ctc_max ? Number(formData.ctc_max) : null
        },
        min_percentage: formData.min_percentage !== '' ? Number(formData.min_percentage) : null,
        pipeline_id: formData.pipeline_id || null,
        gender_eligibility: formData.gender_eligibility || 'all',
        education_required: [],
        skills_required: []
      }

      const result = isEdit
        ? await jobService.updateJob(id, payload)
        : await jobService.createJob(payload)

      if (result?.success === true) {
        toast.success(result.message || (isEdit ? 'Job updated successfully' : 'Job created successfully'))
        navigate('/jobs')
      } else {
        toast.error(result?.message || 'Failed to save job')
      }
    } catch (error) {
      // Log the full error so it's visible in DevTools (F12 → Console)
      console.error('Job save error:', error?.response?.data ?? error)

      const detail = error?.response?.data?.detail
      let message

      if (Array.isArray(detail)) {
        // Pydantic 422 validation array
        message = detail.map(d => d.msg || JSON.stringify(d)).join('; ')
      } else if (typeof detail === 'string') {
        // Standard FastAPI / HTTPException string
        message = detail
      } else if (detail && typeof detail === 'object' && detail.message) {
        // Object with message field
        message = detail.message
      } else {
        // Network error or completely unexpected shape
        message = error?.response?.data?.message || error?.message || 'Failed to save job'
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
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate('/jobs')}
          className="p-2 hover:bg-surface-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-surface-900">
            {isEdit ? 'Edit Job' : 'Create Job'}
          </h1>
          <p className="text-surface-500">
            {isEdit ? 'Update job details' : 'Post a new job requirement'}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Information */}
        <div className="bg-white rounded-xl shadow-sm border border-surface-200 p-6">
          <h2 className="text-lg font-semibold text-surface-900 mb-4">Basic Information</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Job Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="title"
                value={formData.title}
                onChange={handleChange}
                className="input w-full"
                placeholder="e.g., Senior Software Engineer"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Client <span className="text-red-500">*</span>
              </label>
              <select
                name="client_id"
                value={formData.client_id}
                onChange={handleChange}
                className="input w-full"
                required
              >
                <option value="">Select Client</option>
                {clients.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Status
              </label>
              <select
                name="status"
                value={formData.status}
                onChange={handleChange}
                className="input w-full"
              >
                {statuses.map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Job Type
              </label>
              <select
                name="job_type"
                value={formData.job_type}
                onChange={handleChange}
                className="input w-full"
              >
                {jobTypes.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Work Mode
              </label>
              <select
                name="work_mode"
                value={formData.work_mode}
                onChange={handleChange}
                className="input w-full"
              >
                {workModes.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Priority
              </label>
              <select
                name="priority"
                value={formData.priority}
                onChange={handleChange}
                className="input w-full"
              >
                {priorities.map(p => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Total Positions
              </label>
              <input
                type="number"
                name="total_positions"
                value={formData.total_positions}
                onChange={handleChange}
                className="input w-full"
                min="1"
              />
            </div>
          </div>
        </div>

        {/* Location */}
        <div className="bg-white rounded-xl shadow-sm border border-surface-200 p-6">
          <h2 className="text-lg font-semibold text-surface-900 mb-4">Location</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                City <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="city"
                value={formData.city}
                onChange={handleChange}
                className={`input w-full ${errors.city ? 'border-red-400' : ''}`}
              />
              {errors.city && <p className="text-red-500 text-xs mt-1">{errors.city}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                State <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="state"
                value={formData.state}
                onChange={handleChange}
                className={`input w-full ${errors.state ? 'border-red-400' : ''}`}
              />
              {errors.state && <p className="text-red-500 text-xs mt-1">{errors.state}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Country <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="country"
                value={formData.country}
                onChange={handleChange}
                className={`input w-full ${errors.country ? 'border-red-400' : ''}`}
              />
              {errors.country && <p className="text-red-500 text-xs mt-1">{errors.country}</p>}
            </div>
          </div>
        </div>

        {/* Compensation */}
        <div className="bg-white rounded-xl shadow-sm border border-surface-200 p-6">
          <h2 className="text-lg font-semibold text-surface-900 mb-4">Compensation</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Min Salary (LPA) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                name="salary_min"
                value={formData.salary_min}
                onChange={handleChange}
                className={`input w-full ${errors.salary_min ? 'border-red-400' : ''}`}
                step="0.5"
                min="0"
              />
              {errors.salary_min && <p className="text-red-500 text-xs mt-1">{errors.salary_min}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Max Salary (LPA) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                name="salary_max"
                value={formData.salary_max}
                onChange={handleChange}
                className={`input w-full ${errors.salary_max ? 'border-red-400' : ''}`}
                step="0.5"
                min="0"
              />
              {errors.salary_max && <p className="text-red-500 text-xs mt-1">{errors.salary_max}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Currency
              </label>
              <select
                name="salary_currency"
                value={formData.salary_currency}
                onChange={handleChange}
                className="input w-full"
              >
                <option value="INR">INR</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
              </select>
            </div>
          </div>
        </div>

        {/* Eligibility Criteria */}
        <div className="bg-white rounded-xl shadow-sm border border-surface-200 p-6">
          <h2 className="text-lg font-semibold text-surface-900 mb-4">Eligibility Criteria</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Min Experience (Years)
              </label>
              <input
                type="number"
                name="experience_min"
                value={formData.experience_min}
                onChange={handleChange}
                className="input w-full"
                min="0"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Max Experience (Years) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                name="experience_max"
                value={formData.experience_max}
                onChange={handleChange}
                className={`input w-full ${errors.experience_max ? 'border-red-400' : ''}`}
                min="0"
              />
              {errors.experience_max && <p className="text-red-500 text-xs mt-1">{errors.experience_max}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Max Notice Period <span className="text-red-500">*</span>
              </label>
              <select
                name="notice_period_max"
                value={formData.notice_period_max}
                onChange={handleChange}
                className={`input w-full ${errors.notice_period_max ? 'border-red-400' : ''}`}
              >
                <option value="">Select notice period</option>
                <option value="immediate">Immediate</option>
                <option value="15_days">15 Days</option>
                <option value="30_days">30 Days</option>
                <option value="60_days">60 Days</option>
                <option value="90_days">90 Days</option>
              </select>
              {errors.notice_period_max && <p className="text-red-500 text-xs mt-1">{errors.notice_period_max}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Max Current CTC (LPA) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                name="ctc_max"
                value={formData.ctc_max}
                onChange={handleChange}
                className={`input w-full ${errors.ctc_max ? 'border-red-400' : ''}`}
                step="0.5"
                min="0"
                placeholder="e.g. 20"
              />
              {errors.ctc_max && <p className="text-red-500 text-xs mt-1">{errors.ctc_max}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Min. Academic Percentage (%) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                name="min_percentage"
                value={formData.min_percentage}
                onChange={handleChange}
                className={`input w-full ${errors.min_percentage ? 'border-red-400' : ''}`}
                step="0.1"
                min="0"
                max="100"
                placeholder="e.g. 60"
              />
              {errors.min_percentage
                ? <p className="text-red-500 text-xs mt-1">{errors.min_percentage}</p>
                : <p className="text-xs text-surface-400 mt-1">Candidates below this % will be auto-rejected</p>
              }
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Interview Pipeline <span className="text-red-500">*</span>
              </label>
              <select
                name="pipeline_id"
                value={formData.pipeline_id}
                onChange={handleChange}
                className={`input w-full ${errors.pipeline_id ? 'border-red-400' : ''}`}
              >
                <option value="">Select a pipeline</option>
                {pipelines.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.stage_count} stages){p.is_default ? ' — Default' : ''}
                  </option>
                ))}
              </select>
              {errors.pipeline_id && <p className="text-red-500 text-xs mt-1">{errors.pipeline_id}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Gender Eligibility
              </label>
              <select
                name="gender_eligibility"
                value={formData.gender_eligibility}
                onChange={handleChange}
                className="input w-full"
              >
                <option value="all">No Gender Restriction</option>
                <option value="male">Only Men</option>
                <option value="female">Only Women</option>
              </select>
            </div>
          </div>

          {/* Mandatory Skills */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-surface-700 mb-2">
              Mandatory Skills <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={newMandatorySkill}
                onChange={(e) => setNewMandatorySkill(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addSkill('mandatory'))}
                className="input flex-1"
                placeholder="Add mandatory skill..."
              />
              <button
                type="button"
                onClick={() => addSkill('mandatory')}
                className="btn-secondary"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {formData.mandatory_skills.map((skill, index) => (
                <span
                  key={index}
                  className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm flex items-center gap-2"
                >
                  {skill}
                  <button
                    type="button"
                    onClick={() => removeSkill('mandatory', skill)}
                    className="hover:text-red-900"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            {errors.mandatory_skills && <p className="text-red-500 text-xs mt-2">{errors.mandatory_skills}</p>}
          </div>

          {/* Optional Skills */}
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-2">
              Good to Have Skills
            </label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={newOptionalSkill}
                onChange={(e) => setNewOptionalSkill(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addSkill('optional'))}
                className="input flex-1"
                placeholder="Add optional skill..."
              />
              <button
                type="button"
                onClick={() => addSkill('optional')}
                className="btn-secondary"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {formData.optional_skills.map((skill, index) => (
                <span
                  key={index}
                  className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm flex items-center gap-2"
                >
                  {skill}
                  <button
                    type="button"
                    onClick={() => removeSkill('optional', skill)}
                    className="hover:text-blue-900"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Job Description */}
        <div className="bg-white rounded-xl shadow-sm border border-surface-200 p-6">
          <h2 className="text-lg font-semibold text-surface-900 mb-4">Job Description</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Description <span className="text-red-500">*</span>
              </label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleChange}
                className={`input w-full ${errors.description ? 'border-red-400' : ''}`}
                rows={4}
                placeholder="Job description..."
              />
              {errors.description && <p className="text-red-500 text-xs mt-1">{errors.description}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Requirements <span className="text-red-500">*</span>
              </label>
              <textarea
                name="requirements"
                value={formData.requirements}
                onChange={handleChange}
                className={`input w-full ${errors.requirements ? 'border-red-400' : ''}`}
                rows={4}
                placeholder="Job requirements..."
              />
              {errors.requirements && <p className="text-red-500 text-xs mt-1">{errors.requirements}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Responsibilities <span className="text-red-500">*</span>
              </label>
              <textarea
                name="responsibilities"
                value={formData.responsibilities}
                onChange={handleChange}
                className={`input w-full ${errors.responsibilities ? 'border-red-400' : ''}`}
                rows={4}
                placeholder="Key responsibilities..."
              />
              {errors.responsibilities && <p className="text-red-500 text-xs mt-1">{errors.responsibilities}</p>}
            </div>
          </div>
        </div>

        {/* Partner Settings */}
        <div className="bg-white rounded-xl shadow-sm border border-surface-200 p-6">
          <h2 className="text-lg font-semibold text-surface-900 mb-4">Partner Settings</h2>
          
          <div className="space-y-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                name="visible_to_partners"
                checked={formData.visible_to_partners}
                onChange={handleChange}
                className="rounded"
              />
              <span className="text-sm text-surface-600">Visible to Partners</span>
            </label>

            <div className="max-w-xs">
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Partner Commission %
              </label>
              <input
                type="number"
                name="partner_commission"
                value={formData.partner_commission}
                onChange={handleChange}
                className="input w-full"
                step="0.5"
                min="0"
                max="100"
              />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => navigate('/jobs')}
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
                {isEdit ? 'Update Job' : 'Create Job'}
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  )
}

export default JobForm