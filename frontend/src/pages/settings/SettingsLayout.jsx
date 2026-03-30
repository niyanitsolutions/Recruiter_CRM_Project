import { useNavigate } from 'react-router-dom'
import { ChevronRight, Settings, Loader2, Save } from 'lucide-react'

// ── Shared layout primitives used by every settings sub-page ─────────────────

export const Breadcrumb = ({ page }) => {
  const navigate = useNavigate()
  return (
    <nav className="flex items-center gap-1.5 text-sm text-surface-500 mb-6">
      <button
        onClick={() => navigate('/settings')}
        className="flex items-center gap-1 hover:text-surface-800 transition-colors"
      >
        <Settings className="w-3.5 h-3.5" />
        Settings
      </button>
      <ChevronRight className="w-3.5 h-3.5" />
      <span className="text-surface-800 font-medium">{page}</span>
    </nav>
  )
}

export const PageHeader = ({ title, description }) => (
  <div className="mb-6">
    <h1 className="text-xl font-bold text-surface-900">{title}</h1>
    {description && <p className="text-surface-500 mt-1 text-sm">{description}</p>}
  </div>
)

export const SectionCard = ({ title, icon: Icon, children, className = '' }) => (
  <div className={`bg-white rounded-xl shadow-sm border border-surface-100 ${className}`}>
    {title && (
      <div className="flex items-center gap-3 px-6 py-4 border-b border-surface-100">
        {Icon && (
          <div className="p-2 bg-accent-50 rounded-lg">
            <Icon className="w-5 h-5 text-accent-600" />
          </div>
        )}
        <h2 className="text-base font-semibold text-surface-900">{title}</h2>
      </div>
    )}
    <div className="p-6">{children}</div>
  </div>
)

export const Field = ({ label, children, hint, required }) => (
  <div>
    <label className="block text-sm font-medium text-surface-700 mb-1">
      {label}
      {required && <span className="text-danger-500 ml-0.5">*</span>}
    </label>
    {children}
    {hint && <p className="mt-1 text-xs text-surface-400">{hint}</p>}
  </div>
)

export const Input = ({ className = '', ...props }) => (
  <input
    {...props}
    className={`w-full px-3 py-2 text-sm border border-surface-200 rounded-lg
               focus:outline-none focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500
               disabled:bg-surface-50 disabled:text-surface-400 transition-colors ${className}`}
  />
)

export const Textarea = ({ className = '', ...props }) => (
  <textarea
    {...props}
    className={`w-full px-3 py-2 text-sm border border-surface-200 rounded-lg
               focus:outline-none focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500
               disabled:bg-surface-50 disabled:text-surface-400 transition-colors resize-y ${className}`}
  />
)

export const SelectField = ({ children, className = '', ...props }) => (
  <select
    {...props}
    className={`w-full px-3 py-2 text-sm border border-surface-200 rounded-lg bg-white
               focus:outline-none focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500 transition-colors ${className}`}
  >
    {children}
  </select>
)

export const SaveBtn = ({ saving, onClick, label = 'Save Changes', className = '' }) => (
  <button
    onClick={onClick}
    disabled={saving}
    className={`inline-flex items-center gap-2 px-4 py-2 bg-accent-600 text-white text-sm
               font-medium rounded-lg hover:bg-accent-700 disabled:opacity-60 transition-colors ${className}`}
  >
    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
    {saving ? 'Saving…' : label}
  </button>
)

export const CancelBtn = ({ onClick }) => {
  const navigate = useNavigate()
  return (
    <button
      onClick={onClick || (() => navigate('/settings'))}
      className="px-4 py-2 text-sm font-medium text-surface-600 bg-white border border-surface-200
                 rounded-lg hover:bg-surface-50 transition-colors"
    >
      Cancel
    </button>
  )
}

export const Toggle = ({ checked, onChange, label, description }) => (
  <div className="flex items-center justify-between py-3">
    <div>
      <p className="text-sm font-medium text-surface-800">{label}</p>
      {description && <p className="text-xs text-surface-500 mt-0.5">{description}</p>}
    </div>
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none
                  ${checked ? 'bg-accent-600' : 'bg-surface-300'}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform
                    ${checked ? 'translate-x-6' : 'translate-x-1'}`}
      />
    </button>
  </div>
)

export const SkeletonLoader = () => (
  <div className="animate-pulse space-y-4">
    <div className="h-8 bg-surface-200 rounded w-56" />
    <div className="h-6 bg-surface-100 rounded w-80" />
    <div className="h-64 bg-surface-100 rounded-xl" />
  </div>
)

export const ActionBar = ({ saving, onSave, onCancel, saveLabel }) => (
  <div className="flex items-center justify-end gap-3 pt-4 border-t border-surface-100 mt-6">
    <CancelBtn onClick={onCancel} />
    <SaveBtn saving={saving} onClick={onSave} label={saveLabel} />
  </div>
)
