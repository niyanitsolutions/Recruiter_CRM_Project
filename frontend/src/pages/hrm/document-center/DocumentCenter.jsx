import { Suspense, lazy } from 'react'
import { useNavigate, useLocation, Routes, Route, Navigate } from 'react-router-dom'
import { Plus, FileText, CheckSquare, Archive, Clock, LayoutTemplate } from 'lucide-react'
import { clsx } from 'clsx'

const NewTemplatePage    = lazy(() => import('./NewTemplatePage'))
const ImportEditor       = lazy(() => import('./ImportEditor'))
const QuickBuilder       = lazy(() => import('./QuickBuilder'))
const AdvancedDesigner   = lazy(() => import('./AdvancedDesigner'))
const Templates          = lazy(() => import('./Templates'))
const GeneratedDocuments = lazy(() => import('./GeneratedDocuments'))
const Approvals          = lazy(() => import('./Approvals'))
const Archive            = lazy(() => import('./Archive'))

const NAV_ITEMS = [
  { key: 'templates',  label: 'Templates',           icon: LayoutTemplate, path: 'templates' },
  { key: 'generated',  label: 'Generated Documents',  icon: FileText,       path: 'generated' },
  { key: 'approvals',  label: 'Approvals',            icon: CheckSquare,    path: 'approvals' },
  { key: 'archive',    label: 'Archive',              icon: Archive,        path: 'archive' },
]

const Spinner = () => (
  <div className="flex items-center justify-center h-64">
    <div className="w-8 h-8 border-4 border-violet-600 border-t-transparent rounded-full animate-spin" />
  </div>
)

export default function DocumentCenter() {
  const navigate = useNavigate()
  const location = useLocation()

  const segments  = location.pathname.split('/')
  const dcIndex   = segments.indexOf('doc-center')
  const activeKey = segments[dcIndex + 1] || 'templates'

  const goto = (path) => navigate(`/hrm/doc-center/${path}`)

  return (
    <div className="flex h-full min-h-[calc(100vh-68px)]" style={{ background: 'var(--bg-primary)' }}>

      {/* ── Left sidebar ── */}
      <aside
        className="flex-shrink-0 flex flex-col border-r"
        style={{ width: 220, background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
      >
        {/* Header */}
        <div className="px-4 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
            Document Center
          </p>
          <button
            onClick={() => goto('new')}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}
          >
            <Plus className="w-4 h-4" />
            New Template
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const isActive = activeKey === item.key
            return (
              <button
                key={item.key}
                onClick={() => goto(item.path)}
                className={clsx(
                  'w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-all text-left',
                  isActive
                    ? 'bg-violet-600 text-white font-medium'
                    : 'hover:bg-violet-50 dark:hover:bg-violet-900/20 font-normal',
                )}
                style={isActive ? {} : { color: 'var(--text-body)' }}
              >
                <item.icon className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            )
          })}
        </nav>
      </aside>

      {/* ── Right content ── */}
      <main className="flex-1 overflow-auto">
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
            <Route path="approvals"           element={<Approvals />} />
            <Route path="archive"             element={<Archive />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  )
}
