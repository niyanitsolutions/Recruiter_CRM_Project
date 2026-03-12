import React, { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { clsx } from 'clsx'
import SideNav from './SideNav'
import TopBar from './TopBar'

const Layout = ({ title, subtitle, actions }) => {
  const [isCollapsed, setIsCollapsed] = useState(false)

  return (
    <div className="min-h-screen bg-surface-50">
      {/* Side Navigation */}
      <SideNav
        isCollapsed={isCollapsed}
        onToggle={() => setIsCollapsed(!isCollapsed)}
      />

      {/* Main Content */}
      <div
        className={clsx(
          'transition-all duration-300',
          isCollapsed ? 'ml-20' : 'ml-64'
        )}
      >
        {/* Top Bar */}
        <TopBar title={title} subtitle={subtitle} actions={actions} />

        {/* Page Content */}
        <main className="p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export default Layout