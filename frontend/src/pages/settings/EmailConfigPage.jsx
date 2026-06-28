import { useState, useEffect, useCallback } from 'react'
import { Mail, ShieldCheck, ShieldX, ToggleLeft, ToggleRight, Loader2, CheckCircle, AlertCircle, Info } from 'lucide-react'
import toast from 'react-hot-toast'
import tenantSettingsService from '../../services/tenantSettingsService'
import {
  Breadcrumb, PageHeader, SectionCard, Field, Input, ActionBar, SkeletonLoader, Toggle,
} from './SettingsLayout'

const DEFAULT = {
  smtp_host: '', smtp_port: 587, smtp_username: '', smtp_password: '',
  smtp_use_tls: true, from_name: '', from_email: '', reply_to: '',
  is_enabled: false,
  // Verification state fields (returned by backend)
  is_verified: false,
  is_active: false,
  has_smtp_password: false,
}

const StatusBadge = ({ verified, active }) => {
  if (active && verified) return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-success-50 text-success-700 border border-success-200">
      <CheckCircle className="w-3.5 h-3.5" /> Active
    </span>
  )
  if (verified) return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-warning-50 text-warning-700 border border-warning-200">
      <ShieldCheck className="w-3.5 h-3.5" /> Verified — Not Active
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-surface-100 text-surface-600 border border-surface-200">
      <ShieldX className="w-3.5 h-3.5" /> Not Verified
    </span>
  )
}

const EmailConfigPage = () => {
  const [data, setData]       = useState(DEFAULT)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [toggling, setToggling]   = useState(false)
  const [smtpSource, setSmtpSource] = useState(null) // null | {system_source, effective_source}

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const [cfgRes, statusRes] = await Promise.allSettled([
        tenantSettingsService.getEmailConfig(),
        tenantSettingsService.getSmtpStatus(),
      ])
      if (cfgRes.status === 'fulfilled' && cfgRes.value?.data) {
        setData(d => ({ ...d, ...cfgRes.value.data }))
      }
      if (statusRes.status === 'fulfilled' && statusRes.value?.data) {
        setSmtpSource(statusRes.value.data)
      }
    } catch {
      toast.error('Failed to load email configuration')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // ── Step 1: Save credentials ───────────────────────────────────────────────
  const save = async () => {
    try {
      setSaving(true)
      const res = await tenantSettingsService.saveEmailConfig(data)
      setData(d => ({ ...d, ...(res.data || {}), smtp_password: '' }))
      toast.success('Configuration saved. Now verify the connection.')
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  // ── Step 2: Verify connection ──────────────────────────────────────────────
  const verify = async () => {
    try {
      setVerifying(true)
      const res = await tenantSettingsService.verifyEmailConfig()
      setData(d => ({ ...d, is_verified: true }))
      toast.success(res.message || 'SMTP connection verified!')
    } catch (e) {
      setData(d => ({ ...d, is_verified: false, is_active: false }))
      toast.error(e.response?.data?.detail || 'Verification failed. Check SMTP credentials.')
    } finally {
      setVerifying(false)
    }
  }

  // ── Step 3: Toggle active state ───────────────────────────────────────────
  const toggleActive = async () => {
    const wantActive = !data.is_active
    if (wantActive && !data.is_verified) {
      toast.error('Verify the SMTP connection first before activating.')
      return
    }
    try {
      setToggling(true)
      await tenantSettingsService.toggleEmailConfig(wantActive)
      setData(d => ({ ...d, is_active: wantActive }))
      // Refresh status banner
      const statusRes = await tenantSettingsService.getSmtpStatus()
      if (statusRes?.data) setSmtpSource(statusRes.data)
      toast.success(wantActive ? 'Custom SMTP activated.' : 'Custom SMTP deactivated.')
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to update SMTP status')
    } finally {
      setToggling(false)
    }
  }

  const set = (f, v) => setData(d => ({ ...d, [f]: v }))

  if (loading) return <div className="p-6 max-w-3xl mx-auto"><SkeletonLoader /></div>

  const configSource = smtpSource?.effective_source
  const usingPlatform = !data.is_active

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <Breadcrumb page="Email Configuration" />
      <PageHeader
        title="Email Configuration"
        description="Set up your SMTP server to send business emails from your own domain."
      />

      {/* ── Current SMTP source banner ─────────────────────────────────────── */}
      {smtpSource && (
        <div className={`flex items-start gap-3 p-4 rounded-xl border text-sm ${
          data.is_active
            ? 'bg-success-50 border-success-200 text-success-800'
            : 'bg-blue-50 border-blue-200 text-blue-800'
        }`}>
          <Info className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            {data.is_active
              ? 'Business emails are using your custom SMTP configuration.'
              : `Business emails are using ${configSource === 'platform_db' ? 'the platform SMTP' : configSource === 'platform_env' ? 'the platform SMTP (.env)' : 'no SMTP — emails are disabled'}.`
            }
            {usingPlatform && (
              <span className="font-medium"> Activate custom SMTP below to override this.</span>
            )}
          </div>
        </div>
      )}

      {/* ── Status + workflow steps ───────────────────────────────────────── */}
      <SectionCard title="Setup Status">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Connection Status</span>
            <StatusBadge verified={data.is_verified} active={data.is_active} />
          </div>

          {/* Workflow steps */}
          <div className="flex items-center gap-0">
            {[
              { n: 1, label: 'Save', done: data.has_smtp_password },
              { n: 2, label: 'Verify', done: data.is_verified },
              { n: 3, label: 'Activate', done: data.is_active },
            ].map((step, i) => (
              <div key={step.n} className="flex items-center">
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border
                  ${step.done
                    ? 'bg-success-50 text-success-700 border-success-200'
                    : 'bg-surface-100 text-surface-500 border-surface-200'}`}>
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs
                    ${step.done ? 'bg-success-500 text-white' : 'bg-surface-300 text-surface-600'}`}>
                    {step.n}
                  </span>
                  {step.label}
                </div>
                {i < 2 && <div className="w-6 h-px bg-surface-200 mx-1" />}
              </div>
            ))}
          </div>
        </div>
      </SectionCard>

      {/* ── Step 1: SMTP Credentials ──────────────────────────────────────── */}
      <SectionCard title="Step 1 — SMTP Credentials" icon={Mail}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="SMTP Host">
              <Input value={data.smtp_host} onChange={e => set('smtp_host', e.target.value)} placeholder="smtp.gmail.com" />
            </Field>
            <Field label="SMTP Port">
              <Input type="number" value={data.smtp_port} onChange={e => set('smtp_port', parseInt(e.target.value) || 587)} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Username / Email">
              <Input value={data.smtp_username} onChange={e => set('smtp_username', e.target.value)} placeholder="you@yourdomain.com" />
            </Field>
            <Field label="Password" hint={data.has_smtp_password ? 'Leave blank to keep existing' : ''}>
              <Input type="password" value={data.smtp_password} onChange={e => set('smtp_password', e.target.value)} placeholder={data.has_smtp_password ? '(unchanged)' : 'App password or SMTP password'} autoComplete="new-password" />
            </Field>
          </div>

          <div className="border border-surface-100 rounded-xl px-4">
            <Toggle checked={data.smtp_use_tls} onChange={v => set('smtp_use_tls', v)} label="Use TLS/STARTTLS" description="Required by most modern email providers" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="From Name" hint='e.g. "Acme Recruitment"'>
              <Input value={data.from_name} onChange={e => set('from_name', e.target.value)} placeholder="Your Company" />
            </Field>
            <Field label="From Email">
              <Input type="email" value={data.from_email} onChange={e => set('from_email', e.target.value)} placeholder="noreply@yourcompany.com" />
            </Field>
          </div>
          <Field label="Reply-To Email" hint="Leave blank to use From Email">
            <Input type="email" value={data.reply_to} onChange={e => set('reply_to', e.target.value)} placeholder="support@yourcompany.com" />
          </Field>
        </div>
      </SectionCard>

      {/* ── Step 2: Verify ───────────────────────────────────────────────── */}
      <SectionCard title="Step 2 — Verify Connection">
        <div className="space-y-3">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            After saving credentials, click Verify to test the live SMTP connection.
            The SMTP is not used until verification succeeds and you activate it.
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={verify}
              disabled={verifying || !data.has_smtp_password}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors disabled:opacity-50
                bg-blue-600 text-white hover:bg-blue-700 border-transparent"
            >
              {verifying
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Verifying…</>
                : <><ShieldCheck className="w-4 h-4" /> Verify Connection</>
              }
            </button>
            {data.is_verified && (
              <span className="flex items-center gap-1.5 text-sm text-success-600">
                <CheckCircle className="w-4 h-4" /> Connection verified
              </span>
            )}
            {!data.is_verified && data.has_smtp_password && (
              <span className="flex items-center gap-1.5 text-sm text-surface-500">
                <AlertCircle className="w-4 h-4" /> Not yet verified
              </span>
            )}
          </div>
        </div>
      </SectionCard>

      {/* ── Step 3: Activate / Deactivate ────────────────────────────────── */}
      <SectionCard title="Step 3 — Activate">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              {data.is_active ? 'Custom SMTP is Active' : 'Custom SMTP is Inactive'}
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {data.is_active
                ? 'Business emails are routed through your SMTP. Deactivating immediately falls back to platform SMTP.'
                : data.is_verified
                  ? 'Connection verified — click to activate your custom SMTP.'
                  : 'Complete Steps 1 and 2 before activating.'}
            </p>
          </div>
          <button
            onClick={toggleActive}
            disabled={toggling || (!data.is_active && !data.is_verified)}
            className="transition-opacity disabled:opacity-40"
            title={!data.is_verified && !data.is_active ? 'Verify connection first' : ''}
          >
            {toggling
              ? <Loader2 className="w-7 h-7 animate-spin text-surface-400" />
              : data.is_active
                ? <ToggleRight className="w-10 h-10 text-success-500" />
                : <ToggleLeft className="w-10 h-10 text-surface-400" />
            }
          </button>
        </div>
      </SectionCard>

      <ActionBar saving={saving} onSave={save} saveLabel="Save Credentials" />
    </div>
  )
}

export default EmailConfigPage
