import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
import {
  Building2, User, CreditCard, Shield, Globe, Briefcase,
  Save, Loader2, Plus, Trash2, MapPin, AlertCircle, RefreshCw,
} from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'
import { selectUser } from '../../store/authSlice'
import { fetchLocalization, saveLocalization as saveLocalizationThunk, selectLocalization } from '../../store/localizationSlice'
import UpgradeSeatsModal from '../../components/subscription/UpgradeSeatsModal'

// ── Timezone list (abbreviated) ────────────────────────────────────────────
const TIMEZONES = [
  'Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Asia/Tokyo',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin',
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'UTC',
]

const INDUSTRIES = [
  'IT', 'Finance', 'Healthcare', 'Education', 'Manufacturing',
  'Retail', 'Real Estate', 'Logistics', 'Media', 'Government', 'Other',
]

// ── Small reusable bits ────────────────────────────────────────────────────

const SectionCard = ({ title, icon: Icon, children }) => (
  <div className="bg-white rounded-xl shadow-sm border border-surface-100">
    <div className="flex items-center gap-3 px-6 py-4 border-b border-surface-100">
      <div className="p-2 bg-accent-50 rounded-lg">
        <Icon className="w-5 h-5 text-accent-600" />
      </div>
      <h2 className="text-base font-semibold text-surface-900">{title}</h2>
    </div>
    <div className="p-6">{children}</div>
  </div>
)

const Field = ({ label, children, hint }) => (
  <div>
    <label className="block text-sm font-medium text-surface-700 mb-1">{label}</label>
    {children}
    {hint && <p className="mt-1 text-xs text-surface-400">{hint}</p>}
  </div>
)

const Input = ({ ...props }) => (
  <input
    {...props}
    className="w-full px-3 py-2 text-sm border border-surface-200 rounded-lg
               focus:outline-none focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500
               disabled:bg-surface-50 disabled:text-surface-400 transition-colors"
  />
)

const Select = ({ children, ...props }) => (
  <select
    {...props}
    className="w-full px-3 py-2 text-sm border border-surface-200 rounded-lg
               focus:outline-none focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500
               bg-white transition-colors"
  >
    {children}
  </select>
)

const SaveBtn = ({ saving, onClick, label = 'Save Changes' }) => (
  <button
    onClick={onClick}
    disabled={saving}
    className="inline-flex items-center gap-2 px-4 py-2 bg-accent-600 text-white text-sm
               font-medium rounded-lg hover:bg-accent-700 disabled:opacity-60 transition-colors"
  >
    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
    {saving ? 'Saving…' : label}
  </button>
)

const Toggle = ({ checked, onChange, label, description }) => (
  <div className="flex items-center justify-between py-3">
    <div>
      <p className="text-sm font-medium text-surface-800">{label}</p>
      {description && <p className="text-xs text-surface-500 mt-0.5">{description}</p>}
    </div>
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none
                  ${checked ? 'bg-accent-600' : 'bg-surface-300'}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform
                    ${checked ? 'translate-x-6' : 'translate-x-1'}`}
      />
    </button>
  </div>
)

// ── TAB DEFINITIONS ────────────────────────────────────────────────────────

const TABS = [
  { id: 'profile',       label: 'Company Profile', icon: Building2 },
  { id: 'contact',       label: 'Admin Contact',   icon: User },
  { id: 'subscription',  label: 'Subscription',    icon: CreditCard },
  { id: 'security',      label: 'Security',        icon: Shield },
  { id: 'hr',            label: 'HR Settings',     icon: Briefcase },
  { id: 'localization',  label: 'Localization',    icon: Globe },
]

const DATE_FORMAT_OPTIONS = [
  { value: 'DD-MM-YYYY', label: 'DD-MM-YYYY  (e.g. 20-06-2026)' },
  { value: 'MM-DD-YYYY', label: 'MM-DD-YYYY  (e.g. 06-20-2026)' },
  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD  (e.g. 2026-06-20)' },
  { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY  (e.g. 20/06/2026)' },
  { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY  (e.g. 06/20/2026)' },
  { value: 'YYYY/MM/DD', label: 'YYYY/MM/DD  (e.g. 2026/06/20)' },
]

const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'hi', label: 'Hindi' },
  { value: 'ta', label: 'Tamil' },
  { value: 'te', label: 'Telugu' },
  { value: 'kn', label: 'Kannada' },
  { value: 'ml', label: 'Malayalam' },
  { value: 'mr', label: 'Marathi' },
  { value: 'gu', label: 'Gujarati' },
  { value: 'bn', label: 'Bengali' },
]

// ── Error handling helper ──────────────────────────────────────────────────
// Surfaces a specific, actionable message instead of a generic "Unexpected
// error" — while the raw error is always available in the browser console
// for support/debugging.
const getErrorMessage = (e, fallback) => {
  console.error(fallback, e)
  if (!e?.response) {
    return 'Network unavailable. Please check your connection and try again.'
  }
  const status = e.response.status
  const detail = e.response?.data?.detail
  if (typeof detail === 'string' && detail.trim() && !/unexpected error/i.test(detail)) {
    return detail
  }
  if (status === 401 || status === 403) {
    return 'You do not have permission to perform this action.'
  }
  if (status === 404) {
    return 'The requested settings could not be found.'
  }
  return fallback
}

// ── IP address validation (Phase 4 / 8) ────────────────────────────────────
const IPV4_RE = /^(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)){3}$/
const IPV6_RE = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|:((:[0-9a-fA-F]{1,4}){1,7}|:)|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6}))$/

const isValidIp = (ip) => IPV4_RE.test(ip) || IPV6_RE.test(ip)

// Client-side mirror of the server's -90..90 / -180..180 / positive-radius
// rules so the user gets an inline message instead of waiting on a 422.
const validateGeoFence = (g) => {
  const errs = []
  if (g.geo_fence_enabled) {
    if (g.geo_fence_locations.length === 0) {
      errs.push('Geo Fence is enabled but no locations were added. Add a location or turn Geo Fence off.')
    }
    g.geo_fence_locations.forEach((loc, i) => {
      const label = loc.name ? `"${loc.name}"` : `Location ${i + 1}`
      const lat = parseFloat(loc.latitude)
      const lng = parseFloat(loc.longitude)
      const rad = parseInt(loc.radius, 10)
      if (loc.latitude === '' || Number.isNaN(lat) || lat < -90 || lat > 90) {
        errs.push(`${label}: Latitude must be a number between -90 and 90.`)
      }
      if (loc.longitude === '' || Number.isNaN(lng) || lng < -180 || lng > 180) {
        errs.push(`${label}: Longitude must be a number between -180 and 180.`)
      }
      if (loc.radius === '' || Number.isNaN(rad) || rad <= 0) {
        errs.push(`${label}: Radius must be a positive number.`)
      }
    })
  }
  if (g.ip_restriction_enabled && (!g.approved_ips || g.approved_ips.length === 0)) {
    errs.push('IP Restriction is enabled but no IP addresses were added. Add an IP or turn IP Restriction off.')
  }
  return errs
}

// ── DEFAULT EMPTY STATES ───────────────────────────────────────────────────

const DEFAULT_PROFILE = {
  company_name: '', company_logo_url: '', industry: '', website: '',
  address: '', city: '', state: '', country: 'India', zip_code: '', timezone: 'Asia/Kolkata',
}
const DEFAULT_CONTACT = { admin_name: '', admin_email: '', admin_phone: '', support_email: '' }
const DEFAULT_GEO = {
  geo_fence_enabled: false, geo_fence_locations: [], user_geo_fence: [],
  ip_restriction_enabled: false, approved_ips: [],
}
const DEFAULT_LOCALIZATION = { date_format: 'DD-MM-YYYY', time_format: '12h', timezone: 'Asia/Kolkata', language: 'en' }

// ── MAIN COMPONENT ─────────────────────────────────────────────────────────

const CompanySettings = () => {
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const user     = useSelector(selectUser)
  const localizationFromStore = useSelector(selectLocalization)

  const [activeTab, setActiveTab] = useState('profile')
  const [empDefaults, setEmpDefaults] = useState({
    probation_enabled: false, probation_days: 90, notice_enabled: false, notice_days: 30,
  })
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)

  const [profile,  setProfile]  = useState(DEFAULT_PROFILE)
  const [contact,  setContact]  = useState(DEFAULT_CONTACT)
  const [geo,      setGeo]      = useState(DEFAULT_GEO)
  const [locForm,  setLocForm]  = useState(DEFAULT_LOCALIZATION)
  const [subscription, setSubscription] = useState(null)
  const [subLoading,   setSubLoading]   = useState(false)
  const [loadError,    setLoadError]    = useState('')

  // IP restriction — add/edit inputs
  const [ipInput,       setIpInput]       = useState('')
  const [ipError,       setIpError]       = useState('')
  const [editingIpIdx,  setEditingIpIdx]  = useState(-1)
  const [editingIpValue, setEditingIpValue] = useState('')

  // ── Load all settings ──────────────────────────────────────────────────
  const loadSettings = useCallback(async () => {
    try {
      setLoading(true)
      setLoadError('')
      const res = await api.get('/company-settings/')
      const d   = res.data?.data || {}
      setProfile({
        company_name:     d.company_name     || '',
        company_logo_url: d.company_logo_url || '',
        industry:         d.industry         || '',
        website:          d.website          || '',
        address:          d.address          || '',
        city:             d.city             || '',
        state:            d.state            || '',
        country:          d.country          || 'India',
        zip_code:         d.zip_code         || '',
        timezone:         d.timezone         || 'Asia/Kolkata',
      })
      setContact({
        admin_name:    d.admin_name    || '',
        admin_email:   d.admin_email   || '',
        admin_phone:   d.admin_phone   || '',
        support_email: d.support_email || '',
      })
      setGeo({
        geo_fence_enabled:      !!d.geo_fence_enabled,
        geo_fence_locations:    d.geo_fence_locations || [],
        user_geo_fence:         d.user_geo_fence      || [],
        ip_restriction_enabled: !!d.attendance_ip_restriction_enabled,
        approved_ips:           d.approved_office_ips || [],
      })
      if (d.employment_defaults) {
        setEmpDefaults({
          probation_enabled: !!d.employment_defaults.probation_enabled,
          probation_days:    d.employment_defaults.probation_days ?? 90,
          notice_enabled:    !!d.employment_defaults.notice_enabled,
          notice_days:       d.employment_defaults.notice_days ?? 30,
        })
      }
      // Load localization from the unified tenant-settings endpoint. This is
      // the single source of truth for timezone — the Profile tab's Time
      // Zone selector is mirrored from it below so the two tabs never show
      // different values (see saveProfile / Select onChange for the other
      // half of this sync).
      try {
        const locRes = await api.get('/tenant-settings/localization')
        const locData = locRes.data?.data || {}
        const resolvedLoc = {
          date_format: locData.date_format || DEFAULT_LOCALIZATION.date_format,
          time_format: locData.time_format || DEFAULT_LOCALIZATION.time_format,
          timezone:    locData.timezone    || DEFAULT_LOCALIZATION.timezone,
          language:    locData.language    || DEFAULT_LOCALIZATION.language,
        }
        setLocForm(resolvedLoc)
        setProfile(p => ({ ...p, timezone: resolvedLoc.timezone }))
      } catch { /* keep defaults */ }
    } catch (e) {
      const msg = getErrorMessage(e, 'Unable to load company settings. Please try again.')
      setLoadError(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadSubscription = useCallback(async () => {
    try {
      setSubLoading(true)
      const res = await api.get('/company-settings/subscription')
      setSubscription(res.data?.data || null)
    } catch (e) {
      getErrorMessage(e, 'Unable to load subscription details.')  // logs to console
      setSubscription(null)
    } finally {
      setSubLoading(false)
    }
  }, [])

  useEffect(() => { loadSettings() }, [loadSettings])
  useEffect(() => {
    if (activeTab === 'subscription' && !subscription) loadSubscription()
  }, [activeTab, subscription, loadSubscription])

  // ── Save handlers ──────────────────────────────────────────────────────

  const saveProfile = async () => {
    try {
      setSaving(true)
      await api.put('/company-settings/profile', profile)
      // Timezone is canonically owned by Localization (tenant_settings) — mirror
      // it there too so a timezone change made from this tab is never lost and
      // both tabs keep showing the same value (see Phase 5 sync).
      const locResult = await dispatch(saveLocalizationThunk({ ...locForm, timezone: profile.timezone }))
      if (saveLocalizationThunk.fulfilled.match(locResult)) {
        setLocForm(f => ({ ...f, timezone: profile.timezone }))
      }
      toast.success('Company profile saved')
    } catch (e) {
      toast.error(getErrorMessage(e, 'Unable to save company profile. Please try again.'))
    } finally { setSaving(false) }
  }

  const saveContact = async () => {
    try {
      setSaving(true)
      await api.put('/company-settings/contact', contact)
      toast.success('Contact details saved')
    } catch (e) {
      toast.error(getErrorMessage(e, 'Unable to save contact details. Please try again.'))
    } finally { setSaving(false) }
  }

  const saveSecurity = async () => {
    const errors = validateGeoFence(geo)
    if (errors.length) {
      toast.error(errors[0])
      return
    }
    try {
      setSaving(true)
      // Coerce location fields to real numbers only at save time — the inputs
      // themselves keep whatever raw string the user is typing (see
      // updateLocation) so backspace/clear/paste behave like a normal input.
      const payload = {
        ...geo,
        geo_fence_locations: geo.geo_fence_locations.map(loc => ({
          ...loc,
          latitude:  parseFloat(loc.latitude)  || 0,
          longitude: parseFloat(loc.longitude) || 0,
          radius:    parseInt(loc.radius, 10)  || 500,
        })),
      }
      await api.put('/company-settings/security', payload)
      setGeo(payload)
      toast.success('Security settings saved')
    } catch (e) {
      toast.error(getErrorMessage(e, 'Geo Fence settings could not be saved. Please verify the entered values.'))
    } finally { setSaving(false) }
  }

  const saveEmploymentDefaults = async () => {
    if (Number(empDefaults.probation_days) <= 0) { toast.error('Probation days must be greater than 0.'); return }
    if (Number(empDefaults.notice_days) < 0)     { toast.error('Notice days cannot be negative.'); return }
    try {
      setSaving(true)
      const payload = {
        probation_enabled: !!empDefaults.probation_enabled,
        probation_days:    Number(empDefaults.probation_days) || 90,
        notice_enabled:    !!empDefaults.notice_enabled,
        notice_days:       Number(empDefaults.notice_days) || 0,
      }
      await api.put('/company-settings/employment-defaults', payload)
      setEmpDefaults(payload)
      toast.success('Employment defaults saved')
    } catch (e) {
      toast.error(getErrorMessage(e, 'Employment defaults could not be saved.'))
    } finally { setSaving(false) }
  }

  const saveLocalizationSettings = async () => {
    try {
      setSaving(true)
      const result = await dispatch(saveLocalizationThunk(locForm))
      if (saveLocalizationThunk.fulfilled.match(result)) {
        setProfile(p => ({ ...p, timezone: locForm.timezone }))
        toast.success('Localization settings saved')
      } else {
        toast.error(result.payload || 'Unable to save localization settings. Please try again.')
      }
    } finally { setSaving(false) }
  }

  // ── Geo fence helpers ──────────────────────────────────────────────────

  const addLocation = () => {
    setGeo(g => ({
      ...g,
      geo_fence_locations: [
        ...g.geo_fence_locations,
        { id: Date.now().toString(), name: '', latitude: 0, longitude: 0, radius: 500 },
      ],
    }))
  }

  const updateLocation = (idx, field, value) => {
    // Store the raw input value as-is (including '' while the user is
    // clearing the field) — numbers are only parsed on save. Forcing
    // `parseFloat(value) || 0` on every keystroke made it impossible to
    // backspace a field to empty before typing a new value.
    setGeo(g => {
      const locs = [...g.geo_fence_locations]
      locs[idx] = { ...locs[idx], [field]: value }
      return { ...g, geo_fence_locations: locs }
    })
  }

  const removeLocation = (idx) => {
    setGeo(g => ({ ...g, geo_fence_locations: g.geo_fence_locations.filter((_, i) => i !== idx) }))
  }

  // ── IP restriction helpers (Phase 4) ───────────────────────────────────

  const handleAddIp = () => {
    const ip = ipInput.trim()
    if (!ip) return
    if (!isValidIp(ip)) {
      setIpError('Enter a valid IPv4 or IPv6 address.')
      return
    }
    if (geo.approved_ips.includes(ip)) {
      setIpError('This IP address has already been added.')
      return
    }
    setGeo(g => ({ ...g, approved_ips: [...g.approved_ips, ip] }))
    setIpInput('')
    setIpError('')
  }

  const removeIp = (idx) => {
    setGeo(g => ({ ...g, approved_ips: g.approved_ips.filter((_, i) => i !== idx) }))
    if (editingIpIdx === idx) setEditingIpIdx(-1)
  }

  const startEditIp = (idx) => {
    setEditingIpIdx(idx)
    setEditingIpValue(geo.approved_ips[idx])
    setIpError('')
  }

  const commitEditIp = (idx) => {
    const ip = editingIpValue.trim()
    if (!ip) { setEditingIpIdx(-1); return }
    if (!isValidIp(ip)) {
      setIpError('Enter a valid IPv4 or IPv6 address.')
      return
    }
    if (geo.approved_ips.some((existing, i) => existing === ip && i !== idx)) {
      setIpError('This IP address has already been added.')
      return
    }
    setGeo(g => {
      const ips = [...g.approved_ips]
      ips[idx] = ip
      return { ...g, approved_ips: ips }
    })
    setEditingIpIdx(-1)
    setIpError('')
  }


  if (loading) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-surface-200 rounded w-56" />
          <div className="h-12 bg-surface-100 rounded-xl" />
          <div className="h-64 bg-surface-100 rounded-xl" />
        </div>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="flex flex-col items-center gap-3 py-16 bg-white border border-surface-100 rounded-xl">
          <AlertCircle className="w-8 h-8 text-danger-400" />
          <p className="text-sm font-medium text-surface-700">{loadError}</p>
          <button
            onClick={loadSettings}
            className="mt-1 inline-flex items-center gap-2 px-4 py-2 bg-accent-600 text-white text-sm
                       font-medium rounded-lg hover:bg-accent-700 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Try Again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-surface-900">Company Settings</h1>
        <p className="text-surface-500 mt-1 text-sm">
          Configure your organisation's profile, security, and preferences.
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-surface-100 p-1 rounded-xl overflow-x-auto">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap
                        transition-colors flex-1 justify-center
                        ${activeTab === tab.id
                          ? 'bg-white text-accent-600 shadow-sm'
                          : 'text-surface-500 hover:text-surface-800'}`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── 1. COMPANY PROFILE ─────────────────────────────────────────────── */}
      {activeTab === 'profile' && (
        <SectionCard title="Company Profile" icon={Building2}>
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Company Name">
                <Input
                  value={profile.company_name}
                  onChange={e => setProfile(p => ({ ...p, company_name: e.target.value }))}
                  placeholder="Acme Corp"
                />
              </Field>
              <Field label="Industry">
                <Select
                  value={profile.industry}
                  onChange={e => setProfile(p => ({ ...p, industry: e.target.value }))}
                >
                  <option value="">Select industry…</option>
                  {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
                </Select>
              </Field>
            </div>

            <Field label="Company Logo URL" hint="Paste a publicly accessible image URL">
              <Input
                value={profile.company_logo_url}
                onChange={e => setProfile(p => ({ ...p, company_logo_url: e.target.value }))}
                placeholder="https://example.com/logo.png"
              />
            </Field>

            {profile.company_logo_url && (
              <div className="flex items-center gap-3">
                <img
                  src={profile.company_logo_url}
                  alt="Logo preview"
                  className="h-12 w-auto rounded border border-surface-200 object-contain"
                  onError={e => { e.target.style.display = 'none' }}
                />
                <span className="text-xs text-surface-400">Logo preview</span>
              </div>
            )}

            <Field label="Website">
              <Input
                value={profile.website}
                onChange={e => setProfile(p => ({ ...p, website: e.target.value }))}
                placeholder="https://www.example.com"
              />
            </Field>

            <Field label="Address">
              <Input
                value={profile.address}
                onChange={e => setProfile(p => ({ ...p, address: e.target.value }))}
                placeholder="123 Main Street"
              />
            </Field>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Field label="City">
                <Input
                  value={profile.city}
                  onChange={e => setProfile(p => ({ ...p, city: e.target.value }))}
                  placeholder="Bangalore"
                />
              </Field>
              <Field label="State">
                <Input
                  value={profile.state}
                  onChange={e => setProfile(p => ({ ...p, state: e.target.value }))}
                  placeholder="Karnataka"
                />
              </Field>
              <Field label="Country">
                <Input
                  value={profile.country}
                  onChange={e => setProfile(p => ({ ...p, country: e.target.value }))}
                  placeholder="India"
                />
              </Field>
              <Field label="Zip Code">
                <Input
                  value={profile.zip_code}
                  onChange={e => setProfile(p => ({ ...p, zip_code: e.target.value }))}
                  placeholder="560001"
                />
              </Field>
            </div>

            <Field label="Time Zone" hint="Shared with the Localization tab — changing it here updates both">
              <Select
                value={profile.timezone}
                onChange={e => {
                  const tz = e.target.value
                  setProfile(p => ({ ...p, timezone: tz }))
                  setLocForm(f => ({ ...f, timezone: tz }))
                }}
              >
                {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
              </Select>
            </Field>

            <div className="flex justify-end pt-2">
              <SaveBtn saving={saving} onClick={saveProfile} />
            </div>
          </div>
        </SectionCard>
      )}

      {/* ── 2. ADMIN CONTACT ───────────────────────────────────────────────── */}
      {activeTab === 'contact' && (
        <SectionCard title="Company Admin Contact" icon={User}>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Admin Name">
                <Input
                  value={contact.admin_name}
                  onChange={e => setContact(c => ({ ...c, admin_name: e.target.value }))}
                  placeholder="John Smith"
                />
              </Field>
              <Field label="Admin Phone">
                <Input
                  value={contact.admin_phone}
                  onChange={e => setContact(c => ({ ...c, admin_phone: e.target.value }))}
                  placeholder="+91 98765 43210"
                />
              </Field>
              <Field label="Admin Email">
                <Input
                  type="email"
                  value={contact.admin_email}
                  onChange={e => setContact(c => ({ ...c, admin_email: e.target.value }))}
                  placeholder="admin@company.com"
                />
              </Field>
              <Field label="Support Email" hint="Used for system notification replies">
                <Input
                  type="email"
                  value={contact.support_email}
                  onChange={e => setContact(c => ({ ...c, support_email: e.target.value }))}
                  placeholder="support@company.com"
                />
              </Field>
            </div>
            <div className="flex justify-end pt-2">
              <SaveBtn saving={saving} onClick={saveContact} label="Update Contact" />
            </div>
          </div>
        </SectionCard>
      )}

      {/* ── 3. SUBSCRIPTION (read-only) ────────────────────────────────────── */}
      {activeTab === 'subscription' && (
        <SectionCard title="Subscription Details" icon={CreditCard}>
          {subLoading ? (
            <div className="animate-pulse space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-10 bg-surface-100 rounded-lg" />
              ))}
            </div>
          ) : subscription ? (
            <div className="space-y-4">
              {/* Plan summary banner */}
              <div className="flex items-center justify-between bg-accent-50 rounded-xl px-5 py-4 border border-accent-100">
                <div>
                  <p className="text-xs text-accent-600 font-medium uppercase tracking-wide">Current Plan</p>
                  <p className="text-xl font-bold text-accent-700 mt-0.5">{subscription.plan_display_name || subscription.plan_name}</p>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-semibold
                  ${subscription.is_trial
                    ? 'bg-warning-100 text-warning-700'
                    : subscription.status?.toLowerCase() === 'active'
                      ? 'bg-success-100 text-success-700'
                      : 'bg-danger-100 text-danger-700'}`}>
                  {subscription.status}
                </span>
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[
                  { label: 'Price Per User',    value: subscription.price_per_user != null ? `₹${subscription.price_per_user}` : '—' },
                  { label: 'Allowed Users',     value: subscription.max_users ?? '—' },
                  { label: 'Current Users',     value: subscription.current_users ?? 0 },
                  { label: 'Remaining Users',   value: subscription.remaining_users ?? '—' },
                  { label: 'Start Date',        value: subscription.plan_start_date ? new Date(subscription.plan_start_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—' },
                  { label: 'Expiry Date',       value: subscription.plan_expiry_date ? new Date(subscription.plan_expiry_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—' },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-surface-50 rounded-lg px-4 py-3 border border-surface-100">
                    <p className="text-xs text-surface-500 mb-1">{label}</p>
                    <p className="text-sm font-semibold text-surface-900">{value}</p>
                  </div>
                ))}
              </div>

              {/* User utilisation bar */}
              {subscription.max_users > 0 && (
                <div>
                  <div className="flex justify-between text-xs text-surface-500 mb-1">
                    <span>User utilisation</span>
                    <span>{subscription.current_users} / {subscription.max_users}</span>
                  </div>
                  <div className="h-2 bg-surface-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent-500 rounded-full transition-all"
                      style={{ width: `${Math.min((subscription.current_users / subscription.max_users) * 100, 100)}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex flex-wrap gap-3 pt-2">
                <button
                  onClick={() => setShowUpgradeModal(true)}
                  className="px-4 py-2 bg-accent-600 text-white text-sm font-medium rounded-lg hover:bg-accent-700 transition-colors"
                >
                  Manage Subscription
                </button>
                <button
                  onClick={() => navigate('/payouts/invoices')}
                  className="px-4 py-2 bg-white border border-surface-200 text-surface-700 text-sm font-medium rounded-lg hover:bg-surface-50 transition-colors"
                >
                  View Billing
                </button>
                <button
                  onClick={loadSubscription}
                  className="ml-auto px-3 py-2 text-surface-500 hover:text-surface-700 hover:bg-surface-100 rounded-lg transition-colors"
                  title="Refresh"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 py-10 text-surface-400">
              <AlertCircle className="w-8 h-8" />
              <p className="text-sm">Could not load subscription details.</p>
              <button onClick={loadSubscription} className="text-sm text-accent-600 hover:underline">
                Try again
              </button>
            </div>
          )}
        </SectionCard>
      )}

      {/* ── 4. SECURITY / GEO FENCE ───────────────────────────────────────── */}
      {activeTab === 'security' && (
        <SectionCard title="Security Settings" icon={Shield}>
          <div className="space-y-6">
            {/* Company-wide toggle */}
            <div className="border border-surface-200 rounded-xl p-4 space-y-1">
              <Toggle
                checked={geo.geo_fence_enabled}
                onChange={v => setGeo(g => ({ ...g, geo_fence_enabled: v }))}
                label="Enable Geo Fence for Entire Company"
                description="When enabled, all users must log in from an allowed location."
              />
            </div>

            {/* Location list */}
            {geo.geo_fence_enabled && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-surface-800 flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-accent-500" />
                    Allowed Locations
                  </h3>
                  <button
                    onClick={addLocation}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium
                               bg-accent-50 text-accent-700 rounded-lg hover:bg-accent-100 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Location
                  </button>
                </div>

                {geo.geo_fence_locations.length === 0 && (
                  <p className="text-sm text-surface-400 text-center py-4 border border-dashed border-surface-200 rounded-xl">
                    No locations added yet. Click "Add Location" to configure.
                  </p>
                )}

                {geo.geo_fence_locations.map((loc, idx) => (
                  <div key={loc.id || idx} className="border border-surface-200 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-surface-600">Location {idx + 1}</span>
                      <button
                        onClick={() => removeLocation(idx)}
                        className="p-1 text-danger-500 hover:bg-danger-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Field label="Location Name">
                        <Input
                          value={loc.name}
                          onChange={e => updateLocation(idx, 'name', e.target.value)}
                          placeholder="Head Office"
                        />
                      </Field>
                      <Field label="Radius (metres)" hint="10 – 100,000">
                        <Input
                          type="number"
                          value={loc.radius}
                          onChange={e => updateLocation(idx, 'radius', e.target.value)}
                          min={10}
                          max={100000}
                          placeholder="500"
                        />
                      </Field>
                      <Field label="Latitude" hint="-90 to 90">
                        <Input
                          type="number"
                          step="0.0001"
                          value={loc.latitude}
                          onChange={e => updateLocation(idx, 'latitude', e.target.value)}
                          min={-90}
                          max={90}
                          placeholder="12.9716"
                        />
                      </Field>
                      <Field label="Longitude" hint="-180 to 180">
                        <Input
                          type="number"
                          step="0.0001"
                          value={loc.longitude}
                          onChange={e => updateLocation(idx, 'longitude', e.target.value)}
                          min={-180}
                          max={180}
                          placeholder="77.5946"
                        />
                      </Field>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* IP Restriction — independent of Geo Fence; both can be on at once */}
            <div className="border border-surface-200 rounded-xl p-4 space-y-1">
              <Toggle
                checked={geo.ip_restriction_enabled}
                onChange={v => setGeo(g => ({ ...g, ip_restriction_enabled: v }))}
                label="Enable IP Address Restriction"
                description="When enabled, all users must log in from an allowed IP address. Can be combined with Geo Fence — if both are on, both rules must be satisfied."
              />
            </div>

            {geo.ip_restriction_enabled && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-surface-800 flex items-center gap-2">
                  <Globe className="w-4 h-4 text-accent-500" />
                  Allowed IP Addresses
                </h3>

                <div className="flex gap-2">
                  <Input
                    value={ipInput}
                    onChange={e => { setIpInput(e.target.value); setIpError('') }}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddIp() } }}
                    placeholder="192.168.1.10"
                  />
                  <button
                    onClick={handleAddIp}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium
                               bg-accent-50 text-accent-700 rounded-lg hover:bg-accent-100 transition-colors whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add IP
                  </button>
                </div>
                {ipError && <p className="text-xs text-danger-500">{ipError}</p>}

                {geo.approved_ips.length === 0 ? (
                  <p className="text-sm text-surface-400 text-center py-4 border border-dashed border-surface-200 rounded-xl">
                    No IP addresses added yet.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {geo.approved_ips.map((ip, idx) => (
                      <li key={`${ip}-${idx}`} className="flex items-center justify-between border border-surface-200 rounded-lg px-3 py-2 gap-2">
                        {editingIpIdx === idx ? (
                          <Input
                            autoFocus
                            value={editingIpValue}
                            onChange={e => setEditingIpValue(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commitEditIp(idx) } }}
                          />
                        ) : (
                          <span className="text-sm font-mono text-surface-700 break-all">{ip}</span>
                        )}
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {editingIpIdx === idx ? (
                            <button onClick={() => commitEditIp(idx)} className="px-2 py-1 text-xs font-medium text-accent-600 hover:underline">
                              Save
                            </button>
                          ) : (
                            <button onClick={() => startEditIp(idx)} className="px-2 py-1 text-xs font-medium text-surface-500 hover:text-surface-800">
                              Edit
                            </button>
                          )}
                          <button
                            onClick={() => removeIp(idx)}
                            className="p-1 text-danger-500 hover:bg-danger-50 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div className="flex justify-end pt-2">
              <SaveBtn saving={saving} onClick={saveSecurity} label="Save Security Settings" />
            </div>
          </div>
        </SectionCard>
      )}


      {/* ── 5. LOCALIZATION ───────────────────────────────────────────────── */}
      {activeTab === 'hr' && (
        <SectionCard title="Employment Defaults" icon={Briefcase}>
          <div className="space-y-6">
            <p className="text-sm text-surface-500">
              Default probation &amp; notice periods applied to newly created employees.
              Existing employees are unaffected until HR edits them.
            </p>

            {/* Probation */}
            <div className="border border-surface-200 rounded-lg p-4">
              <label className="flex items-center gap-2 text-sm font-medium text-surface-700">
                <input type="checkbox" checked={empDefaults.probation_enabled}
                  onChange={e => setEmpDefaults(d => ({ ...d, probation_enabled: e.target.checked }))} />
                Enable Default Probation Period
              </label>
              {empDefaults.probation_enabled && (
                <div className="mt-3 max-w-xs">
                  <Field label="Duration (Days)">
                    <input type="number" min="1"
                      className="w-full px-3 py-2 border border-surface-300 rounded-lg"
                      value={empDefaults.probation_days}
                      onChange={e => setEmpDefaults(d => ({ ...d, probation_days: e.target.value }))} />
                  </Field>
                </div>
              )}
            </div>

            {/* Notice */}
            <div className="border border-surface-200 rounded-lg p-4">
              <label className="flex items-center gap-2 text-sm font-medium text-surface-700">
                <input type="checkbox" checked={empDefaults.notice_enabled}
                  onChange={e => setEmpDefaults(d => ({ ...d, notice_enabled: e.target.checked }))} />
                Enable Default Notice Period
              </label>
              {empDefaults.notice_enabled && (
                <div className="mt-3 max-w-xs">
                  <Field label="Duration (Days)">
                    <input type="number" min="0"
                      className="w-full px-3 py-2 border border-surface-300 rounded-lg"
                      value={empDefaults.notice_days}
                      onChange={e => setEmpDefaults(d => ({ ...d, notice_days: e.target.value }))} />
                  </Field>
                </div>
              )}
            </div>

            <div className="flex justify-end">
              <button onClick={saveEmploymentDefaults} disabled={saving}
                className="btn-primary flex items-center gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save
              </button>
            </div>
          </div>
        </SectionCard>
      )}

      {activeTab === 'localization' && (
        <SectionCard title="Localization Settings" icon={Globe}>
          <div className="space-y-6">
            <p className="text-sm text-surface-500">
              Configure how dates, times, and text are displayed for all users in your organisation.
              These settings are per-tenant and do not affect other companies.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Field label="Date Format" hint={`Preview: ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}`}>
                <Select
                  value={locForm.date_format}
                  onChange={e => setLocForm(f => ({ ...f, date_format: e.target.value }))}
                >
                  {DATE_FORMAT_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </Select>
              </Field>

              <Field label="Time Format">
                <Select
                  value={locForm.time_format}
                  onChange={e => setLocForm(f => ({ ...f, time_format: e.target.value }))}
                >
                  <option value="12h">12-hour (e.g. 3:30 PM)</option>
                  <option value="24h">24-hour (e.g. 15:30)</option>
                </Select>
              </Field>

              <Field label="Timezone" hint="Used for scheduling, reports, and attendance — applies across the whole app">
                <Select
                  value={locForm.timezone}
                  onChange={e => {
                    const tz = e.target.value
                    setLocForm(f => ({ ...f, timezone: tz }))
                    setProfile(p => ({ ...p, timezone: tz }))
                  }}
                >
                  {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                </Select>
              </Field>

              <Field label="Language" hint="UI language (additional translations coming soon)">
                <Select
                  value={locForm.language}
                  onChange={e => setLocForm(f => ({ ...f, language: e.target.value }))}
                >
                  {LANGUAGE_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="flex justify-end pt-2">
              <SaveBtn saving={saving} onClick={saveLocalizationSettings} label="Save Localization" />
            </div>
          </div>
        </SectionCard>
      )}

      <UpgradeSeatsModal
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        seatStatus={subscription ? {
          total_user_seats:     subscription.max_users,
          current_active_users: subscription.current_users,
          remaining_seats:      subscription.remaining_users,
          plan_name:            subscription.plan_name,
          plan_display_name:    subscription.plan_display_name || subscription.plan_name,
          plan_expiry:          subscription.plan_expiry_date,
          is_trial:             subscription.is_trial,
        } : {}}
      />
    </div>
  )
}

export default CompanySettings
