import { Suspense, lazy, useState } from 'react'
import { useNavigate, useLocation, Routes, Route, Navigate } from 'react-router-dom'
import { Plus, FileText, CheckSquare, Archive as ArchiveIcon, LayoutTemplate, FolderOpen, History, ChevronLeft, ChevronRight } from 'lucide-react'
import { clsx } from 'clsx'

const NewTemplatePage    = lazy(() => import('./NewTemplatePage'))
const ImportEditor       = lazy(() => import('./ImportEditor'))
const QuickBuilder       = lazy(() => import('./QuickBuilder'))
const AdvancedDesigner   = lazy(() => import('./AdvancedDesigner'))
const Templates          = lazy(() => import('./Templates'))
const GeneratedDocuments = lazy(() => import('./GeneratedDocuments'))
const Approvals          = lazy(() => import('./Approvals'))
const Archive            = lazy(() => import('./Archive'))
const Categories         = lazy(() => import('./Categories'))
const VersionHistory     = lazy(() => import('./VersionHistory'))

const NAV_ITEMS = [
  { key: 'templates',  label: 'Templates',           icon: LayoutTemplate, path: 'templates' },
  { key: 'generated',  label: 'Generated Documents',  icon: FileText,       path: 'generated' },
  { key: 'categories', label: 'Categories',           icon: FolderOpen,     path: 'categories' },
  { key: 'approvals',  label: 'Approvals',            icon: CheckSquare,    path: 'approvals' },
  { key: 'versions',   label: 'Version History',      icon: History,        path: 'versions' },
  { key: 'archive',    label: 'Archive',              icon: ArchiveIcon,    path: 'archive' },
]

const Spinner = () => (
  <div className="flex items-center justify-center h-64">
    <div className="w-8 h-8 border-4 border-violet-600 border-t-transparent rounded-full animate-spin" />
  </div>
)

export default function DocumentCenter() {
  const navigate   = useNavigate()
  const location   = useLocation()
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('dc_sidebar_collapsed') === 'true')

  const segments  = location.pathname.split('/')
  const dcIndex   = segments.indexOf('doc-center')
  const activeKey = segments[dcIndex + 1] || 'templates'

  const goto   = (path) => navigate(`/hrm/doc-center/${path}`)
  const toggle = () => setCollapsed(v => {
    const next = !v
    localStorage.setItem('dc_sidebar_collapsed', next)
    return next
  })

  // Builder routes need full-height, overflow-hidden layout
  const isBuilder = ['quick', 'advanced', 'import'].includes(activeKey)

  return (
    <div
      className="flex"
      style={{
        background: 'var(--bg-primary)',
        ...(isBuilder
          ? {
              // Break out of Layout's p-6 (24px) padding to own the full viewport below TopBar (h-16=64px)
              height:      'calc(100vh - 64px)',
              marginTop:   '-24px',
              marginLeft:  '-24px',
              marginRight: '-24px',
              width:       'calc(100% + 48px)',
              overflow:    'hidden',
            }
          : { minHeight: 'calc(100vh - 68px)' }),
      }}
    >

      {/* ── Left sidebar ── */}
      <aside
        className="flex-shrink-0 flex flex-col border-r transition-all duration-200 relative"
        style={{ width: collapsed ? 56 : 220, background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
      >
        {/* Header */}
        <div
          className="border-b flex items-center"
          style={{ borderColor: 'var(--border)', padding: collapsed ? '12px 8px' : '16px 16px 12px' }}
        >
          {!collapsed && (
            <p className="text-xs font-semibold uppercase tracking-wider flex-1 truncate" style={{ color: 'var(--text-muted)' }}>
              Doc Center
            </p>
          )}
          {!collapsed && (
            <button
              onClick={() => goto('new')}
              title="New Template"
              className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-white transition-all hover:opacity-90"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}
            >
              <Plus className="w-3.5 h-3.5" />
              New
            </button>
          )}
          {collapsed && (
            <button
              onClick={() => goto('new')}
              title="New Template"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-white transition-all hover:opacity-90 mx-auto"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}
            >
              <Plus className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 space-y-0.5" style={{ padding: collapsed ? '12px 6px' : '12px 8px' }}>
          {NAV_ITEMS.map((item) => {
            const isActive = activeKey === item.key
            return (
              <button
                key={item.key}
                onClick={() => goto(item.path)}
                title={collapsed ? item.label : undefined}
                className={clsx(
                  'w-full flex items-center rounded-lg text-sm transition-all',
                  collapsed ? 'justify-center px-0 py-2.5' : 'gap-2.5 px-3 py-2.5 text-left',
                  isActive
                    ? 'bg-violet-600 text-white font-medium'
                    : 'hover:bg-violet-50 dark:hover:bg-violet-900/20 font-normal',
                )}
                style={isActive ? {} : { color: 'var(--text-body)' }}
              >
                <item.icon className="w-4 h-4 flex-shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </button>
            )
          })}
        </nav>

        {/* Collapse toggle — matches main HireFlow sidebar style */}
        <button
          onClick={toggle}
          className="absolute -right-3 top-20 w-6 h-6 rounded-full flex items-center justify-center z-10 shadow-lg transition-all duration-200"
          style={{
            background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
            border: '1px solid rgba(124,58,237,0.4)',
            boxShadow: '0 0 10px rgba(124,58,237,0.4)',
          }}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed
            ? <ChevronRight className="w-3 h-3 text-white" />
            : <ChevronLeft className="w-3 h-3 text-white" />
          }
        </button>
      </aside>

      {/* ── Right content ── */}
      <main className={`flex-1 ${isBuilder ? 'overflow-hidden flex flex-col' : 'overflow-auto'}`}>
        <Suspense fallback={<Spinner />}>
          <Routes>
            <Route index element={<Navigate to="templates" replace />} />
            <Route path="templates"           element={<Templates />} />
            <Route path="new"                 element={<NewTemplatePage />} />
            <Route path="import"              element={<ImportEditor />} />
            <Route path="import/:id"          element={<ImportEditor />} />
            <Route path="quick"               element={<QuickBuilder />} />
            <Route path="quick/:id"           element={<QuickBuilder />} />
            <Route path="advanced"            element={<AdvancedDesigner />} />
            <Route path="advanced/:id"        element={<AdvancedDesigner />} />
            <Route path="generated"           element={<GeneratedDocuments />} />
            <Route path="categories"          element={<Categories />} />
            <Route path="approvals"           element={<Approvals />} />
            <Route path="versions"            element={<VersionHistory />} />
            <Route path="archive"             element={<Archive />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  )
}
