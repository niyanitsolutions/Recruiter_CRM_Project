/**
 * Public employee document upload page.
 * Accessed via /document-upload/:token (no login required).
 * Token is validated on load; expired/used tokens show an appropriate message.
 */
import React, { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { Upload, X, File, FileText, Image, CheckCircle, AlertCircle, Loader2, Plus } from 'lucide-react'
import toast from 'react-hot-toast'
import hrmService from '../../services/hrmService'

const DOC_CATEGORIES = [
  { key: 'resume',             label: 'Resume',             single: true },
  { key: 'aadhaar',            label: 'Aadhaar',            single: true },
  { key: 'pan',                label: 'PAN',                single: true },
  { key: 'passport',           label: 'Passport',           single: true },
  { key: 'education',          label: 'Education',          single: false },
  { key: 'experience',         label: 'Experience',         single: false },
  { key: 'offer_letter',       label: 'Offer Letter',       single: true },
  { key: 'payslip',            label: 'Payslip',            single: false },
  { key: 'certificate',        label: 'Certificate',        single: false },
  { key: 'contract',           label: 'Contract',           single: true },
  { key: 'appointment_letter', label: 'Appointment Letter', single: true },
  { key: 'relieving_letter',   label: 'Relieving Letter',   single: true },
  { key: 'other',              label: 'Other',              single: false },
]

function fileIcon(name = '') {
  const ext = (name.split('.').pop() || '').toLowerCase()
  if (['jpg','jpeg','png','gif','webp'].includes(ext)) return Image
  if (ext === 'pdf') return FileText
  return File
}

export default function EmployeeDocUpload() {
  const { token } = useParams()
  const [state, setState] = useState('loading')  // loading | valid | invalid | used | expired | submitted
  const [tokenInfo, setTokenInfo] = useState(null)
  const [error, setError] = useState('')
  const [fileMap, setFileMap] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const fileRefs = useRef({})

  useEffect(() => {
    if (!token) { setState('invalid'); return }
    hrmService.validateDocUploadToken(token)
      .then(res => {
        setTokenInfo(res.data)
        setState('valid')
      })
      .catch(e => {
        const status = e?.response?.status
        const detail = e?.response?.data?.detail || ''
        if (status === 410 && detail.includes('used')) setState('used')
        else if (status === 410 && detail.includes('expired')) setState('expired')
        else if (status === 410 && detail.includes('revoked')) setState('expired')
        else { setState('invalid'); setError(detail || 'Invalid upload link.') }
      })
  }, [token])

  const requestedTypes = tokenInfo?.doc_types_requested || []
  const displayCategories = requestedTypes.length > 0
    ? DOC_CATEGORIES.filter(c => requestedTypes.includes(c.key))
    : DOC_CATEGORIES

  const handleFilePick = (cat, files) => {
    setFileMap(prev => ({
      ...prev,
      [cat.key]: cat.single ? [files[0]] : [...(prev[cat.key] || []), ...Array.from(files)],
    }))
  }

  const removeFile = (catKey, idx) => {
    setFileMap(prev => {
      const arr = [...(prev[catKey] || [])]
      arr.splice(idx, 1)
      return { ...prev, [catKey]: arr }
    })
  }

  const totalFiles = Object.values(fileMap).reduce((s, arr) => s + (arr?.length || 0), 0)

  const handleSubmit = async () => {
    if (totalFiles === 0) { toast.error('Please attach at least one file'); return }
    setSubmitting(true)
    const fd = new FormData()
    const types = [], names = []
    for (const cat of DOC_CATEGORIES) {
      for (const file of (fileMap[cat.key] || [])) {
        fd.append('files', file)
        types.push(cat.key)
        names.push(file.name.replace(/\.[^.]+$/, ''))
      }
    }
    fd.append('doc_types', types.join(','))
    fd.append('doc_names', names.join(','))
    try {
      await hrmService.uploadViaToken(token, fd)
      setState('submitted')
    } catch (e) {
      const detail = e?.response?.data?.detail || ''
      if (detail.includes('already been used') || detail.includes('expired')) {
        setState('used')
      } else {
        toast.error(detail || 'Upload failed. Please try again.')
      }
    }
    setSubmitting(false)
  }

  // ── State renders ──────────────────────────────────────────────────────────

  if (state === 'loading') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
          <p className="text-sm text-gray-500">Validating upload link…</p>
        </div>
      </div>
    )
  }

  if (state === 'used') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-10 text-center max-w-md w-full">
          <CheckCircle className="w-14 h-14 text-green-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Documents Already Submitted</h2>
          <p className="text-gray-500 text-sm">This upload link has already been used. Your documents have been received.</p>
          <p className="text-gray-400 text-xs mt-3">If you need to re-upload, please contact your HR team.</p>
        </div>
      </div>
    )
  }

  if (state === 'expired') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-10 text-center max-w-md w-full">
          <AlertCircle className="w-14 h-14 text-amber-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">This upload link has expired.</h2>
          <p className="text-gray-500 text-sm">This link is no longer active. Please contact your HR team to generate a new one.</p>
        </div>
      </div>
    )
  }

  if (state === 'invalid') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-10 text-center max-w-md w-full">
          <AlertCircle className="w-14 h-14 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Invalid Upload Link</h2>
          <p className="text-gray-500 text-sm">{error || 'This upload link is not valid.'}</p>
        </div>
      </div>
    )
  }

  if (state === 'submitted') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-10 text-center max-w-md w-full">
          <CheckCircle className="w-14 h-14 text-green-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Documents Submitted!</h2>
          <p className="text-gray-500 text-sm">Your documents have been uploaded successfully. Your HR team will review them shortly.</p>
          <p className="text-gray-400 text-xs mt-3">You can close this page.</p>
        </div>
      </div>
    )
  }

  // ── Upload form ─────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 py-10 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-indigo-600 flex items-center justify-center mx-auto mb-4">
            <Upload className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Upload Your Documents</h1>
          {tokenInfo?.employee_name && (
            <p className="text-gray-600 mt-1">Hello, <strong>{tokenInfo.employee_name}</strong></p>
          )}
          {tokenInfo?.message && (
            <div className="mt-3 text-sm text-indigo-800 bg-indigo-50 rounded-xl px-4 py-2.5 inline-block">
              {tokenInfo.message}
            </div>
          )}
        </div>

        {/* Upload form */}
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
          <div className="p-5 space-y-3">
            {displayCategories.map(cat => {
              const files = fileMap[cat.key] || []
              const isRequested = requestedTypes.length === 0 || requestedTypes.includes(cat.key)
              return (
                <div key={cat.key}
                  className={`border rounded-xl overflow-hidden transition-all ${
                    requestedTypes.includes(cat.key) ? 'border-indigo-300 bg-indigo-50/40' : 'border-gray-200'
                  }`}>
                  <div className="flex items-center justify-between px-4 py-3 bg-gray-50">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-800">{cat.label}</span>
                      {requestedTypes.includes(cat.key) && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-600">Required</span>
                      )}
                    </div>
                    <label className="flex items-center gap-1 text-xs text-indigo-600 cursor-pointer hover:text-indigo-800 font-medium">
                      <Plus className="w-3.5 h-3.5" />
                      {cat.single ? 'Choose file' : 'Add files'}
                      <input
                        type="file"
                        className="hidden"
                        multiple={!cat.single}
                        accept=".pdf,.jpg,.jpeg,.png,.docx"
                        ref={el => fileRefs.current[cat.key] = el}
                        onChange={e => handleFilePick(cat, e.target.files)}
                      />
                    </label>
                  </div>
                  {files.length > 0 && (
                    <div className="px-4 py-2 space-y-1.5">
                      {files.map((f, i) => {
                        const Icon = fileIcon(f.name)
                        return (
                          <div key={i} className="flex items-center gap-2 text-xs text-gray-700">
                            <Icon className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                            <span className="flex-1 truncate">{f.name}</span>
                            <span className="text-gray-400 flex-shrink-0">{(f.size / 1024).toFixed(0)} KB</span>
                            <button onClick={() => removeFile(cat.key, i)}
                              className="text-red-400 hover:text-red-600 flex-shrink-0">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div className="px-5 pb-5">
            <button
              onClick={handleSubmit}
              disabled={submitting || totalFiles === 0}
              className="w-full py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {submitting ? 'Uploading…' : `Submit ${totalFiles > 0 ? `${totalFiles} Document${totalFiles > 1 ? 's' : ''}` : 'Documents'}`}
            </button>
            <p className="text-center text-xs text-gray-400 mt-3">
              Supported formats: PDF, JPG, PNG, DOCX · Max 10 MB per file
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
