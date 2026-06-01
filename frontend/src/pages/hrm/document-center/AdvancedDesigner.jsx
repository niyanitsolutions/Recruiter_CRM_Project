import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  DragOverlay,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Save, Eye, ArrowLeft, Loader2, Wand2, Plus, Trash2, GripVertical,
  ChevronDown, ChevronUp, Bold, Italic, Underline, AlignLeft, AlignCenter,
  AlignRight, AlignJustify, List, ListOrdered, Link2, Palette, Type,
  Table, Image as ImageIcon, FileText, Minus as MinusIcon, RotateCcw,
  RotateCw, Hash, Quote, Layers, Columns, Stamp,
} from 'lucide-react'
import documentCenterService from '../../../services/documentCenterService'

// ─── Constants ────────────────────────────────────────────────────────────────
const PAGE_WIDTHS = { A4: '210mm', letter: '216mm', legal: '216mm' }
const WATERMARK_PRESETS = ['DRAFT', 'CONFIDENTIAL', 'INTERNAL', 'APPROVED']

const BLOCK_TYPES = [
  { type: 'heading1',   icon: Hash,      label: 'Heading 1',     group: 'Text' },
  { type: 'heading2',   icon: Hash,      label: 'Heading 2',     group: 'Text' },
  { type: 'heading3',   icon: Hash,      label: 'Heading 3',     group: 'Text' },
  { type: 'paragraph',  icon: AlignLeft, label: 'Paragraph',     group: 'Text' },
  { type: 'richtext',   icon: FileText,  label: 'Rich Text',     group: 'Text' },
  { type: 'quote',      icon: Quote,     label: 'Quote',         group: 'Text' },
  { type: 'bulletlist', icon: List,      label: 'Bullet List',   group: 'Text' },
  { type: 'numberedlist',icon: ListOrdered,'label': 'Numbered List','group':'Text' },
  { type: 'divider',    icon: MinusIcon, label: 'Divider',       group: 'Layout' },
  { type: 'spacer',     icon: Columns,   label: 'Spacer',        group: 'Layout' },
  { type: 'pagebreak',  icon: Layers,    label: 'Page Break',    group: 'Layout' },
  { type: 'table',      icon: Table,     label: 'Table',         group: 'Data' },
  { type: 'image',      icon: ImageIcon, label: 'Image',         group: 'Media' },
  { type: 'signature',  icon: Stamp,     label: 'Signature Block','group': 'Media' },
]

const HR_FIELDS = [
  { group: 'Employee',  label: 'Employee Name',   field: '{{employee_name}}' },
  { group: 'Employee',  label: 'Employee ID',     field: '{{employee_id}}' },
  { group: 'Employee',  label: 'Department',      field: '{{department}}' },
  { group: 'Employee',  label: 'Designation',     field: '{{designation}}' },
  { group: 'Employee',  label: 'Joining Date',    field: '{{joining_date}}' },
  { group: 'Employee',  label: 'Exit Date',       field: '{{exit_date}}' },
  { group: 'Employee',  label: 'Salary',          field: '{{salary}}' },
  { group: 'Employee',  label: 'Manager Name',    field: '{{manager_name}}' },
  { group: 'Company',   label: 'Company Name',    field: '{{company_name}}' },
  { group: 'Company',   label: 'Company Address', field: '{{company_address}}' },
  { group: 'Date',      label: 'Current Date',    field: '{{current_date}}' },
  { group: 'Date',      label: 'Month & Year',    field: '{{month_year}}' },
  { group: 'Payroll',   label: 'Basic Salary',    field: '{{basic}}' },
  { group: 'Payroll',   label: 'Gross Salary',    field: '{{gross}}' },
  { group: 'Payroll',   label: 'Net Salary',      field: '{{net_salary}}' },
  { group: 'Payroll',   label: 'Total Deductions',field: '{{total_deductions}}' },
]

// ─── Block factory ─────────────────────────────────────────────────────────────
let _idCounter = 1
const makeId = () => `blk_${Date.now()}_${_idCounter++}`

const DEFAULT_BLOCKS = {
  heading1:    () => ({ id: makeId(), type: 'heading1',    content: 'Heading', style: {} }),
  heading2:    () => ({ id: makeId(), type: 'heading2',    content: 'Sub Heading', style: {} }),
  heading3:    () => ({ id: makeId(), type: 'heading3',    content: 'Section', style: {} }),
  paragraph:   () => ({ id: makeId(), type: 'paragraph',   content: 'Your text here…', style: {} }),
  richtext:    () => ({ id: makeId(), type: 'richtext',    content: 'Rich text content…', style: {} }),
  quote:       () => ({ id: makeId(), type: 'quote',       content: 'Notable quote or highlight text', style: {} }),
  bulletlist:  () => ({ id: makeId(), type: 'bulletlist',  items: ['Item 1', 'Item 2', 'Item 3'], style: {} }),
  numberedlist:() => ({ id: makeId(), type: 'numberedlist',items: ['Step 1', 'Step 2', 'Step 3'], style: {} }),
  divider:     () => ({ id: makeId(), type: 'divider',     style: { color: '#e5e7eb', thickness: 2 } }),
  spacer:      () => ({ id: makeId(), type: 'spacer',      height: 24, style: {} }),
  pagebreak:   () => ({ id: makeId(), type: 'pagebreak',   style: {} }),
  table:       () => ({
    id: makeId(), type: 'table',
    rows: [
      ['Header 1', 'Header 2', 'Header 3'],
      ['{{employee_name}}', '{{department}}', '{{designation}}'],
      ['', '', ''],
    ],
    isHeader: [true, false, false],
    style: { headerBg: '#7c3aed', borderColor: '#e5e7eb' },
  }),
  image:       () => ({ id: makeId(), type: 'image',     src: '', alt: 'Image', width: '100%', style: {} }),
  signature:   () => ({
    id: makeId(), type: 'signature',
    signers: [
      { label: 'Employee Signature', name: '{{employee_name}}' },
      { label: 'Authorized Signatory', name: '' },
    ],
    style: {},
  }),
}

// ─── Block HTML serializer (for PDF/DOCX generation) ──────────────────────────
function blockToHtml(block) {
  const s = block.style || {}
  const align = s.textAlign ? `text-align:${s.textAlign};` : ''
  const color  = s.color    ? `color:${s.color};`           : ''
  const size   = s.fontSize ? `font-size:${s.fontSize}px;`  : ''
  const inline = `${align}${color}${size}`

  switch (block.type) {
    case 'heading1':
      return `<h1 style="${inline}${s.bold ? 'font-weight:bold;' : ''}">${block.content || ''}</h1>`
    case 'heading2':
      return `<h2 style="${inline}">${block.content || ''}</h2>`
    case 'heading3':
      return `<h3 style="${inline}">${block.content || ''}</h3>`
    case 'paragraph':
    case 'richtext':
      return `<p style="${inline}">${block.content || ''}</p>`
    case 'quote':
      return `<blockquote style="border-left:4px solid #7c3aed;padding-left:12px;color:#6b7280;margin:8px 0;${inline}">${block.content || ''}</blockquote>`
    case 'bulletlist':
      return `<ul style="${inline}">${(block.items || []).map(i => `<li>${i}</li>`).join('')}</ul>`
    case 'numberedlist':
      return `<ol style="${inline}">${(block.items || []).map(i => `<li>${i}</li>`).join('')}</ol>`
    case 'divider':
      return `<hr style="border:none;border-top:${s.thickness || 2}px solid ${s.color || '#e5e7eb'};margin:12px 0;" />`
    case 'spacer':
      return `<div style="height:${block.height || 24}px;"></div>`
    case 'pagebreak':
      return `<div style="page-break-after:always;"></div>`
    case 'table': {
      const rows = block.rows || []
      const hdrBg = (block.style?.headerBg || '#7c3aed')
      const bdr = (block.style?.borderColor || '#e5e7eb')
      return `<table border="1" style="width:100%;border-collapse:collapse;margin:8px 0;">
        ${rows.map((row, ri) => `<tr>${row.map(cell =>
          ri === 0
            ? `<th style="background:${hdrBg};color:white;padding:8px;border:1px solid ${bdr};">${cell}</th>`
            : `<td style="padding:8px;border:1px solid ${bdr};${ri % 2 === 0 ? 'background:#f9fafb;' : ''}">${cell}</td>`
        ).join('')}</tr>`).join('')}
      </table>`
    }
    case 'image':
      return block.src ? `<img src="${block.src}" alt="${block.alt || ''}" style="width:${block.width || '100%'};max-width:100%;" />` : ''
    case 'signature': {
      const sigs = block.signers || []
      return `<table style="width:100%;margin:16px 0;border-collapse:collapse;">
        <tr>${sigs.map(sig => `<td style="width:${100/sigs.length}%;padding:8px;vertical-align:bottom;">
          <div style="border-top:2px solid #1f2937;padding-top:4px;font-size:11px;color:#374151;">
            ${sig.label}<br>Name: ${sig.name || '____________'}<br>Date: ____________
          </div></td>`).join('<td style="width:20px;"></td>')}</tr>
      </table>`
    }
    default: return ''
  }
}

function blocksToHtml(blocks) {
  return blocks.map(blockToHtml).join('\n')
}

// ─── Shared UI ─────────────────────────────────────────────────────────────────
const Panel = ({ title, children, defaultOpen = false }) => {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b" style={{ borderColor: 'var(--border)' }}>
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold uppercase tracking-wider"
        style={{ color: 'var(--text-muted)' }}>
        {title}
        {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>
      {open && <div className="px-4 pb-4 space-y-3">{children}</div>}
    </div>
  )
}

const Lbl = ({ children }) => <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>{children}</p>
const Inp = (props) => (
  <input {...props} className="w-full px-2.5 py-1.5 text-sm rounded-lg border focus:outline-none focus:ring-1 focus:ring-violet-500"
    style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)', color: 'var(--text-body)' }} />
)
const Sel = ({ children, ...props }) => (
  <select {...props} className="w-full px-2.5 py-1.5 text-sm rounded-lg border focus:outline-none focus:ring-1 focus:ring-violet-500"
    style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)', color: 'var(--text-body)' }}>
    {children}
  </select>
)
const Tog = ({ label, checked, onChange }) => (
  <label className="flex items-center gap-2 cursor-pointer">
    <div onClick={() => onChange(!checked)}
      className={`w-9 h-5 rounded-full transition-colors relative flex-shrink-0 ${checked ? 'bg-violet-600' : 'bg-gray-300 dark:bg-gray-600'}`}>
      <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
    </div>
    <span className="text-xs" style={{ color: 'var(--text-body)' }}>{label}</span>
  </label>
)

// ─── Block renderers ───────────────────────────────────────────────────────────
function BlockRenderer({ block, isSelected, onSelect, onChange, onDelete }) {
  const ref = useRef(null)

  const updateContent = useCallback((html) => {
    onChange({ ...block, content: html })
  }, [block, onChange])

  const s = block.style || {}
  const baseStyle = {
    textAlign: s.textAlign || 'left',
    color: s.color || 'inherit',
    fontSize: s.fontSize ? `${s.fontSize}px` : undefined,
    fontWeight: s.bold ? 'bold' : undefined,
    fontStyle: s.italic ? 'italic' : undefined,
    textDecoration: s.underline ? 'underline' : undefined,
    lineHeight: 1.6,
    outline: 'none',
    minHeight: '1.6em',
    width: '100%',
  }

  if (block.type === 'divider') {
    return (
      <div onClick={() => onSelect(block.id)} className={`py-2 cursor-pointer ${isSelected ? 'ring-2 ring-violet-500 ring-inset rounded' : ''}`}>
        <hr style={{ border: 'none', borderTop: `${s.thickness || 2}px solid ${s.color || '#e5e7eb'}` }} />
      </div>
    )
  }

  if (block.type === 'spacer') {
    return (
      <div onClick={() => onSelect(block.id)} className={`relative cursor-pointer ${isSelected ? 'ring-2 ring-violet-500 ring-inset rounded' : ''}`}
        style={{ height: block.height || 24, background: isSelected ? 'rgba(124,58,237,0.05)' : 'transparent' }}>
        {isSelected && (
          <span className="absolute inset-0 flex items-center justify-center text-xs text-violet-400">
            Spacer ({block.height || 24}px)
          </span>
        )}
      </div>
    )
  }

  if (block.type === 'pagebreak') {
    return (
      <div onClick={() => onSelect(block.id)}
        className={`py-3 text-center cursor-pointer ${isSelected ? 'ring-2 ring-violet-500 ring-inset rounded' : ''}`}
        style={{ borderTop: '2px dashed #d1d5db', borderBottom: '2px dashed #d1d5db', margin: '4px 0' }}>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>— Page Break —</span>
      </div>
    )
  }

  if (block.type === 'table') {
    const rows = block.rows || []
    const hdrBg = block.style?.headerBg || '#7c3aed'
    const bdr = block.style?.borderColor || '#e5e7eb'
    return (
      <div onClick={() => onSelect(block.id)} className={`overflow-x-auto ${isSelected ? 'ring-2 ring-violet-500 ring-inset rounded' : ''}`}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri} style={{ background: ri === 0 ? hdrBg : ri % 2 === 0 ? '#f9fafb' : 'white' }}>
                {row.map((cell, ci) => (
                  <td key={ci}
                    contentEditable
                    suppressContentEditableWarning
                    onBlur={e => {
                      const newRows = rows.map((r, rIdx) =>
                        rIdx === ri ? r.map((c, cIdx) => cIdx === ci ? e.target.textContent : c) : r
                      )
                      onChange({ ...block, rows: newRows })
                    }}
                    style={{
                      padding: '7px 10px',
                      border: `1px solid ${bdr}`,
                      color: ri === 0 ? 'white' : '#1f2937',
                      fontWeight: ri === 0 ? 'bold' : 'normal',
                      fontSize: 13,
                      minWidth: 80,
                    }}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {isSelected && (
          <div className="flex gap-2 mt-2 flex-wrap">
            {[
              { label: '+ Row',    fn: () => onChange({ ...block, rows: [...rows, rows[rows.length-1]?.map(() => '') || ['']] }) },
              { label: '+ Column', fn: () => onChange({ ...block, rows: rows.map(r => [...r, '']) }) },
              { label: '- Row',    fn: () => rows.length > 1 && onChange({ ...block, rows: rows.slice(0, -1) }) },
              { label: '- Column', fn: () => rows[0]?.length > 1 && onChange({ ...block, rows: rows.map(r => r.slice(0, -1)) }) },
            ].map(btn => (
              <button key={btn.label} onClick={e => { e.stopPropagation(); btn.fn() }}
                className="text-xs px-2 py-1 rounded border hover:bg-violet-50 dark:hover:bg-violet-900/20"
                style={{ borderColor: 'var(--border)', color: 'var(--text-body)' }}>
                {btn.label}
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  if (block.type === 'image') {
    return (
      <div onClick={() => onSelect(block.id)} className={`${isSelected ? 'ring-2 ring-violet-500 ring-inset rounded' : ''}`}>
        {block.src ? (
          <img src={block.src} alt={block.alt || 'image'} style={{ width: block.width || '100%', maxWidth: '100%' }} />
        ) : (
          <div className="flex items-center justify-center py-8 rounded-lg border-2 border-dashed"
            style={{ borderColor: 'var(--border)' }}>
            <div className="text-center">
              <ImageIcon className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Click to select image</p>
              {isSelected && (
                <div className="mt-3">
                  <input type="text" placeholder="Enter image URL…"
                    className="text-xs px-3 py-1.5 rounded-lg border w-64 focus:outline-none focus:ring-1 focus:ring-violet-500"
                    style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)', color: 'var(--text-body)' }}
                    onBlur={e => onChange({ ...block, src: e.target.value })}
                    onClick={e => e.stopPropagation()} />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  if (block.type === 'signature') {
    const sigs = block.signers || []
    return (
      <div onClick={() => onSelect(block.id)} className={`${isSelected ? 'ring-2 ring-violet-500 ring-inset rounded' : ''}`}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            <tr>
              {sigs.map((sig, i) => (
                <td key={i} style={{ padding: '8px', verticalAlign: 'bottom', width: `${100 / sigs.length}%` }}>
                  <div style={{ borderTop: '2px solid #1f2937', paddingTop: 4, fontSize: 12, color: '#374151' }}>
                    <span contentEditable suppressContentEditableWarning
                      onBlur={e => {
                        const newSigs = sigs.map((s, si) => si === i ? { ...s, label: e.target.textContent } : s)
                        onChange({ ...block, signers: newSigs })
                      }}
                      style={{ fontWeight: 'bold', display: 'block' }}>
                      {sig.label}
                    </span>
                    Name: <span contentEditable suppressContentEditableWarning
                      onBlur={e => {
                        const newSigs = sigs.map((s, si) => si === i ? { ...s, name: e.target.textContent } : s)
                        onChange({ ...block, signers: newSigs })
                      }}>
                      {sig.name}
                    </span><br />
                    Date: ____________
                  </div>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    )
  }

  if (block.type === 'bulletlist' || block.type === 'numberedlist') {
    const Tag = block.type === 'bulletlist' ? 'ul' : 'ol'
    return (
      <div onClick={() => onSelect(block.id)} className={`${isSelected ? 'ring-2 ring-violet-500 ring-inset rounded' : ''}`}>
        <Tag style={{ paddingLeft: 20, margin: 0, ...baseStyle }}>
          {(block.items || []).map((item, i) => (
            <li key={i} contentEditable suppressContentEditableWarning
              onBlur={e => {
                const newItems = (block.items || []).map((it, idx) => idx === i ? e.target.textContent : it)
                onChange({ ...block, items: newItems })
              }}
              style={{ minHeight: '1.4em', lineHeight: 1.6, marginBottom: 4 }}>
              {item}
            </li>
          ))}
        </Tag>
        {isSelected && (
          <div className="flex gap-2 mt-2">
            <button onClick={e => { e.stopPropagation(); onChange({ ...block, items: [...(block.items || []), 'New item'] }) }}
              className="text-xs px-2 py-1 rounded border hover:bg-violet-50"
              style={{ borderColor: 'var(--border)', color: 'var(--text-body)' }}>
              + Item
            </button>
            <button onClick={e => { e.stopPropagation(); (block.items || []).length > 1 && onChange({ ...block, items: block.items.slice(0, -1) }) }}
              className="text-xs px-2 py-1 rounded border hover:bg-red-50 text-red-500"
              style={{ borderColor: 'var(--border)' }}>
              - Item
            </button>
          </div>
        )}
      </div>
    )
  }

  if (block.type === 'quote') {
    return (
      <div onClick={() => onSelect(block.id)} className={`${isSelected ? 'ring-2 ring-violet-500 ring-inset rounded' : ''}`}
        style={{ borderLeft: '4px solid #7c3aed', paddingLeft: 12, margin: '4px 0' }}>
        <p contentEditable suppressContentEditableWarning ref={ref}
          onBlur={e => updateContent(e.target.innerHTML)}
          suppressContentEditableWarning
          style={{ ...baseStyle, color: '#6b7280', fontStyle: 'italic' }}>
          {block.content || 'Quote text…'}
        </p>
      </div>
    )
  }

  // Text-type blocks (heading1, heading2, heading3, paragraph, richtext)
  const tagMap = { heading1: 'h1', heading2: 'h2', heading3: 'h3', paragraph: 'p', richtext: 'div' }
  const Tag = tagMap[block.type] || 'p'
  const sizeMap = { heading1: 28, heading2: 22, heading3: 17, paragraph: 13, richtext: 13 }
  const fwMap   = { heading1: 'bold', heading2: 'bold', heading3: '600', paragraph: 'normal', richtext: 'normal' }

  return (
    <div onClick={() => onSelect(block.id)} className={`${isSelected ? 'ring-2 ring-violet-500 ring-inset rounded p-0.5' : ''}`}>
      <Tag
        contentEditable
        suppressContentEditableWarning
        ref={ref}
        onFocus={() => onSelect(block.id)}
        onBlur={e => updateContent(e.target.innerHTML)}
        style={{
          ...baseStyle,
          fontSize: s.fontSize ? `${s.fontSize}px` : `${sizeMap[block.type] || 13}px`,
          fontWeight: s.bold !== undefined ? (s.bold ? 'bold' : 'normal') : fwMap[block.type],
          margin: 0, padding: 0,
        }}
        dangerouslySetInnerHTML={{ __html: block.content || '' }}
      />
    </div>
  )
}

// ─── Sortable Block Wrapper ────────────────────────────────────────────────────
function SortableBlock({ block, isSelected, onSelect, onChange, onDelete }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} className="relative group">
      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        className="absolute -left-7 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing z-10 p-1"
        title="Drag to reorder"
      >
        <GripVertical className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
      </div>

      {/* Block content */}
      <BlockRenderer
        block={block}
        isSelected={isSelected}
        onSelect={onSelect}
        onChange={onChange}
        onDelete={onDelete}
      />

      {/* Delete button */}
      {isSelected && (
        <button
          onClick={e => { e.stopPropagation(); onDelete(block.id) }}
          className="absolute -right-7 top-1/2 -translate-y-1/2 p-1 rounded text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 z-10"
          title="Delete block"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
}

// ─── Block Properties Panel ────────────────────────────────────────────────────
function PropsPanel({ block, onChange, onDelete }) {
  if (!block) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-center px-4">
        <Layers className="w-8 h-8 mb-2" style={{ color: 'var(--text-muted)' }} />
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Click a block to edit its properties</p>
      </div>
    )
  }

  const s = block.style || {}
  const setStyle = (key, val) => onChange({ ...block, style: { ...s, [key]: val } })

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
          {BLOCK_TYPES.find(b => b.type === block.type)?.label || block.type}
        </p>
        <button onClick={() => onDelete(block.id)}
          className="p-1 rounded text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {['heading1','heading2','heading3','paragraph','richtext','quote'].includes(block.type) && (
        <>
          <div>
            <Lbl>Font Size</Lbl>
            <Inp type="number" value={s.fontSize || ''} min={8} max={72} placeholder="Default"
              onChange={e => setStyle('fontSize', e.target.value ? +e.target.value : undefined)} />
          </div>
          <div>
            <Lbl>Text Color</Lbl>
            <input type="color" value={s.color || '#1f2937'} onChange={e => setStyle('color', e.target.value)}
              className="w-full h-8 rounded-lg border cursor-pointer" style={{ borderColor: 'var(--border)' }} />
          </div>
          <div>
            <Lbl>Alignment</Lbl>
            <div className="flex gap-1">
              {['left', 'center', 'right', 'justify'].map(a => (
                <button key={a} onClick={() => setStyle('textAlign', a)}
                  className={`flex-1 py-1 rounded text-xs border transition-colors ${s.textAlign === a ? 'bg-violet-600 text-white border-violet-600' : ''}`}
                  style={s.textAlign !== a ? { borderColor: 'var(--border)', color: 'var(--text-body)' } : {}}>
                  {a.charAt(0).toUpperCase() + a.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-3">
            <Tog label="Bold"      checked={!!s.bold}      onChange={v => setStyle('bold', v)} />
            <Tog label="Italic"    checked={!!s.italic}    onChange={v => setStyle('italic', v)} />
            <Tog label="Underline" checked={!!s.underline} onChange={v => setStyle('underline', v)} />
          </div>
        </>
      )}

      {block.type === 'divider' && (
        <>
          <div>
            <Lbl>Line Color</Lbl>
            <input type="color" value={s.color || '#e5e7eb'} onChange={e => setStyle('color', e.target.value)}
              className="w-full h-8 rounded-lg border cursor-pointer" style={{ borderColor: 'var(--border)' }} />
          </div>
          <div>
            <Lbl>Thickness (px)</Lbl>
            <Inp type="number" value={s.thickness || 2} min={1} max={10} onChange={e => setStyle('thickness', +e.target.value)} />
          </div>
        </>
      )}

      {block.type === 'spacer' && (
        <div>
          <Lbl>Height (px)</Lbl>
          <Inp type="number" value={block.height || 24} min={4} max={200}
            onChange={e => onChange({ ...block, height: +e.target.value })} />
        </div>
      )}

      {block.type === 'table' && (
        <>
          <div>
            <Lbl>Header Background</Lbl>
            <input type="color" value={s.headerBg || '#7c3aed'} onChange={e => setStyle('headerBg', e.target.value)}
              className="w-full h-8 rounded-lg border cursor-pointer" style={{ borderColor: 'var(--border)' }} />
          </div>
          <div>
            <Lbl>Border Color</Lbl>
            <input type="color" value={s.borderColor || '#e5e7eb'} onChange={e => setStyle('borderColor', e.target.value)}
              className="w-full h-8 rounded-lg border cursor-pointer" style={{ borderColor: 'var(--border)' }} />
          </div>
        </>
      )}

      {block.type === 'image' && (
        <>
          <div>
            <Lbl>Image URL</Lbl>
            <Inp value={block.src || ''} onChange={e => onChange({ ...block, src: e.target.value })} placeholder="https://…" />
          </div>
          <div>
            <Lbl>Alt Text</Lbl>
            <Inp value={block.alt || ''} onChange={e => onChange({ ...block, alt: e.target.value })} placeholder="Image description" />
          </div>
          <div>
            <Lbl>Width</Lbl>
            <Sel value={block.width || '100%'} onChange={e => onChange({ ...block, width: e.target.value })}>
              <option value="100%">Full Width</option>
              <option value="75%">75%</option>
              <option value="50%">50%</option>
              <option value="25%">25%</option>
              <option value="200px">200px</option>
              <option value="300px">300px</option>
            </Sel>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function AdvancedDesigner() {
  const { id }    = useParams()
  const navigate  = useNavigate()

  const [loading,  setLoading]  = useState(!!id)
  const [saving,   setSaving]   = useState(false)
  const [preview,  setPreview]  = useState(false)

  const [name,        setName]        = useState('Untitled Template')
  const [description, setDescription] = useState('')
  const [categoryId,  setCategoryId]  = useState('')
  const [tags,        setTags]        = useState('')
  const [categories,  setCategories]  = useState([])

  const [blocks,     setBlocks]     = useState([DEFAULT_BLOCKS.heading1(), DEFAULT_BLOCKS.paragraph()])
  const [selectedId, setSelectedId] = useState(null)
  const [activePanel, setActivePanel] = useState('blocks') // blocks | fields | props | layout

  const [header, setHeader] = useState({
    show: true, company_name: '', company_address: '', company_email: '',
    company_phone: '', alignment: 'left', font_size: 12, font_color: '#000000',
    background_color: '#ffffff', border_bottom: true,
  })
  const [footer, setFooter] = useState({
    show: true, text: '', show_page_numbers: true, show_date: true,
    confidential_label: false, alignment: 'center', font_size: 10,
    font_color: '#666666', border_top: true,
  })
  const [paper, setPaper] = useState({
    size: 'A4', orientation: 'portrait',
    margin_top: 72, margin_bottom: 72, margin_left: 72, margin_right: 72,
  })
  const [watermark, setWatermark] = useState({
    enabled: false, type: 'text', text: 'CONFIDENTIAL', opacity: 0.12, rotation: -45, size: 72,
  })

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  // Load categories
  useEffect(() => {
    documentCenterService.listCategories().then(r => setCategories(r.data?.data || [])).catch(() => {})
  }, [])

  // Load existing template
  useEffect(() => {
    if (!id) return
    setLoading(true)
    documentCenterService.getTemplate(id)
      .then(r => {
        const t = r.data?.data
        if (!t) return
        setName(t.name)
        setDescription(t.description || '')
        setCategoryId(t.category_id || '')
        setTags((t.tags || []).join(', '))
        if (t.content) {
          if (t.content.header)    setHeader(h => ({ ...h, ...t.content.header }))
          if (t.content.footer)    setFooter(f => ({ ...f, ...t.content.footer }))
          if (t.content.paper)     setPaper(p  => ({ ...p, ...t.content.paper }))
          if (t.content.watermark) setWatermark(w => ({ ...w, ...t.content.watermark }))
          // Load blocks from canvas_elements if available, else parse body_html
          if (t.content.canvas_elements?.length > 0) {
            setBlocks(t.content.canvas_elements)
          } else if (t.content.body_html) {
            // Single paragraph block with raw HTML
            setBlocks([{ id: makeId(), type: 'richtext', content: t.content.body_html, style: {} }])
          }
        }
      })
      .catch(() => toast.error('Failed to load template'))
      .finally(() => setLoading(false))
  }, [id])

  const selectedBlock = useMemo(() => blocks.find(b => b.id === selectedId), [blocks, selectedId])

  const addBlock = useCallback((type) => {
    const factory = DEFAULT_BLOCKS[type]
    if (!factory) return
    const newBlock = factory()
    setBlocks(prev => [...prev, newBlock])
    setSelectedId(newBlock.id)
  }, [])

  const updateBlock = useCallback((updated) => {
    setBlocks(prev => prev.map(b => b.id === updated.id ? updated : b))
  }, [])

  const deleteBlock = useCallback((blockId) => {
    setBlocks(prev => {
      const next = prev.filter(b => b.id !== blockId)
      return next.length ? next : [DEFAULT_BLOCKS.paragraph()]
    })
    if (selectedId === blockId) setSelectedId(null)
  }, [selectedId])

  const handleDragEnd = useCallback(({ active, over }) => {
    if (!over || active.id === over.id) return
    setBlocks(prev => {
      const oi = prev.findIndex(b => b.id === active.id)
      const ni = prev.findIndex(b => b.id === over.id)
      return arrayMove(prev, oi, ni)
    })
  }, [])

  const insertField = (field) => {
    if (!selectedBlock || !['heading1','heading2','heading3','paragraph','richtext','quote'].includes(selectedBlock.type)) {
      toast('Select a text block first', { icon: '💡' })
      return
    }
    updateBlock({ ...selectedBlock, content: (selectedBlock.content || '') + field })
  }

  const getBodyHtml = () => blocksToHtml(blocks)

  const buildPayload = () => ({
    name,
    description,
    category_id: categoryId || null,
    template_type: 'advanced',
    tags: tags.split(',').map(t => t.trim()).filter(Boolean),
    change_summary: id ? 'Updated via Advanced Designer' : 'Created via Advanced Designer',
    content: {
      header,
      body_html: getBodyHtml(),
      footer,
      paper,
      watermark,
      canvas_elements: blocks,
    },
    dynamic_fields: [...new Set([...getBodyHtml().matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]))],
  })

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Template name is required'); return }
    setSaving(true)
    try {
      if (id) {
        await documentCenterService.updateTemplate(id, buildPayload())
        toast.success('Template saved')
      } else {
        const r = await documentCenterService.createTemplate(buildPayload())
        const newId = r.data?.data?._id
        toast.success('Template created')
        if (newId) navigate(`/hrm/doc-center/advanced/${newId}`, { replace: true })
      }
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 animate-spin text-violet-600" />
    </div>
  )

  const paperW = paper.size === 'A4'
    ? (paper.orientation === 'landscape' ? '297mm' : '210mm')
    : paper.size === 'letter'
    ? (paper.orientation === 'landscape' ? '279mm' : '216mm')
    : (paper.orientation === 'landscape' ? '356mm' : '216mm')

  const ml = paper.margin_left   / 72 * 25.4 + 'mm'
  const mr = paper.margin_right  / 72 * 25.4 + 'mm'
  const mt = paper.margin_top    / 72 * 25.4 + 'mm'
  const mb = paper.margin_bottom / 72 * 25.4 + 'mm'

  const fieldGroups = HR_FIELDS.reduce((acc, f) => {
    if (!acc[f.group]) acc[f.group] = []
    acc[f.group].push(f)
    return acc
  }, {})

  const blockGroups = BLOCK_TYPES.reduce((acc, b) => {
    if (!acc[b.group]) acc[b.group] = []
    acc[b.group].push(b)
    return acc
  }, {})

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-primary)' }}>

      {/* ── Top bar ── */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b flex-shrink-0"
        style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
        <button onClick={() => navigate('/hrm/doc-center/templates')}
          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
          <ArrowLeft className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
        </button>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          className="flex-1 bg-transparent border-none outline-none text-sm font-semibold"
          style={{ color: 'var(--text-heading)' }}
          placeholder="Template Name"
        />
        <div className="flex items-center gap-2">
          <button onClick={() => setPreview(p => !p)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border ${preview ? 'bg-violet-600 text-white border-violet-600' : ''}`}
            style={preview ? {} : { borderColor: 'var(--border)', color: 'var(--text-body)' }}>
            <Eye className="w-4 h-4" />
            {preview ? 'Edit' : 'Preview'}
          </button>
          {id && (
            <button onClick={() => navigate(`/hrm/doc-center/generated?tmpl=${id}`)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border"
              style={{ borderColor: 'var(--border)', color: 'var(--text-body)' }}>
              <Wand2 className="w-4 h-4" /> Generate
            </button>
          )}
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-semibold text-white"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">

        {/* ── Left panel ── */}
        <aside className="w-64 flex-shrink-0 border-r overflow-y-auto flex flex-col"
          style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>

          {/* Panel switcher */}
          <div className="grid grid-cols-3 gap-1 p-2 border-b" style={{ borderColor: 'var(--border)' }}>
            {[
              { key: 'blocks', label: 'Blocks' },
              { key: 'fields', label: 'Fields' },
              { key: 'layout', label: 'Layout' },
            ].map(p => (
              <button key={p.key} onClick={() => setActivePanel(p.key)}
                className={`py-1.5 text-xs rounded-lg font-medium transition-colors ${
                  activePanel === p.key ? 'bg-violet-600 text-white' : ''
                }`}
                style={activePanel !== p.key ? { color: 'var(--text-muted)' } : {}}>
                {p.label}
              </button>
            ))}
          </div>

          {/* Blocks panel */}
          {activePanel === 'blocks' && (
            <div className="p-3 space-y-4">
              {Object.entries(blockGroups).map(([group, items]) => (
                <div key={group}>
                  <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>{group}</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {items.map(item => (
                      <button key={item.type} onClick={() => addBlock(item.type)}
                        className="flex items-center gap-2 px-2.5 py-2 rounded-lg border text-xs transition-colors hover:bg-violet-50 dark:hover:bg-violet-900/20 hover:border-violet-400 text-left"
                        style={{ borderColor: 'var(--border)', color: 'var(--text-body)' }}>
                        <item.icon className="w-3.5 h-3.5 flex-shrink-0 text-violet-500" />
                        <span className="truncate">{item.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Fields panel */}
          {activePanel === 'fields' && (
            <div className="p-3">
              <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
                Select a text block, then click a field to insert
              </p>
              {Object.entries(fieldGroups).map(([group, fields]) => (
                <div key={group} className="mb-4">
                  <p className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>{group}</p>
                  <div className="flex flex-wrap gap-1">
                    {fields.map(f => (
                      <button key={f.field} onClick={() => insertField(f.field)}
                        className="text-[11px] px-2 py-0.5 rounded-full border font-mono transition-colors hover:bg-violet-600 hover:text-white hover:border-violet-600"
                        style={{ borderColor: 'var(--border)', color: 'var(--text-body)' }}>
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Layout panel */}
          {activePanel === 'layout' && (
            <div className="overflow-y-auto">
              <Panel title="Template Info" defaultOpen>
                <div>
                  <Lbl>Description</Lbl>
                  <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
                    className="w-full px-2.5 py-1.5 text-sm rounded-lg border resize-none focus:outline-none focus:ring-1 focus:ring-violet-500"
                    style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)', color: 'var(--text-body)' }} />
                </div>
                <div>
                  <Lbl>Category</Lbl>
                  <Sel value={categoryId} onChange={e => setCategoryId(e.target.value)}>
                    <option value="">— No Category —</option>
                    {categories.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
                  </Sel>
                </div>
                <div>
                  <Lbl>Tags</Lbl>
                  <Inp value={tags} onChange={e => setTags(e.target.value)} placeholder="HR, Offer…" />
                </div>
              </Panel>
              <Panel title="Paper">
                <div>
                  <Lbl>Size</Lbl>
                  <Sel value={paper.size} onChange={e => setPaper(p => ({ ...p, size: e.target.value }))}>
                    <option value="A4">A4</option>
                    <option value="letter">Letter</option>
                    <option value="legal">Legal</option>
                  </Sel>
                </div>
                <div>
                  <Lbl>Orientation</Lbl>
                  <Sel value={paper.orientation} onChange={e => setPaper(p => ({ ...p, orientation: e.target.value }))}>
                    <option value="portrait">Portrait</option>
                    <option value="landscape">Landscape</option>
                  </Sel>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {['top','bottom','left','right'].map(s => (
                    <div key={s}>
                      <Lbl>Margin {s.charAt(0).toUpperCase() + s.slice(1)}</Lbl>
                      <Inp type="number" value={paper[`margin_${s}`]} min={0} max={200}
                        onChange={e => setPaper(p => ({ ...p, [`margin_${s}`]: +e.target.value }))} />
                    </div>
                  ))}
                </div>
              </Panel>
              <Panel title="Header">
                <Tog label="Show Header" checked={header.show} onChange={v => setHeader(h => ({ ...h, show: v }))} />
                {header.show && <>
                  <div><Lbl>Company Name</Lbl><Inp value={header.company_name} onChange={e => setHeader(h => ({ ...h, company_name: e.target.value }))} /></div>
                  <div><Lbl>Address</Lbl><Inp value={header.company_address} onChange={e => setHeader(h => ({ ...h, company_address: e.target.value }))} /></div>
                  <div><Lbl>Alignment</Lbl>
                    <Sel value={header.alignment} onChange={e => setHeader(h => ({ ...h, alignment: e.target.value }))}>
                      <option value="left">Left</option>
                      <option value="center">Center</option>
                      <option value="right">Right</option>
                    </Sel>
                  </div>
                  <Tog label="Border Bottom" checked={header.border_bottom} onChange={v => setHeader(h => ({ ...h, border_bottom: v }))} />
                </>}
              </Panel>
              <Panel title="Footer">
                <Tog label="Show Footer" checked={footer.show} onChange={v => setFooter(f => ({ ...f, show: v }))} />
                {footer.show && <>
                  <div><Lbl>Footer Text</Lbl><Inp value={footer.text} onChange={e => setFooter(f => ({ ...f, text: e.target.value }))} /></div>
                  <Tog label="Page Numbers" checked={footer.show_page_numbers} onChange={v => setFooter(f => ({ ...f, show_page_numbers: v }))} />
                  <Tog label="Current Date"  checked={footer.show_date} onChange={v => setFooter(f => ({ ...f, show_date: v }))} />
                  <Tog label="Confidential"  checked={footer.confidential_label} onChange={v => setFooter(f => ({ ...f, confidential_label: v }))} />
                </>}
              </Panel>
              <Panel title="Watermark">
                <Tog label="Enable" checked={watermark.enabled} onChange={v => setWatermark(w => ({ ...w, enabled: v }))} />
                {watermark.enabled && <>
                  <div className="flex flex-wrap gap-1">
                    {WATERMARK_PRESETS.map(p => (
                      <button key={p} onClick={() => setWatermark(w => ({ ...w, text: p }))}
                        className={`text-xs px-2 py-0.5 rounded-full border ${watermark.text === p ? 'bg-violet-600 text-white border-violet-600' : ''}`}
                        style={watermark.text !== p ? { borderColor: 'var(--border)', color: 'var(--text-body)' } : {}}>
                        {p}
                      </button>
                    ))}
                  </div>
                  <div><Lbl>Custom Text</Lbl><Inp value={watermark.text} onChange={e => setWatermark(w => ({ ...w, text: e.target.value }))} /></div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><Lbl>Opacity</Lbl><Inp type="number" value={watermark.opacity} min={0.05} max={1} step={0.05} onChange={e => setWatermark(w => ({ ...w, opacity: +e.target.value }))} /></div>
                    <div><Lbl>Rotation°</Lbl><Inp type="number" value={watermark.rotation} min={-180} max={180} onChange={e => setWatermark(w => ({ ...w, rotation: +e.target.value }))} /></div>
                  </div>
                </>}
              </Panel>
            </div>
          )}
        </aside>

        {/* ── Center canvas ── */}
        <div className="flex-1 overflow-auto py-8 px-4" style={{ background: '#e5e7eb' }}
          onClick={() => setSelectedId(null)}>
          <div className="mx-auto bg-white shadow-2xl relative" style={{ width: paperW, minHeight: '297mm', fontFamily: 'Arial, sans-serif' }}>

            {/* Watermark */}
            {watermark.enabled && (
              <div style={{
                position: 'absolute', inset: 0, display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                pointerEvents: 'none', zIndex: 1,
                transform: `rotate(${watermark.rotation}deg)`,
                fontSize: watermark.size, opacity: watermark.opacity,
                color: '#9ca3af', fontWeight: 'bold', userSelect: 'none',
              }}>
                {watermark.text}
              </div>
            )}

            {/* Header */}
            {header.show && (
              <div style={{
                paddingLeft: ml, paddingRight: mr, paddingTop: '12px', paddingBottom: '8px',
                borderBottom: header.border_bottom ? '1px solid #d1d5db' : 'none',
                textAlign: header.alignment, backgroundColor: header.background_color || '#fff',
                color: header.font_color || '#000', fontSize: header.font_size,
              }}>
                {header.company_name && <div style={{ fontWeight: 'bold', fontSize: (header.font_size || 12) + 2 }}>{header.company_name}</div>}
                {header.company_address && <div style={{ fontSize: (header.font_size || 12) - 1 }}>{header.company_address}</div>}
                {(header.company_email || header.company_phone) && (
                  <div style={{ fontSize: (header.font_size || 12) - 1, color: '#6b7280' }}>
                    {[header.company_email, header.company_phone].filter(Boolean).join('  |  ')}
                  </div>
                )}
              </div>
            )}

            {/* Blocks */}
            <div
              className="relative z-10"
              style={{ paddingTop: mt, paddingBottom: mb, paddingLeft: ml, paddingRight: mr }}
              onClick={e => e.stopPropagation()}
            >
              {preview ? (
                <div dangerouslySetInnerHTML={{ __html: getBodyHtml() }} style={{ fontSize: 13, lineHeight: 1.6, color: '#1f2937' }} />
              ) : (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={blocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-3 pl-7 pr-7">
                      {blocks.map(block => (
                        <SortableBlock
                          key={block.id}
                          block={block}
                          isSelected={selectedId === block.id}
                          onSelect={setSelectedId}
                          onChange={updateBlock}
                          onDelete={deleteBlock}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}

              {!preview && (
                <div className="flex justify-center mt-4 pl-7 pr-7">
                  <button
                    onClick={() => { setActivePanel('blocks') }}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl border-2 border-dashed text-sm transition-colors hover:border-violet-500 hover:text-violet-600"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                  >
                    <Plus className="w-4 h-4" /> Add Block
                  </button>
                </div>
              )}
            </div>

            {/* Footer */}
            {footer.show && (
              <div style={{
                paddingLeft: ml, paddingRight: mr, paddingBottom: '12px', paddingTop: '8px',
                borderTop: footer.border_top ? '1px solid #d1d5db' : 'none',
                textAlign: footer.alignment, fontSize: footer.font_size, color: footer.font_color,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span>{footer.show_date ? new Date().toLocaleDateString('en-US', { year:'numeric',month:'long',day:'numeric' }) : ''}</span>
                <span>{footer.text}{footer.confidential_label ? (footer.text ? '  |  CONFIDENTIAL' : 'CONFIDENTIAL') : ''}</span>
                <span>{footer.show_page_numbers ? 'Page 1' : ''}</span>
              </div>
            )}
          </div>
        </div>

        {/* ── Right panel: Block properties ── */}
        {!preview && (
          <aside className="w-52 flex-shrink-0 border-l overflow-y-auto"
            style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
            <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                Properties
              </p>
            </div>
            <PropsPanel
              block={selectedBlock}
              onChange={updateBlock}
              onDelete={deleteBlock}
            />
          </aside>
        )}
      </div>
    </div>
  )
}
