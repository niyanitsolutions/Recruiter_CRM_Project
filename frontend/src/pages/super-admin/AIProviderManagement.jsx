import { useState, useEffect, useCallback } from 'react'
import {
  Brain, ChevronDown, Eye, EyeOff, CheckCircle2, XCircle,
  Loader2, Save, Trash2, Zap, AlertTriangle, RefreshCw,
  Settings, Shield, Clock, RotateCcw, Link2, Hash, Server,
} from 'lucide-react'
import toast from 'react-hot-toast'
import aiProviderService from '../../services/aiProviderService'

// ─── Provider metadata ────────────────────────────────────────────────────────

const PROVIDER_META = {
  gemini: {
    label: 'Gemini AI',
    logo: '✦',
    color: 'from-blue-500 to-cyan-400',
    badge: 'bg-blue-100 text-blue-700',
    description: 'Google Gemini — multimodal AI with strong reasoning',
    fields: ['api_key', 'model', 'region', 'temperature', 'max_tokens', 'timeout', 'retry_count'],
  },
  openai: {
    label: 'OpenAI (ChatGPT)',
    logo: '⬡',
    color: 'from-emerald-500 to-teal-400',
    badge: 'bg-emerald-100 text-emerald-700',
    description: 'OpenAI GPT models — industry-leading language AI',
    fields: ['api_key', 'model', 'organization_id', 'project_id', 'temperature', 'max_tokens', 'timeout', 'retry_count'],
  },
  claude: {
    label: 'Claude AI',
    logo: '◈',
    color: 'from-orange-500 to-amber-400',
    badge: 'bg-orange-100 text-orange-700',
    description: 'Anthropic Claude — safe and capable AI assistant',
    fields: ['api_key', 'model', 'temperature', 'max_tokens', 'timeout', 'retry_count'],
  },
  deepseek: {
    label: 'DeepSeek AI',
    logo: '◉',
    color: 'from-violet-500 to-purple-400',
    badge: 'bg-violet-100 text-violet-700',
    description: 'DeepSeek — powerful open-source reasoning models',
    fields: ['api_key', 'model', 'temperature', 'max_tokens', 'timeout', 'retry_count'],
  },
  azure_openai: {
    label: 'Azure OpenAI',
    logo: '⬡',
    color: 'from-blue-600 to-blue-400',
    badge: 'bg-blue-100 text-blue-700',
    description: 'Microsoft Azure-hosted OpenAI models with enterprise SLAs',
    fields: ['api_key', 'azure_endpoint', 'model', 'api_version', 'region', 'temperature', 'max_tokens', 'timeout', 'retry_count'],
  },
  openrouter: {
    label: 'OpenRouter',
    logo: '⇄',
    color: 'from-pink-500 to-rose-400',
    badge: 'bg-pink-100 text-pink-700',
    description: 'OpenRouter — unified gateway to 200+ AI models',
    fields: ['api_key', 'model', 'temperature', 'max_tokens', 'timeout', 'retry_count'],
  },
  custom: {
    label: 'Custom REST API',
    logo: '⚙',
    color: 'from-slate-500 to-gray-400',
    badge: 'bg-slate-100 text-slate-700',
    description: 'Any OpenAI-compatible REST endpoint',
    fields: ['api_key', 'base_url', 'model', 'temperature', 'max_tokens', 'timeout', 'retry_count'],
  },
}

const FIELD_LABELS = {
  api_key:         { label: 'API Key',           icon: Shield,   type: 'password', placeholder: 'Enter your API key' },
  model:           { label: 'Model',             icon: Brain,    type: 'text',     placeholder: 'e.g. gemini-2.0-flash' },
  region:          { label: 'Region (Optional)', icon: Server,   type: 'text',     placeholder: 'e.g. us-central1' },
  organization_id: { label: 'Organization ID (Optional)', icon: Hash, type: 'text', placeholder: 'org-xxxxxxxxxxxx' },
  project_id:      { label: 'Project ID (Optional)',      icon: Hash, type: 'text', placeholder: 'proj-xxxxxxxxxxxx' },
  azure_endpoint:  { label: 'Azure Endpoint',   icon: Link2,    type: 'text',     placeholder: 'https://YOUR_RESOURCE.openai.azure.com' },
  api_version:     { label: 'API Version',       icon: Hash,     type: 'text',     placeholder: '2024-02-15-preview' },
  base_url:        { label: 'Base URL',          icon: Link2,    type: 'text',     placeholder: 'https://your-api.example.com' },
  temperature:     { label: 'Temperature',       icon: Settings, type: 'number',   placeholder: '0.3', min: 0, max: 2, step: 0.1 },
  max_tokens:      { label: 'Max Tokens',        icon: Hash,     type: 'number',   placeholder: '2048', min: 1, max: 128000 },
  timeout:         { label: 'Timeout (seconds)', icon: Clock,    type: 'number',   placeholder: '30', min: 5, max: 300 },
  retry_count:     { label: 'Retry Count',       icon: RotateCcw, type: 'number',  placeholder: '2', min: 0, max: 5 },
}

const DEFAULTS = {
  provider: '',
  api_key: '',
  model: '',
  region: '',
  organization_id: '',
  project_id: '',
  azure_endpoint: '',
  api_version: '',
  base_url: '',
  temperature: 0.3,
  max_tokens: 2048,
  timeout: 30,
  retry_count: 2,
  is_active: true,
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ModelSelect({ provider, value, onChange, models }) {
  const list = models[provider] || []
  if (list.length === 0) {
    return (
      <input
        type="text"
        className="input-field"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={FIELD_LABELS.model.placeholder}
      />
    )
  }
  return (
    <div className="relative">
      <select
        className="input-field appearance-none pr-8"
        value={value}
        onChange={e => onChange(e.target.value)}
      >
        <option value="">Select model…</option>
        {list.map(m => <option key={m} value={m}>{m}</option>)}
      </select>
      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400 pointer-events-none" />
    </div>
  )
}

function ApiKeyInput({ value, masked, hasKey, onChange, onRemove }) {
  const [show, setShow] = useState(false)
  const [editing, setEditing] = useState(!hasKey)

  if (!editing && hasKey) {
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
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="p-2 text-red-500 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
            title="Remove API key"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 relative">
        <input
          type={show ? 'text' : 'password'}
          className="input-field pr-10 font-mono text-sm"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="Enter your API key"
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
      {hasKey && (
        <button
          type="button"
          onClick={() => { setEditing(false); onChange('') }}
          className="px-3 py-2 text-sm text-surface-600 border border-surface-200 rounded-lg hover:bg-surface-50 transition-colors"
        >
          Cancel
        </button>
      )}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AIProviderManagement() {
  const [providers, setProviders] = useState([])
  const [models, setModels] = useState({})
  const [current, setCurrent] = useState(null)          // saved config from DB
  const [form, setForm] = useState({ ...DEFAULTS })
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [loading, setLoading] = useState(true)

  // ── Load metadata + current config ──────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [metaRes, cfgRes] = await Promise.all([
        aiProviderService.getProviders(),
        aiProviderService.getConfig(),
      ])
      setProviders(metaRes.data.providers || [])
      setModels(metaRes.data.models || {})

      if (cfgRes.data.configured) {
        const cfg = cfgRes.data
        setCurrent(cfg)
        setForm(f => ({
          ...DEFAULTS,
          ...f,
          provider:        cfg.provider || '',
          model:           cfg.model || '',
          region:          cfg.region || '',
          organization_id: cfg.organization_id || '',
          project_id:      cfg.project_id || '',
          azure_endpoint:  cfg.azure_endpoint || '',
          api_version:     cfg.api_version || '',
          base_url:        cfg.base_url || '',
          temperature:     cfg.temperature ?? 0.3,
          max_tokens:      cfg.max_tokens ?? 2048,
          timeout:         cfg.timeout ?? 30,
          retry_count:     cfg.retry_count ?? 2,
          is_active:       cfg.is_active ?? true,
          api_key:         '',
        }))
      }
    } catch {
      toast.error('Failed to load AI provider configuration.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // ── Field helpers ────────────────────────────────────────────────────────────
  const set = (key, val) => {
    setForm(f => ({ ...f, [key]: val }))
    setTestResult(null)
  }

  const selectProvider = (p) => {
    setForm({ ...DEFAULTS, provider: p })
    setCurrent(prev => prev?.provider === p ? prev : null)
    setTestResult(null)
  }

  // ── Save ─────────────────────────────────────────────────────────────────────
  const handleSave = async (e) => {
    e.preventDefault()
    if (!form.provider) { toast.error('Please select an AI provider first.'); return }
    setSaving(true)
    try {
      const payload = { ...form }
      if (!payload.api_key) delete payload.api_key   // keep existing key
      const res = await aiProviderService.saveConfig(payload)
      setCurrent(res.data)
      setForm(f => ({ ...f, api_key: '' }))
      toast.success('AI provider configuration saved successfully.')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save configuration.')
    } finally {
      setSaving(false)
    }
  }

  // ── Remove API key ────────────────────────────────────────────────────────────
  const handleRemoveKey = async () => {
    if (!window.confirm('Remove the stored API key? AI features will stop working until a new key is provided.')) return
    try {
      await aiProviderService.removeApiKey()
      setCurrent(prev => prev ? { ...prev, has_api_key: false, api_key_masked: '' } : null)
      toast.success('API key removed.')
    } catch {
      toast.error('Failed to remove API key.')
    }
  }

  // ── Test connection ───────────────────────────────────────────────────────────
  const handleTest = async () => {
    if (!form.provider) { toast.error('Please select a provider first.'); return }
    setTesting(true)
    setTestResult(null)
    try {
      const res = await aiProviderService.testConnection({
        provider:        form.provider,
        api_key:         form.api_key || undefined,
        model:           form.model || undefined,
        temperature:     form.temperature,
        max_tokens:      256,
        timeout:         form.timeout,
        organization_id: form.organization_id || undefined,
        project_id:      form.project_id || undefined,
        region:          form.region || undefined,
        azure_endpoint:  form.azure_endpoint || undefined,
        api_version:     form.api_version || undefined,
        base_url:        form.base_url || undefined,
        custom_headers:  form.custom_headers || {},
      })
      setTestResult(res.data)
    } catch (err) {
      // Extract the most meaningful error from the axios exception.
      // detail may be a string (FastAPI HTTPException) or an array (422 validation).
      const detail = err.response?.data?.detail
      let msg
      if (typeof detail === 'string' && detail) {
        msg = detail
      } else if (Array.isArray(detail) && detail.length) {
        msg = detail.map(d => d.msg || JSON.stringify(d)).join('; ')
      } else {
        msg = (
          err.response?.data?.message ||
          err.message ||
          'Request failed — check server logs.'
        )
      }
      setTestResult({
        success:     false,
        provider:    form.provider,
        model:       form.model || '',
        http_status: err.response?.status,
        message:     msg,
        steps:       {},
      })
    } finally {
      setTesting(false)
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────────────
  const meta = PROVIDER_META[form.provider] || null
  const isConfigured = current?.configured !== false && current?.provider
  const isCurrentProvider = current?.provider === form.provider

  // ── Render ────────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 bg-primary-100 rounded-xl">
              <Brain className="w-6 h-6 text-primary-600" />
            </div>
            <h1 className="text-2xl font-bold text-surface-900">AI Provider Management</h1>
          </div>
          <p className="text-sm text-surface-500 ml-14">
            Configure which AI provider powers resume parsing, ATS scoring, and intelligent data extraction.
          </p>
        </div>
        <button
          onClick={load}
          className="p-2 text-surface-500 hover:text-surface-700 hover:bg-surface-100 rounded-lg transition-colors"
          title="Refresh"
        >
          <RefreshCw className="w-5 h-5" />
        </button>
      </div>

      {/* ── Active provider banner ─────────────────────────────── */}
      {isConfigured && (
        <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse flex-shrink-0" />
          <div>
            <p className="text-xs font-medium text-emerald-600 uppercase tracking-wide">Active Provider</p>
            <p className="font-semibold text-emerald-900">
              {PROVIDER_META[current.provider]?.label || current.provider}
              {current.model && <span className="ml-2 text-sm font-normal text-emerald-700">— {current.model}</span>}
            </p>
          </div>
          <div className="ml-auto text-right">
            <p className="text-xs text-emerald-600">API Key</p>
            <p className="text-sm font-mono text-emerald-800">{current.api_key_masked || (current.has_api_key ? '●●●●●●●●●●●●' : '— not set —')}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Provider selector (left column) ───────────────────── */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-surface-700 uppercase tracking-wide px-1">Select Provider</h2>
          {providers.map(p => {
            const m = PROVIDER_META[p]
            if (!m) return null
            const isActive = current?.provider === p
            const isSelected = form.provider === p
            return (
              <button
                key={p}
                onClick={() => selectProvider(p)}
                className={`w-full text-left p-3.5 rounded-xl border transition-all ${
                  isSelected
                    ? 'border-primary-400 bg-primary-50 shadow-sm'
                    : 'border-surface-200 bg-white hover:border-surface-300 hover:shadow-sm'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${m.color} flex items-center justify-center text-white text-lg font-bold flex-shrink-0`}>
                    {m.logo}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-surface-900 text-sm truncate">{m.label}</span>
                      {isActive && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-700 rounded-full flex-shrink-0">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          Active
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-surface-500 truncate mt-0.5">{m.description}</p>
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        {/* ── Config form (right 2 columns) ─────────────────────── */}
        <div className="lg:col-span-2">
          {!form.provider ? (
            <div className="h-full flex flex-col items-center justify-center py-20 text-center">
              <Brain className="w-12 h-12 text-surface-300 mb-4" />
              <p className="text-surface-500 font-medium">Select an AI provider to configure</p>
              <p className="text-xs text-surface-400 mt-1">Your selection will be used by all AI-powered features</p>
            </div>
          ) : (
            <form onSubmit={handleSave} className="bg-white border border-surface-200 rounded-2xl shadow-sm overflow-hidden">

              {/* Form header */}
              <div className={`px-6 py-4 bg-gradient-to-r ${meta.color} text-white`}>
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{meta.logo}</span>
                  <div>
                    <h2 className="font-bold text-lg">{meta.label}</h2>
                    <p className="text-sm opacity-90">{meta.description}</p>
                  </div>
                  {isCurrentProvider && isConfigured && (
                    <span className="ml-auto flex items-center gap-1 bg-white/20 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Currently Active
                    </span>
                  )}
                </div>
              </div>

              <div className="p-6 space-y-5">

                {/* API Key */}
                <div>
                  <label className="block text-sm font-medium text-surface-700 mb-1.5">
                    API Key <span className="text-red-500">*</span>
                  </label>
                  <ApiKeyInput
                    value={form.api_key}
                    masked={isCurrentProvider ? current?.api_key_masked : ''}
                    hasKey={isCurrentProvider ? current?.has_api_key : false}
                    onChange={v => set('api_key', v)}
                    onRemove={isCurrentProvider && current?.has_api_key ? handleRemoveKey : null}
                  />
                </div>

                {/* Model */}
                {meta.fields.includes('model') && (
                  <div>
                    <label className="block text-sm font-medium text-surface-700 mb-1.5">Model</label>
                    <ModelSelect
                      provider={form.provider}
                      value={form.model}
                      onChange={v => set('model', v)}
                      models={models}
                    />
                  </div>
                )}

                {/* Azure endpoint */}
                {meta.fields.includes('azure_endpoint') && (
                  <div>
                    <label className="block text-sm font-medium text-surface-700 mb-1.5">
                      Azure Endpoint <span className="text-red-500">*</span>
                    </label>
                    <input type="text" className="input-field" value={form.azure_endpoint}
                      onChange={e => set('azure_endpoint', e.target.value)}
                      placeholder={FIELD_LABELS.azure_endpoint.placeholder} />
                  </div>
                )}

                {/* Base URL */}
                {meta.fields.includes('base_url') && (
                  <div>
                    <label className="block text-sm font-medium text-surface-700 mb-1.5">
                      Base URL <span className="text-red-500">*</span>
                    </label>
                    <input type="text" className="input-field" value={form.base_url}
                      onChange={e => set('base_url', e.target.value)}
                      placeholder={FIELD_LABELS.base_url.placeholder} />
                  </div>
                )}

                {/* Optional fields row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {meta.fields.includes('organization_id') && (
                    <div>
                      <label className="block text-sm font-medium text-surface-700 mb-1.5">Organization ID <span className="text-surface-400 font-normal">(Optional)</span></label>
                      <input type="text" className="input-field" value={form.organization_id}
                        onChange={e => set('organization_id', e.target.value)}
                        placeholder={FIELD_LABELS.organization_id.placeholder} />
                    </div>
                  )}
                  {meta.fields.includes('project_id') && (
                    <div>
                      <label className="block text-sm font-medium text-surface-700 mb-1.5">Project ID <span className="text-surface-400 font-normal">(Optional)</span></label>
                      <input type="text" className="input-field" value={form.project_id}
                        onChange={e => set('project_id', e.target.value)}
                        placeholder={FIELD_LABELS.project_id.placeholder} />
                    </div>
                  )}
                  {meta.fields.includes('region') && (
                    <div>
                      <label className="block text-sm font-medium text-surface-700 mb-1.5">Region <span className="text-surface-400 font-normal">(Optional)</span></label>
                      <input type="text" className="input-field" value={form.region}
                        onChange={e => set('region', e.target.value)}
                        placeholder={FIELD_LABELS.region.placeholder} />
                    </div>
                  )}
                  {meta.fields.includes('api_version') && (
                    <div>
                      <label className="block text-sm font-medium text-surface-700 mb-1.5">API Version</label>
                      <input type="text" className="input-field" value={form.api_version}
                        onChange={e => set('api_version', e.target.value)}
                        placeholder={FIELD_LABELS.api_version.placeholder} />
                    </div>
                  )}
                </div>

                {/* ── Global AI settings ───────────────────────── */}
                <div className="border border-surface-100 rounded-xl p-4 space-y-4 bg-surface-50">
                  <h3 className="text-xs font-semibold text-surface-600 uppercase tracking-wide">Global AI Settings</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-surface-600 mb-1">Temperature</label>
                      <input type="number" className="input-field text-sm" step="0.1" min="0" max="2"
                        value={form.temperature} onChange={e => set('temperature', parseFloat(e.target.value) || 0)} />
                      <p className="text-xs text-surface-400 mt-0.5">0 = focused</p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-surface-600 mb-1">Max Tokens</label>
                      <input type="number" className="input-field text-sm" min="1" max="128000"
                        value={form.max_tokens} onChange={e => set('max_tokens', parseInt(e.target.value) || 2048)} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-surface-600 mb-1">Timeout (s)</label>
                      <input type="number" className="input-field text-sm" min="5" max="300"
                        value={form.timeout} onChange={e => set('timeout', parseInt(e.target.value) || 30)} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-surface-600 mb-1">Retry Count</label>
                      <input type="number" className="input-field text-sm" min="0" max="5"
                        value={form.retry_count} onChange={e => set('retry_count', parseInt(e.target.value) || 2)} />
                    </div>
                  </div>
                </div>

                {/* Active toggle */}
                <div className="flex items-center justify-between p-3 bg-surface-50 rounded-xl border border-surface-100">
                  <div>
                    <p className="text-sm font-medium text-surface-700">Enable AI Features</p>
                    <p className="text-xs text-surface-500">When disabled, all AI-powered features will return an error</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => set('is_active', !form.is_active)}
                    className={`relative w-11 h-6 rounded-full transition-colors ${form.is_active ? 'bg-primary-500' : 'bg-surface-300'}`}
                  >
                    <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form.is_active ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                </div>

                {/* ── Test result ──────────────────────────────── */}
                {testResult && (
                  <div className={`p-4 rounded-xl border ${
                    testResult.success
                      ? 'bg-emerald-50 border-emerald-200'
                      : 'bg-red-50 border-red-200'
                  }`}>
                    <div className="flex items-start gap-3">
                      {testResult.success
                        ? <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                        : <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                      }
                      <div className="flex-1 min-w-0">
                        <p className={`font-medium text-sm ${testResult.success ? 'text-emerald-800' : 'text-red-700'}`}>
                          {testResult.success ? 'Connection Successful' : 'Connection Failed'}
                          {testResult.http_status && !testResult.success && (
                            <span className="ml-2 font-normal text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded">
                              HTTP {testResult.http_status}
                            </span>
                          )}
                        </p>

                        {testResult.success ? (
                          <>
                            <div className="flex items-center gap-3 mt-1 text-xs text-emerald-700">
                              <span>Model: <b>{testResult.model || '—'}</b></span>
                              <span>Latency: <b>{testResult.latency_ms}ms</b></span>
                            </div>
                            {testResult.steps?.available_models?.length > 0 && (
                              <p className="text-xs text-emerald-600 mt-1">
                                Available: {testResult.steps.available_models.slice(0, 4).join(', ')}
                                {testResult.steps.available_models.length > 4
                                  ? ` +${testResult.steps.available_models.length - 4} more` : ''}
                              </p>
                            )}
                          </>
                        ) : (
                          <>
                            <p className="text-xs text-red-600 mt-1 break-words whitespace-pre-wrap">
                              {testResult.message}
                            </p>

                            {/* Step-by-step diagnostic breakdown */}
                            {testResult.steps && Object.keys(testResult.steps).length > 0 && (
                              <div className="mt-2 space-y-1 border-t border-red-100 pt-2">
                                <p className="text-xs font-medium text-red-700 mb-1">Diagnostic Steps</p>
                                {testResult.steps.api_key_valid !== undefined && (
                                  <div className="flex items-center gap-1.5 text-xs">
                                    <span className={testResult.steps.api_key_valid ? 'text-emerald-600' : 'text-red-500'}>
                                      {testResult.steps.api_key_valid ? '✓' : '✗'}
                                    </span>
                                    <span className="text-surface-600">Step 1: API key present</span>
                                  </div>
                                )}
                                {testResult.steps.list_models !== undefined && (
                                  <div className="flex items-start gap-1.5 text-xs">
                                    <span className={`flex-shrink-0 ${testResult.steps.list_models ? 'text-emerald-600' : 'text-red-500'}`}>
                                      {testResult.steps.list_models ? '✓' : '✗'}
                                    </span>
                                    <span className="text-surface-600">
                                      Step 2: List models
                                      {testResult.steps.list_models_error && (
                                        <span className="ml-1 text-red-500">— {testResult.steps.list_models_error}</span>
                                      )}
                                    </span>
                                  </div>
                                )}
                                {testResult.steps.generate_content !== undefined && (
                                  <div className="flex items-start gap-1.5 text-xs">
                                    <span className={`flex-shrink-0 ${testResult.steps.generate_content ? 'text-emerald-600' : 'text-red-500'}`}>
                                      {testResult.steps.generate_content ? '✓' : '✗'}
                                    </span>
                                    <span className="text-surface-600">
                                      Step 3: Generate content
                                      {testResult.steps.generate_error && (
                                        <span className="ml-1 text-red-500 break-all">— {testResult.steps.generate_error}</span>
                                      )}
                                    </span>
                                  </div>
                                )}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Action buttons ───────────────────────────── */}
                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleTest}
                    disabled={testing || !form.provider}
                    className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-surface-700 bg-white border border-surface-200 rounded-xl hover:bg-surface-50 hover:border-surface-300 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {testing
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <Zap className="w-4 h-4" />
                    }
                    {testing ? 'Testing…' : 'Test Connection'}
                  </button>

                  <button
                    type="submit"
                    disabled={saving || !form.provider}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-primary-600 rounded-xl hover:bg-primary-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                  >
                    {saving
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <Save className="w-4 h-4" />
                    }
                    {saving ? 'Saving…' : 'Save Configuration'}
                  </button>
                </div>

              </div>
            </form>
          )}
        </div>
      </div>

      {/* ── AI-enabled features panel ──────────────────────────── */}
      <div className="bg-white border border-surface-200 rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-surface-700 uppercase tracking-wide mb-4">AI-Powered Features</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[
            { icon: '📄', label: 'Resume Parsing', desc: 'Extract structured data from uploaded resumes' },
            { icon: '🎯', label: 'ATS Scoring',    desc: 'Match resumes against job descriptions' },
            { icon: '📝', label: 'Resume Auto-Fill', desc: 'Populate candidate form from resume' },
            { icon: '📊', label: 'Candidate Excel AI Mapping', desc: 'Intelligently map spreadsheet columns' },
            { icon: '💼', label: 'Job Excel AI Mapping',       desc: 'Auto-detect job data from spreadsheets' },
            { icon: '🏢', label: 'Client Excel AI Mapping',    desc: 'Auto-detect client data from spreadsheets' },
          ].map(f => (
            <div key={f.label} className="flex items-start gap-3 p-3 bg-surface-50 rounded-xl">
              <span className="text-xl flex-shrink-0">{f.icon}</span>
              <div>
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-medium text-surface-800">{f.label}</p>
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isConfigured ? 'bg-emerald-500' : 'bg-surface-300'}`} />
                </div>
                <p className="text-xs text-surface-500 mt-0.5">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
        {!isConfigured && (
          <div className="mt-4 flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            No AI provider configured — all AI-powered features are currently unavailable.
          </div>
        )}
      </div>

    </div>
  )
}
