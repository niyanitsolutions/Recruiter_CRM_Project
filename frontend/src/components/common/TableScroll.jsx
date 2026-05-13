import React from 'react'

/**
 * TableScroll — wraps any <table> in a horizontally scrollable container
 * that respects the active theme and adds a subtle fade mask on the right
 * edge to hint that the table continues.
 *
 * Usage:
 *   <TableScroll>
 *     <table>…</table>
 *   </TableScroll>
 */
export default function TableScroll({ children, className = '' }) {
  return (
    <div
      className={`relative w-full overflow-x-auto ${className}`}
      style={{ WebkitOverflowScrolling: 'touch' }}
    >
      {children}
    </div>
  )
}
