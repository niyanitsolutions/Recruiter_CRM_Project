import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Users, Eye, Edit, CalendarPlus, XCircle, LogOut, Clock } from 'lucide-react'
import { toast } from 'react-hot-toast'
import hrmService from '../../../services/hrmService'
import ModalPortal from '../../../components/common/ModalPortal'
import TableScroll from '../../../components/common/TableScroll'
import ActionMenu, { ActionMenuItem } from '../../../components/common/ActionMenu'

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

// Stages past which a candidate can no longer be rejected/withdrawn by HR.
const TERMINAL_STAGES = new Set(['hired', 'rejected', 'withdrawn'])

// Build the edit-form state from a candidate record. Numbers are kept as
// strings for controlled inputs; skills join to a comma list.
const editFormFrom = (c) => ({
  full_name:              c.full_name || '',
  email:                  c.email || '',
  phone:                  c.phone || '',
  current_company:        c.current_company || '',
  current_designation:    c.current_designation || '',
  total_experience_years: c.total_experience_years ?? '',
  skills:                 Array.isArray(c.skills) ? c.skills.join(', ') : '',
  resume_url:             c.resume_url || '',
  current_salary:         c.current_salary ?? '',
  expected_salary:        c.expected_salary ?? '',
  notice_period_days:     c.notice_period_days ?? '',
  location:               c.location || '',
  notes:                  c.notes || '',
})

export default function HRCandidates() {
  const navigate = useNavigate()
  const [cands, setCands]     = useState([])
  const [total, setTotal]     = useState(0)
  const [page, setPage]       = useState(1)
  const [stage, setStage]     = useState('')
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving]   = useState(false)
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', current_designation: '', total_experience_years: '', source: 'direct' })

  // ── Section 1: applicant actions state ──────────────────────────────────────
  const [editModal, setEditModal]         = useState(null)   // candidate being edited
  const [editForm, setEditForm]           = useState(editFormFrom({}))
  const [editSaving, setEditSaving]       = useState(false)
  const [viewModal, setViewModal]         = useState(null)   // candidate being viewed
  const [timelineModal, setTimelineModal] = useState(null)   // candidate whose timeline is open
  const [timeline, setTimeline]           = useState({ loading: false, events: [] })

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

  // ── Edit (Section 1) ────────────────────────────────────────────────────────
  const openEdit = (c) => { setEditForm(editFormFrom(c)); setEditModal(c) }

  const handleEditSave = async (e) => {
    e.preventDefault()
    setEditSaving(true)
    try {
      // Only send fields that changed to something non-empty; numbers parsed.
      const num = (v) => (v === '' || v === null || v === undefined ? undefined : Number(v))
      const payload = {
        full_name:              editForm.full_name.trim() || undefined,
        email:                  editForm.email.trim() || undefined,
        phone:                  editForm.phone.trim() || undefined,
        current_company:        editForm.current_company.trim() || undefined,
        current_designation:    editForm.current_designation.trim() || undefined,
        total_experience_years: num(editForm.total_experience_years),
        skills:                 editForm.skills.trim()
          ? editForm.skills.split(',').map(s => s.trim()).filter(Boolean)
          : undefined,
        resume_url:             editForm.resume_url.trim() || undefined,
        current_salary:         num(editForm.current_salary),
        expected_salary:        num(editForm.expected_salary),
        notice_period_days:     num(editForm.notice_period_days),
        location:               editForm.location.trim() || undefined,
        notes:                  editForm.notes.trim() || undefined,
      }
      await hrmService.updateHiringCandidate(editModal.id, payload)
      toast.success('Candidate updated')
      setEditModal(null); load()
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to update candidate')
    }
    setEditSaving(false)
  }

  // ── Reject / Withdraw (Section 1) ───────────────────────────────────────────
  const changeStage = async (c, newStage, verb) => {
    if (!confirm(`${verb} "${c.full_name}"?`)) return
    try {
      await hrmService.updateHiringCandidate(c.id, { current_stage: newStage })
      toast.success(`${c.full_name} — ${verb.toLowerCase()}d`)
      load()
    } catch (err) {
      toast.error(err?.response?.data?.detail || `Failed to ${verb.toLowerCase()}`)
    }
  }

  // ── Schedule Interview (Section 1) → interviews tab ─────────────────────────
  const scheduleInterview = (c) => {
    navigate(`/hrm/hiring/interviews?candidate=${encodeURIComponent(c.id)}`)
  }

  // ── View Timeline (Sections 9/10) ───────────────────────────────────────────
  const openTimeline = async (c) => {
    setTimelineModal(c)
    setTimeline({ loading: true, events: [] })
    try {
      const [candRes, ivRes] = await Promise.all([
        hrmService.getHiringCandidate(c.id),
        hrmService.listInterviews({ candidate_id: c.id, page: 1, page_size: 100 }),
      ])
      const cand = candRes.data || {}
      const interviews = ivRes.data?.items || []
      const events = []
      if (cand.created_at) events.push({ ts: cand.created_at, label: 'Application received', kind: 'applied' })
      for (const h of (cand.stage_history || [])) {
        const st = typeof h.stage === 'string' ? h.stage : (h.stage?.value || String(h.stage))
        events.push({ ts: h.changed_at, label: `Stage → ${st}`, kind: st })
      }
      for (const iv of interviews) {
        events.push({ ts: iv.scheduled_at, label: `${iv.round_name || 'Interview'} scheduled`, kind: 'interview' })
        if (iv.completed_at) {
          events.push({ ts: iv.completed_at, label: `${iv.round_name || 'Interview'} — ${iv.result}`, kind: iv.result })
        }
      }
      events.sort((a, b) => new Date(a.ts || 0) - new Date(b.ts || 0))
      setTimeline({ loading: false, events })
    } catch {
      setTimeline({ loading: false, events: [] })
    }
  }

  const fmt = (ts) => {
    if (!ts) return '—'
    try { return new Date(ts).toLocaleString() } catch { return String(ts) }
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

      {/* Add Candidate modal (unchanged) */}
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

      {/* Edit Candidate modal (Section 1) */}
      <ModalPortal isOpen={!!editModal}>
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4">
          <form onSubmit={handleEditSave} className="bg-white rounded-xl p-6 w-full max-w-2xl space-y-4 shadow-xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold">Edit Candidate</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="text-sm font-medium text-gray-700">Full Name</label>
                <input className="input w-full mt-1" value={editForm.full_name} onChange={e => setEditForm(f => ({ ...f, full_name: e.target.value }))} />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Email</label>
                <input type="email" className="input w-full mt-1" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Mobile</label>
                <input className="input w-full mt-1" value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Current Company</label>
                <input className="input w-full mt-1" value={editForm.current_company} onChange={e => setEditForm(f => ({ ...f, current_company: e.target.value }))} />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Current Designation</label>
                <input className="input w-full mt-1" value={editForm.current_designation} onChange={e => setEditForm(f => ({ ...f, current_designation: e.target.value }))} />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Experience (years)</label>
                <input type="number" step="0.5" className="input w-full mt-1" value={editForm.total_experience_years} onChange={e => setEditForm(f => ({ ...f, total_experience_years: e.target.value }))} />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Notice Period (days)</label>
                <input type="number" className="input w-full mt-1" value={editForm.notice_period_days} onChange={e => setEditForm(f => ({ ...f, notice_period_days: e.target.value }))} />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Current Salary</label>
                <input type="number" className="input w-full mt-1" value={editForm.current_salary} onChange={e => setEditForm(f => ({ ...f, current_salary: e.target.value }))} />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Expected Salary</label>
                <input type="number" className="input w-full mt-1" value={editForm.expected_salary} onChange={e => setEditForm(f => ({ ...f, expected_salary: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <label className="text-sm font-medium text-gray-700">Skills (comma separated)</label>
                <input className="input w-full mt-1" value={editForm.skills} onChange={e => setEditForm(f => ({ ...f, skills: e.target.value }))} placeholder="React, Node.js, SQL" />
              </div>
              <div className="col-span-2">
                <label className="text-sm font-medium text-gray-700">Resume URL</label>
                <input className="input w-full mt-1" value={editForm.resume_url} onChange={e => setEditForm(f => ({ ...f, resume_url: e.target.value }))} placeholder="/api/v1/uploads/resumes/…" />
              </div>
              <div className="col-span-2">
                <label className="text-sm font-medium text-gray-700">Remarks</label>
                <textarea className="input w-full mt-1" rows={2} value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setEditModal(null)} className="btn-secondary">Cancel</button>
              <button type="submit" disabled={editSaving} className="btn-primary">{editSaving ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        </div>
      </ModalPortal>

      {/* View Candidate modal (Section 1) */}
      <ModalPortal isOpen={!!viewModal}>
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg space-y-3 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">{viewModal?.full_name}</h2>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STAGE_COLORS[viewModal?.current_stage] || ''}`}>{viewModal?.current_stage}</span>
            </div>
            {viewModal && (
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                {[
                  ['Email', viewModal.email],
                  ['Mobile', viewModal.phone],
                  ['Current Company', viewModal.current_company],
                  ['Designation', viewModal.current_designation],
                  ['Experience', viewModal.total_experience_years != null ? `${viewModal.total_experience_years} yrs` : '—'],
                  ['Notice Period', viewModal.notice_period_days != null ? `${viewModal.notice_period_days} days` : '—'],
                  ['Current Salary', viewModal.current_salary != null ? viewModal.current_salary : '—'],
                  ['Expected Salary', viewModal.expected_salary != null ? viewModal.expected_salary : '—'],
                  ['Location', viewModal.location],
                  ['Source', viewModal.source?.replace('_', ' ')],
                ].map(([k, v]) => (
                  <div key={k}>
                    <div className="text-xs text-gray-400">{k}</div>
                    <div className="text-gray-800">{v || '—'}</div>
                  </div>
                ))}
                <div className="col-span-2">
                  <div className="text-xs text-gray-400">Skills</div>
                  <div className="text-gray-800">{(viewModal.skills || []).join(', ') || '—'}</div>
                </div>
                {viewModal.resume_url && (
                  <div className="col-span-2">
                    <div className="text-xs text-gray-400">Resume</div>
                    <a href={viewModal.resume_url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline break-all">{viewModal.resume_url}</a>
                  </div>
                )}
                {viewModal.notes && (
                  <div className="col-span-2">
                    <div className="text-xs text-gray-400">Remarks</div>
                    <div className="text-gray-800 whitespace-pre-wrap">{viewModal.notes}</div>
                  </div>
                )}
              </div>
            )}
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setViewModal(null)} className="btn-secondary">Close</button>
              <button onClick={() => { openEdit(viewModal); setViewModal(null) }} className="btn-primary">Edit</button>
            </div>
          </div>
        </div>
      </ModalPortal>

      {/* Timeline modal (Sections 9/10) */}
      <ModalPortal isOpen={!!timelineModal}>
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg space-y-4 shadow-xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold">Timeline — {timelineModal?.full_name}</h2>
            {timeline.loading ? (
              <div className="py-8 text-center text-gray-400 text-sm">Loading…</div>
            ) : timeline.events.length === 0 ? (
              <div className="py-8 text-center text-gray-400 text-sm">No timeline events yet.</div>
            ) : (
              <ol className="relative border-l border-gray-200 ml-2 space-y-4">
                {timeline.events.map((ev, i) => (
                  <li key={i} className="ml-4">
                    <div className="absolute w-2.5 h-2.5 rounded-full -left-[5px] mt-1.5" style={{ background: 'var(--accent, #6366f1)' }} />
                    <div className="text-sm text-gray-800 capitalize">{ev.label}</div>
                    <div className="text-xs text-gray-400">{fmt(ev.ts)}</div>
                  </li>
                ))}
              </ol>
            )}
            <div className="flex justify-end">
              <button onClick={() => setTimelineModal(null)} className="btn-secondary">Close</button>
            </div>
          </div>
        </div>
      </ModalPortal>

      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
        <TableScroll>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Name', 'Contact', 'Designation', 'Experience', 'Source', 'Stage', ''].map((h, i) => (
                <th key={i} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              [...Array(4)].map((_, i) => (
                <tr key={i}><td colSpan={7} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td></tr>
              ))
            ) : cands.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                <Users className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                No candidates found
              </td></tr>
            ) : cands.map(c => {
              const terminal = TERMINAL_STAGES.has(c.current_stage)
              return (
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
                <td className="px-4 py-3 text-right">
                  <ActionMenu>
                    {(close) => (
                      <>
                        <ActionMenuItem label="View Candidate" icon={Eye} onClick={() => { setViewModal(c); close() }} />
                        <ActionMenuItem label="Edit Candidate" icon={Edit} onClick={() => { openEdit(c); close() }} />
                        <ActionMenuItem label="View Timeline" icon={Clock} onClick={() => { openTimeline(c); close() }} />
                        <ActionMenuItem divider />
                        <ActionMenuItem
                          label="Schedule Interview" icon={CalendarPlus}
                          disabled={terminal}
                          onClick={() => { scheduleInterview(c); close() }}
                        />
                        <ActionMenuItem divider />
                        <ActionMenuItem
                          label="Reject Candidate" icon={XCircle} danger
                          disabled={terminal}
                          onClick={() => { changeStage(c, 'rejected', 'Reject'); close() }}
                        />
                        <ActionMenuItem
                          label="Withdraw Application" icon={LogOut} danger
                          disabled={terminal}
                          onClick={() => { changeStage(c, 'withdrawn', 'Withdraw'); close() }}
                        />
                      </>
                    )}
                  </ActionMenu>
                </td>
              </tr>
            )})}
          </tbody>
        </table>
        </TableScroll>
      </div>
    </div>
  )
}
