import React, { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  X, User, Mail, Phone, MapPin, Briefcase, Calendar, FileText,
  ChevronRight, ExternalLink, Download, Edit2, Check, Building2,
  MessageSquare, Clock, Award, GraduationCap, Star, Layers
} from 'lucide-react'
import { toast } from 'react-hot-toast'
import applicationService from '../../services/applicationService'
import candidateService from '../../services/candidateService'
import { formatDate, formatDateTime } from '../../utils/format'
import EmployeeAvatar from '../../components/common/EmployeeAvatar'
import CallButton from '../../components/telephony/CallButton'

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_STYLES = {
  applied:        { background: 'rgba(79,172,254,0.15)',   color: '#4FACFE' },
  eligible:       { background: 'rgba(56,249,215,0.15)',   color: '#38F9D7' },
  screening:      { background: 'rgba(245,158,11,0.15)',   color: '#F59E0B' },
  shortlisted:    { background: 'rgba(108,99,255,0.15)',   color: '#6C63FF' },
  interview:      { background: 'rgba(108,99,255,0.20)',   color: '#9C63FF' },
  next_round:     { background: 'rgba(90,82,232,0.20)',    color: '#8B7FF8' },
  selected:       { background: 'rgba(67,233,123,0.20)',   color: '#43E97B' },
  offered:        { background: 'rgba(251,146,60,0.15)',   color: '#FB923C' },
  offer_accepted: { background: 'rgba(56,249,215,0.15)',   color: '#38F9D7' },
  offer_declined: { background: 'rgba(255,107,157,0.15)', color: '#FF6B9D' },
  joined:         { background: 'rgba(67,233,123,0.25)',   color: '#43E97B' },
  rejected:       { background: 'rgba(255,71,87,0.15)',    color: '#FF4757' },
  withdrawn:      { background: 'rgba(139,143,168,0.15)', color: '#8B8FA8' },
  on_hold:        { background: 'rgba(245,158,11,0.10)',   color: '#F59E0B' },
}

const STATUS_PROGRESS = {
  applied: 10, eligible: 15, screening: 25, shortlisted: 40,
  interview: 60, next_round: 65, selected: 75, offered: 85,
  offer_accepted: 90, joined: 100, rejected: 5, withdrawn: 5, on_hold: 30
}

const PIPELINE_STAGES = ['Applied', 'Screening', 'Technical', 'HR Round', 'Offer']

const getStatusStyle = s => STATUS_STYLES[s] || STATUS_STYLES.withdrawn
const getProgress = s => STATUS_PROGRESS[s] ?? 10
const fmtStatus = s => (s || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const style = getStatusStyle(status)
  return (
    <span style={{
      ...style,
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 999,
      fontSize: 11, fontWeight: 600, letterSpacing: '0.02em',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: style.color, flexShrink: 0 }} />
      {fmtStatus(status)}
    </span>
  )
}

function ScoreBadge({ score }) {
  if (score == null) return null
  const color = score >= 70 ? '#43E97B' : score >= 50 ? '#F59E0B' : '#FF4757'
  const bg = score >= 70 ? 'rgba(67,233,123,0.15)' : score >= 50 ? 'rgba(245,158,11,0.15)' : 'rgba(255,71,87,0.12)'
  return (
    <span style={{ background: bg, color, fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999 }}>
      {Math.round(score)}%
    </span>
  )
}

function ProgressBar({ value, status }) {
  const color = status === 'rejected' || status === 'withdrawn'
    ? '#FF4757'
    : status === 'joined' || status === 'offer_accepted'
    ? '#43E97B'
    : '#6C63FF'
  return (
    <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
      <div style={{
        height: '100%', borderRadius: 2,
        width: `${value}%`,
        background: color,
        transition: 'width 0.4s ease',
      }} />
    </div>
  )
}

function MiniTimeline({ history }) {
  if (!history || history.length === 0) return null
  const stages = history.slice(-5)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 8 }}>
      {PIPELINE_STAGES.map((stage, i) => {
        const done = i < stages.length
        return (
          <React.Fragment key={stage}>
            <div style={{
              width: 18, height: 18, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: done ? '#6C63FF' : 'rgba(255,255,255,0.08)',
              border: `2px solid ${done ? '#6C63FF' : 'rgba(255,255,255,0.15)'}`,
              flexShrink: 0,
            }}>
              {done && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />}
            </div>
            {i < PIPELINE_STAGES.length - 1 && (
              <div style={{ flex: 1, height: 2, background: done ? '#6C63FF' : 'rgba(255,255,255,0.08)', minWidth: 8 }} />
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}

// ── Application Card ──────────────────────────────────────────────────────────

function ApplicationCard({ app }) {
  const progress = getProgress(app.status)
  return (
    <div style={{
      background: 'var(--bg-card-alt, rgba(255,255,255,0.03))',
      border: '1px solid var(--border-subtle, rgba(255,255,255,0.08))',
      borderRadius: 12, padding: '16px',
      marginBottom: 12,
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'rgba(108,99,255,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <Briefcase size={16} color="#6C63FF" />
          </div>
          <div>
            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>{app.job_title}</p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Building2 size={11} />
              {app.client_name}
            </p>
          </div>
        </div>
        <StatusBadge status={app.status} />
      </div>

      {/* Meta row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
        <div>
          <p style={{ fontSize: 10, color: 'var(--text-disabled)', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Applied</p>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>{formatDate(app.applied_at)}</p>
        </div>
        <div>
          <p style={{ fontSize: 10, color: 'var(--text-disabled)', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Stage</p>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>{app.current_stage_name || '—'}</p>
        </div>
        <div>
          <p style={{ fontSize: 10, color: 'var(--text-disabled)', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Interviews</p>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>{app.total_interviews ?? 0}</p>
        </div>
        <div>
          <p style={{ fontSize: 10, color: 'var(--text-disabled)', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>ATS</p>
          <ScoreBadge score={app.eligibility_score} />
        </div>
      </div>

      {/* Progress */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <ProgressBar value={progress} status={app.status} />
        </div>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, minWidth: 30, textAlign: 'right' }}>
          {progress}%
        </span>
      </div>

      {/* Mini timeline */}
      <MiniTimeline history={app.current_stage_name ? [app.current_stage_name] : []} />

      {/* View link */}
      <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border-subtle, rgba(255,255,255,0.06))' }}>
        <Link
          to={`/applications/${app.id}`}
          style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}
          onClick={e => e.stopPropagation()}
        >
          View Full Details <ExternalLink size={11} />
        </Link>
      </div>
    </div>
  )
}

// ── Timeline Entry ────────────────────────────────────────────────────────────

function TimelineEntry({ entry, isLast }) {
  const style = getStatusStyle(entry.to_stage)
  const dt = entry.changed_at ? new Date(entry.changed_at) : null
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: isLast ? 0 : 20, position: 'relative' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
        <div style={{
          width: 20, height: 20, borderRadius: '50%',
          background: isLast ? style.color : 'transparent',
          border: `2px solid ${style.color}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1,
        }}>
          {isLast && <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#fff' }} />}
        </div>
        {!isLast && <div style={{ width: 2, flex: 1, background: 'rgba(255,255,255,0.08)', minHeight: 20 }} />}
      </div>
      <div style={{ flex: 1, paddingTop: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {entry.from_stage && (
            <>
              <StatusBadge status={entry.from_stage} />
              <ChevronRight size={12} color="var(--text-disabled)" />
            </>
          )}
          <StatusBadge status={entry.to_stage} />
        </div>
        {entry.job_title && (
          <p style={{ fontSize: 11, color: 'var(--text-disabled)', margin: '4px 0 0' }}>
            {entry.job_title} · {entry.client_name}
          </p>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
          {entry.changed_by_name && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>by {entry.changed_by_name}</span>
          )}
          {dt && (
            <span style={{ fontSize: 11, color: 'var(--text-disabled)' }}>{formatDateTime(dt)}</span>
          )}
        </div>
        {entry.remarks && (
          <div style={{
            marginTop: 6, padding: '6px 10px',
            background: 'rgba(255,255,255,0.03)', borderRadius: 6,
            border: '1px solid rgba(255,255,255,0.06)',
            fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic',
          }}>
            "{entry.remarks}"
          </div>
        )}
      </div>
    </div>
  )
}

// ── Profile field ─────────────────────────────────────────────────────────────

function ProfileField({ icon: Icon, label, value }) {
  if (!value) return null
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
      <div style={{
        width: 30, height: 30, borderRadius: 8,
        background: 'rgba(108,99,255,0.12)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Icon size={14} color="#6C63FF" />
      </div>
      <div>
        <p style={{ fontSize: 10, color: 'var(--text-disabled)', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</p>
        <p style={{ fontSize: 13, color: 'var(--text-primary)', margin: 0 }}>{value}</p>
      </div>
    </div>
  )
}

// ── Main Panel ────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'applications', label: 'Applications', icon: Layers },
  { id: 'profile',      label: 'Profile',      icon: User },
  { id: 'timeline',     label: 'Timeline',     icon: Clock },
  { id: 'notes',        label: 'Notes',        icon: MessageSquare },
  { id: 'documents',    label: 'Documents',    icon: FileText },
]

const CandidateApplicationPanel = ({ candidateId, onClose }) => {
  const [activeTab, setActiveTab] = useState('applications')
  const [candidate, setCandidate] = useState(null)
  const [applications, setApplications] = useState([])
  const [loading, setLoading] = useState(true)
  const [timelineEntries, setTimelineEntries] = useState(null)
  const [timelineLoading, setTimelineLoading] = useState(false)
  const [editingNotes, setEditingNotes] = useState(false)
  const [notesValue, setNotesValue] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)

  const loadData = useCallback(async () => {
    if (!candidateId) return
    setLoading(true)
    setCandidate(null)
    setApplications([])
    setTimelineEntries(null)
    setActiveTab('applications')
    setEditingNotes(false)
    try {
      const [cRes, aRes] = await Promise.all([
        candidateService.getCandidate(candidateId),
        applicationService.getApplications({ candidate_id: candidateId, page_size: 100 }),
      ])
      const cand = cRes.data
      setCandidate(cand)
      setNotesValue(cand?.notes || '')
      setApplications(aRes.data || [])
    } catch {
      toast.error('Failed to load candidate details')
    } finally {
      setLoading(false)
    }
  }, [candidateId])

  useEffect(() => { loadData() }, [loadData])

  const loadTimeline = useCallback(async () => {
    if (timelineEntries !== null || applications.length === 0) return
    setTimelineLoading(true)
    try {
      const details = await Promise.all(
        applications.slice(0, 30).map(a => applicationService.getApplication(a.id))
      )
      const all = []
      details.forEach(res => {
        const app = res.data
        ;(app?.stage_history || []).forEach(entry => {
          all.push({ ...entry, job_title: app?.job_title, client_name: app?.client_name })
        })
      })
      all.sort((a, b) => new Date(b.changed_at) - new Date(a.changed_at))
      setTimelineEntries(all)
    } catch {
      toast.error('Failed to load timeline')
    } finally {
      setTimelineLoading(false)
    }
  }, [applications, timelineEntries])

  const handleTabChange = id => {
    setActiveTab(id)
    if (id === 'timeline') loadTimeline()
  }

  const handleSaveNotes = async () => {
    setSavingNotes(true)
    try {
      await candidateService.updateCandidate(candidateId, { notes: notesValue })
      toast.success('Notes saved')
      setEditingNotes(false)
      setCandidate(prev => prev ? { ...prev, notes: notesValue } : prev)
    } catch {
      toast.error('Failed to save notes')
    } finally {
      setSavingNotes(false)
    }
  }

  // ── Tab content renderers ──────────────────────────────────────────────────

  const renderApplications = () => {
    if (applications.length === 0) return (
      <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
        <Briefcase size={32} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
        <p style={{ margin: 0 }}>No applications yet</p>
      </div>
    )
    return applications.map(app => <ApplicationCard key={app.id} app={app} />)
  }

  const renderProfile = () => {
    if (!candidate) return null
    const expText = candidate.total_experience_years != null
      ? `${candidate.total_experience_years} yrs${candidate.total_experience_months ? ` ${candidate.total_experience_months} mo` : ''}`
      : null
    const skills = candidate.skill_tags?.length
      ? candidate.skill_tags.slice(0, 15).join(', ')
      : candidate.skills?.map(s => s.name).join(', ')

    return (
      <div>
        <ProfileField icon={Mail}        label="Email"       value={candidate.email} />
        <ProfileField icon={Phone}       label="Mobile"      value={candidate.mobile} />
        {candidate.mobile && (
          <div style={{ marginTop: -8, marginBottom: 16, marginLeft: 26 }}>
            <CallButton phone={candidate.mobile} candidateId={candidate.id} />
          </div>
        )}
        <ProfileField icon={MapPin}      label="Location"    value={[candidate.current_city, candidate.current_state].filter(Boolean).join(', ')} />
        <ProfileField icon={Briefcase}   label="Current Role" value={candidate.current_designation} />
        <ProfileField icon={Building2}   label="Current Company" value={candidate.current_company} />
        <ProfileField icon={Clock}       label="Experience"  value={expText} />
        <ProfileField icon={Award}       label="Notice Period" value={candidate.notice_period?.replace(/_/g, ' ')} />

        {skills && (
          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 10, color: 'var(--text-disabled)', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Skills</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {(candidate.skill_tags?.length ? candidate.skill_tags : candidate.skills?.map(s => s.name) || []).slice(0, 20).map(skill => (
                <span key={skill} style={{
                  fontSize: 11, padding: '3px 10px', borderRadius: 999,
                  background: 'rgba(108,99,255,0.12)', color: '#9C63FF',
                  border: '1px solid rgba(108,99,255,0.2)',
                }}>
                  {skill}
                </span>
              ))}
            </div>
          </div>
        )}

        {candidate.education?.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 10, color: 'var(--text-disabled)', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Education</p>
            {candidate.education.slice(0, 3).map((edu, i) => (
              <div key={i} style={{
                padding: '10px 12px', borderRadius: 8,
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
                marginBottom: 6,
              }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 2px' }}>{edu.degree}</p>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                  {edu.institution}{edu.to_year ? ` · ${edu.to_year}` : ''}
                </p>
              </div>
            ))}
          </div>
        )}

        <div style={{ paddingTop: 12, borderTop: '1px solid var(--border-subtle, rgba(255,255,255,0.06))' }}>
          <Link
            to={`/candidates/${candidateId}`}
            style={{ fontSize: 13, color: 'var(--accent)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}
          >
            View Full Profile <ExternalLink size={12} />
          </Link>
        </div>
      </div>
    )
  }

  const renderTimeline = () => {
    if (timelineLoading) return (
      <div style={{ textAlign: 'center', padding: '40px 20px' }}>
        <div style={{ width: 24, height: 24, borderRadius: '50%', border: '2px solid rgba(108,99,255,0.2)', borderTopColor: '#6C63FF', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
    if (!timelineEntries || timelineEntries.length === 0) return (
      <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
        <Clock size={32} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
        <p style={{ margin: 0 }}>No timeline history</p>
      </div>
    )
    return (
      <div style={{ paddingLeft: 4 }}>
        {timelineEntries.map((entry, i) => (
          <TimelineEntry key={i} entry={entry} isLast={i === timelineEntries.length - 1} />
        ))}
      </div>
    )
  }

  const renderNotes = () => (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Candidate Notes</p>
        {!editingNotes ? (
          <button
            onClick={() => setEditingNotes(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: 12 }}
          >
            <Edit2 size={12} /> Edit
          </button>
        ) : (
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => { setEditingNotes(false); setNotesValue(candidate?.notes || '') }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 12 }}
            >
              Cancel
            </button>
            <button
              onClick={handleSaveNotes}
              disabled={savingNotes}
              style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--accent)', border: 'none', cursor: 'pointer', color: '#fff', fontSize: 12, borderRadius: 6, padding: '4px 10px' }}
            >
              <Check size={12} /> {savingNotes ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}
      </div>
      {editingNotes ? (
        <textarea
          value={notesValue}
          onChange={e => setNotesValue(e.target.value)}
          rows={8}
          placeholder="Add notes about this candidate…"
          style={{
            width: '100%', borderRadius: 8, padding: '10px 12px',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.1)',
            color: 'var(--text-primary)', fontSize: 13, resize: 'vertical',
            outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
          }}
        />
      ) : (
        <div style={{
          padding: '12px', borderRadius: 8, minHeight: 80,
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.06)',
          fontSize: 13, color: notesValue ? 'var(--text-primary)' : 'var(--text-disabled)',
          whiteSpace: 'pre-wrap', lineHeight: 1.6,
        }}>
          {notesValue || 'No notes added yet. Click Edit to add notes.'}
        </div>
      )}
    </div>
  )

  const renderDocuments = () => {
    if (!candidate) return null
    const hasResume = !!candidate.resume_url
    const docs = candidate.documents || []

    if (!hasResume && docs.length === 0) return (
      <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
        <FileText size={32} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
        <p style={{ margin: 0 }}>No documents uploaded</p>
      </div>
    )

    return (
      <div>
        {hasResume && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 14px', borderRadius: 10,
            background: 'rgba(108,99,255,0.08)',
            border: '1px solid rgba(108,99,255,0.2)',
            marginBottom: 10,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(108,99,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <FileText size={16} color="#6C63FF" />
              </div>
              <div>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Resume</p>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '2px 0 0' }}>View or download</p>
              </div>
            </div>
            <a
              href={`/api/v1/candidates/${candidateId}/resume`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                background: 'rgba(108,99,255,0.15)', border: 'none', cursor: 'pointer',
                color: '#9C63FF', fontSize: 12, borderRadius: 6, padding: '5px 10px',
                textDecoration: 'none',
              }}
            >
              <Download size={12} /> View
            </a>
          </div>
        )}

        {docs.map((doc, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 14px', borderRadius: 10,
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.06)',
            marginBottom: 8,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <FileText size={16} color="var(--text-muted)" />
              </div>
              <div>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>{doc.name}</p>
                {doc.file_type && <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '2px 0 0', textTransform: 'capitalize' }}>{doc.file_type}</p>}
              </div>
            </div>
            {doc.file_url && (
              <a
                href={doc.file_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  background: 'rgba(255,255,255,0.06)', border: 'none', cursor: 'pointer',
                  color: 'var(--text-muted)', fontSize: 12, borderRadius: 6, padding: '5px 10px',
                  textDecoration: 'none',
                }}
              >
                <Download size={12} /> View
              </a>
            )}
          </div>
        ))}
      </div>
    )
  }

  const tabContent = () => {
    switch (activeTab) {
      case 'applications': return renderApplications()
      case 'profile':      return renderProfile()
      case 'timeline':     return renderTimeline()
      case 'notes':        return renderNotes()
      case 'documents':    return renderDocuments()
      default:             return null
    }
  }

  // ── Loading skeleton ───────────────────────────────────────────────────────

  if (loading) return (
    <div style={{
      position: 'fixed', top: 0, right: 0, bottom: 0, width: 560,
      background: 'var(--bg-card)', borderLeft: '1px solid var(--border-card)',
      zIndex: 1000, display: 'flex', flexDirection: 'column',
      boxShadow: '-8px 0 32px rgba(0,0,0,0.35)',
    }}>
      <div style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)' }}>
        <div style={{ flex: 1, height: 20, borderRadius: 6, background: 'var(--skeleton-from)' }} />
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', marginLeft: 12 }}>
          <X size={20} />
        </button>
      </div>
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {[...Array(5)].map((_, i) => (
          <div key={i} style={{ height: 80, borderRadius: 12, background: 'var(--skeleton-from)' }} />
        ))}
      </div>
    </div>
  )

  // ── Panel ──────────────────────────────────────────────────────────────────

  const candidateName = candidate?.full_name || `${candidate?.first_name || ''} ${candidate?.last_name || ''}`.trim()

  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, bottom: 0, width: 560,
      background: 'var(--bg-card)', borderLeft: '1px solid var(--border-card)',
      zIndex: 1000, display: 'flex', flexDirection: 'column',
      boxShadow: '-8px 0 32px rgba(0,0,0,0.35)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '20px 24px',
        background: 'var(--bg-card-alt, rgba(255,255,255,0.02))',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* Avatar — shows photo if available, falls back to initials */}
            <EmployeeAvatar
              name={candidateName}
              photoUrl={candidate?.photo_url}
              size={48}
            />
            <div>
              <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                {candidateName}
              </h2>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '3px 0 0' }}>{candidate?.email}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.06)', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', borderRadius: 8, padding: 6,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
          >
            <X size={18} />
          </button>
        </div>

        {/* Stats row */}
        <div style={{ display: 'flex', gap: 16, marginTop: 14 }}>
          {[
            { label: 'Applications', value: applications.length },
            { label: 'Interviews', value: applications.reduce((s, a) => s + (a.total_interviews || 0), 0) },
            { label: 'Best ATS', value: applications.length ? `${Math.round(Math.max(...applications.map(a => a.eligibility_score || 0)))}%` : '—' },
          ].map(stat => (
            <div key={stat.label} style={{
              flex: 1, padding: '8px 12px', borderRadius: 10,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.06)',
              textAlign: 'center',
            }}>
              <p style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 2px' }}>{stat.value}</p>
              <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{stat.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex', borderBottom: '1px solid var(--border)',
        flexShrink: 0, overflowX: 'auto',
      }}>
        {TABS.map(tab => {
          const active = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              style={{
                flex: 1, padding: '12px 8px', border: 'none', cursor: 'pointer',
                background: 'none', fontSize: 12, fontWeight: active ? 600 : 400,
                color: active ? 'var(--accent)' : 'var(--text-muted)',
                borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
                transition: 'all 0.15s', whiteSpace: 'nowrap',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
              }}
            >
              <tab.icon size={13} />
              {tab.label}
              {tab.id === 'applications' && applications.length > 0 && (
                <span style={{
                  fontSize: 10, background: active ? 'var(--accent)' : 'rgba(255,255,255,0.1)',
                  color: active ? '#fff' : 'var(--text-muted)',
                  borderRadius: 999, padding: '1px 6px', fontWeight: 600,
                }}>
                  {applications.length}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
        {tabContent()}
      </div>
    </div>
  )
}

export default CandidateApplicationPanel
