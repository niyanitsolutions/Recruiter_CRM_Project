import { format, formatDistance, isValid, parseISO } from 'date-fns'

// All timestamps from the backend are UTC ISO strings.
// Explicit IST (Asia/Kolkata, +05:30) ensures consistent display
// regardless of the user's browser or OS timezone setting.
const IST = 'Asia/Kolkata'

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
 * For plain date strings ("2024-01-15") timezone is irrelevant.
 * For full UTC datetimes the date is resolved in IST (+05:30).
 */
export const formatDate = (date, formatStr = 'dd MMM yyyy') => {
  if (!date) return '-'

  const str = typeof date === 'string' ? date : date.toISOString()

  // Full UTC datetime — convert to IST before extracting the date
  if (str.includes('T') || str.endsWith('Z')) {
    const d = new Date(str)
    if (isNaN(d.getTime())) return '-'
    // Use Intl to get day/month/year in IST, then reformat with date-fns
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: IST,
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(d)
    const p = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
    const istDate = parseISO(`${p.year}-${p.month}-${p.day}`)
    return isValid(istDate) ? format(istDate, formatStr) : '-'
  }

  // Date-only string — parse and format directly (no timezone shift needed)
  const dateObj = parseISO(str)
  return isValid(dateObj) ? format(dateObj, formatStr) : '-'
}

/**
 * Format date with time, always in IST (Asia/Kolkata, +05:30).
 * Handles UTC ISO strings from the backend correctly regardless of the
 * browser's local timezone.
 */
export const formatDateTime = (date) => {
  if (!date) return '-'
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return '-'
  return d.toLocaleString('en-IN', {
    timeZone: IST,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
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