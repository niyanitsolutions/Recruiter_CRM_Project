import { useState, lazy, Suspense } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, Maximize2 } from 'lucide-react'
import { usePermissions } from '../../hooks/usePermissions'
import { useTelephony } from '../../context/TelephonyContext'
import TelephonySearchBar from '../../components/telephony/TelephonySearchBar'

// Lazy per-tab so an unpermitted/disabled tenant never pulls in the extra
// analytics/recording-library bundle weight — same pattern as the Phase 2
// softphone lazy-loading in Layout.jsx.
const TelephonyDashboard = lazy(() => import('./TelephonyDashboard'))
const SupervisorDashboard = lazy(() => import('./SupervisorDashboard'))
const AnalyticsPage = lazy(() => import('./AnalyticsPage'))
const AgentPerformance = lazy(() => import('./AgentPerformance'))
const RecordingLibrary = lazy(() => import('./RecordingLibrary'))
const MissedCallCenter = lazy(() => import('./MissedCallCenter'))
const AgentConsole = lazy(() => import('./AgentConsole'))
const QueueManagement = lazy(() => import('./QueueManagement'))
const CapabilityCenter = lazy(() => import('./CapabilityCenter'))

/**
 * Internal tab shell for all telephony pages — keeps the Phase 1 sidebar
 * untouched (still exactly one "Telephony" entry) while giving Phase 3/4's
 * productivity/analytics/live-operations pages a home. Each tab is
 * permission/capability-gated independently, so e.g. Queue Management stays
 * completely absent (not greyed) for every tenant today since no provider
 * declares queue_management support.
 */
export default function TelephonyLayout() {
  const { has } = usePermissions()
  const { capabilities } = useTelephony()
  const [tab, setTab] = useState('dashboard')

  const tabs = [
    { key: 'dashboard', label: 'Dashboard', show: true, Component: TelephonyDashboard },
    { key: 'console', label: 'Agent Console', show: has('telephony:view'), Component: AgentConsole },
    { key: 'supervisor', label: 'Supervisor', show: has('telephony:supervisor'), Component: SupervisorDashboard },
    { key: 'analytics', label: 'Analytics', show: has('telephony:analytics'), Component: AnalyticsPage },
    { key: 'agents', label: 'Agents', show: has('telephony:analytics'), Component: AgentPerformance },
    { key: 'recordings', label: 'Recordings', show: has('telephony:recordings') && capabilities.recording_retrieval, Component: RecordingLibrary },
    { key: 'missed', label: 'Missed Calls', show: has('telephony:call_logs'), Component: MissedCallCenter },
    { key: 'queues', label: 'Queues', show: has('telephony:queue_manage') && capabilities.queue_management, Component: QueueManagement },
    { key: 'capabilities', label: 'Capabilities', show: has('telephony:view'), Component: CapabilityCenter },
  ].filter(t => t.show)

  const active = tabs.find(t => t.key === tab) || tabs[0]

  return (
    <div>
      <div className="px-6 pt-4 border-b flex items-center justify-between gap-4" style={{ borderColor: 'var(--border-subtle)' }}>
        <div className="flex items-center gap-1 overflow-x-auto">
          {tabs.map(t => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-sm font-medium rounded-t-lg whitespace-nowrap transition-colors ${
                active.key === t.key
                  ? 'text-primary-600 border-b-2 border-primary-500'
                  : 'text-surface-500 hover:text-surface-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 pb-2 flex-shrink-0">
          <TelephonySearchBar />
          {has('telephony:supervisor') && (
            <Link
              to="/telephony/wallboard"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-100 hover:bg-surface-200 text-surface-700 text-xs font-medium whitespace-nowrap"
              title="Open fullscreen wallboard in a new tab"
            >
              <Maximize2 className="w-3.5 h-3.5" /> Wallboard
            </Link>
          )}
        </div>
      </div>

      <Suspense fallback={<div className="flex justify-center py-24"><Loader2 className="w-8 h-8 animate-spin text-primary-500" /></div>}>
        {active && <active.Component />}
      </Suspense>
    </div>
  )
}
