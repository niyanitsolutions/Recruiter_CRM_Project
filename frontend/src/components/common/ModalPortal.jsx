import { useEffect } from 'react'
import { createPortal } from 'react-dom'

/**
 * ModalPortal — renders children into document.body via React Portal.
 *
 * Guarantees:
 *  • Modal is always outside any layout stacking context (sidebar, transitions)
 *  • Body scroll is locked while open
 *  • Nothing is rendered when isOpen is false
 *
 * Usage (wraps any existing modal overlay div):
 *   <ModalPortal isOpen={showModal}>
 *     <div className="fixed inset-0 bg-black/50 z-50 ...">...</div>
 *   </ModalPortal>
 */
export default function ModalPortal({ isOpen, children }) {
  useEffect(() => {
    if (!isOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev || ''
    }
  }, [isOpen])

  if (!isOpen) return null
  return createPortal(children, document.body)
}
