import React, { useState, useRef, useEffect } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { clsx } from 'clsx'
import {
  Search,
  Settings,
  User,
  LogOut,
  ChevronDown,
  Building2,
  CreditCard,
  HelpCircle,
  Sun,
  Moon,
  Monitor,
  ChevronRight,
  Menu,
  Command,
} from 'lucide-react'
import { logoutUser, selectUser, selectIsSuperAdmin, selectIsOwner, selectIsSeller } from '../../store/authSlice'
import NotificationBell from '../notifications/NotificationBell'
import { useTheme } from '../../contexts/ThemeContext'

// ── Breadcrumb path → label map ───────────────────────────────────────────────
const PATH_LABELS = {
  dashboard: 'Dashboard',
  candidates: 'Candidates',
  jobs: 'Jobs',
  clients: 'Clients',
  applications: 'Applications',
  interviews: 'Interviews',
  onboards: 'Onboarding',
  users: 'Users',
  partners: 'Partners',
  departments: 'Departments',
  designations: 'Designations',
  payouts: 'Payouts',
  invoices: 'Invoices',
  targets: 'Targets',
  tasks: 'Tasks',
  reports: 'Reports',
  analytics: 'Analytics',
  'audit-logs': 'Audit Logs',
  settings: 'Settings',
  profile: 'Profile',
  'my-profile': 'My Profile',
  'company-settings': 'Company Settings',
  'upgrade-plan': 'Upgrade Plan',
  notifications: 'Notifications',
  'super-admin': 'Super Admin',
  seller: 'Seller',
  tenants: 'Tenants',
  sellers: 'Sellers',
  plans: 'Plans',
  discounts: 'Discounts',
  subscriptions: 'Subscriptions',
  payments: 'Payments',
  hrm: 'HRM',
  employees: 'Employees',
  attendance: 'Attendance',
  leaves: 'Leave Management',
  payroll: 'Payroll',
  performance: 'Performance',
  announcements: 'Announcements',
  hiring: 'Hiring',
  offers: 'Offers',
  onboarding: 'Onboarding',
  new: 'New',
  edit: 'Edit',
  trash: 'Deleted History',
  integrations: 'Integrations',
}

const isIdSegment = (seg) => /^[0-9a-f-]{20,}$|^\d{5,}$/.test(seg)

const segmentLabel = (seg) =>
  PATH_LABELS[seg] || seg.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

const Breadcrumbs = () => {
  const location = useLocation()
  const segments = location.pathname.split('/').filter(Boolean)

  if (segments.length <= 1) return null

  // Build cumulative paths for each segment
  const crumbs = segments.map((seg, i) => {
    const isId = isIdSegment(seg)
    // For ID segments, show the parent's singular label e.g. "Candidate"
    let label = segmentLabel(seg)
    if (isId && i > 0) {
      const parentLabel = segmentLabel(segments[i - 1])
      label = parentLabel.replace(/s$/, '')
    }
    return {
      label,
      path: '/' + segments.slice(0, i + 1).join('/'),
      isLast: i === segments.length - 1,
      isId,
    }
  })

  return (
    <nav className="flex items-center gap-1 text-xs mt-0.5 flex-wrap">
      {crumbs.map((crumb, i) => (
        <React.Fragment key={i}>
          {i > 0 && (
            <ChevronRight className="w-3 h-3 flex-shrink-0" style={{ color: 'var(--text-disabled)' }} />
          )}
          {crumb.isLast || crumb.isId ? (
            <span
              className={crumb.isLast ? 'font-medium' : ''}
              style={{ color: crumb.isLast ? 'var(--accent)' : 'var(--text-muted)' }}
            >
              {crumb.label}
            </span>
          ) : (
            <Link
              to={crumb.path}
              className="transition-colors hover:underline"
              style={{ color: 'var(--text-muted)' }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--text-primary)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
            >
              {crumb.label}
            </Link>
          )}
        </React.Fragment>
      ))}
    </nav>
  )
}

const TopBar = ({ title, subtitle, actions, onMobileToggle, onSearchOpen }) => {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const location = useLocation()
  const user = useSelector(selectUser)
  const isSuperAdmin = useSelector(selectIsSuperAdmin)
  const isOwner = useSelector(selectIsOwner)
  const isSeller = useSelector(selectIsSeller)
  const { themeMode, setThemeMode } = useTheme()
  const [themeOpen, setThemeOpen] = useState(false)
  const themeRef = useRef(null)

  useEffect(() => {
    const handler = (e) => {
      if (themeRef.current && !themeRef.current.contains(e.target)) setThemeOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const profileRef = useRef(null)

  useEffect(() => { setIsProfileOpen(false) }, [location.pathname])

  useEffect(() => {
    const handler = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) setIsProfileOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleLogout = () => {
    dispatch(logoutUser())
    navigate('/login', { replace: true })
  }

  const profileMenuItems = isSuperAdmin
    ? [
        { icon: User,       label: 'Profile',  onClick: () => navigate('/super-admin/profile') },
        { icon: Settings,   label: 'Settings', onClick: () => navigate('/super-admin/settings') },
        { icon: HelpCircle, label: 'Help',     onClick: () => window.open('mailto:support@niyanhireflow.com') },
      ]
    : [
        { icon: User,       label: 'Edit Profile',     onClick: () => navigate('/profile') },
        { icon: Building2,  label: 'Company Settings', onClick: () => navigate('/company-settings') },
        { icon: CreditCard, label: 'Billing & Plans',  onClick: () => navigate('/upgrade-plan') },
        { icon: HelpCircle, label: 'Help',             onClick: () => window.open('mailto:support@niyanhireflow.com') },
      ]

  const segments = location.pathname.split('/').filter(Boolean)
  const derivedTitle = title || (() => {
    if (segments.length === 0) return 'Dashboard'
    const last = segments[segments.length - 1]
    const isId = /^[0-9a-f-]{20,}$|^\d{5,}$/.test(last)
    if (isId && segments.length >= 2) {
      // /candidates/:id → "Candidate Details"
      const parentLabel = segmentLabel(segments[segments.length - 2])
      const singular = parentLabel.replace(/s$/, '')
      return singular + ' Details'
    }
    return segmentLabel(last)
  })()

  // Detect OS for shortcut hint
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

  return (
    <header
      className="h-16 flex items-center justify-between px-6 sticky top-0 z-30 backdrop-blur-xl"
      style={{
        backgroundColor: 'var(--bg-topbar)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      {/* Left: mobile hamburger + page title */}
      <div className="flex items-center gap-2 min-w-0">
        {onMobileToggle && (
          <button
            className="md:hidden flex-shrink-0 p-2 rounded-lg transition-colors"
            onClick={onMobileToggle}
            style={{ color: 'var(--text-secondary)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = ''}
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}
        <div className="min-w-0">
          <h1 className="text-lg font-semibold leading-tight truncate" style={{ color: 'var(--text-heading)' }}>
            {derivedTitle}
          </h1>
          {subtitle
            ? <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>{subtitle}</p>
            : <Breadcrumbs />
          }
        </div>
      </div>

      <div className="flex items-center gap-2 ml-4">
        {actions && <div className="flex items-center gap-2 mr-2">{actions}</div>}

        {/* Search trigger — opens GlobalSearch overlay */}
        <button
          onClick={onSearchOpen}
          className="relative hidden md:flex items-center gap-2 px-3 py-2 text-sm rounded-full transition-all duration-200"
          style={{
            background: 'var(--bg-hover)',
            border: '1px solid var(--border)',
            color: 'var(--text-muted)',
            minWidth: 200,
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-strong)'; e.currentTarget.style.color = 'var(--text-primary)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)' }}
          title="Global search (Ctrl+K)"
        >
          <Search className="w-4 h-4 flex-shrink-0" />
          <span className="flex-1 text-left text-sm">Search...</span>
          <kbd className="text-xs px-1.5 py-0.5 rounded border font-mono flex-shrink-0"
            style={{ borderColor: 'var(--border)', background: 'var(--bg-card)', color: 'var(--text-disabled)' }}>
            {isMac ? '⌘K' : 'Ctrl K'}
          </kbd>
        </button>

        {/* Mobile search icon */}
        <button
          onClick={onSearchOpen}
          className="md:hidden p-2 rounded-lg transition-colors"
          style={{ color: 'var(--text-muted)' }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
          onMouseLeave={e => e.currentTarget.style.background = ''}
          aria-label="Search"
        >
          <Search className="w-5 h-5" />
        </button>

        {/* Theme toggle — 3-way: Dark / Light / System */}
        <div className="relative" ref={themeRef}>
          <button
            onClick={() => setThemeOpen(o => !o)}
            className="relative p-2 rounded-lg transition-all duration-200"
            style={{ color: 'var(--text-muted)' }}
            title="Change theme"
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-primary)' }}
            onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = 'var(--text-muted)' }}
          >
            {themeMode === 'dark' ? <Moon className="w-5 h-5" />
              : themeMode === 'light' ? <Sun className="w-5 h-5" />
              : <Monitor className="w-5 h-5" />
            }
          </button>

          {themeOpen && (
            <div className="dropdown right-0 animate-slide-up" style={{ minWidth: 140 }}>
              {[
                { mode: 'dark',   icon: Moon,    label: 'Dark' },
                { mode: 'light',  icon: Sun,     label: 'Light' },
                { mode: 'system', icon: Monitor, label: 'System' },
              ].map(({ mode, icon: Icon, label }) => (
                <button
                  key={mode}
                  onClick={() => { setThemeMode(mode); setThemeOpen(false) }}
                  className="dropdown-item flex items-center gap-3"
                  style={themeMode === mode ? { color: 'var(--accent)', background: 'var(--bg-active)' } : {}}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                  {themeMode === mode && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-current" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Notifications */}
        <NotificationBell />

        {/* Profile */}
        <div className="relative" ref={profileRef}>
          <button
            onClick={() => setIsProfileOpen(!isProfileOpen)}
            className="flex items-center gap-2.5 pl-1 pr-2 py-1 rounded-lg transition-all duration-200"
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = ''}
          >
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-white font-semibold text-sm flex-shrink-0"
              style={{ background: 'var(--gradient-1)' }}
            >
              {user?.fullName?.charAt(0)?.toUpperCase() || 'U'}
            </div>
            <div className="hidden md:block text-left">
              <p className="text-sm font-medium leading-tight" style={{ color: 'var(--text-primary)' }}>
                {user?.fullName || 'User'}
              </p>
              <p className="text-xs leading-tight capitalize" style={{ color: 'var(--text-muted)' }}>
                {isSuperAdmin ? 'Super Admin' : isSeller ? 'Seller' : isOwner ? 'Owner' : (user?.role || '').replace(/_/g, ' ')}
              </p>
            </div>
            <ChevronDown className={clsx(
              'w-3.5 h-3.5 hidden md:block transition-transform duration-200',
              isProfileOpen && 'rotate-180'
            )} style={{ color: 'var(--text-muted)' }} />
          </button>

          {isProfileOpen && (
            <div className="dropdown right-0 animate-slide-up">
              <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
                <p className="text-sm font-semibold" style={{ color: 'var(--text-heading)' }}>{user?.fullName}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{user?.email}</p>
                {user?.companyName && (
                  <p className="text-xs mt-1 font-medium" style={{ color: 'var(--accent)' }}>{user.companyName}</p>
                )}
              </div>
              <div className="py-1">
                {profileMenuItems.map((item, index) => (
                  <button
                    key={index}
                    onClick={() => { item.onClick(); setIsProfileOpen(false) }}
                    className="dropdown-item flex items-center gap-3"
                  >
                    <item.icon className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="py-1" style={{ borderTop: '1px solid var(--border)' }}>
                <button
                  onClick={handleLogout}
                  className="dropdown-item flex items-center gap-3"
                  style={{ color: 'var(--text-danger)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-danger)'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}
                >
                  <LogOut className="w-4 h-4" />
                  Logout
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

export default TopBar
