/**
 * SearchableSelect — combobox that requires a minimum number of characters
 * before showing matching options. Used wherever a plain <select> would
 * otherwise force the user to scroll through a huge unfiltered list
 * (Tasks 12/13/14 — Interview job dropdown, Interview pipeline dropdown,
 * Job form pipeline dropdown).
 *
 * options: [{ value, label, searchText? }] — searchText defaults to label
 * and is what the query is matched against (e.g. "title + client name").
 */
import React, { useState, useRef, useEffect } from 'react'
import { ChevronDown, Search, X } from 'lucide-react'

export default function SearchableSelect({
  value,
  onChange,
  options = [],
  placeholder = 'Select…',
  minChars = 3,
  disabled = false,
  className = '',
  error = false,
  maxResults = 50,
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef(null)
  const inputRef = useRef(null)

  const selected = options.find(o => o.value === value)

  useEffect(() => {
    const handler = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (open) {
      setQuery('')
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  const q = query.trim().toLowerCase()
  const matches = q.length >= minChars
    ? options.filter(o => (o.searchText || o.label || '').toLowerCase().includes(q)).slice(0, maxResults)
    : []

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(o => !o)}
        className={`input w-full flex items-center justify-between gap-2 text-left ${error ? 'border-red-400' : ''} ${disabled ? 'bg-surface-100 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <span className={`truncate ${selected ? '' : 'text-surface-400'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <span className="flex items-center gap-1 flex-shrink-0">
          {selected && !disabled && (
            <X
              className="w-3.5 h-3.5 text-surface-400 hover:text-red-500"
              onClick={(e) => { e.stopPropagation(); onChange('') }}
            />
          )}
          <ChevronDown className="w-4 h-4 text-surface-400" />
        </span>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-surface-200 bg-[var(--bg-card)] shadow-lg overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-surface-100">
            <Search className="w-3.5 h-3.5 text-surface-400 flex-shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Type at least ${minChars} characters…`}
              className="flex-1 text-sm bg-transparent outline-none"
            />
          </div>
          <div className="max-h-60 overflow-y-auto">
            {q.length < minChars ? (
              <p className="px-3 py-3 text-xs text-surface-400">
                Type {minChars - q.length} more character{minChars - q.length === 1 ? '' : 's'} to search…
              </p>
            ) : matches.length === 0 ? (
              <p className="px-3 py-3 text-xs text-surface-400">No matches found</p>
            ) : (
              matches.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => { onChange(opt.value); setOpen(false) }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-accent/5 transition-colors ${opt.value === value ? 'bg-accent/10 text-accent font-medium' : 'text-surface-700'}`}
                >
                  {opt.label}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
