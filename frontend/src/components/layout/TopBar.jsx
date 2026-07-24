import React, { useState, useRef, useEffect } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
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
import CallStatusWidget from '../telephony/CallStatusWidget'
import AttendanceBanner from '../hrm/AttendanceBanner'
import { useTheme } from '../../contexts/ThemeContext'
import EmployeeAvatar from '../common/EmployeeAvatar'
import hrmService from '../../services/hrmService'


const TopBar = ({ title, subtitle, actions, onMobileToggle, onSearchOpen }) => {
  const { t } = useTranslation()
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

  const [employeePhotoUrl, setEmployeePhotoUrl] = useState(null)

  useEffect(() => {
    const empId = user?.hrmEmployeeId
    if (!empId) { setEmployeePhotoUrl(null); return }
    hrmService.getEmployee(empId)
      .then(r => setEmployeePhotoUrl(r.data?.photo_url || null))
      .catch(() => {})
  }, [user?.hrmEmployeeId])

  useEffect(() => {
    const handler = (e) => {
      const { employeeId, photoUrl } = e.detail || {}
      // If the event carries an employeeId, only update when it matches the logged-in user's record
      if (employeeId && user?.hrmEmployeeId && employeeId !== user.hrmEmployeeId) return
      setEmployeePhotoUrl(photoUrl || null)
    }
    window.addEventListener('employee-photo-updated', handler)
    return () => window.removeEventListener('employee-photo-updated', handler)
  }, [user?.hrmEmployeeId])

  const handleLogout = () => {
    dispatch(logoutUser())
    navigate('/login', { replace: true })
  }

  const profileMenuItems = isSuperAdmin
    ? [
        { icon: User,       label: t('topbar.profile'),  onClick: () => navigate('/super-admin/profile') },
        { icon: Settings,   label: t('topbar.settings'), onClick: () => navigate('/super-admin/settings') },
        { icon: HelpCircle, label: t('topbar.help'),     onClick: () => window.open('mailto:support@niyanhireflow.com') },
      ]
    : [
        { icon: User,       label: t('topbar.edit_profile'),     onClick: () => navigate('/profile') },
        { icon: Building2,  label: t('topbar.company_settings'), onClick: () => navigate('/company-settings') },
        { icon: CreditCard, label: t('topbar.billing_plans'),    onClick: () => navigate('/upgrade-plan') },
        { icon: HelpCircle, label: t('topbar.help'),             onClick: () => window.open('mailto:support@niyanhireflow.com') },
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
            aria-label={t('topbar.menu_aria')}
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
          title={t('topbar.search_hint')}
        >
          <Search className="w-4 h-4 flex-shrink-0" />
          <span className="flex-1 text-left text-sm">{t('topbar.search_placeholder')}</span>
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
          aria-label={t('topbar.search_aria')}
        >
          <Search className="w-5 h-5" />
        </button>

        {/* Theme toggle — 3-way: Dark / Light / System */}
        <div className="relative" ref={themeRef}>
          <button
            onClick={() => setThemeOpen(o => !o)}
            className="relative p-2 rounded-lg transition-all duration-200"
            style={{ color: 'var(--text-muted)' }}
            title={t('topbar.theme_hint')}
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
                { mode: 'dark',   icon: Moon,    label: t('topbar.theme_dark') },
                { mode: 'light',  icon: Sun,     label: t('topbar.theme_light') },
                { mode: 'system', icon: Monitor, label: t('topbar.theme_system') },
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

        {/* Telephony call status (renders nothing when no active call / telephony disabled) */}
        <CallStatusWidget />

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
            <EmployeeAvatar
              name={user?.fullName || 'U'}
              photoUrl={employeePhotoUrl}
              size={32}
            />
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
                  {t('topbar.logout')}
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
