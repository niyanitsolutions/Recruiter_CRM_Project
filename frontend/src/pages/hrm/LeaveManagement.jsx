import React, { useState, useEffect, useCallback } from 'react'
import {
  Plus, CheckCircle, XCircle, Calendar, Clock, RefreshCw,
  Loader2, ChevronLeft, ChevronRight, X, AlertCircle,
} from 'lucide-react'
import toast from 'react-hot-toast'
import hrmService from '../../services/hrmService'
import ModalPortal from '../../components/common/ModalPortal'
import TableScroll from '../../components/common/TableScroll'
import { useSelector } from 'react-redux'
import { selectUser, selectUserPermissions } from '../../store/authSlice'

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_STYLE = {
  pending:   { background: 'rgba(245,158,11,0.12)',  color: '#f59e0b' },
  approved:  { background: 'rgba(16,185,129,0.12)',  color: '#10b981' },
  rejected:  { background: 'rgba(239,68,68,0.12)',   color: '#ef4444' },
  cancelled: { background: 'rgba(107,114,128,0.12)', color: '#6b7280' },
  withdrawn: { background: 'rgba(107,114,128,0.12)', color: '#6b7280' },
}

const fmt = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'
const fmtLabel = s => (s || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

// ── Leave Balance Cards ───────────────────────────────────────────────────────

function BalanceCards({ balances, loading }) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="rounded-xl p-4 animate-pulse"
               style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
            <div className="h-3 bg-gray-200 rounded w-20 mb-3" />
            <div className="h-6 bg-gray-200 rounded w-12 mb-1" />
            <div className="h-2 bg-gray-100 rounded w-full mt-3" />
          </div>
        ))}
      </div>
    )
  }

  if (!balances.length) return null

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
      {balances.map(b => {
        const pct = b.allocated > 0 ? Math.min(100, ((b.used + b.pending) / b.allocated) * 100) : 0
        const color = b.color || '#3b82f6'
        return (
          <div key={b.policy_id}
               className="rounded-xl p-4 flex flex-col gap-2"
               style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
              <span className="text-xs font-semibold truncate" style={{ color: 'var(--text-muted)' }}>
                {b.code || b.name}
              </span>
            </div>
            <div className="flex items-end gap-1">
              <span className="text-2xl font-bold leading-none" style={{ color: 'var(--text-heading)' }}>
                {b.remaining}
              </span>
              <span className="text-xs mb-0.5" style={{ color: 'var(--text-muted)' }}>
                / {b.allocated}d
              </span>
            </div>
            {/* Progress bar */}
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-alt)' }}>
              <div className="h-full rounded-full transition-all"
                   style={{ width: `${pct}%`, background: pct >= 90 ? '#ef4444' : color }} />
            </div>
            <div className="flex justify-between text-xs" style={{ color: 'var(--text-disabled)' }}>
              <span>Used {b.used}</span>
              {b.pending > 0 && <span className="text-amber-500">Pending {b.pending}</span>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Apply Leave Modal ─────────────────────────────────────────────────────────

function ApplyLeaveModal({ open, onClose, onSuccess, policies }) {
  const EMPTY = { leave_type: '', duration: 'full_day', from_date: '', to_date: '', reason: '' }
  const [form, setForm]   = useState(EMPTY)
  const [err, setErr]     = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open && policies.length > 0 && !form.leave_type) {
      setForm(f => ({ ...f, leave_type: policies[0].leave_type }))
    }
  }, [open, policies])

  const close = () => { setForm(EMPTY); setErr(''); onClose() }

  const submit = async e => {
    e.preventDefault()
    setErr('')
    if (!form.from_date || !form.to_date) { setErr('Select both from and to dates.'); return }
    if (form.from_date > form.to_date)    { setErr('From date cannot be after to date.'); return }
    if (!form.reason || form.reason.trim().length < 5) { setErr('Reason must be at least 5 characters.'); return }

    setSaving(true)
    try {
      await hrmService.applyLeave(form)
      toast.success('Leave application submitted')
      close()
      onSuccess()
    } catch (ex) {
      const d = ex?.response?.data?.detail
      setErr(typeof d === 'string' ? d : Array.isArray(d) ? d.map(x => x?.msg || x).join('; ') : 'Submission failed')
    }
    setSaving(false)
  }

  return (
    <ModalPortal isOpen={open}>
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4">
        <form onSubmit={submit}
              className="w-full max-w-md rounded-2xl p-6 space-y-4 shadow-2xl"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold" style={{ color: 'var(--text-heading)' }}>Apply for Leave</h2>
            <button type="button" onClick={close} className="p-1 rounded-lg hover:bg-gray-100">
              <X className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
            </button>
          </div>

          {err && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg text-sm"
                 style={{ background: 'rgba(239,68,68,0.10)', color: '#ef4444' }}>
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              {err}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Leave Type</label>
              <select className="input w-full mt-1" value={form.leave_type}
                      onChange={e => setForm(f => ({ ...f, leave_type: e.target.value }))}>
                {policies.map(p => <option key={p.policy_id} value={p.leave_type}>{p.name}</option>)}
                {!policies.length && (
                  <>
                    <option value="casual">Casual Leave</option>
                    <option value="sick">Sick Leave</option>
                    <option value="earned">Earned Leave</option>
                    <option value="maternity">Maternity Leave</option>
                    <option value="paternity">Paternity Leave</option>
                    <option value="comp_off">Compensatory Off</option>
                    <option value="unpaid">Unpaid Leave</option>
                    <option value="other">Other</option>
                  </>
                )}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Duration</label>
              <select className="input w-full mt-1" value={form.duration}
                      onChange={e => setForm(f => ({ ...f, duration: e.target.value }))}>
                <option value="full_day">Full Day</option>
                <option value="half_day_morning">Half Day – Morning</option>
                <option value="half_day_afternoon">Half Day – Afternoon</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>From Date</label>
              <input type="date" className="input w-full mt-1" value={form.from_date}
                     onChange={e => setForm(f => ({ ...f, from_date: e.target.value }))} required />
            </div>
            <div>
              <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>To Date</label>
              <input type="date" className="input w-full mt-1" value={form.to_date}
                     min={form.from_date || undefined}
                     onChange={e => setForm(f => ({ ...f, to_date: e.target.value }))} required />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
              Reason <span style={{ color: 'var(--text-muted)' }}>(min 5 chars)</span>
            </label>
            <textarea className="input w-full mt-1 resize-none" rows={3}
                      placeholder="Briefly describe the reason for your leave…"
                      value={form.reason}
                      onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} />
          </div>

          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={close} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {saving ? 'Submitting…' : 'Submit Application'}
            </button>
          </div>
        </form>
      </div>
    </ModalPortal>
  )
}

// ── Reject Modal ──────────────────────────────────────────────────────────────

function RejectModal({ leave, onClose, onSuccess }) {
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async e => {
    e.preventDefault()
    setSaving(true)
    try {
      await hrmService.leaveAction(leave.id, { action: 'reject', rejection_reason: reason })
      toast.success('Leave rejected')
      onClose()
      onSuccess()
    } catch (ex) {
      toast.error(ex?.response?.data?.detail || 'Failed to reject leave')
    }
    setSaving(false)
  }

  return (
    <ModalPortal isOpen={!!leave}>
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4">
        <form onSubmit={submit}
              className="w-full max-w-sm rounded-2xl p-6 space-y-4 shadow-2xl"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-heading)' }}>Reject Leave</h2>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {leave?.employee_name} · {fmtLabel(leave?.leave_type)} · {fmt(leave?.from_date)} – {fmt(leave?.to_date)}
          </p>
          <div>
            <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Rejection Reason</label>
            <textarea className="input w-full mt-1 resize-none" rows={3}
                      placeholder="Optional — explain reason for rejection"
                      value={reason} onChange={e => setReason(e.target.value)} />
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving}
                    className="px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
                    style={{ background: '#ef4444', color: '#fff' }}>
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Reject
            </button>
          </div>
        </form>
      </div>
    </ModalPortal>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function LeaveManagement() {
  const user = useSelector(selectUser)
  const perms = useSelector(selectUserPermissions) || []
  const canApprove = perms.includes('hrm:leave:team_approve') || perms.includes('hrm:leave:manage')

  const [leaves, setLeaves]         = useState([])
  const [total, setTotal]           = useState(0)
  const [page, setPage]             = useState(1)
  const [pages, setPages]           = useState(1)
  const [statusFilter, setStatus]   = useState('')
  const [loading, setLoading]       = useState(true)

  const [balances, setBalances]     = useState([])
  const [balLoading, setBalLoading] = useState(true)

  const [policies, setPolicies]     = useState([])

  const [showApply, setShowApply]   = useState(false)
  const [rejectTarget, setReject]   = useState(null)
  const [actionLoading, setActLoading] = useState({})

  const PAGE_SIZE = 20

  // Load leave policies for apply form
  useEffect(() => {
    hrmService.listLeavePolicies()
      .then(r => setPolicies(r.data || []))
      .catch(() => {})
  }, [])

  // Load my balances
  const loadBalances = useCallback(async () => {
    setBalLoading(true)
    try {
      const r = await hrmService.getMyLeaveBalance()
      setBalances(r.data || [])
    } catch { setBalances([]) }
    setBalLoading(false)
  }, [])

  useEffect(() => { loadBalances() }, [loadBalances])

  // Load leave list
  const load = useCallback(async (pg = 1) => {
    setLoading(true)
    try {
      // HR/manager sees all; employee sees own
      const params = { page: pg, page_size: PAGE_SIZE }
      if (statusFilter) params.status = statusFilter

      const fn = canApprove ? hrmService.listLeaves : hrmService.listMyLeaves
      const res = await fn(params)
      const data = res.data
      setLeaves(data.items || [])
      setTotal(data.total || 0)
      setPages(Math.max(1, Math.ceil((data.total || 0) / PAGE_SIZE)))
      setPage(pg)
    } catch { setLeaves([]) }
    setLoading(false)
  }, [statusFilter, canApprove])

  useEffect(() => { load(1) }, [load])

  const handleApprove = async (id) => {
    setActLoading(p => ({ ...p, [id]: true }))
    try {
      await hrmService.leaveAction(id, { action: 'approve' })
      toast.success('Leave approved')
      load(page)
      loadBalances()
    } catch (ex) {
      toast.error(ex?.response?.data?.detail || 'Failed to approve')
    }
    setActLoading(p => ({ ...p, [id]: false }))
  }

  const handleCancel = async (id) => {
    if (!window.confirm('Cancel this leave application?')) return
    setActLoading(p => ({ ...p, [id]: true }))
    try {
      await hrmService.cancelLeave(id)
      toast.success('Leave cancelled')
      load(page)
      loadBalances()
    } catch (ex) {
      toast.error(ex?.response?.data?.detail || 'Failed to cancel')
    }
    setActLoading(p => ({ ...p, [id]: false }))
  }

  const onSuccess = () => { load(1); loadBalances() }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-heading)' }}>Leave Management</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>{total} record{total !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => setShowApply(true)} className="btn-primary flex items-center gap-2 text-sm">
          <Plus className="w-4 h-4" /> Apply Leave
        </button>
      </div>

      {/* Balance Cards */}
      <BalanceCards balances={balances} loading={balLoading} />

      {/* Filter bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <select className="input h-9 text-sm" style={{ minWidth: 140 }}
                value={statusFilter}
                onChange={e => { setStatus(e.target.value); load(1) }}>
          <option value="">All Status</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <button onClick={() => load(page)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm"
                style={{ background: 'var(--bg-alt)', color: 'var(--text-muted)' }}>
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {/* Table */}
      <div className="rounded-xl overflow-hidden"
           style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
        <TableScroll>
          <table className="w-full text-sm">
            <thead style={{ background: 'var(--bg-alt)', borderBottom: '1px solid var(--border-subtle)' }}>
              <tr>
                {['Employee', 'Type', 'Duration', 'From', 'To', 'Days', 'Reason', 'Status', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide"
                      style={{ color: 'var(--text-disabled)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i}>
                    <td colSpan={9} className="px-4 py-3">
                      <div className="h-4 bg-gray-100 rounded animate-pulse" />
                    </td>
                  </tr>
                ))
              ) : leaves.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center"
                      style={{ color: 'var(--text-muted)' }}>
                    <Calendar className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">No leave records found</p>
                  </td>
                </tr>
              ) : leaves.map(lv => {
                const act = actionLoading[lv.id]
                const style = STATUS_STYLE[lv.status] || STATUS_STYLE.cancelled
                return (
                  <tr key={lv.id}
                      style={{ borderBottom: '1px solid var(--border-subtle)' }}
                      className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium" style={{ color: 'var(--text-body)' }}>
                      {lv.employee_name || '—'}
                    </td>
                    <td className="px-4 py-3" style={{ color: 'var(--text-body)' }}>
                      {fmtLabel(lv.leave_type)}
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                      {lv.duration === 'full_day' ? 'Full Day'
                        : lv.duration === 'half_day_morning' ? 'AM Half'
                        : 'PM Half'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
                      {fmt(lv.from_date)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
                      {fmt(lv.to_date)}
                    </td>
                    <td className="px-4 py-3 font-medium" style={{ color: 'var(--text-body)' }}>
                      {lv.total_days}d
                    </td>
                    <td className="px-4 py-3 max-w-[160px]">
                      <p className="truncate text-xs" style={{ color: 'var(--text-muted)' }} title={lv.reason}>
                        {lv.reason || '—'}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2.5 py-1 rounded-full text-xs font-medium capitalize"
                            style={style}>
                        {lv.status}
                      </span>
                      {lv.rejection_reason && (
                        <p className="text-xs mt-0.5 truncate max-w-[120px]"
                           style={{ color: 'var(--text-muted)' }} title={lv.rejection_reason}>
                          {lv.rejection_reason}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {/* HR approve / reject for pending */}
                        {canApprove && lv.status === 'pending' && (
                          <>
                            <button
                              onClick={() => handleApprove(lv.id)}
                              disabled={act}
                              title="Approve"
                              className="p-1.5 rounded-lg hover:bg-green-50 transition-colors"
                              style={{ color: '#10b981' }}>
                              {act ? <Loader2 className="w-4 h-4 animate-spin" />
                                    : <CheckCircle className="w-4 h-4" />}
                            </button>
                            <button
                              onClick={() => setReject(lv)}
                              disabled={act}
                              title="Reject"
                              className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                              style={{ color: '#ef4444' }}>
                              <XCircle className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        {/* Employee cancel for own pending/approved leaves */}
                        {lv.status === 'pending' && (
                          <button
                            onClick={() => handleCancel(lv.id)}
                            disabled={act}
                            title="Cancel Application"
                            className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                            style={{ color: 'var(--text-muted)' }}>
                            {act ? <Loader2 className="w-4 h-4 animate-spin" />
                                  : <X className="w-4 h-4" />}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </TableScroll>

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex items-center justify-between px-4 py-2.5"
               style={{ borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-alt)' }}>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Page {page} of {pages} · {total} records
            </span>
            <div className="flex gap-1">
              <button onClick={() => load(page - 1)} disabled={page <= 1}
                      className="p-1.5 rounded" style={{ opacity: page <= 1 ? 0.4 : 1 }}>
                <ChevronLeft className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
              </button>
              {Array.from({ length: Math.min(pages, 5) }, (_, i) => {
                let pg = i + 1
                if (pages > 5) {
                  if (page <= 3) pg = i + 1
                  else if (page >= pages - 2) pg = pages - 4 + i
                  else pg = page - 2 + i
                }
                return (
                  <button key={pg} onClick={() => load(pg)}
                          className="w-7 h-7 rounded text-xs font-medium"
                          style={{
                            background: pg === page ? 'var(--bg-info)' : 'transparent',
                            color: pg === page ? 'var(--text-info)' : 'var(--text-muted)',
                          }}>
                    {pg}
                  </button>
                )
              })}
              <button onClick={() => load(page + 1)} disabled={page >= pages}
                      className="p-1.5 rounded" style={{ opacity: page >= pages ? 0.4 : 1 }}>
                <ChevronRight className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      <ApplyLeaveModal
        open={showApply}
        onClose={() => setShowApply(false)}
        onSuccess={onSuccess}
        policies={balances}
      />
      <RejectModal
        leave={rejectTarget}
        onClose={() => setReject(null)}
        onSuccess={onSuccess}
      />
    </div>
  )
}
