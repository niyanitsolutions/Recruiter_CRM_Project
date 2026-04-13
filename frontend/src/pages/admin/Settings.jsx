import { useNavigate } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { selectIsOwner } from '../../store/authSlice'
import {
  Users, Shield, UsersRound, Building2, Layers, Award, GitBranch,
  Workflow, Briefcase, CalendarCheck, FileText, ScanLine, UserPlus2,
  Receipt, BadgeDollarSign, CreditCard, Globe2, Mail, Bell,
  Lock, ScrollText, Database, FormInput, Palette, Target, SlidersHorizontal,
  Activity, ChevronRight,
} from 'lucide-react'

const SECTIONS = [
  {
    title: 'User Management',
    color: 'bg-blue-50',
    iconColor: 'text-blue-600',
    items: [
      { icon: Users,       label: 'Users',               description: 'Manage user accounts and access',          path: '/users' },
      { icon: Shield,      label: 'Roles & Permissions',  description: 'Configure roles and their permissions',    path: '/roles' },
      { icon: UsersRound,  label: 'Teams',                description: 'Create and manage cross-functional teams', path: '/settings/teams' },
    ],
  },
  {
    title: 'Organization',
    color: 'bg-purple-50',
    iconColor: 'text-purple-600',
    items: [
      { icon: Building2,   label: 'Company Profile',   description: 'Update company info, logo and address',    path: '/company-settings', ownerOnly: true },
      { icon: Layers,      label: 'Departments',        description: 'Manage organisation departments',         path: '/departments' },
      { icon: Award,       label: 'Designations',       description: 'Manage job titles and positions',         path: '/designations' },
      { icon: GitBranch,   label: 'Branches',           description: 'Manage office locations and branches',    path: '/settings/branches' },
    ],
  },
  {
    title: 'Recruitment Workflow',
    color: 'bg-green-50',
    iconColor: 'text-green-600',
    items: [
      { icon: Workflow,      label: 'Pipeline Stages',         description: 'Drag-and-drop hiring pipeline configuration', path: '/settings/pipeline-stages' },
      { icon: Briefcase,     label: 'Job Categories & Skills', description: 'Manage job taxonomy and skill library',       path: '/settings/job-categories' },
      { icon: CalendarCheck, label: 'Interview Settings',      description: 'Round types, reminders and feedback rules',   path: '/settings/interview-settings' },
      { icon: FileText,      label: 'Document Templates',      description: 'Offer letters, NDAs and other templates',     path: '/settings/document-templates' },
      { icon: ScanLine,      label: 'Resume Parsing Rules',    description: 'Auto-parse, duplicate detection settings',    path: '/settings/resume-parsing' },
      { icon: UserPlus2,     label: 'Candidate Sources',       description: 'Track where candidates come from',            path: '/settings/candidate-sources' },
    ],
  },
  {
    title: 'Finance & Billing',
    color: 'bg-yellow-50',
    iconColor: 'text-yellow-600',
    ownerOnly: true,
    items: [
      { icon: Receipt,          label: 'Invoice Settings',        description: 'Prefix, tax, payment terms and bank details', path: '/settings/invoice-settings' },
      { icon: BadgeDollarSign,  label: 'Commission & Payout Rules', description: 'Percentage, fixed or slab-based rules',     path: '/settings/commission-rules' },
      { icon: CreditCard,       label: 'Client Billing Profiles', description: 'View and manage client billing details',      path: '/clients' },
      { icon: Globe2,           label: 'Currency & Localization',  description: 'Currency, timezone and date format',         path: '/settings/localization' },
    ],
  },
  {
    title: 'Communication',
    color: 'bg-pink-50',
    iconColor: 'text-pink-600',
    items: [
      { icon: Mail, label: 'Email Configuration',     description: 'SMTP setup and test connection',          path: '/settings/email-config' },
      { icon: Bell, label: 'Notification Preferences', description: 'Event matrix: email and in-app alerts',  path: '/settings/notification-settings' },
    ],
  },
  {
    title: 'System',
    color: 'bg-slate-50',
    iconColor: 'text-slate-600',
    items: [
      { icon: Lock,       label: 'Security',        description: 'Password policy, 2FA, session timeout and IP allowlist', path: '/settings/security' },
      { icon: Activity,   label: 'Login Activity',  description: 'View login history: user, role, time and IP address',    path: '/settings/login-activity' },
      { icon: ScrollText, label: 'Audit Logs',      description: 'View system activity and change history',                path: '/audit-logs' },
      { icon: Database,   label: 'Data Management', description: 'Backups, retention rules and GDPR options',             path: '/settings/data-management' },
      { icon: FormInput,  label: 'Custom Fields',   description: 'Add custom fields to candidates, jobs and clients',     path: '/settings/custom-fields' },
      { icon: Palette,    label: 'Branding & Theme', description: 'Colors, logo, favicon and login banner',              path: '/settings/branding' },
    ],
  },
  {
    title: 'Targets & Performance',
    color: 'bg-orange-50',
    iconColor: 'text-orange-600',
    items: [
      { icon: Target,           label: 'Targets',           description: 'Set and track performance targets',          path: '/targets' },
      { icon: SlidersHorizontal, label: 'SLA Configuration', description: 'Define SLA rules and escalation levels',   path: '/settings/sla-config' },
    ],
  },
]

const SettingsHub = () => {
  const navigate = useNavigate()
  const isOwner = useSelector(selectIsOwner)

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-surface-900">Settings</h1>
        <p className="text-surface-500 mt-1 text-sm">
          Configure your organisation across users, recruitment workflow, billing, communication, and system preferences.
        </p>
      </div>

      <div className="space-y-6">
        {SECTIONS.filter(section => !section.ownerOnly || isOwner).map(section => {
          const visibleItems = section.items.filter(item => !item.ownerOnly || isOwner)
          if (visibleItems.length === 0) return null
          return (
            <div
              key={section.title}
              className="bg-white rounded-xl shadow-sm border border-surface-100 overflow-hidden"
            >
              <div className={`px-6 py-3 border-b border-surface-100 ${section.color}`}>
                <h2 className="font-semibold text-surface-800 text-sm uppercase tracking-wide">
                  {section.title}
                </h2>
              </div>
              <div className="divide-y divide-surface-50">
                {visibleItems.map(item => (
                  <button
                    key={item.label}
                    onClick={() => navigate(item.path)}
                    className="w-full flex items-center gap-4 px-6 py-4 hover:bg-surface-50 transition-colors text-left"
                  >
                    <div className={`p-2 rounded-lg ${section.color}`}>
                      <item.icon className={`w-5 h-5 ${section.iconColor}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-surface-900 text-sm">{item.label}</p>
                      <p className="text-xs text-surface-500 mt-0.5 truncate">{item.description}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-surface-400 flex-shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default SettingsHub
