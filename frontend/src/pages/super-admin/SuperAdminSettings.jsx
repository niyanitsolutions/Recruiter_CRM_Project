import React, { useState, useEffect } from 'react'
import {
  Globe, Bell, Shield, Settings, CreditCard, Mail, HardDrive, AlertTriangle, Save, RefreshCw,
  CheckCircle, XCircle, Loader2,
} from 'lucide-react'
import { Card, Button } from '../../components/common'
import platformSettingsService from '../../services/platformSettingsService'
import toast from 'react-hot-toast'

// ─── Reusable primitives ──────────────────────────────────────────────────────

const Toggle = ({ checked, onChange }) => (
  <button
    type="button"
    onClick={() => onChange(!checked)}
    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${checked ? 'bg-accent-500' : 'bg-surface-300'}`}
  >
    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${checked ? 'translate-x-4' : 'translate-x-1'}`} />
  </button>
)

const Field = ({ label, desc, children }) => (
  <div className="flex items-center justify-between py-3 border-b border-surface-100 last:border-0">
    <div>
      <p className="text-sm font-medium text-surface-900">{label}</p>
      {desc && <p className="text-xs text-surface-500 mt-0.5">{desc}</p>}
    </div>
    <div className="ml-6 flex-shrink-0">{children}</div>
  </div>
)

const TextInput = ({ value, onChange, placeholder, type = 'text', readOnly }) => (
  <input
    type={type}
    value={value}
    onChange={e => onChange(e.target.value)}
    placeholder={placeholder}
    readOnly={readOnly}
    className={`input w-48 text-sm ${readOnly ? 'bg-surface-50 text-surface-500 cursor-not-allowed' : ''}`}
  />
)

const NumberInput = ({ value, onChange, min, max, step = 1 }) => (
  <input
    type="number"
    value={value}
    onChange={e => onChange(Number(e.target.value))}
    min={min}
    max={max}
    step={step}
    className="input w-24 text-sm text-right"
  />
)

const SelectInput = ({ value, onChange, options }) => (
  <select value={value} onChange={e => onChange(e.target.value)} className="input w-40 text-sm">
    {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
  </select>
)

// ─── Section wrapper ──────────────────────────────────────────────────────────
const Section = ({ icon: Icon, title, desc, children }) => (
  <Card>
    <Card.Header>
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-surface-500" />
        <div>
          <Card.Title>{title}</Card.Title>
          {desc && <p className="text-xs text-surface-500 mt-0.5">{desc}</p>}
        </div>
      </div>
    </Card.Header>
    <Card.Content>{children}</Card.Content>
  </Card>
)

// ─── Deep merge helper ────────────────────────────────────────────────────────
const deepMerge = (base, override) => {
  const result = { ...base }
  for (const key of Object.keys(override || {})) {
    if (override[key] && typeof override[key] === 'object' && !Array.isArray(override[key])) {
      result[key] = deepMerge(base[key] || {}, override[key])
    } else {
      result[key] = override[key]
    }
  }
  return result
}

// ─── Default structure (mirrors backend DEFAULT_SETTINGS) ─────────────────────
const DEFAULTS = {
  platform: { name: 'CRM SaaS Platform', tagline: 'Recruitment & Partner Platform', support_email: 'support@crm.com', timezone: 'Asia/Kolkata', date_format: 'DD/MM/YYYY' },
  notifications: {
    new_tenant: true, payment_received: true, trial_expiring: true, plan_expired: false, seller_registered: true,
    subscription_renewed: true, payment_failed: true, tenant_inactive: true,
  },
  security: { session_timeout_hours: 24, max_login_attempts: 5, lockout_duration_minutes: 30, require_2fa_super_admin: false, password_min_length: 8 },
  platform_controls: { allow_self_registration: true, trial_days: 14, max_tenants_per_seller: 50, maintenance_mode: false },
  billing: { currency: 'INR', tax_rate_percent: 18, invoice_prefix: 'INV', invoice_due_days: 15 },
  email: {
    smtp_host: '', smtp_port: 587, smtp_user: '', smtp_use_tls: true,
    from_name: 'HireFlow', from_email: 'noreply@hireflow.com',
    smtp_reply_to_email: '', smtp_provider: '',
    smtp_is_active: true,   // true = use this DB SMTP; false = use .env only
    // smtp_password: never stored in state; always sent separately
  },
  storage: { max_resume_size_mb: 10, allowed_resume_types: 'pdf,doc,docx', max_storage_per_tenant_gb: 5 },
  maintenance: { maintenance_mode: false, maintenance_message: 'We are performing scheduled maintenance. Please try again later.', allow_super_admin_access: true },
  // Tenant Activity Monitoring — additive (Super Admin Tenant Monitoring feature)
  tenant_activity_monitoring: { enabled: true, inactivity_days: 7 },
}

// ─── Component ────────────────────────────────────────────────────────────────
const SuperAdminSettings = () => {
  const [settings, setSettings] = useState(DEFAULTS)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [smtpPassword, setSmtpPassword] = useState('')
  const [smtpTesting, setSmtpTesting] = useState(false)
  const [smtpTestResult, setSmtpTestResult] = useState(null)  // null | 'ok' | 'fail'

  useEffect(() => {
    const load = async () => {
      try {
        const res = await platformSettingsService.getSettings()
        setSettings(deepMerge(DEFAULTS, res.data.settings || {}))
      } catch {
        toast.error('Failed to load settings')
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [])

  const set = (section) => (key) => (value) =>
    setSettings(prev => ({ ...prev, [section]: { ...prev[section], [key]: value } }))

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const payload = { ...settings }
      // Include SMTP password only if user typed one
      if (smtpPassword.trim()) {
        payload.email = { ...payload.email, smtp_password: smtpPassword.trim() }
      }
      await platformSettingsService.updateSettings(payload)
      setSmtpPassword('')
      toast.success('Settings saved successfully')
    } catch {
      toast.error('Failed to save settings')
    } finally {
      setIsSaving(false)
    }
  }

  const testSmtpConnection = async () => {
    const em = settings.email
    if (!em.smtp_host || !em.smtp_user) {
      toast.error('Enter SMTP host and username before testing')
      return
    }
    if (!smtpPassword.trim()) {
      toast.error('Enter the SMTP password to test the connection (passwords are never stored client-side)')
      return
    }
    setSmtpTesting(true)
    setSmtpTestResult(null)
    try {
      await platformSettingsService.testSmtp({
        smtp_host: em.smtp_host,
        smtp_port: em.smtp_port,
        smtp_user: em.smtp_user,
        smtp_password: smtpPassword.trim(),
      })
      setSmtpTestResult('ok')
      toast.success('SMTP connection verified!')
    } catch (e) {
      setSmtpTestResult('fail')
      toast.error(e.response?.data?.detail || 'SMTP test failed')
    } finally {
      setSmtpTesting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const p  = settings.platform
  const n  = settings.notifications
  const s  = settings.security
  const pc = settings.platform_controls
  const b  = settings.billing
  const em = settings.email
  const st = settings.storage
  const m  = settings.maintenance
  const tam = settings.tenant_activity_monitoring

  const sp  = set('platform')
  const sn  = set('notifications')
  const ss  = set('security')
  const spc = set('platform_controls')
  const sb  = set('billing')
  const sem = set('email')
  const sst = set('storage')
  const sm  = set('maintenance')
  const stam = set('tenant_activity_monitoring')

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Platform Settings</h1>
          <p className="text-surface-500">Configure global platform behaviour and preferences</p>
        </div>
        <Button onClick={handleSave} isLoading={isSaving} leftIcon={<Save className="w-4 h-4" />}>
          Save Settings
        </Button>
      </div>

      {/* 1. Platform Info */}
      <Section icon={Globe} title="Platform Info" desc="Basic identity and localisation">
        <Field label="Platform Name" desc="Shown in UI headers and emails">
          <TextInput value={p.name} onChange={sp('name')} placeholder="CRM SaaS Platform" />
        </Field>
        <Field label="Support Email" desc="Displayed in customer-facing emails">
          <TextInput type="email" value={p.support_email} onChange={sp('support_email')} placeholder="support@crm.com" />
        </Field>
        <Field label="Timezone" desc="Default timezone for reports and scheduled jobs">
          <SelectInput value={p.timezone} onChange={sp('timezone')} options={[
            { value: 'Asia/Kolkata',   label: 'IST (India)' },
            { value: 'Asia/Dubai',     label: 'GST (Dubai)' },
            { value: 'Europe/London',  label: 'GMT (London)' },
            { value: 'America/New_York', label: 'EST (New York)' },
            { value: 'UTC',            label: 'UTC' },
          ]} />
        </Field>
        <Field label="Date Format" desc="Applied across reports and exports">
          <SelectInput value={p.date_format} onChange={sp('date_format')} options={[
            { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY' },
            { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY' },
            { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD' },
          ]} />
        </Field>
      </Section>

      {/* 2. Notifications */}
      <Section icon={Bell} title="Notifications" desc="Email alert triggers for super-admin">
        {[
          { key: 'new_tenant',        label: 'New tenant registered',  desc: 'When a company signs up' },
          { key: 'payment_received',  label: 'Subscription purchased', desc: 'When a payment is completed' },
          { key: 'subscription_renewed', label: 'Subscription renewed', desc: 'When a tenant renews their subscription' },
          { key: 'trial_expiring',    label: 'Trial expired',          desc: 'When a free trial expires' },
          { key: 'plan_expired',      label: 'Plan expired',           desc: 'When a subscription plan expires' },
          { key: 'payment_failed',    label: 'Payment failed',         desc: 'When a subscription payment fails' },
          { key: 'tenant_inactive',   label: 'Tenant inactive',        desc: 'When a tenant has no activity for the configured threshold' },
          { key: 'seller_registered', label: 'Seller registered',      desc: 'When a new seller account is created' },
        ].map(({ key, label, desc }) => (
          <Field key={key} label={label} desc={desc}>
            <Toggle checked={n[key]} onChange={sn(key)} />
          </Field>
        ))}
      </Section>

      {/* 3. Security */}
      <Section icon={Shield} title="Security" desc="Authentication and access control settings">
        <Field label="Session Timeout (hours)" desc="Auto-logout after inactivity">
          <NumberInput value={s.session_timeout_hours} onChange={ss('session_timeout_hours')} min={1} max={720} />
        </Field>
        <Field label="Max Login Attempts" desc="Before account is temporarily locked">
          <NumberInput value={s.max_login_attempts} onChange={ss('max_login_attempts')} min={3} max={20} />
        </Field>
        <Field label="Lockout Duration (minutes)" desc="How long to lock an account after failed attempts">
          <NumberInput value={s.lockout_duration_minutes} onChange={ss('lockout_duration_minutes')} min={5} max={1440} />
        </Field>
        <Field label="Min Password Length" desc="Minimum characters required for passwords">
          <NumberInput value={s.password_min_length} onChange={ss('password_min_length')} min={6} max={32} />
        </Field>
        <Field label="Require 2FA for Super Admin" desc="Enforce two-factor authentication for all super admins">
          <Toggle checked={s.require_2fa_super_admin} onChange={ss('require_2fa_super_admin')} />
        </Field>
      </Section>

      {/* 4. Platform Controls */}
      <Section icon={Settings} title="Platform Controls" desc="Registration and tenant management settings">
        <Field label="Allow Self-Registration" desc="Let companies register without an invite">
          <Toggle checked={pc.allow_self_registration} onChange={spc('allow_self_registration')} />
        </Field>
        <Field label="Trial Period (days)" desc="Free trial length for new tenants">
          <NumberInput value={pc.trial_days} onChange={spc('trial_days')} min={0} max={90} />
        </Field>
        <Field label="Max Tenants per Seller" desc="Hard limit on how many tenants a seller can register">
          <NumberInput value={pc.max_tenants_per_seller} onChange={spc('max_tenants_per_seller')} min={1} max={500} />
        </Field>
      </Section>

      {/* 5. Billing */}
      <Section icon={CreditCard} title="Billing" desc="Currency, tax, and invoicing defaults">
        <Field label="Currency" desc="Base currency for all plans and payments">
          <SelectInput value={b.currency} onChange={sb('currency')} options={[
            { value: 'INR', label: '₹ INR' },
            { value: 'USD', label: '$ USD' },
            { value: 'EUR', label: '€ EUR' },
            { value: 'GBP', label: '£ GBP' },
            { value: 'AED', label: 'AED' },
          ]} />
        </Field>
        <Field label="Tax Rate (%)" desc="GST / VAT applied to all invoices">
          <NumberInput value={b.tax_rate_percent} onChange={sb('tax_rate_percent')} min={0} max={30} step={0.5} />
        </Field>
        <Field label="Invoice Prefix" desc="Prefix used for generated invoice numbers">
          <TextInput value={b.invoice_prefix} onChange={sb('invoice_prefix')} placeholder="INV" />
        </Field>
        <Field label="Invoice Due Days" desc="Payment due X days after invoice date">
          <NumberInput value={b.invoice_due_days} onChange={sb('invoice_due_days')} min={0} max={90} />
        </Field>
      </Section>

      {/* 6. Email / SMTP */}
      <Section icon={Mail} title="Email / SMTP" desc="Platform system SMTP for auth, billing, and notification emails">

        {/* Active toggle — disabling forces fallback to .env */}
        <Field
          label="Use Platform DB SMTP"
          desc={em.smtp_is_active
            ? 'Entire platform uses this SMTP. Disable to use .env credentials only.'
            : 'Platform SMTP disabled — falling back to .env SMTP credentials.'}
        >
          <Toggle checked={em.smtp_is_active} onChange={sem('smtp_is_active')} />
        </Field>

        <div className={em.smtp_is_active ? '' : 'opacity-50 pointer-events-none'}>
          <Field label="SMTP Provider" desc="e.g. Gmail, Zoho, SendGrid (informational)">
            <TextInput value={em.smtp_provider} onChange={sem('smtp_provider')} placeholder="Gmail" />
          </Field>
          <Field label="SMTP Host" desc="Mail server hostname">
            <TextInput value={em.smtp_host} onChange={sem('smtp_host')} placeholder="smtp.example.com" />
          </Field>
          <Field label="SMTP Port">
            <NumberInput value={em.smtp_port} onChange={sem('smtp_port')} min={25} max={65535} />
          </Field>
          <Field label="SMTP Username">
            <TextInput value={em.smtp_user} onChange={sem('smtp_user')} placeholder="user@example.com" />
          </Field>
          <Field label="SMTP Password" desc={em.has_smtp_password ? 'Leave blank to keep existing' : 'Required'}>
            <input
              type="password"
              value={smtpPassword}
              onChange={e => setSmtpPassword(e.target.value)}
              placeholder={em.has_smtp_password ? '(unchanged)' : 'Enter password'}
              autoComplete="new-password"
              className="input w-48 text-sm"
            />
          </Field>
          <Field label="Use TLS" desc="Enable TLS encryption for outbound mail">
            <Toggle checked={em.smtp_use_tls} onChange={sem('smtp_use_tls')} />
          </Field>
          <Field label="From Name" desc="Sender name in system emails">
            <TextInput value={em.from_name} onChange={sem('from_name')} placeholder="HireFlow" />
          </Field>
          <Field label="From Email" desc="Sender address for system emails">
            <TextInput type="email" value={em.from_email} onChange={sem('from_email')} placeholder="noreply@crm.com" />
          </Field>
          <Field label="Reply-To Email" desc="Leave blank to use From Email">
            <TextInput type="email" value={em.smtp_reply_to_email} onChange={sem('smtp_reply_to_email')} placeholder="support@crm.com" />
          </Field>

          {/* Test Connection */}
          <div className="pt-3 mt-1 border-t border-surface-100">
            <div className="flex items-center gap-3">
              <button
                onClick={testSmtpConnection}
                disabled={smtpTesting}
                className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg border border-surface-300 bg-surface-50 hover:bg-surface-100 disabled:opacity-50 transition-colors"
              >
                {smtpTesting
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Testing…</>
                  : 'Test Connection'}
              </button>
              {smtpTestResult === 'ok' && (
                <span className="flex items-center gap-1.5 text-sm text-success-600">
                  <CheckCircle className="w-4 h-4" /> Connection successful
                </span>
              )}
              {smtpTestResult === 'fail' && (
                <span className="flex items-center gap-1.5 text-sm text-danger-600">
                  <XCircle className="w-4 h-4" /> Connection failed
                </span>
              )}
            </div>
            <p className="text-xs text-surface-400 mt-2">
              Note: Test uses the current form values. Save first if you want to persist the configuration.
            </p>
          </div>
        </div>
      </Section>

      {/* 7. Storage */}
      <Section icon={HardDrive} title="Storage" desc="File upload limits and allowed types">
        <Field label="Max Resume Size (MB)" desc="Maximum upload size for candidate resumes">
          <NumberInput value={st.max_resume_size_mb} onChange={sst('max_resume_size_mb')} min={1} max={100} />
        </Field>
        <Field label="Allowed Resume Types" desc="Comma-separated file extensions">
          <TextInput value={st.allowed_resume_types} onChange={sst('allowed_resume_types')} placeholder="pdf,doc,docx" />
        </Field>
        <Field label="Max Storage per Tenant (GB)" desc="Storage quota per tenant organisation">
          <NumberInput value={st.max_storage_per_tenant_gb} onChange={sst('max_storage_per_tenant_gb')} min={1} max={100} />
        </Field>
      </Section>

      {/* 8. Maintenance */}
      <Section icon={AlertTriangle} title="Maintenance" desc="Scheduled downtime controls">
        <Field label="Maintenance Mode" desc="Block all tenant logins while enabled">
          <Toggle checked={m.maintenance_mode} onChange={sm('maintenance_mode')} />
        </Field>
        {m.maintenance_mode && (
          <div className="mt-3">
            <label className="form-label">Maintenance Message</label>
            <textarea
              rows={3}
              value={m.maintenance_message}
              onChange={e => sm('maintenance_message')(e.target.value)}
              className="input w-full mt-1 text-sm"
              placeholder="We are performing scheduled maintenance. Please try again later."
            />
          </div>
        )}
        <Field label="Allow Super Admin Access" desc="Super admins can still log in during maintenance">
          <Toggle checked={m.allow_super_admin_access} onChange={sm('allow_super_admin_access')} />
        </Field>
      </Section>

      {/* 9. Tenant Activity Monitoring */}
      <Section icon={AlertTriangle} title="Tenant Activity Monitoring" desc="Flag tenants with no authenticated user activity">
        <Field label="Enable Monitoring" desc="Track tenant activity and alert on inactivity">
          <Toggle checked={tam.enabled} onChange={stam('enabled')} />
        </Field>
        <Field label="Inactivity Threshold (days)" desc="Flag a tenant inactive after this many days with no activity from any user">
          <NumberInput value={tam.inactivity_days} onChange={stam('inactivity_days')} min={1} max={90} />
        </Field>
      </Section>

      <div className="flex justify-end pb-8">
        <Button onClick={handleSave} isLoading={isSaving} leftIcon={<Save className="w-4 h-4" />}>
          Save All Settings
        </Button>
      </div>
    </div>
  )
}

export default SuperAdminSettings
