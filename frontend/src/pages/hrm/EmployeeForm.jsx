import React, { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Save } from 'lucide-react'
import hrmService from '../../services/hrmService'

export default function EmployeeForm() {
  const navigate = useNavigate()
  const { id } = useParams()
  const isEdit = !!id
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const [form, setForm] = useState({
    full_name: '', email: '', phone: '', date_of_joining: '',
    designation_name: '', department_name: '', employment_type: 'full_time',
    shift_start_time: '09:00', shift_end_time: '18:00',
  })

  useEffect(() => {
    if (isEdit) {
      hrmService.getEmployee(id).then(r => {
        const e = r.data
        setForm({
          full_name:        e.full_name         || '',
          email:            e.email             || '',
          phone:            e.phone             || '',
          date_of_joining:  e.date_of_joining   || '',
          designation_name: e.designation_name  || '',
          department_name:  e.department_name   || '',
          employment_type:  e.employment_type   || 'full_time',
          shift_start_time: e.shift_start_time  || '09:00',
          shift_end_time:   e.shift_end_time    || '18:00',
        })
      })
    }
  }, [id])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      if (isEdit) {
        await hrmService.updateEmployee(id, form)
      } else {
        await hrmService.createEmployee(form)
      }
      navigate('/hrm/employees')
    } catch (err) {
      setError(err.response?.data?.detail || err.response?.data?.message || 'Failed to save employee')
    }
    setSaving(false)
  }

  const Field = ({ label, name, type = 'text', required, children }) => (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}{required && <span className="text-red-500 ml-1">*</span>}</label>
      {children || (
        <input type={type} className="input w-full" value={form[name] || ''} onChange={e => set(name, e.target.value)} required={required} />
      )}
    </div>
  )

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-2xl font-bold text-gray-900">{isEdit ? 'Edit Employee' : 'Add Employee'}</h1>
      </div>

      {error && <div className="bg-red-50 text-red-700 border border-red-200 rounded-lg p-3 text-sm">{error}</div>}

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field label="Full Name" name="full_name" required />
          <Field label="Email" name="email" type="email" required />
          <Field label="Phone" name="phone" />
          <Field label="Date of Joining" name="date_of_joining" type="date" />
          <Field label="Designation" name="designation_name" />
          <Field label="Department" name="department_name" />
          <Field label="Employment Type" name="employment_type">
            <select className="input w-full" value={form.employment_type} onChange={e => set('employment_type', e.target.value)}>
              <option value="full_time">Full Time</option>
              <option value="part_time">Part Time</option>
              <option value="contract">Contract</option>
              <option value="intern">Intern</option>
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Shift Start" name="shift_start_time" type="time" />
            <Field label="Shift End" name="shift_end_time" type="time" />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={() => navigate(-1)} className="btn-secondary">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2">
            <Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save Employee'}
          </button>
        </div>
      </form>
    </div>
  )
}
