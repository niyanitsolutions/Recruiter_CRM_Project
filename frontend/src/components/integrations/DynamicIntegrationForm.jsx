import React, { useState } from 'react'
import { Loader2, Zap, CheckCircle, XCircle, Eye, EyeOff } from 'lucide-react'
import { toast } from 'react-hot-toast'
import integrationService from '../../services/integrationService'

// ── Single field renderer ──────────────────────────────────────────────────────
const FieldInput = ({ field, value, onChange }) => {
  const [show, setShow] = useState(false)

  if (field.type === 'password') {
    return (
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value || ''}
          onChange={e => onChange(field.key, e.target.value)}
          placeholder={field.placeholder || ''}
          className="input w-full pr-10"
          required={field.required}
          autoComplete="off"
        />
        <button
          type="button"
          onClick={() => setShow(s => !s)}
          className="absolute right-3 top-1/2 -translate-y-1/2"
          style={{ color: 'var(--text-muted)' }}
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    )
  }

  if (field.type === 'json') {
    return (
      <textarea
        value={value || ''}
        onChange={e => onChange(field.key, e.target.value)}
        rows={3}
        placeholder='{"key": "value"}'
        className="input w-full font-mono text-xs"
      />
    )
  }

  return (
    <input
      type={field.type || 'text'}
      value={value || ''}
      onChange={e => onChange(field.key, e.target.value)}
      placeholder={field.placeholder || ''}
      className="input w-full"
      required={field.required}
    />
  )
}

// ── Main form ─────────────────────────────────────────────────────────────────
const DynamicIntegrationForm = ({ provider, definition, existingData, onSaved, onCancel }) => {
  const [form,       setForm]       = useState({})
  const [name,       setName]       = useState(existingData?.name || definition.label)
  const [saving,     setSaving]     = useState(false)
  const [testing,    setTesting]    = useState(false)
  const [testResult, setTestResult] = useState(null) // null | 'ok' | 'fail'
  const [testMsg,    setTestMsg]    = useState('')

  const setField = (key, val) => {
    setForm(prev => ({ ...prev, [key]: val }))
    setTestResult(null)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await integrationService.upsert({ provider, name, config_json: form })
      toast.success('Integration saved successfully')
      onSaved?.()
    } catch (err) {
      toast.error(err.response?.data?.detail || err.response?.data?.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    // Save first so the backend has the latest config to test
    setSaving(true)
    try {
      await integrationService.upsert({ provider, name, config_json: form })
    } catch {/* continue to test anyway */}
    setSaving(false)

    setTesting(true)
    setTestResult(null)
    try {
      await integrationService.test(provider)
      setTestResult('ok')
      setTestMsg('')
      toast.success('Connection test passed!')
    } catch (err) {
      const msg = err.response?.data?.detail || err.response?.data?.message || 'Connection test failed'
      setTestResult('fail')
      setTestMsg(msg)
      toast.error(msg)
    } finally {
      setTesting(false)
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-4">
      {/* Display name */}
      <div>
        <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-label)' }}>
          Display Name
        </label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          className="input w-full"
          required
        />
      </div>

      {/* Dynamic fields from provider schema */}
      {definition.fields.map(field => (
        <div key={field.key}>
          <label className="flex items-center gap-1 text-sm font-medium mb-1.5"
            style={{ color: 'var(--text-label)' }}>
            {field.label}
            {field.required && <span style={{ color: '#FF4757' }}>*</span>}
          </label>
          <FieldInput field={field} value={form[field.key]} onChange={setField} />
          {field.hint && (
            <p className="text-xs mt-1" style={{ color: 'var(--text-disabled)' }}>{field.hint}</p>
          )}
        </div>
      ))}

      {/* Test result banner */}
      {testResult && (
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium"
          style={testResult === 'ok'
            ? { background: 'rgba(67,233,123,0.12)', color: '#43E97B' }
            : { background: 'rgba(255,71,87,0.12)',  color: '#FF4757' }
          }
        >
          {testResult === 'ok'
            ? <CheckCircle className="w-4 h-4 flex-shrink-0" />
            : <XCircle    className="w-4 h-4 flex-shrink-0" />
          }
          <span>{testResult === 'ok' ? 'Connection successful' : (testMsg || 'Connection failed')}</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          onClick={handleTest}
          disabled={testing || saving}
          className="btn-secondary flex items-center gap-2 disabled:opacity-50"
        >
          {testing
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : <Zap      className="w-4 h-4" />
          }
          Test Connection
        </button>
        <button
          type="submit"
          disabled={saving || testing}
          className="btn-primary flex items-center gap-2 disabled:opacity-50"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          Save
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="btn-secondary">
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}

export default DynamicIntegrationForm
