import { format, formatDistance, formatRelative, isValid, parseISO } from 'date-fns'

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
 * Format date
 */
export const formatDate = (date, formatStr = 'dd MMM yyyy') => {
  if (!date) return '-'
  
  const dateObj = typeof date === 'string' ? parseISO(date) : date
  
  if (!isValid(dateObj)) return '-'
  
  return format(dateObj, formatStr)
}

/**
 * Format date with time
 */
export const formatDateTime = (date) => {
  return formatDate(date, 'dd MMM yyyy, hh:mm a')
}

/**
 * Format relative time (e.g., "2 hours ago")
 */
export const formatRelativeTime = (date) => {
  if (!date) return '-'
  
  const dateObj = typeof date === 'string' ? parseISO(date) : date
  
  if (!isValid(dateObj)) return '-'
  
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