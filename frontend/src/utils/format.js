import { format, formatDistance, isValid, parseISO } from 'date-fns'
import { store } from '../store/store'
import {
  formatDate as _tenantFormatDate,
  formatDateTime as _tenantFormatDateTime,
  formatTime as _tenantFormatTime,
} from './dateFormatter'

// All timestamps from the backend are UTC ISO strings. They are always
// rendered in the tenant's saved Localization timezone (Company Settings →
// Localization), read live from Redux — not a hardcoded zone — so that
// saving a new timezone updates every screen that uses these helpers
// immediately, with no page reload required. Falls back to Asia/Kolkata
// only until localization settings have loaded.
const FALLBACK_TZ = 'Asia/Kolkata'

export const getTenantTimezone = () => {
  try {
    return store.getState().localization?.settings?.timezone || FALLBACK_TZ
  } catch {
    return FALLBACK_TZ
  }
}

/**
 * Full tenant localization settings (date_format, time_format, timezone,
 * language), read live from Redux. This is the one place `formatDate`/
 * `formatDateTime`/`formatTimeOnly` below read tenant format from — do not
 * add another copy of this lookup elsewhere.
 */
const getTenantSettings = () => {
  try {
    return store.getState().localization?.settings || undefined
  } catch {
    return undefined
  }
}

/** Short zone abbreviation for the tenant timezone, e.g. "IST", "GMT+4". */
export const getTenantTimezoneAbbr = () => {
  const tz = getTenantTimezone()
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' }).formatToParts(new Date())
    return parts.find(p => p.type === 'timeZoneName')?.value || tz
  } catch {
    return tz
  }
}

/**
 * Format currency (Indian Rupees)
 */
export const formatCurrency = (amount, showPaise = false) => {
  // Amount is stored in paise
  const rupees = showPaise ? amount / 100 : Math.floor(amount / 100)
  
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: showPaise ? 2 : 0,
    maximumFractionDigits: showPaise ? 2 : 0,
  }).format(rupees)
}

/**
 * Format number with Indian numbering system
 */
export const formatNumber = (num) => {
  return new Intl.NumberFormat('en-IN').format(num)
}

/**
 * Format date (date-only, no time component).
 *
 * Centralized formatter (Task: centralized localization) — this is the one
 * date/time formatting entry point almost every page already imports. With
 * no `formatStr` override it delegates to `dateFormatter.js`'s tenant-aware
 * engine so it respects the tenant's saved Date Format, not just timezone.
 *
 * Passing an explicit `formatStr` (a date-fns pattern) opts out of the tenant
 * format for that one call — used by a handful of call sites that
 * deliberately want a fixed, non-tenant-configurable shape (e.g. "dd MMM").
 * That path is unchanged from before this consolidation.
 */
export const formatDate = (date, formatStr) => {
  if (!date) return '-'

  if (formatStr === undefined) {
    return _tenantFormatDate(date, getTenantSettings())
  }

  const str = typeof date === 'string' ? date : date.toISOString()

  // Full UTC datetime — convert to the tenant timezone before extracting the date
  if (str.includes('T') || str.endsWith('Z')) {
    const d = new Date(str)
    if (isNaN(d.getTime())) return '-'
    // Use Intl to get day/month/year in the tenant timezone, then reformat with date-fns
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: getTenantTimezone(),
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(d)
    const p = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
    const tzDate = parseISO(`${p.year}-${p.month}-${p.day}`)
    return isValid(tzDate) ? format(tzDate, formatStr) : '-'
  }

  // Date-only string — parse and format directly (no timezone shift needed)
  const dateObj = parseISO(str)
  return isValid(dateObj) ? format(dateObj, formatStr) : '-'
}

/**
 * Format date with time in the tenant's saved Localization timezone, date
 * format, and time format (12h/24h). Delegates to `dateFormatter.js`.
 */
export const formatDateTime = (date) => {
  if (!date) return '-'
  return _tenantFormatDateTime(date, getTenantSettings())
}

/**
 * Format time only (no date), respecting tenant timezone and time format.
 */
export const formatTimeOnly = (date) => {
  if (!date) return '-'
  return _tenantFormatTime(date, getTenantSettings())
}

/**
 * Format relative time (e.g., "2 hours ago").
 * Relative durations are timezone-independent.
 */
export const formatRelativeTime = (date) => {
  if (!date) return '-'
  const dateObj = typeof date === 'string' ? new Date(date) : date
  if (isNaN(dateObj.getTime())) return '-'
  return formatDistance(dateObj, new Date(), { addSuffix: true })
}

/**
 * Format phone number for display
 */
export const formatPhone = (phone) => {
  if (!phone) return '-'
  
  // Remove all non-digits except +
  const cleaned = phone.replace(/[^\d+]/g, '')
  
  // Indian format: +91 XXXXX XXXXX
  if (cleaned.startsWith('+91') && cleaned.length === 13) {
    return `${cleaned.slice(0, 3)} ${cleaned.slice(3, 8)} ${cleaned.slice(8)}`
  }
  
  // Generic format
  if (cleaned.length === 10) {
    return `${cleaned.slice(0, 5)} ${cleaned.slice(5)}`
  }
  
  return phone
}

/**
 * Truncate text with ellipsis
 */
export const truncate = (text, maxLength = 50) => {
  if (!text) return ''
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength)}...`
}

/**
 * Format file size
 */
export const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes'
  
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

/**
 * Capitalize first letter
 */
export const capitalize = (str) => {
  if (!str) return ''
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
}

/**
 * Format status for display
 */
export const formatStatus = (status) => {
  if (!status) return '-'
  return status
    .split('_')
    .map(word => capitalize(word))
    .join(' ')
}

/**
 * Get initials from name
 */
export const getInitials = (name) => {
  if (!name) return '?'
  
  const words = name.trim().split(/\s+/)
  if (words.length === 1) return words[0].charAt(0).toUpperCase()
  
  return (words[0].charAt(0) + words[words.length - 1].charAt(0)).toUpperCase()
}

/**
 * Format plan limit (-1 means unlimited)
 */
export const formatLimit = (limit) => {
  if (limit === -1) return 'Unlimited'
  return formatNumber(limit)
}

/**
 * Mask email for privacy
 */
export const maskEmail = (email) => {
  if (!email || !email.includes('@')) return email
  
  const [local, domain] = email.split('@')
  const maskedLocal = local.length <= 2
    ? local[0] + '*'
    : local[0] + '*'.repeat(local.length - 2) + local.slice(-1)
  
  return `${maskedLocal}@${domain}`
}

/**
 * Mask mobile for privacy
 */
export const maskMobile = (mobile) => {
  if (!mobile || mobile.length < 6) return mobile
  
  const visibleStart = mobile.startsWith('+') ? 3 : 2
  const visibleEnd = 4
  
  return mobile.slice(0, visibleStart) + 
    '*'.repeat(mobile.length - visibleStart - visibleEnd) + 
    mobile.slice(-visibleEnd)
}