import React, { useRef, useState } from 'react'
import { X, Upload, AlertCircle, CheckCircle, SkipForward, ChevronRight } from 'lucide-react'
import { toast } from 'react-hot-toast'
import candidateService from '../../services/candidateService'

const ACCEPTED = '.csv,.xlsx,.xls,.pdf'

// step: 'select' | 'preview' | 'results'

const CandidateImportModal = ({ onClose, onImported }) => {
  const fileRef = useRef(null)
  const [step, setStep] = useState('select')
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState(null)   // { total, valid, rows }
  const [results, setResults] = useState(null)   // { inserted, skipped_duplicates, failed, failed_rows, message }

  const handleFileChange = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    const ext = f.name.split('.').pop().toLowerCase()
    if (!['csv', 'xlsx', 'xls', 'pdf'].includes(ext)) {
      toast.error('Only .csv, .xlsx, .xls, or .pdf files are supported.')
      e.target.value = ''
      return
    }
    setFile(f)
  }

  const handlePreview = async () => {
    if (!file) return
    setLoading(true)
    try {
      const data = await candidateService.bulkImportPreview(file)
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
      const data = await candidateService.bulkImport(file)
      setResults(data)
      setStep('results')
      if (data.inserted > 0) onImported?.()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Import failed.')
    } finally {
      setLoading(false)
    }
  }

  const rowBg = (row) => {
    if (row.is_duplicate) return 'bg-yellow-50'
    if (row.errors?.length) return 'bg-red-50'
    return ''
  }

  const rowBadge = (row) => {
    if (row.is_duplicate)
      return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">Duplicate</span>
    if (row.errors?.length)
      return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">{row.errors.join(', ')}</span>
    return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Valid</span>
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-surface-200 shrink-0">
          <div>
            <h3 className="text-lg font-semibold text-surface-900">Import Candidates</h3>
            <p className="text-sm text-surface-500 mt-0.5">
              {step === 'select' && 'Upload a .csv, .xlsx, .xls, or .pdf file'}
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
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <div
                onClick={() => fileRef.current?.click()}
                className="w-full max-w-md border-2 border-dashed border-surface-300 rounded-xl p-8 text-center cursor-pointer hover:border-primary-400 hover:bg-primary-50 transition-colors"
              >
                <Upload className="w-10 h-10 text-surface-400 mx-auto mb-3" />
                <p className="text-surface-700 font-medium">Click to select a file</p>
                <p className="text-surface-400 text-sm mt-1">CSV, Excel (.xlsx / .xls), or PDF</p>
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
              <div className="text-sm text-surface-500 max-w-md text-center">
                <p className="font-medium text-surface-700 mb-1">Required columns: email, mobile</p>
                <p>Optional: name, company, designation, experience, city, skills, source, notice period, and more.</p>
              </div>
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
                  {preview.rows.filter(r => r.errors?.length && !r.is_duplicate).length} invalid
                </span>
                <span className="flex items-center gap-1.5 text-yellow-700">
                  <SkipForward className="w-4 h-4" />
                  {preview.rows.filter(r => r.is_duplicate).length} duplicates (will be skipped)
                </span>
              </div>

              <div className="overflow-x-auto rounded-lg border border-surface-200">
                <table className="w-full text-sm">
                  <thead className="bg-surface-50 border-b border-surface-200">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-surface-600 whitespace-nowrap">Row</th>
                      <th className="text-left px-3 py-2 font-medium text-surface-600 whitespace-nowrap">Name</th>
                      <th className="text-left px-3 py-2 font-medium text-surface-600 whitespace-nowrap">Email</th>
                      <th className="text-left px-3 py-2 font-medium text-surface-600 whitespace-nowrap">Mobile</th>
                      <th className="text-left px-3 py-2 font-medium text-surface-600 whitespace-nowrap">Company</th>
                      <th className="text-left px-3 py-2 font-medium text-surface-600 whitespace-nowrap">Designation</th>
                      <th className="text-left px-3 py-2 font-medium text-surface-600 whitespace-nowrap">Exp (yrs)</th>
                      <th className="text-left px-3 py-2 font-medium text-surface-600 whitespace-nowrap">City</th>
                      <th className="text-left px-3 py-2 font-medium text-surface-600 whitespace-nowrap">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-100">
                    {preview.rows.map((row) => (
                      <tr key={row.row} className={rowBg(row)}>
                        <td className="px-3 py-2 text-surface-400">{row.row}</td>
                        <td className={`px-3 py-2 ${!row.fields.full_name ? 'text-surface-400 italic' : 'text-surface-900'}`}>
                          {row.fields.full_name || '—'}
                        </td>
                        <td className={`px-3 py-2 font-mono text-xs ${!row.fields.email ? 'text-red-600 font-semibold' : 'text-surface-700'}`}>
                          {row.fields.email || 'MISSING'}
                        </td>
                        <td className={`px-3 py-2 font-mono text-xs ${!row.fields.mobile ? 'text-red-600 font-semibold' : 'text-surface-700'}`}>
                          {row.fields.mobile || 'MISSING'}
                        </td>
                        <td className="px-3 py-2 text-surface-600">{row.fields.current_company || '—'}</td>
                        <td className="px-3 py-2 text-surface-600">{row.fields.current_designation || '—'}</td>
                        <td className="px-3 py-2 text-surface-600 text-center">{row.fields.total_experience_years || '—'}</td>
                        <td className="px-3 py-2 text-surface-600">{row.fields.current_city || '—'}</td>
                        <td className="px-3 py-2">{rowBadge(row)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* ── Step 3: Results ─────────────────────────────────────────── */}
          {step === 'results' && results && (
            <div className="flex flex-col items-center justify-center py-10 gap-6">
              <CheckCircle className="w-14 h-14 text-green-500" />
              <p className="text-lg font-semibold text-surface-900">{results.message}</p>
              <div className="grid grid-cols-3 gap-4 w-full max-w-sm">
                <div className="text-center p-4 bg-green-50 rounded-xl">
                  <p className="text-2xl font-bold text-green-700">{results.inserted}</p>
                  <p className="text-xs text-green-600 mt-1">Inserted</p>
                </div>
                <div className="text-center p-4 bg-yellow-50 rounded-xl">
                  <p className="text-2xl font-bold text-yellow-700">{results.skipped_duplicates}</p>
                  <p className="text-xs text-yellow-600 mt-1">Duplicates skipped</p>
                </div>
                <div className="text-center p-4 bg-red-50 rounded-xl">
                  <p className="text-2xl font-bold text-red-700">{results.failed}</p>
                  <p className="text-xs text-red-600 mt-1">Failed</p>
                </div>
              </div>
              {results.failed_rows?.length > 0 && (
                <div className="w-full max-w-lg">
                  <p className="text-sm font-medium text-surface-700 mb-2">Failed rows:</p>
                  <ul className="text-sm text-red-700 space-y-1 max-h-32 overflow-y-auto bg-red-50 rounded-lg p-3">
                    {results.failed_rows.map((fr, i) => (
                      <li key={i}>Row {fr.row}: {fr.reason}</li>
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
              <button onClick={() => setStep('select')} className="btn-secondary">Back</button>
              <button
                onClick={handleImport}
                disabled={loading || preview?.valid === 0}
                className="btn-primary flex items-center gap-2 disabled:opacity-50"
              >
                {loading ? (
                  <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Importing…</>
                ) : (
                  <>Import {preview?.valid ?? 0} valid row{preview?.valid !== 1 ? 's' : ''}</>
                )}
              </button>
            </>
          )}

          {step === 'results' && (
            <button onClick={onClose} className="btn-primary">Done</button>
          )}
        </div>
      </div>
    </div>
  )
}

export default CandidateImportModal
