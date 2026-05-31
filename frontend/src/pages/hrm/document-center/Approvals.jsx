import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import {
  CheckSquare, Clock, CheckCircle, XCircle, Loader2,
  User, Calendar, MessageSquare, Filter,
} from 'lucide-react'
import documentCenterService from '../../../services/documentCenterService'

const STATUS_INFO = {
  pending:  { icon: Clock,        cls: 'bg-amber-100 text-amber-700',  label: 'Pending' },
  approved: { icon: CheckCircle,  cls: 'bg-green-100 text-green-700',  label: 'Approved' },
  rejected: { icon: XCircle,      cls: 'bg-red-100 text-red-700',      label: 'Rejected' },
}

const ReviewModal = ({ approval, onClose, onReview }) => {
  const [status,   setStatus]   = useState('approved')
  const [comments, setComments] = useState('')
  const [saving,   setSaving]   = useState(false)

  const handleSubmit = async () => {
    setSaving(true)
    try {
      await onReview(approval._id, { status, reviewer_comments: comments })
      onClose()
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-xl shadow-2xl overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <h3 className="font-semibold" style={{ color: 'var(--text-heading)' }}>Review Template</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <div className="p-5 space-y-4">
          <div className="rounded-lg p-3 border" style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}>
            <p className="text-sm font-medium" style={{ color: 'var(--text-heading)' }}>{approval.template_name}</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Requested by {approval.requested_by_name}</p>
            {approval.comments && <p className="text-xs mt-1 italic" style={{ color: 'var(--text-muted)' }}>"{approval.comments}"</p>}
          </div>
          <div>
            <label className="text-xs font-medium mb-2 block" style={{ color: 'var(--text-muted)' }}>Decision *</label>
            <div className="flex gap-3">
              {[
                { val: 'approved', label: 'Approve', cls: 'border-green-500 text-green-600 bg-green-50' },
                { val: 'rejected', label: 'Reject',  cls: 'border-red-500 text-red-600 bg-red-50' },
              ].map(opt => (
                <button key={opt.val} type="button"
                  onClick={() => setStatus(opt.val)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border-2 transition-all ${
                    status === opt.val ? opt.cls : 'border-transparent'
                  }`}
                  style={status !== opt.val ? { borderColor: 'var(--border)', color: 'var(--text-body)', background: 'var(--bg-secondary)' } : {}}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-muted)' }}>Reviewer Comments</label>
            <textarea value={comments} onChange={e => setComments(e.target.value)} rows={3}
              placeholder="Add your review comments…"
              className="w-full px-3 py-2 text-sm rounded-lg border resize-none focus:outline-none focus:ring-2 focus:ring-violet-500"
              style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-body)' }} />
          </div>
        </div>
        <div className="flex justify-end gap-3 px-5 py-4 border-t" style={{ borderColor: 'var(--border)' }}>
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border" style={{ borderColor: 'var(--border)', color: 'var(--text-body)' }}>Cancel</button>
          <button onClick={handleSubmit} disabled={saving}
            className={`flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white rounded-lg ${
              status === 'approved' ? 'bg-green-600' : 'bg-red-600'
            }`}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : status === 'approved' ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
            {status === 'approved' ? 'Approve' : 'Reject'}
          </button>
        </div>
      </div>
    </div>
  )
}

const RequestModal = ({ templates, onClose, onRequest }) => {
  const [templateId, setTemplateId] = useState(templates[0]?._id || '')
  const [comments,   setComments]   = useState('')
  const [saving,     setSaving]     = useState(false)

  const handleSubmit = async () => {
    if (!templateId) { toast.error('Select a template'); return }
    setSaving(true)
    try { await onRequest({ template_id: templateId, comments }); onClose() }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-xl shadow-2xl overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <h3 className="font-semibold" style={{ color: 'var(--text-heading)' }}>Request Approval</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-muted)' }}>Template *</label>
            <select value={templateId} onChange={e => setTemplateId(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border"
              style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-body)' }}>
              {templates.filter(t => t.status === 'draft').map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-muted)' }}>Comments (optional)</label>
            <textarea value={comments} onChange={e => setComments(e.target.value)} rows={3}
              placeholder="Add notes for the reviewer…"
              className="w-full px-3 py-2 text-sm rounded-lg border resize-none"
              style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-body)' }} />
          </div>
        </div>
        <div className="flex justify-end gap-3 px-5 py-4 border-t" style={{ borderColor: 'var(--border)' }}>
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border" style={{ borderColor: 'var(--border)', color: 'var(--text-body)' }}>Cancel</button>
          <button onClick={handleSubmit} disabled={saving}
            className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white rounded-lg"
            style={{ background: 'linear-gradient(135deg,#7c3aed,#4f46e5)' }}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckSquare className="w-4 h-4" />}
            Submit
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Approvals() {
  const [approvals,  setApprovals]  = useState([])
  const [total,      setTotal]      = useState(0)
  const [loading,    setLoading]    = useState(true)
  const [statusFilter, setStatusFilter] = useState('pending')
  const [reviewing,  setReviewing]  = useState(null)
  const [requesting, setRequesting] = useState(false)
  const [templates,  setTemplates]  = useState([])

  const load = async () => {
    setLoading(true)
    try {
      const r = await documentCenterService.listApprovals({ status: statusFilter || undefined, limit: 50 })
      setApprovals(r.data?.data?.approvals || [])
      setTotal(r.data?.data?.total || 0)
    } catch { toast.error('Failed to load approvals') }
    finally { setLoading(false) }
  }

  useEffect(() => {
    load()
    documentCenterService.listTemplates({ status: 'draft', limit: 200 }).then(r => setTemplates(r.data?.data?.templates || [])).catch(() => {})
  }, [statusFilter])

  const handleReview = async (id, data) => {
    try {
      await documentCenterService.reviewApproval(id, data)
      toast.success(`Template ${data.status}`)
      load()
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Review failed')
      throw err
    }
  }

  const handleRequest = async (data) => {
    try {
      await documentCenterService.requestApproval(data)
      toast.success('Approval requested')
      load()
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Request failed')
      throw err
    }
  }

  const pendingCount = approvals.filter(a => a.status === 'pending').length

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2" style={{ color: 'var(--text-heading)' }}>
            <CheckSquare className="w-5 h-5 text-violet-600" /> Approvals
            {pendingCount > 0 && statusFilter === 'pending' && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">{pendingCount} pending</span>
            )}
          </h2>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>Review and approve template submissions</p>
        </div>
        <button onClick={() => setRequesting(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white"
          style={{ background: 'linear-gradient(135deg,#7c3aed,#4f46e5)' }}>
          <CheckSquare className="w-4 h-4" /> Request Approval
        </button>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1 mb-5 border-b" style={{ borderColor: 'var(--border)' }}>
        {[
          { val: 'pending',  label: 'Pending' },
          { val: 'approved', label: 'Approved' },
          { val: 'rejected', label: 'Rejected' },
          { val: '',         label: 'All' },
        ].map(opt => (
          <button key={opt.val} onClick={() => setStatusFilter(opt.val)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              statusFilter === opt.val ? 'border-violet-600 text-violet-600' : 'border-transparent'
            }`}
            style={statusFilter !== opt.val ? { color: 'var(--text-muted)' } : {}}>
            {opt.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="w-6 h-6 animate-spin text-violet-600" />
        </div>
      ) : approvals.length === 0 ? (
        <div className="text-center py-16 border rounded-xl" style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}>
          <CheckSquare className="w-10 h-10 mx-auto mb-3 text-gray-300" />
          <p style={{ color: 'var(--text-muted)' }}>No {statusFilter || ''} approvals found</p>
        </div>
      ) : (
        <div className="space-y-3 max-w-3xl">
          {approvals.map(appr => {
            const info  = STATUS_INFO[appr.status] || STATUS_INFO.pending
            const Icon  = info.icon
            return (
              <div key={appr._id}
                className="border rounded-xl p-4 flex items-start gap-4 transition-colors hover:border-violet-300"
                style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}>
                <Icon className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: appr.status === 'approved' ? '#10b981' : appr.status === 'rejected' ? '#ef4444' : '#f59e0b' }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-semibold text-sm" style={{ color: 'var(--text-heading)' }}>{appr.template_name}</p>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${info.cls}`}>{info.label}</span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                    <span className="flex items-center gap-1"><User className="w-3 h-3" /> Requested by {appr.requested_by_name}</span>
                    <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{new Date(appr.created_at).toLocaleDateString()}</span>
                    {appr.approver_name && <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3" />Reviewed by {appr.approver_name}</span>}
                  </div>
                  {appr.comments && (
                    <p className="text-xs mt-1 italic" style={{ color: 'var(--text-muted)' }}>Request: "{appr.comments}"</p>
                  )}
                  {appr.reviewer_comments && (
                    <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Review: "{appr.reviewer_comments}"</p>
                  )}
                </div>
                {appr.status === 'pending' && (
                  <button onClick={() => setReviewing(appr)}
                    className="flex-shrink-0 px-3 py-1.5 text-xs font-medium text-white rounded-lg"
                    style={{ background: 'linear-gradient(135deg,#7c3aed,#4f46e5)' }}>
                    Review
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {reviewing && <ReviewModal approval={reviewing} onClose={() => setReviewing(null)} onReview={handleReview} />}
      {requesting && <RequestModal templates={templates} onClose={() => setRequesting(false)} onRequest={handleRequest} />}
    </div>
  )
}
