import React, { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Save, Loader2 } from 'lucide-react'
import designationService from '../../services/designationService'
import departmentService from '../../services/departmentService'

const DesignationForm = () => {
  const navigate = useNavigate()
  const { id } = useParams()
  const isEdit = Boolean(id)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({ name: '', description: '', department_id: '', is_active: true })
  const [departments, setDepartments] = useState([])
  const [error, setError] = useState(null)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const deptsRes = await departmentService.getDepartments()
        setDepartments(deptsRes.data || [])
      } catch (err) { console.error(err) }
    }
    fetchData()
  }, [])

  useEffect(() => {
    if (isEdit) {
      const fetchDesig = async () => {
        try {
          setLoading(true)
          const response = await designationService.getDesignation(id)
          const desig = response.data
          setFormData({
            name: desig.name || '',
            description: desig.description || '',
            department_id: desig.department_id || '',
            is_active: desig.is_active ?? true,
          })
        } catch (err) { setError('Failed to load designation') }
        finally { setLoading(false) }
      }
      fetchDesig()
    }
  }, [id, isEdit])

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }))
    if (error) setError(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!formData.name.trim()) { setError('Designation name is required'); return }
    try {
      setSaving(true)
      const submitData = { ...formData }
      Object.keys(submitData).forEach(k => { if (submitData[k] === '') delete submitData[k] })
      if (isEdit) await designationService.updateDesignation(id, submitData)
      else await designationService.createDesignation(submitData)
      navigate('/designations')
    } catch (err) {
      const detail = err.response?.data?.detail || err.response?.data?.message
      setError(typeof detail === 'string' ? detail : 'Failed to save designation')
    }
    finally { setSaving(false) }
  }

  if (loading) return (
    <div className="p-6 flex justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-accent-600" />
    </div>
  )

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <button onClick={() => navigate('/designations')} className="flex items-center gap-2 text-surface-600 hover:text-surface-900 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>
      <h1 className="text-2xl font-bold text-surface-900 mb-6">{isEdit ? 'Edit Designation' : 'Add Designation'}</h1>

      {error && <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-lg">{error}</div>}

      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-surface-100 p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-surface-700 mb-1">
            Designation Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            name="name"
            value={formData.name}
            onChange={handleChange}
            placeholder="e.g. Software Engineer"
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-accent-500 ${error && !formData.name ? 'border-red-500' : 'border-surface-300'}`}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-surface-700 mb-1">Description</label>
          <textarea
            name="description"
            value={formData.description}
            onChange={handleChange}
            rows={3}
            placeholder="Brief description of this designation"
            className="w-full px-3 py-2 border border-surface-300 rounded-lg focus:ring-2 focus:ring-accent-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-surface-700 mb-1">Department</label>
          <select
            name="department_id"
            value={formData.department_id}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-surface-300 rounded-lg focus:ring-2 focus:ring-accent-500"
          >
            <option value="">— All Departments —</option>
            {departments.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>

        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            name="is_active"
            checked={formData.is_active}
            onChange={handleChange}
            className="rounded border-surface-300 text-accent-600"
          />
          <span className="text-sm text-surface-700">Active</span>
        </label>

        <div className="flex justify-end gap-3 pt-4 border-t border-surface-100">
          <button
            type="button"
            onClick={() => navigate('/designations')}
            className="px-6 py-2 border border-surface-300 rounded-lg text-surface-700 hover:bg-surface-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2 bg-accent-600 text-white rounded-lg hover:bg-accent-700 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  )
}

export default DesignationForm
