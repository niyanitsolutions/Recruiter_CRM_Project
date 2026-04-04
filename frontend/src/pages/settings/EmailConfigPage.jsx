import { useState, useEffect, useCallback } from 'react'
import { Mail, SendHorizonal, CheckCircle, XCircle, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import tenantSettingsService from '../../services/tenantSettingsService'
import {
  Breadcrumb, PageHeader, SectionCard, Field, Input, ActionBar, SkeletonLoader, Toggle,
} from './SettingsLayout'

const DEFAULT = {
  smtp_host: '', smtp_port: 587, smtp_username: '', smtp_password: '',
  smtp_use_tls: true, from_name: '', from_email: '', reply_to: '', is_enabled: false,
}

const EmailConfigPage = () => {
  const [data, setData]         = useState(DEFAULT)
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [testEmail, setTestEmail] = useState('')
  const [testing, setTesting]   = useState(false)
  const [testResult, setTestResult] = useState(null) // null | 'ok' | 'fail'

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const res = await tenantSettingsService.getEmailConfig()
      if (res.data && Object.keys(res.data).length > 0) setData({ ...DEFAULT, ...res.data })
    } catch {
      toast.error('Failed to load email configuration')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const save = async () => {
    try {
      setSaving(true)
      await tenantSettingsService.saveEmailConfig(data)
      toast.success('Email configuration saved')
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const sendTestEmail = async () => {
    if (!testEmail) { toast.error('Enter a test email address'); return }
    try {
      setTesting(true)
      setTestResult(null)
      // First save then test
      await tenantSettingsService.saveEmailConfig(data)
      await tenantSettingsService.testEmailConfig(testEmail)
      setTestResult('ok')
      toast.success('Test email sent successfully!')
    } catch {
      setTestResult('fail')
      toast.error('Test email failed. Check your SMTP settings.')
    } finally {
      setTesting(false)
    }
  }

  const set = (f, v) => setData(d => ({ ...d, [f]: v }))

  if (loading) return <div className="p-6 max-w-3xl mx-auto"><SkeletonLoader /></div>

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <Breadcrumb page="Email Configuration" />
      <PageHeader title="Email Configuration" description="Set up your SMTP server to send emails from your own domain." />

      <SectionCard title="SMTP Settings" icon={Mail}>
        <div className="border border-surface-100 rounded-xl px-4 mb-4">
          <Toggle
            checked={data.is_enabled}
            onChange={v => set('is_enabled', v)}
            label="Enable Custom Email"
            description="Use your own SMTP server instead of the default system mailer"
          />
        </div>

        <div className={`space-y-4 transition-opacity ${!data.is_enabled ? 'opacity-50 pointer-events-none' : ''}`}>
          <div className="grid grid-cols-2 gap-4">
            <Field label="SMTP Host">
              <Input value={data.smtp_host} onChange={e => set('smtp_host', e.target.value)} placeholder="smtp.gmail.com" />
            </Field>
            <Field label="SMTP Port">
              <Input type="number" value={data.smtp_port} onChange={e => set('smtp_port', parseInt(e.target.value) || 587)} className="w-28" />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Username / Email">
              <Input value={data.smtp_username} onChange={e => set('smtp_username', e.target.value)} placeholder="you@yourdomain.com" />
            </Field>
            <Field label="Password">
              <Input type="password" value={data.smtp_password} onChange={e => set('smtp_password', e.target.value)} placeholder="••••••••" autoComplete="new-password" />
            </Field>
          </div>

          <div className="border border-surface-100 rounded-xl px-4">
            <Toggle
              checked={data.smtp_use_tls}
              onChange={v => set('smtp_use_tls', v)}
              label="Use TLS/STARTTLS"
              description="Required by most modern email providers"
            />
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Sender Identity">
        <div className={`space-y-4 ${!data.is_enabled ? 'opacity-50 pointer-events-none' : ''}`}>
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

      {/* Test Email */}
      <SectionCard title="Test Connection">
        <div className={`space-y-3 ${!data.is_enabled ? 'opacity-50 pointer-events-none' : ''}`}>
          <p className="text-sm text-surface-600">Save your settings, then send a test email to verify the connection.</p>
          <div className="flex gap-3">
            <Input
              type="email"
              value={testEmail}
              onChange={e => setTestEmail(e.target.value)}
              placeholder="test@example.com"
              className="flex-1"
            />
            <button
              onClick={sendTestEmail}
              disabled={testing || !data.is_enabled}
              className="flex items-center gap-2 px-4 py-2 bg-surface-700 text-white text-sm font-medium rounded-lg hover:bg-surface-900 disabled:opacity-50 transition-colors"
            >
              {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <SendHorizonal className="w-4 h-4" />}
              {testing ? 'Sending…' : 'Send Test'}
            </button>
          </div>
          {testResult === 'ok' && (
            <div className="flex items-center gap-2 text-success-600 text-sm">
              <CheckCircle className="w-4 h-4" /> Test email delivered successfully.
            </div>
          )}
          {testResult === 'fail' && (
            <div className="flex items-center gap-2 text-danger-600 text-sm">
              <XCircle className="w-4 h-4" /> Delivery failed. Check host, port, and credentials.
            </div>
          )}
        </div>
      </SectionCard>

      <ActionBar saving={saving} onSave={save} />
    </div>
  )
}

export default EmailConfigPage
