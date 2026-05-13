import React, { useState, useEffect } from 'react'
import { Plus, TrendingUp, Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import hrmService from '../../services/hrmService'
import ModalPortal from '../../components/common/ModalPortal'
import TableScroll from '../../components/common/TableScroll'

const RATING_COLORS = {
  exceptional:    'text-purple-600',
  exceeds:        'text-blue-600',
  meets:          'text-green-600',
  below:          'text-yellow-600',
  unsatisfactory: 'text-red-600',
}

const EMPTY_POINT = { title: '', description: '', rating: '' }

const EMPTY_FORM = {
  employee_id: '',
  employee_name: '',
  employee_email: '',
  description: '',
  review_cycle: 'annual',
  year: new Date().getFullYear(),
}

export default function Performance() {
  const [reviews, setReviews]       = useState([])
  const [total, setTotal]           = useState(0)
  const [page, setPage]             = useState(1)
  const [loading, setLoading]       = useState(true)
  const [showCreate, setCreate]     = useState(false)
  const [form, setForm]             = useState(EMPTY_FORM)
  const [reviewPoints, setPoints]   = useState([])
  const [saving, setSaving]         = useState(false)
  const [pointsOpen, setPointsOpen] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const res = await hrmService.listReviews({ page, page_size: 20 })
      setReviews(res.data.items || [])
      setTotal(res.data.total || 0)
    } catch {}
    setLoading(false)
  }

  useEffect(() => { load() }, [page])

  const openCreate = () => {
    setForm(EMPTY_FORM)
    setPoints([])
    setPointsOpen(false)
    setCreate(true)
  }

  const addPoint = () => setPoints(p => [...p, { ...EMPTY_POINT }])
  const removePoint = (i) => setPoints(p => p.filter((_, idx) => idx !== i))
  const updatePoint = (i, field, val) =>
    setPoints(p => p.map((pt, idx) => idx === i ? { ...pt, [field]: val } : pt))

  const handleCreate = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const payload = {
        ...form,
        year: Number(form.year),
        review_points: reviewPoints.filter(p => p.title.trim()),
      }
      await hrmService.createReview(payload)
      setCreate(false)
      load()
    } catch {}
    setSaving(false)
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Performance Reviews</h1>
          <p className="text-sm text-gray-500">{total} reviews</p>
        </div>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2 text-sm">
          <Plus className="w-4 h-4" /> Create Review
        </button>
      </div>

      <ModalPortal isOpen={showCreate}>
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] overflow-y-auto py-8">
          <form onSubmit={handleCreate} className="bg-white rounded-xl p-6 w-full max-w-xl space-y-5 shadow-xl mx-4">
            <h2 className="text-lg font-semibold text-gray-900">Create Performance Review</h2>

            {/* Employee */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Employee</h3>
              <div>
                <label className="text-sm font-medium text-gray-700">Employee ID <span className="text-red-500">*</span></label>
                <input
                  className="input w-full mt-1"
                  placeholder="e.g. EMP-001"
                  value={form.employee_id}
                  onChange={e => setForm(f => ({ ...f, employee_id: e.target.value }))}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700">Employee Name</label>
                  <input
                    className="input w-full mt-1"
                    placeholder="Full name"
                    value={form.employee_name}
                    onChange={e => setForm(f => ({ ...f, employee_name: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Employee Email</label>
                  <input
                    type="email"
                    className="input w-full mt-1"
                    placeholder="email@company.com"
                    value={form.employee_email}
                    onChange={e => setForm(f => ({ ...f, employee_email: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            {/* Review Period */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Review Period</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700">Cycle</label>
                  <select
                    className="input w-full mt-1"
                    value={form.review_cycle}
                    onChange={e => setForm(f => ({ ...f, review_cycle: e.target.value }))}
                  >
                    <option value="q1">Q1</option>
                    <option value="q2">Q2</option>
                    <option value="q3">Q3</option>
                    <option value="q4">Q4</option>
                    <option value="annual">Annual</option>
                    <option value="mid_year">Mid Year</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Year</label>
                  <input
                    type="number"
                    className="input w-full mt-1"
                    value={form.year}
                    onChange={e => setForm(f => ({ ...f, year: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="text-sm font-medium text-gray-700">Description / Notes</label>
              <textarea
                className="input w-full mt-1 resize-none"
                rows={3}
                placeholder="Overall context, goals summary, or any notes for this review cycle…"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>

            {/* Review Points */}
            <div>
              <button
                type="button"
                onClick={() => setPointsOpen(o => !o)}
                className="flex items-center gap-2 text-sm font-semibold text-gray-700 uppercase tracking-wide w-full text-left"
              >
                {pointsOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                Review Points {reviewPoints.length > 0 && <span className="normal-case font-normal text-gray-400 ml-1">({reviewPoints.length})</span>}
              </button>

              {pointsOpen && (
                <div className="mt-3 space-y-3">
                  {reviewPoints.map((pt, i) => (
                    <div key={i} className="border border-gray-200 rounded-lg p-3 space-y-2 bg-gray-50">
                      <div className="flex items-center gap-2">
                        <input
                          className="input flex-1"
                          placeholder="Point title (e.g. Communication Skills)"
                          value={pt.title}
                          onChange={e => updatePoint(i, 'title', e.target.value)}
                        />
                        <select
                          className="input w-36"
                          value={pt.rating}
                          onChange={e => updatePoint(i, 'rating', e.target.value)}
                        >
                          <option value="">Rating…</option>
                          <option value="exceptional">Exceptional</option>
                          <option value="exceeds">Exceeds</option>
                          <option value="meets">Meets</option>
                          <option value="below">Below</option>
                          <option value="unsatisfactory">Unsatisfactory</option>
                        </select>
                        <button type="button" onClick={() => removePoint(i)} className="text-red-400 hover:text-red-600">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <textarea
                        className="input w-full resize-none text-sm"
                        rows={2}
                        placeholder="Details or observations…"
                        value={pt.description}
                        onChange={e => updatePoint(i, 'description', e.target.value)}
                      />
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addPoint}
                    className="text-sm text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Review Point
                  </button>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
              <button type="button" onClick={() => setCreate(false)} className="btn-secondary">Cancel</button>
              <button type="submit" disabled={saving} className="btn-primary">
                {saving ? 'Creating…' : 'Create Review'}
              </button>
            </div>
          </form>
        </div>
      </ModalPortal>

      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
        <TableScroll>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Employee', 'Cycle', 'Year', 'Self Rating', 'Manager Rating', 'Final', 'Status'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              [...Array(3)].map((_, i) => (
                <tr key={i}><td colSpan={7} className="px-4 py-3">
                  <div className="h-4 bg-gray-100 rounded animate-pulse" />
                </td></tr>
              ))
            ) : reviews.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                <TrendingUp className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                No reviews yet
              </td></tr>
            ) : reviews.map(rv => (
              <tr key={rv.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900">{rv.employee_name || rv.employee_id}</div>
                  {rv.employee_email && <div className="text-xs text-gray-400">{rv.employee_email}</div>}
                </td>
                <td className="px-4 py-3 text-gray-600 capitalize">{rv.review_cycle}</td>
                <td className="px-4 py-3 text-gray-600">{rv.year}</td>
                <td className={`px-4 py-3 capitalize ${RATING_COLORS[rv.self_rating] || 'text-gray-400'}`}>
                  {rv.self_rating || '—'}
                </td>
                <td className={`px-4 py-3 capitalize ${RATING_COLORS[rv.manager_rating] || 'text-gray-400'}`}>
                  {rv.manager_rating || '—'}
                </td>
                <td className={`px-4 py-3 capitalize font-medium ${RATING_COLORS[rv.final_rating] || 'text-gray-400'}`}>
                  {rv.final_rating || '—'}
                </td>
                <td className="px-4 py-3">
                  {rv.is_finalized
                    ? <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs">Finalized</span>
                    : <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full text-xs">In Progress</span>
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </TableScroll>
      </div>

      {total > 20 && (
        <div className="flex justify-center gap-2">
          <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="btn-secondary text-sm disabled:opacity-40">Prev</button>
          <span className="text-sm text-gray-500 self-center">Page {page}</span>
          <button disabled={reviews.length < 20} onClick={() => setPage(p => p + 1)} className="btn-secondary text-sm disabled:opacity-40">Next</button>
        </div>
      )}
    </div>
  )
}
