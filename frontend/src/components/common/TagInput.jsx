import React, { useState, useRef, useCallback } from 'react'
import { X, Plus } from 'lucide-react'

const TagInput = ({
  label,
  placeholder = 'Type and press Enter or click ADD',
  value = [],
  onChange,
  maxTags = 50,
  disabled = false,
  className = '',
}) => {
  const [inputVal, setInputVal] = useState('')
  const [error,    setError]    = useState('')
  const inputRef = useRef(null)

  const addTag = useCallback(() => {
    const trimmed = inputVal.trim()
    if (!trimmed) { inputRef.current?.focus(); return }
    if (value.some(t => t.toLowerCase() === trimmed.toLowerCase())) {
      setError(`"${trimmed}" is already added`)
      return
    }
    if (value.length >= maxTags) {
      setError(`Maximum ${maxTags} items allowed`)
      return
    }
    onChange([...value, trimmed])
    setInputVal('')
    setError('')
    inputRef.current?.focus()
  }, [inputVal, value, onChange, maxTags])

  const removeTag = useCallback((index) => {
    onChange(value.filter((_, i) => i !== index))
    setError('')
    inputRef.current?.focus()
  }, [value, onChange])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addTag(); return }
    if (e.key === 'Backspace' && !inputVal && value.length > 0) {
      removeTag(value.length - 1)
    }
  }

  return (
    <div className={`space-y-1.5 ${className}`}>
      {label && (
        <label className="block text-sm font-medium" style={{ color: 'var(--text-label)' }}>
          {label}
        </label>
      )}

      <div
        className={`min-h-[46px] rounded-lg px-3 py-2 flex flex-wrap gap-1.5 items-center
          focus-within:ring-2 transition-all ${disabled ? 'opacity-50 pointer-events-none' : 'cursor-text'}`}
        style={{
          background:  'var(--bg-input)',
          border:      '1px solid var(--border-input)',
          '--tw-ring-color': 'var(--accent)',
        }}
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((tag, i) => (
          <span
            key={`${tag}-${i}`}
            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full
              text-xs font-medium select-none"
            style={{ background: 'rgba(108,99,255,0.18)', color: '#A78BFA' }}
          >
            {tag}
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => { e.stopPropagation(); removeTag(i) }}
              className="rounded-full w-3.5 h-3.5 flex items-center justify-center
                opacity-60 hover:opacity-100 transition-opacity"
              aria-label={`Remove ${tag}`}
            >
              <X className="w-2.5 h-2.5" />
            </button>
          </span>
        ))}

        <input
          ref={inputRef}
          type="text"
          value={inputVal}
          onChange={(e) => { setInputVal(e.target.value); setError('') }}
          onKeyDown={handleKeyDown}
          placeholder={value.length === 0 ? placeholder : ''}
          disabled={disabled}
          className="flex-1 min-w-[180px] bg-transparent text-sm outline-none placeholder:opacity-50"
          style={{ color: 'var(--text-primary)', caretColor: 'var(--accent)' }}
        />
      </div>

      <div className="flex items-center justify-between px-0.5">
        <div className="h-4">
          {error && (
            <p className="text-xs" style={{ color: '#FF4757' }}>{error}</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs tabular-nums" style={{ color: 'var(--text-disabled)' }}>
            {value.length}{maxTags < 9999 ? `/${maxTags}` : ''}
          </span>
          <button
            type="button"
            onClick={addTag}
            disabled={disabled || !inputVal.trim()}
            className="flex items-center gap-1 px-3 py-1 rounded-md text-xs font-semibold
              transition-all duration-150 disabled:opacity-35 disabled:cursor-not-allowed"
            style={{
              background: inputVal.trim() ? 'var(--accent)' : 'var(--bg-card-alt)',
              color:      inputVal.trim() ? '#fff' : 'var(--text-disabled)',
            }}
          >
            <Plus className="w-3 h-3" />
            ADD
          </button>
        </div>
      </div>
    </div>
  )
}

export default TagInput
