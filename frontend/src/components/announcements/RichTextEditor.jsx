/**
 * RichTextEditor — contentEditable-based rich text editor.
 * No external library required. Uses document.execCommand (universally supported).
 *
 * Props:
 *   value       string  — HTML content
 *   onChange    fn(html) — called on every change
 *   placeholder string
 *   minHeight   string  — CSS min-height of editor area
 *   disabled    bool
 */
import { useRef, useEffect, useCallback, useState } from 'react'
import {
  Bold, Italic, Underline, Strikethrough, AlignLeft, AlignCenter,
  AlignRight, AlignJustify, List, ListOrdered, Link, Minus, Undo, Redo,
  Palette, Eye, EyeOff, Table,
} from 'lucide-react'

const CMD = (cmd, value = null) => {
  document.execCommand(cmd, false, value)
}

function ToolbarBtn({ title, active, onClick, children, className = '' }) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => { e.preventDefault(); onClick() }}
      className={`
        p-1.5 rounded text-sm transition-colors flex-shrink-0
        ${active
          ? 'bg-indigo-100 text-indigo-700'
          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
        }
        ${className}
      `}
    >
      {children}
    </button>
  )
}

function ToolbarSep() {
  return <span className="w-px h-5 bg-gray-200 mx-0.5 flex-shrink-0" />
}

const FONT_COLORS = [
  '#000000', '#374151', '#dc2626', '#ea580c', '#d97706',
  '#16a34a', '#2563eb', '#7c3aed', '#db2777', '#0891b2',
]

const BG_COLORS = [
  '#fef9c3', '#fce7f3', '#ede9fe', '#dbeafe', '#dcfce7',
  '#ffedd5', '#fee2e2', '#f0fdf4', '#f0f9ff', '#f5f3ff',
]

export default function RichTextEditor({
  value = '',
  onChange,
  placeholder = 'Write your announcement…',
  minHeight = '180px',
  disabled = false,
}) {
  const editorRef  = useRef(null)
  const [preview, setPreview] = useState(false)
  const [colorPickerOpen, setColorPickerOpen] = useState(null) // 'fore' | 'back'
  const isInitialized = useRef(false)

  // Sync value → DOM (only on mount or external reset)
  useEffect(() => {
    if (!editorRef.current) return
    if (!isInitialized.current) {
      editorRef.current.innerHTML = value || ''
      isInitialized.current = true
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // When value is cleared externally (empty string)
  useEffect(() => {
    if (!editorRef.current) return
    if (value === '' && editorRef.current.innerHTML !== '') {
      editorRef.current.innerHTML = ''
    }
  }, [value])

  const handleInput = useCallback(() => {
    if (!editorRef.current) return
    onChange?.(editorRef.current.innerHTML)
  }, [onChange])

  const execAndFocus = useCallback((cmd, val = null) => {
    editorRef.current?.focus()
    CMD(cmd, val)
    handleInput()
  }, [handleInput])

  const insertLink = () => {
    const url = window.prompt('Enter URL:')
    if (url) execAndFocus('createLink', url)
  }

  const insertHr = () => {
    execAndFocus('insertHTML', '<hr style="border:none;border-top:1px solid #e5e7eb;margin:12px 0" /><br/>')
  }

  const insertTable = () => {
    const html = `
      <table style="width:100%;border-collapse:collapse;margin:8px 0">
        <thead><tr>
          <th style="border:1px solid #d1d5db;padding:6px 8px;background:#f9fafb;font-size:13px">Header 1</th>
          <th style="border:1px solid #d1d5db;padding:6px 8px;background:#f9fafb;font-size:13px">Header 2</th>
          <th style="border:1px solid #d1d5db;padding:6px 8px;background:#f9fafb;font-size:13px">Header 3</th>
        </tr></thead>
        <tbody>
          <tr>
            <td style="border:1px solid #d1d5db;padding:6px 8px;font-size:13px">Cell</td>
            <td style="border:1px solid #d1d5db;padding:6px 8px;font-size:13px">Cell</td>
            <td style="border:1px solid #d1d5db;padding:6px 8px;font-size:13px">Cell</td>
          </tr>
        </tbody>
      </table><br/>
    `
    execAndFocus('insertHTML', html)
  }

  const applyForeColor = (color) => {
    setColorPickerOpen(null)
    execAndFocus('foreColor', color)
  }

  const applyBackColor = (color) => {
    setColorPickerOpen(null)
    execAndFocus('hiliteColor', color)
  }

  // Close color picker on outside click
  useEffect(() => {
    if (!colorPickerOpen) return
    const handler = () => setColorPickerOpen(null)
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [colorPickerOpen])

  return (
    <div className={`border border-gray-300 rounded-lg overflow-hidden ${disabled ? 'opacity-60 pointer-events-none' : ''}`}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 bg-gray-50 border-b border-gray-200">
        {/* History */}
        <ToolbarBtn title="Undo" onClick={() => execAndFocus('undo')}><Undo size={14} /></ToolbarBtn>
        <ToolbarBtn title="Redo" onClick={() => execAndFocus('redo')}><Redo size={14} /></ToolbarBtn>
        <ToolbarSep />

        {/* Text style */}
        <ToolbarBtn title="Bold" onClick={() => execAndFocus('bold')}><Bold size={14} /></ToolbarBtn>
        <ToolbarBtn title="Italic" onClick={() => execAndFocus('italic')}><Italic size={14} /></ToolbarBtn>
        <ToolbarBtn title="Underline" onClick={() => execAndFocus('underline')}><Underline size={14} /></ToolbarBtn>
        <ToolbarBtn title="Strikethrough" onClick={() => execAndFocus('strikeThrough')}><Strikethrough size={14} /></ToolbarBtn>
        <ToolbarSep />

        {/* Heading shortcuts */}
        <ToolbarBtn
          title="Heading 1"
          onClick={() => execAndFocus('formatBlock', 'H2')}
          className="text-xs font-bold px-2"
        >H1</ToolbarBtn>
        <ToolbarBtn
          title="Heading 2"
          onClick={() => execAndFocus('formatBlock', 'H3')}
          className="text-xs font-semibold px-2"
        >H2</ToolbarBtn>
        <ToolbarBtn
          title="Paragraph"
          onClick={() => execAndFocus('formatBlock', 'P')}
          className="text-xs px-2"
        >P</ToolbarBtn>
        <ToolbarSep />

        {/* Lists */}
        <ToolbarBtn title="Bullet list" onClick={() => execAndFocus('insertUnorderedList')}><List size={14} /></ToolbarBtn>
        <ToolbarBtn title="Numbered list" onClick={() => execAndFocus('insertOrderedList')}><ListOrdered size={14} /></ToolbarBtn>
        <ToolbarSep />

        {/* Alignment */}
        <ToolbarBtn title="Align left"    onClick={() => execAndFocus('justifyLeft')}><AlignLeft size={14} /></ToolbarBtn>
        <ToolbarBtn title="Align center"  onClick={() => execAndFocus('justifyCenter')}><AlignCenter size={14} /></ToolbarBtn>
        <ToolbarBtn title="Align right"   onClick={() => execAndFocus('justifyRight')}><AlignRight size={14} /></ToolbarBtn>
        <ToolbarBtn title="Justify"       onClick={() => execAndFocus('justifyFull')}><AlignJustify size={14} /></ToolbarBtn>
        <ToolbarSep />

        {/* Link, HR, Table */}
        <ToolbarBtn title="Insert link" onClick={insertLink}><Link size={14} /></ToolbarBtn>
        <ToolbarBtn title="Horizontal rule" onClick={insertHr}><Minus size={14} /></ToolbarBtn>
        <ToolbarBtn title="Insert table" onClick={insertTable}><Table size={14} /></ToolbarBtn>
        <ToolbarSep />

        {/* Colors */}
        <div className="relative">
          <ToolbarBtn
            title="Text color"
            onClick={(e) => { e?.stopPropagation?.(); setColorPickerOpen(v => v === 'fore' ? null : 'fore') }}
          >
            <div className="flex items-center gap-0.5">
              <Palette size={13} />
              <span className="text-xs">A</span>
            </div>
          </ToolbarBtn>
          {colorPickerOpen === 'fore' && (
            <div
              className="absolute top-8 left-0 z-50 bg-white border border-gray-200 rounded-lg shadow-xl p-2 flex flex-wrap gap-1 w-36"
              onMouseDown={(e) => e.stopPropagation()}
            >
              {FONT_COLORS.map(c => (
                <button
                  key={c} type="button"
                  onMouseDown={(e) => { e.preventDefault(); applyForeColor(c) }}
                  style={{ backgroundColor: c }}
                  className="w-6 h-6 rounded border border-gray-200 hover:scale-110 transition-transform"
                  title={c}
                />
              ))}
            </div>
          )}
        </div>

        <div className="relative">
          <ToolbarBtn
            title="Highlight color"
            onClick={() => setColorPickerOpen(v => v === 'back' ? null : 'back')}
          >
            <div className="flex items-center gap-0.5">
              <Palette size={13} />
              <span className="text-xs bg-yellow-200 px-0.5 rounded">H</span>
            </div>
          </ToolbarBtn>
          {colorPickerOpen === 'back' && (
            <div
              className="absolute top-8 left-0 z-50 bg-white border border-gray-200 rounded-lg shadow-xl p-2 flex flex-wrap gap-1 w-36"
              onMouseDown={(e) => e.stopPropagation()}
            >
              {BG_COLORS.map(c => (
                <button
                  key={c} type="button"
                  onMouseDown={(e) => { e.preventDefault(); applyBackColor(c) }}
                  style={{ backgroundColor: c }}
                  className="w-6 h-6 rounded border border-gray-200 hover:scale-110 transition-transform"
                  title={c}
                />
              ))}
            </div>
          )}
        </div>

        <ToolbarSep />

        {/* Preview toggle */}
        <ToolbarBtn
          title={preview ? 'Edit mode' : 'Preview'}
          active={preview}
          onClick={() => setPreview(v => !v)}
        >
          {preview ? <EyeOff size={14} /> : <Eye size={14} />}
        </ToolbarBtn>
      </div>

      {/* Editor / Preview */}
      {preview ? (
        <div
          className="p-3 prose prose-sm max-w-none text-gray-800"
          style={{ minHeight }}
          dangerouslySetInnerHTML={{ __html: value || '<p class="text-gray-400">(empty)</p>' }}
        />
      ) : (
        <div
          ref={editorRef}
          contentEditable={!disabled}
          suppressContentEditableWarning
          onInput={handleInput}
          onPaste={() => setTimeout(handleInput, 0)}
          className="p-3 text-sm text-gray-800 outline-none focus:outline-none"
          style={{ minHeight, lineHeight: 1.6 }}
          data-placeholder={placeholder}
        />
      )}

      {/* Placeholder via CSS */}
      <style>{`
        [contenteditable]:empty:not(:focus)::before {
          content: attr(data-placeholder);
          color: #9ca3af;
          pointer-events: none;
        }
      `}</style>
    </div>
  )
}
