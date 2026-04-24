import React, { useState, useEffect } from 'react'
import {
  Plus, Settings, ToggleLeft, ToggleRight,
  CheckCircle, XCircle, Loader2, RefreshCw, Plug
} from 'lucide-react'
import { toast } from 'react-hot-toast'
import integrationService from '../../services/integrationService'
import DynamicIntegrationForm from './DynamicIntegrationForm'

const TYPE_COLORS = {
  email:    { bg: 'rgba(79,172,254,0.12)',  color: '#4FACFE' },
  sms:      { bg: 'rgba(67,233,123,0.12)',  color: '#43E97B' },
  whatsapp: { bg: 'rgba(67,233,123,0.15)',  color: '#25D366' },
  webhook:  { bg: 'rgba(245,158,11,0.12)',  color: '#F59E0B' },
  crm:      { bg: 'rgba(108,99,255,0.12)',  color: '#A78BFA' },
  calendar: { bg: 'rgba(56,249,215,0.12)',  color: '#38F9D7' },
  other:    { bg: 'rgba(139,143,168,0.12)', color: '#8B8FA8' },
}

const IntegrationList = () => {
  const [definitions, setDefinitions] = useState([])
  const [installed,   setInstalled]   = useState([])
  const [loading,     setLoading]     = useState(true)
  const [selected,    setSelected]    = useState(null) // { def, inst }
  const [toggling,    setToggling]    = useState(null) // provider being toggled

  const load = async () => {
    setLoading(true)
    try {
      const [defs, inst] = await Promise.all([
        integrationService.getDefinitions(),
        integrationService.list(),
      ])
      setDefinitions(defs.definitions || defs || [])
      setInstalled(inst.integrations || inst || [])
    } catch (err) {
      toast.error('Failed to load integrations')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const getInstalled = (provider) =>
    installed.find(i => i.provider === provider)

  const handleToggle = async (provider, currentActive) => {
    setToggling(provider)
    try {
      await integrationService.setActive(provider, !currentActive)
      setInstalled(prev =>
        prev.map(i => i.provider === provider ? { ...i, is_active: !currentActive } : i)
      )
      toast.success(`Integration ${!currentActive ? 'enabled' : 'disabled'}`)
    } catch {
      toast.error('Failed to update integration')
    } finally {
      setToggling(null)
    }
  }

  if (loading) {
    return (
      <div className="p-8 text-center">
        <div className="animate-spin w-8 h-8 border-2 border-t-transparent rounded-full mx-auto"
          style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
        <p className="mt-2" style={{ color: 'var(--text-muted)' }}>Loading integrations...</p>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 page-enter">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"
            style={{ color: 'var(--text-heading)' }}>
            <Plug className="w-6 h-6" style={{ color: 'var(--accent)' }} />
            Integrations
          </h1>
          <p style={{ color: 'var(--text-muted)' }}>
            Connect external services — email, SMS, webhooks and more
          </p>
        </div>
        <button onClick={load} className="btn-secondary flex items-center gap-2">
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Cards grid */}
      {definitions.length === 0 ? (
        <div className="p-12 text-center rounded-xl"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
          <Plug className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--text-disabled)' }} />
          <p style={{ color: 'var(--text-muted)' }}>No integration providers available</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {definitions.map(def => {
            const inst  = getInstalled(def.provider)
            const color = TYPE_COLORS[def.type] || TYPE_COLORS.other

            return (
              <div
                key={def.provider}
                className="rounded-xl p-5 space-y-4 transition-shadow hover:shadow-md"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}
              >
                {/* Top row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {def.label}
                    </h3>
                    <span
                      className="px-2 py-0.5 rounded-full text-xs font-medium inline-block"
                      style={color}
                    >
                      {def.type}
                    </span>
                  </div>

                  {inst && (
                    toggling === def.provider ? (
                      <Loader2 className="w-5 h-5 animate-spin mt-1 flex-shrink-0"
                        style={{ color: 'var(--accent)' }} />
                    ) : (
                      <button
                        onClick={() => handleToggle(def.provider, inst.is_active)}
                        className="flex-shrink-0 transition-colors mt-0.5"
                        style={{ color: inst.is_active ? '#43E97B' : 'var(--text-disabled)' }}
                        title={inst.is_active ? 'Disable' : 'Enable'}
                      >
                        {inst.is_active
                          ? <ToggleRight className="w-7 h-7" />
                          : <ToggleLeft  className="w-7 h-7" />
                        }
                      </button>
                    )
                  )}
                </div>

                {/* Test status */}
                {inst && (
                  <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                    {inst.last_test_ok === true || inst.last_test_ok === 1
                      ? <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                      : inst.last_test_ok === false || inst.last_test_ok === 0
                        ? <XCircle className="w-3.5 h-3.5 text-red-400" />
                        : null
                    }
                    {inst.last_tested_at
                      ? `Tested ${new Date(inst.last_tested_at).toLocaleDateString()}`
                      : 'Not tested yet'
                    }
                  </div>
                )}

                {/* Action button */}
                <button
                  onClick={() => setSelected({ def, inst })}
                  className="w-full btn-secondary flex items-center justify-center gap-2 text-sm"
                >
                  {inst
                    ? <><Settings className="w-4 h-4" /> Configure</>
                    : <><Plus     className="w-4 h-4" /> Connect</>
                  }
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Config slide-in panel */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-end"
          style={{ background: 'rgba(0,0,0,0.45)' }}
          onClick={() => setSelected(null)}
        >
          <div
            className="h-full w-full max-w-md p-6 overflow-y-auto shadow-2xl"
            style={{ background: 'var(--bg-card)', borderLeft: '1px solid var(--border-card)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-semibold" style={{ color: 'var(--text-heading)' }}>
                  {selected.def.label}
                </h2>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  {selected.inst ? 'Update configuration' : 'Connect this service'}
                </p>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="p-1.5 rounded-lg transition-colors"
                style={{ color: 'var(--text-muted)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = ''}
              >
                ✕
              </button>
            </div>

            <DynamicIntegrationForm
              provider={selected.def.provider}
              definition={selected.def}
              existingData={selected.inst}
              onSaved={() => {
                setSelected(null)
                load()
              }}
              onCancel={() => setSelected(null)}
            />
          </div>
        </div>
      )}
    </div>
  )
}

export default IntegrationList
