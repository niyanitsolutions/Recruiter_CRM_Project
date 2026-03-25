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
} from 'lucide-react'
import { useSelector, useDispatch } from 'react-redux'
import { logout, selectUser, selectIsSuperAdmin, selectIsSeller, selectUserRole, selectUserType } from '../../store/authSlice'

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
  { permissions: ['partners:view'],
    path: '/partners',     icon: Link2,         label: 'Partners',        section: 'User Management' },
  { permissions: ['departments:view'],
    path: '/departments',  icon: Building,      label: 'Departments',     section: 'User Management' },
  { permissions: ['designations:view'],
    path: '/designations', icon: Award,         label: 'Designations',    section: 'User Management' },
  // Finance
  { permissions: ['accounts:payouts'],
    path: '/payouts',          icon: DollarSign, label: 'Partner Payouts', section: 'Finance' },
  { permissions: ['accounts:invoices'],
    path: '/payouts/invoices', icon: Receipt,    label: 'Invoices',        section: 'Finance' },
  // System
  { permissions: ['targets:view', 'targets:create', 'targets:edit'],
    path: '/targets',    icon: Target,    label: 'Targets',   section: 'System' },
  { permissions: ['reports:view'],
    path: '/reports',    icon: FileText,  label: 'Reports',   section: 'System' },
  { permissions: ['analytics:view'],
    path: '/analytics',  icon: BarChart2, label: 'Analytics', section: 'System' },
  { permissions: ['audit:view'],
    path: '/audit-logs', icon: History,   label: 'Audit Logs', section: 'System' },
  { permissions: ['crm_settings:view', 'crm_settings:edit'],
    path: '/settings',   icon: Settings,  label: 'Settings',   section: 'System' },
]

/**
 * Build a sectioned nav from the user's actual permission array.
 * A nav item is shown when the user has ANY permission in its `permissions` list.
 */
const buildPermissionMenu = (permissions) => {
  const perms = new Set(permissions || [])
  const sectionMap = {}

  for (const item of PERMISSION_NAV_MAP) {
    if (!item.permissions.some(p => perms.has(p))) continue
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

const SideNav = ({ isCollapsed, onToggle }) => {
  const dispatch     = useDispatch()
  const user         = useSelector(selectUser)
  const isSuperAdmin = useSelector(selectIsSuperAdmin)
  const isSeller     = useSelector(selectIsSeller)
  const userRole     = useSelector(selectUserRole)
  const userType     = useSelector(selectUserType)

  const handleLogout = () => dispatch(logout())

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

    // Designation == "Admin": restrict to exactly Users, Partners, Departments, Designations
    if (user?.designation === 'Admin') {
      const perms = new Set(user?.permissions || [])
      const allowed = ['/users', '/partners', '/departments', '/designations']
      const adminItems = PERMISSION_NAV_MAP.filter(
        item => allowed.includes(item.path) && item.permissions.some(p => perms.has(p))
      )
      return {
        flat: [],
        sections: adminItems.length > 0
          ? [{ section: 'User Management', items: adminItems }]
          : [{ section: 'User Management', items: [{ path: '/users', icon: Users, label: 'Users' }] }],
      }
    }

    // All non-super-admin, non-partner roles (including admin): strictly permission-driven
    const sections = buildPermissionMenu(user?.permissions)
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
      'fixed left-0 top-0 h-screen bg-primary-500 text-white transition-all duration-300 z-40 flex flex-col',
      isCollapsed ? 'w-20' : 'w-64'
    )}>
      {/* Logo */}
      <div className={clsx('h-16 flex items-center border-b border-white/10', isCollapsed ? 'justify-center px-2' : 'px-6')}>
        {!isCollapsed ? (
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-400 to-accent-600 flex items-center justify-center font-bold text-lg shadow-glow">C</div>
            <div>
              <h1 className="font-bold text-lg">CRM</h1>
              <p className="text-xs text-white/60">Recruitment Platform</p>
            </div>
          </div>
        ) : (
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-400 to-accent-600 flex items-center justify-center font-bold text-lg shadow-glow">C</div>
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
              <p className="px-6 mb-2 text-xs font-semibold text-white/40 uppercase tracking-wider">
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
        <div className="my-4 mx-3 border-t border-white/10" />

        {/* Utility links: only for company users (not super-admin or seller) */}
        {!isSuperAdmin && !isSeller && (
          <ul className="space-y-1 px-3">
            <li>
              <NavLink
                to="/notifications"
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
      <div className="border-t border-white/10 p-4">
        {!isCollapsed ? (
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center font-semibold">
              {user?.fullName?.charAt(0) || user?.full_name?.charAt(0) || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.fullName || user?.full_name || 'User'}</p>
              <p className="text-xs text-white/60 truncate capitalize">
                {(user?.role || userRole || 'User').replace(/_/g, ' ')}
              </p>
            </div>
            <button onClick={handleLogout} className="p-2 hover:bg-white/10 rounded-lg transition-colors" title="Logout">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button onClick={handleLogout} className="w-full flex justify-center p-2 hover:bg-white/10 rounded-lg transition-colors" title="Logout">
            <LogOut className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Collapse toggle */}
      <button
        onClick={onToggle}
        className="absolute -right-3 top-20 w-6 h-6 bg-primary-500 border border-white/20 rounded-full flex items-center justify-center hover:bg-primary-600 transition-colors shadow-lg"
      >
        {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
      </button>
    </aside>
  )
}

export default SideNav
