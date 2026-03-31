import React, { useState, useRef, useEffect } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { useNavigate } from 'react-router-dom'
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
} from 'lucide-react'
import { logoutUser, selectUser, selectIsSuperAdmin } from '../../store/authSlice'

const TopBar = ({ title, subtitle, actions }) => {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const user = useSelector(selectUser)
  const isSuperAdmin = useSelector(selectIsSuperAdmin)
  
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false)
  const profileRef = useRef(null)
  const notificationsRef = useRef(null)

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
        { icon: User, label: 'Profile', onClick: () => navigate('/super-admin/profile') },
        { icon: Settings, label: 'Settings', onClick: () => navigate('/super-admin/settings') },
        { icon: HelpCircle, label: 'Help', onClick: () => window.open('mailto:support@example.com') },
      ]
    : [
        { icon: User, label: 'Edit Profile', onClick: () => navigate('/profile') },
        { icon: Building2, label: 'Company Settings', onClick: () => navigate('/company-settings') },
        { icon: CreditCard, label: 'Billing & Plans', onClick: () => navigate('/upgrade-plan') },
        { icon: HelpCircle, label: 'Help', onClick: () => window.open('mailto:support@example.com') },
      ]

  return (
    <header className="h-16 bg-white border-b border-surface-200 flex items-center justify-between px-6 sticky top-0 z-30">
      <div>
        {title && <h1 className="text-xl font-semibold text-surface-900">{title}</h1>}
        {subtitle && <p className="text-sm text-surface-500">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-4">
        {actions && <div className="flex items-center gap-2">{actions}</div>}

        <div className="relative hidden md:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
          <input
            type="text"
            placeholder="Search..."
            className="w-64 pl-10 pr-4 py-2 text-sm bg-surface-50 border border-surface-200 rounded-lg focus:outline-none focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20 transition-all"
          />
        </div>

        <div className="relative" ref={notificationsRef}>
          <button
            onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
            className="relative p-2 text-surface-500 hover:text-surface-700 hover:bg-surface-100 rounded-lg transition-colors"
          >
            <Bell className="w-5 h-5" />
            <span className="absolute top-1 right-1 w-2 h-2 bg-danger-500 rounded-full" />
          </button>

          {isNotificationsOpen && (
            <div className="dropdown right-0 w-80 animate-slide-up">
              <div className="px-4 py-3 border-b border-surface-100">
                <h3 className="font-semibold text-surface-900">Notifications</h3>
              </div>
              <div className="px-4 py-8 text-center text-sm text-surface-400">
                No new notifications
              </div>
              <div className="px-4 py-2 border-t border-surface-100">
                <button
                  className="text-sm text-accent-600 hover:text-accent-700 font-medium"
                  onClick={() => { setIsNotificationsOpen(false); navigate('/notifications') }}
                >
                  View all notifications
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="relative" ref={profileRef}>
          <button
            onClick={() => setIsProfileOpen(!isProfileOpen)}
            className="flex items-center gap-3 p-1.5 hover:bg-surface-100 rounded-lg transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-accent-400 to-accent-600 flex items-center justify-center text-white font-semibold text-sm">
              {user?.fullName?.charAt(0) || 'U'}
            </div>
            <div className="hidden md:block text-left">
              <p className="text-sm font-medium text-surface-900">{user?.fullName || 'User'}</p>
              <p className="text-xs text-surface-500 capitalize">
                {isSuperAdmin ? 'Super Admin' : user?.role?.replace('_', ' ')}
              </p>
            </div>
            <ChevronDown className={clsx(
              'w-4 h-4 text-surface-400 transition-transform hidden md:block',
              isProfileOpen && 'rotate-180'
            )} />
          </button>

          {isProfileOpen && (
            <div className="dropdown right-0 animate-slide-up">
              <div className="px-4 py-3 border-b border-surface-100">
                <p className="text-sm font-medium text-surface-900">{user?.fullName}</p>
                <p className="text-xs text-surface-500">{user?.email}</p>
                {user?.companyName && (
                  <p className="text-xs text-accent-600 mt-1">{user.companyName}</p>
                )}
              </div>
              <div className="py-1">
                {profileMenuItems.map((item, index) => (
                  <button
                    key={index}
                    onClick={() => {
                      item.onClick()
                      setIsProfileOpen(false)
                    }}
                    className="dropdown-item flex items-center gap-3"
                  >
                    <item.icon className="w-4 h-4 text-surface-400" />
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="border-t border-surface-100 py-1">
                <button
                  onClick={handleLogout}
                  className="dropdown-item flex items-center gap-3 text-danger-600 hover:bg-danger-50"
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