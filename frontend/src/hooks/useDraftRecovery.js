/**
 * useDraftRecovery (Task 7)
 *
 * Auto-saves form state to localStorage so it survives a closed tab, refresh,
 * power failure, session lock, or logout — and offers to restore it the next
 * time the same user opens the same form.
 *
 * Drafts are keyed by user + form + record id, so they are user-specific and
 * never leak across users sharing a browser, and never collide between
 * "new" and "edit <id>" instances of the same form.
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import { useSelector } from 'react-redux'
import { selectUser } from '../store/authSlice'

const PREFIX = 'crm_draft:'
const SAVE_DEBOUNCE_MS = 800

function buildKey(formName, userId, recordId) {
  return `${PREFIX}${formName}:${userId || 'anon'}:${recordId || 'new'}`
}

/**
 * @param {string} formName  stable identifier, e.g. 'job', 'candidate'
 * @param {string|null} recordId  the id being edited, or null/undefined for "create"
 * @param {object} formData  current form state — saved verbatim
 * @param {function} setFormData  setter used to restore a draft
 * @param {object} options
 *   isDirty: (formData) => boolean — only autosave once the form has real content
 *   isSubmitted: boolean — when true, the draft is cleared (call after a successful save)
 */
export function useDraftRecovery(formName, recordId, formData, setFormData, options = {}) {
  const user = useSelector(selectUser)
  const userId = user?.id || user?.userId || user?.email || 'anon'
  const key = buildKey(formName, userId, recordId)

  const [draftAvailable, setDraftAvailable] = useState(false)
  const [draftSavedAt, setDraftSavedAt] = useState(null)
  const saveTimer = useRef(null)
  const restoredOrDismissed = useRef(false)

  // Check for an existing draft once on mount (before the user starts typing).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed && parsed.data) {
          setDraftAvailable(true)
          setDraftSavedAt(parsed.savedAt || null)
        }
      }
    } catch { /* corrupt draft — ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  // Debounced autosave whenever formData changes, once the user has
  // acknowledged (restored or dismissed) any existing draft prompt.
  useEffect(() => {
    if (!restoredOrDismissed.current && draftAvailable) return // don't overwrite until resolved
    const dirty = options.isDirty ? options.isDirty(formData) : true
    if (!dirty) return

    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      try {
        localStorage.setItem(key, JSON.stringify({ data: formData, savedAt: Date.now() }))
      } catch { /* storage full/unavailable — ignore */ }
    }, SAVE_DEBOUNCE_MS)

    return () => clearTimeout(saveTimer.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData, key])

  // Clear the draft once the form is successfully submitted.
  useEffect(() => {
    if (options.isSubmitted) {
      try { localStorage.removeItem(key) } catch { /* ignore */ }
    }
  }, [options.isSubmitted, key])

  const restoreDraft = useCallback(() => {
    try {
      const raw = localStorage.getItem(key)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed?.data) setFormData(prev => ({ ...prev, ...parsed.data }))
      }
    } catch { /* ignore */ }
    restoredOrDismissed.current = true
    setDraftAvailable(false)
  }, [key, setFormData])

  const discardDraft = useCallback(() => {
    try { localStorage.removeItem(key) } catch { /* ignore */ }
    restoredOrDismissed.current = true
    setDraftAvailable(false)
  }, [key])

  return { draftAvailable, draftSavedAt, restoreDraft, discardDraft }
}
