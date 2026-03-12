import React from 'react'
import { clsx } from 'clsx'

const Card = ({
  children,
  className,
  hover = false,
  padding = true,
  ...props
}) => {
  return (
    <div
      className={clsx(
        hover ? 'card-hover' : 'card',
        padding && 'p-6',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

const CardHeader = ({ children, className, ...props }) => (
  <div
    className={clsx('mb-4', className)}
    {...props}
  >
    {children}
  </div>
)

const CardTitle = ({ children, className, ...props }) => (
  <h3
    className={clsx('text-lg font-semibold text-surface-900', className)}
    {...props}
  >
    {children}
  </h3>
)

const CardDescription = ({ children, className, ...props }) => (
  <p
    className={clsx('text-sm text-surface-500 mt-1', className)}
    {...props}
  >
    {children}
  </p>
)

const CardContent = ({ children, className, ...props }) => (
  <div className={clsx('', className)} {...props}>
    {children}
  </div>
)

const CardFooter = ({ children, className, ...props }) => (
  <div
    className={clsx('mt-4 pt-4 border-t border-surface-100', className)}
    {...props}
  >
    {children}
  </div>
)

Card.Header = CardHeader
Card.Title = CardTitle
Card.Description = CardDescription
Card.Content = CardContent
Card.Footer = CardFooter

export default Card