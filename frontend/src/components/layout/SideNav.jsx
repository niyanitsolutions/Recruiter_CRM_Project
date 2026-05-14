import { useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { clsx } from 'clsx'
import {
  LayoutDashboard,
  Building2,
  CreditCard,
  Users,
  Settings,
  FileText,
  Bell,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Target,
  Briefcase,
  History,
  UserCircle,
  Building,
  Award,
  Calendar,
  Receipt,
  Users2,
  ClipboardList,
  UserPlus,
  UserCheck,
  UserMinus,
  DollarSign,
  FileCheck,
  BarChart2,
  Link2,
  SlidersHorizontal,
  Tag,
  Wallet,
  Trash2,
  Plug,
  UserCog,
  Clock,
  Megaphone,
  TrendingUp,
  Banknote,
  PersonStanding,
  Briefcase as BriefcaseIcon,
  UserSearch,
  CalendarCheck,
  FileBox,
  UserCheck2,
  LayoutTemplate,
} from 'lucide-react'
import { useSelector, useDispatch } from 'react-redux'
import { logoutUser, selectUser, selectIsSuperAdmin, selectIsSeller, selectUserRole, selectUserType } from '../../store/authSlice'
import { useTheme } from '../../contexts/ThemeContext'

// ─── Permission → nav-item mapping ────────────────────────────────────────────
// `permissions` is an array — the nav item shows if the user has ANY one of them.
// This ensures sub-permissions (e.g. interviews:settings, onboards:create) also
// reveal the parent nav link even when the broad :view permission wasn't granted.
const PERMISSION_NAV_MAP = [
  // Main
  { permissions: ['dashboard:view'],
    path: '/dashboard',   icon: LayoutDashboard, label: 'Dashboard',      section: 'Main', exact: true },
  // Recruitment
  { permissions: ['candidates:view'],
    path: '/candidates',   icon: Users2,        label: 'Candidates',      section: 'Recruitment' },
  { permissions: ['jobs:view'],
    path: '/jobs',         icon: Briefcase,     label: 'Jobs',            section: 'Recruitment' },
  { permissions: ['clients:view'],
    path: '/clients',      icon: Building2,     label: 'Clients',         section: 'Recruitment' },
  { permissions: ['candidates:view'],  // Applications visibility tied to candidate access
    path: '/applications', icon: ClipboardList, label: 'Applications',    section: 'Recruitment' },
  { permissions: ['interviews:view'],
    path: '/interviews',   icon: Calendar,      label: 'Interviews',      section: 'Recruitment' },
  { permissions: ['interview_settings:view', 'interview_settings:create', 'interview_settings:edit'],
    path: '/interviews/settings', icon: SlidersHorizontal, label: 'Interview Settings', section: 'Recruitment' },
  // Onboarding
  { permissions: ['onboards:view'],
    path: '/onboards',     icon: UserCheck,     label: 'Onboarding',      section: 'Onboarding' },
  // User Management
  { permissions: ['users:view'],
    path: '/users',          icon: Users,      label: 'Users',           section: 'User Management' },
  { permissions: ['users:view'],
    path: '/users/inactive', icon: UserMinus,  label: 'Inactive Users',  section: 'User Management' },
  { permissions: ['departments:view'],
    path: '/departments',  icon: Building,      label: 'Departments',     section: 'User Management' },
  { permissions: ['designations:view'],
    path: '/designations', icon: Award,         label: 'Designations',    section: 'User Management' },
  // Partner Management
  { permissions: ['partners:view'],
    path: '/partners',         icon: Link2,      label: 'Partners',        section: 'Partner Management' },
  { permissions: ['accounts:payouts'],
    path: '/payouts',          icon: DollarSign, label: 'Partner Payouts', section: 'Partner Management' },
  { permissions: ['accounts:invoices'],
    path: '/payouts/invoices', icon: Receipt,    label: 'Partner Invoices', section: 'Partner Management' },
  // System
  { permissions: ['targets:view', 'targets:create', 'targets:edit'],
    path: '/targets',    icon: Target,       label: 'Targets',   section: 'System' },
  { permissions: ['tasks:view'],
    path: '/tasks',      icon: FileCheck,    label: 'Tasks',     section: 'System' },
  { permissions: ['reports:view'],
    path: '/reports',    icon: FileText,  label: 'Reports',   section: 'System' },
  { permissions: ['analytics:view'],
    path: '/analytics',  icon: BarChart2, label: 'Analytics', section: 'System' },
  { permissions: ['audit:view'],
    path: '/audit-logs', icon: History,   label: 'Audit Logs', section: 'System' },
  { permissions: ['audit:view'],
    path: '/trash',        icon: Trash2, label: 'Deleted History', section: 'System' },
  { permissions: ['crm_settings:view', 'crm_settings:edit'],
    path: '/integrations', icon: Plug,   label: 'Integrations',    section: 'System' },
  { permissions: ['crm_settings:view', 'crm_settings:edit'],
    path: '/settings',   icon: Settings,  label: 'Settings',   section: 'System' },
  // HRM — shown only when hrm_enabled (filtered separately in getMenuSections)
  { permissions: ['hrm:dashboard:view'],
    path: '/hrm',                   icon: LayoutDashboard, label: 'HRM Dashboard',    section: 'HRM', hrmOnly: true },
  { permissions: ['hrm:employees:view', 'hrm:employees:manage'],
    path: '/hrm/employees',         icon: UserCog,         label: 'Employees',        section: 'HRM', hrmOnly: true },
  { permissions: ['hrm:attendance:self', 'hrm:attendance:team', 'hrm:attendance:manage'],
    path: '/hrm/attendance',        icon: Clock,           label: 'Attendance',       section: 'HRM', hrmOnly: true },
  { permissions: ['hrm:leave:apply', 'hrm:leave:team_approve', 'hrm:leave:manage'],
    path: '/hrm/leaves',            icon: Calendar,        label: 'Leave Management', section: 'HRM', hrmOnly: true },
  { permissions: ['hrm:payroll:view_self', 'hrm:payroll:manage'],
    path: '/hrm/payroll',           icon: Banknote,        label: 'Payroll',          section: 'HRM', hrmOnly: true },
  { permissions: ['hrm:performance:self', 'hrm:performance:team', 'hrm:performance:manage'],
    path: '/hrm/performance',       icon: TrendingUp,      label: 'Performance',      section: 'HRM', hrmOnly: true },
  { permissions: ['hrm:announcements:view', 'hrm:announcements:manage'],
    path: '/hrm/announcements',        icon: Megaphone,       label: 'Announcements',   section: 'HRM', hrmOnly: true },
  // Internal Hiring — each section is a direct nav item (no pipeline wrapper)
  { permissions: ['hrm:hiring:view', 'hrm:hiring:manage'],
    path: '/hrm/hiring',               icon: PersonStanding,  label: 'Hiring',          section: 'Internal Hiring', hrmOnly: true },
  { permissions: ['hrm:hiring:view', 'hrm:hiring:manage'],
    path: '/hrm/hiring/jobs',          icon: BriefcaseIcon,   label: 'Jobs',            section: 'Internal Hiring', hrmOnly: true },
  { permissions: ['hrm:hiring:view', 'hrm:hiring:manage'],
    path: '/hrm/hiring/candidates',    icon: UserSearch,      label: 'Candidates',      section: 'Internal Hiring', hrmOnly: true },
  { permissions: ['hrm:hiring:view', 'hrm:hiring:manage'],
    path: '/hrm/hiring/interviews',    icon: CalendarCheck,   label: 'Interviews',      section: 'Internal Hiring', hrmOnly: true },
  { permissions: ['hrm:hiring:view', 'hrm:hiring:manage'],
    path: '/hrm/hiring/offers',        icon: FileBox,         label: 'Offers',          section: 'Internal Hiring', hrmOnly: true },
  { permissions: ['hrm:hiring:view', 'hrm:hiring:manage'],
    path: '/hrm/hiring/onboarding',    icon: UserCheck2,      label: 'Onboarding',      section: 'Internal Hiring', hrmOnly: true },
  { permissions: ['hrm:offer_templates:view', 'hrm:offer_templates:manage'],
    path: '/hrm/offer-templates',      icon: LayoutTemplate,  label: 'Offer Templates', section: 'Internal Hiring', hrmOnly: true },
]

/**
 * Build a sectioned nav from the user's actual permission array.
 * A nav item is shown when the user has ANY permission in its `permissions` list.
 * Pass isOwner=true to bypass filtering (company-level superuser only).
 */
const buildPermissionMenu = (permissions, isOwner = false, isAdmin = false) => {
  const perms = new Set(permissions || [])
  const sectionMap = {}

  for (const item of PERMISSION_NAV_MAP) {
    // HRM items are always shown — gating is purely permission-driven
    if (!isOwner && !isAdmin && !item.permissions.some(p => perms.has(p))) continue
    if (!sectionMap[item.section]) sectionMap[item.section] = []
    const isDuplicate = sectionMap[item.section].some(
      (i) => i.path === item.path && JSON.stringify(i.query || {}) === JSON.stringify(item.query || {})
    )
    if (!isDuplicate) {
      sectionMap[item.section].push(item)
    }
  }

  return Object.entries(sectionMap).map(([section, items]) => ({ section, items }))
}

const SideNav = ({ isCollapsed, onToggle, mobileOpen, onMobileClose }) => {
  const dispatch     = useDispatch()
  const user         = useSelector(selectUser)
  const isSuperAdmin = useSelector(selectIsSuperAdmin)
  const isSeller     = useSelector(selectIsSeller)
  const userRole     = useSelector(selectUserRole)
  const userType     = useSelector(selectUserType)
  const { isDark, themeMode } = useTheme()
  const location     = useLocation()

  // Close mobile nav on route change
  useEffect(() => {
    if (mobileOpen && onMobileClose) onMobileClose()
  }, [location.pathname])

  const handleLogout = () => dispatch(logoutUser())

  // ── Build menu ──────────────────────────────────────────────────────────────
  const getMenuSections = () => {
    // Super-admin: flat list (expanded)
    if (isSuperAdmin) {
      return {
        flat: [
          { path: '/super-admin',               icon: LayoutDashboard, label: 'Dashboard',     exact: true },
          { path: '/super-admin/tenants',       icon: Building2,       label: 'Tenants' },
          { path: '/super-admin/sellers',       icon: Users,           label: 'Sellers' },
          { path: '/super-admin/plans',         icon: CreditCard,      label: 'Plans' },
          { path: '/super-admin/discounts',     icon: Tag,             label: 'Discounts' },
          { path: '/super-admin/subscriptions', icon: FileText,        label: 'Subscriptions' },
          { path: '/super-admin/payments',      icon: DollarSign,      label: 'Payments' },
          { path: '/super-admin/reports',       icon: BarChart2,       label: 'Reports' },
          { path: '/super-admin/settings',      icon: Settings,        label: 'Settings' },
        ],
        sections: [],
      }
    }

    // Seller: flat list
    if (isSeller) {
      return {
        flat: [
          { path: '/seller',                 icon: LayoutDashboard, label: 'Dashboard',     exact: true },
          { path: '/seller/tenants',         icon: Building2,       label: 'Tenants' },
          { path: '/seller/subscriptions',   icon: FileText,        label: 'Subscriptions' },
          { path: '/seller/payments',        icon: Wallet,          label: 'Payments' },
          { path: '/seller/commissions',     icon: Award,           label: 'Commissions' },
          { path: '/seller/notifications',   icon: Bell,            label: 'Notifications' },
          { path: '/seller/profile',         icon: UserCircle,      label: 'My Profile' },
        ],
        sections: [],
      }
    }

    // Partner: fixed partner menu
    if (userType === 'partner') {
      return {
        flat: [],
        sections: [
          { section: 'My Work', items: [
            { path: '/my-candidates',     icon: Users2,    label: 'My Candidates' },
            { path: '/my-candidates/new', icon: UserPlus,  label: 'Add Candidate' },
            { path: '/available-jobs',    icon: Briefcase, label: 'Available Jobs' },
          ]},
          { section: 'Earnings', items: [
            { path: '/my-payouts',    icon: DollarSign, label: 'My Payouts' },
            { path: '/my-invoices',   icon: Receipt,    label: 'My Invoices' },
            { path: '/raise-invoice', icon: FileCheck,  label: 'Raise Invoice' },
          ]},
        ],
      }
    }

    // All non-super-admin, non-partner roles: strictly permission-driven.
    // Only Owners bypass the filter (company-level superuser).
    // Admin role goes through the same permission check as all other roles —
    // it simply has a different (smaller) default permission set.
    const sections = buildPermissionMenu(user?.permissions, !!user?.isOwner, false)
    return {
      flat: [],
      sections: sections.length > 0
        ? sections
        : [{ section: 'Info', items: [{ path: '/recruitment', icon: LayoutDashboard, label: 'Home' }] }],
    }
  }

  const { flat, sections } = getMenuSections()

  // ── Shared nav-link renderers ─────────────────────────────────────────────
  const NavItem = ({ item }) => (
    <li>
      <NavLink
        to={item.path}
        end={item.exact}
        title={isCollapsed ? item.label : undefined}
        className={({ isActive }) =>
          clsx('nav-item', isActive && 'nav-item-active', isCollapsed && 'justify-center px-3')
        }
      >
        <item.icon className="w-5 h-5 flex-shrink-0" />
        {!isCollapsed && <span>{item.label}</span>}
      </NavLink>
    </li>
  )

  /**
   * Like NavItem but matches on both pathname AND a specific query-param value.
   * Used for links like /users?role=partner where pathname alone would match
   * the regular /users link too.
   */
  const QueryNavItem = ({ path, query, icon: Icon, label }) => {
    const location = useLocation()
    const sp = new URLSearchParams(location.search)
    const [qKey, qVal] = Object.entries(query)[0]
    const isActive =
      location.pathname === path && sp.get(qKey) === qVal

    return (
      <li>
        <NavLink
          to={`${path}?${qKey}=${qVal}`}
          title={isCollapsed ? label : undefined}
          className={clsx('nav-item', isActive && 'nav-item-active', isCollapsed && 'justify-center px-3')}
        >
          <Icon className="w-5 h-5 flex-shrink-0" />
          {!isCollapsed && <span>{label}</span>}
        </NavLink>
      </li>
    )
  }

  return (
    <aside className={clsx(
      'fixed left-0 top-0 h-screen transition-all duration-300 z-40 flex flex-col',
      isCollapsed ? 'w-20' : 'w-64',
      mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
    )} style={{
        backgroundColor: 'var(--bg-sidebar)',
        borderRight: '1px solid var(--border)',
        boxShadow: themeMode === 'system'
          ? isDark
            ? 'inset -8px 0 32px rgba(14,165,233,0.15), 4px 0 24px rgba(0,0,0,0.40)'
            : '2px 0 12px rgba(14,165,233,0.08)'
          : isDark
          ? 'inset -8px 0 32px rgba(124,58,237,0.18), 4px 0 24px rgba(0,0,0,0.40)'
          : '2px 0 12px rgba(124,58,237,0.06)',
      }}>
      {/* Logo */}
      <div className={clsx('h-16 flex items-center', isCollapsed ? 'justify-center px-2' : 'px-5')} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        {!isCollapsed ? (
          <img
            src="/Hire_Flow_Logo.png"
            alt="HireFlow"
            style={{ height: '30px', width: 'auto', maxWidth: '160px' }}
          />
        ) : (
          <img
            src="/Hire_Flow_icon-removebg.png"
            alt="HF"
            style={{ width: '36px', height: '36px', borderRadius: '8px' }}
          />
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 overflow-y-auto hide-scrollbar">
        {/* Flat (super-admin) */}
        {flat.length > 0 && (
          <ul className="space-y-1 px-3">
            {flat.map((item) => <NavItem key={item.path} item={item} />)}
          </ul>
        )}

        {/* Sectioned */}
        {sections.map((sec, idx) => (
          <div key={sec.section} className={idx > 0 ? 'mt-6' : ''}>
            {!isCollapsed && (
              <p className="px-5 mb-1 text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--nav-text)', opacity: 0.6 }}>
                {sec.section}
              </p>
            )}
            <ul className="space-y-1 px-3">
              {sec.items.map((item) =>
                item.query
                  ? <QueryNavItem key={item.path + JSON.stringify(item.query)} path={item.path} query={item.query} icon={item.icon} label={item.label} />
                  : <NavItem key={item.path} item={item} />
              )}
            </ul>
          </div>
        ))}

        {/* Divider */}
        <div className="my-4 mx-3" style={{ borderTop: '1px solid var(--border-subtle)' }} />

        {/* Utility links: only for company users (not super-admin or seller) */}
        {!isSuperAdmin && !isSeller && (
          <ul className="space-y-1 px-3">
            <li>
              <NavLink
                to="/notifications"
                title={isCollapsed ? 'Notifications' : undefined}
                className={({ isActive }) =>
                  clsx('nav-item', isActive && 'nav-item-active', isCollapsed && 'justify-center px-3')
                }
              >
                <Bell className="w-5 h-5 flex-shrink-0" />
                {!isCollapsed && <span>Notifications</span>}
              </NavLink>
            </li>
            <li>
              <NavLink
                to="/my-profile"
                title={isCollapsed ? 'My Profile' : undefined}
                className={({ isActive }) =>
                  clsx('nav-item', isActive && 'nav-item-active', isCollapsed && 'justify-center px-3')
                }
              >
                <UserCircle className="w-5 h-5 flex-shrink-0" />
                {!isCollapsed && <span>My Profile</span>}
              </NavLink>
            </li>
          </ul>
        )}
      </nav>

      {/* User info + logout */}
      <div className="p-3" style={{ borderTop: '1px solid var(--border)' }}>
        {!isCollapsed ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full flex items-center justify-center font-semibold text-sm flex-shrink-0 text-white" style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', boxShadow: '0 0 10px rgba(124,58,237,0.4)' }}>
                {user?.fullName?.charAt(0) || user?.full_name?.charAt(0) || 'U'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: 'var(--text-heading)' }}>{user?.fullName || user?.full_name || 'User'}</p>
                <p className="text-xs truncate capitalize" style={{ color: 'var(--text-muted)' }}>
                  {isSuperAdmin ? 'Super Admin' : isSeller ? 'Seller' : user?.isOwner ? 'Owner' : (userRole || 'User').replace(/_/g, ' ')}
                </p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                width: '100%', padding: '8px 12px', borderRadius: 8,
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: '#f87171', fontSize: 13, fontWeight: 500,
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.10)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <LogOut size={15} />
              Logout
            </button>
          </div>
        ) : (
          <button onClick={handleLogout} className="w-full flex justify-center p-2 rounded-lg transition-colors" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#f87171' }} title="Logout">
            <LogOut className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Collapse toggle */}
      <button
        onClick={onToggle}
        className="absolute -right-3 top-20 w-6 h-6 rounded-full flex items-center justify-center transition-all duration-200 shadow-lg"
        style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', border: '1px solid rgba(124,58,237,0.4)', boxShadow: '0 0 10px rgba(124,58,237,0.4)' }}
      >
        {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
      </button>
    </aside>
  )
}

export default SideNav
