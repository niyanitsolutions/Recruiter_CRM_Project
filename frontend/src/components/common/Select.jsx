import React, { forwardRef } from 'react'
import { clsx } from 'clsx'
import { ChevronDown, AlertCircle } from 'lucide-react'

const Select = forwardRef(({
  label,
  options = [],
  error,
  helpText,
  placeholder = 'Select an option',
  className,
  required = false,
  disabled = false,
  ...props
}, ref) => {
  return (
    <div className={clsx('w-full', className)}>
      {label && (
        <label className="input-label">
          {label}
          {required && <span className="text-danger-500 ml-1">*</span>}
        </label>
      )}
      
      <div className="relative">
        <select
          ref={ref}
          disabled={disabled}
          className={clsx(
            'input appearance-none pr-10 cursor-pointer',
            error && 'input-error',
            disabled && 'bg-surface-100 cursor-not-allowed'
          )}
          {...props}
        >
          <option value="" disabled>
            {placeholder}
          </option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        
        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-surface-400">
          <ChevronDown className="w-4 h-4" />
        </div>
      </div>
      
      {error && (
        <p className="input-error-text flex items-center gap-1">
          <AlertCircle className="w-3 h-3" />
          {error}
        </p>
      )}
      
      {helpText && !error && (
        <p className="input-help">{helpText}</p>
      )}
    </div>
  )
})

Select.displayName = 'Select'

export default Select