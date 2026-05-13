import React, { useState, useEffect } from 'react'
import { Plus, Users, ChevronRight } from 'lucide-react'
import hrmService from '../../../services/hrmService'
import ModalPortal from '../../../components/common/ModalPortal'
import TableScroll from '../../../components/common/TableScroll'

const STAGE_COLORS = {
  applied:    'bg-gray-100 text-gray-600',
  screening:  'bg-blue-100 text-blue-700',
  interview:  'bg-purple-100 text-purple-700',
  offer:      'bg-yellow-100 text-yellow-700',
  onboarding: 'bg-orange-100 text-orange-700',
  hired:      'bg-green-100 text-green-700',
  rejected:   'bg-red-100 text-red-700',
  withdrawn:  'bg-gray-100 text-gray-500',
}

export default function HRCandidates() {
  const [cands, setCands]     = useState([])
  const [total, setTotal]     = useState(0)
  const [page, setPage]       = useState(1)
  const [stage, setStage]     = useState('')
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving]   = useState(false)
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', current_designation: '', total_experience_years: '', source: 'direct' })

  const load = async () => {
    setLoading(true)
    try {
      const res = await hrmService.listHiringCandidates({ page, page_size: 20, stage: stage || undefined })
      setCands(res.data.items || [])
      setTotal(res.data.total || 0)
    } catch {}
    setLoading(false)
  }

  useEffect(() => { load() }, [page, stage])

  const handleCreate = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const payload = { ...form, total_experience_years: form.total_experience_years ? Number(form.total_experience_years) : undefined }
      await hrmService.createHiringCandidate(payload)
      setShowForm(false); load()
    } catch {}
    setSaving(false)
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Candidates</h1>
          <p className="text-sm text-gray-500">{total} in pipeline</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2 text-sm">
          <Plus className="w-4 h-4" /> Add Candidate
        </button>
      </div>

      <div className="flex gap-2 flex-wrap">
        {['', 'applied', 'screening', 'interview', 'offer', 'onboarding', 'hired', 'rejected'].map(s => (
          <button key={s} onClick={() => { setStage(s); setPage(1) }}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${stage === s ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {s || 'All Stages'}
          </button>
        ))}
      </div>

      <ModalPortal isOpen={showForm}>
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]">
          <form onSubmit={handleCreate} className="bg-white rounded-xl p-6 w-full max-w-md space-y-4 shadow-xl">
            <h2 className="text-lg font-semibold">Add Candidate</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="text-sm font-medium text-gray-700">Full Name *</label>
                <input className="input w-full mt-1" value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} required />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Email *</label>
                <input type="email" className="input w-full mt-1" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Phone *</label>
                <input className="input w-full mt-1" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} required />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Current Designation</label>
                <input className="input w-full mt-1" value={form.current_designation} onChange={e => setForm(f => ({ ...f, current_designation: e.target.value }))} />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Experience (years)</label>
                <input type="number" step="0.5" className="input w-full mt-1" value={form.total_experience_years} onChange={e => setForm(f => ({ ...f, total_experience_years: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <label className="text-sm font-medium text-gray-700">Source</label>
                <select className="input w-full mt-1" value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))}>
                  {['direct','referral','job_portal','linkedin','campus','agency','other'].map(s => (
                    <option key={s} value={s}>{s.replace('_', ' ')}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
              <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Adding…' : 'Add'}</button>
            </div>
          </form>
        </div>
      </ModalPortal>

      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
        <TableScroll>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Name', 'Contact', 'Designation', 'Experience', 'Source', 'Stage'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              [...Array(4)].map((_, i) => (
                <tr key={i}><td colSpan={6} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td></tr>
              ))
            ) : cands.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400">
                <Users className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                No candidates found
              </td></tr>
            ) : cands.map(c => (
              <tr key={c.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{c.full_name}</td>
                <td className="px-4 py-3 text-gray-600">
                  <div className="text-xs">{c.email}</div>
                  <div className="text-xs text-gray-400">{c.phone}</div>
                </td>
                <td className="px-4 py-3 text-gray-600">{c.current_designation || '—'}</td>
                <td className="px-4 py-3 text-gray-600">{c.total_experience_years != null ? `${c.total_experience_years}y` : '—'}</td>
                <td className="px-4 py-3 text-gray-600 capitalize">{c.source?.replace('_', ' ')}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STAGE_COLORS[c.current_stage] || ''}`}>{c.current_stage}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </TableScroll>
      </div>
    </div>
  )
}
