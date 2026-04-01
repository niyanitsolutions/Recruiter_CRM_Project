import React, { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Save, Loader2 } from 'lucide-react'
import departmentService from '../../services/departmentService'
import userService from '../../services/userService'

const DepartmentForm = () => {
  const navigate = useNavigate()
  const { id } = useParams()
  const isEdit = Boolean(id)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({ name: '', description: '', head_user_id: '', is_active: true })
  const [users, setUsers] = useState([])
  const [error, setError] = useState(null)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const usersRes = await userService.getUsers({ page_size: 100 })
        setUsers(usersRes.data || [])
      } catch (err) { console.error(err) }
    }
    fetchData()
  }, [])

  useEffect(() => {
    if (isEdit) {
      const fetchDept = async () => {
        try {
          setLoading(true)
          const response = await departmentService.getDepartment(id)
          const dept = response.data
          setFormData({
            name: dept.name || '',
            description: dept.description || '',
            head_user_id: dept.head_user_id || '',
            is_active: dept.is_active ?? true,
          })
        } catch (err) { setError('Failed to load department') }
        finally { setLoading(false) }
      }
      fetchDept()
    }
  }, [id, isEdit])

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }))
    if (error) setError(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!formData.name.trim()) { setError('Department name is required'); return }
    try {
      setSaving(true)
      const submitData = { ...formData }
      Object.keys(submitData).forEach(k => { if (submitData[k] === '') delete submitData[k] })
      if (isEdit) await departmentService.updateDepartment(id, submitData)
      else await departmentService.createDepartment(submitData)
      navigate('/departments')
    } catch (err) {
      const detail = err.response?.data?.detail || err.response?.data?.message
      setError(typeof detail === 'string' ? detail : 'Failed to save department')
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
      <button onClick={() => navigate('/departments')} className="flex items-center gap-2 text-surface-600 hover:text-surface-900 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>
      <h1 className="text-2xl font-bold text-surface-900 mb-6">{isEdit ? 'Edit Department' : 'Add Department'}</h1>

      {error && <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-lg">{error}</div>}

      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-surface-100 p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-surface-700 mb-1">
            Department Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            name="name"
            value={formData.name}
            onChange={handleChange}
            placeholder="e.g. Human Resources"
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
            placeholder="Brief description of this department"
            className="w-full px-3 py-2 border border-surface-300 rounded-lg focus:ring-2 focus:ring-accent-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-surface-700 mb-1">Department Head</label>
          <select
            name="head_user_id"
            value={formData.head_user_id}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-surface-300 rounded-lg focus:ring-2 focus:ring-accent-500"
          >
            <option value="">— Select Head —</option>
            {users.map(u => (
              <option key={u.id} value={u.id}>{u.full_name}</option>
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
            onClick={() => navigate('/departments')}
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

export default DepartmentForm
