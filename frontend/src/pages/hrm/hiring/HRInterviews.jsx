import React, { useState, useEffect } from 'react'
import { Plus, Calendar, CheckCircle, XCircle } from 'lucide-react'
import hrmService from '../../../services/hrmService'
import ModalPortal from '../../../components/common/ModalPortal'
import TableScroll from '../../../components/common/TableScroll'
import { getTenantTimezone } from '../../../utils/format'

const RESULT_COLORS = {
  pending:    'bg-gray-100 text-gray-600',
  passed:     'bg-green-100 text-green-700',
  failed:     'bg-red-100 text-red-700',
  no_show:    'bg-orange-100 text-orange-700',
  rescheduled:'bg-blue-100 text-blue-700',
}

export default function HRInterviews() {
  const [interviews, setInterviews] = useState([])
  const [total, setTotal]           = useState(0)
  const [page, setPage]             = useState(1)
  const [loading, setLoading]       = useState(true)
  const [showForm, setShowForm]     = useState(false)
  const [saving, setSaving]         = useState(false)
  const [form, setForm] = useState({ candidate_id: '', round_name: 'Round 1', mode: 'video', scheduled_at: '', duration_minutes: 60 })
  const [feedbackModal, setFeedbackModal] = useState(null)
  const [fbForm, setFbForm] = useState({ result: 'pending', feedback: '', rating: '', recommended_for_next: null })

  const load = async () => {
    setLoading(true)
    try {
      const res = await hrmService.listInterviews({ page, page_size: 20 })
      setInterviews(res.data.items || [])
      setTotal(res.data.total || 0)
    } catch {}
    setLoading(false)
  }

  useEffect(() => { load() }, [page])

  const handleCreate = async (e) => {
    e.preventDefault()
    setSaving(true)
    try { await hrmService.createInterview(form); setShowForm(false); load() } catch {}
    setSaving(false)
  }

  const handleFeedback = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await hrmService.submitInterviewFeedback(feedbackModal.id, { ...fbForm, rating: fbForm.rating ? Number(fbForm.rating) : undefined })
      setFeedbackModal(null); load()
    } catch {}
    setSaving(false)
  }

  const fmt = (dt) => dt ? new Date(dt).toLocaleString('en-IN', { timeZone: getTenantTimezone(), day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }) : '—'

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Interviews</h1>
          <p className="text-sm text-gray-500">{total} scheduled</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2 text-sm">
          <Plus className="w-4 h-4" /> Schedule Interview
        </button>
      </div>

      <ModalPortal isOpen={showForm}>
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]">
          <form onSubmit={handleCreate} className="bg-white rounded-xl p-6 w-full max-w-md space-y-4 shadow-xl">
            <h2 className="text-lg font-semibold">Schedule Interview</h2>
            <div>
              <label className="text-sm font-medium text-gray-700">Candidate ID *</label>
              <input className="input w-full mt-1" value={form.candidate_id} onChange={e => setForm(f => ({ ...f, candidate_id: e.target.value }))} required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700">Round Name</label>
                <input className="input w-full mt-1" value={form.round_name} onChange={e => setForm(f => ({ ...f, round_name: e.target.value }))} />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Mode</label>
                <select className="input w-full mt-1" value={form.mode} onChange={e => setForm(f => ({ ...f, mode: e.target.value }))}>
                  <option value="video">Video</option>
                  <option value="in_person">In Person</option>
                  <option value="phone">Phone</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="text-sm font-medium text-gray-700">Scheduled At *</label>
                <input type="datetime-local" className="input w-full mt-1" value={form.scheduled_at} onChange={e => setForm(f => ({ ...f, scheduled_at: e.target.value }))} required />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Duration (min)</label>
                <input type="number" className="input w-full mt-1" value={form.duration_minutes} onChange={e => setForm(f => ({ ...f, duration_minutes: Number(e.target.value) }))} />
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
              <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Scheduling…' : 'Schedule'}</button>
            </div>
          </form>
        </div>
      </ModalPortal>

      <ModalPortal isOpen={!!feedbackModal}>
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]">
          <form onSubmit={handleFeedback} className="bg-white rounded-xl p-6 w-full max-w-md space-y-4 shadow-xl">
            <h2 className="text-lg font-semibold">Submit Feedback</h2>
            <div>
              <label className="text-sm font-medium text-gray-700">Result</label>
              <select className="input w-full mt-1" value={fbForm.result} onChange={e => setFbForm(f => ({ ...f, result: e.target.value }))}>
                {['pending','passed','failed','no_show','rescheduled'].map(r => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Rating (0-5)</label>
              <input type="number" step="0.5" min="0" max="5" className="input w-full mt-1" value={fbForm.rating} onChange={e => setFbForm(f => ({ ...f, rating: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Feedback</label>
              <textarea className="input w-full mt-1" rows={3} value={fbForm.feedback} onChange={e => setFbForm(f => ({ ...f, feedback: e.target.value }))} />
            </div>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setFeedbackModal(null)} className="btn-secondary">Cancel</button>
              <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Saving…' : 'Submit'}</button>
            </div>
          </form>
        </div>
      </ModalPortal>

      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
        <TableScroll>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Candidate', 'Round', 'Mode', 'Scheduled', 'Duration', 'Result', 'Actions'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              [...Array(3)].map((_, i) => (
                <tr key={i}><td colSpan={7} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td></tr>
              ))
            ) : interviews.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                <Calendar className="w-8 h-8 mx-auto mb-2 text-gray-300" />No interviews scheduled
              </td></tr>
            ) : interviews.map(iv => (
              <tr key={iv.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{iv.candidate_name}</td>
                <td className="px-4 py-3 text-gray-600">{iv.round_name}</td>
                <td className="px-4 py-3 text-gray-600 capitalize">{iv.mode?.replace('_', ' ')}</td>
                <td className="px-4 py-3 text-gray-600">{fmt(iv.scheduled_at)}</td>
                <td className="px-4 py-3 text-gray-600">{iv.duration_minutes}m</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${RESULT_COLORS[iv.result] || ''}`}>{iv.result?.replace('_', ' ')}</span>
                </td>
                <td className="px-4 py-3">
                  {iv.result === 'pending' && (
                    <button onClick={() => { setFeedbackModal(iv); setFbForm({ result: 'pending', feedback: '', rating: '', recommended_for_next: null }) }}
                      className="px-3 py-1 bg-blue-50 text-blue-600 rounded text-xs hover:bg-blue-100">
                      Feedback
                    </button>
                  )}
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
