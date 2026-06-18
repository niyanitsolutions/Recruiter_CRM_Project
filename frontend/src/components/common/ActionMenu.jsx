import React, { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { MoreVertical } from 'lucide-react'

/**
 * ActionMenu — portal-based 3-dot dropdown that is never clipped by
 * overflow:hidden/auto containers (tables, cards, scroll wrappers).
 *
 * Usage (render-prop children receive a `close` callback):
 *   <ActionMenu>
 *     {(close) => (
 *       <>
 *         <ActionMenuItem label="Edit" icon={Edit} onClick={() => { doEdit(); close() }} />
 *         <ActionMenuItem divider />
 *         <ActionMenuItem label="Delete" icon={Trash2} danger onClick={() => { doDelete(); close() }} />
 *       </>
 *     )}
 *   </ActionMenu>
 *
 * Or pass plain children if they handle closing themselves.
 */
export default function ActionMenu({ children, size = 28 }) {
  const [open, setOpen]   = useState(false)
  const [pos, setPos]     = useState({ top: 0, right: 0 })
  const btnRef            = useRef(null)

  const close = () => setOpen(false)

  useEffect(() => {
    if (!open) return
    const onOutside = (e) => {
      if (btnRef.current?.contains(e.target)) return
      close()
    }
    const onScroll = () => close()
    const onKey    = (e) => { if (e.key === 'Escape') close() }
    document.addEventListener('mousedown', onOutside)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onOutside)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const toggle = (e) => {
    e.stopPropagation()
    if (!open && btnRef.current) {
      const rect  = btnRef.current.getBoundingClientRect()
      const menuH = 260
      const above = rect.bottom + menuH > window.innerHeight
      setPos({
        top:   above ? rect.top - menuH : rect.bottom + 4,
        right: window.innerWidth - rect.right,
      })
    }
    setOpen(v => !v)
  }

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggle}
        className="flex items-center justify-center rounded-lg transition-colors flex-shrink-0"
        style={{ width: size, height: size, color: 'var(--text-muted)' }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
        onMouseLeave={e => e.currentTarget.style.background = ''}
      >
        <MoreVertical className="w-4 h-4" />
      </button>

      {open && createPortal(
        <>
          {/* Full-screen backdrop — closes menu on outside click */}
          <div
            className="fixed inset-0 z-[9998]"
            onClick={close}
            style={{ cursor: 'default' }}
          />
          {/* Dropdown panel */}
          <div
            className="fixed z-[9999] py-1 rounded-xl"
            style={{
              top:       pos.top,
              right:     pos.right,
              minWidth:  176,
              background: 'var(--bg-card)',
              border:    '1px solid var(--border-card)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
            }}
          >
            {typeof children === 'function' ? children(close) : children}
          </div>
        </>,
        document.body
      )}
    </>
  )
}

/**
 * ActionMenuItem — a single row inside an ActionMenu.
 *
 * Props:
 *   label      string   — menu item text
 *   icon       Component — lucide-react icon
 *   iconColor  string   — icon fill colour (default: var(--accent))
 *   onClick    fn       — called when the item is clicked
 *   danger     bool     — renders red text/hover
 *   disabled   bool     — greys out and ignores clicks
 *   divider    bool     — renders a thin separator line instead of a button
 */
export function ActionMenuItem({
  label, icon: Icon, iconColor, onClick, danger = false, disabled = false, divider = false,
}) {
  if (divider) {
    return <div style={{ height: 1, background: 'var(--border-subtle)', margin: '4px 12px' }} />
  }
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className="w-full text-left px-4 py-2 text-sm flex items-center gap-2.5 transition-colors disabled:opacity-40 disabled:cursor-default"
      style={{ color: danger ? '#ef4444' : 'var(--text-primary)' }}
      onMouseEnter={e => {
        if (!disabled) {
          e.currentTarget.style.background = danger
            ? 'rgba(239,68,68,0.08)'
            : 'var(--bg-hover)'
        }
      }}
      onMouseLeave={e => { e.currentTarget.style.background = '' }}
    >
      {Icon && (
        <Icon
          className="w-3.5 h-3.5 flex-shrink-0"
          style={{ color: disabled ? 'var(--text-disabled)' : (iconColor || (danger ? '#ef4444' : 'var(--accent)')) }}
        />
      )}
      {label}
    </button>
  )
}
