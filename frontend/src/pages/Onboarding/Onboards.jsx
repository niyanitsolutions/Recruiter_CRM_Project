import React, { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Plus, Search, Eye, Edit, UserCheck, Calendar,
  Clock, FileText, CheckCircle, XCircle, PauseCircle,
  Send, X, RotateCcw, Save
} from 'lucide-react'
import { toast } from 'react-hot-toast'
import { onboardService } from '../../services'
import usePermissions from '../../hooks/usePermissions'

// ─── Status styles ────────────────────────────────────────────────────────────
const STATUS_STYLES = {
  selected:       { background: 'rgba(56,249,215,0.15)',   color: '#38F9D7' },
  hold:           { background: 'rgba(245,158,11,0.15)',   color: '#F59E0B' },
  offer_released: { background: 'rgba(79,172,254,0.15)',   color: '#4FACFE' },
  offer_accepted: { background: 'rgba(67,233,123,0.15)',   color: '#43E97B' },
  offer_declined: { background: 'rgba(255,71,87,0.15)',    color: '#FF4757' },
  doj_confirmed:  { background: 'rgba(108,99,255,0.15)',   color: '#6C63FF' },
  doj_extended:   { background: 'rgba(245,158,11,0.15)',   color: '#F59E0B' },
  joined:         { background: 'rgba(56,249,215,0.15)',   color: '#38F9D7' },
  no_show:        { background: 'rgba(255,71,87,0.15)',    color: '#FF4757' },
  absconded:      { background: 'rgba(139,143,168,0.15)', color: '#8B8FA8' },
  terminated:     { background: 'rgba(255,71,87,0.15)',    color: '#FF4757' },
  completed:      { background: 'rgba(67,233,123,0.20)',   color: '#43E97B', fontWeight: 700 },
  rejected:       { background: 'rgba(255,71,87,0.15)',    color: '#FF4757' },
}

const STATUS_LABELS = {
  selected:       'Selected',
  hold:           'On Hold',
  offer_released: 'Offer Released',
  offer_accepted: 'Offer Accepted',
  offer_declined: 'Offer Declined',
  doj_confirmed:  'DOJ Confirmed',
  doj_extended:   'DOJ Extended',
  joined:         'Joined',
  no_show:        'No Show',
  absconded:      'Absconded',
  terminated:     'Terminated',
  completed:      'Completed',
  rejected:       'Rejected',
}

const REJECTION_REASONS = [
  { value: 'interview_rejected',   label: 'Interview Rejected' },
  { value: 'offer_rejected',       label: 'Offer Rejected' },
  { value: 'candidate_withdrawn',  label: 'Candidate Withdrawn' },
  { value: 'client_rejected',      label: 'Client Rejected' },
  { value: 'offer_expired',        label: 'Offer Expired' },
]

// ─── Tabs config ──────────────────────────────────────────────────────────────
const TABS = [
  {
    key: 'selected',
    label: 'Selected',
    // Fetched from onboards with status=selected (auto-created on interview selection)
    statuses: ['selected'],
  },
  {
    key: 'hold',
    label: 'Hold',
    statuses: ['hold'],
  },
  {
    key: 'offer_released',
    label: 'Offer Released',
    statuses: ['offer_released', 'offer_accepted', 'doj_confirmed', 'doj_extended'],
  },
  {
    key: 'onboarded',
    label: 'Onboarded',
    statuses: ['joined', 'completed'],
  },
  {
    key: 'rejected',
    label: 'Rejected',
    statuses: ['offer_declined', 'no_show', 'absconded', 'terminated', 'rejected'],
  },
]

const STAT_CARDS = [
  { key: 'selected_count',   label: 'Selected',      color: '#38F9D7', icon: CheckCircle },
  { key: 'hold_count',       label: 'On Hold',       color: '#F59E0B', icon: PauseCircle },
  { key: 'total_offers',     label: 'Total Offers',  color: '#4FACFE', icon: FileText },
  { key: 'joined_this_month',label: 'Joined (Month)',color: '#43E97B', icon: UserCheck },
  { key: 'payout_eligible',  label: 'Payout Ready',  color: '#F59E0B', icon: Clock },
  { key: 'rejected_count',   label: 'Rejected',      color: '#FF4757', icon: XCircle },
]

// ─── Release Offer Modal ──────────────────────────────────────────────────────
const EMPLOYMENT_TYPES = [
  { value: 'full_time', label: 'Full-Time' },
  { value: 'part_time', label: 'Part-Time' },
  { value: 'contract', label: 'Contract' },
  { value: 'intern', label: 'Intern' },
]

const ReleaseOfferModal = ({ onboard, onClose, onSuccess }) => {
  const today = new Date().toISOString().split('T')[0]
  const [form, setForm] = useState({
    offer_ctc: onboard.offer_ctc || '',
    offer_designation: onboard.offer_designation || '',
    department: onboard.department || '',
    employment_type: onboard.employment_type || 'full_time',
    offer_location: onboard.offer_location || '',
    offer_released_date: today,
    offer_valid_until: onboard.offer_valid_until || '',
    expected_doj: onboard.expected_doj || '',
    variable_pay: onboard.variable_pay || '',
    joining_bonus: onboard.joining_bonus || '',
    probation_period_months: onboard.probation_period_months || '',
    payout_days_required: onboard.payout_days_required || 45,
    offer_letter_url: onboard.offer_letter_url || '',
    notes: onboard.notes || '',
  })
  const [saving, setSaving] = useState(false)
  const [savingDraft, setSavingDraft] = useState(false)
  const [sendOfferEmail, setSendOfferEmail] = useState(true)

  const buildPayload = () => ({
    ...form,
    offer_ctc: form.offer_ctc ? parseFloat(form.offer_ctc) : undefined,
    variable_pay: form.variable_pay ? parseFloat(form.variable_pay) : undefined,
    joining_bonus: form.joining_bonus ? parseFloat(form.joining_bonus) : undefined,
    probation_period_months: form.probation_period_months ? parseInt(form.probation_period_months) : undefined,
    payout_days_required: parseInt(form.payout_days_required),
    offer_valid_until: form.offer_valid_until || undefined,
    expected_doj: form.expected_doj || undefined,
    department: form.department || undefined,
    offer_letter_url: form.offer_letter_url || undefined,
    notes: form.notes || undefined,
  })

  const handleSaveDraft = async () => {
    setSavingDraft(true)
    try {
      await onboardService.update(onboard.id, buildPayload())
      toast.success('Draft saved')
      onSuccess()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save draft')
    } finally {
      setSavingDraft(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.offer_ctc || !form.offer_designation || !form.offer_location) {
      toast.error('CTC, designation and location are required')
      return
    }
    setSaving(true)
    try {
      await onboardService.releaseOffer(onboard.id, {
        ...buildPayload(),
        notify_email: sendOfferEmail,
      })
      toast.success('Offer released successfully')
      onSuccess()
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to release offer')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
        <div className="flex items-center justify-between p-6 pb-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          <div>
            <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Release Offer</h2>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {onboard.candidate_name} · {onboard.job_title} · {onboard.client_name || '—'}
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg flex-shrink-0" style={{ color: 'var(--text-muted)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = ''}>
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="overflow-y-auto p-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-label)' }}>Designation *</label>
                <input type="text" value={form.offer_designation} onChange={e => setForm(p => ({ ...p, offer_designation: e.target.value }))} className="input w-full" placeholder="e.g. Software Engineer" required />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-label)' }}>Department</label>
                <input type="text" value={form.department} onChange={e => setForm(p => ({ ...p, department: e.target.value }))} className="input w-full" placeholder="e.g. Engineering" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-label)' }}>Employment Type</label>
                <select value={form.employment_type} onChange={e => setForm(p => ({ ...p, employment_type: e.target.value }))} className="input w-full">
                  {EMPLOYMENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-label)' }}>Work Location *</label>
                <input type="text" value={form.offer_location} onChange={e => setForm(p => ({ ...p, offer_location: e.target.value }))} className="input w-full" placeholder="e.g. Mumbai" required />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-label)' }}>Offer CTC (₹) *</label>
                <input type="number" value={form.offer_ctc} onChange={e => setForm(p => ({ ...p, offer_ctc: e.target.value }))} className="input w-full" placeholder="e.g. 600000" required />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-label)' }}>Variable Pay (₹)</label>
                <input type="number" value={form.variable_pay} onChange={e => setForm(p => ({ ...p, variable_pay: e.target.value }))} className="input w-full" placeholder="Optional" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-label)' }}>Joining Bonus (₹)</label>
                <input type="number" value={form.joining_bonus} onChange={e => setForm(p => ({ ...p, joining_bonus: e.target.value }))} className="input w-full" placeholder="Optional" />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-label)' }}>Offer Date *</label>
                <input type="date" value={form.offer_released_date} onChange={e => setForm(p => ({ ...p, offer_released_date: e.target.value }))} className="input w-full" required />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-label)' }}>Valid Until</label>
                <input type="date" value={form.offer_valid_until} onChange={e => setForm(p => ({ ...p, offer_valid_until: e.target.value }))} className="input w-full" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-label)' }}>Expected DOJ</label>
                <input type="date" value={form.expected_doj} onChange={e => setForm(p => ({ ...p, expected_doj: e.target.value }))} className="input w-full" />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-label)' }}>Probation Period (months)</label>
                <input type="number" min="0" value={form.probation_period_months} onChange={e => setForm(p => ({ ...p, probation_period_months: e.target.value }))} className="input w-full" placeholder="e.g. 3" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-label)' }}>Payout Days</label>
                <select value={form.payout_days_required} onChange={e => setForm(p => ({ ...p, payout_days_required: e.target.value }))} className="input w-full">
                  <option value={45}>45 days</option>
                  <option value={60}>60 days</option>
                  <option value={90}>90 days</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-label)' }}>Offer Letter URL</label>
              <input type="url" value={form.offer_letter_url} onChange={e => setForm(p => ({ ...p, offer_letter_url: e.target.value }))} className="input w-full" placeholder="Link to uploaded offer letter (optional)" />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-label)' }}>Notes</label>
              <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} className="input w-full" rows={2} placeholder="Optional notes" />
            </div>

            <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
              <input
                type="checkbox"
                checked={sendOfferEmail}
                onChange={e => setSendOfferEmail(e.target.checked)}
                className="w-4 h-4 rounded"
                style={{ accentColor: 'var(--accent)' }}
              />
              Send Offer Email
            </label>
          </div>

          <div className="flex flex-wrap gap-3 p-6 pt-4 flex-shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
            <button type="button" onClick={onClose} className="btn-secondary flex-1 min-w-[100px]">Cancel</button>
            <button type="button" onClick={handleSaveDraft} disabled={savingDraft} className="btn-secondary flex-1 min-w-[120px] flex items-center justify-center gap-2">
              <Save className="w-4 h-4" />
              {savingDraft ? 'Saving...' : 'Save Draft'}
            </button>
            <button type="submit" disabled={saving} className="btn-primary flex-1 min-w-[140px] flex items-center justify-center gap-2">
              <Send className="w-4 h-4" />
              {saving ? 'Releasing...' : 'Release Offer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Reject Modal ─────────────────────────────────────────────────────────────
const RejectModal = ({ onboard, onClose, onSuccess }) => {
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!reason) { toast.error('Please select a rejection reason'); return }
    setSaving(true)
    try {
      await onboardService.rejectOnboard(onboard.id, reason, notes || null)
      toast.success('Candidate rejected')
      onSuccess()
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to reject candidate')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="w-full max-w-md rounded-2xl p-6" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Reject Candidate</h2>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{onboard.candidate_name}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg" style={{ color: 'var(--text-muted)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = ''}>
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-label)' }}>Rejection Reason *</label>
            <select value={reason} onChange={e => setReason(e.target.value)} className="input w-full" required>
              <option value="">Select reason...</option>
              {REJECTION_REASONS.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-label)' }}>Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} className="input w-full" rows={2} placeholder="Optional notes" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium text-sm" style={{ background: '#FF4757', color: '#fff' }}>
              <XCircle className="w-4 h-4" />
              {saving ? 'Rejecting...' : 'Confirm Reject'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
const Onboards = () => {
  const { has } = usePermissions()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('selected')
  const [onboards, setOnboards] = useState([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState(null)
  const [filters, setFilters] = useState({ search: '', page: 1, page_size: 20 })
  const [pagination, setPagination] = useState({ total: 0, pages: 1 })
  const [releaseModal, setReleaseModal] = useState(null)   // onboard record
  const [rejectModal, setRejectModal] = useState(null)     // onboard record

  useEffect(() => { fetchOnboards(); fetchStats() }, [filters, activeTab])

  const fetchOnboards = async () => {
    try {
      setLoading(true)
      const tabDef = TABS.find(t => t.key === activeTab)
      const statusParam = (tabDef?.statuses || []).join(',')
      const response = await onboardService.getAll({
        ...filters,
        status: statusParam || undefined,
      })
      setOnboards(response.items || [])
      setPagination({ total: response.total, pages: response.pages })
    } catch (error) {
      toast.error('Failed to load onboarding records')
    } finally {
      setLoading(false)
    }
  }

  const fetchStats = async () => {
    try {
      const data = await onboardService.getDashboardStats()
      setStats(data)
    } catch (_) {}
  }

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value, page: 1 }))
  }

  const handleTabChange = (tab) => {
    setActiveTab(tab)
    setFilters(prev => ({ ...prev, search: '', page: 1 }))
  }

  const handleOnHold = async (onboard) => {
    try {
      await onboardService.putOnHold(onboard.id)
      toast.success('Candidate put on hold')
      fetchOnboards()
      fetchStats()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to put on hold')
    }
  }

  const handleResume = async (onboard) => {
    try {
      await onboardService.resumeCandidate(onboard.id)
      toast.success('Candidate resumed to Selected')
      fetchOnboards()
      fetchStats()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to resume candidate')
    }
  }

  // ─── Render helpers ──────────────────────────────────────────────────────────

  const renderBadge = (status) => (
    <span className="px-2 py-1 rounded-full text-xs font-medium" style={STATUS_STYLES[status] || STATUS_STYLES.offer_released}>
      {STATUS_LABELS[status] || status}
    </span>
  )

  // ─── Selected Tab ─────────────────────────────────────────────────────────────
  const renderSelectedTable = () => (
    <table className="w-full">
      <thead style={{ background: 'var(--bg-card-alt)', borderBottom: '1px solid var(--border)' }}>
        <tr>
          <th className="px-4 py-3 text-left text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Candidate</th>
          <th className="px-4 py-3 text-left text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Job / Client</th>
          <th className="px-4 py-3 text-left text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Status</th>
          <th className="px-4 py-3 text-left text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Selected On</th>
          {has('onboards:edit') && (
            <th className="px-4 py-3 text-left text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Actions</th>
          )}
        </tr>
      </thead>
      <tbody>
        {onboards.map(ob => (
          <tr key={ob.id} className="transition-colors" style={{ borderBottom: '1px solid var(--border-subtle)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = ''}>
            <td className="px-4 py-3">
              <p className="font-medium" style={{ color: 'var(--text-primary)' }}>{ob.candidate_name}</p>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{ob.candidate_email}</p>
            </td>
            <td className="px-4 py-3">
              <p className="font-medium" style={{ color: 'var(--text-primary)' }}>{ob.job_title}</p>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{ob.client_name}</p>
            </td>
            <td className="px-4 py-3">{renderBadge(ob.status)}</td>
            <td className="px-4 py-3">
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
                {ob.created_at ? new Date(ob.created_at).toLocaleDateString('en-IN') : '—'}
              </span>
            </td>
            {has('onboards:edit') && (
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setReleaseModal(ob)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                    style={{ background: 'rgba(79,172,254,0.15)', color: '#4FACFE' }}
                    title="Release Offer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Release Offer
                  </button>
                  <button
                    onClick={() => setRejectModal(ob)}
                    className="p-2 rounded-lg transition-colors"
                    style={{ color: '#FF4757' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,71,87,0.10)'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}
                    title="Reject"
                  >
                    <XCircle className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleOnHold(ob)}
                    className="p-2 rounded-lg transition-colors"
                    style={{ color: '#F59E0B' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(245,158,11,0.10)'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}
                    title="Put On Hold"
                  >
                    <PauseCircle className="w-4 h-4" />
                  </button>
                  <Link to={`/onboards/${ob.id}`} className="p-2 rounded-lg transition-colors" style={{ color: 'var(--text-muted)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                    onMouseLeave={e => e.currentTarget.style.background = ''} title="View">
                    <Eye className="w-4 h-4" />
                  </Link>
                </div>
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  )

  // ─── Hold Tab ─────────────────────────────────────────────────────────────────
  const renderHoldTable = () => (
    <table className="w-full">
      <thead style={{ background: 'var(--bg-card-alt)', borderBottom: '1px solid var(--border)' }}>
        <tr>
          <th className="px-4 py-3 text-left text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Candidate</th>
          <th className="px-4 py-3 text-left text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Job / Client</th>
          <th className="px-4 py-3 text-left text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Status</th>
          {has('onboards:edit') && (
            <th className="px-4 py-3 text-left text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Actions</th>
          )}
        </tr>
      </thead>
      <tbody>
        {onboards.map(ob => (
          <tr key={ob.id} className="transition-colors" style={{ borderBottom: '1px solid var(--border-subtle)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = ''}>
            <td className="px-4 py-3">
              <p className="font-medium" style={{ color: 'var(--text-primary)' }}>{ob.candidate_name}</p>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{ob.candidate_email}</p>
            </td>
            <td className="px-4 py-3">
              <p className="font-medium" style={{ color: 'var(--text-primary)' }}>{ob.job_title}</p>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{ob.client_name}</p>
            </td>
            <td className="px-4 py-3">{renderBadge(ob.status)}</td>
            {has('onboards:edit') && (
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleResume(ob)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                    style={{ background: 'rgba(67,233,123,0.15)', color: '#43E97B' }}
                    title="Resume Candidate"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Resume Candidate
                  </button>
                  <Link to={`/onboards/${ob.id}`} className="p-2 rounded-lg transition-colors" style={{ color: 'var(--text-muted)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                    onMouseLeave={e => e.currentTarget.style.background = ''} title="View">
                    <Eye className="w-4 h-4" />
                  </Link>
                </div>
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  )

  // ─── Offer Released Tab ───────────────────────────────────────────────────────
  const renderOfferReleasedTable = () => (
    <table className="w-full">
      <thead style={{ background: 'var(--bg-card-alt)', borderBottom: '1px solid var(--border)' }}>
        <tr>
          <th className="px-4 py-3 text-left text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Candidate</th>
          <th className="px-4 py-3 text-left text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Job / Client</th>
          <th className="px-4 py-3 text-left text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Offer CTC</th>
          <th className="px-4 py-3 text-left text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Offer Date</th>
          <th className="px-4 py-3 text-left text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Expected DOJ</th>
          <th className="px-4 py-3 text-left text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Status</th>
          <th className="px-4 py-3 text-left text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Actions</th>
        </tr>
      </thead>
      <tbody>
        {onboards.map(ob => (
          <tr key={ob.id} className="transition-colors" style={{ borderBottom: '1px solid var(--border-subtle)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = ''}>
            <td className="px-4 py-3">
              <p className="font-medium" style={{ color: 'var(--text-primary)' }}>{ob.candidate_name}</p>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{ob.candidate_email}</p>
            </td>
            <td className="px-4 py-3">
              <p className="font-medium" style={{ color: 'var(--text-primary)' }}>{ob.job_title}</p>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{ob.client_name}</p>
            </td>
            <td className="px-4 py-3">
              <p className="font-medium" style={{ color: 'var(--text-primary)' }}>
                {ob.offer_ctc ? `₹${(ob.offer_ctc / 100000).toFixed(1)}L` : '—'}
              </p>
            </td>
            <td className="px-4 py-3">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  {ob.offer_released_date || '—'}
                </span>
              </div>
            </td>
            <td className="px-4 py-3">
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                {ob.expected_doj || '—'}
              </span>
            </td>
            <td className="px-4 py-3">{renderBadge(ob.status)}</td>
            <td className="px-4 py-3">
              <div className="flex items-center gap-2">
                <Link to={`/onboards/${ob.id}`} className="p-2 rounded-lg transition-colors" style={{ color: 'var(--text-muted)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = ''} title="View">
                  <Eye className="w-4 h-4" />
                </Link>
                {has('onboards:edit') && (
                  <Link to={`/onboards/${ob.id}/edit`} className="p-2 rounded-lg transition-colors" style={{ color: 'var(--text-muted)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                    onMouseLeave={e => e.currentTarget.style.background = ''} title="Edit">
                    <Edit className="w-4 h-4" />
                  </Link>
                )}
                {has('onboards:edit') && (
                  <button onClick={() => setRejectModal(ob)} className="p-2 rounded-lg transition-colors"
                    style={{ color: '#FF4757' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,71,87,0.10)'}
                    onMouseLeave={e => e.currentTarget.style.background = ''} title="Reject">
                    <XCircle className="w-4 h-4" />
                  </button>
                )}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )

  // ─── Onboarded Tab ────────────────────────────────────────────────────────────
  const renderOnboardedTable = () => (
    <table className="w-full">
      <thead style={{ background: 'var(--bg-card-alt)', borderBottom: '1px solid var(--border)' }}>
        <tr>
          <th className="px-4 py-3 text-left text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Candidate Name</th>
          <th className="px-4 py-3 text-left text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Client Name</th>
          <th className="px-4 py-3 text-left text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Job Title</th>
          <th className="px-4 py-3 text-left text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Offer CTC</th>
          <th className="px-4 py-3 text-left text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>DOJ</th>
          <th className="px-4 py-3 text-left text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Joined Date</th>
          <th className="px-4 py-3 text-left text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Placement Status</th>
          <th className="px-4 py-3 text-left text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Days</th>
          <th className="px-4 py-3 text-left text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Actions</th>
        </tr>
      </thead>
      <tbody>
        {onboards.map(ob => (
          <tr key={ob.id} className="transition-colors" style={{ borderBottom: '1px solid var(--border-subtle)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = ''}>
            <td className="px-4 py-3">
              <p className="font-medium" style={{ color: 'var(--text-primary)' }}>{ob.candidate_name}</p>
            </td>
            <td className="px-4 py-3">
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{ob.client_name}</p>
            </td>
            <td className="px-4 py-3">
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{ob.job_title}</p>
            </td>
            <td className="px-4 py-3">
              <p className="font-medium" style={{ color: 'var(--text-primary)' }}>
                {ob.offer_ctc ? `₹${(ob.offer_ctc / 100000).toFixed(1)}L` : '—'}
              </p>
            </td>
            <td className="px-4 py-3">
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                {ob.expected_doj || '—'}
              </span>
            </td>
            <td className="px-4 py-3">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  {ob.actual_doj || '—'}
                </span>
              </div>
            </td>
            <td className="px-4 py-3">
              <span className="px-2 py-1 rounded-full text-xs font-medium" style={{ background: 'rgba(67,233,123,0.15)', color: '#43E97B' }}>
                Joined Client
              </span>
              {ob.payout_eligible && (
                <span className="ml-1 px-2 py-1 rounded-full text-xs font-medium" style={{ background: 'rgba(56,249,215,0.15)', color: '#38F9D7' }}>
                  Payout Ready
                </span>
              )}
            </td>
            <td className="px-4 py-3">
              {ob.status === 'joined' ? (
                <div className="flex items-center gap-1">
                  <Clock className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                  <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{ob.days_at_client}d</span>
                </div>
              ) : (
                <span className="text-sm" style={{ color: 'var(--text-disabled)' }}>—</span>
              )}
            </td>
            <td className="px-4 py-3">
              <Link to={`/onboards/${ob.id}`} className="p-2 rounded-lg transition-colors" style={{ color: 'var(--text-muted)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = ''} title="View">
                <Eye className="w-4 h-4" />
              </Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )

  // ─── Rejected Tab ─────────────────────────────────────────────────────────────
  const renderRejectedTable = () => (
    <table className="w-full">
      <thead style={{ background: 'var(--bg-card-alt)', borderBottom: '1px solid var(--border)' }}>
        <tr>
          <th className="px-4 py-3 text-left text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Candidate</th>
          <th className="px-4 py-3 text-left text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Job / Client</th>
          <th className="px-4 py-3 text-left text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Offer CTC</th>
          <th className="px-4 py-3 text-left text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Rejection Reason</th>
          <th className="px-4 py-3 text-left text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Status</th>
          <th className="px-4 py-3 text-left text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Actions</th>
        </tr>
      </thead>
      <tbody>
        {onboards.map(ob => {
          const reasonLabel = REJECTION_REASONS.find(r => r.value === ob.rejection_reason)?.label
            || (ob.status === 'offer_declined' ? 'Offer Rejected'
              : ob.status === 'no_show' ? 'No Show'
              : ob.status === 'absconded' ? 'Candidate Withdrawn'
              : ob.status === 'terminated' ? 'Client Rejected'
              : ob.rejection_reason || '—')
          return (
            <tr key={ob.id} className="transition-colors" style={{ borderBottom: '1px solid var(--border-subtle)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = ''}>
              <td className="px-4 py-3">
                <p className="font-medium" style={{ color: 'var(--text-primary)' }}>{ob.candidate_name}</p>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{ob.candidate_email}</p>
              </td>
              <td className="px-4 py-3">
                <p className="font-medium" style={{ color: 'var(--text-primary)' }}>{ob.job_title}</p>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{ob.client_name}</p>
              </td>
              <td className="px-4 py-3">
                <p className="font-medium" style={{ color: 'var(--text-primary)' }}>
                  {ob.offer_ctc ? `₹${(ob.offer_ctc / 100000).toFixed(1)}L` : '—'}
                </p>
              </td>
              <td className="px-4 py-3">
                <span className="px-2 py-1 rounded-full text-xs font-medium" style={{ background: 'rgba(255,71,87,0.10)', color: '#FF4757' }}>
                  {reasonLabel}
                </span>
              </td>
              <td className="px-4 py-3">{renderBadge(ob.status)}</td>
              <td className="px-4 py-3">
                <Link to={`/onboards/${ob.id}`} className="p-2 rounded-lg transition-colors" style={{ color: 'var(--text-muted)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = ''} title="View">
                  <Eye className="w-4 h-4" />
                </Link>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )

  const renderTable = () => {
    if (activeTab === 'selected') return renderSelectedTable()
    if (activeTab === 'hold') return renderHoldTable()
    if (activeTab === 'offer_released') return renderOfferReleasedTable()
    if (activeTab === 'onboarded') return renderOnboardedTable()
    if (activeTab === 'rejected') return renderRejectedTable()
    return null
  }

  return (
    <div className="p-4 space-y-3 page-enter">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-heading)' }}>Onboarding</h1>
          <p style={{ color: 'var(--text-muted)' }}>Track candidate placement journey</p>
        </div>
        {has('onboards:create') && (
          <Link to="/onboards/new" className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Release Offer
          </Link>
        )}
      </div>

      {/* Stat Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {STAT_CARDS.map(({ key, label, color, icon: Icon }) => (
            <div key={key} className="rounded-xl p-3" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${color}22` }}>
                  <Icon className="w-4 h-4" style={{ color }} />
                </div>
                <div>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</p>
                  <p className="text-lg font-bold leading-tight" style={{ color: 'var(--text-primary)' }}>{stats[key] ?? 0}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs + Search (single row) */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 p-1 rounded-xl flex-shrink-0" style={{ background: 'var(--bg-card-alt)' }}>
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => handleTabChange(tab.key)}
              style={{
                padding: '6px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
                fontSize: 14, fontWeight: 500, transition: 'all 0.15s',
                background: activeTab === tab.key ? 'var(--bg-card)' : 'transparent',
                color: activeTab === tab.key ? 'var(--accent)' : 'var(--text-muted)',
                boxShadow: activeTab === tab.key ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Search by candidate, job, client..."
            value={filters.search}
            onChange={e => handleFilterChange('search', e.target.value)}
            className="input w-full pl-10"
          />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin w-8 h-8 border-2 border-t-transparent rounded-full mx-auto" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
            <p className="mt-2" style={{ color: 'var(--text-muted)' }}>Loading...</p>
          </div>
        ) : onboards.length === 0 ? (
          <div className="p-8 text-center">
            <FileText className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--text-disabled)' }} />
            <p style={{ color: 'var(--text-muted)' }}>No records found in this tab</p>
            {activeTab === 'selected' && (
              <p className="text-sm mt-1" style={{ color: 'var(--text-disabled)' }}>
                Candidates appear here after passing all interview rounds
              </p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">{renderTable()}</div>
        )}

        {/* Pagination */}
        {pagination.pages > 1 && (
          <div className="px-4 py-3 flex items-center justify-between" style={{ borderTop: '1px solid var(--border)' }}>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Showing {(filters.page - 1) * filters.page_size + 1}–
              {Math.min(filters.page * filters.page_size, pagination.total)} of {pagination.total}
            </p>
            <div className="flex gap-2">
              <button onClick={() => handleFilterChange('page', filters.page - 1)} disabled={filters.page === 1} className="btn-secondary text-sm disabled:opacity-50">Previous</button>
              <button onClick={() => handleFilterChange('page', filters.page + 1)} disabled={filters.page === pagination.pages} className="btn-secondary text-sm disabled:opacity-50">Next</button>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {releaseModal && (
        <ReleaseOfferModal
          onboard={releaseModal}
          onClose={() => setReleaseModal(null)}
          onSuccess={() => { fetchOnboards(); fetchStats() }}
        />
      )}
      {rejectModal && (
        <RejectModal
          onboard={rejectModal}
          onClose={() => setRejectModal(null)}
          onSuccess={() => { fetchOnboards(); fetchStats() }}
        />
      )}
    </div>
  )
}

export default Onboards
