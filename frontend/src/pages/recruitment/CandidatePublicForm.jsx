import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { CheckCircle, XCircle, Loader2 } from 'lucide-react'
import api from '../../services/api'

const CandidatePublicForm = () => {
  const { token } = useParams()
  const [status, setStatus] = useState('loading') // loading | valid | invalid | submitted
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [newSkill, setNewSkill] = useState('')

  const [form, setForm] = useState({
    first_name: '', last_name: '', email: '', mobile: '',
    current_city: '', summary: '', skills: [],
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

  const addSkill = () => {
    const s = newSkill.trim()
    if (s && !form.skills.includes(s)) set('skills', [...form.skills, s])
    setNewSkill('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.first_name.trim() || !form.email.trim()) {
      setError('First name and email are required.')
      return
    }
    try {
      setSaving(true)
      setError('')
      await api.post(`/public/candidate-form/${token}`, form)
      setStatus('submitted')
    } catch (err) {
      setError(err.response?.data?.detail || 'Submission failed. Please try again.')
    } finally {
      setSaving(false)
    }
  }

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
      <div className="max-w-xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-surface-900">Candidate Registration</h1>
          <p className="text-surface-500 mt-1 text-sm">Fill in your details below to apply.</p>
        </div>

        {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}

        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-surface-100 p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">First Name <span className="text-red-500">*</span></label>
              <input value={form.first_name} onChange={e => set('first_name', e.target.value)}
                className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm focus:ring-2 focus:ring-accent-500 focus:border-accent-500"
                placeholder="John" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">Last Name</label>
              <input value={form.last_name} onChange={e => set('last_name', e.target.value)}
                className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm focus:ring-2 focus:ring-accent-500 focus:border-accent-500"
                placeholder="Doe" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">Email <span className="text-red-500">*</span></label>
            <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
              className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm focus:ring-2 focus:ring-accent-500 focus:border-accent-500"
              placeholder="john@example.com" required />
          </div>

          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">Mobile</label>
            <input value={form.mobile} onChange={e => set('mobile', e.target.value)}
              className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm focus:ring-2 focus:ring-accent-500 focus:border-accent-500"
              placeholder="9876543210" />
          </div>

          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">Current City</label>
            <input value={form.current_city} onChange={e => set('current_city', e.target.value)}
              className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm focus:ring-2 focus:ring-accent-500 focus:border-accent-500"
              placeholder="Mumbai" />
          </div>

          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">Skills</label>
            <div className="flex gap-2 mb-2">
              <input value={newSkill} onChange={e => setNewSkill(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addSkill())}
                className="flex-1 px-3 py-2 border border-surface-300 rounded-lg text-sm focus:ring-2 focus:ring-accent-500 focus:border-accent-500"
                placeholder="e.g. React" />
              <button type="button" onClick={addSkill}
                className="px-3 py-2 bg-accent-50 text-accent-700 text-sm rounded-lg hover:bg-accent-100">Add</button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {form.skills.map(s => (
                <span key={s} className="flex items-center gap-1 px-2 py-0.5 bg-accent-50 text-accent-700 text-xs rounded-full">
                  {s}
                  <button type="button" onClick={() => set('skills', form.skills.filter(x => x !== s))}
                    className="hover:text-red-500">×</button>
                </span>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">Brief Summary</label>
            <textarea value={form.summary} onChange={e => set('summary', e.target.value)} rows={3}
              className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm focus:ring-2 focus:ring-accent-500 focus:border-accent-500"
              placeholder="Brief description of your background..." />
          </div>

          <button type="submit" disabled={saving}
            className="w-full py-2.5 bg-accent-600 text-white font-medium rounded-lg hover:bg-accent-700 disabled:opacity-50 flex items-center justify-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {saving ? 'Submitting…' : 'Submit Application'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default CandidatePublicForm
