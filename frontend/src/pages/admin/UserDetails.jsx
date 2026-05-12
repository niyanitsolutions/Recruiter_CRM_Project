import React, { useState, useEffect } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import {
  ArrowLeft, Edit2, Mail, Phone, Building, Award, Calendar, Clock,
  User, Shield, CheckCircle, XCircle, Key, Activity, AlertCircle,
  Hash, ChevronRight, RefreshCw, Layers, Star,
} from 'lucide-react'
import { toast } from 'react-hot-toast'
import userService from '../../services/userService'
import auditService from '../../services/auditService'
import { formatDate, formatDateTime, getInitials } from '../../utils/format'

// ── Role badge colors ─────────────────────────────────────────────────────────
const ROLE_STYLE = {
  admin:                  { bg: 'bg-accent-100',   text: 'text-accent-700'   },
  candidate_coordinator:  { bg: 'bg-purple-100',   text: 'text-purple-700'   },
  client_coordinator:     { bg: 'bg-indigo-100',   text: 'text-indigo-700'   },
  hr:                     { bg: 'bg-teal-100',      text: 'text-teal-700'    },
  accounts:               { bg: 'bg-orange-100',   text: 'text-orange-700'   },
  partner:                { bg: 'bg-pink-100',      text: 'text-pink-700'    },
}

// ── Permission grouping ───────────────────────────────────────────────────────
const PERM_GROUPS = {
  'Admin'       : ['users:view','users:create','users:edit','users:delete','roles:view','roles:manage','audit:view'],
  'Clients'     : ['clients:view','clients:create','clients:edit','clients:delete'],
  'Candidates'  : ['candidates:view','candidates:create','candidates:edit','candidates:delete'],
  'Jobs'        : ['jobs:view','jobs:create','jobs:edit','jobs:delete'],
  'Applications': ['applications:view','applications:manage'],
  'Interviews'  : ['interviews:view','interviews:create','interviews:manage'],
  'Reports'     : ['reports:view','analytics:view'],
  'HR'          : ['employees:view','attendance:view','leaves:view','payroll:view','performance:view'],
  'Finance'     : ['invoices:view','invoices:manage','partners:view','partners:manage'],
}

// ── Sub-components ────────────────────────────────────────────────────────────
const InfoCard = ({ icon: Icon, label, value, iconColor = 'text-surface-400' }) => {
  if (!value) return null
  return (
    <div className="flex items-start gap-3 py-3 border-b border-surface-100 last:border-0">
      <div className="w-8 h-8 bg-surface-50 rounded-lg flex items-center justify-center flex-shrink-0">
        <Icon className={`w-4 h-4 ${iconColor}`} />
      </div>
      <div>
        <p className="text-xs text-surface-400">{label}</p>
        <p className="text-sm font-medium text-surface-900 mt-0.5">{value}</p>
      </div>
    </div>
  )
}

const SectionCard = ({ title, children, className = '' }) => (
  <div className={`bg-white border border-surface-200 rounded-xl p-5 ${className}`}>
    {title && <h3 className="text-sm font-semibold text-surface-500 uppercase tracking-wider mb-4">{title}</h3>}
    {children}
  </div>
)

const Skeleton = () => (
  <div className="p-6 max-w-6xl mx-auto animate-pulse space-y-6">
    <div className="h-8 w-48 bg-surface-200 rounded" />
    <div className="h-32 bg-surface-200 rounded-xl" />
    <div className="grid grid-cols-3 gap-6">
      <div className="col-span-2 space-y-4">
        <div className="h-40 bg-surface-200 rounded-xl" />
        <div className="h-48 bg-surface-200 rounded-xl" />
      </div>
      <div className="h-64 bg-surface-200 rounded-xl" />
    </div>
  </div>
)

const TABS = [
  { id: 'profile',     label: 'Profile'      },
  { id: 'permissions', label: 'Permissions'  },
  { id: 'activity',    label: 'Activity'     },
]

// ── Action badge for audit logs ───────────────────────────────────────────────
const ActionBadge = ({ action }) => {
  const cfg = {
    create: { bg: 'bg-success-100', text: 'text-success-700' },
    update: { bg: 'bg-accent-100',  text: 'text-accent-700'  },
    delete: { bg: 'bg-danger-100',  text: 'text-danger-700'  },
    login:  { bg: 'bg-purple-100',  text: 'text-purple-700'  },
    logout: { bg: 'bg-surface-100', text: 'text-surface-600' },
  }[action] || { bg: 'bg-surface-100', text: 'text-surface-600' }

  return (
    <span className={`px-2 py-0.5 rounded text-xs font-semibold uppercase ${cfg.bg} ${cfg.text}`}>
      {action}
    </span>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
const UserDetails = () => {
  const navigate = useNavigate()
  const { id } = useParams()
  const [user, setUser] = useState(null)
  const [activity, setActivity] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('profile')

  useEffect(() => { load() }, [id])

  const load = async () => {
    try {
      setLoading(true)
      const [userRes, actRes] = await Promise.all([
        userService.getUser(id),
        auditService.getEntityHistory('user', id, { page_size: 15 }).catch(() => ({ data: [] })),
      ])
      setUser(userRes.data)
      setActivity(actRes.data || [])
    } catch {
      toast.error('Failed to load user')
      navigate('/users')
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <Skeleton />
  if (!user) return (
    <div className="p-6 text-center py-24">
      <AlertCircle className="w-12 h-12 text-danger-400 mx-auto mb-3" />
      <p className="text-surface-500 font-medium">User not found</p>
    </div>
  )

  const roleStyle = ROLE_STYLE[user.role] || { bg: 'bg-surface-100', text: 'text-surface-600' }
  const roleName  = user.role_name || user.role?.replace(/_/g, ' ') || '—'
  const initials  = getInitials(user.full_name)
  const permissions = user.permissions || []

  // ── Tab renderers ───────────────────────────────────────────────────────────
  const renderProfile = () => (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Contact */}
        <SectionCard title="Contact Information">
          <InfoCard icon={Mail}   label="Email"    value={user.email}    iconColor="text-accent-500" />
          <InfoCard icon={Phone}  label="Mobile"   value={user.mobile}   iconColor="text-success-500" />
          <InfoCard icon={User}   label="Username" value={user.username} iconColor="text-purple-500" />
        </SectionCard>

        {/* Organisation */}
        <SectionCard title="Organisation">
          <InfoCard icon={Shield}   label="Role"         value={roleName}              iconColor="text-accent-500" />
          <InfoCard icon={Building} label="Department"   value={user.department}       iconColor="text-indigo-500" />
          <InfoCard icon={Award}    label="Designation"  value={user.designation}      iconColor="text-orange-500" />
          <InfoCard icon={User}     label="Reports To"   value={user.reporting_to_name} iconColor="text-teal-500" />
        </SectionCard>

        {/* Employment */}
        <SectionCard title="Employment">
          <InfoCard icon={Calendar} label="Joining Date"  value={formatDate(user.joining_date)} iconColor="text-purple-500" />
          <InfoCard icon={Hash}     label="Employee ID"   value={user.employee_id}               iconColor="text-surface-400" />
          <InfoCard icon={Clock}    label="Last Login"    value={user.last_login ? formatDateTime(user.last_login) : 'Never'} iconColor="text-accent-500" />
        </SectionCard>

        {/* Status / settings */}
        <SectionCard title="Account">
          <div className="space-y-3">
            <div className="flex items-center justify-between py-2 border-b border-surface-100">
              <span className="text-sm text-surface-500">Status</span>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                user.status === 'active' ? 'bg-success-100 text-success-700' : 'bg-surface-100 text-surface-600'
              }`}>{user.status}</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-surface-100">
              <span className="text-sm text-surface-500">User Type</span>
              <span className="text-sm font-medium text-surface-900 capitalize">{user.user_type || 'internal'}</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-surface-100">
              <span className="text-sm text-surface-500">Custom Permissions</span>
              {user.override_permissions
                ? <CheckCircle className="w-4 h-4 text-success-500" />
                : <XCircle className="w-4 h-4 text-surface-400" />}
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-surface-500">Created</span>
              <span className="text-sm text-surface-700">{formatDate(user.created_at)}</span>
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  )

  const renderPermissions = () => {
    const hasCustom = user.override_permissions && permissions.length > 0

    return (
      <div className="space-y-5">
        {/* Header banner */}
        <div className={`p-4 rounded-xl border flex items-start gap-3 ${
          hasCustom ? 'bg-warning-50 border-warning-200' : 'bg-surface-50 border-surface-200'
        }`}>
          <Key className={`w-5 h-5 mt-0.5 flex-shrink-0 ${hasCustom ? 'text-warning-600' : 'text-surface-400'}`} />
          <div>
            <p className="text-sm font-semibold text-surface-900">
              {hasCustom ? 'Custom Permissions Active' : `Inherits permissions from role: ${roleName}`}
            </p>
            <p className="text-xs text-surface-500 mt-0.5">
              {hasCustom
                ? `This user has ${permissions.length} individually assigned permission${permissions.length !== 1 ? 's' : ''}`
                : 'Permissions are controlled by the assigned role'}
            </p>
          </div>
        </div>

        {/* Permission groups */}
        {Object.entries(PERM_GROUPS).map(([group, groupPerms]) => {
          const granted = groupPerms.filter(p => permissions.includes(p))
          if (granted.length === 0 && !hasCustom) return null
          const allGranted = groupPerms.every(p => permissions.includes(p))

          return (
            <SectionCard key={group} title={group}>
              <div className="flex flex-wrap gap-2">
                {groupPerms.map(perm => {
                  const active = permissions.includes(perm)
                  return (
                    <div
                      key={perm}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                        active
                          ? 'bg-success-50 text-success-700 border-success-200'
                          : 'bg-surface-50 text-surface-400 border-surface-200'
                      }`}
                    >
                      {active ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                      {perm}
                    </div>
                  )
                })}
              </div>
            </SectionCard>
          )
        })}

        {/* All raw permissions (if custom) */}
        {hasCustom && (
          <SectionCard title="All Assigned Permissions">
            <div className="flex flex-wrap gap-1.5">
              {permissions.map(p => (
                <span key={p} className="px-2.5 py-1 bg-accent-50 text-accent-700 border border-accent-200 rounded-lg text-xs font-medium">{p}</span>
              ))}
            </div>
          </SectionCard>
        )}
      </div>
    )
  }

  const renderActivity = () => (
    <SectionCard title="Recent Activity">
      {activity.length === 0 ? (
        <div className="text-center py-10">
          <Activity className="w-10 h-10 text-surface-300 mx-auto mb-2" />
          <p className="text-surface-500 text-sm">No recent activity</p>
        </div>
      ) : (
        <div className="relative pl-7">
          <div className="absolute left-3 top-2 bottom-2 w-px bg-surface-200" />
          <div className="space-y-5">
            {activity.map((item, idx) => (
              <div key={idx} className="relative">
                <div className={`absolute -left-7 top-1.5 w-3 h-3 rounded-full border-2 border-white shadow ${
                  item.action === 'create' ? 'bg-success-500' :
                  item.action === 'update' ? 'bg-accent-500' :
                  item.action === 'delete' ? 'bg-danger-500' : 'bg-surface-400'
                }`} />
                <div className="flex items-start gap-3">
                  <ActionBadge action={item.action} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-surface-700">{item.description || item.action_display}</p>
                    <p className="text-xs text-surface-400 mt-0.5">{formatDateTime(item.created_at)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </SectionCard>
  )

  const tabContent = { profile: renderProfile, permissions: renderPermissions, activity: renderActivity }

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      {/* ── Page header ───────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/users')} className="p-2 hover:bg-surface-100 rounded-lg transition-colors text-surface-500">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-surface-400 font-medium">Users</p>
          <h1 className="text-xl font-bold text-surface-900 truncate">{user.full_name}</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-2 hover:bg-surface-100 rounded-lg text-surface-400">
            <RefreshCw className="w-4 h-4" />
          </button>
          <Link
            to={`/users/${id}/edit`}
            className="flex items-center gap-2 px-4 py-2 bg-accent-600 hover:bg-accent-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Edit2 className="w-4 h-4" />
            Edit
          </Link>
        </div>
      </div>

      {/* ── Profile hero ──────────────────────────────────────────────────── */}
      <div className="bg-white border border-surface-200 rounded-xl p-6 mb-6">
        <div className="flex items-start gap-5 flex-wrap">
          {/* Avatar */}
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-accent-400 to-accent-600 flex items-center justify-center text-white text-2xl font-bold shadow-md flex-shrink-0">
            {initials}
          </div>

          {/* Name + role */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-xl font-bold text-surface-900">{user.full_name}</h2>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${roleStyle.bg} ${roleStyle.text}`}>
                {roleName}
              </span>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                user.status === 'active' ? 'bg-success-100 text-success-700' : 'bg-surface-100 text-surface-600'
              }`}>{user.status}</span>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-1 mt-2">
              {user.email     && <span className="text-sm text-surface-500 flex items-center gap-1"><Mail  className="w-3.5 h-3.5" />{user.email}</span>}
              {user.mobile    && <span className="text-sm text-surface-500 flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{user.mobile}</span>}
              {user.department && <span className="text-sm text-surface-500 flex items-center gap-1"><Building className="w-3.5 h-3.5" />{user.department}</span>}
              {user.joining_date && <span className="text-sm text-surface-500 flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />Joined {formatDate(user.joining_date)}</span>}
            </div>
          </div>

          {/* Last login */}
          <div className="text-right flex-shrink-0">
            <p className="text-xs text-surface-400">Last Login</p>
            <p className="text-sm font-medium text-surface-700 mt-0.5">
              {user.last_login ? formatDateTime(user.last_login) : 'Never'}
            </p>
          </div>
        </div>
      </div>

      {/* ── Tabs ──────────────────────────────────────────────────────────── */}
      <div className="bg-white border border-surface-200 rounded-xl mb-5 overflow-x-auto">
        <div className="flex min-w-max">
          {TABS.map((tab, i) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-3.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-accent-500 text-accent-600'
                  : 'border-transparent text-surface-500 hover:text-surface-700 hover:border-surface-300'
              } ${i === 0 ? 'rounded-tl-xl' : ''}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab content ───────────────────────────────────────────────────── */}
      {(tabContent[activeTab] || tabContent.profile)()}
    </div>
  )
}

export default UserDetails
