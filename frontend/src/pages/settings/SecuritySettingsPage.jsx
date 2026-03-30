import { useState, useEffect, useCallback } from 'react'
import { Lock, Plus, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import tenantSettingsService from '../../services/tenantSettingsService'
import {
  Breadcrumb, PageHeader, SectionCard, Field, Input, Toggle, ActionBar, SkeletonLoader,
} from './SettingsLayout'

const DEFAULT = {
  min_password_length: 8,
  require_uppercase: true,
  require_lowercase: true,
  require_numbers: true,
  require_symbols: false,
  password_expiry_days: 90,
  max_login_attempts: 5,
  lockout_duration_minutes: 30,
  two_factor_enabled: false,
  session_timeout_minutes: 480,
  ip_whitelist: [],
  force_password_change: false,
}

const SecuritySettingsPage = () => {
  const [data, setData]         = useState(DEFAULT)
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [newIP, setNewIP]       = useState('')

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const res = await tenantSettingsService.getSecuritySettings()
      if (res.data && Object.keys(res.data).length > 0) setData({ ...DEFAULT, ...res.data })
    } catch {
      toast.error('Failed to load security settings')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const save = async () => {
    try {
      setSaving(true)
      await tenantSettingsService.saveSecuritySettings(data)
      toast.success('Security settings saved')
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const set = (f, v) => setData(d => ({ ...d, [f]: v }))

  const addIP = () => {
    const ip = newIP.trim()
    if (!ip) return
    if (data.ip_whitelist.includes(ip)) { toast.error('IP already in list'); return }
    set('ip_whitelist', [...data.ip_whitelist, ip])
    setNewIP('')
  }

  const removeIP = (ip) => set('ip_whitelist', data.ip_whitelist.filter(i => i !== ip))

  if (loading) return <div className="p-6 max-w-3xl mx-auto"><SkeletonLoader /></div>

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <Breadcrumb page="Security" />
      <PageHeader title="Security Settings" description="Configure password policies, login restrictions, and session controls." />

      {/* Password Policy */}
      <SectionCard title="Password Policy" icon={Lock}>
        <div className="space-y-4">
          <Field label="Minimum Password Length">
            <div className="flex items-center gap-3">
              <Input type="number" min={6} max={32} value={data.min_password_length} onChange={e => set('min_password_length', parseInt(e.target.value) || 8)} className="w-24" />
              <span className="text-sm text-surface-500">characters</span>
            </div>
          </Field>

          <div className="border border-surface-100 rounded-xl px-4 divide-y divide-surface-50">
            <Toggle checked={data.require_uppercase} onChange={v => set('require_uppercase', v)} label="Require Uppercase" description="At least one uppercase letter (A-Z)" />
            <Toggle checked={data.require_lowercase} onChange={v => set('require_lowercase', v)} label="Require Lowercase" description="At least one lowercase letter (a-z)" />
            <Toggle checked={data.require_numbers} onChange={v => set('require_numbers', v)} label="Require Numbers" description="At least one digit (0-9)" />
            <Toggle checked={data.require_symbols} onChange={v => set('require_symbols', v)} label="Require Symbols" description="At least one special character (!@#$...)" />
            <Toggle checked={data.force_password_change} onChange={v => set('force_password_change', v)} label="Force Password Change on First Login" description="New users must change their password when they first log in" />
          </div>

          <Field label="Password Expiry" hint="Set to 0 to disable expiry">
            <div className="flex items-center gap-3">
              <Input type="number" min={0} value={data.password_expiry_days} onChange={e => set('password_expiry_days', parseInt(e.target.value) || 0)} className="w-24" />
              <span className="text-sm text-surface-500">days (0 = never)</span>
            </div>
          </Field>
        </div>
      </SectionCard>

      {/* Login Security */}
      <SectionCard title="Login Security">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Max Failed Attempts" hint="Account locked after this many failures">
              <Input type="number" min={1} max={20} value={data.max_login_attempts} onChange={e => set('max_login_attempts', parseInt(e.target.value) || 5)} className="w-24" />
            </Field>
            <Field label="Lockout Duration" hint="Minutes before account is unlocked">
              <Input type="number" min={1} value={data.lockout_duration_minutes} onChange={e => set('lockout_duration_minutes', parseInt(e.target.value) || 30)} className="w-28" />
            </Field>
          </div>

          <div className="border border-surface-100 rounded-xl px-4">
            <Toggle
              checked={data.two_factor_enabled}
              onChange={v => set('two_factor_enabled', v)}
              label="Two-Factor Authentication (2FA)"
              description="Require all users to verify login with a second factor"
            />
          </div>
        </div>
      </SectionCard>

      {/* Session */}
      <SectionCard title="Session Management">
        <Field label="Session Timeout" hint="Users are automatically logged out after this period of inactivity">
          <div className="flex items-center gap-3">
            <Input type="number" min={15} value={data.session_timeout_minutes} onChange={e => set('session_timeout_minutes', parseInt(e.target.value) || 480)} className="w-28" />
            <span className="text-sm text-surface-500">minutes ({Math.round(data.session_timeout_minutes / 60)} hours)</span>
          </div>
        </Field>
      </SectionCard>

      {/* IP Whitelist */}
      <SectionCard title="IP Allowlist">
        <p className="text-sm text-surface-500 mb-4">
          Restrict login to specific IP addresses. Leave empty to allow all IPs.
        </p>
        <div className="space-y-2 mb-4">
          {data.ip_whitelist.map(ip => (
            <div key={ip} className="flex items-center gap-3 px-3 py-2 bg-surface-50 rounded-lg border border-surface-100">
              <span className="flex-1 text-sm font-mono text-surface-800">{ip}</span>
              <button onClick={() => removeIP(ip)} className="p-1 hover:bg-danger-50 rounded transition-colors">
                <Trash2 className="w-3.5 h-3.5 text-danger-500" />
              </button>
            </div>
          ))}
          {data.ip_whitelist.length === 0 && (
            <p className="text-xs text-surface-400 py-2 text-center">No IP restrictions — all IPs are allowed</p>
          )}
        </div>
        <div className="flex gap-2">
          <Input
            value={newIP}
            onChange={e => setNewIP(e.target.value)}
            placeholder="192.168.1.100 or 10.0.0.0/24"
            onKeyDown={e => e.key === 'Enter' && addIP()}
            className="flex-1 font-mono"
          />
          <button onClick={addIP} className="flex items-center gap-1 px-3 py-2 bg-accent-50 text-accent-700 text-sm rounded-lg hover:bg-accent-100 transition-colors">
            <Plus className="w-4 h-4" /> Add
          </button>
        </div>
      </SectionCard>

      <ActionBar saving={saving} onSave={save} />
    </div>
  )
}

export default SecuritySettingsPage
