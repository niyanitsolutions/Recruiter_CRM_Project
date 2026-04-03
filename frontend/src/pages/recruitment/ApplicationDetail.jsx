import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft, User, Briefcase, Building2, Calendar, Clock,
  CheckCircle, XCircle, AlertCircle, ChevronRight, ExternalLink,
  FileText, Phone, Mail, MapPin, DollarSign, Award
} from 'lucide-react'
import { toast } from 'react-hot-toast'
import applicationService from '../../services/applicationService'

// ── Status color map ──────────────────────────────────────────────────────────
const STATUS_COLORS = {
  applied:        { bg: 'rgba(99,102,241,0.15)',  text: '#818cf8', dot: '#6366f1' },
  eligible:       { bg: 'rgba(16,185,129,0.15)',  text: '#34d399', dot: '#10b981' },
  screening:      { bg: 'rgba(245,158,11,0.15)',  text: '#fbbf24', dot: '#f59e0b' },
  shortlisted:    { bg: 'rgba(59,130,246,0.15)',  text: '#60a5fa', dot: '#3b82f6' },
  interview:      { bg: 'rgba(139,92,246,0.15)',  text: '#a78bfa', dot: '#8b5cf6' },
  next_round:     { bg: 'rgba(168,85,247,0.15)',  text: '#c084fc', dot: '#a855f7' },
  selected:       { bg: 'rgba(16,185,129,0.15)',  text: '#34d399', dot: '#10b981' },
  offered:        { bg: 'rgba(245,158,11,0.15)',  text: '#fbbf24', dot: '#f59e0b' },
  offer_accepted: { bg: 'rgba(16,185,129,0.2)',   text: '#6ee7b7', dot: '#10b981' },
  offer_declined: { bg: 'rgba(239,68,68,0.15)',   text: '#fca5a5', dot: '#ef4444' },
  joined:         { bg: 'rgba(16,185,129,0.25)',  text: '#86efac', dot: '#22c55e' },
  rejected:       { bg: 'rgba(239,68,68,0.15)',   text: '#fca5a5', dot: '#ef4444' },
  withdrawn:      { bg: 'rgba(100,116,139,0.15)', text: '#94a3b8', dot: '#64748b' },
  on_hold:        { bg: 'rgba(245,158,11,0.1)',   text: '#fcd34d', dot: '#f59e0b' },
}

function StatusBadge({ status }) {
  const c = STATUS_COLORS[status] || STATUS_COLORS.applied
  const label = status?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) || ''
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '6px',
      padding: '4px 12px', borderRadius: '999px',
      background: c.bg, color: c.text,
      fontSize: '12px', fontWeight: 600, letterSpacing: '0.02em',
    }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: c.dot, flexShrink: 0 }} />
      {label}
    </span>
  )
}

// ── Timeline component ────────────────────────────────────────────────────────
function StageTimeline({ history }) {
  if (!history || history.length === 0) {
    return (
      <div style={{ color: '#64748b', fontSize: '13px', textAlign: 'center', padding: '24px 0' }}>
        No stage history recorded.
      </div>
    )
  }

  return (
    <div style={{ position: 'relative', paddingLeft: '28px' }}>
      {/* Vertical line */}
      <div style={{
        position: 'absolute', left: '10px', top: '8px',
        bottom: '8px', width: '2px',
        background: 'linear-gradient(to bottom, #6366f1, rgba(99,102,241,0.1))',
      }} />

      {history.map((entry, idx) => {
        const isLast = idx === history.length - 1
        const c = STATUS_COLORS[entry.to_stage] || STATUS_COLORS.applied
        const dt = entry.changed_at ? new Date(entry.changed_at) : null
        const dateStr = dt ? dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : ''
        const timeStr = dt ? dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : ''

        return (
          <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', marginBottom: isLast ? 0 : '24px', position: 'relative' }}>
            {/* Dot */}
            <div style={{
              position: 'absolute', left: '-24px', top: '4px',
              width: '18px', height: '18px', borderRadius: '50%',
              background: isLast ? c.dot : 'rgba(30,41,59,1)',
              border: `2px solid ${c.dot}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              zIndex: 1,
            }}>
              {isLast && <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#fff' }} />}
            </div>

            {/* Content */}
            <div style={{ flex: 1, paddingTop: '1px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                {entry.from_stage && (
                  <>
                    <StatusBadge status={entry.from_stage} />
                    <ChevronRight size={14} color="#475569" />
                  </>
                )}
                <StatusBadge status={entry.to_stage} />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '6px', flexWrap: 'wrap' }}>
                {entry.changed_by_name && (
                  <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                    by <span style={{ color: '#cbd5e1' }}>{entry.changed_by_name}</span>
                  </span>
                )}
                {dateStr && (
                  <span style={{ fontSize: '12px', color: '#64748b' }}>{dateStr} · {timeStr}</span>
                )}
              </div>

              {entry.remarks && (
                <div style={{
                  marginTop: '8px', padding: '8px 12px',
                  background: 'rgba(15,23,42,0.6)', borderRadius: '8px',
                  border: '1px solid rgba(51,65,85,0.5)',
                  fontSize: '12px', color: '#94a3b8',
                  fontStyle: 'italic',
                }}>
                  "{entry.remarks}"
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Info row ──────────────────────────────────────────────────────────────────
function InfoRow({ icon: Icon, label, value, mono = false }) {
  if (!value) return null
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '12px' }}>
      <Icon size={15} color="#6366f1" style={{ flexShrink: 0, marginTop: '2px' }} />
      <div>
        <div style={{ fontSize: '11px', color: '#64748b', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: '2px' }}>{label}</div>
        <div style={{ fontSize: '13px', color: '#e2e8f0', fontFamily: mono ? 'monospace' : 'inherit' }}>{value}</div>
      </div>
    </div>
  )
}

// ── Section card ──────────────────────────────────────────────────────────────
function Card({ title, children, style = {} }) {
  return (
    <div style={{
      background: 'rgba(13,21,53,0.6)',
      border: '1px solid rgba(99,102,241,0.15)',
      borderRadius: '14px',
      padding: '20px 24px',
      backdropFilter: 'blur(12px)',
      ...style,
    }}>
      {title && (
        <h3 style={{ fontSize: '13px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '16px' }}>
          {title}
        </h3>
      )}
      {children}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
const ApplicationDetail = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const [app, setApp] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const res = await applicationService.getApplication(id)
        setApp(res.data)
      } catch {
        toast.error('Failed to load application')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ width: 36, height: 36, borderRadius: '50%', border: '3px solid rgba(99,102,241,0.2)', borderTopColor: '#6366f1', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  if (!app) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b' }}>
        <AlertCircle size={40} style={{ margin: '0 auto 12px', color: '#ef4444' }} />
        <p>Application not found.</p>
        <button onClick={() => navigate('/applications')} className="btn btn-primary" style={{ marginTop: '16px' }}>
          Back to Applications
        </button>
      </div>
    )
  }

  const stageHistory = app.stage_history || []
  const isTerminal = ['joined', 'rejected', 'withdrawn', 'offer_declined'].includes(app.status)

  return (
    <div style={{ padding: '24px', maxWidth: '1100px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' }}>
        <button
          onClick={() => navigate('/applications')}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '13px' }}
        >
          <ArrowLeft size={16} /> Back
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#f1f5f9', margin: 0 }}>
              {app.candidate_name}
            </h1>
            <StatusBadge status={app.status} />
            {isTerminal && app.status === 'rejected' && app.rejection_reason && (
              <span style={{ fontSize: '12px', color: '#f87171', background: 'rgba(239,68,68,0.1)', padding: '2px 10px', borderRadius: '999px' }}>
                {app.rejection_reason.replace(/_/g, ' ')}
              </span>
            )}
          </div>
          <p style={{ fontSize: '13px', color: '#64748b', margin: '4px 0 0' }}>
            {app.job_title} · {app.client_name}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <Link
            to={`/interviews/schedule?application_id=${app.id}`}
            className="btn btn-primary btn-sm"
            style={{ textDecoration: 'none' }}
          >
            Schedule Interview
          </Link>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '20px' }}>
        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* Stage History Timeline */}
          <Card title="Application Journey">
            <StageTimeline history={stageHistory} />
          </Card>

          {/* Offer Details (shown when relevant) */}
          {(app.offered_ctc || app.offer_date) && (
            <Card title="Offer Details">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                {app.offered_ctc && (
                  <InfoRow icon={DollarSign} label="Offered CTC" value={`₹${Number(app.offered_ctc).toLocaleString('en-IN')}`} />
                )}
                {app.offered_designation && (
                  <InfoRow icon={Award} label="Offered Designation" value={app.offered_designation} />
                )}
                {app.offer_date && (
                  <InfoRow icon={Calendar} label="Offer Date" value={new Date(app.offer_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} />
                )}
                {app.expected_joining_date && (
                  <InfoRow icon={Calendar} label="Expected Joining" value={new Date(app.expected_joining_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} />
                )}
                {app.actual_joining_date && (
                  <InfoRow icon={CheckCircle} label="Actual Joining" value={new Date(app.actual_joining_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} />
                )}
              </div>
            </Card>
          )}

          {/* Rejection details */}
          {app.status === 'rejected' && app.rejection_reason && (
            <Card title="Rejection Details" style={{ borderColor: 'rgba(239,68,68,0.2)' }}>
              <InfoRow icon={XCircle} label="Reason" value={app.rejection_reason.replace(/_/g, ' ')} />
              {app.rejection_remarks && (
                <InfoRow icon={FileText} label="Remarks" value={app.rejection_remarks} />
              )}
            </Card>
          )}

          {/* Interview summary */}
          {app.total_interviews > 0 && (
            <Card title="Interview Summary">
              <div style={{ display: 'flex', gap: '20px' }}>
                {[
                  { label: 'Total', value: app.total_interviews, color: '#818cf8' },
                  { label: 'Completed', value: app.completed_interviews, color: '#34d399' },
                  { label: 'Pending', value: app.pending_interviews, color: '#fbbf24' },
                ].map(s => (
                  <div key={s.label} style={{ textAlign: 'center', flex: 1, padding: '12px', background: 'rgba(15,23,42,0.4)', borderRadius: '10px' }}>
                    <div style={{ fontSize: '24px', fontWeight: 700, color: s.color }}>{s.value}</div>
                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>{s.label}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: '12px' }}>
                <Link
                  to={`/interviews?application_id=${app.id}`}
                  style={{ fontSize: '13px', color: '#818cf8', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  View all interviews <ExternalLink size={12} />
                </Link>
              </div>
            </Card>
          )}
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* Candidate info */}
          <Card title="Candidate">
            <InfoRow icon={User} label="Name" value={app.candidate_name} />
            <InfoRow icon={Mail} label="Email" value={app.candidate_email} />
            <InfoRow icon={Phone} label="Mobile" value={app.candidate_mobile} />
            {app.eligibility_score != null && (
              <div style={{ marginTop: '12px' }}>
                <div style={{ fontSize: '11px', color: '#64748b', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: '6px' }}>Match Score</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ flex: 1, height: '6px', borderRadius: '3px', background: 'rgba(30,41,59,0.8)', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: '3px',
                      width: `${app.eligibility_score}%`,
                      background: app.eligibility_score >= 70 ? '#10b981' : app.eligibility_score >= 50 ? '#f59e0b' : '#ef4444',
                    }} />
                  </div>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#e2e8f0', minWidth: '36px' }}>
                    {Math.round(app.eligibility_score)}%
                  </span>
                </div>
              </div>
            )}
            <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid rgba(51,65,85,0.5)' }}>
              <Link
                to={`/candidates/${app.candidate_id}`}
                style={{ fontSize: '12px', color: '#818cf8', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                View full profile <ExternalLink size={11} />
              </Link>
            </div>
          </Card>

          {/* Job info */}
          <Card title="Job">
            <InfoRow icon={Briefcase} label="Title" value={app.job_title} />
            <InfoRow icon={Building2} label="Client" value={app.client_name} />
            {app.job_code && (
              <InfoRow icon={FileText} label="Job Code" value={app.job_code} mono />
            )}
          </Card>

          {/* Application meta */}
          <Card title="Details">
            <InfoRow icon={Calendar} label="Applied On" value={app.applied_at ? new Date(app.applied_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : ''} />
            {app.source && (
              <InfoRow icon={FileText} label="Source" value={app.source.charAt(0).toUpperCase() + app.source.slice(1)} />
            )}
            {app.assigned_to_name && (
              <InfoRow icon={User} label="Assigned To" value={app.assigned_to_name} />
            )}
            {app.partner_name && (
              <InfoRow icon={User} label="Partner" value={app.partner_name} />
            )}
            {app.current_stage_name && (
              <InfoRow icon={Clock} label="Current Stage" value={app.current_stage_name} />
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}

export default ApplicationDetail
