import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  Users, Clock, Calendar, Banknote, TrendingUp, Megaphone,
  Briefcase, UserCheck, AlertCircle, RefreshCw,
} from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import hrmService from '../../services/hrmService'

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

export default function HRMDashboard() {
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-heading)' }}>HRM Dashboard</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>Human Resource Management</p>
        </div>
        <button onClick={load} className="btn-secondary flex items-center gap-2 text-sm">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

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
            <StatCard icon={Users}       label="Total Employees"        value={stats?.total_employees}              to="/hrm/employees"   color="blue" />
            <StatCard icon={UserCheck}   label="Present Today"          value={stats?.present_today}                to="/hrm/attendance"  color="green" />
            <StatCard icon={AlertCircle} label="Absent Today"           value={stats?.absent_today}                                       color="red" />
            <StatCard icon={Clock}       label="Late Today"             value={stats?.late_today}                                         color="yellow" />
            <StatCard icon={Calendar}    label="On Leave Today"         value={stats?.on_leave_today}               to="/hrm/leaves"      color="purple" />
            <StatCard icon={Calendar}    label="Pending Leave Req."     value={stats?.pending_leave_requests}       to="/hrm/leaves"      color="yellow" />
            <StatCard icon={Banknote}    label="Payroll This Month"     value={stats?.payroll_processed_this_month} to="/hrm/payroll"     color="indigo" />
            <StatCard icon={Briefcase}   label="Open Jobs"              value={stats?.open_jobs}                    to="/hrm/hiring"      color="blue" />
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
                { to: '/hrm/employees/new', icon: Users,     label: 'Add New Employee' },
                { to: '/hrm/attendance',    icon: Clock,     label: 'Mark Attendance' },
                { to: '/hrm/leaves',        icon: Calendar,  label: 'Leave Requests' },
                { to: '/hrm/payroll',       icon: Banknote,  label: 'Run Payroll' },
                { to: '/hrm/hiring',        icon: Briefcase, label: 'Hiring Pipeline' },
                { to: '/hrm/announcements', icon: Megaphone, label: 'Announcements' },
              ].map(({ to, icon: Icon, label }) => (
                <Link key={to} to={to}
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
