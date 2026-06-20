/**
 * Tenant-aware date/time formatting.
 * Pass localization settings from Redux (selectLocalization) or use defaults.
 */

const DEFAULTS = { date_format: 'DD-MM-YYYY', time_format: '12h', timezone: 'Asia/Kolkata', language: 'en' }

function pad(n) { return String(n).padStart(2, '0') }

/**
 * Format a date string or Date object using tenant date_format.
 * Returns '' for null/undefined/invalid values.
 */
export function formatDate(value, settings = DEFAULTS) {
  if (!value) return ''
  const d = value instanceof Date ? value : new Date(value)
  if (isNaN(d.getTime())) return String(value)
  const fmt = settings?.date_format || DEFAULTS.date_format
  const DD = pad(d.getDate())
  const MM = pad(d.getMonth() + 1)
  const YYYY = d.getFullYear()
  return fmt
    .replace('DD', DD)
    .replace('MM', MM)
    .replace('YYYY', YYYY)
}

/**
 * Format a datetime string or Date using tenant date + time format.
 * Returns '' for null/undefined.
 */
export function formatDateTime(value, settings = DEFAULTS) {
  if (!value) return ''
  const d = value instanceof Date ? value : new Date(value)
  if (isNaN(d.getTime())) return String(value)

  const datePart = formatDate(d, settings)

  const hours24 = d.getHours()
  const minutes = pad(d.getMinutes())
  const fmt = settings?.time_format || DEFAULTS.time_format

  let timePart
  if (fmt === '24h') {
    timePart = `${pad(hours24)}:${minutes}`
  } else {
    const h12 = hours24 % 12 || 12
    const ampm = hours24 < 12 ? 'AM' : 'PM'
    timePart = `${pad(h12)}:${minutes} ${ampm}`
  }

  return `${datePart} ${timePart}`
}
