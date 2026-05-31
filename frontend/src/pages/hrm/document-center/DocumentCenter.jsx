import { useState, useEffect, Suspense, lazy } from 'react'
import { useNavigate, useLocation, Routes, Route, Navigate } from 'react-router-dom'
import {
  Upload, FileText, Wand2, Layout, BookOpen, FolderOpen,
  History, CheckSquare, Archive, ChevronRight, Star, Plus,
} from 'lucide-react'
import { clsx } from 'clsx'

// Sub-pages (lazy loaded)
const ImportDocuments  = lazy(() => import('./ImportDocuments'))
const TemplateBuilder  = lazy(() => import('./TemplateBuilder'))
const AdvancedDesigner = lazy(() => import('./AdvancedDesigner'))
const GeneratedDocuments = lazy(() => import('./GeneratedDocuments'))
const TemplateLibrary  = lazy(() => import('./TemplateLibrary'))
const Categories       = lazy(() => import('./Categories'))
const VersionHistory   = lazy(() => import('./VersionHistory'))
const Approvals        = lazy(() => import('./Approvals'))
const ArchivePage      = lazy(() => import('./ArchivePage'))

const NAV_ITEMS = [
  { key: 'library',    label: 'Template Library',    icon: BookOpen,    path: 'library',    desc: 'Pre-built HR document templates' },
  { key: 'import',     label: 'Import Documents',    icon: Upload,      path: 'import',     desc: 'Import DOCX, PDF, or HTML files' },
  { key: 'builder',    label: 'Template Builder',    icon: FileText,    path: 'builder',    desc: 'Simple rich-text template editor' },
  { key: 'designer',   label: 'Advanced Designer',   icon: Layout,      path: 'designer',   desc: 'Drag-drop canvas designer' },
  { key: 'generated',  label: 'Generated Documents', icon: CheckSquare, path: 'generated',  desc: 'All generated & sent documents' },
  { key: 'categories', label: 'Categories',          icon: FolderOpen,  path: 'categories', desc: 'Manage template categories' },
  { key: 'history',    label: 'Version History',     icon: History,     path: 'history',    desc: 'All template version snapshots' },
  { key: 'approvals',  label: 'Approvals',           icon: Star,        path: 'approvals',  desc: 'Pending review & approval queue' },
  { key: 'archive',    label: 'Archive',             icon: Archive,     path: 'archive',    desc: 'Archived templates' },
]

const Spinner = () => (
  <div className="flex items-center justify-center h-64">
    <div className="w-8 h-8 border-4 border-violet-600 border-t-transparent rounded-full animate-spin" />
  </div>
)

export default function DocumentCenter() {
  const navigate  = useNavigate()
  const location  = useLocation()
  const [collapsed, setCollapsed] = useState(false)

  // Derive active key from URL
  const segments   = location.pathname.split('/')
  const activeKey  = segments[segments.indexOf('doc-center') + 1] || 'library'

  const goto = (path) => navigate(`/hrm/doc-center/${path}`)

  return (
    <div className="flex h-full min-h-[calc(100vh-68px)]" style={{ background: 'var(--bg-primary)' }}>

      {/* ── Left sub-navigation ── */}
      <aside
        className="flex-shrink-0 flex flex-col border-r transition-all duration-200"
        style={{
          width: collapsed ? 56 : 220,
          background: 'var(--bg-secondary)',
          borderColor: 'var(--border)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-3 py-4 border-b"
          style={{ borderColor: 'var(--border)' }}
        >
          {!collapsed && (
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              Document Center
            </span>
          )}
          <button
            onClick={() => setCollapsed(c => !c)}
            className="p-1 rounded-md hover:bg-violet-100 dark:hover:bg-violet-900/30 transition-colors ml-auto"
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            <ChevronRight
              className="w-4 h-4 transition-transform"
              style={{ color: 'var(--text-muted)', transform: collapsed ? 'rotate(0deg)' : 'rotate(180deg)' }}
            />
          </button>
        </div>

        {/* Quick create button */}
        {!collapsed && (
          <div className="px-3 pt-3">
            <button
              onClick={() => goto('builder')}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-white transition-all"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}
            >
              <Plus className="w-4 h-4 flex-shrink-0" />
              New Template
            </button>
          </div>
        )}

        {/* Nav items */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const isActive = activeKey === item.key || activeKey?.startsWith(item.key)
            return (
              <button
                key={item.key}
                onClick={() => goto(item.path)}
                title={collapsed ? item.label : undefined}
                className={clsx(
                  'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-all text-left',
                  isActive
                    ? 'bg-violet-600 text-white'
                    : 'hover:bg-violet-50 dark:hover:bg-violet-900/20',
                )}
                style={isActive ? {} : { color: 'var(--text-body)' }}
              >
                <item.icon className="w-4 h-4 flex-shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </button>
            )
          })}
        </nav>
      </aside>

      {/* ── Right content area ── */}
      <main className="flex-1 overflow-auto">
        <Suspense fallback={<Spinner />}>
          <Routes>
            <Route index element={<Navigate to="library" replace />} />
            <Route path="library"    element={<TemplateLibrary />} />
            <Route path="import"     element={<ImportDocuments />} />
            <Route path="builder"    element={<TemplateBuilder />} />
            <Route path="builder/:id" element={<TemplateBuilder />} />
            <Route path="designer"   element={<AdvancedDesigner />} />
            <Route path="designer/:id" element={<AdvancedDesigner />} />
            <Route path="generated"  element={<GeneratedDocuments />} />
            <Route path="categories" element={<Categories />} />
            <Route path="history"    element={<VersionHistory />} />
            <Route path="approvals"  element={<Approvals />} />
            <Route path="archive"    element={<ArchivePage />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  )
}
