import React, { forwardRef, useState } from 'react'
import { clsx } from 'clsx'
import { Eye, EyeOff, AlertCircle, CheckCircle } from 'lucide-react'

const Input = forwardRef(({
  label,
  type = 'text',
  error,
  success,
  helpText,
  leftIcon,
  rightIcon,
  className,
  inputClassName,
  required = false,
  disabled = false,
  ...props
}, ref) => {
  const [showPassword, setShowPassword] = useState(false)
  const isPassword = type === 'password'

  const inputType = isPassword ? (showPassword ? 'text' : 'password') : type

  return (
    <div className={clsx('w-full', className)}>
      {label && (
        <label className="input-label">
          {label}
          {required && <span className="text-danger-500 ml-1">*</span>}
        </label>
      )}
      
      <div className="relative">
        {leftIcon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400">
            {leftIcon}
          </div>
        )}
        
        <input
          ref={ref}
          type={inputType}
          disabled={disabled}
          className={clsx(
            'input',
            error && 'input-error',
            success && 'border-success-500 focus:border-success-500 focus:ring-success-500/20',
            leftIcon && 'pl-10',
            (rightIcon || isPassword) && 'pr-10',
            disabled && 'bg-surface-100 cursor-not-allowed',
            inputClassName
          )}
          {...props}
        />
        
        {isPassword && (
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600 transition-colors"
          >
            {showPassword ? (
              <EyeOff className="w-4 h-4" />
            ) : (
              <Eye className="w-4 h-4" />
            )}
          </button>
        )}
        
        {!isPassword && rightIcon && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400">
            {rightIcon}
          </div>
        )}
        
        {error && !isPassword && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-danger-500">
            <AlertCircle className="w-4 h-4" />
          </div>
        )}
        
        {success && !isPassword && !rightIcon && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-success-500">
            <CheckCircle className="w-4 h-4" />
          </div>
        )}
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

Input.displayName = 'Input'

export default Input