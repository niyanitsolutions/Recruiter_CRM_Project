/**
 * Employee Resources — single page with three tabs:
 *   Documents | Assets | Exit Management
 *
 * URL: /hrm/emp-resources?tab=documents|assets|exit
 * Old URLs /hrm/documents, /hrm/assets, /hrm/exit → redirect here.
 */
import React, { useState, useEffect } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { FolderOpen, Package, DoorOpen } from 'lucide-react'

// Lazy-load each tab content to keep initial bundle small
import DocumentVault   from './DocumentVault'
import AssetManagement from './AssetManagement'
import ExitManagement  from './ExitManagement'

const TABS = [
  { key: 'documents', label: 'Documents',       icon: FolderOpen, component: DocumentVault   },
  { key: 'assets',    label: 'Assets',           icon: Package,    component: AssetManagement },
  { key: 'exit',      label: 'Exit Management',  icon: DoorOpen,   component: ExitManagement  },
]

export default function EmpResources() {
  const [searchParams, setSearchParams] = useSearchParams()
  const rawTab = searchParams.get('tab') || 'documents'
  const activeKey = TABS.find(t => t.key === rawTab) ? rawTab : 'documents'

  const setTab = (key) => {
    setSearchParams({ tab: key }, { replace: true })
  }

  const ActiveComponent = TABS.find(t => t.key === activeKey)?.component || DocumentVault

  return (
    <div className="space-y-0">
      {/* Tab bar */}
      <div
        className="flex items-center gap-1 mb-6 p-1 rounded-2xl"
        style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-subtle)' }}
      >
        {TABS.map(tab => {
          const Icon = tab.icon
          const isActive = tab.key === activeKey
          return (
            <button
              key={tab.key}
              onClick={() => setTab(tab.key)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all flex-1 justify-center"
              style={isActive ? {
                background: 'var(--bg-card)',
                color: 'var(--text-heading)',
                boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
              } : {
                color: 'var(--text-muted)',
              }}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          )
        })}
      </div>

      {/* Active tab content */}
      <ActiveComponent />
    </div>
  )
}
