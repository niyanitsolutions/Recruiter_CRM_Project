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
  ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
  Bold, Italic, Underline, AlignLeft, AlignCenter,
  AlignRight, AlignJustify, List, ListOrdered, Link2, Palette, Type,
  Table, Image as ImageIcon, FileText, Minus as MinusIcon, RotateCcw,
  RotateCw, Hash, Quote, Layers, Columns, Stamp, Clock, CheckCircle,
  AlertCircle, QrCode, GripHorizontal, Maximize2, ZoomIn, ZoomOut, X,
  Download, Printer, Upload,
  PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen,
} from 'lucide-react'
import documentCenterService from '../../../services/documentCenterService'

// ─── Constants ────────────────────────────────────────────────────────────────
const PAGE_HEIGHTS    = { A4: 1122, letter: 1056, legal: 1369 }  // px at ~96dpi
const PAGE_WIDTHS_MM  = { A4: '210mm', letter: '216mm', legal: '216mm' }
const WATERMARK_PRESETS = ['DRAFT', 'CONFIDENTIAL', 'INTERNAL', 'APPROVED']
const FONT_FAMILIES = ['Arial', 'Times New Roman', 'Georgia', 'Courier New', 'Verdana', 'Helvetica']

const BLOCK_TYPES = [
  { type: 'heading1',    icon: Hash,      label: 'Heading 1',     group: 'Text' },
  { type: 'heading2',    icon: Hash,      label: 'Heading 2',     group: 'Text' },
  { type: 'heading3',    icon: Hash,      label: 'Heading 3',     group: 'Text' },
  { type: 'paragraph',   icon: AlignLeft, label: 'Paragraph',     group: 'Text' },
  { type: 'richtext',    icon: FileText,  label: 'Rich Text',     group: 'Text' },
  { type: 'quote',       icon: Quote,     label: 'Quote',         group: 'Text' },
  { type: 'bulletlist',  icon: List,      label: 'Bullet List',   group: 'Text' },
  { type: 'numberedlist',icon: ListOrdered, label: 'Numbered List', group: 'Text' },
  { type: 'divider',     icon: MinusIcon, label: 'Divider',       group: 'Layout' },
  { type: 'spacer',      icon: Columns,   label: 'Spacer',        group: 'Layout' },
  { type: 'pagebreak',   icon: Layers,    label: 'Page Break',    group: 'Layout' },
  { type: 'columns2',    icon: Columns,   label: '2 Columns',     group: 'Layout' },
  { type: 'columns3',    icon: Columns,   label: '3 Columns',     group: 'Layout' },
  { type: 'table',       icon: Table,     label: 'Table',         group: 'Data' },
  { type: 'image',       icon: ImageIcon, label: 'Image',         group: 'Media' },
  { type: 'signature',   icon: Stamp,     label: 'Signature',     group: 'Media' },
  { type: 'qrcode',      icon: QrCode,    label: 'QR Code',       group: 'Media' },
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
  { group: 'Employee',  label: 'Email',           field: '{{employee_email}}' },
  { group: 'Employee',  label: 'Phone',           field: '{{employee_phone}}' },
  { group: 'Company',   label: 'Company Name',    field: '{{company_name}}' },
  { group: 'Company',   label: 'Company Address', field: '{{company_address}}' },
  { group: 'Company',   label: 'GST Number',      field: '{{gst_number}}' },
  { group: 'Date',      label: 'Current Date',    field: '{{current_date}}' },
  { group: 'Date',      label: 'Month & Year',    field: '{{month_year}}' },
  { group: 'Date',      label: 'Current Year',    field: '{{current_year}}' },
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
  columns2:    () => ({ id: makeId(), type: 'columns2',    col1: 'Left column content', col2: 'Right column content', style: {} }),
  columns3:    () => ({ id: makeId(), type: 'columns3',    col1: 'Column 1', col2: 'Column 2', col3: 'Column 3', style: {} }),
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
  qrcode:      () => ({ id: makeId(), type: 'qrcode', value: '{{employee_id}}', size: 100, caption: '', style: {} }),
}

// ─── Block height estimator (for page distribution) ───────────────────────────
function estimateBlockHeight(block) {
  const h = {
    heading1: 56, heading2: 44, heading3: 34,
    paragraph: 48, richtext: 80,
    divider: 24, spacer: (block.height || 24) + 4,
    pagebreak: 0, // triggers new page
    table: Math.max((block.rows?.length || 3) * 38, 80) + 12,
    bulletlist: Math.max((block.items?.length || 3) * 28, 60) + 8,
    numberedlist: Math.max((block.items?.length || 3) * 28, 60) + 8,
    image: 220, signature: 90, quote: 64,
    columns2: 80, columns3: 80, qrcode: 130,
  }
  return (h[block.type] || 50) + 16
}

// ─── Page distributor ─────────────────────────────────────────────────────────
function distributeBlocksToPages(blocks, paper) {
  const pageH = PAGE_HEIGHTS[paper.size] || PAGE_HEIGHTS.A4
  // Content height = page height minus header/footer/margins (roughly)
  const contentH = pageH - (paper.margin_top + paper.margin_bottom) / 72 * 96 - 120
  const pages = [[]]
  let currentH = 0

  for (const block of blocks) {
    if (block.type === 'pagebreak') {
      if (pages[pages.length - 1].length > 0) {
        pages.push([])
        currentH = 0
      }
      continue
    }
    const bh = estimateBlockHeight(block)
    if (currentH + bh > contentH && pages[pages.length - 1].length > 0) {
      pages.push([])
      currentH = 0
    }
    pages[pages.length - 1].push(block)
    currentH += bh
  }

  return pages.filter(p => p.length > 0)
}

// ─── Block → HTML serializer ──────────────────────────────────────────────────
function blockToHtml(block) {
  const s = block.style || {}
  const align = s.textAlign ? `text-align:${s.textAlign};` : ''
  const color  = s.color    ? `color:${s.color};`           : ''
  const size   = s.fontSize ? `font-size:${s.fontSize}px;`  : ''
  const inline = `${align}${color}${size}`

  switch (block.type) {
    case 'heading1':     return `<h1 style="${inline}font-weight:bold;">${block.content || ''}</h1>`
    case 'heading2':     return `<h2 style="${inline}">${block.content || ''}</h2>`
    case 'heading3':     return `<h3 style="${inline}">${block.content || ''}</h3>`
    case 'paragraph':
    case 'richtext':     return `<p style="${inline}">${block.content || ''}</p>`
    case 'quote':        return `<blockquote style="border-left:4px solid #7c3aed;padding-left:12px;color:#6b7280;margin:8px 0;${inline}">${block.content || ''}</blockquote>`
    case 'bulletlist':   return `<ul style="${inline}">${(block.items || []).map(i => `<li>${i}</li>`).join('')}</ul>`
    case 'numberedlist': return `<ol style="${inline}">${(block.items || []).map(i => `<li>${i}</li>`).join('')}</ol>`
    case 'divider':      return `<hr style="border:none;border-top:${s.thickness || 2}px solid ${s.color || '#e5e7eb'};margin:12px 0;" />`
    case 'spacer':       return `<div style="height:${block.height || 24}px;"></div>`
    case 'pagebreak':    return `<div style="page-break-after:always;"></div>`
    case 'columns2':     return `<table style="width:100%;border-collapse:collapse;margin:8px 0;"><tr><td style="width:50%;padding:8px;vertical-align:top;">${block.col1 || ''}</td><td style="width:50%;padding:8px;vertical-align:top;">${block.col2 || ''}</td></tr></table>`
    case 'columns3':     return `<table style="width:100%;border-collapse:collapse;margin:8px 0;"><tr><td style="width:33%;padding:8px;vertical-align:top;">${block.col1 || ''}</td><td style="width:34%;padding:8px;vertical-align:top;">${block.col2 || ''}</td><td style="width:33%;padding:8px;vertical-align:top;">${block.col3 || ''}</td></tr></table>`
    case 'table': {
      const rows = block.rows || []
      const hdrBg = block.style?.headerBg || '#7c3aed'
      const bdr   = block.style?.borderColor || '#e5e7eb'
      return `<table border="1" style="width:100%;border-collapse:collapse;margin:8px 0;">
        ${rows.map((row, ri) => `<tr>${row.map(cell =>
          ri === 0
            ? `<th style="background:${hdrBg};color:white;padding:8px;border:1px solid ${bdr};">${cell}</th>`
            : `<td style="padding:8px;border:1px solid ${bdr};${ri % 2 === 0 ? 'background:#f9fafb;' : ''}">${cell}</td>`
        ).join('')}</tr>`).join('')}
      </table>`
    }
    case 'image':     return block.src ? `<img src="${block.src}" alt="${block.alt || ''}" style="width:${block.width || '100%'};max-width:100%;" />` : ''
    case 'signature': {
      const sigs = block.signers || []
      return `<table style="width:100%;margin:16px 0;border-collapse:collapse;"><tr>${sigs.map(sig =>
        `<td style="width:${100/sigs.length}%;padding:8px;vertical-align:bottom;"><div style="border-top:2px solid #1f2937;padding-top:4px;font-size:11px;color:#374151;">${sig.label}<br>Name: ${sig.name || '____________'}<br>Date: ____________</div></td>`
      ).join('<td style="width:20px;"></td>')}</tr></table>`
    }
    case 'qrcode':    return `<div style="text-align:center;padding:8px;"><div style="display:inline-block;border:1px solid #e5e7eb;padding:8px;"><div style="width:${block.size || 100}px;height:${block.size || 100}px;background:#f3f4f6;display:flex;align-items:center;justify-content:center;font-size:10px;color:#6b7280;">[QR: ${block.value || ''}]</div>${block.caption ? `<p style="font-size:10px;text-align:center;color:#6b7280;margin-top:4px;">${block.caption}</p>` : ''}</div></div>`
    default: return ''
  }
}

function blocksToHtml(blocks) {
  return blocks.map(blockToHtml).join('\n')
}

// ─── Shared UI ─────────────────────────────────────────────────────────────────
const Panel = ({ title, children, open, onToggle }) => (
  <div className="border-b" style={{ borderColor: 'var(--border)' }}>
    <button type="button" onClick={onToggle}
      className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold uppercase tracking-wider"
      style={{ color: 'var(--text-muted)' }}>
      {title}
      {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
    </button>
    {open && <div className="px-4 pb-4 space-y-3">{children}</div>}
  </div>
)

const Lbl = ({ children }) => <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>{children}</p>
const Inp = (props) => (
  <input {...props} className="w-full px-2.5 py-1.5 text-sm rounded-lg border focus:outline-none focus:ring-1 focus:ring-accent-500"
    style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)', color: 'var(--text-body)' }} />
)
const Sel = ({ children, ...props }) => (
  <select {...props} className="w-full px-2.5 py-1.5 text-sm rounded-lg border focus:outline-none focus:ring-1 focus:ring-accent-500"
    style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)', color: 'var(--text-body)' }}>
    {children}
  </select>
)
const Tog = ({ label, checked, onChange }) => (
  <label className="flex items-center gap-2 cursor-pointer">
    <div onClick={() => onChange(!checked)}
      className={`w-9 h-5 rounded-full transition-colors relative flex-shrink-0 ${checked ? 'bg-accent-600' : 'bg-gray-300 dark:bg-gray-600'}`}>
      <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
    </div>
    <span className="text-xs" style={{ color: 'var(--text-body)' }}>{label}</span>
  </label>
)

// ─── Block renderers ───────────────────────────────────────────────────────────
function BlockRenderer({ block, isSelected, onSelect, onChange, onDelete }) {
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
      <div onClick={() => onSelect(block.id)} className={`py-2 cursor-pointer ${isSelected ? 'ring-2 ring-accent-500 ring-inset rounded' : ''}`}>
        <hr style={{ border: 'none', borderTop: `${s.thickness || 2}px solid ${s.color || '#e5e7eb'}` }} />
      </div>
    )
  }

  if (block.type === 'spacer') {
    return (
      <div onClick={() => onSelect(block.id)} className={`relative cursor-pointer ${isSelected ? 'ring-2 ring-accent-500 ring-inset rounded' : ''}`}
        style={{ height: block.height || 24, background: isSelected ? 'rgba(22,124,251,0.05)' : 'transparent' }}>
        {isSelected && <span className="absolute inset-0 flex items-center justify-center text-xs text-accent-400">Spacer ({block.height || 24}px)</span>}
      </div>
    )
  }

  if (block.type === 'pagebreak') {
    return (
      <div onClick={() => onSelect(block.id)}
        className={`py-3 text-center cursor-pointer ${isSelected ? 'ring-2 ring-accent-500 ring-inset rounded' : ''}`}
        style={{ borderTop: '2px dashed #d1d5db', borderBottom: '2px dashed #d1d5db', margin: '4px 0' }}>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>— Page Break —</span>
      </div>
    )
  }

  if (block.type === 'qrcode') {
    return (
      <div onClick={() => onSelect(block.id)} className={`text-center py-2 ${isSelected ? 'ring-2 ring-accent-500 ring-inset rounded' : ''}`}>
        <div className="inline-flex flex-col items-center gap-1">
          <div className="flex items-center justify-center border rounded"
            style={{ width: block.size || 100, height: block.size || 100, background: '#f3f4f6', borderColor: '#e5e7eb' }}>
            <QrCode className="w-8 h-8 text-gray-400" />
          </div>
          <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
            {block.value || '{{employee_id}}'}
          </span>
          {block.caption && <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{block.caption}</span>}
        </div>
      </div>
    )
  }

  if (block.type === 'columns2') {
    return (
      <div onClick={() => onSelect(block.id)} className={`${isSelected ? 'ring-2 ring-accent-500 ring-inset rounded' : ''}`}>
        <div className="grid grid-cols-2 gap-4 border rounded p-2" style={{ borderColor: isSelected ? '#167CFB' : '#e5e7eb', borderStyle: 'dashed' }}>
          {['col1', 'col2'].map((col, i) => (
            <div key={col}
              contentEditable
              suppressContentEditableWarning
              onBlur={e => onChange({ ...block, [col]: e.target.innerHTML })}
              className="min-h-[40px] p-1 rounded text-sm outline-none"
              style={{ background: 'rgba(22,124,251,0.03)', color: 'var(--text-body)' }}
              dangerouslySetInnerHTML={{ __html: block[col] || `Column ${i + 1}` }}
            />
          ))}
        </div>
        {isSelected && <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>2-column layout — click each column to edit</p>}
      </div>
    )
  }

  if (block.type === 'columns3') {
    return (
      <div onClick={() => onSelect(block.id)} className={`${isSelected ? 'ring-2 ring-accent-500 ring-inset rounded' : ''}`}>
        <div className="grid grid-cols-3 gap-3 border rounded p-2" style={{ borderColor: isSelected ? '#167CFB' : '#e5e7eb', borderStyle: 'dashed' }}>
          {['col1', 'col2', 'col3'].map((col, i) => (
            <div key={col}
              contentEditable
              suppressContentEditableWarning
              onBlur={e => onChange({ ...block, [col]: e.target.innerHTML })}
              className="min-h-[40px] p-1 rounded text-sm outline-none"
              style={{ background: 'rgba(22,124,251,0.03)', color: 'var(--text-body)' }}
              dangerouslySetInnerHTML={{ __html: block[col] || `Column ${i + 1}` }}
            />
          ))}
        </div>
        {isSelected && <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>3-column layout — click each column to edit</p>}
      </div>
    )
  }

  if (block.type === 'table') {
    const rows = block.rows || []
    const hdrBg = block.style?.headerBg || '#7c3aed'
    const bdr = block.style?.borderColor || '#e5e7eb'
    return (
      <div onClick={() => onSelect(block.id)} className={`overflow-x-auto ${isSelected ? 'ring-2 ring-accent-500 ring-inset rounded' : ''}`}>
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
                      padding: '7px 10px', border: `1px solid ${bdr}`,
                      color: ri === 0 ? 'white' : '#1f2937',
                      fontWeight: ri === 0 ? 'bold' : 'normal',
                      fontSize: 13, minWidth: 80,
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
              { label: '+ Row',    fn: () => onChange({ ...block, rows: [...rows, Array(rows[0]?.length || 1).fill('')] }) },
              { label: '+ Column', fn: () => onChange({ ...block, rows: rows.map(r => [...r, '']) }) },
              { label: '- Row',    fn: () => rows.length > 1 && onChange({ ...block, rows: rows.slice(0, -1) }) },
              { label: '- Column', fn: () => rows[0]?.length > 1 && onChange({ ...block, rows: rows.map(r => r.slice(0, -1)) }) },
            ].map(btn => (
              <button key={btn.label} onClick={e => { e.stopPropagation(); btn.fn() }}
                className="text-xs px-2 py-1 rounded border hover:bg-accent-50 dark:hover:bg-accent-900/20"
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
      <div onClick={() => onSelect(block.id)} className={`${isSelected ? 'ring-2 ring-accent-500 ring-inset rounded' : ''}`}>
        {block.src ? (
          <img src={block.src} alt={block.alt || 'image'} style={{ width: block.width || '100%', maxWidth: '100%' }} />
        ) : (
          <label className="flex flex-col items-center justify-center py-8 rounded-lg border-2 border-dashed cursor-pointer hover:bg-accent-50 dark:hover:bg-accent-900/20"
            style={{ borderColor: 'var(--border)' }}>
            <ImageIcon className="w-8 h-8 mb-2" style={{ color: 'var(--text-muted)' }} />
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Click to upload image</p>
            <input type="file" accept="image/*" className="sr-only"
              onChange={e => {
                const file = e.target.files[0]
                if (!file) return
                const reader = new FileReader()
                reader.onload = ev => onChange({ ...block, src: ev.target.result })
                reader.readAsDataURL(file)
              }} />
          </label>
        )}
      </div>
    )
  }

  if (block.type === 'signature') {
    const sigs = block.signers || []
    return (
      <div onClick={() => onSelect(block.id)} className={`${isSelected ? 'ring-2 ring-accent-500 ring-inset rounded' : ''}`}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            <tr>
              {sigs.map((sig, i) => (
                <td key={i} style={{ padding: '8px', verticalAlign: 'bottom', width: `${100 / sigs.length}%` }}>
                  <div style={{ borderTop: '2px solid #1f2937', paddingTop: 4, fontSize: 12, color: '#374151' }}>
                    <span contentEditable suppressContentEditableWarning
                      onBlur={e => { const ns = sigs.map((s,si) => si===i ? {...s, label: e.target.textContent} : s); onChange({...block, signers: ns}) }}
                      style={{ fontWeight: 'bold', display: 'block' }}>
                      {sig.label}
                    </span>
                    Name: <span contentEditable suppressContentEditableWarning
                      onBlur={e => { const ns = sigs.map((s,si) => si===i ? {...s, name: e.target.textContent} : s); onChange({...block, signers: ns}) }}>
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
      <div onClick={() => onSelect(block.id)} className={`${isSelected ? 'ring-2 ring-accent-500 ring-inset rounded' : ''}`}>
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
              className="text-xs px-2 py-1 rounded border hover:bg-accent-50"
              style={{ borderColor: 'var(--border)', color: 'var(--text-body)' }}>+ Item</button>
            <button onClick={e => { e.stopPropagation(); (block.items || []).length > 1 && onChange({ ...block, items: block.items.slice(0, -1) }) }}
              className="text-xs px-2 py-1 rounded border hover:bg-red-50 text-red-500"
              style={{ borderColor: 'var(--border)' }}>- Item</button>
          </div>
        )}
      </div>
    )
  }

  if (block.type === 'quote') {
    return (
      <div onClick={() => onSelect(block.id)} className={`${isSelected ? 'ring-2 ring-accent-500 ring-inset rounded' : ''}`}
        style={{ borderLeft: '4px solid #7c3aed', paddingLeft: 12, margin: '4px 0' }}>
        <p contentEditable suppressContentEditableWarning
          onBlur={e => onChange({ ...block, content: e.target.innerHTML })}
          style={{ ...baseStyle, color: '#6b7280', fontStyle: 'italic' }}
          dangerouslySetInnerHTML={{ __html: block.content || 'Quote text…' }} />
      </div>
    )
  }

  // Text blocks
  const tagMap  = { heading1: 'h1', heading2: 'h2', heading3: 'h3', paragraph: 'p', richtext: 'div' }
  const Tag     = tagMap[block.type] || 'p'
  const sizeMap = { heading1: 28, heading2: 22, heading3: 17, paragraph: 13, richtext: 13 }
  const fwMap   = { heading1: 'bold', heading2: 'bold', heading3: '600', paragraph: 'normal', richtext: 'normal' }

  return (
    <div onClick={() => onSelect(block.id)} className={`${isSelected ? 'ring-2 ring-accent-500 ring-inset rounded p-0.5' : ''}`}>
      <Tag
        contentEditable
        suppressContentEditableWarning
        onFocus={() => onSelect(block.id)}
        onBlur={e => onChange({ ...block, content: e.target.innerHTML })}
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
      <div {...attributes} {...listeners}
        className="absolute -left-7 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing z-10 p-1"
        title="Drag to reorder">
        <GripVertical className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
      </div>
      <BlockRenderer
        block={block}
        isSelected={isSelected}
        onSelect={onSelect}
        onChange={onChange}
        onDelete={onDelete}
      />
      {isSelected && (
        <button
          onClick={e => { e.stopPropagation(); onDelete(block.id) }}
          className="absolute -right-7 top-1/2 -translate-y-1/2 p-1 rounded text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 z-10"
          title="Delete block">
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
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Select a block to edit properties</p>
      </div>
    )
  }

  const s = block.style || {}
  const setStyle = (key, val) => onChange({ ...block, style: { ...s, [key]: val } })

  return (
    <div className="p-4 space-y-4 overflow-y-auto">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
          {BLOCK_TYPES.find(b => b.type === block.type)?.label || block.type}
        </p>
        <button onClick={() => onDelete(block.id)}
          className="p-1 rounded text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Text blocks */}
      {['heading1','heading2','heading3','paragraph','richtext','quote'].includes(block.type) && (
        <>
          <div>
            <Lbl>Font Size (px)</Lbl>
            <Inp type="number" value={s.fontSize || ''} min={8} max={72} placeholder="Default"
              onChange={e => setStyle('fontSize', e.target.value ? +e.target.value : undefined)} />
          </div>
          <div>
            <Lbl>Font Family</Lbl>
            <Sel value={s.fontFamily || 'Arial'} onChange={e => setStyle('fontFamily', e.target.value)}>
              {FONT_FAMILIES.map(f => <option key={f} value={f}>{f}</option>)}
            </Sel>
          </div>
          <div>
            <Lbl>Text Color</Lbl>
            <input type="color" value={s.color || '#1f2937'} onChange={e => setStyle('color', e.target.value)}
              className="w-full h-8 rounded-lg border cursor-pointer" style={{ borderColor: 'var(--border)' }} />
          </div>
          <div>
            <Lbl>Alignment</Lbl>
            <div className="flex gap-1">
              {['left','center','right','justify'].map(a => (
                <button key={a} onClick={() => setStyle('textAlign', a)}
                  className={`flex-1 py-1 rounded text-xs border transition-colors ${s.textAlign === a ? 'bg-accent-600 text-white border-accent-600' : ''}`}
                  style={s.textAlign !== a ? { borderColor: 'var(--border)', color: 'var(--text-body)' } : {}}>
                  {a.charAt(0).toUpperCase() + a.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-3 flex-wrap">
            <Tog label="Bold"      checked={!!s.bold}      onChange={v => setStyle('bold', v)} />
            <Tog label="Italic"    checked={!!s.italic}    onChange={v => setStyle('italic', v)} />
            <Tog label="Underline" checked={!!s.underline} onChange={v => setStyle('underline', v)} />
          </div>
          <div>
            <Lbl>Line Height</Lbl>
            <Inp type="number" value={s.lineHeight || 1.6} min={1} max={4} step={0.1}
              onChange={e => setStyle('lineHeight', +e.target.value)} />
          </div>
        </>
      )}

      {block.type === 'divider' && (
        <>
          <div>
            <Lbl>Color</Lbl>
            <input type="color" value={s.color || '#e5e7eb'} onChange={e => setStyle('color', e.target.value)}
              className="w-full h-8 rounded-lg border cursor-pointer" style={{ borderColor: 'var(--border)' }} />
          </div>
          <div><Lbl>Thickness (px)</Lbl>
            <Inp type="number" value={s.thickness || 2} min={1} max={10} onChange={e => setStyle('thickness', +e.target.value)} />
          </div>
        </>
      )}

      {block.type === 'spacer' && (
        <div><Lbl>Height (px)</Lbl>
          <Inp type="number" value={block.height || 24} min={4} max={300}
            onChange={e => onChange({ ...block, height: +e.target.value })} />
        </div>
      )}

      {block.type === 'table' && (
        <>
          <div><Lbl>Header Background</Lbl>
            <input type="color" value={s.headerBg || '#7c3aed'} onChange={e => setStyle('headerBg', e.target.value)}
              className="w-full h-8 rounded-lg border cursor-pointer" style={{ borderColor: 'var(--border)' }} />
          </div>
          <div><Lbl>Border Color</Lbl>
            <input type="color" value={s.borderColor || '#e5e7eb'} onChange={e => setStyle('borderColor', e.target.value)}
              className="w-full h-8 rounded-lg border cursor-pointer" style={{ borderColor: 'var(--border)' }} />
          </div>
        </>
      )}

      {block.type === 'image' && (
        <>
          {block.src && (
            <div className="mb-2">
              <img src={block.src} alt={block.alt} style={{ maxWidth: '100%', maxHeight: 80, borderRadius: 4 }} />
            </div>
          )}
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
          <div><Lbl>Alt Text</Lbl>
            <Inp value={block.alt || ''} onChange={e => onChange({ ...block, alt: e.target.value })} placeholder="Image description" />
          </div>
          {block.src && (
            <button onClick={() => onChange({ ...block, src: '' })}
              className="w-full text-xs py-1.5 rounded border text-red-500 hover:bg-red-50"
              style={{ borderColor: '#fca5a5' }}>
              Remove Image
            </button>
          )}
        </>
      )}

      {block.type === 'qrcode' && (
        <>
          <div><Lbl>QR Value</Lbl>
            <Inp value={block.value || ''} onChange={e => onChange({ ...block, value: e.target.value })} placeholder="{{employee_id}}" />
          </div>
          <div><Lbl>Size (px)</Lbl>
            <Inp type="number" value={block.size || 100} min={60} max={300} onChange={e => onChange({ ...block, size: +e.target.value })} />
          </div>
          <div><Lbl>Caption</Lbl>
            <Inp value={block.caption || ''} onChange={e => onChange({ ...block, caption: e.target.value })} placeholder="Scan to verify" />
          </div>
        </>
      )}

      {(block.type === 'columns2' || block.type === 'columns3') && (
        <div className="text-xs p-2 rounded" style={{ background: 'var(--bg-primary)', color: 'var(--text-muted)' }}>
          Click directly on the columns in the canvas to edit their content.
        </div>
      )}
    </div>
  )
}

// ─── Horizontal Ruler ─────────────────────────────────────────────────────────
function Ruler({ width }) {
  const steps = Math.floor(width / 10)
  return (
    <div className="flex-shrink-0 overflow-hidden select-none" style={{ height: 20, background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
      <div className="relative" style={{ width, height: 20 }}>
        {Array.from({ length: steps }, (_, i) => (
          <div key={i} className="absolute bottom-0" style={{ left: i * 10, width: 1, background: 'var(--border)', height: i % 10 === 0 ? 12 : 6 }} />
        ))}
        {Array.from({ length: Math.floor(steps / 10) }, (_, i) => (
          <span key={i} className="absolute text-[8px]" style={{ left: i * 100 + 2, top: 2, color: 'var(--text-muted)' }}>
            {(i * 100 / 96 * 25.4).toFixed(0)}mm
          </span>
        ))}
      </div>
    </div>
  )
}

// ─── Fullscreen Preview ────────────────────────────────────────────────────────
function FullPreview({ blocks, header, footer, paper, watermark, onClose }) {
  const [zoom, setZoom] = useState(100)
  const html = blocksToHtml(blocks)
  const paperW = paper.size === 'A4' ? (paper.orientation === 'landscape' ? '297mm' : '210mm')
               : paper.size === 'letter' ? (paper.orientation === 'landscape' ? '279mm' : '216mm')
               : (paper.orientation === 'landscape' ? '356mm' : '216mm')
  const ml = paper.margin_left / 72 * 25.4 + 'mm'
  const mr = paper.margin_right / 72 * 25.4 + 'mm'
  const mt = paper.margin_top  / 72 * 25.4 + 'mm'
  const mb = paper.margin_bottom / 72 * 25.4 + 'mm'

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'rgba(0,0,0,0.85)' }}>
      <div className="flex items-center gap-3 px-4 py-2.5 flex-shrink-0"
        style={{ background: '#1e1e2e', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <span className="text-white text-sm font-semibold flex-1">Preview — Advanced Designer</span>
        <div className="flex items-center gap-2">
          <button onClick={() => setZoom(z => Math.max(50, z - 25))} className="p-1.5 rounded text-white hover:bg-white/10"><ZoomOut className="w-4 h-4" /></button>
          <span className="text-white text-xs w-10 text-center">{zoom}%</span>
          <button onClick={() => setZoom(z => Math.min(200, z + 25))} className="p-1.5 rounded text-white hover:bg-white/10"><ZoomIn className="w-4 h-4" /></button>
        </div>
        <button onClick={onClose} className="p-1.5 rounded text-white hover:bg-white/10"><X className="w-4 h-4" /></button>
      </div>
      <div className="flex-1 overflow-auto py-8 px-4 flex justify-center" style={{ background: '#2d2d3d' }}>
        <div style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top center', transition: 'transform 0.2s' }}>
          <div className="bg-white shadow-2xl relative" style={{ width: paperW, minHeight: '297mm', fontFamily: 'Arial, sans-serif' }}>
            {watermark.enabled && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                pointerEvents: 'none', zIndex: 1, transform: `rotate(${watermark.rotation}deg)`,
                fontSize: watermark.size, opacity: watermark.opacity, color: '#9ca3af', fontWeight: 'bold', userSelect: 'none' }}>
                {watermark.text}
              </div>
            )}
            {(() => {
              const hv = header.show || !!(header.logo_url || header.company_name)
              if (!hv) return null
              const lay  = header.header_layout || 'company_left_logo_right'
              const fs   = header.font_size || 12
              const tc   = header.font_color || '#000'
              const padL = Math.max(32, header.padding_left ?? 32)
              const padR = Math.max(32, header.padding_right ?? 32)
              const isCen = lay === 'logo_top_company_bottom' || lay === 'company_top_logo_bottom'
              const ca   = isCen ? 'center' : (header.company_alignment || 'left')
              const st   = {
                paddingLeft: padL, paddingRight: padR, paddingTop: header.padding_top ?? 12, paddingBottom: header.padding_bottom ?? 8,
                borderBottom: header.show && header.border_bottom ? `1px solid ${header.border_color||'#d1d5db'}` : 'none',
                backgroundColor: header.show ? (header.background_color || '#fff') : 'transparent',
                color: tc, fontSize: fs, fontFamily: header.font_family || 'Arial', minHeight: `${header.header_height||120}px`, boxSizing: 'border-box',
              }
              const logoEl = header.logo_url ? <img src={header.logo_url} style={{ height: header.logo_height||40, display: 'block', objectFit: 'contain', flexShrink: 0 }} alt="Logo" /> : null
              const compEl = (header.company_name || header.company_address) ? (
                <div style={{ lineHeight: 1.4 }}>
                  {header.company_name && <div style={{ fontWeight: 'bold', fontSize: fs+2, textAlign: ca }}>{header.company_name}</div>}
                  {header.company_address && <div style={{ fontSize: fs-1, textAlign: ca }}>{header.company_address}</div>}
                </div>
              ) : null
              if (lay === 'logo_only')        return <div style={{ ...st, display: 'flex', alignItems: 'center' }}>{logoEl}</div>
              if (lay === 'company_only')     return <div style={{ ...st, display: 'flex', alignItems: 'center' }}>{compEl}</div>
              if (lay === 'logo_top_company_bottom') return <div style={{ ...st, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>{logoEl}{compEl}</div>
              if (lay === 'company_top_logo_bottom') return <div style={{ ...st, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>{compEl}{logoEl}</div>
              if (lay === 'logo_left_company_right') return <div style={{ ...st, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>{logoEl}{compEl}</div>
              return <div style={{ ...st, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>{compEl}{logoEl}</div>
            })()}
            <div style={{ paddingTop: mt, paddingBottom: mb, paddingLeft: ml, paddingRight: mr, fontSize: 13, lineHeight: 1.6, color: '#1f2937', position: 'relative', zIndex: 2 }}
              dangerouslySetInnerHTML={{ __html: html }} />
            {footer.show && (
              <div style={{ paddingLeft: ml, paddingRight: mr, paddingBottom: '12px', paddingTop: '8px',
                borderTop: footer.border_top ? '1px solid #d1d5db' : 'none',
                fontSize: footer.font_size, color: footer.font_color,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{footer.show_date ? new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : ''}</span>
                <span>{footer.text}{footer.confidential_label ? ' | CONFIDENTIAL' : ''}</span>
                <span>{footer.show_page_numbers ? 'Page 1' : ''}</span>
              </div>
            )}
          </div>
        </div>
      </div>
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
  const [showFullPreview, setShowFullPreview] = useState(false)
  const [autoSaveStatus, setAutoSaveStatus]   = useState('saved')
  const [showExport, setShowExport] = useState(false)
  const exportRef = useRef(null)
  const autoSaveTimer = useRef(null)

  // Panel state
  const [leftWidth,  setLeftWidth]  = useState(() => parseInt(localStorage.getItem('ad_left_w')  || '240'))
  const [rightWidth, setRightWidth] = useState(() => parseInt(localStorage.getItem('ad_right_w') || '260'))
  const [leftCollapsed,  setLeftCollapsed]  = useState(() => localStorage.getItem('ad_left_col')  === 'true')
  const [rightCollapsed, setRightCollapsed] = useState(() => localStorage.getItem('ad_right_col') === 'true')
  const [openSection, setOpenSection] = useState('blocks')
  const toggleSection = (key) => setOpenSection(k => k === key ? null : key)
  const toggleLeftPanel  = () => setLeftCollapsed(v  => { const n = !v; localStorage.setItem('ad_left_col',  n); return n })
  const toggleRightPanel = () => setRightCollapsed(v => { const n = !v; localStorage.setItem('ad_right_col', n); return n })

  const [name,        setName]        = useState('Untitled Template')
  const [description, setDescription] = useState('')
  const [categoryId,  setCategoryId]  = useState('')
  const [tags,        setTags]        = useState('')
  const [categories,  setCategories]  = useState([])

  const [blocks,     setBlocks]     = useState([DEFAULT_BLOCKS.heading1(), DEFAULT_BLOCKS.paragraph()])
  const [selectedId, setSelectedId] = useState(null)
  const historyRef  = useRef([[DEFAULT_BLOCKS.heading1(), DEFAULT_BLOCKS.paragraph()]])
  const historyIdx  = useRef(0)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  // activePanel removed — now using openSection accordion

  const pushHistory = useCallback((newBlocks) => {
    const hist = historyRef.current.slice(0, historyIdx.current + 1)
    hist.push(newBlocks)
    if (hist.length > 50) hist.shift()
    historyRef.current = hist
    historyIdx.current = hist.length - 1
    setCanUndo(historyIdx.current > 0)
    setCanRedo(false)
  }, [])

  const handleUndo = useCallback(() => {
    if (historyIdx.current <= 0) return
    historyIdx.current -= 1
    const prev = historyRef.current[historyIdx.current]
    setBlocks(prev)
    setCanUndo(historyIdx.current > 0)
    setCanRedo(true)
  }, [])

  const handleRedo = useCallback(() => {
    if (historyIdx.current >= historyRef.current.length - 1) return
    historyIdx.current += 1
    const next = historyRef.current[historyIdx.current]
    setBlocks(next)
    setCanUndo(true)
    setCanRedo(historyIdx.current < historyRef.current.length - 1)
  }, [])

  const [header, setHeader] = useState({
    show: true,
    header_layout: 'company_left_logo_right',
    header_spacing: 20,
    logo_url: '', logo_height: 40,
    logo_alignment: 'left', company_alignment: 'left',
    header_height: 120,
    padding_top: 12, padding_right: 32, padding_bottom: 8, padding_left: 32,
    margin_top: 0, margin_right: 0, margin_bottom: 0, margin_left: 0,
    company_name: '', company_address: '', company_email: '',
    company_phone: '', company_website: '', gst_number: '', reg_number: '',
    font_family: 'Arial', font_size: 12, font_color: '#000000',
    background_color: '#ffffff', border_bottom: true, border_color: '#d1d5db', border_width: 1,
  })
  const [footer, setFooter] = useState({
    show: true, text: '', description: '', show_page_numbers: true, show_date: true,
    confidential_label: false, alignment: 'center', font_size: 10,
    font_color: '#666666', border_top: true, border_color: '#d1d5db', border_width: 1,
    footer_height: 60,
    padding_top: 8, padding_right: 16, padding_bottom: 12, padding_left: 16,
    margin_top: 0, margin_right: 0, margin_bottom: 0, margin_left: 0,
  })
  const [paper, setPaper] = useState({
    size: 'A4', orientation: 'portrait',
    margin_top: 72, margin_bottom: 72, margin_left: 72, margin_right: 72,
  })
  const [watermark, setWatermark] = useState({
    enabled: false, type: 'text', text: 'CONFIDENTIAL', opacity: 0.12, rotation: -45, size: 72,
  })

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  useEffect(() => {
    documentCenterService.listCategories().then(r => setCategories(r.data?.data || [])).catch(() => {})
  }, [])

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
          if (t.content.canvas_elements?.length > 0) {
            setBlocks(t.content.canvas_elements)
          } else if (t.content.body_html) {
            setBlocks([{ id: makeId(), type: 'richtext', content: t.content.body_html, style: {} }])
          }
        }
        setAutoSaveStatus('saved')
      })
      .catch(() => toast.error('Failed to load template'))
      .finally(() => setLoading(false))
  }, [id])

  const selectedBlock = useMemo(() => blocks.find(b => b.id === selectedId), [blocks, selectedId])

  // Auto-save
  const scheduleAutoSave = useCallback(() => {
    if (!id) return
    setAutoSaveStatus('unsaved')
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(async () => {
      setAutoSaveStatus('saving')
      try {
        const html = blocksToHtml(blocks)
        const payload = {
          name, description,
          category_id: categoryId || null,
          template_type: 'advanced',
          tags: tags.split(',').map(t => t.trim()).filter(Boolean),
          change_summary: 'Auto-saved',
          content: { header, body_html: html, footer, paper, watermark, canvas_elements: blocks },
          dynamic_fields: [...new Set([...html.matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]))],
        }
        await documentCenterService.updateTemplate(id, payload)
        setAutoSaveStatus('saved')
      } catch {
        setAutoSaveStatus('error')
      }
    }, 3000)
  }, [id, name, description, categoryId, tags, header, footer, paper, watermark, blocks])

  useEffect(() => { scheduleAutoSave() }, [header, footer, paper, watermark, name, description, categoryId, tags])

  const addBlock = useCallback((type) => {
    const factory = DEFAULT_BLOCKS[type]
    if (!factory) return
    const newBlock = factory()
    setBlocks(prev => {
      const next = [...prev, newBlock]
      pushHistory(next)
      return next
    })
    setSelectedId(newBlock.id)
    scheduleAutoSave()
  }, [scheduleAutoSave, pushHistory])

  const updateBlock = useCallback((updated) => {
    setBlocks(prev => {
      const next = prev.map(b => b.id === updated.id ? updated : b)
      pushHistory(next)
      return next
    })
    scheduleAutoSave()
  }, [scheduleAutoSave, pushHistory])

  const deleteBlock = useCallback((blockId) => {
    setBlocks(prev => {
      const next = prev.filter(b => b.id !== blockId)
      const result = next.length ? next : [DEFAULT_BLOCKS.paragraph()]
      pushHistory(result)
      return result
    })
    if (selectedId === blockId) setSelectedId(null)
  }, [selectedId, pushHistory])

  const handleDragEnd = useCallback(({ active, over }) => {
    if (!over || active.id === over.id) return
    setBlocks(prev => {
      const oi = prev.findIndex(b => b.id === active.id)
      const ni = prev.findIndex(b => b.id === over.id)
      const next = arrayMove(prev, oi, ni)
      pushHistory(next)
      return next
    })
    scheduleAutoSave()
  }, [scheduleAutoSave, pushHistory])

  const insertField = (field) => {
    if (!selectedBlock || !['heading1','heading2','heading3','paragraph','richtext','quote'].includes(selectedBlock.type)) {
      toast('Select a text block first', { icon: '💡' })
      return
    }
    updateBlock({ ...selectedBlock, content: (selectedBlock.content || '') + field })
  }

  const getBodyHtml = () => blocksToHtml(blocks)

  const buildPayload = () => ({
    name, description,
    category_id: categoryId || null,
    template_type: 'advanced',
    tags: tags.split(',').map(t => t.trim()).filter(Boolean),
    change_summary: id ? 'Updated via Advanced Designer' : 'Created via Advanced Designer',
    content: {
      header, body_html: getBodyHtml(), footer, paper, watermark,
      canvas_elements: blocks,
    },
    dynamic_fields: [...new Set([...getBodyHtml().matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]))],
  })

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Template name is required'); return }
    setSaving(true)
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    try {
      if (id) {
        await documentCenterService.updateTemplate(id, buildPayload())
        toast.success('Template saved')
        setAutoSaveStatus('saved')
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

  // Logo upload
  const handleLogoUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { toast.error('Please select an image file'); return }
    const reader = new FileReader()
    reader.onload = (ev) => setHeader(h => ({ ...h, logo_url: ev.target.result }))
    reader.readAsDataURL(file)
  }

  // Close export dropdown on outside click
  useEffect(() => {
    const onOutside = (e) => { if (exportRef.current && !exportRef.current.contains(e.target)) setShowExport(false) }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [])

  // Keyboard shortcuts: Ctrl+Z undo, Ctrl+Y / Ctrl+Shift+Z redo
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); handleUndo() }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); handleRedo() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [handleUndo, handleRedo])

  // Export handlers
  const buildFullHtml = () => {
    const html = getBodyHtml()
    const hPt = `${header.padding_top??12}px ${header.padding_right??16}px ${header.padding_bottom??8}px ${header.padding_left??16}px`
    const fPt = `${footer.padding_top??8}px ${footer.padding_right??16}px ${footer.padding_bottom??12}px ${footer.padding_left??16}px`
    // Build header block with layout support
    const buildADHeaderHtml = (h) => {
      if (!h.show && !h.logo_url && !h.company_name) return ''
      const lay  = h.header_layout || 'company_left_logo_right'
      const padL = Math.max(32, h.padding_left  ?? 32)
      const padR = Math.max(32, h.padding_right ?? 32)
      const padT = h.padding_top    ?? 12
      const padB = h.padding_bottom ?? 8
      const fs   = h.font_size || 12
      const tc   = h.font_color || '#000'
      const isCen = lay === 'logo_top_company_bottom' || lay === 'company_top_logo_bottom'
      const ca   = isCen ? 'center' : (h.company_alignment || 'left')
      const border = h.show && h.border_bottom ? `border-bottom:${h.border_width??1}px solid ${h.border_color||'#d1d5db'};` : ''
      const bgStr  = h.show ? `background:${h.background_color||'#fff'};` : ''
      const base  = `padding:${padT}px ${padR}px ${padB}px ${padL}px;min-height:${h.header_height||120}px;${bgStr}color:${tc};font-family:${h.font_family||'Arial'},sans-serif;font-size:${fs}px;${border}box-sizing:border-box;`
      const logoHtml = h.logo_url ? `<img src="${h.logo_url}" style="height:${h.logo_height||40}px;object-fit:contain;display:block;flex-shrink:0;" />` : ''
      const compHtml = `<div style="line-height:1.4;">
        ${h.company_name ? `<div style="font-weight:bold;font-size:${fs+2}px;text-align:${ca};">${h.company_name}</div>` : ''}
        ${h.company_address ? `<div style="font-size:${fs-1}px;text-align:${ca};">${h.company_address}</div>` : ''}
      </div>`
      if (lay === 'logo_only')        return `<div style="${base}display:flex;align-items:center;">${logoHtml}</div>`
      if (lay === 'company_only')     return `<div style="${base}display:flex;align-items:center;">${compHtml}</div>`
      if (lay === 'logo_top_company_bottom') return `<div style="${base}display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;">${logoHtml}${compHtml}</div>`
      if (lay === 'company_top_logo_bottom') return `<div style="${base}display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;">${compHtml}${logoHtml}</div>`
      if (lay === 'logo_left_company_right') return `<div style="${base}display:flex;align-items:center;justify-content:space-between;gap:16px;">${logoHtml}${compHtml}</div>`
      return `<div style="${base}display:flex;align-items:center;justify-content:space-between;gap:16px;">${compHtml}${logoHtml}</div>`
    }

    const hSpacingPx = (header.show || header.logo_url || header.company_name) ? (header.header_spacing ?? 20) : 20

    return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
  body { margin: 0; font-family: Arial; font-size: 12pt; line-height: 1.6; color: #1f2937; }
  @media print { .no-print { display:none!important; } }
  table { border-collapse: collapse; width: 100%; page-break-inside: avoid; break-inside: avoid; }
  td,th { border: 1px solid #e5e7eb; padding: 6px 10px; }
  th { background: #7c3aed; color: white; }
  p { page-break-inside: avoid; break-inside: avoid; }
  ul,ol { page-break-inside: avoid; break-inside: avoid; }
  li { break-inside: avoid; }
  .doc-footer { color: ${footer.font_color}; font-size: ${footer.font_size}px; padding: ${fPt};
    border-top: ${footer.border_top ? `${footer.border_width??1}px solid ${footer.border_color||'#d1d5db'}` : 'none'};
    min-height: ${footer.footer_height||60}px; box-sizing: border-box; display: flex; justify-content: space-between; align-items: center; }
  .page-break { page-break-after: always; }
</style></head><body>
${buildADHeaderHtml(header)}
<div style="padding: ${hSpacingPx}px 20px 20px;">${html}</div>
${footer.show ? `<div class="doc-footer">
  <span>${footer.show_date ? new Date().toLocaleDateString() : ''}</span>
  <span>${footer.text||''}${footer.confidential_label?' | CONFIDENTIAL':''}</span>
  <span>${footer.show_page_numbers ? 'Page 1' : ''}</span>
</div>` : ''}
</body></html>`
  }

  const handleExportHTML = () => {
    const blob = new Blob([buildFullHtml()], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `${name||'document'}.html`; a.click()
    URL.revokeObjectURL(url); setShowExport(false)
  }

  const handleExportTXT = () => {
    const txt = blocks.map(b => {
      if (b.type === 'bulletlist' || b.type === 'numberedlist') return (b.items||[]).join('\n')
      return b.content || b.col1 || ''
    }).join('\n\n').trim()
    const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `${name||'document'}.txt`; a.click()
    URL.revokeObjectURL(url); setShowExport(false)
  }

  const handlePrint = () => {
    const w = window.open('', '_blank')
    w.document.write(buildFullHtml()); w.document.close(); w.focus()
    setTimeout(() => { w.print(); w.close() }, 400); setShowExport(false)
  }

  const handleExportPDF = () => {
    setShowExport(false)
    const w = window.open('', '_blank')
    w.document.write(buildFullHtml())
    w.document.close(); w.focus()
    toast.success('Print dialog opening — choose "Save as PDF"')
    setTimeout(() => { w.print(); w.close() }, 500)
  }

  const handleExportDOCX = async () => {
    if (!id) { toast.error('Save the template first to export DOCX'); return }
    setShowExport(false)
    const toastId = toast.loading('Generating DOCX…')
    try {
      const r = await documentCenterService.generateDocument({
        template_id: id, document_name: name, generate_pdf: false, generate_docx: true, field_values: {},
      })
      const genId = r.data?.data?._id
      if (genId) { window.open(documentCenterService.downloadDOCX(genId), '_blank'); toast.success('DOCX ready', { id: toastId }) }
    } catch { toast.error('DOCX export failed', { id: toastId }) }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 animate-spin text-accent-600" />
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

  const fieldGroups   = HR_FIELDS.reduce((acc, f) => { if (!acc[f.group]) acc[f.group] = []; acc[f.group].push(f); return acc }, {})
  const blockGroups   = BLOCK_TYPES.reduce((acc, b) => { if (!acc[b.group]) acc[b.group] = []; acc[b.group].push(b); return acc }, {})

  // Distribute blocks to pages
  const pages = distributeBlocksToPages(blocks, paper)

  const AutoSaveIcon  = autoSaveStatus === 'saved' ? CheckCircle : autoSaveStatus === 'saving' ? Loader2 : autoSaveStatus === 'error' ? AlertCircle : Clock
  const autoSaveColor = autoSaveStatus === 'saved' ? 'text-green-500' : autoSaveStatus === 'error' ? 'text-red-400' : 'text-gray-400'
  const autoSaveLabel = { saved: 'Saved', saving: 'Saving…', unsaved: 'Unsaved', error: 'Error' }

  return (
    <div className="flex flex-col" style={{ height: '100%', minHeight: 0, overflow: 'hidden', background: 'var(--bg-primary)' }}>

      {/* ── Top bar ── */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b flex-shrink-0"
        style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
        <button onClick={() => navigate('/hrm/doc-center/templates')}
          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
          <ArrowLeft className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
        </button>
        <input value={name} onChange={e => { setName(e.target.value); scheduleAutoSave() }}
          className="flex-1 bg-transparent border-none outline-none text-sm font-semibold"
          style={{ color: 'var(--text-heading)' }} placeholder="Template Name" />

        {id && (
          <div className={`flex items-center gap-1 text-xs flex-shrink-0 ${autoSaveColor}`}>
            <AutoSaveIcon className={`w-3 h-3 ${autoSaveStatus === 'saving' ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{autoSaveLabel[autoSaveStatus]}</span>
          </div>
        )}

        <div className="flex items-center gap-2">
          <button onClick={handleUndo} disabled={!canUndo} title="Undo (Ctrl+Z)"
            className="p-1.5 rounded-lg border transition-colors hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40"
            style={{ borderColor: 'var(--border)', color: 'var(--text-body)' }}>
            <RotateCcw className="w-4 h-4" />
          </button>
          <button onClick={handleRedo} disabled={!canRedo} title="Redo (Ctrl+Y)"
            className="p-1.5 rounded-lg border transition-colors hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40"
            style={{ borderColor: 'var(--border)', color: 'var(--text-body)' }}>
            <RotateCw className="w-4 h-4" />
          </button>
          <div className="w-px h-5" style={{ background: 'var(--border)' }} />
          <button onClick={() => setShowFullPreview(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border"
            style={{ borderColor: 'var(--border)', color: 'var(--text-body)' }}>
            <Maximize2 className="w-4 h-4" /> <span className="hidden sm:inline">Preview</span>
          </button>
          <button onClick={() => setPreview(p => !p)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border ${preview ? 'bg-accent-600 text-white border-accent-600' : ''}`}
            style={preview ? {} : { borderColor: 'var(--border)', color: 'var(--text-body)' }}>
            <Eye className="w-4 h-4" />
            {preview ? 'Edit' : 'Quick View'}
          </button>

          {/* Export dropdown */}
          <div className="relative" ref={exportRef}>
            <button onClick={() => setShowExport(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border"
              style={{ borderColor: 'var(--border)', color: 'var(--text-body)' }}>
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Export</span>
              <ChevronDown className="w-3 h-3" />
            </button>
            {showExport && (
              <div className="absolute right-0 top-full mt-1 z-50 rounded-xl border shadow-xl overflow-hidden"
                style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', minWidth: 160 }}>
                {[
                  { label: 'Export PDF',  icon: FileText, fn: handleExportPDF  },
                  { label: 'Export DOCX', icon: FileText, fn: handleExportDOCX },
                  { label: 'Export HTML', icon: FileText, fn: handleExportHTML },
                  { label: 'Export TXT',  icon: FileText, fn: handleExportTXT  },
                  { label: 'Print',       icon: Printer,  fn: handlePrint      },
                ].map(item => (
                  <button key={item.label} onClick={item.fn}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-accent-50 dark:hover:bg-accent-900/20 transition-colors text-left"
                    style={{ color: 'var(--text-body)' }}>
                    <item.icon className="w-3.5 h-3.5 text-accent-500" />
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {id && (
            <button onClick={() => navigate(`/hrm/doc-center/generated?tmpl=${id}`)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border"
              style={{ borderColor: 'var(--border)', color: 'var(--text-body)' }}>
              <Wand2 className="w-4 h-4" /> Generate
            </button>
          )}
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-semibold text-white"
            style={{ background: 'linear-gradient(135deg, #167CFB, #0267F9)' }}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* ── Left panel ── */}
        <aside className="flex-shrink-0 border-r flex flex-col overflow-hidden transition-all duration-200"
          style={{ width: leftCollapsed ? 0 : leftWidth, minHeight: 0, background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>

          {/* Panel header with collapse button at top-right */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b flex-shrink-0"
            style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-md bg-accent-600 flex items-center justify-center">
                <Layers className="w-3 h-3 text-white" />
              </div>
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                Design Tools
              </span>
            </div>
            <button onClick={toggleLeftPanel} title="Collapse Panel"
              className="p-1.5 rounded-lg border transition-colors hover:bg-accent-600 hover:text-white hover:border-accent-600"
              style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
              <PanelLeftClose className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Scrollable left panel content */}
          <div className="flex-1 overflow-y-auto">

          <Panel title="Blocks" open={openSection === 'blocks'} onToggle={() => toggleSection('blocks')}>
            <div className="space-y-3">
              {Object.entries(blockGroups).map(([group, items]) => (
                <div key={group}>
                  <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>{group}</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {items.map(item => (
                      <button key={item.type} onClick={() => addBlock(item.type)}
                        className="flex items-center gap-2 px-2.5 py-2 rounded-lg border text-xs transition-colors hover:bg-accent-50 dark:hover:bg-accent-900/20 hover:border-accent-400 text-left"
                        style={{ borderColor: 'var(--border)', color: 'var(--text-body)' }}>
                        <item.icon className="w-3.5 h-3.5 flex-shrink-0 text-accent-500" />
                        <span className="truncate">{item.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          {/* Fields panel as accordion */}
          <Panel title="HR Fields" open={openSection === 'fields'} onToggle={() => toggleSection('fields')}>
            <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>Select a text block, then click a field</p>
            {Object.entries(fieldGroups).map(([group, fields]) => (
              <div key={group} className="mb-4">
                <p className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>{group}</p>
                <div className="flex flex-wrap gap-1">
                  {fields.map(f => (
                    <button key={f.field} onClick={() => insertField(f.field)}
                      className="text-[11px] px-2 py-0.5 rounded-full border font-mono transition-colors hover:bg-accent-600 hover:text-white hover:border-accent-600"
                      style={{ borderColor: 'var(--border)', color: 'var(--text-body)' }}>
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
          </Panel>

          <Panel title="Template Info" open={openSection === 'info'} onToggle={() => toggleSection('info')}>
            <div><Lbl>Description</Lbl>
              <textarea value={description} onChange={e => { setDescription(e.target.value); scheduleAutoSave() }} rows={2}
                className="w-full px-2.5 py-1.5 text-sm rounded-lg border resize-none focus:outline-none focus:ring-1 focus:ring-accent-500"
                style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)', color: 'var(--text-body)' }} />
            </div>
            <div><Lbl>Category</Lbl>
              <Sel value={categoryId} onChange={e => { setCategoryId(e.target.value); scheduleAutoSave() }}>
                <option value="">— No Category —</option>
                {categories.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
              </Sel>
            </div>
            <div><Lbl>Tags</Lbl>
              <Inp value={tags} onChange={e => { setTags(e.target.value); scheduleAutoSave() }} placeholder="HR, Offer…" />
            </div>
          </Panel>

          <Panel title="Header" open={openSection === 'header'} onToggle={() => toggleSection('header')}>
            <Tog label="Show Header" checked={header.show} onChange={v => setHeader(h => ({ ...h, show: v }))} />
            {header.show && <>
              <div><Lbl>Header Layout</Lbl>
                <Sel value={header.header_layout || 'company_left_logo_right'} onChange={e => setHeader(h => ({ ...h, header_layout: e.target.value }))}>
                  <option value="company_left_logo_right">Company Left / Logo Right</option>
                  <option value="logo_left_company_right">Logo Left / Company Right</option>
                  <option value="logo_top_company_bottom">Logo Top / Company Bottom</option>
                  <option value="company_top_logo_bottom">Company Top / Logo Bottom</option>
                  <option value="logo_only">Logo Only</option>
                  <option value="company_only">Company Only</option>
                </Sel>
              </div>
              <div><Lbl>Header → Content Spacing (px)</Lbl>
                <Sel value={header.header_spacing ?? 20} onChange={e => setHeader(h => ({ ...h, header_spacing: +e.target.value }))}>
                  {[0, 10, 20, 30, 40, 50].map(v => <option key={v} value={v}>{v}px</option>)}
                </Sel>
              </div>
              <div>
                <Lbl>Logo</Lbl>
                {header.logo_url ? (
                  <div className="relative inline-block">
                    <img src={header.logo_url} alt="Logo" style={{ height: 30, maxWidth: '100%', borderRadius: 4, border: '1px solid var(--border)' }} />
                    <button onClick={() => setHeader(h => ({ ...h, logo_url: '' }))}
                      className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center">
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </div>
                ) : (
                  <label className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
                    <Upload className="w-3.5 h-3.5" /><span className="text-xs">Upload Logo</span>
                    <input type="file" accept="image/*" className="sr-only" onChange={handleLogoUpload} />
                  </label>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Lbl>Logo Height</Lbl><Inp type="number" value={header.logo_height||40} min={20} max={120} onChange={e => setHeader(h => ({ ...h, logo_height: +e.target.value }))} /></div>
                <div><Lbl>Logo Align</Lbl>
                  <Sel value={header.logo_alignment||'left'} onChange={e => setHeader(h => ({ ...h, logo_alignment: e.target.value }))}>
                    <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
                  </Sel>
                </div>
              </div>
              <div><Lbl>Header Height (px)</Lbl>
                <Sel value={header.header_height||120} onChange={e => setHeader(h => ({ ...h, header_height: +e.target.value }))}>
                  {[80,100,120,140,160,200].map(v => <option key={v} value={v}>{v}px</option>)}
                </Sel>
              </div>
              <div><Lbl>Company Name</Lbl><Inp value={header.company_name} onChange={e => setHeader(h => ({ ...h, company_name: e.target.value }))} /></div>
              <div><Lbl>Address</Lbl><Inp value={header.company_address} onChange={e => setHeader(h => ({ ...h, company_address: e.target.value }))} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Lbl>Company Align</Lbl>
                  <Sel value={header.company_alignment||'left'} onChange={e => setHeader(h => ({ ...h, company_alignment: e.target.value }))}>
                    <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
                  </Sel>
                </div>
                <div><Lbl>Font Size</Lbl><Inp type="number" value={header.font_size||12} min={8} max={24} onChange={e => setHeader(h => ({ ...h, font_size: +e.target.value }))} /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Lbl>Text Color</Lbl><input type="color" value={header.font_color||'#000000'} onChange={e => setHeader(h => ({ ...h, font_color: e.target.value }))} className="w-full h-8 rounded-lg border cursor-pointer" style={{ borderColor: 'var(--border)' }} /></div>
                <div><Lbl>Background</Lbl><input type="color" value={header.background_color||'#ffffff'} onChange={e => setHeader(h => ({ ...h, background_color: e.target.value }))} className="w-full h-8 rounded-lg border cursor-pointer" style={{ borderColor: 'var(--border)' }} /></div>
              </div>
              <p className="text-[10px] font-bold uppercase tracking-wider pt-1" style={{ color: 'var(--text-muted)' }}>Padding (px)</p>
              <div className="grid grid-cols-4 gap-1">
                {['top','right','bottom','left'].map(s => (
                  <div key={s}><p className="text-[9px] text-center mb-0.5" style={{ color: 'var(--text-muted)' }}>{s[0].toUpperCase()}</p>
                    <Inp type="number" value={header[`padding_${s}`]??12} min={0} max={80} onChange={e => setHeader(h => ({ ...h, [`padding_${s}`]: +e.target.value }))} /></div>
                ))}
              </div>
              <Tog label="Show Border Bottom" checked={header.border_bottom} onChange={v => setHeader(h => ({ ...h, border_bottom: v }))} />
            </>}
          </Panel>

          <Panel title="Footer" open={openSection === 'footer'} onToggle={() => toggleSection('footer')}>
            <Tog label="Show Footer" checked={footer.show} onChange={v => setFooter(f => ({ ...f, show: v }))} />
            {footer.show && <>
              <div><Lbl>Footer Text</Lbl><Inp value={footer.text} onChange={e => setFooter(f => ({ ...f, text: e.target.value }))} /></div>
              <div><Lbl>Footer Height (px)</Lbl>
                <Sel value={footer.footer_height||60} onChange={e => setFooter(f => ({ ...f, footer_height: +e.target.value }))}>
                  {[40,50,60,80,100].map(v => <option key={v} value={v}>{v}px</option>)}
                </Sel>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Lbl>Font Size</Lbl><Inp type="number" value={footer.font_size||10} min={6} max={18} onChange={e => setFooter(f => ({ ...f, font_size: +e.target.value }))} /></div>
                <div><Lbl>Text Color</Lbl><input type="color" value={footer.font_color||'#666666'} onChange={e => setFooter(f => ({ ...f, font_color: e.target.value }))} className="w-full h-8 rounded-lg border cursor-pointer" style={{ borderColor: 'var(--border)' }} /></div>
              </div>
              <p className="text-[10px] font-bold uppercase tracking-wider pt-1" style={{ color: 'var(--text-muted)' }}>Padding (px)</p>
              <div className="grid grid-cols-4 gap-1">
                {['top','right','bottom','left'].map(s => (
                  <div key={s}><p className="text-[9px] text-center mb-0.5" style={{ color: 'var(--text-muted)' }}>{s[0].toUpperCase()}</p>
                    <Inp type="number" value={footer[`padding_${s}`]??8} min={0} max={60} onChange={e => setFooter(f => ({ ...f, [`padding_${s}`]: +e.target.value }))} /></div>
                ))}
              </div>
              <Tog label="Page Numbers"       checked={footer.show_page_numbers} onChange={v => setFooter(f => ({ ...f, show_page_numbers: v }))} />
              <Tog label="Current Date"       checked={footer.show_date} onChange={v => setFooter(f => ({ ...f, show_date: v }))} />
              <Tog label="Confidential Label" checked={footer.confidential_label} onChange={v => setFooter(f => ({ ...f, confidential_label: v }))} />
              <Tog label="Show Border Top"    checked={footer.border_top} onChange={v => setFooter(f => ({ ...f, border_top: v }))} />
            </>}
          </Panel>

          <Panel title="Paper" open={openSection === 'paper'} onToggle={() => toggleSection('paper')}>
            <div><Lbl>Size</Lbl>
              <Sel value={paper.size} onChange={e => setPaper(p => ({ ...p, size: e.target.value }))}>
                <option value="A4">A4</option><option value="letter">Letter</option><option value="legal">Legal</option>
              </Sel>
            </div>
            <div><Lbl>Orientation</Lbl>
              <Sel value={paper.orientation} onChange={e => setPaper(p => ({ ...p, orientation: e.target.value }))}>
                <option value="portrait">Portrait</option><option value="landscape">Landscape</option>
              </Sel>
            </div>
            <p className="text-[10px] font-bold uppercase tracking-wider pt-1" style={{ color: 'var(--text-muted)' }}>Margins (pt)</p>
            <div className="grid grid-cols-2 gap-2">
              {['top','bottom','left','right'].map(s => (
                <div key={s}><Lbl>{s.charAt(0).toUpperCase()+s.slice(1)}</Lbl>
                  <Inp type="number" value={paper[`margin_${s}`]} min={0} max={200} onChange={e => setPaper(p => ({ ...p, [`margin_${s}`]: +e.target.value }))} /></div>
              ))}
            </div>
          </Panel>

          <Panel title="Watermark" open={openSection === 'watermark'} onToggle={() => toggleSection('watermark')}>
            <Tog label="Enable" checked={watermark.enabled} onChange={v => setWatermark(w => ({ ...w, enabled: v }))} />
            {watermark.enabled && <>
              <div className="flex flex-wrap gap-1">
                {WATERMARK_PRESETS.map(p => (
                  <button key={p} onClick={() => setWatermark(w => ({ ...w, text: p }))}
                    className={`text-xs px-2 py-0.5 rounded-full border ${watermark.text === p ? 'bg-accent-600 text-white border-accent-600' : ''}`}
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

          </div>{/* end scrollable */}
        </aside>

        {/* ── Left resize / expand strip ── */}
        <div className="relative flex-shrink-0 flex flex-col"
          style={{ width: 12, background: 'var(--bg-secondary)', borderLeft: '1px solid var(--border)' }}>
          {leftCollapsed && (
            <button onClick={toggleLeftPanel} title="Expand Panel"
              className="absolute top-3 left-1/2 -translate-x-1/2 z-20 w-7 h-7 rounded-full border shadow-sm flex items-center justify-center transition-colors hover:bg-accent-600 hover:text-white hover:border-accent-600"
              style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
              <PanelLeftOpen className="w-3.5 h-3.5" />
            </button>
          )}
          {!leftCollapsed && (
            <div className="mt-2 flex-1 cursor-col-resize hover:bg-accent-200 dark:hover:bg-accent-800 transition-colors"
              onMouseDown={e => {
                e.preventDefault()
                const startX = e.clientX, startW = leftWidth
                const onMove = (ev) => {
                  const n = Math.max(200, Math.min(420, startW + (ev.clientX - startX)))
                  setLeftWidth(n); localStorage.setItem('ad_left_w', n)
                }
                const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
                document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp)
              }} />
          )}
        </div>

        {/* ── Center canvas ── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Ruler */}
          <Ruler width={900} />

          {/* Canvas */}
          <div className="flex-1 min-h-0 overflow-auto py-8 px-4" style={{ background: '#d1d5db' }}
            onClick={() => setSelectedId(null)}>
            <div className="flex flex-col items-center gap-0">
              {(() => {
                // Shared header/footer renderer
                const PageHeader = ({ pageNum }) => {
                  const headerVisible = header.show || !!(header.logo_url || header.company_name)
                  if (!headerVisible) return null
                  const layout    = header.header_layout || 'company_left_logo_right'
                  const padL      = Math.max(32, header.padding_left  ?? 32)
                  const padR      = Math.max(32, header.padding_right ?? 32)
                  const padT      = header.padding_top    ?? 12
                  const padB      = header.padding_bottom ?? 8
                  const fs        = header.font_size || 12
                  const tc        = header.font_color || '#000'
                  const showBand  = header.show
                  const isCen     = layout === 'logo_top_company_bottom' || layout === 'company_top_logo_bottom'
                  const ca        = isCen ? 'center' : (header.company_alignment || 'left')
                  const base      = {
                    paddingTop: padT, paddingRight: padR, paddingBottom: padB, paddingLeft: padL,
                    minHeight: `${header.header_height || 120}px`,
                    borderBottom: showBand && header.border_bottom ? `${header.border_width??1}px solid ${header.border_color||'#d1d5db'}` : 'none',
                    backgroundColor: showBand ? (header.background_color || '#fff') : 'transparent',
                    color: tc, fontSize: fs, fontFamily: header.font_family || 'Arial', boxSizing: 'border-box',
                  }
                  const logoEl = header.logo_url ? (
                    <img src={header.logo_url} alt="Logo" style={{ height: header.logo_height||40, display: 'block', objectFit: 'contain', flexShrink: 0 }} />
                  ) : null
                  const hasComp = !!(header.company_name || header.company_address || header.company_email || header.company_phone)
                  const compEl = hasComp ? (
                    <div style={{ lineHeight: 1.4 }}>
                      {header.company_name && <div style={{ fontWeight: 'bold', fontSize: (fs+2), textAlign: ca }}>{header.company_name}</div>}
                      {header.company_address && <div style={{ fontSize: fs-1, textAlign: ca }}>{header.company_address}</div>}
                      {(header.company_email||header.company_phone) && (
                        <div style={{ fontSize: fs-1, color: '#6b7280', textAlign: ca }}>
                          {[header.company_email, header.company_phone].filter(Boolean).join('  |  ')}
                        </div>
                      )}
                    </div>
                  ) : null

                  if (layout === 'logo_only')
                    return <div style={{ ...base, display: 'flex', alignItems: 'center' }}>{logoEl}</div>
                  if (layout === 'company_only')
                    return <div style={{ ...base, display: 'flex', alignItems: 'center' }}>{compEl}</div>
                  if (layout === 'logo_top_company_bottom')
                    return <div style={{ ...base, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>{logoEl}{compEl}</div>
                  if (layout === 'company_top_logo_bottom')
                    return <div style={{ ...base, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>{compEl}{logoEl}</div>
                  if (layout === 'logo_left_company_right')
                    return <div style={{ ...base, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>{logoEl}{compEl}</div>
                  return <div style={{ ...base, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>{compEl}{logoEl}</div>
                }

                const PageFooter = ({ pageNum, totalPages }) => footer.show ? (
                  <div style={{
                    padding: `${footer.padding_top??8}px ${footer.padding_right??16}px ${footer.padding_bottom??12}px ${footer.padding_left??16}px`,
                    margin: `${footer.margin_top??0}px ${footer.margin_right??0}px ${footer.margin_bottom??0}px ${footer.margin_left??0}px`,
                    minHeight: `${footer.footer_height||60}px`,
                    borderTop: footer.border_top ? `${footer.border_width??1}px solid ${footer.border_color||'#d1d5db'}` : 'none',
                    fontSize: footer.font_size, color: footer.font_color,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxSizing: 'border-box',
                  }}>
                    <span>{footer.show_date ? new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : ''}</span>
                    <span>{footer.text||''}{footer.confidential_label ? ' | CONFIDENTIAL' : ''}</span>
                    <span>{footer.show_page_numbers ? `Page ${pageNum}` : ''}</span>
                  </div>
                ) : null

                return preview ? (
                /* Preview mode: paginated pages */
                pages.map((pageBlocks, pageIndex) => (
                  <div key={pageIndex} className="mb-8">
                    <div className="bg-white shadow-2xl relative" style={{ width: paperW, fontFamily: 'Arial, sans-serif', minHeight: '297mm', boxSizing: 'border-box' }}>
                      {watermark.enabled && (
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          pointerEvents: 'none', zIndex: 1, transform: `rotate(${watermark.rotation}deg)`,
                          fontSize: watermark.size, opacity: watermark.opacity, color: '#9ca3af', fontWeight: 'bold', userSelect: 'none' }}>
                          {watermark.text}
                        </div>
                      )}
                      <PageHeader pageNum={pageIndex + 1} />
                      <div style={{ paddingTop: (header.show||header.logo_url||header.company_name) ? `${header.header_spacing??20}px` : mt, paddingBottom: mb, paddingLeft: ml, paddingRight: mr, position: 'relative', zIndex: 2 }}
                        dangerouslySetInnerHTML={{ __html: pageBlocks.map(blockToHtml).join('\n') }} />
                      <PageFooter pageNum={pageIndex + 1} totalPages={pages.length} />
                    </div>
                    {pageIndex < pages.length - 1 && (
                      <div className="flex items-center justify-center my-3 gap-3">
                        <div className="h-px flex-1 bg-gray-300" />
                        <span className="text-xs text-gray-400 font-medium px-2">Page {pageIndex + 1}</span>
                        <div className="h-px flex-1 bg-gray-300" />
                      </div>
                    )}
                  </div>
                ))
                ) : (
                /* Edit mode: multiple pages with header/footer on every page */
                pages.map((pageBlocks, pageIndex) => (
                  <div key={pageIndex} className="mb-8">
                    {/* Page indicator */}
                    {pages.length > 1 && (
                      <div className="flex items-center justify-center mb-2 gap-3">
                        <div className="h-px flex-1 bg-gray-300" />
                        <span className="text-xs text-gray-500 font-semibold px-3 py-1 rounded-full bg-gray-100">Page {pageIndex + 1} of {pages.length}</span>
                        <div className="h-px flex-1 bg-gray-300" />
                      </div>
                    )}
                    {/* Page */}
                    <div className="bg-white shadow-2xl relative" style={{ width: paperW, minHeight: '297mm', fontFamily: 'Arial, sans-serif', boxSizing: 'border-box' }}
                      onClick={e => e.stopPropagation()}>

                      {/* Watermark */}
                      {watermark.enabled && (
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          pointerEvents: 'none', zIndex: 1, transform: `rotate(${watermark.rotation}deg)`,
                          fontSize: watermark.size, opacity: watermark.opacity, color: '#9ca3af', fontWeight: 'bold', userSelect: 'none' }}>
                          {watermark.text}
                        </div>
                      )}

                      {/* Header on EVERY page */}
                      <PageHeader pageNum={pageIndex + 1} />

                      {/* Blocks */}
                      <div className="relative z-10" style={{ paddingTop: pageIndex === 0 ? ((header.show||header.logo_url||header.company_name) ? `${header.header_spacing??20}px` : mt) : '20px', paddingBottom: mb, paddingLeft: ml, paddingRight: mr }}>
                        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                          <SortableContext items={pageBlocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
                            <div className="space-y-3 pl-7 pr-7">
                              {pageBlocks.map(block => (
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

                        {pageIndex === pages.length - 1 && (
                          <div className="flex justify-center mt-4 pl-7 pr-7">
                            <button onClick={() => toggleSection('blocks')}
                              className="flex items-center gap-2 px-4 py-2 rounded-xl border-2 border-dashed text-sm transition-colors hover:border-accent-500 hover:text-accent-600"
                              style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
                              <Plus className="w-4 h-4" /> Add Block
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Footer on EVERY page */}
                      <PageFooter pageNum={pageIndex + 1} totalPages={pages.length} />
                    </div>
                  </div>
                ))
                )})()}
            </div>
          </div>
        </div>

        {/* ── Right resize / expand strip ── */}
        {!preview && (
          <div className="relative flex-shrink-0 flex flex-col"
            style={{ width: 12, background: 'var(--bg-secondary)', borderRight: '1px solid var(--border)' }}>
            {rightCollapsed && (
              <button onClick={toggleRightPanel} title="Expand Properties"
                className="absolute top-3 left-1/2 -translate-x-1/2 z-20 w-7 h-7 rounded-full border shadow-sm flex items-center justify-center transition-colors hover:bg-accent-600 hover:text-white hover:border-accent-600"
                style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
                <PanelRightOpen className="w-3.5 h-3.5" />
              </button>
            )}
            {!rightCollapsed && (
              <div className="mt-2 flex-1 cursor-col-resize hover:bg-accent-200 dark:hover:bg-accent-800 transition-colors"
                onMouseDown={e => {
                  e.preventDefault()
                  const startX = e.clientX, startW = rightWidth
                  const onMove = (ev) => {
                    const n = Math.max(200, Math.min(440, startW - (ev.clientX - startX)))
                    setRightWidth(n); localStorage.setItem('ad_right_w', n)
                  }
                  const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
                  document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp)
                }} />
            )}
          </div>
        )}

        {/* ── Right panel: Properties ── */}
        {!preview && (
          <aside className="flex-shrink-0 border-l flex flex-col overflow-hidden transition-all duration-200" style={{ minHeight: 0 }}
            style={{ width: rightCollapsed ? 0 : rightWidth, background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
            {/* Panel header with collapse button at top-right */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b flex-shrink-0"
              style={{ borderColor: 'var(--border)' }}>
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Properties</span>
              <button onClick={toggleRightPanel} title="Collapse Properties"
                className="p-1.5 rounded-lg border transition-colors hover:bg-accent-600 hover:text-white hover:border-accent-600"
                style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
                <PanelRightClose className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
            <PropsPanel
              block={selectedBlock}
              onChange={updateBlock}
              onDelete={deleteBlock}
            />
            {/* Page stats */}
            <div className="mt-auto p-4 border-t" style={{ borderColor: 'var(--border)' }}>
              <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Document</p>
              <div className="space-y-1">
                {[
                  { label: 'Blocks',   value: blocks.length },
                  { label: 'Pages',    value: pages.length  },
                  { label: 'Paper',    value: paper.size    },
                ].map(s => (
                  <div key={s.label} className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{s.label}</span>
                    <span className="text-xs font-semibold" style={{ color: 'var(--text-heading)' }}>{s.value}</span>
                  </div>
                ))}
              </div>
            </div>
            </div>{/* end overflow-y-auto */}
          </aside>
        )}
      </div>

      {/* Fullscreen preview */}
      {showFullPreview && (
        <FullPreview
          blocks={blocks}
          header={header}
          footer={footer}
          paper={paper}
          watermark={watermark}
          onClose={() => setShowFullPreview(false)}
        />
      )}
    </div>
  )
}
