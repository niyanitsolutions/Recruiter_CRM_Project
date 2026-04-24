import React, { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { clsx } from 'clsx'
import SideNav from './SideNav'
import TopBar from './TopBar'

const Layout = ({ title, subtitle, actions }) => {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-app)' }}>
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
          'transition-all duration-300',
          isCollapsed ? 'md:ml-20' : 'md:ml-64'
        )}
      >
        {/* Top Bar */}
        <TopBar
          title={title}
          subtitle={subtitle}
          actions={actions}
          onMobileToggle={() => setMobileOpen(true)}
        />

        {/* Page Content */}
        <main className="p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export default Layout