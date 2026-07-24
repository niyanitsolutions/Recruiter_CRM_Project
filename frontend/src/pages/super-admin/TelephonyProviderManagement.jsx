import { useState, useEffect, useCallback } from 'react'
import {
  Phone, ChevronDown, Eye, EyeOff, CheckCircle2, XCircle,
  Loader2, Save, Trash2, Zap, AlertTriangle, RefreshCw, Search,
  Shield, Hash, Globe, ToggleLeft, ToggleRight, Key, User,
  Power, AlertCircle, Building2, HeartPulse, Wifi, WifiOff,
} from 'lucide-react'
import toast from 'react-hot-toast'
import telephonyProviderService from '../../services/telephonyProviderService'

// Provider metadata (label/logo/color/description/fields/status/capabilities)
// is fetched from the backend (GET /super-admin/telephony-provider/providers)
// rather than hardcoded here — the backend is the single source of truth for
// which providers are verified vs. blocked and what capabilities each one
// actually has, grounded in the adapters' own CAPABILITIES tables.

const FIELD_LABELS = {
  account_sid:             { label: 'Account SID',              icon: Hash,   type: 'text', placeholder: 'ACxxxxxxxxxxxxxxxx' },
  auth_token:              { label: 'Auth Token',                icon: Shield, type: 'password' },
  from_number:             { label: 'From Number',               icon: Phone,  type: 'text', placeholder: '+1XXXXXXXXXX' },
  twiml_url:               { label: 'TwiML URL',                  icon: Globe,  type: 'text', placeholder: 'https://.../twiml' },
  status_callback_url:     { label: 'Status Callback URL',        icon: Globe,  type: 'text', placeholder: 'https://.../status' },
  api_token:               { label: 'API Token',                  icon: Shield, type: 'password' },
  agent_number:            { label: 'Agent Number',               icon: Phone,  type: 'text' },
  caller_id:               { label: 'Caller ID',                  icon: Phone,  type: 'text' },
  api_base_url:            { label: 'API Base URL',               icon: Globe,  type: 'text', placeholder: 'Provider/region-specific — see adapter docs' },
  sid:                     { label: 'Account SID',                icon: Hash,   type: 'text' },
  api_key:                 { label: 'API Key',                    icon: Key,    type: 'password' },
  exophone:                { label: 'ExoPhone Number',            icon: Phone,  type: 'text' },
  username:                { label: 'Username',                   icon: User,   type: 'text' },
  calls_configuration_id:  { label: 'Calls Configuration ID',     icon: Hash,   type: 'text' },
  webhook_secret:          { label: 'Webhook Shared Secret',      icon: Shield, type: 'password' },
  sr_api_key:              { label: 'SR API Key',                 icon: Shield, type: 'password' },
  application_access_key:  { label: 'Application Access Key',     icon: Shield, type: 'password' },
  sr_number:               { label: 'SR Number',                  icon: Phone,  type: 'text' },
  channel_tier:            { label: 'Plan Tier (Basic/Advance/Premium/Enterprise)', icon: Hash, type: 'text', placeholder: 'Basic' },
  phone_name:              { label: 'Registered Phone/Device Name', icon: Phone, type: 'text' },
  campaign_name:           { label: 'Campaign Name',              icon: Hash,   type: 'text' },
  did:                     { label: 'DID Number',                 icon: Phone,  type: 'text' },
  bridge:                  { label: 'Bridge (Originating DID)',   icon: Phone,  type: 'text' },
  authorization_key:       { label: 'Authorization Key',          icon: Shield, type: 'password' },
  x_api_key:               { label: 'X-API-Key',                  icon: Shield, type: 'password' },
  k_number:                { label: 'K-Number (SR Number)',       icon: Phone,  type: 'text' },
  country_code:            { label: 'Country Code',                icon: Hash,   type: 'text', placeholder: '91' },
}

const SECRET_FIELDS = new Set([
  'auth_token', 'api_token', 'api_key', 'webhook_secret',
  'sr_api_key', 'application_access_key', 'authorization_key', 'x_api_key',
])

// ─── Sub-components ───────────────────────────────────────────────────────────

function SecretInput({ fieldKey, value, masked, hasValue, onChange }) {
  const [show, setShow] = useState(false)
  const [editing, setEditing] = useState(!hasValue)
  const meta = FIELD_LABELS[fieldKey]

  if (!editing && hasValue) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex-1 input-field bg-surface-50 font-mono text-sm text-surface-600 flex items-center gap-2">
          <Shield className="w-4 h-4 text-emerald-500 flex-shrink-0" />
          <span className="truncate">{masked || '●●●●●●●●●●●●'}</span>
        </div>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="px-3 py-2 text-sm font-medium text-primary-600 border border-primary-200 rounded-lg hover:bg-primary-50 transition-colors"
        >
          Replace
        </button>
      </div>
    )
  }

  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        className="input-field pr-10 font-mono text-sm"
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        placeholder={meta?.placeholder || ''}
        autoComplete="new-password"
      />
      <button
        type="button"
        onClick={() => setShow(s => !s)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600"
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  )
}

function ProviderField({ fieldKey, value, masked, hasValue, onChange }) {
  const meta = FIELD_LABELS[fieldKey]
  if (!meta) return null
  if (SECRET_FIELDS.has(fieldKey)) {
    return <SecretInput fieldKey={fieldKey} value={value} masked={masked} hasValue={hasValue} onChange={onChange} />
  }
  return (
    <input
      type="text"
      className="input-field"
      value={value || ''}
      onChange={e => onChange(e.target.value)}
      placeholder={meta.placeholder || ''}
    />
  )
}

function TestResult({ result }) {
  if (!result) return null
  return (
    <div className={`rounded-xl border p-4 ${result.success ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
      <div className="flex items-center gap-2 mb-2">
        {result.success
          ? <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
          : <XCircle className="w-5 h-5 text-red-600 flex-shrink-0" />}
        <span className={`font-semibold ${result.success ? 'text-emerald-800' : 'text-red-800'}`}>{result.message}</span>
      </div>
      {result.steps && Object.keys(result.steps).length > 0 && (
        <div className="mt-2 space-y-1">
          {Object.entries(result.steps).map(([step, status]) => (
            <div key={step} className="flex items-start gap-2 text-sm">
              <span className="text-surface-500 capitalize min-w-[140px]">{step.replace(/_/g, ' ')}:</span>
              <span className={status === 'ok' || String(status).startsWith('ok') ? 'text-emerald-700' : 'text-surface-700'}>{String(status)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function TelephonyProviderManagement() {
  const [providersMeta, setProvidersMeta] = useState({})
  const [providerOrder, setProviderOrder] = useState([])
  const [loadingTenants, setLoadingTenants] = useState(true)
  const [tenants, setTenants] = useState([])
  const [search, setSearch] = useState('')
  const [selectedTenant, setSelectedTenant] = useState(null)

  const [loadingConfig, setLoadingConfig] = useState(false)
  const [tenantConfig, setTenantConfig] = useState(null)
  const [selectedProvider, setSelectedProvider] = useState(null)
  const [formValues, setFormValues] = useState({})

  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [toggling, setToggling] = useState(false)
  const [settingActive, setSettingActive] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [health, setHealth] = useState(null)
  const [healthLoading, setHealthLoading] = useState(false)

  const loadTenants = useCallback(async () => {
    try {
      setLoadingTenants(true)
      const res = await telephonyProviderService.getTenants()
      setTenants(res.data.tenants || [])
    } catch {
      toast.error('Failed to load tenants.')
    } finally {
      setLoadingTenants(false)
    }
  }, [])

  useEffect(() => { loadTenants() }, [loadTenants])

  useEffect(() => {
    telephonyProviderService.getProviders()
      .then(res => {
        setProvidersMeta(res.data?.meta || {})
        setProviderOrder(res.data?.providers || Object.keys(res.data?.meta || {}))
      })
      .catch(() => toast.error('Failed to load provider metadata.'))
  }, [])

  const loadTenantConfig = useCallback(async (companyId) => {
    setLoadingConfig(true)
    setSelectedProvider(null)
    setFormValues({})
    setTestResult(null)
    try {
      const res = await telephonyProviderService.getConfig(companyId)
      setTenantConfig(res.data)
      if (res.data.provider) setSelectedProvider(res.data.provider)
    } catch {
      toast.error('Failed to load telephony configuration for this tenant.')
    } finally {
      setLoadingConfig(false)
    }
  }, [])

  const selectTenant = (companyId) => {
    setSelectedTenant(companyId)
    loadTenantConfig(companyId)
    setHealth(null)
  }

  const checkHealth = async () => {
    if (!selectedTenant) return
    setHealthLoading(true)
    try {
      const res = await telephonyProviderService.getHealth(selectedTenant)
      setHealth(res.data)
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to check provider health.')
    } finally {
      setHealthLoading(false)
    }
  }

  const selectProvider = (provider) => {
    setSelectedProvider(provider)
    setTestResult(null)
    const stored = provider === tenantConfig?.provider ? (tenantConfig?.credentials || {}) : {}
    const merged = {}
    for (const [k, v] of Object.entries(stored)) {
      if (!k.endsWith('_masked') && !k.startsWith('has_')) merged[k] = v
    }
    setFormValues(merged)
  }

  const setField = (key, val) => {
    setFormValues(prev => ({ ...prev, [key]: val }))
    setTestResult(null)
  }

  const refreshTenantRow = (companyId, patch) => {
    setTenants(prev => prev.map(t => (t.company_id === companyId ? { ...t, ...patch } : t)))
  }

  const handleToggle = async () => {
    if (!selectedTenant) return
    const current = tenantConfig?.enabled ?? false
    if (!current && !tenantConfig?.provider) {
      toast.error('Save a provider configuration before enabling telephony for this tenant.')
      return
    }
    setToggling(true)
    try {
      const res = await telephonyProviderService.toggle(selectedTenant, !current)
      setTenantConfig(prev => ({ ...prev, enabled: res.data.enabled }))
      refreshTenantRow(selectedTenant, { telephony_enabled: res.data.enabled })
      toast.success(res.data.message)
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to toggle telephony.')
    } finally {
      setToggling(false)
    }
  }

  const handleTest = async () => {
    if (!selectedTenant || !selectedProvider) return
    setTesting(true)
    setTestResult(null)
    try {
      const res = await telephonyProviderService.testConnection(selectedTenant, selectedProvider, formValues)
      setTestResult(res.data)
    } catch (err) {
      setTestResult({ success: false, message: err?.response?.data?.detail || 'Test failed.', steps: {} })
    } finally {
      setTesting(false)
    }
  }

  const handleSave = async (activate = false) => {
    if (!selectedTenant || !selectedProvider) return
    setSaving(true)
    try {
      const res = await telephonyProviderService.saveConfig(selectedTenant, selectedProvider, formValues, tenantConfig?.caller_ids || [], activate)
      setTenantConfig(res.data)
      refreshTenantRow(selectedTenant, { telephony_enabled: res.data.enabled, telephony_provider: res.data.provider })
      toast.success(activate
        ? `${providersMeta[selectedProvider]?.label} saved and enabled for this tenant.`
        : `${providersMeta[selectedProvider]?.label} configuration saved.`)
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to save configuration.')
    } finally {
      setSaving(false)
    }
  }

  const handleSetActive = async () => {
    if (!selectedTenant || !selectedProvider) return
    setSettingActive(true)
    try {
      const res = await telephonyProviderService.setProvider(selectedTenant, selectedProvider)
      setTenantConfig(prev => ({ ...prev, provider: res.data.provider }))
      refreshTenantRow(selectedTenant, { telephony_provider: res.data.provider })
      toast.success(`${providersMeta[selectedProvider]?.label} is now the active provider for this tenant.`)
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to switch provider.')
    } finally {
      setSettingActive(false)
    }
  }

  const handleDelete = async () => {
    if (!selectedTenant) return
    if (!window.confirm('Remove telephony configuration for this tenant? This disables telephony immediately.')) return
    setDeleting(true)
    try {
      await telephonyProviderService.deleteConfig(selectedTenant)
      setTenantConfig({ configured: false, enabled: false, provider: null, credentials: {}, webhooks: {}, caller_ids: [] })
      setSelectedProvider(null)
      setFormValues({})
      refreshTenantRow(selectedTenant, { telephony_enabled: false, telephony_provider: null })
      toast.success('Telephony configuration removed.')
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to remove configuration.')
    } finally {
      setDeleting(false)
    }
  }

  const filteredTenants = tenants.filter(t =>
    !search || t.company_name?.toLowerCase().includes(search.toLowerCase()) || t.company_id?.toLowerCase().includes(search.toLowerCase())
  )

  const meta = selectedProvider ? providersMeta[selectedProvider] : null
  const activeProvider = tenantConfig?.provider ?? null
  const activeProviderMeta = activeProvider ? providersMeta[activeProvider] : null
  const enabled = tenantConfig?.enabled ?? false
  const storedFields = selectedProvider === activeProvider ? (tenantConfig?.credentials || {}) : {}
  const isBlocked = meta?.status === 'blocked'

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900 flex items-center gap-2">
            <Phone className="w-7 h-7 text-primary-500" />
            Telephony Integrations
          </h1>
          <p className="text-surface-500 mt-1">
            Enable exactly one calling provider per tenant. Disabled by default — the Telephony menu
            only appears for tenants configured here.
          </p>
        </div>
        <button
          onClick={() => { loadTenants(); if (selectedTenant) loadTenantConfig(selectedTenant) }}
          className="p-2 text-surface-400 hover:text-surface-600 rounded-lg hover:bg-surface-100 transition-colors"
          title="Refresh"
        >
          <RefreshCw className="w-5 h-5" />
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

        {/* ── Tenant list ────────────────────────────────────────────────────── */}
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search tenants..."
              className="input-field pl-9"
            />
          </div>
          {loadingTenants ? (
            <div className="flex items-center justify-center h-32"><Loader2 className="w-6 h-6 animate-spin text-primary-500" /></div>
          ) : (
            <div className="space-y-1.5 max-h-[70vh] overflow-y-auto pr-1">
              {filteredTenants.map(t => (
                <button
                  key={t.company_id}
                  onClick={() => selectTenant(t.company_id)}
                  className={`w-full flex items-center gap-2.5 p-2.5 rounded-xl border-2 text-left transition-all ${
                    selectedTenant === t.company_id ? 'border-primary-400 bg-primary-50' : 'border-surface-200 bg-white hover:border-surface-300'
                  }`}
                >
                  <Building2 className="w-4 h-4 text-surface-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-surface-900 truncate">{t.company_name || t.company_id}</p>
                    <p className="text-xs text-surface-400 truncate">{t.company_id}</p>
                  </div>
                  {t.telephony_enabled && (
                    <span className="text-xs font-semibold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-full flex-shrink-0">ON</span>
                  )}
                </button>
              ))}
              {filteredTenants.length === 0 && <p className="text-sm text-surface-400 text-center py-6">No tenants found.</p>}
            </div>
          )}
        </div>

        {/* ── Config panel ─────────────────────────────────────────────────── */}
        <div className="lg:col-span-3 space-y-4">
          {!selectedTenant ? (
            <div className="h-full flex items-center justify-center bg-surface-50 rounded-2xl border-2 border-dashed border-surface-200 p-12">
              <div className="text-center">
                <Building2 className="w-12 h-12 text-surface-300 mx-auto mb-3" />
                <p className="text-surface-500 font-medium">Select a tenant</p>
                <p className="text-surface-400 text-sm mt-1">Configure and enable a telephony provider for the selected tenant.</p>
              </div>
            </div>
          ) : loadingConfig ? (
            <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary-500" /></div>
          ) : (
            <>
              {/* Enable/disable toggle */}
              <div className={`rounded-2xl border-2 p-5 flex items-center justify-between ${enabled ? 'border-emerald-300 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-xl ${enabled ? 'bg-emerald-100' : 'bg-red-100'}`}>
                    <Power className={`w-6 h-6 ${enabled ? 'text-emerald-600' : 'text-red-500'}`} />
                  </div>
                  <div>
                    <p className="font-semibold text-surface-900">Enable Telephony</p>
                    <p className="text-sm text-surface-500">
                      {enabled
                        ? `Enabled — using ${activeProviderMeta?.label ?? activeProvider}. The Telephony menu is visible to this tenant.`
                        : 'Disabled. This tenant sees today\'s CRM with no Telephony menu.'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleToggle}
                  disabled={toggling || (!enabled && activeProviderMeta?.status === 'blocked')}
                  title={!enabled && activeProviderMeta?.status === 'blocked' ? 'This provider is blocked — see the badge below for why.' : ''}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-colors disabled:opacity-50"
                  style={{ background: enabled ? '#ef4444' : '#10b981', color: '#fff' }}
                >
                  {toggling ? <Loader2 className="w-4 h-4 animate-spin" /> : enabled ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                  {enabled ? 'Disable' : 'Enable'}
                </button>
              </div>

              {/* Provider health — on-demand only, never auto-polled */}
              {tenantConfig?.provider && (
                <div className="bg-white rounded-2xl border border-surface-200 p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-surface-700 flex items-center gap-1.5">
                      <HeartPulse className="w-4 h-4 text-primary-500" /> Provider Health
                    </h3>
                    <button
                      onClick={checkHealth}
                      disabled={healthLoading}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-surface-300 text-xs font-medium text-surface-700 hover:bg-surface-50 disabled:opacity-50"
                    >
                      {healthLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                      Check Now
                    </button>
                  </div>
                  {!health ? (
                    <p className="text-xs text-surface-400">Not checked yet — click "Check Now" for a live, on-demand connection test (no background polling).</p>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                      <div className="flex items-center gap-2">
                        {health.connection?.success ? <Wifi className="w-4 h-4 text-emerald-500" /> : <WifiOff className="w-4 h-4 text-red-500" />}
                        <span className={health.connection?.success ? 'text-emerald-700' : 'text-red-700'}>{health.connection?.message}</span>
                      </div>
                      <div><span className="text-surface-400">Last Sync:</span> {health.last_sync_at ? new Date(health.last_sync_at).toLocaleString() : '—'}</div>
                      <div><span className="text-surface-400">Errors (24h):</span> {health.error_count_24h}</div>
                      <div><span className="text-surface-400">Last Webhook:</span> {health.last_webhook_at ? new Date(health.last_webhook_at).toLocaleString() : '—'}</div>
                      <div><span className="text-surface-400">Webhooks (24h):</span> {health.webhook_count_24h}</div>
                      <div><span className="text-surface-400">Token Expiry:</span> {health.token_expiry}</div>
                    </div>
                  )}
                </div>
              )}

              {!tenantConfig?.provider && (
                <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-800">
                  <AlertCircle className="w-5 h-5 flex-shrink-0 text-amber-500" />
                  <p className="text-sm">No provider configured yet for this tenant. Choose one below, enter credentials, test the connection, then save.</p>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Provider list */}
                <div className="space-y-2">
                  <h2 className="text-sm font-semibold text-surface-500 uppercase tracking-wide px-1">Providers</h2>
                  {providerOrder.map(provider => {
                    const pmeta = providersMeta[provider]
                    if (!pmeta) return null
                    const isActive = activeProvider === provider
                    const isSelected = selectedProvider === provider
                    const blocked = pmeta.status === 'blocked'
                    return (
                      <button
                        key={provider}
                        onClick={() => selectProvider(provider)}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                          isSelected ? 'border-primary-400 bg-primary-50' : 'border-surface-200 bg-white hover:border-surface-300 hover:bg-surface-50'
                        } ${blocked ? 'opacity-70' : ''}`}
                      >
                        <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${pmeta.color} flex items-center justify-center text-white font-bold text-xs flex-shrink-0`}>
                          {pmeta.logo}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-surface-900 text-sm truncate">{pmeta.label}</p>
                          {blocked && <p className="text-[10px] text-red-600">blocked — docs unverified</p>}
                        </div>
                        {isActive && <span className="text-xs font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full flex-shrink-0">ACTIVE</span>}
                      </button>
                    )
                  })}
                </div>

                {/* Form */}
                <div className="md:col-span-2">
                  {!selectedProvider ? (
                    <div className="h-full flex items-center justify-center bg-surface-50 rounded-2xl border-2 border-dashed border-surface-200 p-10">
                      <p className="text-surface-400 text-sm">Select a provider to configure.</p>
                    </div>
                  ) : (
                    <div className="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden">
                      <div className={`bg-gradient-to-r ${meta.color} p-5`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-11 h-11 bg-white/20 rounded-xl flex items-center justify-center text-white font-bold">{meta.logo}</div>
                            <div>
                              <h2 className="text-lg font-bold text-white">{meta.label}</h2>
                              <p className="text-white/80 text-xs">{meta.description}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {isBlocked && (
                              <span className="bg-red-500/90 text-white text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" /> Blocked
                              </span>
                            )}
                            {activeProvider === selectedProvider && (
                              <button
                                onClick={handleDelete}
                                disabled={deleting}
                                className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors text-white"
                                title="Remove configuration"
                              >
                                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="p-5 space-y-4">
                        {meta.fields.map(fieldKey => {
                          const fmeta = FIELD_LABELS[fieldKey]
                          if (!fmeta) return null
                          const Icon = fmeta.icon
                          const isSecret = SECRET_FIELDS.has(fieldKey)
                          return (
                            <div key={fieldKey}>
                              <label className="flex items-center gap-1.5 text-sm font-medium text-surface-700 mb-1.5">
                                <Icon className="w-3.5 h-3.5 text-surface-400" />
                                {fmeta.label}
                                {isSecret && <span className="text-xs text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full ml-1">encrypted</span>}
                              </label>
                              <ProviderField
                                fieldKey={fieldKey}
                                value={formValues[fieldKey] ?? ''}
                                masked={storedFields[`${fieldKey}_masked`]}
                                hasValue={!!storedFields[`has_${fieldKey}`]}
                                onChange={val => setField(fieldKey, val)}
                              />
                            </div>
                          )
                        })}

                        {testResult && <TestResult result={testResult} />}

                        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-surface-100">
                          <button
                            onClick={handleTest}
                            disabled={testing || saving}
                            className="flex items-center gap-2 px-4 py-2 border border-surface-300 rounded-xl text-sm font-medium text-surface-700 hover:bg-surface-50 transition-colors disabled:opacity-50"
                          >
                            {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                            Test Connection
                          </button>

                          <button
                            onClick={() => handleSave(false)}
                            disabled={saving || testing}
                            className="flex items-center gap-2 px-4 py-2 bg-surface-800 text-white rounded-xl text-sm font-medium hover:bg-surface-700 transition-colors disabled:opacity-50"
                          >
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            Save
                          </button>

                          <button
                            onClick={() => handleSave(true)}
                            disabled={saving || testing || isBlocked}
                            title={isBlocked ? 'This provider is blocked — see the badge above for why.' : ''}
                            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50"
                          >
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                            Save & Enable
                          </button>

                          {activeProvider !== selectedProvider && tenantConfig?.provider === selectedProvider && (
                            <button
                              onClick={handleSetActive}
                              disabled={settingActive || isBlocked}
                              title={isBlocked ? 'This provider is blocked — see the badge above for why.' : ''}
                              className="flex items-center gap-2 px-4 py-2 border border-emerald-300 text-emerald-700 rounded-xl text-sm font-medium hover:bg-emerald-50 transition-colors disabled:opacity-50 ml-auto"
                            >
                              {settingActive ? <Loader2 className="w-4 h-4 animate-spin" /> : <Power className="w-4 h-4" />}
                              Set as Active
                            </button>
                          )}
                        </div>

                        <p className="text-xs text-surface-400 flex items-center gap-1">
                          <Shield className="w-3 h-3" />
                          Secret fields are encrypted at rest and never returned in plain text.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
