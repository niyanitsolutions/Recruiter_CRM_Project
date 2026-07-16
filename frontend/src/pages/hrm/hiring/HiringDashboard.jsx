import React, { useState, useEffect } from 'react'
import { Briefcase, Users, Calendar, UserCheck, FileText, LayoutTemplate, XCircle } from 'lucide-react'
import hrmService from '../../../services/hrmService'
import { getTenantTimezone } from '../../../utils/format'
import HRJobs from './HRJobs'
import HRCandidates from './HRCandidates'
import HRInterviews from './HRInterviews'
import HROffer from './HROffer'
import HROnboarding from './HROnboarding'
import OfferTemplates from '../OfferTemplates'

// "Applicants" matches the Internal Hiring terminology used across this
// module — the underlying component/collection (HRCandidates / hrm_candidates)
// is unchanged, only the visible label.
const TABS = [
  { key: 'overview',   label: 'Overview' },
  { key: 'jobs',       label: 'Jobs' },
  { key: 'candidates', label: 'Applicants' },
  { key: 'interviews', label: 'Interviews' },
  { key: 'onboarding', label: 'Onboarding' },
]

const STEP_COLORS = {
  blue:   'bg-blue-50 text-blue-600 border-blue-200',
  indigo: 'bg-indigo-50 text-indigo-600 border-indigo-200',
  purple: 'bg-purple-50 text-purple-600 border-purple-200',
  yellow: 'bg-yellow-50 text-yellow-600 border-yellow-200',
  green:  'bg-green-50 text-green-600 border-green-200',
  orange: 'bg-orange-50 text-orange-600 border-orange-200',
  red:    'bg-red-50 text-red-600 border-red-200',
}

function OverviewTab({ onSwitchTab }) {
  const [counts, setCounts] = useState({
    jobs: 0, applications: 0, interviewsToday: 0, offers: 0, joined: 0, rejected: 0,
  })

  useEffect(() => {
    const tz = getTenantTimezone()
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: tz }) // YYYY-MM-DD

    Promise.all([
      hrmService.listJobs({ page: 1, page_size: 1, status: 'open' }),
      hrmService.listHiringCandidates({ page: 1, page_size: 1 }),
      hrmService.listInterviews({ page: 1, page_size: 200 }),
      hrmService.listOffers({ page: 1, page_size: 1 }),
      hrmService.listHiringCandidates({ page: 1, page_size: 1, stage: 'hired' }),
      hrmService.listHiringCandidates({ page: 1, page_size: 1, stage: 'rejected' }),
    ]).then(([j, c, iv, of, hired, rejected]) => {
      const interviewsToday = (iv.data.items || []).filter(item => {
        if (!item.scheduled_at) return false
        return new Date(item.scheduled_at).toLocaleDateString('en-CA', { timeZone: tz }) === todayStr
      }).length
      setCounts({
        jobs:            j.data.total  || 0,
        applications:    c.data.total  || 0,
        interviewsToday,
        offers:          of.data.total || 0,
        joined:          hired.data.total || 0,
        rejected:        rejected.data.total || 0,
      })
    }).catch(() => {})
  }, [])

  const cards = [
    { label: 'Open Jobs',        count: counts.jobs,            icon: Briefcase, tab: 'jobs',       color: 'blue' },
    { label: 'Applications',     count: counts.applications,    icon: Users,     tab: 'candidates', color: 'indigo' },
    { label: 'Interviews Today', count: counts.interviewsToday, icon: Calendar,  tab: 'interviews', color: 'purple' },
    { label: 'Offers',           count: counts.offers,          icon: FileText,  tab: 'offers',      color: 'yellow' },
    { label: 'Joined',           count: counts.joined,          icon: UserCheck, tab: 'onboarding',  color: 'green' },
    { label: 'Rejected',         count: counts.rejected,        icon: XCircle,   tab: 'candidates',  color: 'red' },
  ]

  return (
    <div className="p-6 space-y-6">
      <div>
        <p className="text-sm text-gray-500">Full cycle internal hiring management — click a card to manage it</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {cards.map(card => (
          <button
            key={card.label}
            onClick={() => onSwitchTab(card.tab)}
            className={`rounded-xl border p-5 hover:shadow-md transition-shadow text-left ${STEP_COLORS[card.color]}`}
            style={{ background: 'transparent' }}
          >
            <card.icon className="w-6 h-6 mb-3" />
            <p className="text-3xl font-bold text-gray-900">{card.count}</p>
            <p className="text-sm font-medium mt-1">{card.label}</p>
          </button>
        ))}
      </div>

      {/* Quick action grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {[
          { tab: 'jobs',            icon: Briefcase,    label: 'Manage Jobs' },
          { tab: 'candidates',      icon: Users,        label: 'Manage Applicants' },
          { tab: 'interviews',      icon: Calendar,     label: 'Manage Interviews' },
          { tab: 'offers',          icon: FileText,     label: 'Manage Offers' },
          { tab: 'offer_templates', icon: LayoutTemplate, label: 'Offer Templates' },
          { tab: 'onboarding',      icon: UserCheck,    label: 'Manage Onboarding' },
        ].map(item => (
          <button
            key={item.tab}
            onClick={() => onSwitchTab(item.tab)}
            className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow flex items-center gap-3 text-left"
          >
            <item.icon className="w-5 h-5 text-blue-500" />
            <span className="text-sm font-medium text-gray-700">{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

export default function HiringDashboard() {
  const [activeTab, setActiveTab] = useState('overview')

  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <div className="px-6 pt-6 pb-0" style={{ background: 'var(--bg-page)' }}>
        <div className="mb-4">
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-heading)' }}>Hiring Pipeline</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>Internal recruitment management</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 overflow-x-auto border-b" style={{ borderColor: 'var(--border)' }}>
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className="px-4 py-2.5 text-sm font-medium transition-colors relative flex-shrink-0"
              style={{
                color: activeTab === tab.key ? 'var(--text-link)' : 'var(--text-muted)',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              {tab.label}
              {activeTab === tab.key && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t"
                      style={{ background: 'var(--text-link)' }} />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content — "offers"/"offer_templates" are reachable via the
          Overview stat cards and quick actions, not persistent top tabs, so
          the nav bar stays exactly Overview/Jobs/Applicants/Interviews/Onboarding */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'overview'        && <OverviewTab onSwitchTab={setActiveTab} />}
        {activeTab === 'jobs'            && <HRJobs />}
        {activeTab === 'candidates'      && <HRCandidates />}
        {activeTab === 'interviews'      && <HRInterviews />}
        {activeTab === 'offers'          && <HROffer />}
        {activeTab === 'offer_templates' && <OfferTemplates />}
        {activeTab === 'onboarding'      && <HROnboarding />}
      </div>
    </div>
  )
}
