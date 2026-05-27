import React, { useState, useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { clsx } from 'clsx'
import { useSelector } from 'react-redux'
import { selectUser } from '../../store/authSlice'
import { usePermissions } from '../../hooks/usePermissions'
import SideNav from './SideNav'
import TopBar from './TopBar'
import GlobalSearch from '../common/GlobalSearch'
import AttendanceBanner from '../hrm/AttendanceBanner'
import AnnouncementPopup from '../hrm/AnnouncementPopup'

const Layout = ({ title, subtitle, actions }) => {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const user = useSelector(selectUser)
  const { has } = usePermissions()
  // Show for all non-partner internal users who have the attendance permission.
  // Do NOT gate on hrmEmployeeId — users without a linked employee profile will
  // see the banner via the 'awaiting_profile' flow; profile is auto-created on
  // first punch-in.  AttendanceBanner manages its own loading/visibility state.
  const showAttendanceBanner = user?.userType !== 'partner' && has('hrm:attendance:self')

  // Global Ctrl+K / Cmd+K shortcut
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-app)', minHeight: '100vh' }}>
      {/* Mobile overlay backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-30 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Side Navigation */}
      <SideNav
        isCollapsed={isCollapsed}
        onToggle={() => setIsCollapsed(!isCollapsed)}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      {/* Main Content — full width on mobile, offset on desktop */}
      <div
        className={clsx(
          'transition-[margin-left] duration-300',
          isCollapsed ? 'md:ml-20' : 'md:ml-64'
        )}
      >
        {/* Top Bar */}
        <TopBar
          title={title}
          subtitle={subtitle}
          actions={actions}
          onMobileToggle={() => setMobileOpen(true)}
          onSearchOpen={() => setSearchOpen(true)}
        />

        {/* Attendance Banner — only for employees linked to HRM */}
        {showAttendanceBanner && <AttendanceBanner />}

        {/* Page Content */}
        <main className="p-6">
          <Outlet />
        </main>
      </div>

      {/* Global Search overlay */}
      {searchOpen && <GlobalSearch onClose={() => setSearchOpen(false)} />}

      {/* Announcement popup — shown once per session for unread announcements */}
      <AnnouncementPopup />
    </div>
  )
}

export default Layout
