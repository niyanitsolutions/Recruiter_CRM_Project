import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import {
  CheckCircle, XCircle, Clock, Loader2, X, RefreshCw,
  FileText, User, Calendar, MessageSquare, CheckSquare,
} from 'lucide-react'
import documentCenterService from '../../../services/documentCenterService'

const STATUS_CONFIG = {
  pending:  { icon: Clock,         color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30',  label: 'Pending' },
  approved: { icon: CheckCircle,   color: 'bg-green-100 text-green-700 dark:bg-green-900/30',    label: 'Approved' },
  rejected: { icon: XCircle,       color: 'bg-red-100 text-red-700 dark:bg-red-900/30',          label: 'Rejected' },
}

// ─── Review Modal ──────────────────────────────────────────────────────────────
function ReviewModal({ approval, onClose, onDone }) {
  const [decision, setDecision] = useState('')
  const [comments, setComments] = useState('')
  const [busy, setBusy] = useState(false)

  const handleSubmit = async () => {
    if (!decision) { toast.error('Select approve or reject'); return }
    setBusy(true)
    try {
      await documentCenterService.reviewApproval(approval._id || approval.id, {
        status: decision,
        reviewer_comments: comments,
      })
      toast.success(`Template ${decision}`)
      onDone()
      onClose()
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Review failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="rounded-2xl w-full max-w-md shadow-2xl" style={{ background: 'var(--bg-secondary)' }}>
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <h3 className="font-semibold" style={{ color: 'var(--text-heading)' }}>
            Review Approval
          </h3>
          <button onClick={onClose}><X className="w-4 h-4" style={{ color: 'var(--text-muted)' }} /></button>
        </div>
        <div className="p-6 space-y-4">
          {/* Template info */}
          <div className="p-3 rounded-xl" style={{ background: 'var(--bg-primary)' }}>
            <p className="text-xs font-medium mb-0.5" style={{ color: 'var(--text-muted)' }}>Template</p>
            <p className="text-sm font-semibold" style={{ color: 'var(--text-heading)' }}>{approval.template_name}</p>
          </div>

          {/* Requester comments */}
          {approval.comments && (
            <div className="p-3 rounded-xl" style={{ background: 'var(--bg-primary)' }}>
              <p className="text-xs font-medium mb-0.5" style={{ color: 'var(--text-muted)' }}>
                Requester Note
              </p>
              <p className="text-sm" style={{ color: 'var(--text-body)' }}>{approval.comments}</p>
            </div>
          )}

          {/* Decision */}
          <div>
            <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>
              Decision *
            </label>
            <div className="flex gap-3">
              <button
                onClick={() => setDecision('approved')}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium border-2 transition-all ${
                  decision === 'approved' ? 'border-green-500 bg-green-50 text-green-700 dark:bg-green-900/20' : ''
                }`}
                style={decision !== 'approved' ? { borderColor: 'var(--border)', color: 'var(--text-body)' } : {}}
              >
                <CheckCircle className="w-4 h-4" /> Approve
              </button>
              <button
                onClick={() => setDecision('rejected')}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium border-2 transition-all ${
                  decision === 'rejected' ? 'border-red-500 bg-red-50 text-red-700 dark:bg-red-900/20' : ''
                }`}
                style={decision !== 'rejected' ? { borderColor: 'var(--border)', color: 'var(--text-body)' } : {}}
              >
                <XCircle className="w-4 h-4" /> Reject
              </button>
            </div>
          </div>

          {/* Reviewer comments */}
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>
              Comments (optional)
            </label>
            <textarea
              value={comments}
              onChange={e => setComments(e.target.value)}
              rows={3}
              placeholder="Add a note for the requester…"
              className="w-full px-3 py-2 text-sm rounded-xl border resize-none focus:outline-none focus:ring-2 focus:ring-violet-500"
              style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)', color: 'var(--text-body)' }}
            />
          </div>
        </div>
        <div className="flex gap-3 px-6 pb-6">
          <button onClick={onClose}
            className="flex-1 px-4 py-2 rounded-lg text-sm border font-medium"
            style={{ borderColor: 'var(--border)', color: 'var(--text-body)' }}>
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={busy || !decision}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              decision === 'approved' ? 'bg-green-600 text-white hover:bg-green-700'
            : decision === 'rejected' ? 'bg-red-600 text-white hover:bg-red-700'
            : 'bg-gray-200 text-gray-500'
            } disabled:opacity-50`}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckSquare className="w-4 h-4" />}
            {busy ? 'Submitting…' : decision === 'approved' ? 'Approve' : decision === 'rejected' ? 'Reject' : 'Submit'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Approval Card ─────────────────────────────────────────────────────────────
function ApprovalCard({ approval, onRefresh }) {
  const [showReview, setShowReview] = useState(false)
  const status = approval.status || 'pending'
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending
  const StatusIcon = cfg.icon

  return (
    <>
      <div className="rounded-xl border p-4 transition-all hover:shadow-md"
        style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            {/* Template name */}
            <div className="flex items-center gap-2 mb-1">
              <FileText className="w-4 h-4 flex-shrink-0 text-violet-500" />
              <h3 className="font-semibold text-sm truncate" style={{ color: 'var(--text-heading)' }}>
                {approval.template_name}
              </h3>
            </div>

            {/* Meta */}
            <div className="flex items-center flex-wrap gap-3 text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
              <span className="flex items-center gap-1">
                <User className="w-3 h-3" /> {approval.requested_by_name || 'Unknown'}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {new Date(approval.created_at).toLocaleDateString()}
              </span>
              {approval.approver_name && (
                <span className="flex items-center gap-1">
                  <CheckSquare className="w-3 h-3" /> {approval.approver_name}
                </span>
              )}
            </div>

            {/* Comments */}
            {approval.comments && (
              <div className="flex items-start gap-1.5 mb-3">
                <MessageSquare className="w-3 h-3 mt-0.5 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
                <p className="text-xs italic" style={{ color: 'var(--text-muted)' }}>{approval.comments}</p>
              </div>
            )}

            {/* Reviewer comments */}
            {approval.reviewer_comments && (
              <div className="p-2 rounded-lg mb-3 text-xs italic" style={{ background: 'var(--bg-primary)', color: 'var(--text-muted)' }}>
                <span className="font-medium not-italic">Reviewer: </span>
                {approval.reviewer_comments}
              </div>
            )}
          </div>

          {/* Status badge + action */}
          <div className="flex flex-col items-end gap-2">
            <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full flex items-center gap-1.5 ${cfg.color}`}>
              <StatusIcon className="w-3 h-3" />
              {cfg.label}
            </span>
            {status === 'pending' && (
              <button onClick={() => setShowReview(true)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-white"
                style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}>
                Review
              </button>
            )}
            {approval.reviewed_at && (
              <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                {new Date(approval.reviewed_at).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
      </div>

      {showReview && (
        <ReviewModal
          approval={approval}
          onClose={() => setShowReview(false)}
          onDone={onRefresh}
        />
      )}
    </>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function Approvals() {
  const [approvals, setApprovals] = useState([])
  const [total,     setTotal]     = useState(0)
  const [loading,   setLoading]   = useState(false)
  const [statusFilter, setStatusFilter] = useState('')
  const [mineOnly,  setMineOnly]  = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await documentCenterService.listApprovals({
        ...(statusFilter ? { status: statusFilter } : {}),
        mine: mineOnly,
        limit: 100,
      })
      const d = r.data?.data
      setApprovals(d?.approvals || [])
      setTotal(d?.total || 0)
    } catch {
      toast.error('Failed to load approvals')
    } finally {
      setLoading(false)
    }
  }, [statusFilter, mineOnly])

  useEffect(() => { load() }, [load])

  const counts = {
    pending:  approvals.filter(a => a.status === 'pending').length,
    approved: approvals.filter(a => a.status === 'approved').length,
    rejected: approvals.filter(a => a.status === 'rejected').length,
  }

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-primary)' }}>
      {/* Header */}
      <div className="px-6 pt-6 pb-4 border-b flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--text-heading)' }}>Approvals</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>{total} request{total !== 1 ? 's' : ''}</p>
          </div>
          <button onClick={load} className="p-2 rounded-lg border" style={{ borderColor: 'var(--border)' }} title="Refresh">
            <RefreshCw className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          {[
            { key: 'pending',  label: 'Pending',  color: 'text-yellow-600', bg: 'bg-yellow-50 dark:bg-yellow-900/20' },
            { key: 'approved', label: 'Approved', color: 'text-green-600',  bg: 'bg-green-50 dark:bg-green-900/20' },
            { key: 'rejected', label: 'Rejected', color: 'text-red-600',    bg: 'bg-red-50 dark:bg-red-900/20' },
          ].map(s => (
            <button key={s.key}
              onClick={() => setStatusFilter(statusFilter === s.key ? '' : s.key)}
              className={`p-3 rounded-xl text-center transition-all border ${
                statusFilter === s.key ? `${s.bg} border-current ${s.color}` : ''
              }`}
              style={statusFilter !== s.key ? { borderColor: 'var(--border)', background: 'var(--bg-secondary)' } : {}}>
              <div className={`text-2xl font-bold ${s.color}`}>{counts[s.key]}</div>
              <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{s.label}</div>
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--text-body)' }}>
            <input type="checkbox" checked={mineOnly} onChange={e => setMineOnly(e.target.checked)} className="accent-violet-600" />
            My requests only
          </label>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-8 h-8 animate-spin text-violet-600" />
          </div>
        ) : approvals.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <CheckSquare className="w-12 h-12 mb-3" style={{ color: 'var(--text-muted)' }} />
            <p className="font-medium mb-1" style={{ color: 'var(--text-heading)' }}>No approvals found</p>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {statusFilter ? `No ${statusFilter} approvals` : 'Approval requests will appear here'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {approvals.map(a => (
              <ApprovalCard key={a._id || a.id} approval={a} onRefresh={load} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
