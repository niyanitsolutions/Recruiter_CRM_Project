import { useState, useEffect, useCallback } from 'react'
import { Lock, Plus, Trash2, ShieldCheck, Info } from 'lucide-react'
import toast from 'react-hot-toast'
import tenantSettingsService from '../../services/tenantSettingsService'
import {
  Breadcrumb, PageHeader, SectionCard, Field, Input, Toggle, ActionBar, SkeletonLoader,
} from './SettingsLayout'

const SYSTEM_DEFAULTS = {
  enable_custom_security: false,
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
  const [data, setData]         = useState(SYSTEM_DEFAULTS)
  const [platformDefaults, setPlatformDefaults] = useState(null)
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [newIP, setNewIP]       = useState('')

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const [secRes, platformRes] = await Promise.allSettled([
        tenantSettingsService.getSecuritySettings(),
        tenantSettingsService.getSecurityDefaults(),
      ])
      if (secRes.status === 'fulfilled' && secRes.value?.data && Object.keys(secRes.value.data).length > 0) {
        setData({ ...SYSTEM_DEFAULTS, ...secRes.value.data })
      } else {
        setData(SYSTEM_DEFAULTS)
      }
      if (platformRes.status === 'fulfilled' && platformRes.value?.platform_defaults) {
        setPlatformDefaults(platformRes.value.platform_defaults)
      }
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
      // Coerce numeric fields to real numbers only at save time — the inputs
      // keep whatever raw string the user is typing (see `set`) so
      // backspace/clear/paste behave like a normal input instead of
      // snapping back to a default value on every keystroke.
      const payload = {
        ...data,
        min_password_length:      parseInt(data.min_password_length, 10)      || 8,
        password_expiry_days:     data.password_expiry_days === '' ? 0 : (parseInt(data.password_expiry_days, 10) || 0),
        max_login_attempts:       parseInt(data.max_login_attempts, 10)       || 5,
        lockout_duration_minutes: parseInt(data.lockout_duration_minutes, 10) || 30,
        session_timeout_minutes:  parseInt(data.session_timeout_minutes, 10)  || 480,
      }
      await tenantSettingsService.saveSecuritySettings(payload)
      setData(payload)
      toast.success('Security settings saved')
    } catch (e) {
      const detail = e.response?.data?.detail
      const msg = (typeof detail === 'string' && detail.trim() && !/unexpected error/i.test(detail))
        ? detail
        : (!e.response ? 'Network unavailable. Please check your connection and try again.' : 'Unable to save security settings. Please try again.')
      toast.error(msg)
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

  const customEnabled = data.enable_custom_security

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <Breadcrumb page="Security" />
      <PageHeader title="Security Settings" description="Configure password policies, login restrictions, and session controls." />

      {/* Config source indicator */}
      <div className={`flex items-start gap-3 p-4 rounded-xl border text-sm ${
        customEnabled
          ? 'bg-success-50 border-success-200 text-success-800'
          : 'bg-blue-50 border-blue-200 text-blue-800'
      }`}>
        <Info className="w-4 h-4 mt-0.5 shrink-0" />
        <div>
          {customEnabled
            ? 'Using Tenant Configuration — your custom security policies are active.'
            : <>
                Using Platform Configuration
                {platformDefaults && (
                  <span className="block text-xs mt-0.5 opacity-75">
                    Platform defaults: {platformDefaults.max_login_attempts} login attempts,
                    {' '}{platformDefaults.lockout_duration_minutes} min lockout,
                    {' '}{platformDefaults.session_timeout_hours}h session timeout,
                    {' '}{platformDefaults.password_min_length} char min password
                  </span>
                )}
              </>
          }
        </div>
      </div>

      {/* Master override toggle */}
      <SectionCard title="Custom Security Override" icon={ShieldCheck}>
        <div className="border border-surface-100 rounded-xl px-4">
          <Toggle
            checked={data.enable_custom_security}
            onChange={v => set('enable_custom_security', v)}
            label="Enable Custom Security Settings"
            description={
              customEnabled
                ? 'Tenant custom settings are ACTIVE — platform defaults are overridden.'
                : 'Using platform defaults. Enable to customise security policies for this tenant.'
            }
          />
        </div>
        {!customEnabled && (
          <p className="mt-3 text-xs text-surface-400 bg-surface-50 rounded-lg px-4 py-3">
            The settings below are editable but will not be enforced until custom security is enabled.
          </p>
        )}
      </SectionCard>

      {/* Password Policy */}
      <SectionCard title="Password Policy" icon={Lock}>
        <div className="space-y-4">
          <Field label="Minimum Password Length">
            <div className="flex items-center gap-3">
              <Input
                type="number" min={6} max={32}
                value={data.min_password_length}
                onChange={e => set('min_password_length', e.target.value)}
                className="w-24"
                disabled={!customEnabled}
              />
              <span className="text-sm text-surface-500">characters</span>
            </div>
          </Field>

          <div className="border border-surface-100 rounded-xl px-4 divide-y divide-surface-50">
            <Toggle checked={data.require_uppercase} onChange={v => set('require_uppercase', v)} label="Require Uppercase" description="At least one uppercase letter (A-Z)" disabled={!customEnabled} />
            <Toggle checked={data.require_lowercase} onChange={v => set('require_lowercase', v)} label="Require Lowercase" description="At least one lowercase letter (a-z)" disabled={!customEnabled} />
            <Toggle checked={data.require_numbers}   onChange={v => set('require_numbers', v)}   label="Require Numbers"   description="At least one digit (0-9)"         disabled={!customEnabled} />
            <Toggle checked={data.require_symbols}   onChange={v => set('require_symbols', v)}   label="Require Symbols"   description="At least one special character (!@#$...)" disabled={!customEnabled} />
            <Toggle checked={data.force_password_change} onChange={v => set('force_password_change', v)} label="Force Password Change on First Login" description="New users must change their password on first login" disabled={!customEnabled} />
          </div>

          <Field label="Password Expiry" hint="Set to 0 to disable expiry">
            <div className="flex items-center gap-3">
              <Input
                type="number" min={0}
                value={data.password_expiry_days}
                onChange={e => set('password_expiry_days', e.target.value)}
                className="w-24"
                disabled={!customEnabled}
              />
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
              <Input
                type="number" min={1} max={20}
                value={data.max_login_attempts}
                onChange={e => set('max_login_attempts', e.target.value)}
                className="w-24"
                disabled={!customEnabled}
              />
            </Field>
            <Field label="Lockout Duration" hint="Minutes before account is unlocked">
              <Input
                type="number" min={1}
                value={data.lockout_duration_minutes}
                onChange={e => set('lockout_duration_minutes', e.target.value)}
                className="w-28"
                disabled={!customEnabled}
              />
            </Field>
          </div>

          <div className="border border-surface-100 rounded-xl px-4">
            <Toggle
              checked={data.two_factor_enabled}
              onChange={v => set('two_factor_enabled', v)}
              label="Two-Factor Authentication (2FA)"
              description="Require all users to verify login with a second factor"
              disabled={!customEnabled}
            />
          </div>
        </div>
      </SectionCard>

      {/* Session */}
      <SectionCard title="Session Management">
        <Field label="Session Timeout" hint="Users are automatically logged out after this period of inactivity">
          <div className="flex items-center gap-3">
            <Input
              type="number" min={15}
              value={data.session_timeout_minutes}
              onChange={e => set('session_timeout_minutes', e.target.value)}
              className="w-28"
              disabled={!customEnabled}
            />
            <span className="text-sm text-surface-500">
              minutes ({Math.round(data.session_timeout_minutes / 60)} hours)
            </span>
          </div>
        </Field>
      </SectionCard>

      {/* IP Allowlist */}
      <SectionCard title="IP Allowlist">
        <p className="text-sm text-surface-500 mb-4">
          Restrict login to specific IP addresses. Leave empty to allow all IPs.
        </p>
        <div className="space-y-2 mb-4">
          {data.ip_whitelist.map(ip => (
            <div key={ip} className="flex items-center gap-3 px-3 py-2 bg-surface-50 rounded-lg border border-surface-100">
              <span className="flex-1 text-sm font-mono text-surface-800">{ip}</span>
              {customEnabled && (
                <button onClick={() => removeIP(ip)} className="p-1 hover:bg-danger-50 rounded transition-colors">
                  <Trash2 className="w-3.5 h-3.5 text-danger-500" />
                </button>
              )}
            </div>
          ))}
          {data.ip_whitelist.length === 0 && (
            <p className="text-xs text-surface-400 py-2 text-center">No IP restrictions — all IPs are allowed</p>
          )}
        </div>
        {customEnabled && (
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
        )}
      </SectionCard>

      <ActionBar saving={saving} onSave={save} />
    </div>
  )
}

export default SecuritySettingsPage
