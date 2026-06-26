import { useState, useEffect, useCallback } from 'react'
import {
  CreditCard, ChevronDown, Eye, EyeOff, CheckCircle2, XCircle,
  Loader2, Save, Trash2, Zap, AlertTriangle, RefreshCw,
  Shield, Clock, RotateCcw, Link2, Hash, Globe, ToggleLeft, ToggleRight,
  Settings, Power, AlertCircle,
} from 'lucide-react'
import toast from 'react-hot-toast'
import paymentProviderService from '../../services/paymentProviderService'

// ─── Provider metadata (mirrors backend PROVIDER_META) ───────────────────────

const PROVIDER_META = {
  razorpay: {
    label: 'Razorpay',
    logo: '₹',
    color: 'from-blue-600 to-blue-400',
    badge: 'bg-blue-100 text-blue-700',
    description: "India's leading payment gateway — UPI, cards, net banking, wallets",
    fields: ['key_id', 'key_secret', 'webhook_secret', 'environment', 'currency', 'timeout', 'retry_count'],
    environments: ['sandbox', 'production'],
  },
  stripe: {
    label: 'Stripe',
    logo: 'S',
    color: 'from-violet-600 to-violet-400',
    badge: 'bg-violet-100 text-violet-700',
    description: 'Global payments platform — cards, bank transfers, international',
    fields: ['publishable_key', 'secret_key', 'webhook_secret', 'environment', 'currency', 'timeout', 'retry_count'],
    environments: ['test', 'live'],
  },
  cashfree: {
    label: 'Cashfree',
    logo: 'C',
    color: 'from-emerald-600 to-emerald-400',
    badge: 'bg-emerald-100 text-emerald-700',
    description: 'Fast settlements with UPI, cards, and bank transfers',
    fields: ['client_id', 'client_secret', 'environment', 'currency', 'timeout', 'retry_count'],
    environments: ['sandbox', 'production'],
  },
  phonepe: {
    label: 'PhonePe',
    logo: 'P',
    color: 'from-purple-600 to-purple-400',
    badge: 'bg-purple-100 text-purple-700',
    description: 'UPI-first payment gateway by PhonePe',
    fields: ['merchant_id', 'salt_key', 'salt_index', 'environment', 'currency', 'timeout', 'retry_count'],
    environments: ['sandbox', 'production'],
  },
  payu: {
    label: 'PayU',
    logo: 'U',
    color: 'from-orange-600 to-orange-400',
    badge: 'bg-orange-100 text-orange-700',
    description: 'Multi-payment gateway with broad bank coverage',
    fields: ['merchant_key', 'merchant_salt', 'auth_header', 'environment', 'currency', 'timeout', 'retry_count'],
    environments: ['test', 'production'],
  },
  paypal: {
    label: 'PayPal',
    logo: 'PP',
    color: 'from-blue-500 to-cyan-400',
    badge: 'bg-blue-100 text-blue-700',
    description: 'Global payments with 400M+ users worldwide',
    fields: ['client_id', 'client_secret', 'environment', 'currency', 'timeout', 'retry_count'],
    environments: ['sandbox', 'live'],
  },
  ccavenue: {
    label: 'CCAvenue',
    logo: 'CC',
    color: 'from-red-600 to-red-400',
    badge: 'bg-red-100 text-red-700',
    description: "India's largest payment aggregator",
    fields: ['merchant_id', 'access_code', 'working_key', 'environment', 'currency', 'timeout', 'retry_count'],
    environments: ['test', 'production'],
  },
  instamojo: {
    label: 'Instamojo',
    logo: 'IM',
    color: 'from-teal-600 to-teal-400',
    badge: 'bg-teal-100 text-teal-700',
    description: 'Simple payment links and API for Indian SMEs',
    fields: ['api_key', 'auth_token', 'environment', 'currency', 'timeout', 'retry_count'],
    environments: ['test', 'production'],
  },
  custom: {
    label: 'Custom REST API',
    logo: '⚙',
    color: 'from-slate-600 to-gray-400',
    badge: 'bg-slate-100 text-slate-700',
    description: 'Any payment gateway with a REST API',
    fields: ['base_url', 'api_key', 'secret', 'auth_type', 'environment', 'currency', 'timeout', 'retry_count'],
    environments: ['test', 'production'],
  },
}

const FIELD_LABELS = {
  key_id:          { label: 'Key ID',               icon: Hash,    type: 'text',     placeholder: 'rzp_test_xxxxxxxxxxxx', secret: false },
  key_secret:      { label: 'Key Secret',            icon: Shield,  type: 'password', placeholder: 'Enter Key Secret', secret: true },
  publishable_key: { label: 'Publishable Key',       icon: Hash,    type: 'password', placeholder: 'pk_test_xxxxxxxxxxxx', secret: true },
  secret_key:      { label: 'Secret Key',            icon: Shield,  type: 'password', placeholder: 'sk_test_xxxxxxxxxxxx', secret: true },
  webhook_secret:  { label: 'Webhook Secret',        icon: Shield,  type: 'password', placeholder: 'Enter Webhook Secret', secret: true },
  client_id:       { label: 'Client ID',             icon: Hash,    type: 'text',     placeholder: 'Enter Client ID', secret: false },
  client_secret:   { label: 'Client Secret',         icon: Shield,  type: 'password', placeholder: 'Enter Client Secret', secret: true },
  merchant_id:     { label: 'Merchant ID',           icon: Hash,    type: 'text',     placeholder: 'Enter Merchant ID', secret: false },
  salt_key:        { label: 'Salt Key',              icon: Shield,  type: 'password', placeholder: 'Enter Salt Key', secret: true },
  salt_index:      { label: 'Salt Index',            icon: Hash,    type: 'text',     placeholder: '1', secret: false },
  merchant_key:    { label: 'Merchant Key',          icon: Hash,    type: 'text',     placeholder: 'Enter Merchant Key', secret: false },
  merchant_salt:   { label: 'Merchant Salt',         icon: Shield,  type: 'password', placeholder: 'Enter Merchant Salt', secret: true },
  auth_header:     { label: 'Auth Header (Optional)', icon: Shield, type: 'password', placeholder: 'Authorization header value', secret: true },
  access_code:     { label: 'Access Code',           icon: Hash,    type: 'text',     placeholder: 'Enter Access Code', secret: false },
  working_key:     { label: 'Working Key',           icon: Shield,  type: 'password', placeholder: 'Enter Working Key', secret: true },
  api_key:         { label: 'API Key',               icon: Shield,  type: 'password', placeholder: 'Enter API Key', secret: true },
  auth_token:      { label: 'Auth Token',            icon: Shield,  type: 'password', placeholder: 'Enter Auth Token', secret: true },
  base_url:        { label: 'Base URL',              icon: Link2,   type: 'text',     placeholder: 'https://your-payment-api.example.com', secret: false },
  secret:          { label: 'Secret',                icon: Shield,  type: 'password', placeholder: 'API secret', secret: true },
  auth_type:       { label: 'Auth Type',             icon: Settings, type: 'select',  options: ['bearer', 'api_key', 'basic'], secret: false },
  environment:     { label: 'Environment',           icon: Globe,   type: 'env-select', secret: false },
  currency:        { label: 'Currency',              icon: CreditCard, type: 'text',  placeholder: 'INR', secret: false },
  timeout:         { label: 'Timeout (seconds)',     icon: Clock,   type: 'number',   placeholder: '30', min: 5, max: 300 },
  retry_count:     { label: 'Retry Count',           icon: RotateCcw, type: 'number', placeholder: '2', min: 0, max: 5 },
}

const SECRET_FIELDS = new Set([
  'key_secret', 'webhook_secret', 'client_secret', 'salt_key', 'merchant_salt',
  'auth_header', 'working_key', 'auth_token', 'secret', 'publishable_key', 'secret_key', 'api_key',
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
          <span className="truncate">{masked || '●●●●●●●●●●●●●●●●●●●●'}</span>
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
        value={value}
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

function ProviderField({ fieldKey, value, masked, hasValue, onChange, environments }) {
  const meta = FIELD_LABELS[fieldKey]
  if (!meta) return null

  const isSecret = SECRET_FIELDS.has(fieldKey)

  if (isSecret) {
    return (
      <SecretInput
        fieldKey={fieldKey}
        value={value}
        masked={masked}
        hasValue={hasValue}
        onChange={onChange}
      />
    )
  }

  if (meta.type === 'env-select') {
    return (
      <div className="relative">
        <select
          className="input-field appearance-none pr-8"
          value={value}
          onChange={e => onChange(e.target.value)}
        >
          {(environments || ['sandbox', 'production']).map(env => (
            <option key={env} value={env}>{env.charAt(0).toUpperCase() + env.slice(1)}</option>
          ))}
        </select>
        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400 pointer-events-none" />
      </div>
    )
  }

  if (meta.type === 'select') {
    return (
      <div className="relative">
        <select
          className="input-field appearance-none pr-8"
          value={value}
          onChange={e => onChange(e.target.value)}
        >
          {(meta.options || []).map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400 pointer-events-none" />
      </div>
    )
  }

  if (meta.type === 'number') {
    return (
      <input
        type="number"
        className="input-field"
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        placeholder={meta.placeholder}
        min={meta.min}
        max={meta.max}
      />
    )
  }

  return (
    <input
      type="text"
      className="input-field"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={meta.placeholder || ''}
    />
  )
}

// ─── Test result display ──────────────────────────────────────────────────────

function TestResult({ result }) {
  if (!result) return null
  return (
    <div className={`rounded-xl border p-4 ${result.success ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
      <div className="flex items-center gap-2 mb-2">
        {result.success
          ? <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
          : <XCircle className="w-5 h-5 text-red-600 flex-shrink-0" />}
        <span className={`font-semibold ${result.success ? 'text-emerald-800' : 'text-red-800'}`}>
          {result.message}
        </span>
      </div>
      {result.steps && Object.keys(result.steps).length > 0 && (
        <div className="mt-2 space-y-1">
          {Object.entries(result.steps).map(([step, status]) => (
            <div key={step} className="flex items-start gap-2 text-sm">
              <span className="text-surface-500 capitalize min-w-[140px]">{step.replace(/_/g, ' ')}:</span>
              <span className={status === 'ok' || String(status).startsWith('ok') ? 'text-emerald-700' : 'text-surface-700'}>
                {String(status)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

const PROVIDER_ORDER = ['razorpay', 'stripe', 'cashfree', 'phonepe', 'payu', 'paypal', 'ccavenue', 'instamojo', 'custom']

function buildDefaultConfig(provider) {
  const envs = PROVIDER_META[provider]?.environments || ['sandbox', 'production']
  return {
    environment: envs[0],
    currency: ['stripe', 'paypal'].includes(provider) ? 'USD' : 'INR',
    timeout: 30,
    retry_count: 2,
  }
}

export default function PaymentProviderManagement() {
  const [loading, setLoading] = useState(true)
  const [globalConfig, setGlobalConfig] = useState(null)
  const [selectedProvider, setSelectedProvider] = useState(null)
  const [formValues, setFormValues] = useState({})
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [togglingPayments, setTogglingPayments] = useState(false)
  const [settingActive, setSettingActive] = useState(false)
  const [deletingProvider, setDeletingProvider] = useState(null)

  // ── Load config ─────────────────────────────────────────────────────────────

  const loadConfig = useCallback(async () => {
    try {
      setLoading(true)
      const res = await paymentProviderService.getConfig()
      setGlobalConfig(res.data)
    } catch {
      toast.error('Failed to load payment provider configuration.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadConfig() }, [loadConfig])

  // ── Select provider ──────────────────────────────────────────────────────────

  const selectProvider = (provider) => {
    setSelectedProvider(provider)
    setTestResult(null)

    const stored = (globalConfig?.providers || {})[provider] || {}
    const defaults = buildDefaultConfig(provider)

    // Merge stored plain fields (non-masked) with defaults
    const merged = { ...defaults }
    for (const [k, v] of Object.entries(stored)) {
      if (!k.endsWith('_masked') && !k.startsWith('has_')) {
        merged[k] = v
      }
    }
    setFormValues(merged)
  }

  // ── Form field change ────────────────────────────────────────────────────────

  const setField = (key, val) => {
    setFormValues(prev => ({ ...prev, [key]: val }))
    setTestResult(null)
  }

  // ── Toggle global payments enabled ───────────────────────────────────────────

  const handleTogglePayments = async () => {
    const current = globalConfig?.payments_enabled ?? false
    setTogglingPayments(true)
    try {
      const res = await paymentProviderService.togglePayments(!current)
      setGlobalConfig(prev => ({ ...prev, payments_enabled: res.data.payments_enabled }))
      toast.success(res.data.message)
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to toggle payments.')
    } finally {
      setTogglingPayments(false)
    }
  }

  // ── Test connection ──────────────────────────────────────────────────────────

  const handleTest = async () => {
    if (!selectedProvider) return
    setTesting(true)
    setTestResult(null)
    try {
      const res = await paymentProviderService.testConnection(selectedProvider, formValues)
      setTestResult(res.data)
    } catch (err) {
      setTestResult({
        success: false,
        message: err?.response?.data?.detail || 'Test failed.',
        steps: {},
      })
    } finally {
      setTesting(false)
    }
  }

  // ── Save config ──────────────────────────────────────────────────────────────

  const handleSave = async (activate = false) => {
    if (!selectedProvider) return
    setSaving(true)
    try {
      const res = await paymentProviderService.saveProvider(selectedProvider, formValues, activate)
      setGlobalConfig(res.data)
      toast.success(
        activate
          ? `${PROVIDER_META[selectedProvider].label} saved and set as active provider.`
          : `${PROVIDER_META[selectedProvider].label} configuration saved.`
      )
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to save configuration.')
    } finally {
      setSaving(false)
    }
  }

  // ── Set active provider ──────────────────────────────────────────────────────

  const handleSetActive = async (provider) => {
    setSettingActive(true)
    try {
      const res = await paymentProviderService.setActive(provider)
      setGlobalConfig(prev => ({ ...prev, active_provider: res.data.active_provider }))
      toast.success(`${PROVIDER_META[provider].label} is now the active provider.`)
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to switch provider.')
    } finally {
      setSettingActive(false)
    }
  }

  // ── Delete provider config ───────────────────────────────────────────────────

  const handleDelete = async (provider) => {
    if (!window.confirm(`Remove all configuration for ${PROVIDER_META[provider].label}?`)) return
    setDeletingProvider(provider)
    try {
      const res = await paymentProviderService.deleteProvider(provider)
      setGlobalConfig(res.data)
      if (selectedProvider === provider) {
        setSelectedProvider(null)
        setFormValues({})
      }
      toast.success(`${PROVIDER_META[provider].label} configuration removed.`)
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to remove provider.')
    } finally {
      setDeletingProvider(null)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    )
  }

  const paymentsEnabled = globalConfig?.payments_enabled ?? false
  const activeProvider  = globalConfig?.active_provider ?? null
  const providers       = globalConfig?.providers ?? {}
  const meta            = selectedProvider ? PROVIDER_META[selectedProvider] : null
  const storedFields    = selectedProvider ? (providers[selectedProvider] || {}) : {}

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900 flex items-center gap-2">
            <CreditCard className="w-7 h-7 text-primary-500" />
            Payment Provider Management
          </h1>
          <p className="text-surface-500 mt-1">
            Configure payment gateways. Only one provider can be active at a time.
          </p>
        </div>
        <button
          onClick={loadConfig}
          className="p-2 text-surface-400 hover:text-surface-600 rounded-lg hover:bg-surface-100 transition-colors"
          title="Refresh"
        >
          <RefreshCw className="w-5 h-5" />
        </button>
      </div>

      {/* ── Global Payments Toggle ──────────────────────────────────────────── */}
      <div className={`rounded-2xl border-2 p-5 flex items-center justify-between ${
        paymentsEnabled ? 'border-emerald-300 bg-emerald-50' : 'border-red-200 bg-red-50'
      }`}>
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-xl ${paymentsEnabled ? 'bg-emerald-100' : 'bg-red-100'}`}>
            <Power className={`w-6 h-6 ${paymentsEnabled ? 'text-emerald-600' : 'text-red-500'}`} />
          </div>
          <div>
            <p className="font-semibold text-surface-900">Enable Payments</p>
            <p className="text-sm text-surface-500">
              {paymentsEnabled
                ? `Payments are enabled${activeProvider ? ` — using ${PROVIDER_META[activeProvider]?.label ?? activeProvider}` : ' — no active provider set'}`
                : 'Payments are disabled. Users cannot make purchases.'}
            </p>
          </div>
        </div>
        <button
          onClick={handleTogglePayments}
          disabled={togglingPayments}
          className="flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-colors disabled:opacity-50"
          style={{ background: paymentsEnabled ? '#ef4444' : '#10b981', color: '#fff' }}
        >
          {togglingPayments ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : paymentsEnabled ? (
            <ToggleRight className="w-5 h-5" />
          ) : (
            <ToggleLeft className="w-5 h-5" />
          )}
          {paymentsEnabled ? 'Disable Payments' : 'Enable Payments'}
        </button>
      </div>

      {/* ── Payments disabled notice ─────────────────────────────────────────── */}
      {!paymentsEnabled && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-800">
          <AlertCircle className="w-5 h-5 flex-shrink-0 text-amber-500" />
          <p className="text-sm">
            Payments are currently <strong>disabled</strong>. Payment buttons will be hidden for
            all tenants and no payment requests will reach any provider.
            Enable payments above after configuring an active provider.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Provider list ─────────────────────────────────────────────────── */}
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-surface-500 uppercase tracking-wide px-1">Providers</h2>
          {PROVIDER_ORDER.map(provider => {
            const pmeta = PROVIDER_META[provider]
            const isActive   = activeProvider === provider
            const isSelected = selectedProvider === provider
            const isConfigured = !!providers[provider]

            return (
              <button
                key={provider}
                onClick={() => selectProvider(provider)}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                  isSelected
                    ? 'border-primary-400 bg-primary-50'
                    : 'border-surface-200 bg-white hover:border-surface-300 hover:bg-surface-50'
                }`}
              >
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${pmeta.color} flex items-center justify-center text-white font-bold text-sm flex-shrink-0`}>
                  {pmeta.logo}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-surface-900 text-sm truncate">{pmeta.label}</p>
                  <p className="text-xs text-surface-400 truncate">{pmeta.description}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {isActive && (
                    <span className="text-xs font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                      ACTIVE
                    </span>
                  )}
                  {isConfigured && !isActive && (
                    <span className="text-xs text-surface-400 bg-surface-100 px-2 py-0.5 rounded-full">
                      saved
                    </span>
                  )}
                </div>
              </button>
            )
          })}
        </div>

        {/* ── Provider config form ─────────────────────────────────────────── */}
        <div className="lg:col-span-2">
          {!selectedProvider ? (
            <div className="h-full flex items-center justify-center bg-surface-50 rounded-2xl border-2 border-dashed border-surface-200 p-12">
              <div className="text-center">
                <CreditCard className="w-12 h-12 text-surface-300 mx-auto mb-3" />
                <p className="text-surface-500 font-medium">Select a payment provider</p>
                <p className="text-surface-400 text-sm mt-1">Configure credentials and test the connection before activating.</p>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden">
              {/* Provider header */}
              <div className={`bg-gradient-to-r ${meta.color} p-5`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center text-white font-bold text-lg">
                      {meta.logo}
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-white">{meta.label}</h2>
                      <p className="text-white/80 text-sm">{meta.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {activeProvider === selectedProvider && (
                      <span className="bg-white/20 text-white text-xs font-bold px-3 py-1 rounded-full">
                        ✓ ACTIVE
                      </span>
                    )}
                    {providers[selectedProvider] && (
                      <button
                        onClick={() => handleDelete(selectedProvider)}
                        disabled={deletingProvider === selectedProvider}
                        className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors text-white"
                        title="Remove this provider's configuration"
                      >
                        {deletingProvider === selectedProvider
                          ? <Loader2 className="w-4 h-4 animate-spin" />
                          : <Trash2 className="w-4 h-4" />}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Form body */}
              <div className="p-5 space-y-4">
                {meta.fields.map(fieldKey => {
                  const fmeta = FIELD_LABELS[fieldKey]
                  if (!fmeta) return null
                  const Icon = fmeta.icon
                  const isSecret = SECRET_FIELDS.has(fieldKey)
                  const maskedKey = `${fieldKey}_masked`
                  const hasKey = `has_${fieldKey}`

                  return (
                    <div key={fieldKey}>
                      <label className="flex items-center gap-1.5 text-sm font-medium text-surface-700 mb-1.5">
                        <Icon className="w-3.5 h-3.5 text-surface-400" />
                        {fmeta.label}
                        {isSecret && (
                          <span className="text-xs text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full ml-1">encrypted</span>
                        )}
                      </label>
                      <ProviderField
                        fieldKey={fieldKey}
                        value={formValues[fieldKey] ?? (fieldKey === 'environment' ? (meta.environments?.[0] ?? 'sandbox') : fieldKey === 'currency' ? 'INR' : fieldKey === 'timeout' ? 30 : fieldKey === 'retry_count' ? 2 : '')}
                        masked={storedFields[maskedKey]}
                        hasValue={!!storedFields[hasKey]}
                        onChange={val => setField(fieldKey, val)}
                        environments={meta.environments}
                      />
                    </div>
                  )
                })}

                {/* Test result */}
                {testResult && <TestResult result={testResult} />}

                {/* Actions */}
                <div className="flex items-center gap-3 pt-2 border-t border-surface-100">
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

                  {activeProvider !== selectedProvider && (
                    <button
                      onClick={() => handleSave(true)}
                      disabled={saving || testing}
                      className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50"
                    >
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                      Save & Activate
                    </button>
                  )}

                  {activeProvider !== selectedProvider && providers[selectedProvider] && (
                    <button
                      onClick={() => handleSetActive(selectedProvider)}
                      disabled={settingActive}
                      className="flex items-center gap-2 px-4 py-2 border border-emerald-300 text-emerald-700 rounded-xl text-sm font-medium hover:bg-emerald-50 transition-colors disabled:opacity-50 ml-auto"
                    >
                      {settingActive ? <Loader2 className="w-4 h-4 animate-spin" /> : <Power className="w-4 h-4" />}
                      Set as Active
                    </button>
                  )}
                </div>

                {/* Security note */}
                <p className="text-xs text-surface-400 flex items-center gap-1">
                  <Shield className="w-3 h-3" />
                  Secret keys are encrypted at rest and never returned in plain text.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
