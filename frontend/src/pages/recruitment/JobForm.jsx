import React, { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Briefcase, ArrowLeft, Save, Plus, Trash2, GitBranch, CheckCircle2, X, Pencil } from 'lucide-react'
import { toast } from 'react-hot-toast'
import jobService from '../../services/jobService'
import clientService from '../../services/clientService'
import pipelineService from '../../services/pipelineService'
import CreatePipelineModal from '../../components/pipeline/CreatePipelineModal'
import EditPipelineModal from '../../components/pipeline/EditPipelineModal'
import SearchableSelect from '../../components/common/SearchableSelect'
import DraftRecoveryBanner from '../../components/common/DraftRecoveryBanner'
import { useDraftRecovery } from '../../hooks/useDraftRecovery'

const JobForm = () => {
  const navigate = useNavigate()
  const { id } = useParams()
  const isEdit = Boolean(id)

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [errors, setErrors] = useState({})
  const [clients, setClients] = useState([])
  const [statuses, setStatuses] = useState([])
  const [jobTypes, setJobTypes] = useState([])
  const [workModes, setWorkModes] = useState([])
  const [priorities, setPriorities] = useState([])
  const [pipelines, setPipelines] = useState([])
  const [branchOptions, setBranchOptions] = useState([])

  const [formData, setFormData] = useState({
    title: '',
    client_id: '',
    description: '',
    requirements: '',
    responsibilities: '',
    job_type: 'full_time',
    work_mode: 'onsite',
    location_type: 'single',
    locations: [],
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
    enable_academic_filtering: false,
    min_percentage: '',
    minimum_match_score: 70,
    pipeline_id: '',
    gender_eligibility: 'all',
    min_10th_percentage: '',
    min_12th_percentage: '',
    min_diploma_percentage: '',
    min_degree_percentage: '',
    required_branches: []
  })

  const [locationInput, setLocationInput] = useState('')

  // Draft recovery (Task 7) — survives refresh/close/session-lock before save
  const { draftAvailable, draftSavedAt, restoreDraft, discardDraft } = useDraftRecovery(
    'job', id, formData, setFormData,
    { isDirty: (d) => !!(d.title?.trim() || d.client_id), isSubmitted: submitted }
  )

  // Maps select value → integer days for max_notice_period_days
  const NOTICE_DAYS_MAP = { immediate: 0, '15_days': 15, '30_days': 30, '60_days': 60, '90_days': 90 }

  const [newMandatorySkill, setNewMandatorySkill] = useState('')
  const [newOptionalSkill, setNewOptionalSkill] = useState('')
  const [showPipelineModal, setShowPipelineModal] = useState(false)
  const [showEditPipelineModal, setShowEditPipelineModal] = useState(false)

  useEffect(() => {
    loadDropdowns()
    if (isEdit) {
      loadJob()
    }
  }, [id])

  const loadDropdowns = async () => {
    try {
      const [clientRes, statusRes, typeRes, modeRes, priorityRes, pipelineRes, branchRes] = await Promise.all([
        clientService.getClientsDropdown(),
        jobService.getStatuses(),
        jobService.getJobTypes(),
        jobService.getWorkModes(),
        jobService.getPriorities(),
        pipelineService.getPipelines({ page_size: 100 }),
        jobService.getBranches(),
      ])
      setClients(clientRes.data || [])
      setStatuses(statusRes.data || [])
      setJobTypes(typeRes.data || [])
      setWorkModes(modeRes.data || [])
      setPriorities(priorityRes.data || [])
      setPipelines(pipelineRes.data || [])
      setBranchOptions(branchRes.data || [])
    } catch (error) {
      toast.error('Failed to load form options')
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
          location_type: job.location_type || 'single',
          locations: job.locations || [],
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
          notice_period_max: (() => {
            const days = job.eligibility?.max_notice_period_days
            if (days == null) return ''
            const entry = Object.entries({ immediate: 0, '15_days': 15, '30_days': 30, '60_days': 60, '90_days': 90 }).find(([, v]) => v === days)
            return entry ? entry[0] : ''
          })(),
          ctc_max: job.eligibility?.max_ctc || '',
          enable_academic_filtering: !!(job.min_percentage != null && job.min_percentage !== ''),
          min_percentage: job.min_percentage ?? '',
          minimum_match_score: job.minimum_match_score ?? 70,
          pipeline_id: job.pipeline_id || '',
          gender_eligibility: job.gender_eligibility || 'all',
          min_10th_percentage: job.eligibility?.min_10th_percentage ?? '',
          min_12th_percentage: job.eligibility?.min_12th_percentage ?? '',
          min_diploma_percentage: job.eligibility?.min_diploma_percentage ?? '',
          min_degree_percentage: job.eligibility?.min_degree_percentage ?? '',
          required_branches: job.eligibility?.required_branches || []
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

  const handleDeletePipeline = async (pipeline) => {
    if (!window.confirm(`Delete pipeline "${pipeline.job_title || pipeline.name}"?\n\nThis cannot be undone.`)) return
    try {
      await pipelineService.deletePipeline(pipeline.id)
      setPipelines(prev => prev.filter(p => p.id !== pipeline.id))
      setFormData(f => ({ ...f, pipeline_id: '' }))
      toast.success('Pipeline deleted')
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to delete pipeline')
    }
  }

  const validate = () => {
    const e = {}
    // Basic
    if (!formData.title.trim()) e.title = 'Job title is required'
    if (!formData.client_id) e.client_id = 'Client is required'
    // Location (Task 9)
    if (formData.location_type === 'single' || formData.location_type === 'hybrid') {
      if (!formData.city.trim()) e.city = 'City is required'
    } else if (formData.location_type === 'multiple') {
      if (formData.locations.length === 0) e.city = 'Add at least one location'
    }
    if (formData.location_type === 'single' || formData.location_type === 'hybrid') {
      if (!formData.state.trim()) e.state = 'State is required'
    }
    if (!formData.country.trim()) e.country = 'Country is required'
    // Compensation
    if (formData.salary_min === '' || formData.salary_min === null) e.salary_min = 'Min salary is required'
    if (formData.salary_max === '' || formData.salary_max === null) e.salary_max = 'Max salary is required'
    // Eligibility Criteria
    if (formData.experience_max === '' || formData.experience_max === null) e.experience_max = 'Max experience is required'
    if (!formData.notice_period_max) e.notice_period_max = 'Notice period is required'
    if (formData.ctc_max === '' || formData.ctc_max === null) e.ctc_max = 'Max CTC is required'
    if (formData.enable_academic_filtering && (formData.min_percentage === '' || formData.min_percentage === null)) e.min_percentage = 'Min percentage is required'
    const mms = Number(formData.minimum_match_score)
    if (formData.minimum_match_score === '' || formData.minimum_match_score == null) e.minimum_match_score = 'Minimum match score is required'
    else if (isNaN(mms) || mms < 0 || mms > 100) e.minimum_match_score = 'Must be 0–100'
    if (!formData.pipeline_id) e.pipeline_id = 'Interview pipeline is required'
    if (formData.mandatory_skills.length === 0) e.mandatory_skills = 'At least one mandatory skill is required'
    // Job Description
    if (!formData.description.trim()) e.description = 'Description is required'
    if (!formData.requirements.trim()) e.requirements = 'Requirements are required'
    if (!formData.responsibilities.trim()) e.responsibilities = 'Responsibilities are required'
    return e
  }

  const addSkill = (type, rawOverride) => {
    const raw = rawOverride ?? (type === 'mandatory' ? newMandatorySkill : newOptionalSkill)
    const skill = raw.trim().toLowerCase()
    const field = type === 'mandatory' ? 'mandatory_skills' : 'optional_skills'

    if (skill && !formData[field].includes(skill)) {
      setFormData(prev => ({
        ...prev,
        [field]: [...prev[field], skill]
      }))
    }
    if (rawOverride === undefined) {
      if (type === 'mandatory') setNewMandatorySkill('')
      else setNewOptionalSkill('')
    }
  }

  const handleSkillKeyDown = (e, type) => {
    if (['Enter', ',', 'Tab'].includes(e.key) || (e.key === ' ' && (type === 'mandatory' ? newMandatorySkill : newOptionalSkill).trim())) {
      e.preventDefault()
      addSkill(type)
    }
  }

  const handleSkillPaste = (e, type) => {
    e.preventDefault()
    const text = e.clipboardData.getData('text')
    const parts = text.split(/[,\s\t\n]+/).map(s => s.trim().toLowerCase()).filter(Boolean)
    const field = type === 'mandatory' ? 'mandatory_skills' : 'optional_skills'
    setFormData(prev => {
      const existing = new Set(prev[field])
      const toAdd = parts.filter(s => !existing.has(s))
      return { ...prev, [field]: [...prev[field], ...toAdd] }
    })
    if (type === 'mandatory') setNewMandatorySkill('')
    else setNewOptionalSkill('')
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

    const validationErrors = validate()
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors)
      toast.error('Please fill in all required fields')
      const firstField = Object.keys(validationErrors)[0]
      const el = document.getElementById(`field-${firstField}`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        el.focus()
      }
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
        location_type: formData.location_type,
        locations: formData.location_type === 'multiple'
          ? formData.locations
          : (formData.location_type === 'single' || formData.location_type === 'hybrid')
          ? (formData.city ? [formData.city] : formData.locations)
          : [],
        city: (formData.location_type === 'pan_india' || formData.location_type === 'remote')
          ? null
          : (formData.city || formData.locations[0] || null),
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
          max_ctc: formData.ctc_max ? Number(formData.ctc_max) : null,
          max_notice_period_days: formData.notice_period_max ? (NOTICE_DAYS_MAP[formData.notice_period_max] ?? null) : null,
          min_10th_percentage: formData.min_10th_percentage !== '' ? Number(formData.min_10th_percentage) : null,
          min_12th_percentage: formData.min_12th_percentage !== '' ? Number(formData.min_12th_percentage) : null,
          min_diploma_percentage: formData.min_diploma_percentage !== '' ? Number(formData.min_diploma_percentage) : null,
          min_degree_percentage: formData.min_degree_percentage !== '' ? Number(formData.min_degree_percentage) : null,
          required_branches: formData.required_branches || []
        },
        min_percentage: (formData.enable_academic_filtering && formData.min_percentage !== '') ? Number(formData.min_percentage) : null,
        minimum_match_score: Number(formData.minimum_match_score) || 70,
        pipeline_id: formData.pipeline_id || null,
        gender_eligibility: formData.gender_eligibility || 'all',
        education_required: [],
        skills_required: []
      }

      const result = isEdit
        ? await jobService.updateJob(id, payload)
        : await jobService.createJob(payload)

      if (result?.success === true) {
        setSubmitted(true)
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

      {draftAvailable && (
        <DraftRecoveryBanner savedAt={draftSavedAt} onRestore={restoreDraft} onDiscard={discardDraft} />
      )}

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
                id="field-title"
                type="text"
                name="title"
                value={formData.title}
                onChange={handleChange}
                className={`input w-full ${errors.title ? 'border-red-400' : ''}`}
                placeholder="e.g., Senior Software Engineer"
              />
              {errors.title && <p className="text-red-500 text-xs mt-1">{errors.title}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Client <span className="text-red-500">*</span>
              </label>
              <select
                id="field-client_id"
                name="client_id"
                value={formData.client_id}
                onChange={handleChange}
                className={`input w-full ${errors.client_id ? 'border-red-400' : ''}`}
              >
                <option value="">Select Client</option>
                {clients.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
              {errors.client_id && <p className="text-red-500 text-xs mt-1">{errors.client_id}</p>}
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

          <div className="mb-4">
            <label className="block text-sm font-medium text-surface-700 mb-1">
              Location Type
            </label>
            <select
              name="location_type"
              value={formData.location_type}
              onChange={(e) => {
                const value = e.target.value
                setFormData(prev => ({ ...prev, location_type: value }))
                if (errors.city) setErrors(prev => ({ ...prev, city: undefined }))
              }}
              className="input w-full md:w-64"
            >
              <option value="single">Single Location</option>
              <option value="multiple">Multiple Locations</option>
              <option value="pan_india">PAN India</option>
              <option value="remote">Remote</option>
              <option value="hybrid">Hybrid</option>
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(formData.location_type === 'single' || formData.location_type === 'hybrid') && (
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1">
                  City <span className="text-red-500">*</span>
                </label>
                <input
                  id="field-city"
                  type="text"
                  name="city"
                  value={formData.city}
                  onChange={handleChange}
                  className={`input w-full ${errors.city ? 'border-red-400' : ''}`}
                  placeholder="e.g. Bangalore"
                />
                {errors.city && <p className="text-red-500 text-xs mt-1">{errors.city}</p>}
              </div>
            )}

            {formData.location_type === 'multiple' && (
              <div id="field-city" className="md:col-span-2">
                <label className="block text-sm font-medium text-surface-700 mb-1">
                  Locations <span className="text-red-500">*</span>
                </label>
                <div className={`flex flex-wrap gap-2 p-2 rounded-lg border ${errors.city ? 'border-red-400' : 'border-surface-200'}`}>
                  {formData.locations.map(loc => (
                    <span key={loc} className="flex items-center gap-1 px-2 py-1 rounded-full bg-accent/10 text-accent text-xs font-medium">
                      {loc}
                      <button type="button" onClick={() => setFormData(prev => ({ ...prev, locations: prev.locations.filter(l => l !== loc) }))}>
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                  <input
                    type="text"
                    value={locationInput}
                    onChange={(e) => setLocationInput(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.key === 'Enter' || e.key === ',') && locationInput.trim()) {
                        e.preventDefault()
                        const val = locationInput.trim()
                        setFormData(prev => prev.locations.includes(val) ? prev : { ...prev, locations: [...prev.locations, val] })
                        setLocationInput('')
                        if (errors.city) setErrors(prev => ({ ...prev, city: undefined }))
                      }
                    }}
                    placeholder="Type a city and press Enter"
                    className="flex-1 min-w-[140px] text-sm outline-none bg-transparent"
                  />
                </div>
                {errors.city && <p className="text-red-500 text-xs mt-1">{errors.city}</p>}
                <p className="text-xs text-surface-400 mt-1">e.g. Bangalore, Chennai, Hyderabad</p>
              </div>
            )}

            {(formData.location_type === 'pan_india' || formData.location_type === 'remote') && (
              <div className="md:col-span-2 flex items-center text-sm text-surface-500">
                No specific city required for {formData.location_type === 'pan_india' ? 'PAN India' : 'Remote'} jobs.
              </div>
            )}

            {(formData.location_type === 'single' || formData.location_type === 'hybrid') && (
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1">
                  State <span className="text-red-500">*</span>
                </label>
                <input
                  id="field-state"
                  type="text"
                  name="state"
                  value={formData.state}
                  onChange={handleChange}
                  className={`input w-full ${errors.state ? 'border-red-400' : ''}`}
                />
                {errors.state && <p className="text-red-500 text-xs mt-1">{errors.state}</p>}
              </div>
            )}

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
                id="field-salary_min"
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
                id="field-salary_max"
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
                id="field-experience_max"
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
                id="field-notice_period_max"
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
                id="field-ctc_max"
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

            <div className="md:col-span-2">
              <div className="flex items-center gap-2 mb-2">
                <input
                  type="checkbox"
                  id="enable_academic_filtering"
                  name="enable_academic_filtering"
                  checked={formData.enable_academic_filtering}
                  onChange={handleChange}
                  className="rounded"
                />
                <label htmlFor="enable_academic_filtering" className="text-sm font-medium text-surface-700 cursor-pointer select-none">
                  Enable Academic Filtering
                </label>
              </div>
              {formData.enable_academic_filtering && (
                <div>
                  <label className="block text-sm font-medium text-surface-700 mb-1">
                    Minimum Academic Percentage (%) <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="field-min_percentage"
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
                    : <p className="text-xs text-surface-400 mt-1">Candidates below this % will be auto-rejected. Uses degree % if present, otherwise diploma %.</p>
                  }
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Minimum Match Score (%) <span className="text-red-500">*</span>
              </label>
              <input
                id="field-minimum_match_score"
                type="number"
                name="minimum_match_score"
                value={formData.minimum_match_score}
                onChange={handleChange}
                className={`input w-full ${errors.minimum_match_score ? 'border-red-400' : ''}`}
                min="0"
                max="100"
                step="1"
                placeholder="e.g. 70"
              />
              {errors.minimum_match_score
                ? <p className="text-red-500 text-xs mt-1">{errors.minimum_match_score}</p>
                : <p className="text-xs text-surface-400 mt-1">Candidates with ATS score below this % will be auto-rejected</p>
              }
            </div>
          </div>

          {/* Academic Eligibility — per-level thresholds, only shown when academic filtering is enabled */}
          {formData.enable_academic_filtering && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-surface-700 mb-1">Per-Level Thresholds <span className="text-surface-400 font-normal">(optional)</span></h3>
              <p className="text-xs text-surface-400 mb-3">Leave blank to skip filtering at a specific level. Degree % takes priority over Diploma % for evaluation.</p>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {[
                  { name: 'min_10th_percentage',     label: '10th %' },
                  { name: 'min_12th_percentage',     label: '12th %' },
                  { name: 'min_diploma_percentage',  label: 'Diploma %' },
                  { name: 'min_degree_percentage',   label: 'Degree %' },
                ].map(({ name, label }) => (
                  <div key={name}>
                    <label className="block text-sm font-medium text-surface-700 mb-1">{label}</label>
                    <input
                      type="number"
                      name={name}
                      value={formData[name]}
                      onChange={handleChange}
                      onWheel={(e) => e.target.blur()}
                      className="input w-full"
                      step="0.1"
                      min="0"
                      max="100"
                      placeholder="e.g. 60"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div id="field-pipeline_id">
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Interview Pipeline <span className="text-red-500">*</span>
              </label>
              {pipelines.length === 0 ? (
                <div className={`flex items-center justify-between px-3 py-2.5 rounded-lg border ${errors.pipeline_id ? 'border-red-400' : 'border-surface-200'} bg-surface-50`}>
                  <span className="text-sm text-surface-400">No pipelines yet</span>
                  <button
                    type="button"
                    onClick={() => setShowPipelineModal(true)}
                    className="flex items-center gap-1.5 text-sm font-medium text-accent hover:text-accent/80 transition-colors"
                  >
                    <GitBranch className="w-3.5 h-3.5" />
                    Create Pipeline
                  </button>
                </div>
              ) : (
                <div className={`relative rounded-lg border ${errors.pipeline_id ? 'border-red-400' : 'border-surface-200'} bg-[var(--bg-card)] overflow-hidden`}>
                  {/* Selected pipeline display / searchable dropdown trigger (Task 14) */}
                  <div className="px-2 py-1.5 border-b border-surface-100">
                    <SearchableSelect
                      value={formData.pipeline_id}
                      onChange={(val) => setFormData(prev => ({ ...prev, pipeline_id: val }))}
                      options={pipelines.map(p => ({
                        value: p.id,
                        label: `${p.job_title || p.name}${p.client_name ? ` - ${p.client_name}` : ''}${p.is_default ? ' (Default)' : ''}`,
                      }))}
                      placeholder="Search pipeline by name or client…"
                      minChars={0}
                      className="border-0"
                    />
                  </div>
                  {/* Selected pipeline info row */}
                  {formData.pipeline_id && (() => {
                    const sel = pipelines.find(p => p.id === formData.pipeline_id)
                    return sel ? (
                      <div className="px-3 py-2.5 bg-accent/5 space-y-1.5">
                        {/* Name + clear */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <GitBranch className="w-3.5 h-3.5 text-accent flex-shrink-0" />
                            <span className="text-sm font-medium text-surface-800 truncate">
                              {sel.job_title || sel.name}{sel.client_name ? ` — ${sel.client_name}` : ''}
                            </span>
                            {sel.is_default && (
                              <span className="px-1.5 py-0.5 rounded-full bg-accent/10 text-accent text-xs font-medium flex-shrink-0">Default</span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => setFormData(f => ({ ...f, pipeline_id: '' }))}
                            className="text-surface-400 hover:text-red-500 transition-colors flex-shrink-0"
                            title="Clear selection"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        {/* Client + stages meta */}
                        <div className="flex items-center gap-3 pl-5 text-xs text-surface-500">
                          {sel.client_name && <span>Client: <span className="font-medium text-surface-700">{sel.client_name}</span></span>}
                          <span>Stages: <span className="font-medium text-surface-700">{sel.stage_count ?? 0}</span></span>
                        </div>
                        {/* Edit / Delete */}
                        <div className="flex items-center gap-2 pl-5">
                          <button
                            type="button"
                            onClick={() => setShowEditPipelineModal(true)}
                            className="flex items-center gap-1 text-xs font-medium text-accent hover:text-accent/80 transition-colors"
                          >
                            <Pencil className="w-3 h-3" />
                            Edit Pipeline
                          </button>
                          <span className="text-surface-300">|</span>
                          <button
                            type="button"
                            onClick={() => handleDeletePipeline(sel)}
                            className="flex items-center gap-1 text-xs font-medium text-red-500 hover:text-red-700 transition-colors"
                          >
                            <Trash2 className="w-3 h-3" />
                            Delete Pipeline
                          </button>
                        </div>
                      </div>
                    ) : null
                  })()}
                  {/* Create new option */}
                  <button
                    type="button"
                    onClick={() => setShowPipelineModal(true)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-accent hover:bg-accent/5 transition-colors border-t border-surface-100"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Create New Pipeline
                  </button>
                </div>
              )}
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

          {/* Branch / Specialization */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-surface-700 mb-1">
              Branch / Specialization
            </label>
            <p className="text-xs text-surface-400 mb-2">
              Select required branches. Leave empty to accept any branch.
            </p>
            <div className="relative">
              <select
                className="input w-full"
                value=""
                onChange={(e) => {
                  const val = e.target.value
                  if (val && !formData.required_branches.includes(val)) {
                    setFormData(prev => ({ ...prev, required_branches: [...prev.required_branches, val] }))
                  }
                }}
              >
                <option value="">— Add a branch —</option>
                {branchOptions
                  .filter(b => !formData.required_branches.includes(b.value))
                  .map(b => (
                    <option key={b.value} value={b.value}>{b.label}</option>
                  ))
                }
              </select>
            </div>
            {formData.required_branches.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {formData.required_branches.map(slug => {
                  const opt = branchOptions.find(b => b.value === slug)
                  return (
                    <span
                      key={slug}
                      className="px-3 py-1 rounded-full text-sm flex items-center gap-1.5"
                      style={{ background: 'rgba(108,99,255,0.12)', color: 'var(--accent)' }}
                    >
                      {opt?.label || slug}
                      <button
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, required_branches: prev.required_branches.filter(b => b !== slug) }))}
                        className="hover:opacity-70"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </span>
                  )
                })}
              </div>
            )}
          </div>

          {/* Mandatory Skills */}
          <div id="field-mandatory_skills" className="mb-4">
            <label className="block text-sm font-medium text-surface-700 mb-2">
              Mandatory Skills <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={newMandatorySkill}
                onChange={(e) => setNewMandatorySkill(e.target.value)}
                onKeyDown={(e) => handleSkillKeyDown(e, 'mandatory')}
                onPaste={(e) => handleSkillPaste(e, 'mandatory')}
                className="input flex-1"
                placeholder="Type skill and press Enter, Space, Comma or Tab…"
              />
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
                onKeyDown={(e) => handleSkillKeyDown(e, 'optional')}
                onPaste={(e) => handleSkillPaste(e, 'optional')}
                className="input flex-1"
                placeholder="Type skill and press Enter, Space, Comma or Tab…"
              />
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
                id="field-description"
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
                id="field-requirements"
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
                id="field-responsibilities"
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

      {showPipelineModal && (
        <CreatePipelineModal
          onClose={() => setShowPipelineModal(false)}
          onCreated={(newPipeline) => {
            setPipelines(prev => [...prev, newPipeline])
            setFormData(f => ({ ...f, pipeline_id: newPipeline.id || newPipeline._id || '' }))
            setShowPipelineModal(false)
          }}
        />
      )}

      {showEditPipelineModal && formData.pipeline_id && (
        <EditPipelineModal
          pipelineId={formData.pipeline_id}
          onClose={() => setShowEditPipelineModal(false)}
          onUpdated={async () => {
            // Refresh pipelines list so dropdown + info row show updated data
            try {
              const res = await pipelineService.getPipelines({ page_size: 100 })
              setPipelines(res.data || [])
            } catch { /* ignore */ }
            setShowEditPipelineModal(false)
          }}
        />
      )}
    </div>
  )
}

export default JobForm