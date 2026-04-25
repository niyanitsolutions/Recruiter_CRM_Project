import React, { useState, useEffect, useCallback } from 'react'
import {
  Trash2, RotateCcw, AlertTriangle,
  RefreshCw, Filter, FileText
} from 'lucide-react'
import { toast } from 'react-hot-toast'
import trashService from '../../services/trashService'
import usePermissions from '../../hooks/usePermissions'

const MODULE_LABELS = {
  candidates: 'Candidates',
  jobs:       'Jobs',
  clients:    'Clients',
  users:      'Users',
  interviews: 'Interviews',
  onboards:   'Onboarding',
}

const MODULE_COLORS = {
  candidates: { bg: 'rgba(79,172,254,0.12)',  color: '#4FACFE' },
  jobs:       { bg: 'rgba(67,233,123,0.12)',  color: '#43E97B' },
  clients:    { bg: 'rgba(108,99,255,0.12)',  color: '#A78BFA' },
  users:      { bg: 'rgba(245,158,11,0.12)',  color: '#F59E0B' },
  interviews: { bg: 'rgba(56,249,215,0.12)',  color: '#38F9D7' },
  onboards:   { bg: 'rgba(139,143,168,0.12)', color: '#8B8FA8' },
}

const DeletedHistory = () => {
  const { has }      = usePermissions()
  const [data,       setData]       = useState([])
  const [loading,    setLoading]    = useState(true)
  const [module,     setModule]     = useState('')
  const [confirming, setConfirming] = useState(null) // { module, id, label }
  const [restoring,  setRestoring]  = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await trashService.list(module)
      setData(result.modules || result || [])
    } catch {
      toast.error('Failed to load deleted records')
    } finally {
      setLoading(false)
    }
  }, [module])

  useEffect(() => { load() }, [load])

  const handleRestore = async (mod, id) => {
    setRestoring(`${mod}-${id}`)
    try {
      await trashService.restore(mod, id)
      toast.success('Record restored successfully')
      load()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to restore record')
    } finally {
      setRestoring(null)
    }
  }

  const handlePermanentDelete = async () => {
    if (!confirming) return
    try {
      await trashService.permanentDelete(confirming.module, confirming.id)
      toast.success('Permanently deleted')
      setConfirming(null)
      load()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to permanently delete')
    }
  }

  const totalCount = Array.isArray(data)
    ? data.reduce((s, g) => s + (g.total || g.items?.length || 0), 0)
    : 0

  return (
    <div className="p-6 space-y-6 page-enter">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"
            style={{ color: 'var(--text-heading)' }}>
            <Trash2 className="w-6 h-6" style={{ color: '#FF4757' }} />
            Deleted History
          </h1>
          <p style={{ color: 'var(--text-muted)' }}>
            {totalCount} deleted record{totalCount !== 1 ? 's' : ''} — auto-purged after 30 days
          </p>
        </div>
        <button onClick={load} className="btn-secondary flex items-center gap-2">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Module filter */}
      <div
        className="flex flex-wrap items-center gap-2 p-4 rounded-xl"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}
      >
        <Filter className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
        <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
          Filter:
        </span>
        {['', ...Object.keys(MODULE_LABELS)].map(key => (
          <button
            key={key}
            onClick={() => setModule(key)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
            style={module === key
              ? { background: 'var(--accent)', color: '#fff' }
              : { color: 'var(--text-secondary)' }
            }
            onMouseEnter={e => { if (module !== key) e.currentTarget.style.background = 'var(--bg-hover)' }}
            onMouseLeave={e => { if (module !== key) e.currentTarget.style.background = '' }}
          >
            {key ? MODULE_LABELS[key] : 'All'}
          </button>
        ))}
      </div>

      {/* Results */}
      {loading ? (
        <div className="p-8 text-center">
          <div className="animate-spin w-8 h-8 border-2 border-t-transparent rounded-full mx-auto"
            style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
          <p className="mt-2" style={{ color: 'var(--text-muted)' }}>Loading...</p>
        </div>
      ) : !Array.isArray(data) || data.length === 0 ? (
        <div className="p-12 text-center rounded-xl"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
          <Trash2 className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--text-disabled)' }} />
          <p className="font-medium" style={{ color: 'var(--text-muted)' }}>
            No deleted records found
          </p>
        </div>
      ) : (
        data.map(group => {
          const items = group.items || []
          if (!items.length) return null
          const color = MODULE_COLORS[group.module] || MODULE_COLORS.users

          return (
            <div
              key={group.module}
              className="rounded-xl overflow-hidden"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}
            >
              {/* Group header */}
              <div
                className="px-4 py-3 flex items-center gap-2"
                style={{ background: 'var(--bg-card-alt)', borderBottom: '1px solid var(--border)' }}
              >
                <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                  {MODULE_LABELS[group.module] || group.module}
                </span>
                <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={color}>
                  {group.total || items.length}
                </span>
              </div>

              {/* Records table */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      {['Name', 'Details', 'Deleted', 'Actions'].map(h => (
                        <th key={h}
                          className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider"
                          style={{ color: 'var(--text-disabled)' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map(item => (
                      <tr
                        key={item.id}
                        style={{ borderBottom: '1px solid var(--border-subtle)' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                        onMouseLeave={e => e.currentTarget.style.background = ''}
                      >
                        <td className="px-4 py-3">
                          <p className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>
                            {item.label || item.name || item.full_name || `#${item.id}`}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                            {item.email || item.status || item.title || '—'}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                            {item.deleted_at
                              ? new Date(item.deleted_at).toLocaleString('en-IN', {
                                  day: '2-digit', month: 'short', year: 'numeric',
                                  hour: '2-digit', minute: '2-digit',
                                })
                              : '—'
                            }
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleRestore(group.module, item.id)}
                              disabled={restoring === `${group.module}-${item.id}`}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                                text-xs font-medium transition-all disabled:opacity-50"
                              style={{ background: 'rgba(67,233,123,0.12)', color: '#43E97B' }}
                              onMouseEnter={e => e.currentTarget.style.background = 'rgba(67,233,123,0.22)'}
                              onMouseLeave={e => e.currentTarget.style.background = 'rgba(67,233,123,0.12)'}
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              Restore
                            </button>
                            {has('candidates:delete') && (
                              <button
                                onClick={() => setConfirming({
                                  module: group.module,
                                  id:     item.id,
                                  label:  item.label || item.name || item.full_name,
                                })}
                                className="p-1.5 rounded-lg transition-colors"
                                style={{ color: 'var(--text-disabled)' }}
                                onMouseEnter={e => {
                                  e.currentTarget.style.color = '#FF4757'
                                  e.currentTarget.style.background = 'rgba(255,71,87,0.1)'
                                }}
                                onMouseLeave={e => {
                                  e.currentTarget.style.color = 'var(--text-disabled)'
                                  e.currentTarget.style.background = ''
                                }}
                                title="Permanently delete"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })
      )}

      {/* Permanent delete confirm modal */}
      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div
            className="rounded-2xl p-6 w-full max-w-md shadow-2xl mx-4"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}
          >
            <div className="flex items-start gap-4 mb-6">
              <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(255,71,87,0.15)' }}>
                <AlertTriangle className="w-5 h-5" style={{ color: '#FF4757' }} />
              </div>
              <div>
                <h3 className="font-semibold text-base mb-1" style={{ color: 'var(--text-heading)' }}>
                  Permanently Delete?
                </h3>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  <strong style={{ color: 'var(--text-primary)' }}>{confirming.label}</strong> will be
                  permanently removed. This cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3">
              <button onClick={() => setConfirming(null)} className="btn-secondary">
                Cancel
              </button>
              <button
                onClick={handlePermanentDelete}
                className="px-4 py-2 rounded-lg font-medium text-sm text-white transition-all"
                style={{ background: '#FF4757' }}
                onMouseEnter={e => e.currentTarget.style.background = '#E63946'}
                onMouseLeave={e => e.currentTarget.style.background = '#FF4757'}
              >
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default DeletedHistory
