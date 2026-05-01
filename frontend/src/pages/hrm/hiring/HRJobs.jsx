import React, { useState, useEffect } from 'react'
import { Plus, Briefcase, Edit2, Trash2 } from 'lucide-react'
import hrmService from '../../../services/hrmService'
import ModalPortal from '../../../components/common/ModalPortal'

const STATUS_COLORS = {
  open:      'bg-green-100 text-green-700',
  on_hold:   'bg-yellow-100 text-yellow-700',
  closed:    'bg-gray-100 text-gray-600',
  cancelled: 'bg-red-100 text-red-700',
}

export default function HRJobs() {
  const [jobs, setJobs]       = useState([])
  const [total, setTotal]     = useState(0)
  const [page, setPage]       = useState(1)
  const [status, setStatus]   = useState('')
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editJob, setEditJob]   = useState(null)
  const [saving, setSaving]     = useState(false)
  const [form, setForm] = useState({ job_title: '', department_name: '', num_positions: 1, job_description: '', location: '', is_remote: false })

  const load = async () => {
    setLoading(true)
    try {
      const res = await hrmService.listJobs({ page, page_size: 20, status: status || undefined })
      setJobs(res.data.items || [])
      setTotal(res.data.total || 0)
    } catch {}
    setLoading(false)
  }

  useEffect(() => { load() }, [page, status])

  const open = (j = null) => {
    setEditJob(j)
    setForm(j ? { job_title: j.job_title, department_name: j.department_name || '', num_positions: j.num_positions, job_description: j.job_description || '', location: j.location || '', is_remote: j.is_remote } : { job_title: '', department_name: '', num_positions: 1, job_description: '', location: '', is_remote: false })
    setShowForm(true)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      if (editJob) await hrmService.updateJob(editJob.id, form)
      else await hrmService.createJob(form)
      setShowForm(false); load()
    } catch {}
    setSaving(false)
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this job?')) return
    await hrmService.deleteJob(id); load()
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Job Openings</h1>
          <p className="text-sm text-gray-500">{total} total</p>
        </div>
        <button onClick={() => open()} className="btn-primary flex items-center gap-2 text-sm">
          <Plus className="w-4 h-4" /> Add Job
        </button>
      </div>

      <div className="flex gap-3">
        <select className="input w-32" value={status} onChange={e => { setStatus(e.target.value); setPage(1) }}>
          <option value="">All</option>
          <option value="open">Open</option>
          <option value="on_hold">On Hold</option>
          <option value="closed">Closed</option>
        </select>
      </div>

      <ModalPortal isOpen={showForm}>
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]">
          <form onSubmit={handleSave} className="bg-white rounded-xl p-6 w-full max-w-lg space-y-4 shadow-xl max-h-screen overflow-y-auto">
            <h2 className="text-lg font-semibold">{editJob ? 'Edit Job' : 'New Job Opening'}</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="text-sm font-medium text-gray-700">Job Title *</label>
                <input className="input w-full mt-1" value={form.job_title} onChange={e => setForm(f => ({ ...f, job_title: e.target.value }))} required />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Department</label>
                <input className="input w-full mt-1" value={form.department_name} onChange={e => setForm(f => ({ ...f, department_name: e.target.value }))} />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Positions</label>
                <input type="number" min={1} className="input w-full mt-1" value={form.num_positions} onChange={e => setForm(f => ({ ...f, num_positions: Number(e.target.value) }))} />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Location</label>
                <input className="input w-full mt-1" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} />
              </div>
              <div className="flex items-center gap-2 mt-6">
                <input type="checkbox" id="remote" checked={form.is_remote} onChange={e => setForm(f => ({ ...f, is_remote: e.target.checked }))} />
                <label htmlFor="remote" className="text-sm text-gray-700">Remote Job</label>
              </div>
              <div className="col-span-2">
                <label className="text-sm font-medium text-gray-700">Description</label>
                <textarea className="input w-full mt-1" rows={3} value={form.job_description} onChange={e => setForm(f => ({ ...f, job_description: e.target.value }))} />
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
              <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        </div>
      </ModalPortal>

      <div className="space-y-3">
        {loading ? (
          [...Array(3)].map((_, i) => <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />)
        ) : jobs.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-400">
            <Briefcase className="w-8 h-8 mx-auto mb-2 text-gray-300" />
            No jobs found
          </div>
        ) : jobs.map(j => (
          <div key={j.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold text-gray-900">{j.job_title}</h3>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[j.status] || ''}`}>{j.status}</span>
                {j.is_remote && <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full text-xs">Remote</span>}
              </div>
              <p className="text-sm text-gray-500">{j.department_name || 'No department'} · {j.num_positions} position{j.num_positions !== 1 ? 's' : ''}{j.location ? ` · ${j.location}` : ''}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => open(j)} className="p-1.5 hover:bg-yellow-50 rounded text-yellow-500"><Edit2 className="w-4 h-4" /></button>
              <button onClick={() => handleDelete(j.id)} className="p-1.5 hover:bg-red-50 rounded text-red-500"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
