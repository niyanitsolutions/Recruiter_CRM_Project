import { useState, useEffect, useCallback } from 'react'
import {
  Building2, User, CreditCard, Shield, Bell,
  Save, Loader2, Plus, Trash2, MapPin, AlertCircle,
  CheckCircle, RefreshCw, ChevronUp, ChevronDown,
} from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'

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
  { id: 'profile',       label: 'Company Profile',       icon: Building2 },
  { id: 'contact',       label: 'Admin Contact',         icon: User },
  { id: 'subscription',  label: 'Subscription',          icon: CreditCard },
  { id: 'security',      label: 'Security',              icon: Shield },
  { id: 'notifications', label: 'Notifications',         icon: Bell },
]

// ── DEFAULT EMPTY STATES ───────────────────────────────────────────────────

const DEFAULT_PROFILE = {
  company_name: '', company_logo_url: '', industry: '', website: '',
  address: '', city: '', state: '', country: 'India', zip_code: '', timezone: 'Asia/Kolkata',
}
const DEFAULT_CONTACT = { admin_name: '', admin_email: '', admin_phone: '', support_email: '' }
const DEFAULT_GEO = { geo_fence_enabled: false, geo_fence_locations: [], user_geo_fence: [] }
const DEFAULT_NOTIF = {
  notification_preferences: {
    new_candidate:        { email: true, in_app: true },
    interview_scheduled:  { email: true, in_app: true },
    interview_feedback:   { email: true, in_app: true },
    user_created:         { email: true, in_app: true },
  },
}

// ── MAIN COMPONENT ─────────────────────────────────────────────────────────

const CompanySettings = () => {
  const [activeTab, setActiveTab] = useState('profile')
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)

  const [profile,  setProfile]  = useState(DEFAULT_PROFILE)
  const [contact,  setContact]  = useState(DEFAULT_CONTACT)
  const [geo,      setGeo]      = useState(DEFAULT_GEO)
  const [notifPref, setNotifPref] = useState(DEFAULT_NOTIF.notification_preferences)
  const [subscription, setSubscription] = useState(null)
  const [subLoading,   setSubLoading]   = useState(false)

  // ── Load all settings ──────────────────────────────────────────────────
  const loadSettings = useCallback(async () => {
    try {
      setLoading(true)
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
        geo_fence_enabled:   !!d.geo_fence_enabled,
        geo_fence_locations: d.geo_fence_locations || [],
        user_geo_fence:      d.user_geo_fence      || [],
      })
      if (d.notification_preferences) {
        setNotifPref(d.notification_preferences)
      }
    } catch {
      toast.error('Failed to load settings')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadSubscription = useCallback(async () => {
    try {
      setSubLoading(true)
      const res = await api.get('/company-settings/subscription')
      setSubscription(res.data?.data || null)
    } catch {
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
      toast.success('Company profile saved')
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save profile')
    } finally { setSaving(false) }
  }

  const saveContact = async () => {
    try {
      setSaving(true)
      await api.put('/company-settings/contact', contact)
      toast.success('Contact details saved')
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save contact')
    } finally { setSaving(false) }
  }

  const saveSecurity = async () => {
    try {
      setSaving(true)
      await api.put('/company-settings/security', geo)
      toast.success('Security settings saved')
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save security settings')
    } finally { setSaving(false) }
  }

  const saveNotifications = async () => {
    try {
      setSaving(true)
      await api.put('/company-settings/notifications', { notification_preferences: notifPref })
      toast.success('Notification preferences saved')
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save notification preferences')
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
    setGeo(g => {
      const locs = [...g.geo_fence_locations]
      locs[idx] = { ...locs[idx], [field]: field === 'name' ? value : parseFloat(value) || 0 }
      return { ...g, geo_fence_locations: locs }
    })
  }

  const removeLocation = (idx) => {
    setGeo(g => ({ ...g, geo_fence_locations: g.geo_fence_locations.filter((_, i) => i !== idx) }))
  }

  // ── Notification helpers ───────────────────────────────────────────────

  const NOTIF_EVENTS = [
    { key: 'new_candidate',       label: 'New Candidate Added' },
    { key: 'interview_scheduled', label: 'Interview Scheduled' },
    { key: 'interview_feedback',  label: 'Interview Feedback Submitted' },
    { key: 'user_created',        label: 'User Created' },
  ]

  const toggleNotif = (key, channel) => {
    setNotifPref(p => ({
      ...p,
      [key]: { ...p[key], [channel]: !p[key]?.[channel] },
    }))
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

            <Field label="Time Zone">
              <Select
                value={profile.timezone}
                onChange={e => setProfile(p => ({ ...p, timezone: e.target.value }))}
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
                  <p className="text-xl font-bold text-accent-700 mt-0.5">{subscription.plan_name}</p>
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
                  { label: 'Price Per User',    value: subscription.price_per_user ? `₹${subscription.price_per_user}` : '—' },
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
                <button className="px-4 py-2 bg-accent-600 text-white text-sm font-medium rounded-lg hover:bg-accent-700 transition-colors">
                  Upgrade Plan
                </button>
                <button className="px-4 py-2 bg-white border border-surface-200 text-surface-700 text-sm font-medium rounded-lg hover:bg-surface-50 transition-colors">
                  Add More Users
                </button>
                <button className="px-4 py-2 bg-white border border-surface-200 text-surface-700 text-sm font-medium rounded-lg hover:bg-surface-50 transition-colors">
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
                      <Field label="Radius (metres)">
                        <Input
                          type="number"
                          value={loc.radius}
                          onChange={e => updateLocation(idx, 'radius', e.target.value)}
                          min={50}
                          placeholder="500"
                        />
                      </Field>
                      <Field label="Latitude">
                        <Input
                          type="number"
                          step="0.0001"
                          value={loc.latitude}
                          onChange={e => updateLocation(idx, 'latitude', e.target.value)}
                          placeholder="12.9716"
                        />
                      </Field>
                      <Field label="Longitude">
                        <Input
                          type="number"
                          step="0.0001"
                          value={loc.longitude}
                          onChange={e => updateLocation(idx, 'longitude', e.target.value)}
                          placeholder="77.5946"
                        />
                      </Field>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end pt-2">
              <SaveBtn saving={saving} onClick={saveSecurity} label="Save Security Settings" />
            </div>
          </div>
        </SectionCard>
      )}

      {/* ── 5. NOTIFICATION PREFERENCES ────────────────────────────────────── */}
      {activeTab === 'notifications' && (
        <SectionCard title="Notification Preferences" icon={Bell}>
          <div className="space-y-2">
            {/* Header row */}
            <div className="grid grid-cols-[1fr_auto_auto] gap-4 pb-2 border-b border-surface-100 px-2">
              <span className="text-xs font-semibold text-surface-500 uppercase tracking-wide">Event</span>
              <span className="text-xs font-semibold text-surface-500 uppercase tracking-wide w-20 text-center">Email</span>
              <span className="text-xs font-semibold text-surface-500 uppercase tracking-wide w-20 text-center">In-App</span>
            </div>

            {NOTIF_EVENTS.map(({ key, label }) => {
              const prefs = notifPref[key] || { email: true, in_app: true }
              return (
                <div
                  key={key}
                  className="grid grid-cols-[1fr_auto_auto] gap-4 items-center py-3 px-2
                             rounded-lg hover:bg-surface-50 transition-colors"
                >
                  <span className="text-sm text-surface-800 font-medium">{label}</span>
                  {/* Email toggle */}
                  <div className="w-20 flex justify-center">
                    <button
                      type="button"
                      onClick={() => toggleNotif(key, 'email')}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none
                                  ${prefs.email ? 'bg-accent-600' : 'bg-surface-300'}`}
                    >
                      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow
                                        transition-transform ${prefs.email ? 'translate-x-4' : 'translate-x-0.5'}`} />
                    </button>
                  </div>
                  {/* In-App toggle */}
                  <div className="w-20 flex justify-center">
                    <button
                      type="button"
                      onClick={() => toggleNotif(key, 'in_app')}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none
                                  ${prefs.in_app ? 'bg-accent-600' : 'bg-surface-300'}`}
                    >
                      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow
                                        transition-transform ${prefs.in_app ? 'translate-x-4' : 'translate-x-0.5'}`} />
                    </button>
                  </div>
                </div>
              )
            })}

            <div className="flex justify-end pt-4">
              <SaveBtn saving={saving} onClick={saveNotifications} label="Save Preferences" />
            </div>
          </div>
        </SectionCard>
      )}
    </div>
  )
}

export default CompanySettings
