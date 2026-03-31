import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Save, Calendar, DollarSign, MapPin, FileText } from 'lucide-react'
import { onboardService, candidateService, jobService, clientService } from '../../services'

const OnboardForm = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEdit = Boolean(id)

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [candidates, setCandidates] = useState([])
  const [jobs, setJobs] = useState([])
  const [clients, setClients] = useState([])
  
  const [formData, setFormData] = useState({
    candidate_id: '',
    application_id: '',
    job_id: '',
    client_id: '',
    partner_id: '',
    offer_ctc: '',
    offer_designation: '',
    offer_location: '',
    offer_released_date: new Date().toISOString().split('T')[0],
    offer_valid_until: '',
    offer_letter_url: '',
    expected_doj: '',
    payout_days_required: 45,
    documents_required: [],
    notes: ''
  })

  const documentOptions = [
    { value: 'aadhar', label: 'Aadhar Card' },
    { value: 'pan', label: 'PAN Card' },
    { value: 'education', label: 'Education Certificates' },
    { value: 'experience_letter', label: 'Experience Letter' },
    { value: 'relieving_letter', label: 'Relieving Letter' },
    { value: 'salary_slips', label: 'Last 3 Salary Slips' },
    { value: 'bank_statement', label: 'Bank Statement' },
    { value: 'passport_photo', label: 'Passport Size Photo' },
  ]

  useEffect(() => {
    fetchDropdowns()
    if (isEdit) {
      fetchOnboard()
    }
  }, [id])

  const fetchDropdowns = async () => {
    try {
      const [candidatesRes, jobsRes, clientsRes] = await Promise.all([
        candidateService.getCandidates({ page_size: 100 }),
        jobService.getJobs({ page_size: 100, status: 'open' }),
        clientService.getClients({ page_size: 100 })
      ])
      setCandidates(candidatesRes.data || [])
      setJobs(jobsRes.data || [])
      setClients(clientsRes.data || [])
    } catch (error) {
      console.error('Error fetching dropdowns:', error)
    }
  }

  const fetchOnboard = async () => {
    try {
      setLoading(true)
      const data = await onboardService.getById(id)
      setFormData({
        ...data,
        offer_released_date: data.offer_released_date?.split('T')[0] || '',
        offer_valid_until: data.offer_valid_until?.split('T')[0] || '',
        expected_doj: data.expected_doj?.split('T')[0] || '',
      })
    } catch (error) {
      console.error('Error fetching onboard:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleJobChange = (e) => {
    const jobId = e.target.value
    const job = jobs.find(j => j.id === jobId)
    if (job) {
      setFormData(prev => ({
        ...prev,
        job_id: jobId,
        client_id: job.client_id,
        offer_designation: job.title,
        offer_location: job.location || ''
      }))
    }
  }

  const handleDocumentToggle = (docValue) => {
    setFormData(prev => {
      const docs = prev.documents_required || []
      if (docs.includes(docValue)) {
        return { ...prev, documents_required: docs.filter(d => d !== docValue) }
      } else {
        return { ...prev, documents_required: [...docs, docValue] }
      }
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      setSaving(true)
      const payload = {
        ...formData,
        offer_ctc: parseFloat(formData.offer_ctc)
      }
      
      if (isEdit) {
        await onboardService.update(id, payload)
      } else {
        await onboardService.create(payload)
      }
      navigate('/onboards')
    } catch (error) {
      console.error('Error saving onboard:', error)
      alert('Error saving onboard record')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="p-8 text-center">Loading...</div>
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/onboards')}
          className="p-2 hover:bg-surface-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-surface-900">
            {isEdit ? 'Edit Onboard' : 'Release Offer'}
          </h1>
          <p className="text-surface-600">
            {isEdit ? 'Update onboarding details' : 'Create new onboarding record'}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Candidate & Job Selection */}
        <div className="bg-white rounded-xl p-6 border border-surface-200">
          <h2 className="text-lg font-semibold text-surface-900 mb-4">Selection</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Candidate *
              </label>
              <select
                name="candidate_id"
                value={formData.candidate_id}
                onChange={handleChange}
                required
                disabled={isEdit}
                className="w-full px-4 py-2 border border-surface-300 rounded-lg focus:ring-2 focus:ring-primary-500 disabled:bg-surface-100"
              >
                <option value="">Select Candidate</option>
                {candidates.map(c => (
                  <option key={c.id} value={c.id}>{c.full_name} - {c.email}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Job *
              </label>
              <select
                name="job_id"
                value={formData.job_id}
                onChange={handleJobChange}
                required
                disabled={isEdit}
                className="w-full px-4 py-2 border border-surface-300 rounded-lg focus:ring-2 focus:ring-primary-500 disabled:bg-surface-100"
              >
                <option value="">Select Job</option>
                {jobs.map(j => (
                  <option key={j.id} value={j.id}>{j.title} - {j.client_name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Offer Details */}
        <div className="bg-white rounded-xl p-6 border border-surface-200">
          <h2 className="text-lg font-semibold text-surface-900 mb-4">Offer Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                <DollarSign className="w-4 h-4 inline mr-1" />
                Offer CTC (Annual) *
              </label>
              <input
                type="number"
                name="offer_ctc"
                value={formData.offer_ctc}
                onChange={handleChange}
                required
                placeholder="e.g., 600000"
                className="w-full px-4 py-2 border border-surface-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Designation *
              </label>
              <input
                type="text"
                name="offer_designation"
                value={formData.offer_designation}
                onChange={handleChange}
                required
                className="w-full px-4 py-2 border border-surface-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                <MapPin className="w-4 h-4 inline mr-1" />
                Location *
              </label>
              <input
                type="text"
                name="offer_location"
                value={formData.offer_location}
                onChange={handleChange}
                required
                className="w-full px-4 py-2 border border-surface-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                <Calendar className="w-4 h-4 inline mr-1" />
                Offer Released Date *
              </label>
              <input
                type="date"
                name="offer_released_date"
                value={formData.offer_released_date}
                onChange={handleChange}
                required
                className="w-full px-4 py-2 border border-surface-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Offer Valid Until
              </label>
              <input
                type="date"
                name="offer_valid_until"
                value={formData.offer_valid_until}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-surface-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Expected DOJ
              </label>
              <input
                type="date"
                name="expected_doj"
                value={formData.expected_doj}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-surface-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Offer Letter URL
              </label>
              <input
                type="url"
                name="offer_letter_url"
                value={formData.offer_letter_url}
                onChange={handleChange}
                placeholder="https://..."
                className="w-full px-4 py-2 border border-surface-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Payout Days Required
              </label>
              <select
                name="payout_days_required"
                value={formData.payout_days_required}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-surface-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              >
                <option value={45}>45 Days</option>
                <option value={60}>60 Days</option>
                <option value={90}>90 Days</option>
              </select>
            </div>
          </div>
        </div>

        {/* Documents Required */}
        <div className="bg-white rounded-xl p-6 border border-surface-200">
          <h2 className="text-lg font-semibold text-surface-900 mb-4">
            <FileText className="w-5 h-5 inline mr-2" />
            Documents Required
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {documentOptions.map(doc => (
              <label
                key={doc.value}
                className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-colors ${
                  formData.documents_required?.includes(doc.value)
                    ? 'border-primary-500 bg-primary-50'
                    : 'border-surface-300 hover:border-primary-300'
                }`}
              >
                <input
                  type="checkbox"
                  checked={formData.documents_required?.includes(doc.value)}
                  onChange={() => handleDocumentToggle(doc.value)}
                  className="w-4 h-4 text-primary-600 rounded"
                />
                <span className="text-sm">{doc.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div className="bg-white rounded-xl p-6 border border-surface-200">
          <h2 className="text-lg font-semibold text-surface-900 mb-4">Notes</h2>
          <textarea
            name="notes"
            value={formData.notes}
            onChange={handleChange}
            rows={3}
            placeholder="Any additional notes..."
            className="w-full px-4 py-2 border border-surface-300 rounded-lg focus:ring-2 focus:ring-primary-500"
          />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => navigate('/onboards')}
            className="px-6 py-2 border border-surface-300 rounded-lg hover:bg-surface-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
          >
            <Save className="w-5 h-5" />
            {saving ? 'Saving...' : isEdit ? 'Update' : 'Release Offer'}
          </button>
        </div>
      </form>
    </div>
  )
}

export default OnboardForm