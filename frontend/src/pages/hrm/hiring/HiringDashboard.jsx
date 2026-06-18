import React, { useState, useEffect } from 'react'
import { Briefcase, Users, Calendar, UserCheck, FileText, LayoutTemplate } from 'lucide-react'
import hrmService from '../../../services/hrmService'
import HRJobs from './HRJobs'
import HRCandidates from './HRCandidates'
import HRInterviews from './HRInterviews'
import HROnboarding from './HROnboarding'

const TABS = [
  { key: 'overview',   label: 'Overview' },
  { key: 'jobs',       label: 'Jobs' },
  { key: 'candidates', label: 'Candidates' },
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
}

function OverviewTab({ onSwitchTab }) {
  const [counts, setCounts] = useState({ jobs: 0, candidates: 0, interviews: 0, onboarding: 0 })

  useEffect(() => {
    Promise.all([
      hrmService.listJobs({ page: 1, page_size: 1, status: 'open' }),
      hrmService.listHiringCandidates({ page: 1, page_size: 1 }),
      hrmService.listInterviews({ page: 1, page_size: 1 }),
      hrmService.listOnboardings({ page: 1, page_size: 1 }),
    ]).then(([j, c, i, ob]) => {
      setCounts({
        jobs:        j.data.total  || 0,
        candidates:  c.data.total  || 0,
        interviews:  i.data.total  || 0,
        onboarding:  ob.data.total || 0,
      })
    }).catch(() => {})
  }, [])

  const steps = [
    { label: 'Open Jobs',  count: counts.jobs,        icon: Briefcase,  tab: 'jobs',       color: 'blue' },
    { label: 'Candidates', count: counts.candidates,  icon: Users,      tab: 'candidates', color: 'indigo' },
    { label: 'Interviews', count: counts.interviews,  icon: Calendar,   tab: 'interviews', color: 'purple' },
    { label: 'Onboarding', count: counts.onboarding,  icon: UserCheck,  tab: 'onboarding', color: 'green' },
  ]

  return (
    <div className="p-6 space-y-6">
      <div>
        <p className="text-sm text-gray-500">Full cycle recruitment management — click a stage to manage it</p>
      </div>

      {/* Pipeline funnel cards */}
      <div className="flex items-stretch gap-2 overflow-x-auto pb-2">
        {steps.map((step, i) => (
          <React.Fragment key={step.label}>
            <button
              onClick={() => onSwitchTab(step.tab)}
              className={`flex-1 min-w-36 rounded-xl border p-5 hover:shadow-md transition-shadow text-left ${STEP_COLORS[step.color]}`}
              style={{ background: 'transparent' }}
            >
              <step.icon className="w-6 h-6 mb-3" />
              <p className="text-3xl font-bold text-gray-900">{step.count}</p>
              <p className="text-sm font-medium mt-1">{step.label}</p>
            </button>
            {i < steps.length - 1 && (
              <div className="flex items-center text-gray-300 flex-shrink-0">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Quick action grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {[
          { tab: 'jobs',            icon: Briefcase,    label: 'Manage Jobs' },
          { tab: 'candidates',      icon: Users,        label: 'Manage Candidates' },
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

      {/* Tab content */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'overview'   && <OverviewTab onSwitchTab={setActiveTab} />}
        {activeTab === 'jobs'       && <HRJobs />}
        {activeTab === 'candidates' && <HRCandidates />}
        {activeTab === 'interviews' && <HRInterviews />}
        {activeTab === 'onboarding' && <HROnboarding />}
      </div>
    </div>
  )
}
