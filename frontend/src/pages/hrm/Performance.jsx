import React, { useState, useEffect } from 'react'
import { Plus, TrendingUp, Star } from 'lucide-react'
import hrmService from '../../services/hrmService'

const RATING_COLORS = {
  exceptional:    'text-purple-600',
  exceeds:        'text-blue-600',
  meets:          'text-green-600',
  below:          'text-yellow-600',
  unsatisfactory: 'text-red-600',
}

export default function Performance() {
  const [reviews, setReviews]   = useState([])
  const [total, setTotal]       = useState(0)
  const [page, setPage]         = useState(1)
  const [loading, setLoading]   = useState(true)
  const [showCreate, setCreate] = useState(false)
  const [form, setForm] = useState({ employee_id: '', review_cycle: 'annual', year: new Date().getFullYear() })
  const [saving, setSaving]     = useState(false)

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

  const handleCreate = async (e) => {
    e.preventDefault()
    setSaving(true)
    try { await hrmService.createReview(form); setCreate(false); load() } catch {}
    setSaving(false)
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Performance Reviews</h1>
          <p className="text-sm text-gray-500">{total} reviews</p>
        </div>
        <button onClick={() => setCreate(true)} className="btn-primary flex items-center gap-2 text-sm">
          <Plus className="w-4 h-4" /> Create Review
        </button>
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <form onSubmit={handleCreate} className="bg-white rounded-xl p-6 w-full max-w-md space-y-4 shadow-xl">
            <h2 className="text-lg font-semibold">Create Performance Review</h2>
            <div>
              <label className="text-sm font-medium text-gray-700">Employee ID</label>
              <input className="input w-full mt-1" placeholder="Employee ID" value={form.employee_id} onChange={e => setForm(f => ({ ...f, employee_id: e.target.value }))} required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700">Cycle</label>
                <select className="input w-full mt-1" value={form.review_cycle} onChange={e => setForm(f => ({ ...f, review_cycle: e.target.value }))}>
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
                <input type="number" className="input w-full mt-1" value={form.year} onChange={e => setForm(f => ({ ...f, year: Number(e.target.value) }))} />
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setCreate(false)} className="btn-secondary">Cancel</button>
              <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Creating…' : 'Create'}</button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
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
                <tr key={i}><td colSpan={7} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td></tr>
              ))
            ) : reviews.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                <TrendingUp className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                No reviews yet
              </td></tr>
            ) : reviews.map(rv => (
              <tr key={rv.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{rv.employee_name}</td>
                <td className="px-4 py-3 text-gray-600 capitalize">{rv.review_cycle}</td>
                <td className="px-4 py-3 text-gray-600">{rv.year}</td>
                <td className={`px-4 py-3 capitalize ${RATING_COLORS[rv.self_rating] || 'text-gray-400'}`}>{rv.self_rating || '—'}</td>
                <td className={`px-4 py-3 capitalize ${RATING_COLORS[rv.manager_rating] || 'text-gray-400'}`}>{rv.manager_rating || '—'}</td>
                <td className={`px-4 py-3 capitalize font-medium ${RATING_COLORS[rv.final_rating] || 'text-gray-400'}`}>{rv.final_rating || '—'}</td>
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
      </div>
    </div>
  )
}
