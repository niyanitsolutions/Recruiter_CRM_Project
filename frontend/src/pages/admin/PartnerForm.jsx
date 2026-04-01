import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Save, Loader2 } from 'lucide-react'
import partnerService from '../../services/partnerService'
import designationService from '../../services/designationService'

const PartnerForm = () => {
  const navigate  = useNavigate()
  const { id }    = useParams()
  const isEdit    = Boolean(id)

  const [loading, setLoading] = useState(false)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState(null)

  const [formData, setFormData] = useState({
    username:       '',
    email:          '',
    full_name:      '',
    mobile:         '',
    password:       '',
    designation:    '',
    designation_id: '',
    status:         'active',
  })

  const [designations, setDesignations] = useState([])
  const [errors,       setErrors]       = useState({})
  const [desigCustom,  setDesigCustom]  = useState('')

  // Load designations
  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await designationService.getDesignations()
        setDesignations(res.data || [])
      } catch (err) { console.error(err) }
    }
    fetchData()
  }, [])

  // Load existing partner on edit
  useEffect(() => {
    if (!isEdit) return
    const fetchPartner = async () => {
      try {
        setLoading(true)
        const response = await partnerService.getPartner(id)
        const p = response.data
        setFormData({
          username:       p.username       || '',
          email:          p.email          || '',
          full_name:      p.full_name      || '',
          mobile:         p.mobile         || '',
          password:       '',
          designation:    p.designation    || '',
          designation_id: p.designation_id || '',
          status:         p.status         || 'active',
        })
      } catch (err) { setError('Failed to load partner') }
      finally { setLoading(false) }
    }
    fetchPartner()
  }, [id, isEdit])

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: null }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const newErrors = {}
    if (!formData.full_name) newErrors.full_name = 'Required'
    if (!formData.username)  newErrors.username  = 'Required'
    if (!formData.email)     newErrors.email     = 'Required'
    if (!formData.mobile) {
      newErrors.mobile = 'Required'
    } else if (!/^[6-9]\d{9}$/.test(formData.mobile.replace(/\D/g, ''))) {
      newErrors.mobile = 'Must start with 6–9 and be 10 digits'
    }
    if (!isEdit) {
      if (!formData.password) {
        newErrors.password = 'Required'
      } else {
        if (formData.password.length < 8)          newErrors.password = 'Minimum 8 characters'
        else if (!/[A-Z]/.test(formData.password)) newErrors.password = 'Must contain at least one uppercase letter'
        else if (!/[a-z]/.test(formData.password)) newErrors.password = 'Must contain at least one lowercase letter'
        else if (!/\d/.test(formData.password))    newErrors.password = 'Must contain at least one number'
      }
    }
    setErrors(newErrors)
    if (Object.keys(newErrors).length > 0) return

    try {
      setSaving(true)

      const normalizeName = (v) =>
        v.trim().replace(/\s+/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

      // On-the-fly Designation creation
      let designationId = formData.designation_id
      let designationName = formData.designation
      if (!isEdit && designationId === 'custom' && desigCustom.trim()) {
        const desigName = normalizeName(desigCustom)
        try {
          const desigRes = await designationService.createDesignation({ name: desigName, code: null })
          const created = desigRes.data
          if (created?.id) {
            designationId   = created.id
            designationName = created.name
            setDesignations(prev => [...prev, created])
          }
        } catch (createErr) {
          const msg = createErr?.response?.data?.detail || ''
          if (typeof msg === 'string' && msg.toLowerCase().includes('already exists')) {
            const listRes = await designationService.getDesignations()
            const existing = (listRes.data || []).find(d => d.name?.toLowerCase().trim() === desigName.toLowerCase().trim())
            if (existing) { designationId = existing.id; designationName = existing.name }
            else throw createErr
          } else throw createErr
        }
      }

      // Build payload
      const submitData = {
        ...formData,
        designation_id: designationId === 'custom' ? undefined : designationId,
        designation:    designationId === 'custom' ? undefined : designationName,
      }

      if (isEdit && !submitData.password) delete submitData.password
      Object.keys(submitData).forEach(k => { if (submitData[k] === '') delete submitData[k] })

      if (isEdit) {
        await partnerService.updatePartner(id, submitData)
      } else {
        await partnerService.createPartner(submitData)
      }

      navigate('/partners')
    } catch (err) {
      const detail = err.response?.data?.detail
      if (Array.isArray(detail)) {
        setError(detail.map(d => d.msg?.replace('Value error, ', '') || d.msg).join('; '))
      } else {
        setError(detail || 'Failed to save')
      }
    } finally { setSaving(false) }
  }

  if (loading) return (
    <div className="p-6 flex justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-accent-600" />
    </div>
  )

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <button onClick={() => navigate('/partners')} className="flex items-center gap-2 text-surface-600 hover:text-surface-900 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to Partners
      </button>
      <h1 className="text-2xl font-bold text-surface-900 mb-6">{isEdit ? 'Edit Partner' : 'Add New Partner'}</h1>

      {error && <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-lg">{error}</div>}

      <form onSubmit={handleSubmit} className="space-y-6">

        {/* Basic Information */}
        <div className="bg-white rounded-xl shadow-sm border border-surface-100 p-6">
          <h2 className="text-lg font-semibold mb-4">Basic Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Full Name <span className="text-red-500">*</span>
              </label>
              <input type="text" name="full_name" value={formData.full_name} onChange={handleChange}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-accent-500 ${errors.full_name ? 'border-red-500' : 'border-surface-300'}`} />
              {errors.full_name && <p className="mt-1 text-sm text-red-500">{errors.full_name}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Username <span className="text-red-500">*</span>
              </label>
              <input type="text" name="username" value={formData.username} onChange={handleChange}
                disabled={isEdit}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-accent-500 ${errors.username ? 'border-red-500' : 'border-surface-300'} ${isEdit ? 'bg-surface-100' : ''}`} />
              {errors.username && <p className="mt-1 text-sm text-red-500">{errors.username}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Email <span className="text-red-500">*</span>
              </label>
              <input type="email" name="email" value={formData.email} onChange={handleChange}
                disabled={isEdit}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-accent-500 ${errors.email ? 'border-red-500' : 'border-surface-300'} ${isEdit ? 'bg-surface-100' : ''}`} />
              {errors.email && <p className="mt-1 text-sm text-red-500">{errors.email}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                Mobile <span className="text-red-500">*</span>
              </label>
              <input type="text" name="mobile" value={formData.mobile} onChange={handleChange}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-accent-500 ${errors.mobile ? 'border-red-500' : 'border-surface-300'}`} />
              {errors.mobile && <p className="mt-1 text-sm text-red-500">{errors.mobile}</p>}
            </div>

            {!isEdit && (
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-surface-700 mb-1">
                  Password <span className="text-red-500">*</span>
                </label>
                <input type="password" name="password" value={formData.password} onChange={handleChange}
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-accent-500 ${errors.password ? 'border-red-500' : 'border-surface-300'}`} />
                <p className="mt-1 text-xs text-surface-500">Min 8 chars, uppercase, lowercase, number.</p>
                {errors.password && <p className="mt-1 text-sm text-red-500">{errors.password}</p>}
              </div>
            )}

          </div>
        </div>

        {/* Additional Details */}
        <div className="bg-white rounded-xl shadow-sm border border-surface-100 p-6">
          <h2 className="text-lg font-semibold mb-4">Additional Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">Designation</label>
              <select name="designation_id" value={formData.designation_id}
                onChange={e => {
                  handleChange(e)
                  if (e.target.value !== 'custom') setDesigCustom('')
                  const selected = designations.find(d => d.id === e.target.value)
                  if (selected) setFormData(prev => ({ ...prev, designation_id: e.target.value, designation: selected.name }))
                }}
                className="w-full px-3 py-2 border border-surface-300 rounded-lg focus:ring-2 focus:ring-accent-500">
                <option value="">Select</option>
                {designations.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                <option value="custom">Custom…</option>
              </select>
              {formData.designation_id === 'custom' && (
                <input type="text" value={desigCustom} onChange={e => setDesigCustom(e.target.value)}
                  placeholder="Enter new designation"
                  className="mt-2 w-full px-3 py-2 border border-surface-300 rounded-lg focus:ring-2 focus:ring-accent-500" />
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">Status</label>
              <select name="status" value={formData.status} onChange={handleChange}
                className="w-full px-3 py-2 border border-surface-300 rounded-lg focus:ring-2 focus:ring-accent-500">
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>

          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-4">
          <button type="button" onClick={() => navigate('/partners')}
            className="px-6 py-2 border border-surface-300 rounded-lg hover:bg-surface-50 transition-colors">
            Cancel
          </button>
          <button type="submit" disabled={saving}
            className="flex items-center gap-2 px-6 py-2 bg-accent-600 hover:bg-accent-700 text-white rounded-lg disabled:opacity-50 transition-colors">
            {saving
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
              : <><Save className="w-4 h-4" /> {isEdit ? 'Update' : 'Create'}</>
            }
          </button>
        </div>

      </form>
    </div>
  )
}

export default PartnerForm
