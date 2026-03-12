import React from 'react'
import { clsx } from 'clsx'

const variants = {
  success: 'badge-success',
  warning: 'badge-warning',
  danger: 'badge-danger',
  info: 'badge-info',
  neutral: 'badge-neutral',
}

const Badge = ({
  children,
  variant = 'neutral',
  className,
  dot = false,
  ...props
}) => {
  return (
    <span
      className={clsx(
        'badge',
        variants[variant],
        className
      )}
      {...props}
    >
      {dot && (
        <span className={clsx(
          'w-1.5 h-1.5 rounded-full mr-1.5',
          variant === 'success' && 'bg-success-500',
          variant === 'warning' && 'bg-warning-500',
          variant === 'danger' && 'bg-danger-500',
          variant === 'info' && 'bg-accent-500',
          variant === 'neutral' && 'bg-surface-500',
        )} />
      )}
      {children}
    </span>
  )
}

// Status badge helper
export const StatusBadge = ({ status }) => {
  const statusConfig = {
    active: { variant: 'success', label: 'Active' },
    pending: { variant: 'warning', label: 'Pending' },
    suspended: { variant: 'danger', label: 'Suspended' },
    cancelled: { variant: 'neutral', label: 'Cancelled' },
    trial_expired: { variant: 'warning', label: 'Trial Expired' },
    completed: { variant: 'success', label: 'Completed' },
    failed: { variant: 'danger', label: 'Failed' },
    processing: { variant: 'info', label: 'Processing' },
  }

  const config = statusConfig[status] || { variant: 'neutral', label: status }

  return (
    <Badge variant={config.variant} dot>
      {config.label}
    </Badge>
  )
}

export default Badge