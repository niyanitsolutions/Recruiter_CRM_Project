import React, { useState, useRef, useEffect } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { useNavigate, useLocation } from 'react-router-dom'
import { clsx } from 'clsx'
import {
  Search,
  Bell,
  Settings,
  User,
  LogOut,
  ChevronDown,
  Building2,
  CreditCard,
  HelpCircle,
  Sun,
  Moon,
  ChevronRight,
  Menu,
} from 'lucide-react'
import { logoutUser, selectUser, selectIsSuperAdmin, selectIsOwner, selectIsSeller } from '../../store/authSlice'
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
  'seller': 'Seller',
  tenants: 'Tenants',
  sellers: 'Sellers',
  plans: 'Plans',
  discounts: 'Discounts',
  subscriptions: 'Subscriptions',
  payments: 'Payments',
}

const Breadcrumbs = () => {
  const location = useLocation()
  const segments = location.pathname.split('/').filter(Boolean)

  if (segments.length <= 1) return null

  return (
    <nav className="flex items-center gap-1 text-xs mt-0.5">
      {segments.map((seg, i) => {
        const label = PATH_LABELS[seg] || seg.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
        const isLast = i === segments.length - 1
        return (
          <React.Fragment key={i}>
            {i > 0 && <ChevronRight className="w-3 h-3 flex-shrink-0" style={{ color: 'var(--text-disabled)' }} />}
            <span style={{ color: isLast ? 'var(--accent)' : 'var(--text-muted)' }} className={isLast ? 'font-medium' : ''}>
              {label}
            </span>
          </React.Fragment>
        )
      })}
    </nav>
  )
}

const TopBar = ({ title, subtitle, actions, onMobileToggle }) => {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const location = useLocation()
  const user = useSelector(selectUser)
  const isSuperAdmin = useSelector(selectIsSuperAdmin)
  const isOwner = useSelector(selectIsOwner)
  const isSeller = useSelector(selectIsSeller)
  const { isDark, toggleTheme } = useTheme()

  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false)
  const profileRef = useRef(null)
  const notificationsRef = useRef(null)

  useEffect(() => {
    setIsProfileOpen(false)
    setIsNotificationsOpen(false)
  }, [location.pathname])

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setIsProfileOpen(false)
      }
      if (notificationsRef.current && !notificationsRef.current.contains(event.target)) {
        setIsNotificationsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
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

  // Auto-derive title from path if not passed
  const segments = location.pathname.split('/').filter(Boolean)
  const derivedTitle = title || (segments.length > 0
    ? PATH_LABELS[segments[segments.length - 1]] || segments[segments.length - 1].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    : 'Dashboard')

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

        {/* Search bar */}
        <div className="relative hidden md:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Search..."
            className="w-56 pl-9 pr-4 py-2 text-sm rounded-full focus:w-72 transition-all duration-300"
            style={{
              background: 'var(--bg-hover)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
            }}
          />
        </div>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="relative p-2 rounded-lg transition-all duration-200"
          style={{ color: 'var(--text-muted)' }}
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-primary)' }}
          onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = 'var(--text-muted)' }}
        >
          {isDark
            ? <Sun className="w-5 h-5" />
            : <Moon className="w-5 h-5" />
          }
        </button>

        {/* Notifications */}
        <div className="relative" ref={notificationsRef}>
          <button
            onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
            className="relative p-2 rounded-lg transition-all duration-200"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-primary)' }}
            onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = 'var(--text-muted)' }}
          >
            <Bell className="w-5 h-5" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
          </button>

          {isNotificationsOpen && (
            <div className="dropdown right-0 w-80 animate-slide-up">
              <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
                <h3 className="font-semibold text-sm" style={{ color: 'var(--text-heading)' }}>Notifications</h3>
              </div>
              <div className="px-4 py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                No new notifications
              </div>
              <div className="px-4 py-2" style={{ borderTop: '1px solid var(--border)' }}>
                <button
                  className="text-sm font-medium transition-colors"
                  style={{ color: 'var(--accent)' }}
                  onClick={() => { setIsNotificationsOpen(false); navigate('/notifications') }}
                >
                  View all notifications
                </button>
              </div>
            </div>
          )}
        </div>

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
              'w-3.5 h-3.5 hidden md:block transition-transform',
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
