import React, { useState, useEffect, lazy, Suspense } from 'react'
import { Outlet } from 'react-router-dom'
import { clsx } from 'clsx'
import { useSelector } from 'react-redux'
import { selectIsSuperAdmin, selectIsSeller, selectTelephonyEnabled } from '../../store/authSlice'
import { usePermissions } from '../../hooks/usePermissions'
import SideNav from './SideNav'
import TopBar from './TopBar'
import GlobalSearch from '../common/GlobalSearch'
import AnnouncementPopup from '../hrm/AnnouncementPopup'
import SuperAnnouncementPopup from '../announcements/AnnouncementPopup'
import AnnouncementMarquee from '../announcements/AnnouncementMarquee'
// Small (state + fetch only, no heavy UI deps) — imported eagerly so it can
// wrap TopBar + Outlet + the floating widgets in one tree. Its own effects
// (capability/favorites/active-call fetch) only run once actually mounted,
// which only happens when `showTelephony` is true below.
import { TelephonyProvider } from '../../context/TelephonyContext'

// Lazy-loaded (heavier UI) so the telephony component bundle is never
// fetched for a tenant that doesn't have it enabled.
const SoftphoneWidget = lazy(() => import('../telephony/Softphone/SoftphoneWidget'))
const IncomingCallPopup = lazy(() => import('../telephony/IncomingCallPopup'))

const Layout = ({ title, subtitle, actions }) => {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const isSuperAdmin = useSelector(selectIsSuperAdmin)
  const isSeller     = useSelector(selectIsSeller)
  const telephonyEnabled = useSelector(selectTelephonyEnabled)
  const { has } = usePermissions()
  // Super-admin announcements only display for tenant company users
  const isTenantUser = !isSuperAdmin && !isSeller
  // Telephony UI (softphone/incoming popup) only for tenants with it enabled
  // AND a user permitted to view it — never for a disabled tenant or an
  // unpermitted user (no DOM, no network, no bundle fetch).
  const showTelephony = isTenantUser && telephonyEnabled && has('telephony:view')
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

  const body = (
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

        {/* Super-admin marquee ticker — only for tenant users */}
        {isTenantUser && <AnnouncementMarquee />}

        {/* Page Content — starts immediately below the header (attendance now lives in TopBar) */}
        <main className="p-6">
          <Outlet />
        </main>
      </div>

      {/* Global Search overlay */}
      {searchOpen && <GlobalSearch onClose={() => setSearchOpen(false)} />}

      {/* HRM announcement popup — shown once per session for unread HRM announcements */}
      <AnnouncementPopup />

      {/* Super-admin broadcast popup — shown for active popup-type announcements (tenant users only) */}
      {isTenantUser && <SuperAnnouncementPopup />}

      {/* Telephony Phase 2 floating UI — softphone + incoming-call popup.
          Lazy-loaded; TelephonyProvider (wrapping this whole tree, see
          below) is what actually gates whether these ever fetch/subscribe. */}
      {showTelephony && (
        <Suspense fallback={null}>
          <SoftphoneWidget />
          <IncomingCallPopup />
        </Suspense>
      )}
    </div>
  )

  // TelephonyProvider must wrap TopBar + <Outlet/> too (not just the floating
  // widgets) so CallStatusWidget (in TopBar) and any telephony page rendered
  // via <Outlet/> (e.g. /telephony) share the same capability/active-call
  // state instead of each re-fetching independently. Only mounted at all
  // when showTelephony is true — a disabled tenant renders `body` directly,
  // with zero telephony network calls, subscriptions, or DOM.
  return showTelephony ? <TelephonyProvider>{body}</TelephonyProvider> : body
}

export default Layout
