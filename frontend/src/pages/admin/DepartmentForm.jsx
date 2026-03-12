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
  const [formData, setFormData] = useState({ name: '', code: '', description: '', head_user_id: '', parent_department_id: '', is_active: true })
  const [users, setUsers] = useState([])
  const [departments, setDepartments] = useState([])
  const [error, setError] = useState(null)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [usersRes, deptsRes] = await Promise.all([
          userService.getUsers({ page_size: 100 }),
          departmentService.getDepartments()
        ])
        setUsers(usersRes.data || [])
        setDepartments(deptsRes.data || [])
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
            name: dept.name || '', code: dept.code || '', description: dept.description || '',
            head_user_id: dept.head_user_id || '', parent_department_id: dept.parent_department_id || '',
            is_active: dept.is_active ?? true
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
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!formData.name || !formData.code) { setError('Name and Code are required'); return }
    try {
      setSaving(true)
      const submitData = { ...formData }
      Object.keys(submitData).forEach(k => { if (submitData[k] === '') delete submitData[k] })
      if (isEdit) await departmentService.updateDepartment(id, submitData)
      else await departmentService.createDepartment(submitData)
      navigate('/departments')
    } catch (err) { setError(err.response?.data?.detail || 'Failed to save') }
    finally { setSaving(false) }
  }

  if (loading) return <div className="p-6 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-accent-600" /></div>

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <button onClick={() => navigate('/departments')} className="flex items-center gap-2 text-surface-600 hover:text-surface-900 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>
      <h1 className="text-2xl font-bold text-surface-900 mb-6">{isEdit ? 'Edit Department' : 'Add Department'}</h1>
      
      {error && <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-lg">{error}</div>}

      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-surface-100 p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">Department Name *</label>
            <input type="text" name="name" value={formData.name} onChange={handleChange} className="w-full px-3 py-2 border border-surface-300 rounded-lg" />
          </div>
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">Code *</label>
            <input type="text" name="code" value={formData.code} onChange={handleChange} className="w-full px-3 py-2 border border-surface-300 rounded-lg" placeholder="HR, IT, SALES" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-surface-700 mb-1">Description</label>
          <textarea name="description" value={formData.description} onChange={handleChange} rows={3} className="w-full px-3 py-2 border border-surface-300 rounded-lg" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">Department Head</label>
            <select name="head_user_id" value={formData.head_user_id} onChange={handleChange} className="w-full px-3 py-2 border border-surface-300 rounded-lg">
              <option value="">Select</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">Parent Department</label>
            <select name="parent_department_id" value={formData.parent_department_id} onChange={handleChange} className="w-full px-3 py-2 border border-surface-300 rounded-lg">
              <option value="">None</option>
              {departments.filter(d => d.id !== id).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
        </div>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="is_active" checked={formData.is_active} onChange={handleChange} className="rounded border-surface-300 text-accent-600" />
          <span className="text-sm text-surface-700">Active</span>
        </label>
        <div className="flex justify-end gap-4 pt-4">
          <button type="button" onClick={() => navigate('/departments')} className="px-6 py-2 border border-surface-300 rounded-lg">Cancel</button>
          <button type="submit" disabled={saving} className="flex items-center gap-2 px-6 py-2 bg-accent-600 text-white rounded-lg disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
          </button>
        </div>
      </form>
    </div>
  )
}

export default DepartmentForm