/**
 * Tenant-aware date/time formatting.
 * Pass localization settings from Redux (selectLocalization) or use defaults.
 * Use the `useLocalization` hook for React components.
 */

export const DEFAULTS = { date_format: 'DD-MM-YYYY', time_format: '12h', timezone: 'Asia/Kolkata', language: 'en' }

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function pad(n) { return String(n).padStart(2, '0') }

/**
 * Format a date value using tenant date_format.
 * Returns '-' for null/undefined/invalid values.
 *
 * A plain calendar-date string ("2024-01-15", no time component) is treated
 * as-is with no timezone conversion — it parses as UTC midnight, and
 * converting that to a tenant timezone behind UTC would shift it back a day.
 * Only a full UTC instant (has a time component / trailing "Z") is resolved
 * in the tenant timezone before extracting day/month/year.
 */
export function formatDate(value, settings = DEFAULTS) {
  if (!value) return '-'
  const d = value instanceof Date ? value : new Date(value)
  if (isNaN(d.getTime())) return String(value)

  const isDateOnlyString = typeof value === 'string' && !value.includes('T') && !value.endsWith('Z')
  const tz = settings?.timezone || DEFAULTS.timezone
  // Get date components in the tenant timezone (skipped for a plain calendar-date string)
  let day, month, year
  if (isDateOnlyString) {
    day   = d.getUTCDate()
    month = d.getUTCMonth() + 1
    year  = d.getUTCFullYear()
  } else {
    try {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz,
        year: 'numeric', month: '2-digit', day: '2-digit',
      }).formatToParts(d)
      const p = Object.fromEntries(parts.map(({ type, value: v }) => [type, v]))
      day   = parseInt(p.day, 10)
      month = parseInt(p.month, 10)
      year  = parseInt(p.year, 10)
    } catch {
      day   = d.getDate()
      month = d.getMonth() + 1
      year  = d.getFullYear()
    }
  }

  const fmt = settings?.date_format || DEFAULTS.date_format
  const DD   = pad(day)
  const MM   = pad(month)
  const MMM  = MONTHS_SHORT[month - 1] || pad(month)
  const YYYY = String(year)

  return fmt
    .replace('DD', DD)
    .replace('MMM', MMM)
    .replace('MM', MM)
    .replace('YYYY', YYYY)
}

/**
 * Format a datetime value using tenant date + time format.
 * Returns '-' for null/undefined.
 */
export function formatDateTime(value, settings = DEFAULTS) {
  if (!value) return '-'
  const d = value instanceof Date ? value : new Date(value)
  if (isNaN(d.getTime())) return '-'

  const tz  = settings?.timezone || DEFAULTS.timezone
  const fmt = settings?.time_format || DEFAULTS.time_format

  // Get time components in tenant timezone
  let hours, minutes
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(d)
    const p = Object.fromEntries(parts.map(({ type, value: v }) => [type, v]))
    hours   = parseInt(p.hour, 10)
    minutes = parseInt(p.minute, 10)
  } catch {
    hours   = d.getHours()
    minutes = d.getMinutes()
  }

  const datePart = formatDate(d, settings)
  let timePart
  if (fmt === '24h') {
    timePart = `${pad(hours)}:${pad(minutes)}`
  } else {
    const h12 = hours % 12 || 12
    const ampm = hours < 12 ? 'AM' : 'PM'
    timePart = `${pad(h12)}:${pad(minutes)} ${ampm}`
  }

  return `${datePart} ${timePart}`
}

/**
 * Format time only using tenant time_format and timezone.
 */
export function formatTime(value, settings = DEFAULTS) {
  if (!value) return '-'
  const d = value instanceof Date ? value : new Date(value)
  if (isNaN(d.getTime())) return '-'

  const tz  = settings?.timezone || DEFAULTS.timezone
  const fmt = settings?.time_format || DEFAULTS.time_format

  let hours, minutes
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(d)
    const p = Object.fromEntries(parts.map(({ type, value: v }) => [type, v]))
    hours   = parseInt(p.hour, 10)
    minutes = parseInt(p.minute, 10)
  } catch {
    hours   = d.getHours()
    minutes = d.getMinutes()
  }

  if (fmt === '24h') {
    return `${pad(hours)}:${pad(minutes)}`
  }
  const h12 = hours % 12 || 12
  const ampm = hours < 12 ? 'AM' : 'PM'
  return `${pad(h12)}:${pad(minutes)} ${ampm}`
}
