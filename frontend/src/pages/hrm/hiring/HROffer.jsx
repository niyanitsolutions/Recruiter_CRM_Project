import React, { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { Plus, FileText, CheckCircle, XCircle, FileSignature } from 'lucide-react'
import hrmService from '../../../services/hrmService'
import documentCenterService from '../../../services/documentCenterService'
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

  // Generate Offer Letter modal (reuses Document Center's own existing
  // template engine as a client — no changes to Document Center itself)
  const [letterOffer, setLetterOffer] = useState(null)
  const [customTemplates, setCustomTemplates] = useState([])
  const [prebuiltTemplates, setPrebuiltTemplates] = useState([])
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [generating, setGenerating] = useState(false)

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

  const handleRespond = async (o, action) => {
    try {
      await hrmService.respondOffer(o.id, { action })
      if (action === 'accept') {
        toast.success('Offer accepted')
        // Section 10: ask before moving to onboarding — never auto-switch
        // status without HR confirming.
        if (window.confirm(`Move ${o.candidate_name} to onboarding now?`)) {
          try {
            await hrmService.createOnboarding({
              candidate_id: o.candidate_id,
              offer_id: o.id,
              designation: o.offered_designation,
              department_name: o.department_name,
              joining_date: o.joining_date,
            })
            toast.success('Onboarding started')
          } catch (err) {
            toast.error(err?.response?.data?.detail || 'Failed to start onboarding — you can start it manually from the Onboarding tab')
          }
        }
      } else {
        toast.success('Offer rejected')
      }
    } catch (err) {
      // Backend enforces: only draft/sent offers can be responded to
      toast.error(err?.response?.data?.detail || 'Failed to update offer')
    }
    load()
  }

  const openGenerateLetter = async (offer) => {
    setLetterOffer(offer)
    setSelectedTemplateId('')
    try {
      const [tRes, lRes] = await Promise.all([
        documentCenterService.listTemplates(),
        documentCenterService.getLibrary(),
      ])
      setCustomTemplates(tRes.data?.data?.templates || [])
      setPrebuiltTemplates(lRes.data?.data || [])
    } catch {
      toast.error('Failed to load Document Center templates')
    }
  }

  const handleGenerateLetter = async () => {
    if (!selectedTemplateId) {
      toast.error('Please select a template')
      return
    }
    setGenerating(true)
    try {
      const res = await hrmService.generateOfferLetter(letterOffer.id, { template_id: selectedTemplateId })
      toast.success('Offer letter generated and saved to Document Center')
      setLetterOffer(null)
      load()
      if (res.data?.pdf_url) window.open(res.data.pdf_url, '_blank')
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to generate offer letter')
    }
    setGenerating(false)
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

      {/* Generate Offer Letter — Document Center templates, reused as-is */}
      <ModalPortal isOpen={!!letterOffer}>
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg space-y-4 shadow-xl max-h-[85vh] overflow-y-auto">
            <h2 className="text-lg font-semibold">Generate Offer Letter — {letterOffer?.candidate_name}</h2>
            <div className="bg-gray-50 rounded-lg p-3 text-sm border border-gray-200 space-y-1">
              <p><span className="text-gray-500">Designation:</span> <span className="font-medium text-gray-900">{letterOffer?.offered_designation || '—'}</span></p>
              <p><span className="text-gray-500">CTC:</span> <span className="font-medium text-gray-900">{fmtCtc(letterOffer?.offered_ctc)}</span></p>
              <p><span className="text-gray-500">Joining Date:</span> <span className="font-medium text-gray-900">{fmt(letterOffer?.joining_date)}</span></p>
              <p className="text-xs text-gray-400 mt-1">These fields auto-fill the selected template's merge fields.</p>
            </div>

            {customTemplates.length > 0 && (
              <div>
                <label className="text-sm font-medium text-gray-700">Custom Templates</label>
                <div className="space-y-1 mt-1">
                  {customTemplates.map(t => (
                    <label key={t.id || t._id} className="flex items-center gap-2 text-sm p-2 rounded border border-gray-200 cursor-pointer hover:bg-gray-50">
                      <input type="radio" name="template" checked={selectedTemplateId === (t.id || t._id)} onChange={() => setSelectedTemplateId(t.id || t._id)} />
                      {t.name}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {prebuiltTemplates.length > 0 && (
              <div>
                <label className="text-sm font-medium text-gray-700">Prebuilt Templates</label>
                <div className="grid grid-cols-2 gap-1 mt-1">
                  {prebuiltTemplates.map(t => (
                    <label key={t.key} className="flex items-center gap-2 text-sm p-2 rounded border border-gray-200 cursor-pointer hover:bg-gray-50">
                      <input type="radio" name="template" checked={selectedTemplateId === t.key} onChange={() => setSelectedTemplateId(t.key)} />
                      {t.name || t.label || t.key}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {customTemplates.length === 0 && prebuiltTemplates.length === 0 && (
              <p className="text-sm text-gray-400">Loading templates from Document Center…</p>
            )}

            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setLetterOffer(null)} className="btn-secondary">Cancel</button>
              <button type="button" disabled={generating} onClick={handleGenerateLetter} className="btn-primary">
                {generating ? 'Generating…' : 'Generate PDF'}
              </button>
            </div>
          </div>
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
                  {o.pdf_url && <a href={o.pdf_url} target="_blank" rel="noreferrer" className="block text-xs text-blue-500 hover:underline mt-1">View letter</a>}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button onClick={() => openGenerateLetter(o)} className="p-1.5 hover:bg-indigo-50 rounded text-indigo-500" title="Generate Offer Letter"><FileSignature className="w-4 h-4" /></button>
                    {(o.status === 'draft' || o.status === 'sent') && (
                      <>
                        <button onClick={() => handleRespond(o, 'accept')} className="p-1.5 hover:bg-green-50 rounded text-green-600" title="Accept"><CheckCircle className="w-4 h-4" /></button>
                        <button onClick={() => handleRespond(o, 'reject')} className="p-1.5 hover:bg-red-50 rounded text-red-500" title="Reject"><XCircle className="w-4 h-4" /></button>
                      </>
                    )}
                  </div>
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
