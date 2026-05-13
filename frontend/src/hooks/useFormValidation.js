import { useState, useCallback } from 'react'

/**
 * useFormValidation — lightweight inline blur-validation hook.
 *
 * Usage:
 *   const { errors, touched, validate, touch, reset } = useFormValidation(rules)
 *
 *   rules: { fieldName: (value, allValues) => errorString | null }
 *
 *   <input
 *     onBlur={() => touch('email', formData.email, formData)}
 *     ...
 *   />
 *   {errors.email && touched.email && <p className="field-error">{errors.email}</p>}
 *
 *   // Validate all fields before submit:
 *   const ok = validate(formData)
 */
export function useFormValidation(rules) {
  const [errors, setErrors]   = useState({})
  const [touched, setTouched] = useState({})

  const touch = useCallback((field, value, allValues = {}) => {
    setTouched(prev => ({ ...prev, [field]: true }))
    const rule = rules[field]
    const err = rule ? rule(value, allValues) : null
    setErrors(prev => ({ ...prev, [field]: err }))
  }, [rules])

  const validate = useCallback((allValues = {}) => {
    const newErrors = {}
    const newTouched = {}
    for (const [field, rule] of Object.entries(rules)) {
      newTouched[field] = true
      newErrors[field] = rule(allValues[field], allValues) || null
    }
    setErrors(newErrors)
    setTouched(newTouched)
    return !Object.values(newErrors).some(Boolean)
  }, [rules])

  const reset = useCallback(() => {
    setErrors({})
    setTouched({})
  }, [])

  return { errors, touched, touch, validate, reset }
}

/**
 * Common reusable validation functions.
 */
export const validators = {
  required: (label = 'This field') => (v) =>
    !v || (typeof v === 'string' && !v.trim()) ? `${label} is required` : null,

  email: () => (v) =>
    v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? 'Enter a valid email address' : null,

  minLength: (n, label = 'This field') => (v) =>
    v && v.length < n ? `${label} must be at least ${n} characters` : null,

  maxLength: (n, label = 'This field') => (v) =>
    v && v.length > n ? `${label} must be at most ${n} characters` : null,

  mobile: () => (v) => {
    if (!v) return null
    const digits = v.replace(/\D/g, '')
    return digits.length < 7 || digits.length > 15 ? 'Enter a valid phone number (7–15 digits)' : null
  },

  numeric: (label = 'This field') => (v) =>
    v !== '' && v !== null && v !== undefined && isNaN(Number(v))
      ? `${label} must be a number`
      : null,

  min: (n, label = 'Value') => (v) =>
    v !== '' && v !== null && v !== undefined && Number(v) < n
      ? `${label} must be at least ${n}`
      : null,

  compose: (...fns) => (v, all) => {
    for (const fn of fns) {
      const err = fn(v, all)
      if (err) return err
    }
    return null
  },
}
