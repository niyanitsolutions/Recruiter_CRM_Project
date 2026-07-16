import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { CheckCircle, XCircle, Loader2, Briefcase, MapPin } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../../services/api'

// Public, no-auth apply page for a single Internal Hiring job opening.
// Submitting here creates an Internal Hiring applicant (hrm_candidates) only —
// it never touches the external Recruitment candidates collection.
export default function InternalApplyForm() {
  const { slug } = useParams()
  const [status, setStatus] = useState('loading') // loading | ready | unavailable | submitted
  const [job, setJob] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState({})
  const [form, setForm] = useState({
    full_name: '', email: '', phone: '', total_experience_years: '',
    current_designation: '', linkedin_url: '', portfolio_url: '',
  })
  const [resumeFile, setResumeFile] = useState(null)

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get(`/public/internal-hiring/apply/${slug}`)
        setJob(res.data.job)
        setStatus('ready')
      } catch {
        setStatus('unavailable')
      }
    })()
  }, [slug])

  const validate = () => {
    const e = {}
    if (!form.full_name.trim()) e.full_name = 'Full name is required'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) e.email = 'Valid email is required'
    if (!form.phone.trim()) e.phone = 'Phone is required'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = async (ev) => {
    ev.preventDefault()
    if (!validate()) return
    setSubmitting(true)
    try {
      const res = await api.post(`/public/internal-hiring/apply/${slug}`, {
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        total_experience_years: form.total_experience_years ? Number(form.total_experience_years) : undefined,
        current_designation: form.current_designation.trim() || undefined,
        linkedin_url: form.linkedin_url.trim() || undefined,
        portfolio_url: form.portfolio_url.trim() || undefined,
      })
      const candidateId = res.data.candidate_id
      if (resumeFile && candidateId) {
        const fd = new FormData()
        fd.append('file', resumeFile)
        try {
          await api.post(`/public/internal-hiring/apply/${slug}/resume?candidate_id=${candidateId}`, fd)
        } catch {
          // Non-fatal — application was already created successfully
          toast.error('Application submitted, but the resume could not be uploaded.')
        }
      }
      setStatus('submitted')
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Something went wrong. Please try again.')
    }
    setSubmitting(false)
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  if (status === 'unavailable') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center max-w-md">
          <XCircle className="w-10 h-10 mx-auto mb-3 text-gray-300" />
          <h1 className="text-lg font-semibold text-gray-900">Link unavailable</h1>
          <p className="text-sm text-gray-500 mt-1">
            This application link is invalid, closed, or no longer available.
          </p>
        </div>
      </div>
    )
  }

  if (status === 'submitted') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center max-w-md">
          <CheckCircle className="w-10 h-10 mx-auto mb-3 text-green-500" />
          <h1 className="text-lg font-semibold text-gray-900">Application submitted</h1>
          <p className="text-sm text-gray-500 mt-1">
            Thank you for applying to {job?.job_title}. Our team will be in touch.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-xl mx-auto bg-white rounded-xl border border-gray-200 p-6 sm:p-8">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-gray-900">{job?.job_title}</h1>
          <div className="flex flex-wrap gap-3 mt-2 text-sm text-gray-500">
            {job?.department_name && (
              <span className="flex items-center gap-1"><Briefcase className="w-3.5 h-3.5" />{job.department_name}</span>
            )}
            {(job?.location || job?.is_remote) && (
              <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{job.is_remote ? 'Remote' : job.location}</span>
            )}
          </div>
          {job?.job_description && <p className="text-sm text-gray-600 mt-3 whitespace-pre-line">{job.job_description}</p>}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700">Full Name *</label>
            <input className="input w-full mt-1" value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} />
            {errors.full_name && <p className="text-xs text-red-500 mt-1">{errors.full_name}</p>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700">Email *</label>
              <input type="email" className="input w-full mt-1" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email}</p>}
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Phone *</label>
              <input className="input w-full mt-1" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
              {errors.phone && <p className="text-xs text-red-500 mt-1">{errors.phone}</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700">Experience (years)</label>
              <input type="number" step="0.5" min="0" className="input w-full mt-1" value={form.total_experience_years} onChange={e => setForm(f => ({ ...f, total_experience_years: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Current Designation</label>
              <input className="input w-full mt-1" value={form.current_designation} onChange={e => setForm(f => ({ ...f, current_designation: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Resume</label>
            <input type="file" accept=".pdf,.doc,.docx" className="input w-full mt-1" onChange={e => setResumeFile(e.target.files?.[0] || null)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700">LinkedIn (optional)</label>
              <input className="input w-full mt-1" value={form.linkedin_url} onChange={e => setForm(f => ({ ...f, linkedin_url: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Portfolio (optional)</label>
              <input className="input w-full mt-1" value={form.portfolio_url} onChange={e => setForm(f => ({ ...f, portfolio_url: e.target.value }))} />
            </div>
          </div>
          <button type="submit" disabled={submitting} className="btn-primary w-full">
            {submitting ? 'Submitting…' : 'Submit'}
          </button>
        </form>
      </div>
    </div>
  )
}
