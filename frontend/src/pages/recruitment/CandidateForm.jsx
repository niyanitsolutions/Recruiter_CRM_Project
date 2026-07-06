import React, { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Save, Plus, Trash2, Sparkles, Upload, FileText, Camera, X } from 'lucide-react'
import { toast } from 'react-hot-toast'
import candidateService from '../../services/candidateService'
import DraftRecoveryBanner from '../../components/common/DraftRecoveryBanner'
import { useDraftRecovery } from '../../hooks/useDraftRecovery'
import ImageCropModal from '../../components/common/ImageCropModal'
import { resolvePhotoUrl } from '../../components/common/EmployeeAvatar'

const EMPTY_EDU = () => ({ degree: '', field_of_study: '', institution: '', from_year: '', to_year: '', percentage: '' })
const EMPTY_EXP = () => ({ company_name: '', designation: '', start_date: '', end_date: '', is_current: false })

const EXP_OPTIONS = [
  { label: 'Less than 1 Year', value: 0.5 },
  { label: '1 Year', value: 1 },
  { label: '2 Years', value: 2 },
  { label: '3 Years', value: 3 },
  { label: '4 Years', value: 4 },
  { label: '5 Years', value: 5 },
  { label: '6 Years', value: 6 },
  { label: '7 Years', value: 7 },
  { label: '8 Years', value: 8 },
  { label: '9 Years', value: 9 },
  { label: '10 Years', value: 10 },
  { label: '10+ Years', value: 11 },
]

const CandidateForm = () => {
  const navigate = useNavigate()
  const { id } = useParams()
  const isEdit = Boolean(id)

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [parseStage, setParseStage] = useState('')
  const [resumeUploading, setResumeUploading] = useState(false)
  const [statuses, setStatuses] = useState([])
  const [sources, setSources] = useState([])
  const [noticePeriods, setNoticePeriods] = useState([])
  const [resumeText, setResumeText] = useState('')
  const [showResumeParser, setShowResumeParser] = useState(false)
  const [pendingResumeFile, setPendingResumeFile] = useState(null)
  const [isFresher, setIsFresher] = useState(false)
  const [errors, setErrors] = useState({})

  // Photo upload state
  const [photoUrl, setPhotoUrl] = useState(null)
  const [cropFile, setCropFile] = useState(null)
  const [croppedBlob, setCroppedBlob] = useState(null)
  const [croppedPreview, setCroppedPreview] = useState(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const photoInputRef = useRef(null)

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
    total_experience_years: '',
    total_experience_months: 0,
    current_ctc: '',
    expected_ctc: '',
    notice_period: 'immediate',
    skills: [],
    source: 'direct',
    linkedin_url: '',
    portfolio_url: '',
    summary: '',
    status: 'active',
    resume_url: ''
  })

  const [newSkill, setNewSkill] = useState('')
  const [newLocation, setNewLocation] = useState('')
  const [submitted, setSubmitted] = useState(false)

  // Draft recovery (Task 7)
  const draftData = { ...formData, education, workExperience }
  const setDraftData = (next) => {
    setFormData(prev => ({ ...prev, ...next }))
    if (next.education) setEducation(next.education)
    if (next.workExperience) setWorkExperience(next.workExperience)
  }
  const { draftAvailable, draftSavedAt, restoreDraft, discardDraft } = useDraftRecovery(
    'candidate', id, draftData, setDraftData,
    { isDirty: (d) => !!(d.first_name?.trim() || d.email?.trim() || d.mobile?.trim()), isSubmitted: submitted }
  )

  useEffect(() => {
    loadDropdowns()
    if (isEdit) loadCandidate()
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
      if (!response.data) {
        toast.error('Candidate not found')
        navigate('/candidates')
        return
      }
      if (response.data) {
        const data = response.data

        // Map education array
        if (data.education?.length) {
          setEducation(data.education.map(e => ({
            degree: e.degree || '',
            field_of_study: e.field_of_study || '',
            institution: e.institution || '',
            from_year: e.from_year || '',
            to_year: e.to_year || e.year_of_passing || '',
            percentage: e.percentage ?? ''
          })))
        }

        // Map work experience array
        if (data.work_experience?.length) {
          setWorkExperience(data.work_experience.map(w => ({
            company_name: w.company_name || '',
            designation: w.designation || '',
            start_date: w.start_date || '',
            end_date: w.end_date || '',
            is_current: w.is_current || false
          })))
          setIsFresher(false)
        } else if (data.current_company || data.current_designation) {
          // work_experience array is empty but top-level fields exist (e.g. Excel imports,
          // resume-parsed candidates) — pre-populate so the edit form matches list/profile.
          setWorkExperience([{
            company_name: data.current_company || '',
            designation: data.current_designation || '',
            start_date: '',
            end_date: '',
            is_current: true
          }])
          setIsFresher(false)
        } else {
          setIsFresher(true)
        }

        if (data.photo_url) setPhotoUrl(data.photo_url)
        setFormData(prev => ({
          ...prev,
          first_name: data.first_name || '',
          last_name: data.last_name || '',
          email: data.email || '',
          mobile: data.mobile || '',
          alternate_mobile: data.alternate_mobile || '',
          date_of_birth: data.date_of_birth || '',
          gender: data.gender || '',
          current_city: data.current_city || '',
          current_state: data.current_state || '',
          preferred_locations: data.preferred_locations || [],
          willing_to_relocate: data.willing_to_relocate || false,
          total_experience_years: (() => {
            const v = data.total_experience_years
            if (!v && v !== 0) return ''
            // Map stored float to nearest dropdown value
            const opt = EXP_OPTIONS.reduce((prev, curr) =>
              Math.abs(curr.value - v) < Math.abs(prev.value - v) ? curr : prev
            )
            return String(opt.value)
          })(),
          total_experience_months: data.total_experience_months || 0,
          current_ctc: data.current_ctc ?? '',
          expected_ctc: data.expected_ctc ?? '',
          notice_period: data.notice_period || 'immediate',
          skills: data.skill_tags || [],
          source: data.source || 'direct',
          linkedin_url: data.linkedin_url || '',
          portfolio_url: data.portfolio_url || '',
          summary: data.notes || data.summary || '',
          status: data.status || 'active',
          resume_url: data.resume_url || ''
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
    setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }))
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }))
  }

  // Education helpers
  const updateEducation = (index, field, value) => {
    setEducation(prev => prev.map((e, i) => i === index ? { ...e, [field]: value } : e))
    const errKey = `edu_${index}_${field}`
    if (errors[errKey]) setErrors(prev => ({ ...prev, [errKey]: '' }))
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
    const errKey = `exp_${index}_${field}`
    if (errors[errKey]) setErrors(prev => ({ ...prev, [errKey]: '' }))
  }
  const addExperience = () => setWorkExperience(prev => [...prev, EMPTY_EXP()])
  const removeExperience = (index) => {
    if (workExperience.length === 1) return
    setWorkExperience(prev => prev.filter((_, i) => i !== index))
  }

  const addSkill = (rawOverride) => {
    const raw = rawOverride !== undefined ? rawOverride : newSkill
    const skill = raw.trim()
    if (skill && !formData.skills.map(s => s.toLowerCase()).includes(skill.toLowerCase())) {
      setFormData(prev => ({ ...prev, skills: [...prev.skills, skill] }))
      if (errors.skills) setErrors(prev => ({ ...prev, skills: '' }))
    }
    if (rawOverride === undefined) setNewSkill('')
  }
  const removeSkill = (skill) => setFormData(prev => ({ ...prev, skills: prev.skills.filter(s => s !== skill) }))

  const handleSkillKeyDown = (e) => {
    if (['Enter', ',', 'Tab'].includes(e.key) || (e.key === ' ' && newSkill.trim())) {
      e.preventDefault()
      addSkill()
    }
  }

  const handleSkillPaste = (e) => {
    e.preventDefault()
    const text = e.clipboardData.getData('text')
    const parts = text.split(/[,\s\t\n]+/).map(s => s.trim()).filter(Boolean)
    setFormData(prev => {
      const existing = new Set(prev.skills.map(s => s.toLowerCase()))
      const toAdd = parts.filter(s => !existing.has(s.toLowerCase()))
      return { ...prev, skills: [...prev.skills, ...toAdd] }
    })
    setNewSkill('')
    if (errors.skills) setErrors(prev => ({ ...prev, skills: '' }))
  }

  const addLocation = (rawOverride) => {
    const raw = rawOverride !== undefined ? rawOverride : newLocation
    const loc = raw.trim()
    if (loc && !formData.preferred_locations.includes(loc)) {
      setFormData(prev => ({ ...prev, preferred_locations: [...prev.preferred_locations, loc] }))
      if (errors.preferred_locations) setErrors(prev => ({ ...prev, preferred_locations: '' }))
    }
    if (rawOverride === undefined) setNewLocation('')
  }
  const removeLocation = (location) => setFormData(prev => ({ ...prev, preferred_locations: prev.preferred_locations.filter(l => l !== location) }))

  const handleLocationKeyDown = (e) => {
    if (['Enter', ',', 'Tab'].includes(e.key) || (e.key === ' ' && newLocation.trim())) {
      e.preventDefault()
      addLocation()
    }
  }

  const handleLocationPaste = (e) => {
    e.preventDefault()
    const text = e.clipboardData.getData('text')
    const parts = text.split(/[,\t\n]+/).map(s => s.trim()).filter(Boolean)
    setFormData(prev => {
      const existing = new Set(prev.preferred_locations)
      const toAdd = parts.filter(s => !existing.has(s))
      return { ...prev, preferred_locations: [...prev.preferred_locations, ...toAdd] }
    })
    setNewLocation('')
    if (errors.preferred_locations) setErrors(prev => ({ ...prev, preferred_locations: '' }))
  }

  // ── Photo handlers ────────────────────────────────────────────────
  const PHOTO_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']

  const handlePhotoFileSelect = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!PHOTO_TYPES.includes(file.type)) {
      toast.error('Please upload a JPG, PNG or WEBP image.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Profile photo must be smaller than 5 MB.')
      return
    }
    setCropFile(file)
  }

  const handleCropSave = async (blob) => {
    setCropFile(null)
    if (isEdit) {
      setUploadingPhoto(true)
      try {
        const fd = new FormData()
        fd.append('file', blob, 'photo.jpg')
        const res = await candidateService.uploadPhoto(id, fd)
        setPhotoUrl(res.photo_url)
        toast.success('Profile photo updated')
      } catch {
        toast.error('Failed to upload photo')
      }
      setUploadingPhoto(false)
    } else {
      const preview = URL.createObjectURL(blob)
      if (croppedPreview) URL.revokeObjectURL(croppedPreview)
      setCroppedBlob(blob)
      setCroppedPreview(preview)
    }
  }

  const handleRemovePhoto = async () => {
    if (croppedPreview) URL.revokeObjectURL(croppedPreview)
    setCroppedBlob(null)
    setCroppedPreview(null)
    setPhotoUrl(null)
    if (isEdit && id) {
      try {
        await candidateService.deletePhoto(id)
      } catch { /* non-fatal */ }
    }
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
      if (errors.resume) setErrors(prev => ({ ...prev, resume: '' }))
      setParsing(true)
      setParseStage('Extracting contact info…')
      try {
        // Phase 1 (fast): local regex — fills email/mobile/linkedin in ~300ms, no AI needed.
        // Phase 2 (slow): AI parse  — fills name, skills, education, experience (3–8s).
        // Both start simultaneously; Phase 1 updates the form as soon as it finishes.
        const localPromise = candidateService.extractResumeLocal(file)
          .then(res => {
            if (res?.data) {
              const lp = res.data
              setFormData(prev => ({
                ...prev,
                email:        lp.email        || prev.email,
                mobile:       lp.mobile       || prev.mobile,
                linkedin_url: lp.linkedin_url || prev.linkedin_url,
              }))
            }
            setParseStage('Analysing with AI…')
          })
          .catch(() => { setParseStage('Analysing with AI…') })

        const aiPromise = candidateService.parseResumeFile(file)

        // Let Phase 1 run in background; await the AI result
        const res = await aiPromise
        await localPromise.catch(() => {})   // ensure Phase 1 errors are swallowed

        if (res?.data) {
          const p = res.data
          // ── Basic fields ──────────────────────────────────────────────
          setFormData(prev => ({
            ...prev,
            first_name:    p.first_name    || prev.first_name,
            last_name:     p.last_name     || prev.last_name,
            // Preserve Phase 1 contact values if already set
            email:         prev.email        || p.email,
            mobile:        prev.mobile       || p.mobile,
            linkedin_url:  prev.linkedin_url || p.linkedin_url,
            current_city:  p.current_city  || prev.current_city,
            skills: p.skills?.length ? p.skills : prev.skills,
            total_experience_years: p.total_experience_years != null && p.total_experience_years > 0
              ? (() => {
                  const opt = EXP_OPTIONS.reduce((a, b) =>
                    Math.abs(b.value - p.total_experience_years) < Math.abs(a.value - p.total_experience_years) ? b : a
                  )
                  return String(opt.value)
                })()
              : prev.total_experience_years,
          }))

          // ── Education array ───────────────────────────────────────────
          if (p.education?.length) {
            setEducation(p.education.map(e => ({
              degree:         e.degree         || '',
              field_of_study: e.field_of_study || '',
              institution:    e.institution    || '',
              from_year:      e.from_year      || '',
              to_year:        e.to_year        || '',
              percentage:     e.percentage     || '',
            })))
          }

          // ── Experience array ──────────────────────────────────────────
          if (p.experience?.length) {
            setWorkExperience(p.experience.map(e => ({
              company_name: e.company_name || '',
              designation:  e.designation  || '',
              start_date:   e.start_date   || '',
              end_date:     e.is_current ? '' : (e.end_date || ''),
              is_current:   e.is_current   || false,
            })))
            setIsFresher(false)
          }

          if (p.first_name || p.email || p.mobile) toast.success('Resume parsed — form auto-filled')
        }
      } catch (err) {
        const msg = err?.response?.data?.detail || 'Resume parsing failed. Please try again or fill the fields manually.'
        toast.error(msg)
      } finally {
        setParsing(false)
        setParseStage('')
      }
      return
    }
    // Edit mode: upload directly
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
    if (!resumeText.trim()) { toast.error('Please paste resume text'); return }
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
          total_experience_years: parsed.experience_years != null ? (() => {
              const opt = EXP_OPTIONS.reduce((a, b) => Math.abs(b.value - parsed.experience_years) < Math.abs(a.value - parsed.experience_years) ? b : a)
              return String(opt.value)
            })() : prev.total_experience_years,
          summary: parsed.summary || prev.summary
        }))
        toast.success(`Resume parsed with ${response.data.confidence || 0}% confidence`)
        setShowResumeParser(false)
      }
    } catch { toast.error('Failed to parse resume') }
    finally { setParsing(false) }
  }

  const MOBILE_RE = /^[6-9]\d{9}$/

  const EDU_MIN_YEARS = {
    'High School': 2,
    'Diploma': 2,
    "Bachelor's": 3,
    "Master's": 2,
    'PhD': 3,
  }

  const validate = () => {
    const errs = {}
    if (!formData.gender) errs.gender = 'Gender is required'

    // DOB validation — also compute dobDate for use in work experience check below
    let dobDate = null
    if (!formData.date_of_birth) {
      errs.date_of_birth = 'Date of birth is required'
    } else {
      dobDate = new Date(formData.date_of_birth)
      const today = new Date()
      if (dobDate >= today) {
        errs.date_of_birth = 'Date of birth must be in the past'
      } else {
        const age = today.getFullYear() - dobDate.getFullYear() - (
          today < new Date(today.getFullYear(), dobDate.getMonth(), dobDate.getDate()) ? 1 : 0
        )
        if (age < 16) {
          errs.date_of_birth = 'Candidate must be at least 16 years old'
          dobDate = null  // invalidate so age check below doesn't run on a bad DOB
        }
      }
    }

    if (formData.skills.length === 0) errs.skills = 'At least one skill is required'
    if (formData.preferred_locations.length === 0) errs.preferred_locations = 'At least one preferred location is required'
    if (!isEdit && !pendingResumeFile) errs.resume = 'Resume is required'

    // Education: all fields required + minimum duration per degree type
    education.forEach((edu, i) => {
      if (!edu.degree) errs[`edu_${i}_degree`] = 'Degree is required'
      if (!edu.field_of_study?.trim()) errs[`edu_${i}_field_of_study`] = 'Specialization is required'
      if (!edu.institution?.trim()) errs[`edu_${i}_institution`] = 'University/College is required'
      if (edu.percentage === '' || edu.percentage === null || edu.percentage === undefined) {
        errs[`edu_${i}_percentage`] = 'Percentage is required'
      } else if (Number(edu.percentage) < 0 || Number(edu.percentage) > 100) {
        errs[`edu_${i}_percentage`] = 'Percentage must be between 0 and 100'
      }
      if (!edu.from_year) {
        errs[`edu_${i}_from_year`] = 'From year is required'
      }
      if (!edu.to_year) {
        errs[`edu_${i}_to_year`] = 'To year is required'
      } else if (edu.from_year && Number(edu.to_year) < Number(edu.from_year)) {
        errs[`edu_${i}_to_year`] = 'To year must be after From year'
      } else if (edu.from_year && edu.degree) {
        const minYears = EDU_MIN_YEARS[edu.degree]
        if (minYears !== undefined) {
          const duration = Number(edu.to_year) - Number(edu.from_year)
          if (duration < minYears) {
            errs[`edu_${i}_to_year`] = `${edu.degree} requires a minimum of ${minYears} year${minYears > 1 ? 's' : ''} of study.`
          }
        }
      }
    })

    // Work experience: all fields required + start date must be after candidate turns 18
    if (!isFresher) {
      workExperience.forEach((exp, i) => {
        if (!exp.company_name?.trim()) errs[`exp_${i}_company_name`] = 'Company name is required'
        if (!exp.designation?.trim()) errs[`exp_${i}_designation`] = 'Designation is required'
        if (!exp.start_date) {
          errs[`exp_${i}_start_date`] = 'Start date is required'
        } else if (new Date(exp.start_date) > new Date()) {
          errs[`exp_${i}_start_date`] = 'Start date cannot be in the future'
        } else if (dobDate) {
          // Enforce: work start date >= DOB + 18 years
          const minWorkDate = new Date(dobDate)
          minWorkDate.setFullYear(minWorkDate.getFullYear() + 18)
          if (new Date(exp.start_date) < minWorkDate) {
            errs[`exp_${i}_start_date`] = 'Work experience cannot start before the candidate reaches 18 years of age.'
          }
        }
        if (!exp.is_current && !exp.end_date) {
          errs[`exp_${i}_end_date`] = 'End date is required'
        } else if (!exp.is_current && exp.end_date && exp.start_date && new Date(exp.end_date) <= new Date(exp.start_date)) {
          errs[`exp_${i}_end_date`] = 'End date must be after start date'
        }
      })
      if (formData.current_ctc === '' || formData.current_ctc === null || formData.current_ctc === undefined) errs.current_ctc = 'Current CTC is required'
      if (formData.expected_ctc === '' || formData.expected_ctc === null || formData.expected_ctc === undefined) errs.expected_ctc = 'Expected CTC is required'
    }

    return errs
  }

  const scrollToFirstError = (errs) => {
    const hasEduErr = Object.keys(errs).some(k => k.startsWith('edu_'))
    const hasExpErr = Object.keys(errs).some(k => k.startsWith('exp_'))
    if (errs.resume && resumeRef.current) { resumeRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' }); return }
    if (errs.gender && genderRef.current) { genderRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' }); return }
    if (errs.date_of_birth && dobRef.current) { dobRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' }); return }
    if ((hasExpErr || errs.current_ctc || errs.expected_ctc) && professionalRef.current) { professionalRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' }); return }
    if (errs.skills && skillsRef.current) { skillsRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' }); return }
    if (hasEduErr && educationRef.current) { educationRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' }); return }
    if (errs.preferred_locations && locationsRef.current) { locationsRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' }); return }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!formData.first_name.trim() || !formData.email.trim()) {
      toast.error('First name and email are required'); return
    }
    if (!formData.mobile) { toast.error('Mobile number is required'); return }
    if (!MOBILE_RE.test(formData.mobile.replace(/\D/g, ''))) {
      toast.error('Mobile number must start with 6–9 and be 10 digits.'); return
    }
    if (formData.alternate_mobile && !MOBILE_RE.test(formData.alternate_mobile.replace(/\D/g, ''))) {
      toast.error('Alternate mobile must start with 6–9 and be 10 digits.'); return
    }

    const validationErrors = validate()
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors)
      scrollToFirstError(validationErrors)
      toast.error(`Please Fill all ${Object.keys(validationErrors).length} required field(s) before submitting`)
      return
    }
    setErrors({})

    try {
      setSaving(true)
      const toFloat = (v) => (v !== '' && v !== null && v !== undefined) ? Number(v) : null
      const toInt = (v) => (v !== '' && v !== null && v !== undefined) ? parseInt(v, 10) : null

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

      // Derive current_company / current_designation from work experience
      const currentExp = expPayload.find(e => e.is_current) || expPayload[expPayload.length - 1]

      const payload = {
        first_name: formData.first_name,
        last_name: formData.last_name || null,
        email: formData.email,
        mobile: formData.mobile,
        alternate_mobile: formData.alternate_mobile || null,
        date_of_birth: formData.date_of_birth || null,
        gender: formData.gender || null,
        current_city: formData.current_city || null,
        current_state: formData.current_state || null,
        total_experience_years: isFresher ? 0 : toFloat(formData.total_experience_years),
        total_experience_months: isFresher ? 0 : toInt(formData.total_experience_months),
        current_company: isFresher ? null : (currentExp?.company_name || null),
        current_designation: isFresher ? null : (currentExp?.designation || null),
        current_ctc: isFresher ? null : toFloat(formData.current_ctc),
        expected_ctc: toFloat(formData.expected_ctc),
        notice_period: isFresher ? 'immediate' : (formData.notice_period || null),
        skills: formData.skills.map(s => ({ name: s })),
        skill_tags: formData.skills,
        education: eduPayload,
        work_experience: expPayload,
        source: formData.source,
        notes: formData.summary || null,
        preferred_locations: formData.preferred_locations,
        willing_to_relocate: formData.willing_to_relocate,
        status: formData.status,
        linkedin_url: formData.linkedin_url || null,
        portfolio_url: formData.portfolio_url || null,
        tags: []
      }

      const parseError = (error) => {
        const detail = error?.response?.data?.detail
        if (Array.isArray(detail)) return detail.map(d => d.msg?.replace('Value error, ', '') || JSON.stringify(d)).join('; ')
        if (typeof detail === 'string') return detail
        return error?.response?.data?.message || error?.message || 'Failed to save candidate'
      }

      if (isEdit) {
        try {
          await candidateService.updateCandidate(id, payload)
          setSubmitted(true)
          toast.success('Candidate updated successfully')
          navigate('/candidates')
        } catch (error) {
          console.error('Candidate update error:', error?.response?.data ?? error)
          toast.error(parseError(error))
        }
        return
      }

      // Create flow: first save the candidate, then upload resume separately
      let createRes
      try {
        createRes = await candidateService.createCandidate(payload)
      } catch (error) {
        console.error('Candidate creation error:', error?.response?.data ?? error)
        toast.error(parseError(error))
        return
      }

      const newId = createRes?.data?.id || createRes?.data?._id

      // Upload photo if staged (non-fatal — candidate was already created)
      if (croppedBlob && newId) {
        try {
          const fd = new FormData()
          fd.append('file', croppedBlob, 'photo.jpg')
          await candidateService.uploadPhoto(newId, fd)
        } catch { /* non-fatal */ }
      }

      // Upload resume in a separate try-catch so a failed upload never hides a successful create
      if (pendingResumeFile && newId) {
        try {
          await candidateService.uploadResume(newId, pendingResumeFile)
        } catch {
          toast.error('Resume upload failed — you can upload it from the Edit Candidate page')
        }
      }

      setSubmitted(true)
      toast.success('Candidate created successfully')
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

  const errCls = 'text-red-500 text-xs mt-1'
  const inputErrCls = (field) => errors[field] ? 'input w-full border-red-400 focus:ring-red-400' : 'input w-full'

  // Resolve a stored path (relative or absolute) to a full URL.
  // In dev, Vite proxies /uploads → backend, so a relative path just works.
  const resolveFileUrl = (path) => {
    if (!path) return ''
    if (path.startsWith('http')) return path
    const base = (import.meta.env.VITE_API_URL || '').replace(/\/api\/v1\/?$/, '')
    return `${base}${path}`
  }
  const fullResumeUrl = resolveFileUrl(formData.resume_url)

  const handleResumeDownload = async () => {
    if (!fullResumeUrl) return
    const ext = (formData.resume_url?.split('.').pop() || 'pdf').toLowerCase()
    const filename = `Resume.${ext}`
    try {
      const resp = await fetch(fullResumeUrl)
      if (!resp.ok) throw new Error()
      const blob = await resp.blob()
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(objectUrl)
    } catch {
      window.open(fullResumeUrl, '_blank', 'noopener,noreferrer')
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/candidates')} className="p-2 hover:bg-surface-100 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-surface-900">{isEdit ? 'Edit Candidate' : 'Add Candidate'}</h1>
            <p className="text-surface-500">{isEdit ? 'Update candidate profile' : 'Create a new candidate profile'}</p>
          </div>
        </div>
        <button onClick={() => setShowResumeParser(!showResumeParser)} className="btn-secondary flex items-center gap-2">
          <Sparkles className="w-4 h-4" />
          AI Resume Parser
        </button>
      </div>

      {/* AI Resume Parser panel */}
      {showResumeParser && (
        <div className="bg-gradient-to-r from-accent-50 to-primary-50 rounded-xl border border-accent-200 p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="w-5 h-5 text-accent-600" />
            <h2 className="text-lg font-semibold text-surface-900">AI Resume Parser</h2>
          </div>
          <p className="text-sm text-surface-600 mb-4">Paste the resume text below and our AI will extract candidate information automatically.</p>
          <textarea value={resumeText} onChange={(e) => setResumeText(e.target.value)} className="input w-full h-48 mb-4" placeholder="Paste resume text here..." />
          <div className="flex justify-end gap-3">
            <button onClick={() => setShowResumeParser(false)} className="btn-secondary">Cancel</button>
            <button onClick={handleParseResume} disabled={parsing} className="btn-primary flex items-center gap-2">
              {parsing ? <><div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>Parsing...</> : <><Sparkles className="w-4 h-4" />Parse Resume</>}
            </button>
          </div>
        </div>
      )}

      {draftAvailable && (
        <DraftRecoveryBanner savedAt={draftSavedAt} onRestore={restoreDraft} onDiscard={discardDraft} />
      )}

      {cropFile && (
        <ImageCropModal
          file={cropFile}
          onSave={handleCropSave}
          onClose={() => setCropFile(null)}
        />
      )}

      <form onSubmit={handleSubmit} className="space-y-6">

        {/* Profile Photo */}
        <div className="bg-white rounded-xl shadow-sm border border-surface-200 p-6">
          <h2 className="text-lg font-semibold text-surface-900 mb-4">Profile Photo</h2>
          <div className="flex items-center gap-6">
            {/* Preview */}
            <div className="flex-shrink-0">
              {(croppedPreview || photoUrl) ? (
                <img
                  src={croppedPreview || resolvePhotoUrl(photoUrl)}
                  alt="Profile"
                  className="w-24 h-24 rounded-full object-cover border-2 border-surface-200 shadow-sm"
                  onError={(e) => { e.currentTarget.style.display = 'none' }}
                />
              ) : (
                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-accent-400 to-accent-600 flex items-center justify-center text-white text-3xl font-bold shadow-sm">
                  {formData.first_name?.charAt(0)?.toUpperCase() || <Camera className="w-8 h-8 opacity-70" />}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex-1">
              <p className="text-sm text-surface-500 mb-3">JPG, PNG or WEBP · Max 5 MB</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  disabled={uploadingPhoto}
                  className="btn-secondary flex items-center gap-2 text-sm"
                >
                  <Camera className="w-4 h-4" />
                  {(croppedPreview || photoUrl) ? 'Change Photo' : 'Upload Photo'}
                </button>
                {(croppedPreview || photoUrl) && (
                  <button
                    type="button"
                    onClick={handleRemovePhoto}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <X className="w-4 h-4" />
                    Remove
                  </button>
                )}
              </div>
              {uploadingPhoto && (
                <p className="text-xs text-accent-600 mt-2 flex items-center gap-1">
                  <span className="inline-block w-3 h-3 border-2 border-accent-500 border-t-transparent rounded-full animate-spin" />
                  Uploading…
                </p>
              )}
            </div>
          </div>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/webp"
            className="hidden"
            onChange={handlePhotoFileSelect}
          />
        </div>

        {/* Resume Upload */}
        <div ref={resumeRef} className="bg-white rounded-xl shadow-sm border border-surface-200 p-6">
          <h2 className="text-lg font-semibold text-surface-900 mb-1">
            Resume {!isEdit && <span className="text-red-500">*</span>}
          </h2>
          {!isEdit && <p className="text-xs text-surface-400 mb-4">Uploading a resume will auto-fill education, skills, experience and city fields</p>}
          {isEdit ? (
            <div className="space-y-3">
              {formData.resume_url ? (
                <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
                  <FileText className="w-5 h-5 text-green-600 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-green-800">Resume uploaded</p>
                    <p className="text-xs text-green-600 truncate">
                      {formData.resume_url.split('/').pop()}
                    </p>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => window.open(fullResumeUrl, '_blank', 'noopener,noreferrer')}
                      className="text-xs text-primary-600 hover:text-primary-800 font-medium px-2 py-1 rounded hover:bg-primary-50 transition-colors"
                    >
                      View
                    </button>
                    <button
                      type="button"
                      onClick={handleResumeDownload}
                      className="text-xs text-primary-600 hover:text-primary-800 font-medium px-2 py-1 rounded hover:bg-primary-50 transition-colors"
                    >
                      Download
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 p-3 bg-amber-50 rounded-lg border border-amber-200">
                  <Upload className="w-4 h-4 text-amber-600 flex-shrink-0" />
                  <p className="text-sm text-amber-700">No resume uploaded yet.</p>
                </div>
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
                  <button type="button" onClick={() => { setPendingResumeFile(null); setErrors(prev => ({ ...prev, resume: 'Resume is required' })) }}
                    className="text-xs text-red-500 hover:text-red-700 font-medium flex-shrink-0">Remove</button>
                </div>
              )}
              {parsing && (
                <p className="text-xs text-accent-600 flex items-center gap-1">
                  <span className="animate-spin inline-block w-3 h-3 border border-accent-500 border-t-transparent rounded-full" />
                  {parseStage || 'Parsing resume…'}
                </p>
              )}
              <input type="file" accept=".pdf,.doc,.docx" onChange={handleResumeUpload}
                className={`block w-full text-sm text-surface-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100 ${errors.resume ? 'border border-red-400 rounded-lg' : ''}`} />
              <p className="text-xs text-surface-400">PDF, DOC, DOCX — max 5 MB</p>
              {errors.resume && <p className={errCls}>{errors.resume}</p>}
            </div>
          )}
        </div>

        {/* Basic Information */}
        <div className="bg-white rounded-xl shadow-sm border border-surface-200 p-6">
          <h2 className="text-lg font-semibold text-surface-900 mb-4">Basic Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">First Name <span className="text-red-500">*</span></label>
              <input type="text" name="first_name" value={formData.first_name} onChange={handleChange} className="input w-full" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">Last Name</label>
              <input type="text" name="last_name" value={formData.last_name} onChange={handleChange} className="input w-full" />
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">Email <span className="text-red-500">*</span></label>
              <input type="email" name="email" value={formData.email} onChange={handleChange} className="input w-full" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">Mobile <span className="text-red-500">*</span></label>
              <input type="tel" name="mobile" value={formData.mobile} onChange={handleChange} className="input w-full" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">Alternate Mobile</label>
              <input type="tel" name="alternate_mobile" value={formData.alternate_mobile} onChange={handleChange} className="input w-full" />
            </div>
            <div ref={dobRef}>
              <label className="block text-sm font-medium text-surface-700 mb-1">Date of Birth <span className="text-red-500">*</span></label>
              <input type="date" name="date_of_birth" value={formData.date_of_birth} onChange={handleChange} className={inputErrCls('date_of_birth')} />
              {errors.date_of_birth && <p className={errCls}>{errors.date_of_birth}</p>}
            </div>
            <div ref={genderRef}>
              <label className="block text-sm font-medium text-surface-700 mb-1">Gender <span className="text-red-500">*</span></label>
              <select name="gender" value={formData.gender} onChange={handleChange} className={inputErrCls('gender')}>
                <option value="">Select</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
              {errors.gender && <p className={errCls}>{errors.gender}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">Current City</label>
              <input type="text" name="current_city" value={formData.current_city} onChange={handleChange} className="input w-full" />
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">Current State</label>
              <input type="text" name="current_state" value={formData.current_state} onChange={handleChange} className="input w-full" placeholder="e.g., Tamil Nadu" />
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">Source</label>
              <select name="source" value={formData.source} onChange={handleChange} className="input w-full">
                {sources.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* I am a fresher checkbox */}
        <div className="bg-white rounded-xl shadow-sm border border-surface-200 p-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={isFresher} onChange={e => setIsFresher(e.target.checked)}
              className="w-4 h-4 rounded border-surface-300 text-accent-600 focus:ring-accent-500" />
            <span className="text-sm font-medium text-surface-700">I am a Fresher (no professional experience)</span>
          </label>
          {isFresher && <p className="text-xs text-surface-400 mt-1 ml-7">Professional / Work Experience section will be skipped</p>}
        </div>

        {/* Work Experience */}
        {!isFresher && (
          <div ref={professionalRef} className="bg-white rounded-xl shadow-sm border border-surface-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-surface-900">Work Experience <span className="text-red-500">*</span></h2>
              <button type="button" onClick={addExperience}
                className="flex items-center gap-1.5 text-sm text-primary-600 hover:text-primary-800 font-medium">
                <Plus className="w-4 h-4" /> Add Experience
              </button>
            </div>
            <div className="space-y-4">
              {workExperience.map((exp, index) => (
                <div key={index} className="border border-surface-200 rounded-lg p-4 relative">
                  {workExperience.length > 1 && (
                    <button type="button" onClick={() => removeExperience(index)}
                      className="absolute top-3 right-3 text-red-400 hover:text-red-600">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-surface-700 mb-1">
                        Company Name <span className="text-red-500">*</span>
                      </label>
                      <input type="text" value={exp.company_name}
                        onChange={e => updateExperience(index, 'company_name', e.target.value)}
                        className={errors[`exp_${index}_company_name`] ? 'input w-full border-red-400 focus:ring-red-400' : 'input w-full'}
                        placeholder="e.g., Infosys Ltd." />
                      {errors[`exp_${index}_company_name`] && <p className={errCls}>{errors[`exp_${index}_company_name`]}</p>}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-surface-700 mb-1">
                        Designation <span className="text-red-500">*</span>
                      </label>
                      <input type="text" value={exp.designation}
                        onChange={e => updateExperience(index, 'designation', e.target.value)}
                        className={errors[`exp_${index}_designation`] ? 'input w-full border-red-400 focus:ring-red-400' : 'input w-full'}
                        placeholder="e.g., Software Engineer" />
                      {errors[`exp_${index}_designation`] && <p className={errCls}>{errors[`exp_${index}_designation`]}</p>}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-surface-700 mb-1">Start Date <span className="text-red-500">*</span></label>
                      <input type="date" value={exp.start_date}
                        onChange={e => updateExperience(index, 'start_date', e.target.value)}
                        className={errors[`exp_${index}_start_date`] ? 'input w-full border-red-400 focus:ring-red-400' : 'input w-full'} />
                      {errors[`exp_${index}_start_date`] && <p className={errCls}>{errors[`exp_${index}_start_date`]}</p>}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-surface-700 mb-1">End Date {!exp.is_current && <span className="text-red-500">*</span>}</label>
                      <input type="date" value={exp.end_date} disabled={exp.is_current}
                        onChange={e => updateExperience(index, 'end_date', e.target.value)}
                        className={`${errors[`exp_${index}_end_date`] ? 'input w-full border-red-400 focus:ring-red-400' : 'input w-full'} ${exp.is_current ? 'opacity-50' : ''}`} />
                      {errors[`exp_${index}_end_date`] && <p className={errCls}>{errors[`exp_${index}_end_date`]}</p>}
                    </div>
                  </div>
                  <label className="flex items-center gap-2 mt-3">
                    <input type="checkbox" checked={exp.is_current}
                      onChange={e => updateExperience(index, 'is_current', e.target.checked)}
                      className="rounded border-surface-300 text-primary-600 focus:ring-primary-500" />
                    <span className="text-sm text-surface-600">Currently working here</span>
                  </label>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 pt-4 border-t border-surface-100">
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1">Total Experience</label>
                <select name="total_experience_years" value={formData.total_experience_years}
                  onChange={handleChange} className="input w-full">
                  <option value="">Select experience</option>
                  {EXP_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1">Current CTC (LPA) <span className="text-red-500">*</span></label>
                <input type="number" name="current_ctc" value={formData.current_ctc} onChange={handleChange}
                  className={inputErrCls('current_ctc')} step="0.1" min="0" />
                {errors.current_ctc && <p className={errCls}>{errors.current_ctc}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1">Expected CTC (LPA) <span className="text-red-500">*</span></label>
                <input type="number" name="expected_ctc" value={formData.expected_ctc} onChange={handleChange}
                  className={inputErrCls('expected_ctc')} step="0.1" min="0" />
                {errors.expected_ctc && <p className={errCls}>{errors.expected_ctc}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1">Notice Period</label>
                <select name="notice_period" value={formData.notice_period} onChange={handleChange} className="input w-full">
                  {noticePeriods.map(n => <option key={n.value} value={n.value}>{n.label}</option>)}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Skills */}
        <div ref={skillsRef} className="bg-white rounded-xl shadow-sm border border-surface-200 p-6">
          <h2 className="text-lg font-semibold text-surface-900 mb-1">Skills <span className="text-red-500">*</span></h2>
          {errors.skills && <p className={`${errCls} mb-3`}>{errors.skills}</p>}
          <div className="flex gap-2 mb-4">
            <input type="text" value={newSkill} onChange={(e) => setNewSkill(e.target.value)}
              onKeyDown={handleSkillKeyDown}
              onPaste={handleSkillPaste}
              className="input flex-1" placeholder="Type skill and press Enter, Comma or Tab…" />
          </div>
          <div className="flex flex-wrap gap-2">
            {formData.skills.map((skill, index) => (
              <span key={index} className="px-3 py-1 bg-primary-100 text-primary-700 rounded-full text-sm flex items-center gap-2">
                {skill}
                <button type="button" onClick={() => removeSkill(skill)} className="hover:text-primary-900"><Trash2 className="w-3 h-3" /></button>
              </span>
            ))}
            {formData.skills.length === 0 && <p className="text-surface-500 text-sm">No skills added</p>}
          </div>
        </div>

        {/* Education */}
        <div ref={educationRef} className="bg-white rounded-xl shadow-sm border border-surface-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-surface-900">Education <span className="text-red-500">*</span></h2>
            <button type="button" onClick={addEducation}
              className="flex items-center gap-1.5 text-sm text-primary-600 hover:text-primary-800 font-medium">
              <Plus className="w-4 h-4" /> Add Education
            </button>
          </div>
          <div className="space-y-4">
            {education.map((edu, index) => (
              <div key={index} className="border border-surface-200 rounded-lg p-4 relative">
                {education.length > 1 && (
                  <button type="button" onClick={() => removeEducation(index)}
                    className="absolute top-3 right-3 text-red-400 hover:text-red-600">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-surface-700 mb-1">
                      Degree <span className="text-red-500">*</span>
                    </label>
                    <select value={edu.degree} onChange={e => updateEducation(index, 'degree', e.target.value)}
                      className={errors[`edu_${index}_degree`] ? 'input w-full border-red-400 focus:ring-red-400' : 'input w-full'}>
                      <option value="">Select</option>
                      <option value="High School">High School</option>
                      <option value="Diploma">Diploma</option>
                      <option value="Bachelor's">Bachelor's Degree</option>
                      <option value="Master's">Master's Degree</option>
                      <option value="PhD">PhD</option>
                      <option value="Other">Other</option>
                    </select>
                    {errors[`edu_${index}_degree`] && <p className={errCls}>{errors[`edu_${index}_degree`]}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-surface-700 mb-1">Field of Study / Specialization <span className="text-red-500">*</span></label>
                    <input type="text" value={edu.field_of_study}
                      onChange={e => updateEducation(index, 'field_of_study', e.target.value)}
                      className={errors[`edu_${index}_field_of_study`] ? 'input w-full border-red-400 focus:ring-red-400' : 'input w-full'}
                      placeholder="e.g., Computer Science" />
                    {errors[`edu_${index}_field_of_study`] && <p className={errCls}>{errors[`edu_${index}_field_of_study`]}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-surface-700 mb-1">University / College <span className="text-red-500">*</span></label>
                    <input type="text" value={edu.institution}
                      onChange={e => updateEducation(index, 'institution', e.target.value)}
                      className={errors[`edu_${index}_institution`] ? 'input w-full border-red-400 focus:ring-red-400' : 'input w-full'}
                      placeholder="e.g., Anna University" />
                    {errors[`edu_${index}_institution`] && <p className={errCls}>{errors[`edu_${index}_institution`]}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-surface-700 mb-1">
                      Percentage / CGPA <span className="text-red-500">*</span>
                    </label>
                    <input type="number" value={edu.percentage}
                      onChange={e => updateEducation(index, 'percentage', e.target.value)}
                      className={errors[`edu_${index}_percentage`] ? 'input w-full border-red-400 focus:ring-red-400' : 'input w-full'}
                      step="0.01" min="0" placeholder="e.g., 72.5" />
                    {errors[`edu_${index}_percentage`] && <p className={errCls}>{errors[`edu_${index}_percentage`]}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-surface-700 mb-1">
                      From Year <span className="text-red-500">*</span>
                    </label>
                    <input type="number" value={edu.from_year}
                      onChange={e => updateEducation(index, 'from_year', e.target.value)}
                      className={errors[`edu_${index}_from_year`] ? 'input w-full border-red-400 focus:ring-red-400' : 'input w-full'}
                      min="1970" max="2030" placeholder="e.g., 2018" />
                    {errors[`edu_${index}_from_year`] && <p className={errCls}>{errors[`edu_${index}_from_year`]}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-surface-700 mb-1">
                      To Year <span className="text-red-500">*</span>
                    </label>
                    <input type="number" value={edu.to_year}
                      onChange={e => updateEducation(index, 'to_year', e.target.value)}
                      className={errors[`edu_${index}_to_year`] ? 'input w-full border-red-400 focus:ring-red-400' : 'input w-full'}
                      min="1970" max="2030" placeholder="e.g., 2022" />
                    {errors[`edu_${index}_to_year`] && <p className={errCls}>{errors[`edu_${index}_to_year`]}</p>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Preferred Locations */}
        <div ref={locationsRef} className="bg-white rounded-xl shadow-sm border border-surface-200 p-6">
          <h2 className="text-lg font-semibold text-surface-900 mb-1">Preferred Locations <span className="text-red-500">*</span></h2>
          {errors.preferred_locations && <p className={`${errCls} mb-3`}>{errors.preferred_locations}</p>}
          <div className="flex gap-2 mb-4">
            <input type="text" value={newLocation} onChange={(e) => setNewLocation(e.target.value)}
              onKeyDown={handleLocationKeyDown}
              onPaste={handleLocationPaste}
              className="input flex-1" placeholder="Type location and press Enter, Comma or Tab…" />
          </div>
          <div className="flex flex-wrap gap-2 mb-4">
            {formData.preferred_locations.map((location, index) => (
              <span key={index} className="px-3 py-1 bg-surface-100 text-surface-700 rounded-full text-sm flex items-center gap-2">
                {location}
                <button type="button" onClick={() => removeLocation(location)} className="hover:text-surface-900"><Trash2 className="w-3 h-3" /></button>
              </span>
            ))}
          </div>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="willing_to_relocate" checked={formData.willing_to_relocate} onChange={handleChange} className="rounded" />
            <span className="text-sm text-surface-600">Willing to relocate</span>
          </label>
        </div>

        {/* Links & Summary */}
        <div className="bg-white rounded-xl shadow-sm border border-surface-200 p-6">
          <h2 className="text-lg font-semibold text-surface-900 mb-4">Additional Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">LinkedIn URL</label>
              <input type="url" name="linkedin_url" value={formData.linkedin_url} onChange={handleChange}
                className="input w-full" placeholder="https://linkedin.com/in/..." />
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">Portfolio URL</label>
              <input type="url" name="portfolio_url" value={formData.portfolio_url} onChange={handleChange}
                className="input w-full" placeholder="https://..." />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">Summary / Notes</label>
            <textarea name="summary" value={formData.summary} onChange={handleChange} className="input w-full" rows={4}
              placeholder="Brief summary about the candidate..." />
          </div>
        </div>

        {/* Status */}
        <div className="bg-white rounded-xl shadow-sm border border-surface-200 p-6">
          <h2 className="text-lg font-semibold text-surface-900 mb-4">Status</h2>
          <div className="max-w-xs">
            <select name="status" value={formData.status} onChange={handleChange} className="input w-full">
              {(statuses.length
                ? statuses
                : [{ value: 'active', label: 'Active' }, { value: 'blacklisted', label: 'Blacklisted' }]
              ).map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3">
          <button type="button" onClick={() => navigate('/candidates')} className="btn-secondary">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2">
            {saving
              ? <><div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>Saving...</>
              : <><Save className="w-4 h-4" />{isEdit ? 'Update Candidate' : 'Create Candidate'}</>
            }
          </button>
        </div>
      </form>
    </div>
  )
}

export default CandidateForm
