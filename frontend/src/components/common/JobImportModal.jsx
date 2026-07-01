import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, ArrowDownToLine, FileDown, AlertCircle, CheckCircle, ChevronRight, SkipForward } from 'lucide-react'
import { toast } from 'react-hot-toast'
import jobService from '../../services/jobService'

const ACCEPTED = '.csv,.xlsx,.xls'

// ── Sample CSV template ───────────────────────────────────────────────────────

const JOB_HEADERS = [
  'title',
  'client_name (Must Match Existing Client)',
  'job_type (full_time / part_time / contract / internship)',
  'work_mode (onsite / remote / hybrid)',
  'status (draft / open / on_hold / filled / closed)',
  'priority (low / medium / high / critical)',
  'city',
  'state',
  'country',
  'salary_min (Annual ₹ - Number Only)',
  'salary_max (Annual ₹ - Number Only)',
  'currency (INR / USD / EUR)',
  'experience_min (Years - Number Only)',
  'experience_max (Years - Number Only)',
  'total_positions (Number Only)',
  'mandatory_skills (Comma Separated)',
  'optional_skills (Comma Separated)',
  'gender_eligibility (all / male / female)',
  'max_current_ctc (Annual ₹ - Number Only)',
  'max_notice_period (Days - Number Only)',
  'minimum_match_score (0-100 - Number Only)',
  'tags (Comma Separated)',
  'description',
  'requirements',
  'internal_notes',
]

const JOB_SAMPLE_ROW = [
  'Software Engineer',
  'Acme Corp',
  'full_time',
  'hybrid',
  'open',
  'high',
  'Mumbai',
  'Maharashtra',
  'India',
  '800000',
  '1500000',
  'INR',
  '3',
  '8',
  '2',
  'Python, Django',
  'React, Docker',
  'all',
  '2000000',
  '30',
  '70',
  'senior, backend',
  'Looking for a skilled software engineer with strong backend experience',
  '',
  'Immediate joiners preferred',
]

const toCsvRow = (fields) =>
  fields.map((f) => {
    const s = String(f ?? '')
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s
  }).join(',')

const downloadJobSample = () => {
  const csv = '﻿' + toCsvRow(JOB_HEADERS) + '\n' + toCsvRow(JOB_SAMPLE_ROW) + '\n'
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'Job_Sample.csv'
  a.click()
  URL.revokeObjectURL(url)
}

// ─────────────────────────────────────────────────────────────────────────────

const JobImportModal = ({ onClose, onImported }) => {
  const fileRef = useRef(null)
  const [step, setStep] = useState('select')
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState(null)
  const [results, setResults] = useState(null)
  const [elapsed, setElapsed] = useState(0)

  // Elapsed-time counter while import is running
  useEffect(() => {
    if (!loading) { setElapsed(0); return }
    const t = setInterval(() => setElapsed((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [loading])

  const handleFileChange = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    const ext = f.name.split('.').pop().toLowerCase()
    if (!['csv', 'xlsx', 'xls'].includes(ext)) {
      toast.error('Only .csv, .xlsx, or .xls files are supported.')
      e.target.value = ''
      return
    }
    setFile(f)
  }

  const handlePreview = async () => {
    if (!file) return
    setLoading(true)
    try {
      const data = await jobService.bulkImportPreview(file)
      setPreview(data)
      setStep('preview')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to parse file.')
    } finally {
      setLoading(false)
    }
  }

  const handleImport = async () => {
    if (!file) return
    setLoading(true)
    try {
      const data = await jobService.bulkImport(file)
      setResults(data)
      setStep('results')
      if (data.inserted > 0) {
        toast.success(`Successfully imported ${data.inserted} job${data.inserted !== 1 ? 's' : ''}.`)
        onImported?.()
      } else if (data.duplicates > 0 && data.failed === 0) {
        toast.success(`All ${data.duplicates} job${data.duplicates !== 1 ? 's' : ''} already exist — no duplicates created.`)
      } else if (data.duplicates > 0) {
        toast.success('Import complete.')
      }
    } catch (err) {
      const detail = err.response?.data?.detail
      toast.error(
        typeof detail === 'string' ? detail :
        err.code === 'ECONNABORTED' ? 'Import timed out — the file may be too large. Try a smaller batch.' :
        'Import failed. Please try again.'
      )
    } finally {
      setLoading(false)
    }
  }

  const rowBg = (row) => row.errors?.length ? 'bg-red-50' : ''

  const rowBadge = (row) => {
    if (row.errors?.length)
      return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">{row.errors.join(', ')}</span>
    return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Valid</span>
  }

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const resultIcon = results
    ? results.inserted > 0
      ? <CheckCircle className="w-14 h-14 text-green-500" />
      : results.failed > 0 && results.inserted === 0 && (results.duplicates ?? 0) === 0
        ? <AlertCircle className="w-14 h-14 text-red-500" />
        : <CheckCircle className="w-14 h-14 text-yellow-500" />
    : null

  return createPortal(
    <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-surface-200 shrink-0">
          <div>
            <h3 className="text-lg font-semibold text-surface-900">Import Jobs</h3>
            <p className="text-sm text-surface-500 mt-0.5">
              {step === 'select' && 'Upload a .csv, .xlsx, or .xls file'}
              {step === 'preview' && `${preview?.total ?? 0} rows parsed — ${preview?.valid ?? 0} valid`}
              {step === 'results' && 'Import complete'}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-surface-100 rounded-lg transition-colors">
            <X className="w-5 h-5 text-surface-500" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">

          {/* ── Step 1: File select ─────────────────────────────────────── */}
          {step === 'select' && (
            <div className="flex flex-col items-center justify-center py-10 gap-4">
              <div
                onClick={() => fileRef.current?.click()}
                className="w-full max-w-md border-2 border-dashed border-surface-300 rounded-xl p-8 text-center cursor-pointer hover:border-primary-400 hover:bg-primary-50 transition-colors"
              >
                <ArrowDownToLine className="w-10 h-10 text-surface-400 mx-auto mb-3" />
                <p className="text-surface-700 font-medium">Click to select a file</p>
                <p className="text-surface-400 text-sm mt-1">CSV (.csv) or Excel (.xlsx, .xls)</p>
                {file && (
                  <p className="mt-3 text-sm font-medium text-primary-600">{file.name}</p>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept={ACCEPTED}
                className="hidden"
                onChange={handleFileChange}
              />

              <div className="text-sm text-surface-500 max-w-md text-center space-y-1">
                <p className="font-medium text-surface-700">Supported formats:</p>
                <p>CSV (.csv) · Excel (.xlsx, .xls)</p>
                <p className="text-surface-400">Required columns: <span className="font-medium text-surface-600">title</span>, <span className="font-medium text-surface-600">client_name</span></p>
                <p className="text-surface-400">Download the sample template and fill it using the provided formats before importing.</p>
              </div>

              <button
                onClick={downloadJobSample}
                className="flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700 font-medium underline underline-offset-2"
              >
                <FileDown className="w-4 h-4" />
                Download Sample Template (Job_Sample.csv)
              </button>
            </div>
          )}

          {/* ── Step 2: Preview table ───────────────────────────────────── */}
          {step === 'preview' && preview && (
            <>
              <div className="flex items-center gap-4 mb-4 text-sm">
                <span className="flex items-center gap-1.5 text-green-700">
                  <CheckCircle className="w-4 h-4" />
                  {preview.valid} valid
                </span>
                <span className="flex items-center gap-1.5 text-red-700">
                  <AlertCircle className="w-4 h-4" />
                  {preview.rows.filter(r => r.errors?.length).length} invalid
                </span>
              </div>

              <div className="overflow-x-auto rounded-lg border border-surface-200">
                <table className="w-full text-sm">
                  <thead className="bg-surface-50 border-b border-surface-200">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-surface-600 whitespace-nowrap">Row</th>
                      <th className="text-left px-3 py-2 font-medium text-surface-600 whitespace-nowrap">Title</th>
                      <th className="text-left px-3 py-2 font-medium text-surface-600 whitespace-nowrap">Client</th>
                      <th className="text-left px-3 py-2 font-medium text-surface-600 whitespace-nowrap">Type</th>
                      <th className="text-left px-3 py-2 font-medium text-surface-600 whitespace-nowrap">Mode</th>
                      <th className="text-left px-3 py-2 font-medium text-surface-600 whitespace-nowrap">City</th>
                      <th className="text-left px-3 py-2 font-medium text-surface-600 whitespace-nowrap">Exp (yrs)</th>
                      <th className="text-left px-3 py-2 font-medium text-surface-600 whitespace-nowrap">Salary</th>
                      <th className="text-left px-3 py-2 font-medium text-surface-600 whitespace-nowrap">Priority</th>
                      <th className="text-left px-3 py-2 font-medium text-surface-600 whitespace-nowrap">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-100">
                    {preview.rows.map((row) => (
                      <tr key={row.row} className={rowBg(row)}>
                        <td className="px-3 py-2 text-surface-400">{row.row}</td>
                        <td className={`px-3 py-2 ${!row.fields.title ? 'text-red-600 font-semibold' : 'text-surface-900 font-medium'}`}>
                          {row.fields.title || 'MISSING'}
                        </td>
                        <td className={`px-3 py-2 ${!row.fields.client_found ? 'text-red-600' : 'text-surface-600'}`}>
                          {row.fields.client_name || <span className="italic text-surface-400">—</span>}
                          {row.fields.client_name && !row.fields.client_found && (
                            <span className="ml-1 text-xs text-red-500">(not found)</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-surface-600">{row.fields.job_type || '—'}</td>
                        <td className="px-3 py-2 text-surface-600">{row.fields.work_mode || '—'}</td>
                        <td className="px-3 py-2 text-surface-600">{row.fields.city || '—'}</td>
                        <td className="px-3 py-2 text-surface-600 text-center">
                          {row.fields.experience_min || row.fields.experience_max
                            ? `${row.fields.experience_min || 0}–${row.fields.experience_max || '?'}`
                            : '—'}
                        </td>
                        <td className="px-3 py-2 text-surface-600 text-center">
                          {row.fields.salary_min || row.fields.salary_max
                            ? `${row.fields.salary_min || 0}–${row.fields.salary_max || '?'}`
                            : '—'}
                        </td>
                        <td className="px-3 py-2 text-surface-600">{row.fields.priority || '—'}</td>
                        <td className="px-3 py-2">
                          {rowBadge(row)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* ── Step 3: Results ─────────────────────────────────────────── */}
          {step === 'results' && results && (
            <div className="flex flex-col items-center justify-center py-8 gap-5">
              {resultIcon}

              <p className="text-base font-semibold text-surface-900 text-center">{results.message}</p>

              {/* 3-column summary */}
              <div className="grid grid-cols-3 gap-3 w-full max-w-sm">
                <div className="text-center p-4 bg-green-50 rounded-xl">
                  <p className="text-2xl font-bold text-green-700">{results.inserted ?? 0}</p>
                  <p className="text-xs text-green-600 mt-1">Imported</p>
                </div>
                <div className="text-center p-4 bg-yellow-50 rounded-xl">
                  <p className="text-2xl font-bold text-yellow-700">{results.duplicates ?? 0}</p>
                  <p className="text-xs text-yellow-600 mt-1">Duplicates Skipped</p>
                </div>
                <div className="text-center p-4 bg-red-50 rounded-xl">
                  <p className="text-2xl font-bold text-red-700">{results.failed ?? 0}</p>
                  <p className="text-xs text-red-600 mt-1">Failed</p>
                </div>
              </div>

              {results.duplicate_rows?.length > 0 && (
                <div className="w-full max-w-lg">
                  <p className="text-sm font-medium text-surface-700 mb-2 flex items-center gap-1.5">
                    <SkipForward className="w-4 h-4 text-yellow-600" />
                    Skipped duplicates:
                  </p>
                  <ul className="text-sm text-yellow-800 space-y-1 max-h-28 overflow-y-auto bg-yellow-50 rounded-lg p-3 border border-yellow-200">
                    {results.duplicate_rows.map((dr, i) => (
                      <li key={i}>Row {dr.row}{dr.title ? ` — ${dr.title}` : ''}: {dr.reason}</li>
                    ))}
                  </ul>
                </div>
              )}

              {results.failed_rows?.length > 0 && (
                <div className="w-full max-w-lg">
                  <p className="text-sm font-medium text-surface-700 mb-2 flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 text-red-500" />
                    Failed rows:
                  </p>
                  <ul className="text-sm text-red-700 space-y-1 max-h-28 overflow-y-auto bg-red-50 rounded-lg p-3 border border-red-200">
                    {results.failed_rows.map((fr, i) => (
                      <li key={i}>Row {fr.row}{fr.title ? ` — ${fr.title}` : ''}: {fr.reason}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-5 border-t border-surface-200 shrink-0">
          {step === 'select' && (
            <>
              <button onClick={onClose} className="btn-secondary">Cancel</button>
              <button
                onClick={handlePreview}
                disabled={!file || loading}
                className="btn-primary flex items-center gap-2 disabled:opacity-50"
              >
                {loading ? (
                  <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Parsing…</>
                ) : (
                  <><ChevronRight className="w-4 h-4" /> Preview</>
                )}
              </button>
            </>
          )}

          {step === 'preview' && (
            <>
              <button onClick={() => setStep('select')} className="btn-secondary" disabled={loading}>Back</button>
              <button
                onClick={handleImport}
                disabled={loading || preview?.valid === 0}
                className="btn-primary flex items-center gap-2 disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Importing…{elapsed > 0 ? ` (${elapsed}s)` : ''}
                  </>
                ) : (
                  <>Import {preview?.valid ?? 0} valid job{preview?.valid !== 1 ? 's' : ''}</>
                )}
              </button>
            </>
          )}

          {step === 'results' && (
            <button onClick={onClose} className="btn-primary">Done</button>
          )}
        </div>

        {/* Large-import notice shown while importing */}
        {loading && step === 'preview' && (
          <div className="px-5 pb-4 shrink-0">
            <p className="text-xs text-center text-surface-400">
              Processing all records — please keep this window open until import completes.
            </p>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}

export default JobImportModal
