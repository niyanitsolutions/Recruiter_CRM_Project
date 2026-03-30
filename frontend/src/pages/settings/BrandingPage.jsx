import { useState, useEffect, useCallback } from 'react'
import { Palette, Eye } from 'lucide-react'
import toast from 'react-hot-toast'
import tenantSettingsService from '../../services/tenantSettingsService'
import {
  Breadcrumb, PageHeader, SectionCard, Field, Input, Textarea, Toggle, ActionBar, SkeletonLoader,
} from './SettingsLayout'

const DEFAULT = {
  primary_color: '#6366f1',
  secondary_color: '#8b5cf6',
  accent_color: '#f59e0b',
  logo_url: '',
  favicon_url: '',
  login_banner_url: '',
  login_banner_text: '',
  company_tagline: '',
  footer_text: '',
  dark_mode_enabled: false,
}

const ColorField = ({ label, value, onChange, hint }) => (
  <Field label={label} hint={hint}>
    <div className="flex items-center gap-3">
      <input
        type="color"
        value={value || '#6366f1'}
        onChange={e => onChange(e.target.value)}
        className="w-10 h-10 rounded-lg border border-surface-200 cursor-pointer p-0.5"
      />
      <Input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="#6366f1"
        className="w-32 font-mono"
      />
      <div className="w-8 h-8 rounded-lg border border-surface-200" style={{ background: value }} />
    </div>
  </Field>
)

const BrandingPage = () => {
  const [data, setData]       = useState(DEFAULT)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [preview, setPreview] = useState(false)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const res = await tenantSettingsService.getBranding()
      if (res.data && Object.keys(res.data).length > 0) setData({ ...DEFAULT, ...res.data })
    } catch {
      toast.error('Failed to load branding settings')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const save = async () => {
    try {
      setSaving(true)
      await tenantSettingsService.saveBranding(data)
      toast.success('Branding settings saved')
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const set = (f, v) => setData(d => ({ ...d, [f]: v }))

  if (loading) return <div className="p-6 max-w-4xl mx-auto"><SkeletonLoader /></div>

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <Breadcrumb page="Branding & Theme" />
      <div className="flex items-center justify-between mb-0">
        <PageHeader title="Branding & Theme" description="Customise colours, logo, and login page appearance." />
        <button
          onClick={() => setPreview(!preview)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-surface-700 bg-white border border-surface-200 rounded-lg hover:bg-surface-50 transition-colors"
        >
          <Eye className="w-4 h-4" />
          {preview ? 'Hide' : 'Preview'}
        </button>
      </div>

      {/* Live Preview */}
      {preview && (
        <div className="border border-surface-200 rounded-xl overflow-hidden shadow-sm">
          <div className="px-4 py-2 bg-surface-50 text-xs text-surface-500 font-medium border-b border-surface-200">
            Login Page Preview
          </div>
          <div className="p-8 flex items-center justify-center min-h-32" style={{ background: `linear-gradient(135deg, ${data.primary_color}15, ${data.secondary_color}15)` }}>
            <div className="text-center space-y-2">
              {data.logo_url && (
                <img src={data.logo_url} alt="Logo" className="h-10 mx-auto object-contain" onError={e => { e.target.style.display = 'none' }} />
              )}
              <div className="w-8 h-1 mx-auto rounded-full" style={{ background: data.primary_color }} />
              {data.company_tagline && (
                <p className="text-sm text-surface-600 italic">{data.company_tagline}</p>
              )}
              <button
                className="px-4 py-2 text-white text-sm font-medium rounded-lg mt-2"
                style={{ background: data.primary_color }}
              >
                Sign In
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Colors */}
      <SectionCard title="Brand Colors" icon={Palette}>
        <div className="space-y-4">
          <ColorField label="Primary Color" value={data.primary_color} onChange={v => set('primary_color', v)} hint="Main buttons and active states" />
          <ColorField label="Secondary Color" value={data.secondary_color} onChange={v => set('secondary_color', v)} hint="Sidebar and secondary UI elements" />
          <ColorField label="Accent Color" value={data.accent_color} onChange={v => set('accent_color', v)} hint="Highlights and badges" />
        </div>
        <div className="border border-surface-100 rounded-xl px-4 mt-4">
          <Toggle checked={data.dark_mode_enabled} onChange={v => set('dark_mode_enabled', v)} label="Enable Dark Mode Option" description="Allow users to switch to dark theme" />
        </div>
      </SectionCard>

      {/* Assets */}
      <SectionCard title="Logo & Images">
        <div className="space-y-4">
          <Field label="Company Logo URL" hint="Appears in the sidebar and login page">
            <Input value={data.logo_url} onChange={e => set('logo_url', e.target.value)} placeholder="https://example.com/logo.png" />
            {data.logo_url && (
              <div className="mt-2 p-3 bg-surface-50 rounded-lg inline-block">
                <img src={data.logo_url} alt="Logo" className="h-10 object-contain" onError={e => { e.target.style.display = 'none' }} />
              </div>
            )}
          </Field>

          <Field label="Favicon URL" hint="Browser tab icon (32x32 or 64x64 PNG)">
            <Input value={data.favicon_url} onChange={e => set('favicon_url', e.target.value)} placeholder="https://example.com/favicon.png" />
          </Field>

          <Field label="Login Banner URL" hint="Full-width image shown on login page (recommended: 1200x800)">
            <Input value={data.login_banner_url} onChange={e => set('login_banner_url', e.target.value)} placeholder="https://example.com/banner.jpg" />
            {data.login_banner_url && (
              <div className="mt-2 rounded-lg overflow-hidden">
                <img src={data.login_banner_url} alt="Banner" className="h-32 w-full object-cover" onError={e => { e.target.style.display = 'none' }} />
              </div>
            )}
          </Field>
        </div>
      </SectionCard>

      {/* Text */}
      <SectionCard title="Text & Messages">
        <div className="space-y-4">
          <Field label="Login Banner Text" hint="Shown as overlay text on the login banner">
            <Input value={data.login_banner_text} onChange={e => set('login_banner_text', e.target.value)} placeholder="Empowering teams, connecting talent." />
          </Field>
          <Field label="Company Tagline" hint="Short phrase shown below the logo">
            <Input value={data.company_tagline} onChange={e => set('company_tagline', e.target.value)} placeholder="Your recruitment partner." />
          </Field>
          <Field label="Footer Text" hint="Shown at the bottom of every page">
            <Textarea value={data.footer_text} onChange={e => set('footer_text', e.target.value)} placeholder="© 2025 Your Company. All rights reserved." rows={2} />
          </Field>
        </div>
      </SectionCard>

      <ActionBar saving={saving} onSave={save} />
    </div>
  )
}

export default BrandingPage
