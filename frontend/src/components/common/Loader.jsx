import React from 'react'
import { clsx } from 'clsx'
import { Loader2 } from 'lucide-react'

// Spinner loader
export const Spinner = ({ size = 'md', className }) => {
  const sizes = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
    xl: 'w-12 h-12',
  }

  return (
    <Loader2 
      className={clsx(
        'animate-spin text-accent-500',
        sizes[size],
        className
      )} 
    />
  )
}

// Full page loader
export const PageLoader = ({ message = 'Loading...' }) => {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white">
      <div className="relative">
        <div className="w-16 h-16 border-4 border-surface-200 rounded-full" />
        <div className="absolute top-0 left-0 w-16 h-16 border-4 border-accent-500 rounded-full border-t-transparent animate-spin" />
      </div>
      <p className="mt-4 text-surface-600 font-medium animate-pulse">{message}</p>
    </div>
  )
}

// Skeleton loader
export const Skeleton = ({ className, ...props }) => {
  return (
    <div
      className={clsx('skeleton', className)}
      {...props}
    />
  )
}

// Table skeleton
export const TableSkeleton = ({ rows = 5, cols = 4 }) => {
  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex gap-4 p-4 bg-surface-50 rounded-t-lg">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1" />
        ))}
      </div>
      
      {/* Rows */}
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex gap-4 p-4 border-b border-surface-100">
          {Array.from({ length: cols }).map((_, colIndex) => (
            <Skeleton key={colIndex} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  )
}

// Card skeleton
export const CardSkeleton = () => {
  return (
    <div className="card p-6 space-y-4">
      <Skeleton className="h-6 w-1/3" />
      <Skeleton className="h-10 w-1/2" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  )
}

// Stats skeleton
export const StatsSkeleton = ({ count = 4 }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  )
}

const Loader = {
  Spinner,
  Page: PageLoader,
  Skeleton,
  Table: TableSkeleton,
  Card: CardSkeleton,
  Stats: StatsSkeleton,
}

export default Loader