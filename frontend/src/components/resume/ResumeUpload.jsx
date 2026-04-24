import React, { useState, useRef, useCallback } from 'react'
import {
  Upload, FileText, Loader2, Sparkles,
  CheckCircle, X, RotateCcw, AlertTriangle
} from 'lucide-react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'

const ConfidenceBar = ({ score }) => {
  const { color, label } =
    score >= 80 ? { color: '#43E97B', label: 'High' }   :
    score >= 55 ? { color: '#F59E0B', label: 'Medium' } :
                  { color: '#FF4757', label: 'Low' }
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full overflow-hidden"
        style={{ background: 'var(--border-strong)' }}>
        <div className="h-full rounded-full transition-all duration-700"
          style={{ width: `${score}%`, background: color }} />
      </div>
      <span className="text-xs font-semibold tabular-nums whitespace-nowrap"
        style={{ color }}>
        {score}% {label}
      </span>
    </div>
  )
}

const ResumeUpload = ({ onParsed }) => {
  const [dragging,  setDragging]  = useState(false)
  const [file,      setFile]      = useState(null)
  const [status,    setStatus]    = useState('idle') // idle | uploading | parsing | done | error
  const [confidence,setConf]      = useState(null)
  const [fallback,  setFallback]  = useState(null)  // null | string (fallback reason)
  const fileRef = useRef(null)

  const process = useCallback(async (f) => {
    if (!f) return
    const ext = f.name.split('.').pop().toLowerCase()
    if (!['pdf', 'docx', 'doc', 'txt'].includes(ext)) {
      toast.error('Only PDF, DOCX, DOC or TXT files are supported')
      return
    }
    if (f.size > 10 * 1024 * 1024) {
      toast.error('File size must be under 10 MB')
      return
    }

    setFile(f)
    setStatus('uploading')
    setFallback(null)

    const form = new FormData()
    form.append('file', f)

    try {
      // Switch to 'parsing' once upload finishes
      setStatus('parsing')
      const response = await api.post('/candidates/extract-resume', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })

      const data = response.data
      setConf(data.confidence_score ?? data.confidence ?? null)
      setFallback(data._meta?.fallbackReason ?? null)
      setStatus('done')
      onParsed?.(data)
      toast.success('Resume parsed — fields auto-filled')

    } catch (err) {
      setStatus('error')
      const msg = err.response?.data?.detail || err.response?.data?.message || 'Parsing failed'
      toast.error(msg)
    }
  }, [onParsed])

  const onDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files?.[0]
    if (f) process(f)
  }

  const reset = () => {
    setFile(null)
    setStatus('idle')
    setConf(null)
    setFallback(null)
  }

  const isParsing = status === 'uploading' || status === 'parsing'
  const statusText = {
    uploading: 'Uploading…',
    parsing:   'Parsing with AI…',
    done:      'Parsing complete',
    error:     'Parsing failed',
  }[status] || null

  return (
    <div className="space-y-2">
      {/* Drop zone */}
      <div
        className={`relative rounded-xl transition-all duration-200
          ${isParsing ? 'pointer-events-none' : 'cursor-pointer'}`}
        style={{
          background:  dragging ? 'rgba(108,99,255,0.08)' : 'var(--bg-card-alt)',
          border:      `2px dashed ${
            dragging ? '#6C63FF' :
            status === 'done' ? '#43E97B' :
            status === 'error' ? '#FF4757' :
            'var(--border-strong)'
          }`,
        }}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => !isParsing && fileRef.current?.click()}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.docx,.doc,.txt"
          className="hidden"
          onChange={e => process(e.target.files?.[0])}
        />

        <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
          {isParsing ? (
            <>
              <Loader2 className="w-10 h-10 mb-3 animate-spin" style={{ color: '#6C63FF' }} />
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                {statusText}
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-disabled)' }}>
                Extracting fields — usually takes 3–10 seconds
              </p>
            </>
          ) : status === 'done' ? (
            <>
              <CheckCircle className="w-10 h-10 mb-3" style={{ color: '#43E97B' }} />
              <div className="flex items-center gap-2 mb-2">
                <FileText className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
                <p className="text-sm font-medium truncate max-w-[220px]"
                  style={{ color: 'var(--text-primary)' }}>
                  {file?.name}
                </p>
              </div>
              {confidence !== null && <ConfidenceBar score={confidence} />}
              <button
                onClick={e => { e.stopPropagation(); reset() }}
                className="mt-3 flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg
                  transition-colors font-medium"
                style={{ color: 'var(--text-muted)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = ''}
              >
                <RotateCcw className="w-3 h-3" />
                Upload different file
              </button>
            </>
          ) : status === 'error' ? (
            <>
              <X className="w-10 h-10 mb-3" style={{ color: '#FF4757' }} />
              <p className="text-sm font-medium" style={{ color: '#FF4757' }}>
                Parsing failed
              </p>
              <button
                onClick={e => { e.stopPropagation(); reset() }}
                className="mt-2 text-xs px-3 py-1.5 rounded-lg transition-colors"
                style={{ color: 'var(--accent)' }}
              >
                Try again
              </button>
            </>
          ) : (
            <>
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center mb-3"
                style={{ background: 'rgba(108,99,255,0.12)' }}
              >
                <Upload className="w-6 h-6" style={{ color: '#A78BFA' }} />
              </div>
              <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
                {dragging ? 'Drop resume here' : 'Upload Resume'}
              </p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Drag & drop or click — PDF, DOCX, TXT · Max 10 MB
              </p>
              <p className="text-xs mt-1.5 flex items-center gap-1"
                style={{ color: 'var(--text-disabled)' }}>
                <Sparkles className="w-3 h-3" />
                AI-powered auto-fill
              </p>
            </>
          )}
        </div>
      </div>

      {/* Fallback warning */}
      {status === 'done' && fallback && (
        <div
          className="flex items-start gap-2 px-3 py-2 rounded-lg text-xs"
          style={{ background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.25)' }}
        >
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: '#F59E0B' }} />
          <span style={{ color: '#F59E0B' }}>
            AI parsing failed — used local parser. {fallback}
          </span>
        </div>
      )}
    </div>
  )
}

export default ResumeUpload
