import React, { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { Plus, Briefcase, Edit2, Trash2, Send, Link2, X, ArrowUp, ArrowDown } from 'lucide-react'
import hrmService from '../../../services/hrmService'
import ModalPortal from '../../../components/common/ModalPortal'

const emptyForm = () => ({
  job_title: '', department_name: '', num_positions: 1, job_description: '',
  location: '', is_remote: false, interview_rounds: [],
})

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
  const [form, setForm] = useState(emptyForm())
  const [inviteJob, setInviteJob] = useState(null)
  const [inviteForm, setInviteForm] = useState({ candidate_name: '', email: '', message: '' })
  const [inviteSaving, setInviteSaving] = useState(false)
  const [copyingLinkId, setCopyingLinkId] = useState(null)

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
    setForm(j ? {
      job_title: j.job_title, department_name: j.department_name || '', num_positions: j.num_positions,
      job_description: j.job_description || '', location: j.location || '', is_remote: j.is_remote,
      interview_rounds: [...(j.interview_rounds || [])].sort((a, b) => a.round_number - b.round_number),
    } : emptyForm())
    setShowForm(true)
  }

  // Interview Rounds editor — keeps round_number sequential (1..N) on every
  // add/remove/reorder so the backend's automatic round-progression always
  // has a clean, contiguous sequence to walk through (section 3).
  const reindexRounds = (rounds) => rounds.map((r, i) => ({ ...r, round_number: i + 1 }))

  const addRound = () => {
    setForm(f => ({
      ...f,
      interview_rounds: reindexRounds([...f.interview_rounds, { round_number: 0, round_name: '' }]),
    }))
  }
  const removeRound = (idx) => {
    setForm(f => ({ ...f, interview_rounds: reindexRounds(f.interview_rounds.filter((_, i) => i !== idx)) }))
  }
  const renameRound = (idx, name) => {
    setForm(f => ({
      ...f,
      interview_rounds: f.interview_rounds.map((r, i) => i === idx ? { ...r, round_name: name } : r),
    }))
  }
  const moveRound = (idx, dir) => {
    setForm(f => {
      const next = [...f.interview_rounds]
      const target = idx + dir
      if (target < 0 || target >= next.length) return f
      ;[next[idx], next[target]] = [next[target], next[idx]]
      return { ...f, interview_rounds: reindexRounds(next) }
    })
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const payload = {
        ...form,
        interview_rounds: form.interview_rounds.filter(r => r.round_name.trim()),
      }
      if (editJob) await hrmService.updateJob(editJob.id, payload)
      else await hrmService.createJob(payload)
      setShowForm(false); load()
    } catch {}
    setSaving(false)
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this job?')) return
    await hrmService.deleteJob(id); load()
  }

  const openInvite = (job) => {
    setInviteJob(job)
    setInviteForm({ candidate_name: '', email: '', message: '' })
  }

  const handleSendInvitation = async (e) => {
    e.preventDefault()
    if (!inviteForm.candidate_name.trim() || !inviteForm.email.trim()) {
      toast.error('Candidate name and email are required')
      return
    }
    setInviteSaving(true)
    try {
      await hrmService.sendApplicationInvitation({
        job_id: inviteJob.id,
        candidate_name: inviteForm.candidate_name.trim(),
        email: inviteForm.email.trim(),
        message: inviteForm.message.trim() || undefined,
        frontend_base_url: window.location.origin,
      })
      toast.success('Invitation Sent')
      setInviteJob(null)
    } catch (err) {
      // Backend enforces: job must be open, no duplicate active invitation
      toast.error(err?.response?.data?.detail || 'Failed to send invitation')
    }
    setInviteSaving(false)
  }

  const handleCopyLink = async (job) => {
    setCopyingLinkId(job.id)
    try {
      const res = await hrmService.getJobPublicLink(job.id, window.location.origin)
      await navigator.clipboard.writeText(res.data.apply_url)
      toast.success('Public application link copied to clipboard')
    } catch {
      toast.error('Failed to generate public link')
    }
    setCopyingLinkId(null)
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
              <div className="col-span-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700">Interview Rounds</label>
                  <button type="button" onClick={addRound} className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1">
                    <Plus className="w-3.5 h-3.5" /> Add Round
                  </button>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  Candidates applying to this job automatically progress through these rounds in order — HR never picks a round manually.
                </p>
                {form.interview_rounds.length === 0 ? (
                  <p className="text-xs text-gray-400 mt-2">No rounds configured — scheduling will use generic "Round 1", "Round 2"… naming.</p>
                ) : (
                  <div className="space-y-2 mt-2">
                    {form.interview_rounds.map((r, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <span className="text-xs text-gray-400 w-14 flex-shrink-0">Round {r.round_number}</span>
                        <input
                          className="input flex-1"
                          placeholder="e.g. Technical Interview"
                          value={r.round_name}
                          onChange={e => renameRound(idx, e.target.value)}
                        />
                        <button type="button" onClick={() => moveRound(idx, -1)} disabled={idx === 0} className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"><ArrowUp className="w-3.5 h-3.5" /></button>
                        <button type="button" onClick={() => moveRound(idx, 1)} disabled={idx === form.interview_rounds.length - 1} className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"><ArrowDown className="w-3.5 h-3.5" /></button>
                        <button type="button" onClick={() => removeRound(idx)} className="p-1 text-red-400 hover:text-red-600"><X className="w-3.5 h-3.5" /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
              <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        </div>
      </ModalPortal>

      <ModalPortal isOpen={!!inviteJob}>
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]">
          <form onSubmit={handleSendInvitation} className="bg-white rounded-xl p-6 w-full max-w-md space-y-4 shadow-xl">
            <h2 className="text-lg font-semibold">Send Application Link</h2>
            <div>
              <label className="text-sm font-medium text-gray-700">Job</label>
              <input className="input w-full mt-1 bg-gray-50" value={inviteJob?.job_title || ''} disabled />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Candidate Name *</label>
              <input className="input w-full mt-1" value={inviteForm.candidate_name} onChange={e => setInviteForm(f => ({ ...f, candidate_name: e.target.value }))} required />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Email *</label>
              <input type="email" className="input w-full mt-1" value={inviteForm.email} onChange={e => setInviteForm(f => ({ ...f, email: e.target.value }))} required />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Optional Message</label>
              <textarea className="input w-full mt-1" rows={3} value={inviteForm.message} onChange={e => setInviteForm(f => ({ ...f, message: e.target.value }))} />
            </div>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setInviteJob(null)} className="btn-secondary">Cancel</button>
              <button type="submit" disabled={inviteSaving} className="btn-primary">{inviteSaving ? 'Sending…' : 'Send'}</button>
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
              <button onClick={() => openInvite(j)} className="p-1.5 hover:bg-blue-50 rounded text-blue-500" title="Send Application Link"><Send className="w-4 h-4" /></button>
              <button onClick={() => handleCopyLink(j)} disabled={copyingLinkId === j.id} className="p-1.5 hover:bg-indigo-50 rounded text-indigo-500 disabled:opacity-50" title="Copy Public Link"><Link2 className="w-4 h-4" /></button>
              <button onClick={() => open(j)} className="p-1.5 hover:bg-yellow-50 rounded text-yellow-500"><Edit2 className="w-4 h-4" /></button>
              <button onClick={() => handleDelete(j.id)} className="p-1.5 hover:bg-red-50 rounded text-red-500"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
