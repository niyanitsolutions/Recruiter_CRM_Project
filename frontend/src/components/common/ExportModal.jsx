/**
 * ExportModal — reusable export dialog for all CRM modules.
 *
 * Props:
 *   isOpen       boolean
 *   onClose      () => void
 *   title        string          e.g. "Export Candidates"
 *   apiPath      string          e.g. "/export/candidates"
 *   extraFilters ReactNode       module-specific filter fields (optional)
 *   defaultFilters object        initial filter values merged with base filters
 *   isSuperAdmin boolean         (reserved, all requests use same api instance)
 */
import { useState } from 'react'
import { X, Download, Loader2, FileText, FileSpreadsheet } from 'lucide-react'
import api from '../../services/api'
import { toast } from 'react-hot-toast'

const ExportModal = ({
  isOpen,
  onClose,
  title = 'Export',
  apiPath,
  extraFilters = null,
  defaultFilters = {},
  isSuperAdmin = false,
}) => {
  const today = new Date().toISOString().split('T')[0]

  const [format, setFormat] = useState('csv')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [extra, setExtra] = useState(defaultFilters)
  const [loading, setLoading] = useState(false)

  if (!isOpen) return null

  // Expose a setter for extra filters to parent via extraFilters render prop pattern
  const setExtraField = (key, val) => setExtra(prev => ({ ...prev, [key]: val }))

  const handleExport = async () => {
    setLoading(true)
    try {
      const params = { format }
      if (fromDate)  params.from_date = fromDate
      if (toDate)    params.to_date   = toDate
      if (search)    params.search    = search
      if (status)    params.status    = status
      // Merge module-specific filters
      Object.entries(extra).forEach(([k, v]) => { if (v) params[k] = v })

      const axiosInstance = api
      const response = await axiosInstance.get(apiPath, {
        params,
        responseType: 'blob',
      })

      // Derive filename from Content-Disposition header or build default
      const disposition = response.headers['content-disposition'] || ''
      const match = disposition.match(/filename="?([^";\n]+)"?/)
      const module = apiPath.split('/').pop()
      const filename = match ? match[1] : `${module}_${today}.${format}`

      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', filename)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)

      toast.success('Export downloaded successfully')
      onClose()
    } catch (err) {
      const msg = err.response?.data?.detail || 'Export failed. Please try again.'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />

      {/* Dialog */}
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-200">
          <div className="flex items-center gap-2">
            <Download className="w-5 h-5 text-primary-600" />
            <h2 className="text-lg font-semibold text-surface-900">{title}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-surface-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-surface-500" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          {/* Format */}
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-2">
              Export Format
            </label>
            <div className="grid grid-cols-2 gap-3">
              {[
                { value: 'csv', label: 'CSV', Icon: FileSpreadsheet, desc: 'Spreadsheet compatible' },
                { value: 'pdf', label: 'PDF', Icon: FileText, desc: 'Printable report' },
              ].map(({ value, label, Icon, desc }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFormat(value)}
                  className={`flex items-center gap-3 p-3 rounded-lg border-2 transition-all text-left ${
                    format === value
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-surface-200 hover:border-surface-300'
                  }`}
                >
                  <Icon className={`w-5 h-5 flex-shrink-0 ${format === value ? 'text-primary-600' : 'text-surface-400'}`} />
                  <div>
                    <p className={`text-sm font-medium ${format === value ? 'text-primary-700' : 'text-surface-700'}`}>
                      {label}
                    </p>
                    <p className="text-xs text-surface-400">{desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Date Range */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                From Date
              </label>
              <input
                type="date"
                value={fromDate}
                onChange={e => setFromDate(e.target.value)}
                max={toDate || today}
                className="input w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">
                To Date
              </label>
              <input
                type="date"
                value={toDate}
                onChange={e => setToDate(e.target.value)}
                min={fromDate}
                max={today}
                className="input w-full"
              />
            </div>
          </div>

          {/* Search */}
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">
              Search
            </label>
            <input
              type="text"
              placeholder="Filter by name, email, title…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="input w-full"
            />
          </div>

          {/* Module-specific extra filters injected by parent */}
          {extraFilters && extraFilters({ extra, setExtraField, status, setStatus })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-surface-200 bg-surface-50">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm text-surface-700 hover:bg-surface-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={loading}
            className="px-5 py-2 text-sm font-medium bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            {loading ? 'Exporting…' : `Export ${format.toUpperCase()}`}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ExportModal
