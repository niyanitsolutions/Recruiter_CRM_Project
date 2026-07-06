import React, { useState, useEffect } from 'react'
import {
  Plus, TrendingUp, Trash2, ChevronDown, ChevronUp, Eye,
  CheckCircle, Clock, User, Star, MessageSquare, Flag,
} from 'lucide-react'
import toast from 'react-hot-toast'
import hrmService from '../../services/hrmService'
import ModalPortal from '../../components/common/ModalPortal'
import TableScroll from '../../components/common/TableScroll'

// ── Constants ────────────────────────────────────────────────────────────────

const RATING_COLORS = {
  exceptional:    { text: 'text-purple-600', bg: 'bg-purple-100' },
  exceeds:        { text: 'text-blue-600',   bg: 'bg-blue-100' },
  meets:          { text: 'text-green-600',  bg: 'bg-green-100' },
  below:          { text: 'text-yellow-600', bg: 'bg-yellow-100' },
  unsatisfactory: { text: 'text-red-600',    bg: 'bg-red-100' },
}

const RATING_LABEL = {
  exceptional: 'Exceptional', exceeds: 'Exceeds', meets: 'Meets',
  below: 'Below', unsatisfactory: 'Unsatisfactory',
}

const LIFECYCLE_STAGES = [
  { key: 'created',          label: 'Created',         icon: Plus },
  { key: 'self_reviewed',    label: 'Self Review',     icon: User },
  { key: 'manager_reviewed', label: 'Manager Review',  icon: Star },
  { key: 'finalized',        label: 'Finalized',       icon: CheckCircle },
]

const EMPTY_POINT = { title: '', description: '', rating: '' }
const EMPTY_FORM  = {
  employee_id: '', employee_name: '', employee_email: '', employee_mobile: '',
  description: '', review_cycle: 'annual', year: new Date().getFullYear(),
  notify_email: true,
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function RatingBadge({ rating }) {
  if (!rating) return <span className="text-gray-400">—</span>
  const { text, bg } = RATING_COLORS[rating] || { text: 'text-gray-600', bg: 'bg-gray-100' }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${text} ${bg}`}>
      {RATING_LABEL[rating] || rating}
    </span>
  )
}

function getStageIndex(rv) {
  if (rv.is_finalized) return 3
  if (rv.manager_rating) return 2
  if (rv.self_rating) return 1
  return 0
}

// ── Create Review Form ────────────────────────────────────────────────────────

function CreateReviewModal({ isOpen, onClose, onCreated }) {
  const [form, setForm]           = useState(EMPTY_FORM)
  const [reviewPoints, setPoints] = useState([])
  const [saving, setSaving]       = useState(false)
  const [pointsOpen, setPointsOpen] = useState(false)
  const [employees, setEmployees] = useState([])
  const [employeesLoading, setEmployeesLoading] = useState(false)
  const [employeesLoaded, setEmployeesLoaded] = useState(false)

  const open = () => {
    setForm(EMPTY_FORM)
    setPoints([])
    setPointsOpen(false)
  }

  useEffect(() => { if (isOpen) open() }, [isOpen])

  // Fetch the active-employee list once and reuse it across modal opens —
  // selecting an employee auto-fills from this already-fetched object, no
  // extra API call per selection.
  useEffect(() => {
    if (!isOpen || employeesLoaded) return
    setEmployeesLoading(true)
    hrmService.listEmployees({ status: 'active', page_size: 200 })
      .then(res => setEmployees(res.data?.items || []))
      .catch(() => toast.error('Failed to load employees'))
      .finally(() => { setEmployeesLoading(false); setEmployeesLoaded(true) })
  }, [isOpen, employeesLoaded])

  const handleEmployeeSelect = (employeeDocId) => {
    const emp = employees.find(e => e.id === employeeDocId)
    setForm(f => ({
      ...f,
      employee_id: emp?.employee_id || '',
      employee_name: emp?.full_name || '',
      employee_email: emp?.email || '',
      employee_mobile: emp?.phone || '',
    }))
  }

  const addPoint = () => setPoints(p => [...p, { ...EMPTY_POINT }])
  const removePoint = (i) => setPoints(p => p.filter((_, idx) => idx !== i))
  const updatePoint = (i, field, val) =>
    setPoints(p => p.map((pt, idx) => idx === i ? { ...pt, [field]: val } : pt))

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!form.employee_id) {
      toast.error('Please select an employee')
      return
    }
    setSaving(true)
    try {
      await hrmService.createReview({
        ...form,
        year: Number(form.year),
        review_points: reviewPoints.filter(p => p.title.trim()),
      })
      toast.success('Review created')
      onCreated()
      onClose()
    } catch { toast.error('Failed to create review') }
    setSaving(false)
  }

  return (
    <ModalPortal isOpen={isOpen}>
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] overflow-y-auto py-8">
        <form onSubmit={handleCreate} className="bg-white rounded-xl p-6 w-full max-w-xl space-y-5 shadow-xl mx-4">
          <h2 className="text-lg font-semibold text-gray-900">Create Performance Review</h2>

          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Employee</h3>
            <div>
              <label className="text-sm font-medium text-gray-700">Employee <span className="text-red-500">*</span></label>
              <select className="input w-full mt-1" value={employees.find(e => e.employee_id === form.employee_id)?.id || ''}
                onChange={e => handleEmployeeSelect(e.target.value)} required disabled={employeesLoading}>
                <option value="">{employeesLoading ? 'Loading employees…' : 'Select Employee'}</option>
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.employee_id} - {emp.full_name}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-gray-700">Name</label>
                <input className="input w-full mt-1 bg-gray-50" value={form.employee_name} readOnly placeholder="Auto-filled" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Email</label>
                <input type="email" className="input w-full mt-1 bg-gray-50" value={form.employee_email} readOnly placeholder="Auto-filled" />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Mobile</label>
              <input className="input w-full mt-1 bg-gray-50" value={form.employee_mobile} readOnly placeholder="Auto-filled" />
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Review Period</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-gray-700">Cycle</label>
                <select className="input w-full mt-1" value={form.review_cycle}
                  onChange={e => setForm(f => ({ ...f, review_cycle: e.target.value }))}>
                  {['q1','q2','q3','q4','annual','mid_year'].map(c => (
                    <option key={c} value={c}>{c.toUpperCase().replace('_', ' ')}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Year</label>
                <input type="number" className="input w-full mt-1" value={form.year}
                  onChange={e => setForm(f => ({ ...f, year: e.target.value }))} />
              </div>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700">Description / Notes</label>
            <textarea className="input w-full mt-1 resize-none" rows={3} value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>

          <div>
            <button type="button" onClick={() => setPointsOpen(o => !o)}
              className="flex items-center gap-2 text-sm font-semibold text-gray-700 uppercase tracking-wide w-full text-left">
              {pointsOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              Review Points {reviewPoints.length > 0 && <span className="normal-case font-normal text-gray-400 ml-1">({reviewPoints.length})</span>}
            </button>
            {pointsOpen && (
              <div className="mt-3 space-y-3">
                {reviewPoints.map((pt, i) => (
                  <div key={i} className="border border-gray-200 rounded-lg p-3 space-y-2 bg-gray-50">
                    <div className="flex items-center gap-2">
                      <input className="input flex-1" placeholder="Point title" value={pt.title}
                        onChange={e => updatePoint(i, 'title', e.target.value)} />
                      <select className="input w-36" value={pt.rating}
                        onChange={e => updatePoint(i, 'rating', e.target.value)}>
                        <option value="">Rating…</option>
                        {Object.keys(RATING_LABEL).map(r => (
                          <option key={r} value={r}>{RATING_LABEL[r]}</option>
                        ))}
                      </select>
                      <button type="button" onClick={() => removePoint(i)} className="text-red-400 hover:text-red-600">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <textarea className="input w-full resize-none text-sm" rows={2} placeholder="Details…"
                      value={pt.description} onChange={e => updatePoint(i, 'description', e.target.value)} />
                  </div>
                ))}
                <button type="button" onClick={addPoint}
                  className="text-sm text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
                  <Plus className="w-3.5 h-3.5" /> Add Review Point
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-gray-100">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
              <input type="checkbox" checked={form.notify_email}
                onChange={e => setForm(f => ({ ...f, notify_email: e.target.checked }))}
                className="w-4 h-4 rounded" />
              Notify Employee (Send Email)
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Creating…' : 'Create Review'}
            </button>
          </div>
        </form>
      </div>
    </ModalPortal>
  )
}

// ── Review Detail Modal ───────────────────────────────────────────────────────

function ReviewDetailModal({ reviewId, onClose, onUpdated }) {
  const [review, setReview]     = useState(null)
  const [loading, setLoading]   = useState(true)
  const [tab, setTab]           = useState('overview')  // overview | self | manager
  const [selfForm, setSelfForm] = useState({ self_rating: '', self_comments: '' })
  const [mgr, setMgr]           = useState({ manager_rating: '', manager_comments: '', final_rating: '', finalize: false })
  const [saving, setSaving]     = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const res = await hrmService.getReview(reviewId)
      const rv = res.data
      setReview(rv)
      setSelfForm({ self_rating: rv.self_rating || '', self_comments: rv.self_comments || '' })
      setMgr({
        manager_rating: rv.manager_rating || '',
        manager_comments: rv.manager_comments || '',
        final_rating: rv.final_rating || '',
        finalize: rv.is_finalized || false,
      })
    } catch {}
    setLoading(false)
  }

  useEffect(() => { load() }, [reviewId])

  const submitSelf = async (e) => {
    e.preventDefault()
    if (!selfForm.self_rating) { toast.error('Rating required'); return }
    setSaving(true)
    try {
      await hrmService.submitSelfReview(reviewId, selfForm)
      toast.success('Self review submitted')
      onUpdated()
      load()
    } catch { toast.error('Failed to submit') }
    setSaving(false)
  }

  const submitManager = async (e) => {
    e.preventDefault()
    if (!mgr.manager_rating) { toast.error('Rating required'); return }
    setSaving(true)
    try {
      await hrmService.submitManagerReview(reviewId, mgr)
      toast.success(mgr.finalize ? 'Review finalized' : 'Manager review saved')
      onUpdated()
      load()
    } catch { toast.error('Failed to submit') }
    setSaving(false)
  }

  if (!reviewId) return null

  const stageIdx = review ? getStageIndex(review) : 0

  return (
    <ModalPortal isOpen={!!reviewId}>
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] overflow-y-auto py-8">
        <div className="bg-white rounded-xl w-full max-w-2xl shadow-xl mx-4">
          {/* Header */}
          <div className="p-5 border-b border-gray-200">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {review?.employee_name || review?.employee_id || '…'}
                </h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  {review?.review_cycle?.toUpperCase()} {review?.year}
                </p>
              </div>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>

            {/* Lifecycle bar */}
            <div className="flex items-center mt-4 gap-0">
              {LIFECYCLE_STAGES.map((stage, i) => {
                const done = i <= stageIdx
                const active = i === stageIdx
                return (
                  <React.Fragment key={stage.key}>
                    <div className={`flex flex-col items-center ${active ? 'opacity-100' : done ? 'opacity-100' : 'opacity-40'}`}>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold
                        ${done ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
                        {done ? <CheckCircle className="w-4 h-4" /> : <stage.icon className="w-4 h-4" />}
                      </div>
                      <span className="text-[10px] mt-1 text-gray-500 text-center w-16 leading-tight">{stage.label}</span>
                    </div>
                    {i < LIFECYCLE_STAGES.length - 1 && (
                      <div className={`flex-1 h-0.5 mb-4 ${i < stageIdx ? 'bg-indigo-600' : 'bg-gray-200'}`} />
                    )}
                  </React.Fragment>
                )
              })}
            </div>
          </div>

          {loading ? (
            <div className="p-8 text-center text-gray-400">Loading…</div>
          ) : (
            <>
              {/* Tabs */}
              <div className="flex border-b border-gray-200 px-5">
                {[
                  { key: 'overview', label: 'Overview' },
                  { key: 'self',     label: 'Self Review' },
                  { key: 'manager',  label: 'Manager Review' },
                ].map(t => (
                  <button key={t.key} onClick={() => setTab(t.key)}
                    className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px
                      ${tab === t.key ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="p-5 max-h-[50vh] overflow-y-auto space-y-4">
                {/* OVERVIEW TAB */}
                {tab === 'overview' && (
                  <div className="space-y-4">
                    {review.description && (
                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Description</p>
                        <p className="text-sm text-gray-700">{review.description}</p>
                      </div>
                    )}

                    <div className="grid grid-cols-3 gap-3">
                      <div className="rounded-lg p-3 bg-gray-50 text-center">
                        <p className="text-xs text-gray-500 mb-1">Self Rating</p>
                        <RatingBadge rating={review.self_rating} />
                      </div>
                      <div className="rounded-lg p-3 bg-gray-50 text-center">
                        <p className="text-xs text-gray-500 mb-1">Manager Rating</p>
                        <RatingBadge rating={review.manager_rating} />
                      </div>
                      <div className="rounded-lg p-3 bg-gray-50 text-center">
                        <p className="text-xs text-gray-500 mb-1">Final Rating</p>
                        <RatingBadge rating={review.final_rating} />
                      </div>
                    </div>

                    {review.review_points?.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Review Points</p>
                        <div className="space-y-2">
                          {review.review_points.map((pt, i) => (
                            <div key={i} className="border border-gray-200 rounded-lg p-3">
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-medium text-gray-800">{pt.title}</span>
                                <RatingBadge rating={pt.rating} />
                              </div>
                              {pt.description && <p className="text-xs text-gray-500 mt-1">{pt.description}</p>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Timeline */}
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Timeline</p>
                      <div className="space-y-2 text-sm">
                        {[
                          { label: 'Created', at: review.created_at, icon: Plus, color: 'text-gray-400' },
                          review.self_submitted_at && { label: `Self review: ${RATING_LABEL[review.self_rating] || ''}`, at: review.self_submitted_at, icon: User, color: 'text-blue-500' },
                          review.manager_reviewed_at && { label: `Manager review by ${review.manager_name || 'manager'}: ${RATING_LABEL[review.manager_rating] || ''}`, at: review.manager_reviewed_at, icon: Star, color: 'text-purple-500' },
                          review.finalized_at && { label: `Finalized — ${RATING_LABEL[review.final_rating] || ''}`, at: review.finalized_at, icon: CheckCircle, color: 'text-green-500' },
                        ].filter(Boolean).map((ev, i) => (
                          <div key={i} className="flex items-start gap-3">
                            <ev.icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${ev.color}`} />
                            <div>
                              <span className="text-gray-700">{ev.label}</span>
                              <span className="text-xs text-gray-400 ml-2">
                                {new Date(ev.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* SELF REVIEW TAB */}
                {tab === 'self' && (
                  review.self_rating && !review.is_finalized === false ? (
                    <div className="space-y-3 text-sm text-gray-700">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">Rating:</span>
                        <RatingBadge rating={review.self_rating} />
                      </div>
                      {review.self_comments && (
                        <div>
                          <span className="font-medium">Comments:</span>
                          <p className="mt-1 text-gray-600">{review.self_comments}</p>
                        </div>
                      )}
                      {review.self_submitted_at && (
                        <p className="text-xs text-gray-400">
                          Submitted {new Date(review.self_submitted_at).toLocaleString('en-IN')}
                        </p>
                      )}
                    </div>
                  ) : (
                    <form onSubmit={submitSelf} className="space-y-4">
                      <div>
                        <label className="text-sm font-medium text-gray-700">Rating <span className="text-red-500">*</span></label>
                        <select className="input w-full mt-1" value={selfForm.self_rating}
                          onChange={e => setSelfForm(f => ({ ...f, self_rating: e.target.value }))} required>
                          <option value="">Select rating…</option>
                          {Object.entries(RATING_LABEL).map(([v, l]) => (
                            <option key={v} value={v}>{l}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-700">Self Assessment Comments</label>
                        <textarea className="input w-full mt-1 resize-none" rows={4}
                          placeholder="Describe your achievements, challenges, and areas of growth…"
                          value={selfForm.self_comments}
                          onChange={e => setSelfForm(f => ({ ...f, self_comments: e.target.value }))} />
                      </div>
                      <div className="flex justify-end">
                        <button type="submit" disabled={saving || review.is_finalized} className="btn-primary">
                          {saving ? 'Submitting…' : review.self_rating ? 'Update Self Review' : 'Submit Self Review'}
                        </button>
                      </div>
                    </form>
                  )
                )}

                {/* MANAGER REVIEW TAB */}
                {tab === 'manager' && (
                  <form onSubmit={submitManager} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium text-gray-700">Manager Rating <span className="text-red-500">*</span></label>
                        <select className="input w-full mt-1" value={mgr.manager_rating}
                          onChange={e => setMgr(m => ({ ...m, manager_rating: e.target.value }))}
                          disabled={review.is_finalized} required>
                          <option value="">Select rating…</option>
                          {Object.entries(RATING_LABEL).map(([v, l]) => (
                            <option key={v} value={v}>{l}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-700">Final Rating</label>
                        <select className="input w-full mt-1" value={mgr.final_rating}
                          onChange={e => setMgr(m => ({ ...m, final_rating: e.target.value }))}
                          disabled={review.is_finalized}>
                          <option value="">Same as manager…</option>
                          {Object.entries(RATING_LABEL).map(([v, l]) => (
                            <option key={v} value={v}>{l}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700">Manager Comments</label>
                      <textarea className="input w-full mt-1 resize-none" rows={4}
                        placeholder="Manager's overall assessment and feedback…"
                        value={mgr.manager_comments}
                        onChange={e => setMgr(m => ({ ...m, manager_comments: e.target.value }))}
                        disabled={review.is_finalized} />
                    </div>
                    {!review.is_finalized && (
                      <label className="flex items-center gap-2 cursor-pointer text-sm">
                        <input type="checkbox" checked={mgr.finalize}
                          onChange={e => setMgr(m => ({ ...m, finalize: e.target.checked }))} />
                        <span className="font-medium text-gray-700">Mark review as finalized</span>
                      </label>
                    )}
                    <div className="flex justify-end">
                      <button type="submit" disabled={saving || review.is_finalized} className="btn-primary">
                        {saving ? 'Saving…' : mgr.finalize ? 'Save & Finalize' : 'Save Manager Review'}
                      </button>
                    </div>
                    {review.is_finalized && (
                      <p className="text-xs text-green-600 flex items-center gap-1">
                        <CheckCircle className="w-3.5 h-3.5" /> This review has been finalized
                      </p>
                    )}
                  </form>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </ModalPortal>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function Performance() {
  const [reviews, setReviews]       = useState([])
  const [total, setTotal]           = useState(0)
  const [page, setPage]             = useState(1)
  const [loading, setLoading]       = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [detailId, setDetailId]     = useState(null)

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

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this review? Only unfinalized reviews can be deleted.')) return
    try {
      await hrmService.deleteReview(id)
      toast.success('Deleted')
      load()
    } catch { toast.error('Failed — review may be finalized') }
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Performance Reviews</h1>
          <p className="text-sm text-gray-500">{total} reviews</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2 text-sm">
          <Plus className="w-4 h-4" /> Create Review
        </button>
      </div>

      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
        <TableScroll>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Employee', 'Cycle', 'Year', 'Self Rating', 'Manager Rating', 'Final', 'Status', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                [...Array(3)].map((_, i) => (
                  <tr key={i}><td colSpan={8} className="px-4 py-3">
                    <div className="h-4 bg-gray-100 rounded animate-pulse" />
                  </td></tr>
                ))
              ) : reviews.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-400">
                  <TrendingUp className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                  No reviews yet
                </td></tr>
              ) : reviews.map(rv => (
                <tr key={rv.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{rv.employee_name || rv.employee_id}</div>
                    {rv.employee_email && <div className="text-xs text-gray-400">{rv.employee_email}</div>}
                  </td>
                  <td className="px-4 py-3 text-gray-600 capitalize">{rv.review_cycle?.replace('_', ' ')}</td>
                  <td className="px-4 py-3 text-gray-600">{rv.year}</td>
                  <td className="px-4 py-3"><RatingBadge rating={rv.self_rating} /></td>
                  <td className="px-4 py-3"><RatingBadge rating={rv.manager_rating} /></td>
                  <td className="px-4 py-3"><RatingBadge rating={rv.final_rating} /></td>
                  <td className="px-4 py-3">
                    {rv.is_finalized
                      ? <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">Finalized</span>
                      : rv.manager_rating
                      ? <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">Mgr Reviewed</span>
                      : rv.self_rating
                      ? <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full text-xs font-medium">Self Done</span>
                      : <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full text-xs font-medium">Pending Self</span>
                    }
                  </td>
                  <td className="px-4 py-3 flex items-center gap-1">
                    <button onClick={() => setDetailId(rv.id)}
                      className="p-1.5 hover:bg-indigo-50 rounded text-indigo-500" title="View / Review">
                      <Eye className="w-4 h-4" />
                    </button>
                    {!rv.is_finalized && (
                      <button onClick={() => handleDelete(rv.id)}
                        className="p-1.5 hover:bg-red-50 rounded text-red-400" title="Delete">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
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

      <CreateReviewModal isOpen={showCreate} onClose={() => setShowCreate(false)} onCreated={load} />
      <ReviewDetailModal reviewId={detailId} onClose={() => setDetailId(null)} onUpdated={load} />
    </div>
  )
}
