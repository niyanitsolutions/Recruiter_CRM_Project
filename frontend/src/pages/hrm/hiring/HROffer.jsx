import React, { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { Plus, FileText, CheckCircle, XCircle } from 'lucide-react'
import hrmService from '../../../services/hrmService'
import ModalPortal from '../../../components/common/ModalPortal'
import TableScroll from '../../../components/common/TableScroll'
import SearchableSelect from '../../../components/common/SearchableSelect'

const candidateToOption = (c) => ({
  value: c.id,
  label: `${c.full_name} — ${c.email}`,
  searchText: `${c.full_name} ${c.email}`,
})

const STATUS_COLORS = {
  draft:    'bg-gray-100 text-gray-600',
  sent:     'bg-blue-100 text-blue-700',
  accepted: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  expired:  'bg-orange-100 text-orange-700',
  revoked:  'bg-gray-100 text-gray-500',
}

export default function HROffer() {
  const [offers, setOffers]   = useState([])
  const [total, setTotal]     = useState(0)
  const [page, setPage]       = useState(1)
  const [status, setStatus]   = useState('')
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving]   = useState(false)
  const [form, setForm] = useState({ candidate_id: '', offered_designation: '', offered_ctc: '', joining_date: '' })
  const [candidateOptions, setCandidateOptions] = useState([])

  const load = async () => {
    setLoading(true)
    try {
      const res = await hrmService.listOffers({ page, page_size: 20, status: status || undefined })
      setOffers(res.data.items || [])
      setTotal(res.data.total || 0)
    } catch {}
    setLoading(false)
  }

  useEffect(() => { load() }, [page, status])

  const openForm = async () => {
    setShowForm(true)
    try {
      const res = await hrmService.listHiringCandidates({ page: 1, page_size: 200 })
      setCandidateOptions((res.data.items || []).map(candidateToOption))
    } catch {}
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!form.candidate_id) {
      toast.error('Please select a candidate')
      return
    }
    setSaving(true)
    try {
      await hrmService.createOffer({ ...form, offered_ctc: Number(form.offered_ctc) })
      toast.success('Offer created')
      setShowForm(false); load()
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to create offer')
    }
    setSaving(false)
  }

  const handleRespond = async (id, action) => {
    try {
      await hrmService.respondOffer(id, { action })
      toast.success(action === 'accept' ? 'Offer accepted' : 'Offer rejected')
    } catch (err) {
      // Backend enforces: only draft/sent offers can be responded to
      toast.error(err?.response?.data?.detail || 'Failed to update offer')
    }
    load()
  }

  const fmt = (d) => d ? new Date(d).toLocaleDateString('en-IN') : '—'
  const fmtCtc = (n) => n?.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }) || '—'

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Offer Letters</h1>
          <p className="text-sm text-gray-500">{total} total</p>
        </div>
        <button onClick={openForm} className="btn-primary flex items-center gap-2 text-sm">
          <Plus className="w-4 h-4" /> Create Offer
        </button>
      </div>

      <div className="flex gap-3">
        <select className="input w-36" value={status} onChange={e => { setStatus(e.target.value); setPage(1) }}>
          <option value="">All Status</option>
          {['draft','sent','accepted','rejected','expired'].map(s => (
            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>
      </div>

      <ModalPortal isOpen={showForm}>
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]">
          <form onSubmit={handleCreate} className="bg-white rounded-xl p-6 w-full max-w-md space-y-4 shadow-xl">
            <h2 className="text-lg font-semibold">Create Offer Letter</h2>
            <div>
              <label className="text-sm font-medium text-gray-700">Candidate *</label>
              <SearchableSelect
                value={form.candidate_id}
                onChange={(v) => setForm(f => ({ ...f, candidate_id: v }))}
                options={candidateOptions}
                placeholder="Search candidate by name or email…"
                minChars={1}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Offered Designation</label>
              <input className="input w-full mt-1" value={form.offered_designation} onChange={e => setForm(f => ({ ...f, offered_designation: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">CTC (Annual) *</label>
              <input type="number" className="input w-full mt-1" value={form.offered_ctc} onChange={e => setForm(f => ({ ...f, offered_ctc: e.target.value }))} required />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Joining Date</label>
              <input type="date" className="input w-full mt-1" value={form.joining_date} onChange={e => setForm(f => ({ ...f, joining_date: e.target.value }))} />
            </div>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
              <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Creating…' : 'Create'}</button>
            </div>
          </form>
        </div>
      </ModalPortal>

      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
        <TableScroll>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Candidate', 'Designation', 'CTC', 'Joining Date', 'Status', 'Actions'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              [...Array(3)].map((_, i) => (
                <tr key={i}><td colSpan={6} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td></tr>
              ))
            ) : offers.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400">
                <FileText className="w-8 h-8 mx-auto mb-2 text-gray-300" />No offers
              </td></tr>
            ) : offers.map(o => (
              <tr key={o.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{o.candidate_name}</td>
                <td className="px-4 py-3 text-gray-600">{o.offered_designation || '—'}</td>
                <td className="px-4 py-3 text-gray-700 font-medium">{fmtCtc(o.offered_ctc)}</td>
                <td className="px-4 py-3 text-gray-600">{fmt(o.joining_date)}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[o.status] || ''}`}>{o.status}</span>
                </td>
                <td className="px-4 py-3">
                  {(o.status === 'draft' || o.status === 'sent') && (
                    <div className="flex gap-2">
                      <button onClick={() => handleRespond(o.id, 'accept')} className="p-1.5 hover:bg-green-50 rounded text-green-600" title="Accept"><CheckCircle className="w-4 h-4" /></button>
                      <button onClick={() => handleRespond(o.id, 'reject')} className="p-1.5 hover:bg-red-50 rounded text-red-500" title="Reject"><XCircle className="w-4 h-4" /></button>
                    </div>
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
