/**
 * SearchableMultiSelect — reusable multi-select with async search.
 *
 * Props:
 *   label         string            — field label
 *   placeholder   string            — search input placeholder
 *   selected      Array<{id, label}>— currently selected items
 *   onChange      fn(items)         — called with new selection array
 *   onSearch      fn(q) → Promise   — returns { items: [{id, label}] }
 *   maxItems      number            — optional cap
 *   disabled      bool
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { Search, X, ChevronDown, Check } from 'lucide-react'

export default function SearchableMultiSelect({
  label,
  placeholder = 'Search…',
  selected = [],
  onChange,
  onSearch,
  maxItems,
  disabled = false,
  className = '',
}) {
  const [query,   setQuery]   = useState('')
  const [options, setOptions] = useState([])
  const [loading, setLoading] = useState(false)
  const [open,    setOpen]    = useState(false)
  const containerRef          = useRef(null)
  const inputRef              = useRef(null)
  const searchTimer           = useRef(null)

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const search = useCallback(async (q) => {
    if (!onSearch) return
    setLoading(true)
    try {
      const res = await onSearch(q)
      setOptions(res?.items || res || [])
    } catch {
      setOptions([])
    } finally {
      setLoading(false)
    }
  }, [onSearch])

  // Debounced search
  useEffect(() => {
    clearTimeout(searchTimer.current)
    if (open) {
      searchTimer.current = setTimeout(() => search(query), 300)
    }
    return () => clearTimeout(searchTimer.current)
  }, [query, open, search])

  const isSelected = (id) => selected.some((s) => s.id === id)

  const toggle = (item) => {
    if (isSelected(item.id)) {
      onChange(selected.filter((s) => s.id !== item.id))
    } else {
      if (maxItems && selected.length >= maxItems) return
      onChange([...selected, item])
    }
  }

  const removeChip = (id) => onChange(selected.filter((s) => s.id !== id))

  const handleOpen = () => {
    if (disabled) return
    setOpen(true)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') setOpen(false)
    if (e.key === 'Backspace' && !query && selected.length) {
      removeChip(selected[selected.length - 1].id)
    }
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      )}

      {/* Trigger / chip container */}
      <div
        role="combobox"
        aria-expanded={open}
        onClick={handleOpen}
        className={`
          min-h-[40px] px-3 py-1.5 border rounded-lg cursor-text flex flex-wrap gap-1.5 items-center
          ${open ? 'border-indigo-500 ring-2 ring-indigo-500/20' : 'border-gray-300'}
          ${disabled ? 'bg-gray-50 cursor-not-allowed opacity-60' : 'bg-white hover:border-gray-400'}
          transition-colors
        `}
      >
        {selected.map((s) => (
          <span
            key={s.id}
            className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded-md text-xs font-medium max-w-[180px]"
          >
            <span className="truncate">{s.label}</span>
            {!disabled && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); removeChip(s.id) }}
                className="text-indigo-600 hover:text-indigo-900 flex-shrink-0"
              >
                <X size={10} />
              </button>
            )}
          </span>
        ))}

        {open ? (
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={selected.length ? '' : placeholder}
            className="flex-1 min-w-[120px] outline-none text-sm text-gray-700 bg-transparent"
          />
        ) : (
          <span className="flex-1 text-sm text-gray-400 select-none">
            {selected.length === 0 ? placeholder : ''}
          </span>
        )}

        <ChevronDown size={14} className={`text-gray-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
          {/* Search header */}
          <div className="px-3 py-2 border-b border-gray-100 flex items-center gap-2">
            <Search size={13} className="text-gray-400 flex-shrink-0" />
            <span className="text-xs text-gray-400">
              {loading ? 'Searching…' : `${options.length} result${options.length !== 1 ? 's' : ''}`}
            </span>
            {selected.length > 0 && (
              <button
                type="button"
                onClick={() => onChange([])}
                className="ml-auto text-xs text-red-500 hover:text-red-700"
              >
                Clear all
              </button>
            )}
          </div>

          {/* Options list */}
          <ul className="max-h-52 overflow-y-auto py-1">
            {loading && (
              <li className="px-3 py-2 text-sm text-gray-400 text-center">Searching…</li>
            )}
            {!loading && options.length === 0 && (
              <li className="px-3 py-2 text-sm text-gray-400 text-center">No results found</li>
            )}
            {!loading && options.map((opt) => {
              const sel = isSelected(opt.id)
              return (
                <li
                  key={opt.id}
                  role="option"
                  aria-selected={sel}
                  onClick={() => toggle(opt)}
                  className={`
                    flex items-center gap-2 px-3 py-2 text-sm cursor-pointer select-none
                    ${sel
                      ? 'bg-indigo-50 text-indigo-800'
                      : 'text-gray-700 hover:bg-gray-50'
                    }
                  `}
                >
                  <span className={`
                    flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center
                    ${sel ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300'}
                  `}>
                    {sel && <Check size={10} className="text-white" />}
                  </span>
                  <span className="truncate">{opt.label}</span>
                </li>
              )
            })}
          </ul>

          {/* Footer */}
          {maxItems && (
            <div className="px-3 py-1.5 border-t border-gray-100 text-xs text-gray-400">
              {selected.length}/{maxItems} selected
            </div>
          )}
        </div>
      )}
    </div>
  )
}
