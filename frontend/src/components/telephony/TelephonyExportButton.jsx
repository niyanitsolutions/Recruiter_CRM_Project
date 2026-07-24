import { useState, useRef, useEffect } from 'react'
import { Download, Loader2, FileSpreadsheet, FileText, Table2 } from 'lucide-react'
import toast from 'react-hot-toast'
import telephonyService from '../../services/telephonyService'

const FORMATS = {
  calls: [
    { key: 'csv', label: 'CSV', Icon: Table2 },
    { key: 'pdf', label: 'PDF', Icon: FileText },
    { key: 'xlsx', label: 'Excel', Icon: FileSpreadsheet },
  ],
  agent_performance: [
    { key: 'csv', label: 'CSV', Icon: Table2 },
    { key: 'pdf', label: 'PDF', Icon: FileText },
  ],
}

function downloadBlob(response, fallbackName) {
  const disposition = response.headers?.['content-disposition'] || ''
  const match = disposition.match(/filename="?([^";\n]+)"?/)
  const filename = match ? match[1] : fallbackName
  const url = window.URL.createObjectURL(new Blob([response.data]))
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', filename)
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}

/**
 * Self-contained CSV/PDF/Excel export trigger for telephony data. Calls the
 * Phase 4 backend export endpoints directly instead of the shared
 * ExportModal.jsx (which only supports CSV/PDF and is used by 8 other
 * pages) — keeps this additive and risk-free to those pages.
 */
export default function TelephonyExportButton({ type = 'calls', filters = {}, label = 'Export' }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(null)
  const ref = useRef(null)

  useEffect(() => {
    const onClickOutside = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const run = async (fmt) => {
    setBusy(fmt)
    try {
      let res
      if (type === 'calls') {
        res = fmt === 'xlsx'
          ? await telephonyService.exportCallsExcel(filters)
          : await telephonyService.exportCalls(fmt, filters)
      } else {
        res = await telephonyService.exportAgentPerformance(fmt)
      }
      downloadBlob(res, `telephony_${type}.${fmt}`)
      toast.success('Export downloaded successfully')
      setOpen(false)
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Export failed. Please try again.')
    } finally {
      setBusy(null)
    }
  }

  const formats = FORMATS[type] || FORMATS.calls

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-100 hover:bg-surface-200 text-surface-700 text-xs font-medium"
      >
        <Download className="w-3.5 h-3.5" /> {label}
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-36 bg-white rounded-lg border border-surface-200 shadow-lg z-20 overflow-hidden">
          {formats.map(f => (
            <button
              key={f.key}
              type="button"
              disabled={busy !== null}
              onClick={() => run(f.key)}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-surface-700 hover:bg-surface-50 disabled:opacity-50"
            >
              {busy === f.key ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <f.Icon className="w-3.5 h-3.5" />}
              {f.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
