import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  Users, Clock, Calendar, Banknote, Briefcase, UserCheck,
  AlertCircle, RefreshCw, TrendingUp, Megaphone, Link2, Loader2,
} from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import toast from 'react-hot-toast'
import hrmService from '../../services/hrmService'
import Payroll from './Payroll'
import Performance from './Performance'
import Announcements from './Announcements'

const TABS = [
  { key: 'overview',      label: 'Overview' },
  { key: 'payroll',       label: 'Payroll' },
  { key: 'performance',   label: 'Performance' },
  { key: 'announcements', label: 'Announcements' },
]

const ICON_COLORS = {
  blue:   { background: 'var(--bg-info)',    color: 'var(--text-info)' },
  green:  { background: 'var(--bg-success)', color: 'var(--text-success)' },
  yellow: { background: 'var(--bg-warning)', color: 'var(--text-warning)' },
  red:    { background: 'var(--bg-danger)',  color: 'var(--text-danger)' },
  purple: { background: 'var(--bg-info)',    color: 'var(--text-info)' },
  indigo: { background: 'var(--bg-info)',    color: 'var(--text-info)' },
}

const StatCard = ({ icon: Icon, label, value, sub, to, color = 'blue' }) => {
  const iconStyle = ICON_COLORS[color] ?? ICON_COLORS.blue
  const card = (
    <div className="rounded-xl p-5 flex items-center gap-4 transition-shadow hover:shadow-md"
         style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
      <div className="p-3 rounded-lg" style={iconStyle}>
        <Icon className="w-6 h-6" />
      </div>
      <div>
        <p className="text-2xl font-bold" style={{ color: 'var(--text-heading)' }}>{value ?? '—'}</p>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{label}</p>
        {sub && <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
      </div>
    </div>
  )
  return to ? <Link to={to}>{card}</Link> : card
}

function SyncWidget() {
  const [sync, setSync] = useState(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(null)
  const [unlinkedUsers, setUnlinkedUsers] = useState([])
  const [unlinkedEmps, setUnlinkedEmps] = useState([])
  const [expanded, setExpanded] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const s = await hrmService.getSyncStatus()
      setSync(s.data)
    } catch {}
    setLoading(false)
  }

  const loadDetails = async () => {
    try {
      const [u, e] = await Promise.all([
        hrmService.getUnlinkedUsers({ page_size: 5 }),
        hrmService.getUnlinkedEmployees({ page_size: 5 }),
      ])
      setUnlinkedUsers(u.data.items || [])
      setUnlinkedEmps(e.data.items || [])
    } catch {}
  }

  useEffect(() => { load() }, [])

  const handleCreateEmployee = async (userId) => {
    setSyncing(userId)
    try {
      const res = await hrmService.syncUserToEmployee(userId)
      toast.success(res.data.message || 'Employee created')
      load()
      loadDetails()
    } catch { toast.error('Sync failed') }
    setSyncing(null)
  }

  const handleCreateUser = async (empId) => {
    setSyncing(empId)
    try {
      const res = await hrmService.syncEmployeeToUser(empId)
      toast.success(res.data.message || 'User created')
      load()
      loadDetails()
    } catch { toast.error('Sync failed') }
    setSyncing(null)
  }

  const toggleExpand = () => {
    if (!expanded) loadDetails()
    setExpanded(e => !e)
  }

  if (loading || !sync) return null
  const hasUnlinked = sync.unlinked_users > 0 || sync.unlinked_employees > 0
  if (!hasUnlinked) return null

  return (
    <div className="rounded-xl border p-4" style={{ background: 'var(--bg-warning)', borderColor: 'var(--border-card)' }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link2 className="w-4 h-4" style={{ color: 'var(--text-warning)' }} />
          <span className="text-sm font-semibold" style={{ color: 'var(--text-warning)' }}>
            Sync required: {sync.unlinked_users} user{sync.unlinked_users !== 1 ? 's' : ''} and{' '}
            {sync.unlinked_employees} employee{sync.unlinked_employees !== 1 ? 's' : ''} not linked
          </span>
        </div>
        <button onClick={toggleExpand} className="text-xs underline" style={{ color: 'var(--text-warning)', background: 'none', border: 'none', cursor: 'pointer' }}>
          {expanded ? 'Hide' : 'View & Fix'}
        </button>
      </div>

      {expanded && (
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          {unlinkedUsers.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>
                Users without employee record
              </p>
              <div className="space-y-1">
                {unlinkedUsers.map(u => (
                  <div key={u.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 text-sm">
                    <span className="text-gray-800">{u.full_name || u.email}</span>
                    <button
                      onClick={() => handleCreateEmployee(u.id)}
                      disabled={syncing === u.id}
                      className="btn-secondary text-xs py-1 flex items-center gap-1"
                    >
                      {syncing === u.id ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                      Create Employee
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {unlinkedEmps.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>
                Employees without user account
              </p>
              <div className="space-y-1">
                {unlinkedEmps.map(e => (
                  <div key={e.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 text-sm">
                    <span className="text-gray-800">{e.full_name || e.email}</span>
                    <button
                      onClick={() => handleCreateUser(e.id)}
                      disabled={syncing === e.id}
                      className="btn-secondary text-xs py-1 flex items-center gap-1"
                    >
                      {syncing === e.id ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                      Create User
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function OverviewTab() {
  const [stats, setStats] = useState(null)
  const [trend, setTrend] = useState([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const [s, t] = await Promise.all([
        hrmService.getDashboardStats(),
        hrmService.getAttendanceTrend(7),
      ])
      setStats(s.data)
      setTrend(t.data || [])
    } catch {}
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-end">
        <button onClick={load} className="btn-secondary flex items-center gap-2 text-sm">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      <SyncWidget />

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="rounded-xl p-5 h-24 animate-pulse"
                 style={{ background: 'var(--bg-card-alt)', border: '1px solid var(--border-card)' }} />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard icon={Users}       label="Total Employees"        value={stats?.total_employees}              to="/hrm/employees"  color="blue" />
            <StatCard icon={UserCheck}   label="Present Today"          value={stats?.present_today}                to="/hrm/attendance" color="green" />
            <StatCard icon={AlertCircle} label="Absent Today"           value={stats?.absent_today}                                      color="red" />
            <StatCard icon={Clock}       label="Late Today"             value={stats?.late_today}                                        color="yellow" />
            <StatCard icon={Calendar}    label="On Leave Today"         value={stats?.on_leave_today}               to="/hrm/leaves"     color="purple" />
            <StatCard icon={Calendar}    label="Pending Leave Req."     value={stats?.pending_leave_requests}       to="/hrm/leaves"     color="yellow" />
            <StatCard icon={Banknote}    label="Payroll This Month"     value={stats?.payroll_processed_this_month}                      color="indigo" />
            <StatCard icon={Briefcase}   label="Open Jobs"              value={stats?.open_jobs}                    to="/hrm/hiring"     color="blue" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="rounded-xl p-5"
                 style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
              <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-secondary)' }}>7-Day Attendance Trend</h2>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={trend}>
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={d => d.slice(5)} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="present" fill="#3b82f6" radius={[4,4,0,0]} name="Present" />
                  <Bar dataKey="late"    fill="#f59e0b" radius={[4,4,0,0]} name="Late" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="rounded-xl p-5 space-y-3"
                 style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
              <h2 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>Quick Links</h2>
              {[
                { to: '/hrm/employees/new', icon: Users,      label: 'Add New Employee' },
                { to: '/hrm/attendance',    icon: Clock,      label: 'Mark Attendance' },
                { to: '/hrm/leaves',        icon: Calendar,   label: 'Leave Requests' },
                { to: '/hrm/hiring',        icon: Briefcase,  label: 'Hiring Pipeline' },
                { to: '/hrm',               icon: TrendingUp, label: 'Performance Reviews',   tab: 'performance' },
                { to: '/hrm',               icon: Megaphone,  label: 'Announcements',         tab: 'announcements' },
              ].map(({ to, icon: Icon, label }) => (
                <Link key={label} to={to}
                      className="flex items-center gap-3 p-2 rounded-lg text-sm transition-colors"
                      style={{ color: 'var(--text-secondary)' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <Icon className="w-4 h-4" style={{ color: 'var(--text-link)' }} /> {label}
                </Link>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default function HRMDashboard() {
  const [activeTab, setActiveTab] = useState('overview')

  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <div className="px-6 pt-6 pb-0" style={{ background: 'var(--bg-page)' }}>
        <div className="mb-4">
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-heading)' }}>HRM Dashboard</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>Human Resource Management</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b" style={{ borderColor: 'var(--border)' }}>
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className="px-4 py-2.5 text-sm font-medium transition-colors relative"
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
        {activeTab === 'overview'      && <OverviewTab />}
        {activeTab === 'payroll'       && <Payroll />}
        {activeTab === 'performance'   && <Performance />}
        {activeTab === 'announcements' && <Announcements />}
      </div>
    </div>
  )
}
