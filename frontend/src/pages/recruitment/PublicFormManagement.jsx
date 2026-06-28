import { useState, useEffect, useCallback } from 'react'
import { Link2, QrCode, Eye, Trash2, ToggleLeft, ToggleRight, Plus, Loader2, Copy, Download, ExternalLink } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { useSelector } from 'react-redux'
import publicFormService from '../../services/publicFormService'
import usePermissions from '../../hooks/usePermissions'

const STATUS_BADGE = {
  enabled: 'bg-green-50 text-green-700 border border-green-200',
  disabled: 'bg-gray-100 text-gray-500 border border-gray-200',
  expired: 'bg-yellow-50 text-yellow-700 border border-yellow-200',
}

function getFormStatus(form) {
  if (!form.is_enabled) return 'disabled'
  if (form.expiry_date && new Date(form.expiry_date) < new Date()) return 'expired'
  return 'enabled'
}

const FRONTEND_BASE = window.location.origin

const PublicFormManagement = () => {
  const { has } = usePermissions()
  const [forms, setForms] = useState([])
  const [loading, setLoading] = useState(true)
  const [togglingId, setTogglingId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [qrLoadingId, setQrLoadingId] = useState(null)

  const canView = has('candidates:view')
  const canEdit = has('candidates:create')

  const loadForms = useCallback(async () => {
    try {
      setLoading(true)
      const res = await publicFormService.listForms()
      setForms(res.data || [])
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to load public forms')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadForms() }, [loadForms])

  const copyLink = (slug) => {
    const url = `${FRONTEND_BASE}/apply/public/${slug}`
    navigator.clipboard.writeText(url).then(() => toast.success('Link copied!'))
  }

  const toggleEnabled = async (form) => {
    setTogglingId(form._id)
    try {
      await publicFormService.updateForm(form._id, { is_enabled: !form.is_enabled })
      setForms(prev => prev.map(f =>
        f._id === form._id ? { ...f, is_enabled: !f.is_enabled } : f
      ))
      toast.success(form.is_enabled ? 'Form disabled' : 'Form enabled')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to update form')
    } finally {
      setTogglingId(null)
    }
  }

  const deleteForm = async (form) => {
    if (!window.confirm(`Delete the public form for "${form.job_title}"? This cannot be undone.`)) return
    setDeletingId(form._id)
    try {
      await publicFormService.deleteForm(form._id)
      setForms(prev => prev.filter(f => f._id !== form._id))
      toast.success('Form deleted')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to delete form')
    } finally {
      setDeletingId(null)
    }
  }

  const downloadQr = async (form) => {
    setQrLoadingId(form._id)
    try {
      const url = publicFormService.getQrCodeUrl(form._id, FRONTEND_BASE)
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${localStorage.getItem('access_token')}` },
      })
      if (!response.ok) throw new Error('QR generation failed')
      const blob = await response.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `form-qr-${form.slug}.png`
      a.click()
      URL.revokeObjectURL(a.href)
    } catch (err) {
      toast.error('Failed to download QR code')
    } finally {
      setQrLoadingId(null)
    }
  }

  const openPreview = (slug) => {
    window.open(`/apply/public/${slug}`, '_blank', 'noopener,noreferrer')
  }

  if (!canView) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
        You don&apos;t have permission to view public forms.
      </div>
    )
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Public Application Forms</h1>
          <p className="text-sm text-gray-500 mt-0.5">Permanent, shareable links for candidates to apply directly</p>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center h-48 text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin mr-2" />
          Loading forms...
        </div>
      ) : forms.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
          <Link2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No public forms created yet</p>
          <p className="text-gray-400 text-sm mt-1">
            Create a public form from the Jobs page using the &quot;Public Form&quot; button.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Job</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Public URL</th>
                  <th className="px-4 py-3 text-center font-semibold text-gray-600">Status</th>
                  <th className="px-4 py-3 text-center font-semibold text-gray-600">Views</th>
                  <th className="px-4 py-3 text-center font-semibold text-gray-600">Opens</th>
                  <th className="px-4 py-3 text-center font-semibold text-gray-600">Submissions</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Last Submission</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Created By</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Expiry</th>
                  <th className="px-4 py-3 text-center font-semibold text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {forms.map(form => {
                  const formStatus = getFormStatus(form)
                  const publicUrl = `${FRONTEND_BASE}/apply/public/${form.slug}`
                  const isToggling = togglingId === form._id
                  const isDeleting = deletingId === form._id
                  const isQrLoading = qrLoadingId === form._id

                  return (
                    <tr key={form._id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <span className="font-medium text-gray-800 line-clamp-1">{form.job_title}</span>
                      </td>
                      <td className="px-4 py-3 max-w-xs">
                        <div className="flex items-center gap-2">
                          <span className="text-gray-400 text-xs truncate max-w-[180px]">{publicUrl}</span>
                          <button
                            onClick={() => copyLink(form.slug)}
                            className="text-gray-400 hover:text-blue-600 shrink-0"
                            title="Copy link"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[formStatus]}`}>
                          {formStatus.charAt(0).toUpperCase() + formStatus.slice(1)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-gray-600">{form.total_views ?? 0}</td>
                      <td className="px-4 py-3 text-center text-gray-600">{form.total_opens ?? 0}</td>
                      <td className="px-4 py-3 text-center">
                        <span className="font-semibold text-blue-600">{form.total_submissions ?? 0}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {form.last_submission_at
                          ? new Date(form.last_submission_at).toLocaleDateString()
                          : '—'
                        }
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        <div>{form.created_by_name || '—'}</div>
                        <div className="text-gray-400">{new Date(form.created_at).toLocaleDateString()}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {form.expiry_date
                          ? new Date(form.expiry_date).toLocaleDateString()
                          : <span className="text-gray-300">Never</span>
                        }
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* Preview */}
                          <button
                            onClick={() => openPreview(form.slug)}
                            className="p-1.5 text-gray-400 hover:text-blue-600 rounded-md hover:bg-blue-50 transition-colors"
                            title="Preview form"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </button>

                          {/* Copy link */}
                          <button
                            onClick={() => copyLink(form.slug)}
                            className="p-1.5 text-gray-400 hover:text-blue-600 rounded-md hover:bg-blue-50 transition-colors"
                            title="Copy link"
                          >
                            <Link2 className="w-4 h-4" />
                          </button>

                          {/* Download QR */}
                          {canEdit && (
                            <button
                              onClick={() => downloadQr(form)}
                              disabled={isQrLoading}
                              className="p-1.5 text-gray-400 hover:text-purple-600 rounded-md hover:bg-purple-50 transition-colors disabled:opacity-50"
                              title="Download QR code"
                            >
                              {isQrLoading
                                ? <Loader2 className="w-4 h-4 animate-spin" />
                                : <QrCode className="w-4 h-4" />
                              }
                            </button>
                          )}

                          {/* Enable / Disable toggle */}
                          {canEdit && (
                            <button
                              onClick={() => toggleEnabled(form)}
                              disabled={isToggling}
                              className={`p-1.5 rounded-md transition-colors disabled:opacity-50 ${
                                form.is_enabled
                                  ? 'text-green-500 hover:text-red-500 hover:bg-red-50'
                                  : 'text-gray-400 hover:text-green-600 hover:bg-green-50'
                              }`}
                              title={form.is_enabled ? 'Disable form' : 'Enable form'}
                            >
                              {isToggling
                                ? <Loader2 className="w-4 h-4 animate-spin" />
                                : form.is_enabled
                                  ? <ToggleRight className="w-4 h-4" />
                                  : <ToggleLeft className="w-4 h-4" />
                              }
                            </button>
                          )}

                          {/* Delete */}
                          {canEdit && (
                            <button
                              onClick={() => deleteForm(form)}
                              disabled={isDeleting}
                              className="p-1.5 text-gray-400 hover:text-red-600 rounded-md hover:bg-red-50 transition-colors disabled:opacity-50"
                              title="Delete form"
                            >
                              {isDeleting
                                ? <Loader2 className="w-4 h-4 animate-spin" />
                                : <Trash2 className="w-4 h-4" />
                              }
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

export default PublicFormManagement
