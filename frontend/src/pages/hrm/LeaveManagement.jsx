import React, { useState, useEffect } from 'react'
import { Plus, CheckCircle, XCircle, Calendar, Clock } from 'lucide-react'
import hrmService from '../../services/hrmService'
import ModalPortal from '../../components/common/ModalPortal'

const STATUS_COLORS = {
  pending:  'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  cancelled:'bg-gray-100 text-gray-600',
}

export default function LeaveManagement() {
  const [leaves, setLeaves]       = useState([])
  const [total, setTotal]         = useState(0)
  const [page, setPage]           = useState(1)
  const [statusFilter, setStatus] = useState('')
  const [loading, setLoading]     = useState(true)
  const [showApply, setShowApply] = useState(false)
  const [form, setForm] = useState({ from_date: '', to_date: '', leave_type: 'casual', reason: '', duration: 'full_day' })
  const [saving, setSaving]       = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const res = await hrmService.listLeaves({ page, page_size: 20, status: statusFilter || undefined })
      setLeaves(res.data.items || [])
      setTotal(res.data.total || 0)
    } catch {}
    setLoading(false)
  }

  useEffect(() => { load() }, [page, statusFilter])

  const handleApply = async (e) => {
    e.preventDefault()
    setSaving(true)
    try { await hrmService.applyLeave(form); setShowApply(false); load() } catch {}
    setSaving(false)
  }

  const handleAction = async (id, action) => {
    await hrmService.leaveAction(id, { action })
    load()
  }

  const fmt = (d) => d ? new Date(d).toLocaleDateString('en-IN') : '—'

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Leave Management</h1>
          <p className="text-sm text-gray-500">{total} records</p>
        </div>
        <button onClick={() => setShowApply(true)} className="btn-primary flex items-center gap-2 text-sm">
          <Plus className="w-4 h-4" /> Apply Leave
        </button>
      </div>

      <div className="flex gap-3">
        <select className="input w-36" value={statusFilter} onChange={e => { setStatus(e.target.value); setPage(1) }}>
          <option value="">All Status</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      <ModalPortal isOpen={showApply}>
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]">
          <form onSubmit={handleApply} className="bg-white rounded-xl p-6 w-full max-w-md space-y-4 shadow-xl">
            <h2 className="text-lg font-semibold">Apply for Leave</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700">From Date</label>
                <input type="date" className="input w-full mt-1" value={form.from_date} onChange={e => setForm(f => ({ ...f, from_date: e.target.value }))} required />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">To Date</label>
                <input type="date" className="input w-full mt-1" value={form.to_date} onChange={e => setForm(f => ({ ...f, to_date: e.target.value }))} required />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Leave Type</label>
              <select className="input w-full mt-1" value={form.leave_type} onChange={e => setForm(f => ({ ...f, leave_type: e.target.value }))}>
                <option value="casual">Casual Leave</option>
                <option value="sick">Sick Leave</option>
                <option value="earned">Earned Leave</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Duration</label>
              <select className="input w-full mt-1" value={form.duration} onChange={e => setForm(f => ({ ...f, duration: e.target.value }))}>
                <option value="full_day">Full Day</option>
                <option value="half_day_morning">Half Day (Morning)</option>
                <option value="half_day_afternoon">Half Day (Afternoon)</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Reason</label>
              <textarea className="input w-full mt-1" rows={3} value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} />
            </div>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setShowApply(false)} className="btn-secondary">Cancel</button>
              <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Submitting…' : 'Submit'}</button>
            </div>
          </form>
        </div>
      </ModalPortal>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Employee', 'Type', 'From', 'To', 'Days', 'Status', 'Actions'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              [...Array(4)].map((_, i) => (
                <tr key={i}><td colSpan={7} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td></tr>
              ))
            ) : leaves.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400">No leave records found</td></tr>
            ) : leaves.map(lv => (
              <tr key={lv.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{lv.employee_name}</td>
                <td className="px-4 py-3 text-gray-600 capitalize">{lv.leave_type}</td>
                <td className="px-4 py-3 text-gray-600">{fmt(lv.from_date)}</td>
                <td className="px-4 py-3 text-gray-600">{fmt(lv.to_date)}</td>
                <td className="px-4 py-3 text-gray-600">{lv.total_days}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[lv.status] || ''}`}>{lv.status}</span>
                </td>
                <td className="px-4 py-3">
                  {lv.status === 'pending' && (
                    <div className="flex gap-2">
                      <button onClick={() => handleAction(lv.id, 'approve')} className="p-1.5 hover:bg-green-50 rounded text-green-600" title="Approve"><CheckCircle className="w-4 h-4" /></button>
                      <button onClick={() => handleAction(lv.id, 'reject')} className="p-1.5 hover:bg-red-50 rounded text-red-500" title="Reject"><XCircle className="w-4 h-4" /></button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
