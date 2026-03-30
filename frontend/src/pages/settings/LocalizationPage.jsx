import { useState, useEffect, useCallback } from 'react'
import { Globe2 } from 'lucide-react'
import toast from 'react-hot-toast'
import tenantSettingsService from '../../services/tenantSettingsService'
import {
  Breadcrumb, PageHeader, SectionCard, Field, SelectField, ActionBar, SkeletonLoader,
} from './SettingsLayout'

const CURRENCIES = [
  { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'GBP', symbol: '£', name: 'British Pound' },
  { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham' },
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
  { code: 'CAD', symbol: 'CA$', name: 'Canadian Dollar' },
]

const TIMEZONES = [
  'Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Asia/Tokyo', 'Asia/Shanghai',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Amsterdam',
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'Australia/Sydney', 'UTC',
]

const DATE_FORMATS = [
  { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY (31/01/2025)' },
  { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY (01/31/2025)' },
  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD (2025-01-31)' },
  { value: 'DD-MMM-YYYY', label: 'DD-MMM-YYYY (31-Jan-2025)' },
  { value: 'MMM DD, YYYY', label: 'MMM DD, YYYY (Jan 31, 2025)' },
]

const NUMBER_FORMATS = [
  { value: 'en-IN', label: 'Indian (1,00,000.00)' },
  { value: 'en-US', label: 'US (100,000.00)' },
  { value: 'de-DE', label: 'European (100.000,00)' },
]

const FISCAL_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const DEFAULT = {
  currency: 'INR', currency_symbol: '₹', date_format: 'DD/MM/YYYY',
  timezone: 'Asia/Kolkata', number_format: 'en-IN', fiscal_year_start: 'April', language: 'en',
}

const LocalizationPage = () => {
  const [data, setData]       = useState(DEFAULT)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const res = await tenantSettingsService.getLocalization()
      if (res.data && Object.keys(res.data).length > 0) setData({ ...DEFAULT, ...res.data })
    } catch {
      toast.error('Failed to load localization settings')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const save = async () => {
    try {
      setSaving(true)
      await tenantSettingsService.saveLocalization(data)
      toast.success('Localization settings saved')
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const set = (f, v) => setData(d => ({ ...d, [f]: v }))

  const handleCurrencyChange = (code) => {
    const c = CURRENCIES.find(c => c.code === code)
    setData(d => ({ ...d, currency: code, currency_symbol: c?.symbol || code }))
  }

  if (loading) return <div className="p-6 max-w-3xl mx-auto"><SkeletonLoader /></div>

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <Breadcrumb page="Currency & Localization" />
      <PageHeader title="Currency & Localization" description="Configure regional settings for your organisation." />

      <SectionCard title="Currency" icon={Globe2}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Currency">
            <SelectField value={data.currency} onChange={e => handleCurrencyChange(e.target.value)}>
              {CURRENCIES.map(c => (
                <option key={c.code} value={c.code}>{c.symbol} — {c.name} ({c.code})</option>
              ))}
            </SelectField>
          </Field>
          <Field label="Currency Symbol">
            <div className="flex items-center gap-2 px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg text-sm text-surface-700">
              <span className="text-lg font-semibold text-accent-600">{data.currency_symbol}</span>
              <span className="text-surface-500">{data.currency}</span>
            </div>
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Formats">
        <div className="space-y-4">
          <Field label="Date Format">
            <SelectField value={data.date_format} onChange={e => set('date_format', e.target.value)}>
              {DATE_FORMATS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </SelectField>
          </Field>
          <Field label="Number Format">
            <SelectField value={data.number_format} onChange={e => set('number_format', e.target.value)}>
              {NUMBER_FORMATS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </SelectField>
          </Field>
          <Field label="Fiscal Year Start Month">
            <SelectField value={data.fiscal_year_start} onChange={e => set('fiscal_year_start', e.target.value)}>
              {FISCAL_MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
            </SelectField>
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Time & Language">
        <div className="space-y-4">
          <Field label="Timezone">
            <SelectField value={data.timezone} onChange={e => set('timezone', e.target.value)}>
              {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
            </SelectField>
          </Field>
          <Field label="Language">
            <SelectField value={data.language} onChange={e => set('language', e.target.value)}>
              <option value="en">English</option>
              <option value="hi">Hindi</option>
              <option value="ar">Arabic</option>
            </SelectField>
          </Field>
        </div>
      </SectionCard>

      <ActionBar saving={saving} onSave={save} />
    </div>
  )
}

export default LocalizationPage
