import React, { useState, useEffect } from 'react'
import { Plus, UserCheck, CheckCircle } from 'lucide-react'
import hrmService from '../../../services/hrmService'
import ModalPortal from '../../../components/common/ModalPortal'

const STATUS_COLORS = {
  initiated:          'bg-gray-100 text-gray-600',
  in_progress:        'bg-blue-100 text-blue-700',
  documents_pending:  'bg-yellow-100 text-yellow-700',
  completed:          'bg-green-100 text-green-700',
  cancelled:          'bg-red-100 text-red-700',
}

export default function HROnboarding() {
  const [onbs, setOnbs]       = useState([])
  const [total, setTotal]     = useState(0)
  const [page, setPage]       = useState(1)
  const [status, setStatus]   = useState('')
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving]   = useState(false)
  const [completing, setCompleting] = useState(null)
  const [form, setForm] = useState({ candidate_id: '', designation: '', department_name: '', joining_date: '' })

  const load = async () => {
    setLoading(true)
    try {
      const res = await hrmService.listOnboardings({ page, page_size: 20, status: status || undefined })
      setOnbs(res.data.items || [])
      setTotal(res.data.total || 0)
    } catch {}
    setLoading(false)
  }

  useEffect(() => { load() }, [page, status])

  const handleCreate = async (e) => {
    e.preventDefault()
    setSaving(true)
    try { await hrmService.createOnboarding(form); setShowForm(false); load() } catch {}
    setSaving(false)
  }

  const handleComplete = async (id, name) => {
    if (!window.confirm(`Complete onboarding for ${name} and create employee record?`)) return
    setCompleting(id)
    try { await hrmService.completeOnboarding(id); load() } catch {}
    setCompleting(null)
  }

  const fmt = (d) => d ? new Date(d).toLocaleDateString('en-IN') : '—'

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Onboarding</h1>
          <p className="text-sm text-gray-500">{total} records</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2 text-sm">
          <Plus className="w-4 h-4" /> Start Onboarding
        </button>
      </div>

      <div className="flex gap-3">
        <select className="input w-44" value={status} onChange={e => { setStatus(e.target.value); setPage(1) }}>
          <option value="">All Status</option>
          {['initiated','in_progress','documents_pending','completed','cancelled'].map(s => (
            <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
          ))}
        </select>
      </div>

      <ModalPortal isOpen={showForm}>
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]">
          <form onSubmit={handleCreate} className="bg-white rounded-xl p-6 w-full max-w-md space-y-4 shadow-xl">
            <h2 className="text-lg font-semibold">Start Onboarding</h2>
            <div>
              <label className="text-sm font-medium text-gray-700">Candidate ID *</label>
              <input className="input w-full mt-1" value={form.candidate_id} onChange={e => setForm(f => ({ ...f, candidate_id: e.target.value }))} required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700">Designation</label>
                <input className="input w-full mt-1" value={form.designation} onChange={e => setForm(f => ({ ...f, designation: e.target.value }))} />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Department</label>
                <input className="input w-full mt-1" value={form.department_name} onChange={e => setForm(f => ({ ...f, department_name: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <label className="text-sm font-medium text-gray-700">Joining Date</label>
                <input type="date" className="input w-full mt-1" value={form.joining_date} onChange={e => setForm(f => ({ ...f, joining_date: e.target.value }))} />
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
              <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Starting…' : 'Start'}</button>
            </div>
          </form>
        </div>
      </ModalPortal>

      <div className="space-y-3">
        {loading ? (
          [...Array(3)].map((_, i) => <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />)
        ) : onbs.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-400">
            <UserCheck className="w-8 h-8 mx-auto mb-2 text-gray-300" />
            No onboarding records
          </div>
        ) : onbs.map(ob => (
          <div key={ob.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold text-gray-900">{ob.candidate_name}</h3>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[ob.status] || ''}`}>{ob.status.replace(/_/g, ' ')}</span>
              </div>
              <p className="text-sm text-gray-500">
                {ob.designation || 'No designation'} · {ob.department_name || 'No department'}
                {ob.joining_date ? ` · Joining: ${fmt(ob.joining_date)}` : ''}
              </p>
              {ob.employee_id && <p className="text-xs text-green-600 mt-1">✓ Employee created: {ob.employee_id}</p>}
            </div>
            {ob.status !== 'completed' && ob.status !== 'cancelled' && (
              <button
                onClick={() => handleComplete(ob.id, ob.candidate_name)}
                disabled={completing === ob.id}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500 text-white rounded-lg text-xs hover:bg-green-600 disabled:opacity-50">
                <CheckCircle className="w-3.5 h-3.5" />
                {completing === ob.id ? 'Completing…' : 'Complete & Create Employee'}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
