import { useState, useEffect, useRef, useCallback } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { X, Link2, Copy, Download, Printer, ToggleLeft, ToggleRight, Loader2, CheckCircle, QrCode } from 'lucide-react'
import { toast } from 'react-hot-toast'
import ModalPortal from '../common/ModalPortal'
import publicFormService from '../../services/publicFormService'

const BASE_URL = window.location.origin

/**
 * Modal for managing the current user's permanent public candidate form.
 * - Shows status, public URL, QR code
 * - Copy link, Download QR, Print QR
 * - Generate link (first time) or Activate/Deactivate
 */
const PublicFormModal = ({ isOpen, onClose }) => {
  const [form, setForm] = useState(null)           // form doc or null
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [toggling, setToggling] = useState(false)
  const qrRef = useRef(null)

  const publicUrl = form?.slug ? `${BASE_URL}/apply/public/${form.slug}` : ''

  const loadForm = useCallback(async () => {
    setLoading(true)
    try {
      const res = await publicFormService.getMyForm()
      setForm(res.data)
    } catch {
      toast.error('Failed to load public form info')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isOpen) loadForm()
  }, [isOpen, loadForm])

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      const res = await publicFormService.generate()
      setForm(res.data)
      if (!res.already_existed) toast.success('Public link generated!')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to generate public link')
    } finally {
      setGenerating(false)
    }
  }

  const handleToggle = async () => {
    if (!form) return
    setToggling(true)
    try {
      const res = await publicFormService.setEnabled(!form.is_enabled)
      setForm(res.data)
      toast.success(res.data.is_enabled ? 'Form activated' : 'Form deactivated')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to update form status')
    } finally {
      setToggling(false)
    }
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl)
      toast.success('Link copied to clipboard!')
    } catch {
      toast.error('Failed to copy link')
    }
  }

  const downloadQr = () => {
    const svg = qrRef.current?.querySelector('svg')
    if (!svg) return
    // Convert SVG → canvas → PNG download
    const canvas = document.createElement('canvas')
    const size = 320
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    const img = new Image()
    const svgStr = new XMLSerializer().serializeToString(svg)
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    img.onload = () => {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, size, size)
      ctx.drawImage(img, 0, 0, size, size)
      URL.revokeObjectURL(url)
      const a = document.createElement('a')
      a.download = 'public-form-qr.png'
      a.href = canvas.toDataURL('image/png')
      a.click()
    }
    img.src = url
  }

  const printQr = () => {
    const svg = qrRef.current?.querySelector('svg')
    if (!svg) return
    const svgStr = new XMLSerializer().serializeToString(svg)
    const win = window.open('', '_blank', 'width=400,height=500')
    if (!win) { toast.error('Pop-up blocked. Allow pop-ups to print.'); return }
    win.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Public Form QR Code</title>
          <style>
            body { margin: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; font-family: sans-serif; background: #fff; }
            .qr { width: 280px; height: 280px; }
            p { margin-top: 12px; font-size: 13px; color: #555; text-align: center; max-width: 280px; word-break: break-all; }
          </style>
        </head>
        <body>
          <img class="qr" src="data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgStr)))}" />
          <p>${publicUrl}</p>
          <script>window.onload = () => { window.print(); window.close(); }<\/script>
        </body>
      </html>
    `)
    win.document.close()
  }

  if (!isOpen) return null

  const isActive = form?.is_enabled === true
  const statusColor = isActive ? { bg: 'rgba(16,185,129,0.12)', color: '#10b981', border: 'rgba(16,185,129,0.3)' }
                               : { bg: 'rgba(107,114,128,0.1)', color: '#6b7280', border: 'rgba(107,114,128,0.2)' }

  return (
    <ModalPortal isOpen={isOpen}>
      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      >
        <div
          className="rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2">
              <QrCode className="w-5 h-5" style={{ color: 'var(--accent)' }} />
              <h3 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>Public Application Form</h3>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg transition-colors"
              style={{ color: 'var(--text-muted)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = ''}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="px-6 py-5 space-y-5">
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--accent)' }} />
              </div>
            ) : !form ? (
              /* ── No form yet — show Generate button ── */
              <div className="text-center py-4">
                <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
                     style={{ background: 'var(--accent-light)' }}>
                  <Link2 className="w-8 h-8" style={{ color: 'var(--accent)' }} />
                </div>
                <h4 className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>No Public Link Yet</h4>
                <p className="text-sm mb-5" style={{ color: 'var(--text-muted)' }}>
                  Generate a permanent, shareable link that candidates can use to apply anytime.
                  All submissions will be assigned to you.
                </p>
                <button
                  onClick={handleGenerate}
                  disabled={generating}
                  className="w-full btn-primary flex items-center justify-center gap-2 py-2.5"
                >
                  {generating
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</>
                    : <><Link2 className="w-4 h-4" /> Generate Public Link</>
                  }
                </button>
              </div>
            ) : (
              /* ── Form exists ── */
              <>
                {/* Status badge */}
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Status</span>
                  <span
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold"
                    style={{ background: statusColor.bg, color: statusColor.color, border: `1px solid ${statusColor.border}` }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: statusColor.color }} />
                    {isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>

                {/* Public URL */}
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>
                    Public URL
                  </label>
                  <div
                    className="flex items-center gap-2 px-3 py-2 rounded-lg"
                    style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)' }}
                  >
                    <span
                      className="flex-1 text-xs truncate font-mono"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {publicUrl}
                    </span>
                    <button
                      onClick={copyLink}
                      className="shrink-0 p-1 rounded transition-colors"
                      style={{ color: 'var(--accent)' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--accent-light)'}
                      onMouseLeave={e => e.currentTarget.style.background = ''}
                      title="Copy link"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* QR Code */}
                <div>
                  <label className="block text-xs font-medium mb-3" style={{ color: 'var(--text-muted)' }}>
                    QR Code
                  </label>
                  <div className="flex flex-col items-center">
                    <div
                      ref={qrRef}
                      className="p-4 rounded-xl"
                      style={{
                        background: '#ffffff',
                        border: '1px solid var(--border)',
                        opacity: isActive ? 1 : 0.45,
                      }}
                    >
                      <QRCodeSVG
                        value={publicUrl}
                        size={180}
                        level="H"
                        includeMargin={false}
                      />
                    </div>
                    {!isActive && (
                      <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
                        Activate the form to make the QR code scannable.
                      </p>
                    )}
                  </div>
                </div>

                {/* QR actions */}
                <div className="flex gap-2">
                  <button
                    onClick={copyLink}
                    className="flex-1 btn-secondary flex items-center justify-center gap-1.5 text-xs py-2"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    Copy Link
                  </button>
                  <button
                    onClick={downloadQr}
                    className="flex-1 btn-secondary flex items-center justify-center gap-1.5 text-xs py-2"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download QR
                  </button>
                  <button
                    onClick={printQr}
                    className="flex-1 btn-secondary flex items-center justify-center gap-1.5 text-xs py-2"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    Print QR
                  </button>
                </div>

                {/* Stats row */}
                {(form.total_submissions > 0 || form.total_views > 0) && (
                  <div
                    className="flex gap-4 px-4 py-3 rounded-xl text-center"
                    style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)' }}
                  >
                    {[
                      { label: 'Views', value: form.total_views ?? 0 },
                      { label: 'Opens', value: form.total_opens ?? 0 },
                      { label: 'Submissions', value: form.total_submissions ?? 0 },
                    ].map(({ label, value }) => (
                      <div key={label} className="flex-1">
                        <div className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{value}</div>
                        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Activate / Deactivate toggle */}
                <div
                  className="flex items-center justify-between px-4 py-3 rounded-xl"
                  style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)' }}
                >
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      {isActive ? 'Deactivate Form' : 'Activate Form'}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {isActive
                        ? 'Disables the public URL immediately'
                        : 'Re-enables the public URL for submissions'}
                    </p>
                  </div>
                  <button
                    onClick={handleToggle}
                    disabled={toggling}
                    className="transition-opacity disabled:opacity-50"
                  >
                    {toggling
                      ? <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--accent)' }} />
                      : isActive
                        ? <ToggleRight className="w-8 h-8" style={{ color: '#10b981' }} />
                        : <ToggleLeft className="w-8 h-8" style={{ color: '#9ca3af' }} />
                    }
                  </button>
                </div>
              </>
            )}

            {/* Cancel */}
            <button
              onClick={onClose}
              className="w-full btn-secondary text-sm py-2"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}

export default PublicFormModal
