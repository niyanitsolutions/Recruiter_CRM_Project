import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FileText, Eye, Download, X, List, LayoutGrid,
  Users, ChevronRight, Building2
} from 'lucide-react'
import { toast } from 'react-hot-toast'
import applicationService from '../../services/applicationService'
import ExportModal from '../../components/common/ExportModal'
import usePermissions from '../../hooks/usePermissions'
import ModalPortal from '../../components/common/ModalPortal'
import { SkeletonCards } from '../../components/common/SkeletonLoader'
import { formatDate, getInitials } from '../../utils/format'
import { useLivePolling } from '../../hooks/useLivePolling'
import TableScroll from '../../components/common/TableScroll'
import CandidateApplicationPanel from './CandidateApplicationPanel'

// ── Status config ─────────────────────────────────────────────────────────────

const FALLBACK_STATUSES = [
  { value: 'applied', label: 'Applied' },
  { value: 'screening', label: 'Screening' },
  { value: 'shortlisted', label: 'Shortlisted' },
  { value: 'interview', label: 'In Interview' },
  { value: 'next_round', label: 'Next Round' },
  { value: 'selected', label: 'Selected' },
  { value: 'offered', label: 'Offered' },
  { value: 'offer_accepted', label: 'Offer Accepted' },
  { value: 'offer_declined', label: 'Offer Declined' },
  { value: 'joined', label: 'Joined' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'withdrawn', label: 'Withdrawn' },
  { value: 'on_hold', label: 'On Hold' },
]

const STATUS_STYLES = {
  applied:        { background: 'rgba(79,172,254,0.15)',   color: '#4FACFE' },
  screening:      { background: 'rgba(245,158,11,0.15)',   color: '#F59E0B' },
  shortlisted:    { background: 'rgba(108,99,255,0.15)',   color: '#6C63FF' },
  interview:      { background: 'rgba(108,99,255,0.20)',   color: '#9C63FF' },
  next_round:     { background: 'rgba(90,82,232,0.20)',    color: '#8B7FF8' },
  selected:       { background: 'rgba(67,233,123,0.20)',   color: '#43E97B' },
  offered:        { background: 'rgba(251,146,60,0.15)',   color: '#FB923C' },
  offer_accepted: { background: 'rgba(56,249,215,0.15)',   color: '#38F9D7' },
  offer_declined: { background: 'rgba(255,107,157,0.15)', color: '#FF6B9D' },
  joined:         { background: 'rgba(67,233,123,0.25)',   color: '#43E97B', fontWeight: 700 },
  rejected:       { background: 'rgba(255,71,87,0.15)',    color: '#FF4757' },
  withdrawn:      { background: 'rgba(139,143,168,0.15)', color: '#8B8FA8' },
  on_hold:        { background: 'rgba(245,158,11,0.10)',   color: '#F59E0B' },
  eligible:       { background: 'rgba(56,249,215,0.12)',   color: '#38F9D7' },
}

const getStatusStyle = s => STATUS_STYLES[s] || STATUS_STYLES.withdrawn
const fmtStatus = s => (s || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

// ── Score badge ───────────────────────────────────────────────────────────────

function ScoreBadge({ score }) {
  if (score == null) return <span style={{ fontSize: 12, color: 'var(--text-disabled)' }}>—</span>
  const style = score >= 70
    ? { background: 'rgba(67,233,123,0.15)', color: '#43E97B' }
    : score >= 50
    ? { background: 'rgba(245,158,11,0.15)', color: '#F59E0B' }
    : { background: 'rgba(255,71,87,0.12)', color: '#FF4757' }
  return (
    <span style={{ ...style, padding: '2px 8px', borderRadius: 999, fontSize: 12, fontWeight: 700 }}>
      {Math.round(score)}%
    </span>
  )
}

// ── Candidate avatar ──────────────────────────────────────────────────────────

function CandidateAvatar({ name }) {
  const initials = getInitials(name || '')
  const colors = [
    ['#6C63FF', '#9C63FF'], ['#43E97B', '#38F9D7'], ['#FB923C', '#F59E0B'],
    ['#4FACFE', '#38F9D7'], ['#FF6B9D', '#C850C0'],
  ]
  const idx = (name?.charCodeAt(0) || 0) % colors.length
  const [from, to] = colors[idx]
  return (
    <div style={{
      width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
      background: `linear-gradient(135deg, ${from}, ${to})`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 13, fontWeight: 700, color: '#fff',
    }}>
      {initials}
    </div>
  )
}

// ── Candidates View table row ─────────────────────────────────────────────────

function CandidateRow({ row, onClick }) {
  const [hovered, setHovered] = useState(false)
  return (
    <tr
      style={{
        borderBottom: '1px solid var(--border-subtle)',
        background: hovered ? 'var(--bg-hover)' : 'transparent',
        cursor: 'pointer',
        transition: 'background 0.12s',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
    >
      {/* Candidate */}
      <td style={{ padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <CandidateAvatar name={row.candidate_name} />
          <div>
            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
              {row.candidate_name}
            </p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>
              {row.candidate_email}
            </p>
          </div>
        </div>
      </td>

      {/* Applications count */}
      <td style={{ padding: '14px 16px' }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          background: 'rgba(108,99,255,0.12)', color: '#9C63FF',
          borderRadius: 999, padding: '3px 10px', fontSize: 12, fontWeight: 600,
        }}>
          <FileText size={11} />
          {row.total_applications}
        </span>
      </td>

      {/* Latest Application */}
      <td style={{ padding: '14px 16px' }}>
        <p style={{ fontSize: 13, color: 'var(--text-primary)', margin: 0 }}>
          {row.latest_job_title || '—'}
        </p>
        {row.latest_client_name && (
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Building2 size={11} /> {row.latest_client_name}
          </p>
        )}
      </td>

      {/* Status */}
      <td style={{ padding: '14px 16px' }}>
        {row.latest_status ? (
          <span style={{
            ...getStatusStyle(row.latest_status),
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: getStatusStyle(row.latest_status).color }} />
            {fmtStatus(row.latest_status)}
          </span>
        ) : '—'}
      </td>

      {/* ATS */}
      <td style={{ padding: '14px 16px' }}>
        <ScoreBadge score={row.best_eligibility_score} />
      </td>

      {/* Last Updated */}
      <td style={{ padding: '14px 16px' }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {formatDate(row.last_updated || row.latest_applied_at)}
        </span>
      </td>

      {/* Actions */}
      <td style={{ padding: '14px 16px' }}>
        <button
          onClick={e => { e.stopPropagation(); onClick() }}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            background: 'rgba(108,99,255,0.12)', border: 'none', cursor: 'pointer',
            color: '#9C63FF', fontSize: 12, borderRadius: 7, padding: '5px 10px',
          }}
        >
          View <ChevronRight size={12} />
        </button>
      </td>
    </tr>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

const Applications = () => {
  const navigate = useNavigate()
  const { has } = usePermissions()

  // ── Shared filter state ────────────────────────────────────────────────────
  const [filters, setFilters] = useState({ job_id: '', candidate_id: '', status: '', keyword: '' })
  const [statuses, setStatuses] = useState([])
  const [exportOpen, setExportOpen] = useState(false)

  // ── Outer view toggle: 'candidates' | 'applications' ──────────────────────
  const [mainView, setMainView] = useState('candidates')

  // ── Candidates view state ──────────────────────────────────────────────────
  const [candidatesData, setCandidatesData] = useState([])
  const [candidatesPagination, setCandidatesPagination] = useState({ page: 1, total: 0, totalPages: 0 })
  const [candidatesLoading, setCandidatesLoading] = useState(true)
  const [selectedCandidateId, setSelectedCandidateId] = useState(null)

  // ── Applications view state ────────────────────────────────────────────────
  const [applications, setApplications] = useState([])
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 0 })
  const [loading, setLoading] = useState(false)
  const [selectedIds, setSelectedIds] = useState([])
  const [showStatusModal, setShowStatusModal] = useState(false)
  const [viewMode, setViewMode] = useState('table')

  useEffect(() => { loadDropdowns() }, [])

  // Load appropriate data when view or filters change
  useEffect(() => {
    if (mainView === 'candidates') {
      loadCandidatesView()
    } else {
      loadApplications()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainView, candidatesPagination.page, pagination.page, filters])

  const loadDropdowns = async () => {
    try {
      const res = await applicationService.getStatuses()
      setStatuses(res.data || [])
    } catch {
      // use fallback
    }
  }

  // ── Candidates view ────────────────────────────────────────────────────────

  const loadCandidatesView = useCallback(async (silent = false) => {
    try {
      if (!silent) setCandidatesLoading(true)
      const params = {
        page: candidatesPagination.page,
        page_size: 20,
        ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)),
      }
      const res = await applicationService.getCandidatesView(params)
      setCandidatesData(res.data || [])
      setCandidatesPagination(prev => ({
        ...prev,
        total: res.pagination?.total || 0,
        totalPages: res.pagination?.total_pages || 0,
      }))
    } catch {
      if (!silent) toast.error('Failed to load candidates view')
    } finally {
      if (!silent) setCandidatesLoading(false)
    }
  }, [candidatesPagination.page, filters])

  // ── Applications view ──────────────────────────────────────────────────────

  const loadApplications = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true)
      const params = {
        page: pagination.page,
        page_size: 20,
        ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)),
      }
      const res = await applicationService.getApplications(params)
      setApplications(res.data || [])
      setPagination(prev => ({
        ...prev,
        total: res.pagination?.total || 0,
        totalPages: res.pagination?.total_pages || 0,
      }))
    } catch {
      if (!silent) toast.error('Failed to load applications')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [pagination.page, filters])

  // Silent background refresh
  useLivePolling(() => {
    if (mainView === 'candidates') loadCandidatesView(true)
    else loadApplications(true)
  }, 5000)

  const handleStatusUpdate = async (applicationId, newStatus) => {
    try {
      const res = await applicationService.updateStatus(applicationId, { status: newStatus })
      if (res?.success === false) {
        toast.error(res.message || 'Failed to update status')
      } else {
        toast.success('Status updated')
        loadApplications()
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to update status')
    }
  }

  const handleBulkStatusUpdate = async (newStatus) => {
    if (!selectedIds.length) { toast.error('Select applications first'); return }
    try {
      await applicationService.bulkUpdateStatus(selectedIds, newStatus)
      toast.success(`Updated ${selectedIds.length} applications`)
      setSelectedIds([])
      setShowStatusModal(false)
      loadApplications()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to update applications')
    }
  }

  const toggleSelect = id => setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id])
  const toggleSelectAll = () =>
    setSelectedIds(selectedIds.length === applications.length ? [] : applications.map(a => a.id))

  const clearFilters = () => setFilters({ job_id: '', candidate_id: '', status: '', keyword: '' })

  const hasActiveFilters = filters.keyword || filters.status || filters.job_id || filters.candidate_id

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 page-enter">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-heading)' }}>Applications</h1>
          <p style={{ color: 'var(--text-muted)' }}>Track candidate applications through the hiring pipeline</p>
        </div>
        <div className="flex items-center gap-2">
          {has('exports:create') && (
            <button onClick={() => setExportOpen(true)} className="btn-secondary flex items-center gap-2">
              <Download className="w-4 h-4" /> Export
            </button>
          )}
          {mainView === 'applications' && selectedIds.length > 0 && has('applications:edit') && (
            <div className="flex items-center gap-3">
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{selectedIds.length} selected</span>
              <button onClick={() => setShowStatusModal(true)} className="btn-primary text-sm">Update Status</button>
            </div>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-xl p-4 mb-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
        <div className="flex flex-wrap gap-3">
          <div className="flex-1 min-w-[200px]">
            <input
              type="text"
              value={filters.keyword}
              onChange={e => setFilters(prev => ({ ...prev, keyword: e.target.value }))}
              placeholder={mainView === 'candidates' ? 'Search by candidate, job, client or skills…' : 'Search by candidate, job or client…'}
              className="input w-full"
            />
          </div>
          <div className="min-w-[180px]">
            <select
              value={filters.status}
              onChange={e => setFilters(prev => ({ ...prev, status: e.target.value }))}
              className="input w-full"
            >
              <option value="">All Statuses</option>
              {(statuses.length ? statuses : FALLBACK_STATUSES).map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          {hasActiveFilters && (
            <button onClick={clearFilters} className="btn-secondary text-sm flex items-center gap-1">
              <X className="w-3.5 h-3.5" /> Clear
            </button>
          )}
        </div>
      </div>

      {/* View Toggle: outer (Candidates / Applications) */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-1 p-1 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
          <button
            onClick={() => { setMainView('candidates'); setCandidatesPagination(p => ({ ...p, page: 1 })) }}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 14px', borderRadius: 9, border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: 600, transition: 'all 0.15s',
              background: mainView === 'candidates' ? 'var(--accent)' : 'transparent',
              color: mainView === 'candidates' ? '#fff' : 'var(--text-muted)',
            }}
          >
            <Users size={14} /> Candidates View
          </button>
          <button
            onClick={() => { setMainView('applications'); setPagination(p => ({ ...p, page: 1 })) }}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 14px', borderRadius: 9, border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: 600, transition: 'all 0.15s',
              background: mainView === 'applications' ? 'var(--accent)' : 'transparent',
              color: mainView === 'applications' ? '#fff' : 'var(--text-muted)',
            }}
          >
            <FileText size={14} /> Applications View
          </button>
        </div>

        {/* Inner view toggle (table / card) — only in Applications view */}
        {mainView === 'applications' && (
          <div className="flex items-center gap-1">
            <button onClick={() => setViewMode('table')} className="p-2 rounded-lg transition-colors" style={viewMode === 'table' ? { background: 'var(--accent)', color: '#fff' } : { color: 'var(--text-muted)' }} title="Table view"><List className="w-4 h-4" /></button>
            <button onClick={() => setViewMode('card')} className="p-2 rounded-lg transition-colors" style={viewMode === 'card' ? { background: 'var(--accent)', color: '#fff' } : { color: 'var(--text-muted)' }} title="Card view"><LayoutGrid className="w-4 h-4" /></button>
          </div>
        )}
      </div>

      {/* ── CANDIDATES VIEW ────────────────────────────────────────────────── */}
      {mainView === 'candidates' && (
        <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
          {candidatesLoading ? (
            <div>
              {[...Array(6)].map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-4 py-4" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <div className="w-9 h-9 rounded-full skeleton flex-shrink-0" style={{ background: 'var(--skeleton-from)' }} />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 rounded skeleton w-36" style={{ background: 'var(--skeleton-from)' }} />
                    <div className="h-2.5 rounded skeleton w-48" style={{ background: 'var(--skeleton-from)' }} />
                  </div>
                  <div className="h-5 rounded-full skeleton w-16" style={{ background: 'var(--skeleton-from)' }} />
                  <div className="h-3 rounded skeleton w-28" style={{ background: 'var(--skeleton-from)' }} />
                  <div className="h-5 rounded-full skeleton w-20" style={{ background: 'var(--skeleton-from)' }} />
                </div>
              ))}
            </div>
          ) : candidatesData.length === 0 ? (
            <div className="p-8 text-center">
              <Users className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--text-disabled)' }} />
              <p style={{ color: 'var(--text-muted)' }}>No candidates found</p>
            </div>
          ) : (
            <TableScroll>
              <table className="w-full">
                <thead style={{ background: 'var(--bg-card-alt)', borderBottom: '1px solid var(--border)' }}>
                  <tr>
                    <th className="text-left px-4 py-3 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Candidate</th>
                    <th className="text-left px-4 py-3 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Applications</th>
                    <th className="text-left px-4 py-3 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Latest Application</th>
                    <th className="text-left px-4 py-3 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Status</th>
                    <th className="text-left px-4 py-3 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Best ATS</th>
                    <th className="text-left px-4 py-3 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Last Updated</th>
                    <th className="text-right px-4 py-3 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {candidatesData.map(row => (
                    <CandidateRow
                      key={row.candidate_id}
                      row={row}
                      onClick={() => setSelectedCandidateId(row.candidate_id)}
                    />
                  ))}
                </tbody>
              </table>
            </TableScroll>
          )}

          {/* Candidates pagination */}
          {candidatesPagination.totalPages > 1 && (
            <div className="px-4 py-3 flex items-center justify-between" style={{ borderTop: '1px solid var(--border)' }}>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                Showing {candidatesData.length} of {candidatesPagination.total} candidates
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setCandidatesPagination(p => ({ ...p, page: p.page - 1 }))}
                  disabled={candidatesPagination.page === 1}
                  className="btn-secondary text-sm disabled:opacity-50"
                >Previous</button>
                <button
                  onClick={() => setCandidatesPagination(p => ({ ...p, page: p.page + 1 }))}
                  disabled={candidatesPagination.page === candidatesPagination.totalPages}
                  className="btn-secondary text-sm disabled:opacity-50"
                >Next</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── APPLICATIONS VIEW ──────────────────────────────────────────────── */}
      {mainView === 'applications' && (
        <>
          {/* Card View */}
          {viewMode === 'card' && (
            <div>
              {loading ? (
                <SkeletonCards count={6} />
              ) : applications.length === 0 ? (
                <div className="p-8 text-center">
                  <FileText className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--text-disabled)' }} />
                  <p style={{ color: 'var(--text-muted)' }}>No applications found</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {applications.map(app => (
                    <div
                      key={app.id}
                      className="rounded-xl p-4 cursor-pointer animate-stagger"
                      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)', transition: 'transform 0.18s ease, box-shadow 0.18s ease' }}
                      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = 'var(--shadow-elevated)' }}
                      onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '' }}
                      onClick={() => navigate(`/applications/${app.id}`)}
                    >
                      <div className="flex items-start gap-3 mb-3">
                        <CandidateAvatar name={app.candidate_name} />
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>{app.candidate_name}</p>
                          <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{app.candidate_email}</p>
                        </div>
                        <ScoreBadge score={app.eligibility_score} />
                      </div>
                      <p className="text-sm font-medium mb-0.5 truncate" style={{ color: 'var(--text-primary)' }}>{app.job_title}</p>
                      <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>{app.client_name}</p>
                      <div className="flex items-center justify-between">
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={getStatusStyle(app.status)}>{fmtStatus(app.status)}</span>
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{formatDate(app.applied_at)}</span>
                      </div>
                      <div className="flex items-center justify-end mt-3 pt-2" style={{ borderTop: '1px solid var(--border-subtle)' }} onClick={e => e.stopPropagation()}>
                        <button onClick={() => navigate(`/applications/${app.id}`)} className="p-2 rounded-lg transition-colors" style={{ color: 'var(--text-muted)' }} onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'} onMouseLeave={e => e.currentTarget.style.background = ''} title="View"><Eye className="w-4 h-4" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Table View */}
          {viewMode === 'table' && (
            <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
              {loading ? (
                <div>
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="flex items-center gap-4 px-4 py-4" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <div className="w-5 h-5 rounded skeleton flex-shrink-0" style={{ background: 'var(--skeleton-from)' }} />
                      <div className="w-8 h-8 rounded-full skeleton flex-shrink-0" style={{ background: 'var(--skeleton-from)' }} />
                      <div className="flex-1 space-y-2">
                        <div className="h-3 rounded skeleton w-36" style={{ background: 'var(--skeleton-from)' }} />
                        <div className="h-2.5 rounded skeleton w-48" style={{ background: 'var(--skeleton-from)' }} />
                      </div>
                      <div className="h-3 rounded skeleton w-24" style={{ background: 'var(--skeleton-from)' }} />
                      <div className="h-5 rounded-full skeleton w-20" style={{ background: 'var(--skeleton-from)' }} />
                      <div className="h-3 rounded skeleton w-16" style={{ background: 'var(--skeleton-from)' }} />
                    </div>
                  ))}
                </div>
              ) : applications.length === 0 ? (
                <div className="p-8 text-center">
                  <FileText className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--text-disabled)' }} />
                  <p style={{ color: 'var(--text-muted)' }}>No applications found</p>
                </div>
              ) : (
                <TableScroll>
                  <table className="w-full">
                    <thead style={{ background: 'var(--bg-card-alt)', borderBottom: '1px solid var(--border)' }}>
                      <tr>
                        <th className="w-12 px-4 py-3">
                          <input type="checkbox" checked={selectedIds.length === applications.length && applications.length > 0} onChange={toggleSelectAll} className="rounded" />
                        </th>
                        <th className="text-left px-4 py-3 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Candidate</th>
                        <th className="text-left px-4 py-3 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Match</th>
                        <th className="text-left px-4 py-3 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Job</th>
                        <th className="text-left px-4 py-3 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Stage</th>
                        <th className="text-left px-4 py-3 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Status</th>
                        <th className="text-left px-4 py-3 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Interviews</th>
                        <th className="text-left px-4 py-3 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Applied</th>
                        <th className="text-left px-4 py-3 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Last Updated</th>
                        <th className="text-right px-4 py-3 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {applications.map(app => (
                        <tr
                          key={app.id}
                          className="transition-colors"
                          style={{ borderBottom: '1px solid var(--border-subtle)' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                          onMouseLeave={e => e.currentTarget.style.background = ''}
                        >
                          <td className="px-4 py-4">
                            <input type="checkbox" checked={selectedIds.includes(app.id)} onChange={() => toggleSelect(app.id)} className="rounded" />
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-3">
                              <CandidateAvatar name={app.candidate_name} />
                              <div>
                                <p className="font-medium" style={{ color: 'var(--text-primary)' }}>{app.candidate_name}</p>
                                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{app.candidate_email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4"><ScoreBadge score={app.eligibility_score} /></td>
                          <td className="px-4 py-4">
                            <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{app.job_title}</p>
                            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{app.client_name}</p>
                          </td>
                          <td className="px-4 py-4">
                            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{app.current_stage_name || '-'}</span>
                          </td>
                          <td className="px-4 py-4">
                            <select
                              value={app.status}
                              onChange={e => handleStatusUpdate(app.id, e.target.value)}
                              className="text-xs font-medium rounded-full px-2 py-1 border-0 cursor-pointer focus:outline-none"
                              style={getStatusStyle(app.status)}
                            >
                              {(statuses.length ? statuses : FALLBACK_STATUSES).map(s => (
                                <option key={s.value} value={s.value}>{s.label}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-4">
                            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{app.total_interviews || 0} total</span>
                          </td>
                          <td className="px-4 py-4">
                            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>{formatDate(app.applied_at)}</span>
                          </td>
                          <td className="px-4 py-4">
                            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>{app.status_changed_at ? formatDate(app.status_changed_at) : '—'}</span>
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => navigate(`/applications/${app.id}`)}
                                className="p-2 rounded-lg transition-colors"
                                style={{ color: 'var(--text-muted)' }}
                                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                                onMouseLeave={e => e.currentTarget.style.background = ''}
                                title="View"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableScroll>
              )}

              {/* Applications pagination */}
              {pagination.totalPages > 1 && (
                <div className="px-4 py-3 flex items-center justify-between" style={{ borderTop: '1px solid var(--border)' }}>
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    Showing {applications.length} of {pagination.total} applications
                  </p>
                  <div className="flex gap-2">
                    <button onClick={() => setPagination(p => ({ ...p, page: p.page - 1 }))} disabled={pagination.page === 1} className="btn-secondary text-sm disabled:opacity-50">Previous</button>
                    <button onClick={() => setPagination(p => ({ ...p, page: p.page + 1 }))} disabled={pagination.page === pagination.totalPages} className="btn-secondary text-sm disabled:opacity-50">Next</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Bulk Status Modal ──────────────────────────────────────────────── */}
      <ModalPortal isOpen={showStatusModal}>
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]">
          <div className="rounded-xl shadow-xl p-6 w-full max-w-md" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
            <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Update Status</h3>
            <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
              Select new status for {selectedIds.length} application(s)
            </p>
            <div className="grid grid-cols-2 gap-2 mb-6">
              {(statuses.length ? statuses : FALLBACK_STATUSES).map(s => (
                <button
                  key={s.value}
                  onClick={() => handleBulkStatusUpdate(s.value)}
                  className="px-4 py-2 text-sm rounded-lg transition-colors text-left"
                  style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <div className="flex justify-end">
              <button onClick={() => setShowStatusModal(false)} className="btn-secondary">Cancel</button>
            </div>
          </div>
        </div>
      </ModalPortal>

      {/* ── Export Modal ────────────────────────────────────────────────────── */}
      <ExportModal
        isOpen={exportOpen}
        onClose={() => setExportOpen(false)}
        title="Export Applications"
        apiPath="/export/applications"
        extraFilters={({ status, setStatus }) => (
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-label)' }}>Status</label>
            <select value={status} onChange={e => setStatus(e.target.value)} className="input w-full">
              <option value="">All Statuses</option>
              {statuses.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
        )}
      />

      {/* ── Candidate Panel + backdrop ──────────────────────────────────────── */}
      {selectedCandidateId && (
        <>
          <div
            style={{
              position: 'fixed', inset: 0,
              background: 'rgba(0,0,0,0.4)',
              zIndex: 999,
              backdropFilter: 'blur(2px)',
            }}
            onClick={() => setSelectedCandidateId(null)}
          />
          <CandidateApplicationPanel
            candidateId={selectedCandidateId}
            onClose={() => setSelectedCandidateId(null)}
          />
        </>
      )}
    </div>
  )
}

export default Applications
