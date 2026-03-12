/**
 * Validation utilities for forms
 */

export const validators = {
  /**
   * Email validation
   */
  email: (value) => {
    if (!value) return 'Email is required'
    const pattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
    if (!pattern.test(value)) return 'Invalid email format'
    return null
  },

  /**
   * Password validation
   */
  password: (value) => {
    if (!value) return 'Password is required'
    if (value.length < 8) return 'Password must be at least 8 characters'
    if (!/[A-Z]/.test(value)) return 'Password must contain uppercase letter'
    if (!/[a-z]/.test(value)) return 'Password must contain lowercase letter'
    if (!/\d/.test(value)) return 'Password must contain a number'
    return null
  },

  /**
   * Mobile number validation
   */
  mobile: (value) => {
    if (!value) return 'Mobile number is required'
    const cleaned = value.replace(/[\s\-]/g, '')
    const pattern = /^\+?[1-9]\d{9,14}$/
    if (!pattern.test(cleaned)) return 'Invalid mobile number'
    return null
  },

  /**
   * Username validation
   */
  username: (value) => {
    if (!value) return 'Username is required'
    if (value.length < 3) return 'Username must be at least 3 characters'
    if (value.length > 50) return 'Username must be less than 50 characters'
    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(value)) {
      return 'Username can only contain letters, numbers, and underscores'
    }
    return null
  },

  /**
   * Required field validation
   */
  required: (value, fieldName = 'This field') => {
    if (!value || (typeof value === 'string' && !value.trim())) {
      return `${fieldName} is required`
    }
    return null
  },

  /**
   * Min length validation
   */
  minLength: (value, min, fieldName = 'This field') => {
    if (value && value.length < min) {
      return `${fieldName} must be at least ${min} characters`
    }
    return null
  },

  /**
   * Max length validation
   */
  maxLength: (value, max, fieldName = 'This field') => {
    if (value && value.length > max) {
      return `${fieldName} must be less than ${max} characters`
    }
    return null
  },

  /**
   * GST number validation (Indian)
   */
  gst: (value) => {
    if (!value) return null // GST is optional
    const pattern = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/
    if (!pattern.test(value.toUpperCase())) return 'Invalid GST number format'
    return null
  },

  /**
   * Phone validation (same as mobile)
   */
  phone: (value) => validators.mobile(value),

  /**
   * ZIP code validation
   */
  zipCode: (value) => {
    if (!value) return 'ZIP code is required'
    if (value.length < 4 || value.length > 10) return 'Invalid ZIP code'
    return null
  },

  /**
   * URL validation
   */
  url: (value) => {
    if (!value) return null // URL is optional
    try {
      new URL(value.startsWith('http') ? value : `https://${value}`)
      return null
    } catch {
      return 'Invalid URL format'
    }
  },

  /**
   * Confirm password validation
   */
  confirmPassword: (value, password) => {
    if (!value) return 'Please confirm your password'
    if (value !== password) return 'Passwords do not match'
    return null
  },
}

/**
 * Validate multiple fields
 */
export const validateForm = (values, validationRules) => {
  const errors = {}

  Object.keys(validationRules).forEach((field) => {
    const rules = validationRules[field]
    const value = values[field]

    for (const rule of rules) {
      const error = rule(value, values)
      if (error) {
        errors[field] = error
        break
      }
    }
  })

  return errors
}

/**
 * Check if form has errors
 */
export const hasErrors = (errors) => {
  return Object.keys(errors).length > 0
}

export default validators