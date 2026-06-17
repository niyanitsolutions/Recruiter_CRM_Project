import React, { useState, useRef, useEffect } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { useNavigate, useLocation } from 'react-router-dom'
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
  Menu,
} from 'lucide-react'
import { logoutUser, selectUser, selectIsSuperAdmin, selectIsOwner, selectIsSeller } from '../../store/authSlice'
import NotificationBell from '../notifications/NotificationBell'
import AttendanceBanner from '../hrm/AttendanceBanner'
import { useTheme } from '../../contexts/ThemeContext'


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
      {/* Left: mobile hamburger + attendance section (expanded into freed space) */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
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
        {user?.userType !== 'partner' && <AttendanceBanner />}
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
