import React, { useState, useEffect, useRef, useCallback, useReducer } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import QRCode from 'qrcode'
import {
  Save, ArrowLeft, Eye, EyeOff, Plus, Trash2, GripVertical,
  Type, Heading, Table, Image, PenTool, Minus, AlignLeft, AlignCenter,
  AlignRight, Bold, Italic, Underline, ChevronDown, ChevronRight, ChevronUp,
  Settings, Code, Layers, Copy, ZoomIn, ZoomOut, X, Lock, Unlock,
  FileText, Hash, DollarSign, Users, Building, RotateCcw, Upload,
  Clock, Layout, Move, List, Palette, Download, Printer, Monitor,
  ChevronLeft, MoreHorizontal, Maximize2
} from 'lucide-react'
import toast from 'react-hot-toast'
import hrmService from '../../services/hrmService'

// ─── Constants ────────────────────────────────────────────────────────────────

const DOC_TYPES = [
  { value: 'offer_letter', label: 'Offer Letter' },
  { value: 'appointment_letter', label: 'Appointment Letter' },
  { value: 'experience_letter', label: 'Experience Letter' },
  { value: 'relieving_letter', label: 'Relieving Letter' },
  { value: 'joining_letter', label: 'Joining Letter' },
  { value: 'promotion_letter', label: 'Promotion Letter' },
  { value: 'increment_letter', label: 'Increment Letter' },
  { value: 'warning_letter', label: 'Warning Letter' },
  { value: 'nda_agreement', label: 'NDA Agreement' },
  { value: 'hr_policy', label: 'HR Policy' },
  { value: 'payslip', label: 'Payslip' },
  { value: 'salary_revision', label: 'Salary Revision' },
  { value: 'internship_letter', label: 'Internship Letter' },
  { value: 'internship_completion', label: 'Internship Completion' },
  { value: 'employee_id_letter', label: 'Employee ID Letter' },
  { value: 'bonafide_letter', label: 'Bonafide Letter' },
  { value: 'wfh_approval', label: 'WFH Approval' },
  { value: 'leave_approval', label: 'Leave Approval' },
  { value: 'termination_letter', label: 'Termination Letter' },
  { value: 'custom', label: 'Custom Template' },
]

const BLOCK_PALETTE = [
  { group: 'Content', items: [
    { type: 'heading',    label: 'Heading',     icon: Heading,   desc: 'Section heading' },
    { type: 'text',       label: 'Text Block',  icon: Type,      desc: 'Rich text paragraph' },
    { type: 'paragraph',  label: 'Paragraph',   icon: AlignLeft, desc: 'Body paragraph' },
    { type: 'list_items', label: 'List',        icon: List,      desc: 'Bulleted list' },
    { type: 'two_column', label: '2 Columns',   icon: Layout,    desc: 'Side-by-side' },
  ]},
  { group: 'Structure', items: [
    { type: 'divider',    label: 'Divider',     icon: Minus,     desc: 'Horizontal rule' },
    { type: 'spacer',     label: 'Spacer',      icon: Move,      desc: 'Blank space' },
    { type: 'page_break', label: 'Page Break',  icon: FileText,  desc: 'Force new page' },
  ]},
  { group: 'Data', items: [
    { type: 'table',            label: 'Table',         icon: Table,      desc: 'Custom data table' },
    { type: 'salary_table',     label: 'Salary Table',  icon: DollarSign, desc: 'Earnings & deductions' },
    { type: 'employee_details', label: 'Employee',      icon: Users,      desc: 'Employee info grid' },
    { type: 'company_details',  label: 'Company',       icon: Building,   desc: 'Company info grid' },
  ]},
  { group: 'Media', items: [
    { type: 'image',     label: 'Image',     icon: Image,    desc: 'Insert image' },
    { type: 'logo',      label: 'Logo',      icon: Image,    desc: 'Company logo' },
    { type: 'signature', label: 'Signature', icon: PenTool,  desc: 'Signature field' },
    { type: 'qr_code',   label: 'QR Code',   icon: Code,     desc: 'Verification QR' },
  ]},
]

const PLACEHOLDER_GROUPS = {
  'Candidate': ['candidate_name','candidate_email','candidate_phone','position','department','joining_date','salary_ctc','location','offer_expiry_date','probation_period','work_mode','shift','bonus'],
  'Employee':  ['employee_name','employee_id','employee_email','designation','department','employment_type','date_of_joining','bank_account','uan_number'],
  'Company':   ['company_name','company_address','company_phone','company_email','company_website','company_gst'],
  'Payroll':   ['payroll_month','payroll_year','salary_basic','salary_hra','salary_special','salary_gross','deduct_pf','deduct_pt','deduct_tds','total_deductions','salary_net','working_days','present_days','lop_days'],
  'HR':        ['leave_type','leave_from','leave_to','leave_days','approved_by','increment_amount','increment_percent','old_salary','new_salary','effective_date','reporting_manager'],
  'Dates':     ['date_today','date_formatted','current_month','current_year','document_number'],
}

const FONTS = ['Arial','Helvetica','Georgia','Times New Roman','Courier New','Verdana','Calibri','Roboto','Open Sans']
const COLORS_PRESET = ['#000000','#1e3a5f','#2563eb','#10b981','#f59e0b','#ef4444','#8b5cf6','#0ea5e9','#374151','#ffffff','#f1f5f9','#e2e8f0']

const uuid = () => Math.random().toString(36).slice(2, 10)

const createBlock = (type) => {
  const base = { id: uuid(), type, order: 0, is_locked: false, is_hidden: false, condition: null,
    properties: { margin_top: 6, margin_bottom: 6, text_align: 'left', font_size: 11 } }
  const d = {
    heading:          { content: 'Section Heading', properties: { ...base.properties, font_size: 18, font_weight: 'bold', text_align: 'center' } },
    text:             { content: 'Enter your text here. Use placeholders like <b>{{employee_name}}</b> to insert dynamic values.' },
    paragraph:        { content: 'This is a paragraph. You can write any content here and use dynamic placeholders.' },
    list_items:       { content: ['First item', 'Second item', 'Third item'] },
    two_column:       { content: { left: 'Left column content', right: 'Right column content' } },
    divider:          { content: '', properties: { ...base.properties, color: '#e2e8f0' } },
    spacer:           { content: '', properties: { ...base.properties, height: '20px' } },
    page_break:       { content: '' },
    table: { content: {
      headers: ['Column 1', 'Column 2', 'Column 3'],
      rows: [['Data 1', 'Data 2', 'Data 3'], ['Data 4', 'Data 5', 'Data 6']],
      has_header: true, border_style: 'full', header_bg: '#1e3a5f', header_color: '#ffffff', stripe_rows: true,
    }},
    salary_table: { content: {
      earnings:   [{ label: 'Basic Salary', value: '{{salary_basic}}' }, { label: 'HRA', value: '{{salary_hra}}' }, { label: 'Special Allowance', value: '{{salary_special}}' }],
      deductions: [{ label: 'PF (Employee)', value: '{{deduct_pf}}' }, { label: 'Professional Tax', value: '{{deduct_pt}}' }, { label: 'TDS', value: '{{deduct_tds}}' }],
    }},
    employee_details: { content: { 'Employee Name': '{{employee_name}}', 'Employee ID': '{{employee_id}}', 'Designation': '{{designation}}', 'Department': '{{department}}', 'Date of Joining': '{{date_of_joining}}' } },
    company_details:  { content: { 'Company': '{{company_name}}', 'Address': '{{company_address}}', 'Phone': '{{company_phone}}', 'Email': '{{company_email}}' } },
    image:     { content: '', properties: { ...base.properties, width: '200px', text_align: 'center' } },
    logo:      { content: '', properties: { ...base.properties, width: '120px', text_align: 'center' } },
    signature: { content: [{ label: 'Authorized Signatory', name: '', designation: '' }] },
    qr_code:   { content: 'https://verify.example.com/{{document_number}}' },
  }
  return { ...base, ...(d[type] || {}), order: Date.now() }
}

// ─── Enterprise CSS (scrollbars + print + animations) ─────────────────────────

const ENTERPRISE_CSS = `
  /* Custom thin purple scrollbars */
  .eb-scroll::-webkit-scrollbar { width: 5px; height: 5px; }
  .eb-scroll::-webkit-scrollbar-track { background: transparent; }
  .eb-scroll::-webkit-scrollbar-thumb { background: rgba(139,92,246,0.35); border-radius: 99px; }
  .eb-scroll::-webkit-scrollbar-thumb:hover { background: rgba(139,92,246,0.65); }
  .eb-scroll { scrollbar-width: thin; scrollbar-color: rgba(139,92,246,0.35) transparent; }

  /* Panel resize cursor */
  .eb-splitter { width: 4px; cursor: col-resize; background: transparent; flex-shrink: 0; transition: background 0.15s; z-index: 10; }
  .eb-splitter:hover, .eb-splitter.active { background: rgba(139,92,246,0.5); }

  /* Block drag-handle hover */
  .eb-block-row:hover .eb-drag-handle { opacity: 1 !important; }

  /* Header canvas inline editing placeholder */
  [data-placeholder]:empty::before { content: attr(data-placeholder); color: #94a3b8; pointer-events: none; }

  /* Resize cursor during drag */
  body.resizing-h * { cursor: col-resize !important; user-select: none !important; }
  body.resizing-v * { cursor: row-resize !important; user-select: none !important; }

  /* Spin animation */
  @keyframes eb-spin { to { transform: rotate(360deg); } }
  .eb-spinner { animation: eb-spin 0.8s linear infinite; }

  /* Print styles */
  @media print {
    body > * { display: none !important; }
    #eb-print-frame { display: block !important; position: fixed; top: 0; left: 0; width: 100%; height: 100%; }
  }
`

// ─── Print / Export Utilities ─────────────────────────────────────────────────

function blockToHTML(block, branding) {
  const p = block.properties || {}
  const fam = branding?.font_family || 'Arial'
  const baseCSS = `font-family:${fam},sans-serif;font-size:${p.font_size || 11}pt;color:${p.color || branding?.text_color || '#1a1a1a'};text-align:${p.text_align || 'left'};margin-top:${p.margin_top || 0}px;margin-bottom:${p.margin_bottom || 0}px;font-weight:${p.font_weight || 'normal'};font-style:${p.font_style || 'normal'};line-height:${p.line_height || 1.5};`
  const c = block.content
  switch (block.type) {
    case 'heading':
      return `<h2 style="${baseCSS}color:${branding?.heading_color||'#1e3a5f'};font-size:${p.font_size||18}pt;font-weight:bold;">${c||'Heading'}</h2>`
    case 'text': case 'paragraph':
      return `<p style="${baseCSS}">${c||''}</p>`
    case 'list_items': {
      const items = Array.isArray(c) ? c : [c]
      return `<ul style="${baseCSS}padding-left:20px;">${items.map(i=>`<li>${i}</li>`).join('')}</ul>`
    }
    case 'two_column':
      return `<table width="100%" style="border-collapse:collapse;"><tr><td style="width:50%;padding:4px 8px;border-left:3px solid ${branding?.primary_color||'#1e3a5f'};">${c?.left||''}</td><td style="width:50%;padding:4px 8px;border-left:3px solid ${branding?.primary_color||'#1e3a5f'};">${c?.right||''}</td></tr></table>`
    case 'divider':
      return `<hr style="border:none;border-top:${p.thickness||1}px solid ${p.color||'#e2e8f0'};margin:${p.margin_top||6}px 0 ${p.margin_bottom||6}px;" />`
    case 'spacer':
      return `<div style="height:${p.height||'20px'};"></div>`
    case 'page_break':
      return `<div style="break-after:page;page-break-after:always;height:1px;"></div>`
    case 'table': {
      const hds = c?.headers||[]; const rows = c?.rows||[]
      return `<table style="width:100%;border-collapse:collapse;font-size:9pt;"><thead><tr>${hds.map(h=>`<th style="background:${c?.header_bg||branding?.primary_color||'#1e3a5f'};color:${c?.header_color||'#fff'};padding:5px 8px;text-align:left;border:1px solid rgba(0,0,0,.1);">${h}</th>`).join('')}</tr></thead><tbody>${rows.map((row,ri)=>`<tr style="background:${c?.stripe_rows?(ri%2===0?'#f8f9fa':'#fff'):'#fff'}">${row.map(cell=>`<td style="padding:4px 8px;border:1px solid #e5e7eb;">${cell}</td>`).join('')}</tr>`).join('')}</tbody></table>`
    }
    case 'salary_table': {
      const earn = c?.earnings||[]; const ded = c?.deductions||[]; const rows = Math.max(earn.length,ded.length)
      const hdr = `<tr>${['Earnings','Amount','Deductions','Amount'].map(h=>`<th style="background:${branding?.primary_color||'#1e3a5f'};color:#fff;padding:5px 8px;text-align:left;">${h}</th>`).join('')}</tr>`
      const body = Array.from({length:rows}).map((_,i)=>`<tr><td style="padding:4px 8px;border-bottom:1px solid #e5e7eb;">${earn[i]?.label||''}</td><td style="padding:4px 8px;border-bottom:1px solid #e5e7eb;">${earn[i]?.value||''}</td><td style="padding:4px 8px;border-bottom:1px solid #e5e7eb;">${ded[i]?.label||''}</td><td style="padding:4px 8px;border-bottom:1px solid #e5e7eb;">${ded[i]?.value||''}</td></tr>`).join('')
      const net = `<tr style="background:${branding?.primary_color||'#1e3a5f'};color:#fff;font-weight:bold;"><td colspan="2" style="padding:6px 8px;">Net Pay</td><td colspan="2" style="padding:6px 8px;">{{salary_net}}</td></tr>`
      return `<table style="width:100%;border-collapse:collapse;font-size:9pt;"><thead>${hdr}</thead><tbody>${body}${net}</tbody></table>`
    }
    case 'employee_details': case 'company_details':
      return `<table style="width:100%;border-collapse:collapse;font-size:9pt;"><tbody>${Object.entries(c||{}).map(([k,v])=>`<tr><td style="padding:4px 8px;font-weight:600;color:${branding?.primary_color||'#1e3a5f'};width:35%;border-bottom:1px solid #e5e7eb;">${k}</td><td style="padding:4px 8px;border-bottom:1px solid #e5e7eb;">${v}</td></tr>`).join('')}</tbody></table>`
    case 'image': case 'logo':
      return c ? `<div style="text-align:${p.text_align||'center'};"><img src="${c}" style="max-width:${p.width||'200px'};max-height:120px;object-fit:contain;" /></div>` : ''
    case 'signature': {
      const sigs = Array.isArray(c)?c:[c||{}]
      return `<div style="display:flex;gap:32px;margin-top:8px;">${sigs.map(s=>`<div style="text-align:center;min-width:120px;">${s?.image?`<img src="${s.image}" style="height:48px;width:120px;object-fit:contain;display:block;margin:0 auto;"/>`:'<div style="height:48px;border-bottom:1px solid #333;width:120px;margin:0 auto;"></div>'}<div style="font-size:9pt;font-weight:bold;margin-top:4px;">${s?.name||''}</div><div style="font-size:8pt;color:#666;">${s?.designation||''}</div></div>`).join('')}</div>`
    }
    default: return `<div style="${baseCSS}">${typeof c==='string'?c:JSON.stringify(c)}</div>`
  }
}

function buildPrintHTML({ blocks, branding, header, footer, watermark, pageConfig, meta }) {
  const primary = branding?.primary_color || '#1e3a5f'
  const fam = branding?.font_family || 'Arial'
  const margins = `${pageConfig?.margin_top||20}mm ${pageConfig?.margin_right||20}mm ${pageConfig?.margin_bottom||20}mm ${pageConfig?.margin_left||20}mm`

  const headerHTML = header?.enabled ? `
    <div style="padding-bottom:12px;margin-bottom:16px;border-bottom:${header.border_bottom!==false?`2px solid ${primary}`:'none'};">
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td>
            ${header.show_company_name!==false?`<div style="font-size:14pt;font-weight:700;color:${primary};font-family:${fam};">${header.company_name||'{{company_name}}'}</div>`:''}
            ${header.company_address?`<div style="font-size:9pt;color:#555;">${header.company_address}</div>`:''}
            ${header.company_contact?`<div style="font-size:9pt;color:#555;">${header.company_contact}</div>`:''}
          </td>
          <td style="text-align:right;">
            ${header.logo?`<img src="${header.logo}" style="max-height:48px;max-width:140px;object-fit:contain;" />`:''}
          </td>
        </tr>
      </table>
    </div>` : ''

  const footerHTML = footer?.enabled ? `
    <div style="margin-top:24px;padding-top:10px;border-top:${footer.border_top!==false?`1px solid ${primary}`:'none'};font-size:8pt;color:#888;">
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td>${[footer.show_generated_date&&`Generated: ${new Date().toLocaleDateString('en-IN')}`,footer.disclaimer].filter(Boolean).join(' | ')}</td>
          ${footer.show_page_numbers?`<td style="text-align:right;">Page <span class="page-num">1</span></td>`:''}
        </tr>
      </table>
    </div>` : ''

  const watermarkHTML = watermark?.enabled ? `
    <div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) rotate(${watermark.rotation||-45}deg);font-size:${watermark.font_size||60}px;color:${watermark.color||'#ccc'};opacity:${watermark.opacity||0.1};font-weight:bold;white-space:nowrap;pointer-events:none;z-index:0;">
      ${watermark.text||'CONFIDENTIAL'}
    </div>` : ''

  const blocksHTML = (blocks || [])
    .filter(b => !b.is_hidden)
    .map(b => blockToHTML(b, branding))
    .join('\n')

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>${meta?.name || 'Document'}</title>
<style>
  @page { margin: ${margins}; size: ${pageConfig?.size||'A4'} ${pageConfig?.orientation||'portrait'}; }
  body { font-family: ${fam}, sans-serif; font-size: ${branding?.font_size||11}pt; color: ${branding?.text_color||'#1a1a1a'}; margin: 0; padding: 20mm; }
  table { border-collapse: collapse; }
  img { max-width: 100%; }
  .page-break { page-break-after: always; break-after: page; }
</style>
</head>
<body>
  ${watermarkHTML}
  ${headerHTML}
  ${blocksHTML}
  ${footerHTML}
</body>
</html>`
}

function doExportPDF(printData) {
  const html = buildPrintHTML(printData)
  const win = window.open('', '_blank')
  if (!win) { toast.error('Please allow popups for PDF export'); return }
  win.document.write(html)
  win.document.close()
  win.focus()
  setTimeout(() => win.print(), 400)
}

function doExportDOCX(printData) {
  const html = buildPrintHTML(printData)
  const wordHTML = html.replace('<html>', '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">')
  const blob = new Blob([wordHTML], { type: 'application/msword' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = `${printData.meta?.name || 'document'}.doc`
  document.body.appendChild(a); a.click()
  document.body.removeChild(a); URL.revokeObjectURL(url)
  toast.success('Exported as .doc — opens in Word / LibreOffice')
}

// ─── QR Block Renderer (async real QR) ────────────────────────────────────────

function QRBlockRenderer({ content }) {
  const [dataUrl, setDataUrl] = useState('')
  useEffect(() => {
    if (!content) return
    QRCode.toDataURL(content || 'https://hireflow.app', { width: 120, margin: 1, color: { dark: '#1e3a5f', light: '#ffffff' } })
      .then(setDataUrl).catch(() => {})
  }, [content])
  return (
    <div style={{ display: 'inline-block', border: '1px solid #e2e8f0', padding: 8, borderRadius: 6, textAlign: 'center' }}>
      {dataUrl
        ? <img src={dataUrl} alt="QR" style={{ width: 80, height: 80, display: 'block' }} />
        : <div style={{ width: 80, height: 80, background: '#f0f0f0', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#94a3b8' }}>QR…</div>
      }
      <div style={{ fontSize: '7pt', color: '#666', marginTop: 4, maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {(content || '').replace('https://', '')}
      </div>
    </div>
  )
}

// ─── Floating Rich-Text Toolbar ───────────────────────────────────────────────

function RichTextToolbar({ containerRef }) {
  const [pos, setPos] = useState(null)

  useEffect(() => {
    const onSel = () => {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || !sel.rangeCount) { setPos(null); return }
      if (!containerRef?.current?.contains(sel.anchorNode)) { setPos(null); return }
      const r = sel.getRangeAt(0).getBoundingClientRect()
      setPos({ top: r.top - 44, left: r.left + r.width / 2 })
    }
    document.addEventListener('selectionchange', onSel)
    return () => document.removeEventListener('selectionchange', onSel)
  }, [containerRef])

  if (!pos) return null
  const cmd = (c, v) => { document.execCommand(c, false, v ?? null) }

  return createPortal(
    <div style={{
      position: 'fixed', top: pos.top, left: pos.left, transform: 'translateX(-50%)',
      zIndex: 99999, display: 'flex', gap: 2, padding: '4px 6px',
      background: '#1e293b', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
      alignItems: 'center',
    }}>
      {[['bold', <Bold size={12} />], ['italic', <Italic size={12} />], ['underline', <Underline size={12} />], ['strikeThrough', <span style={{ textDecoration: 'line-through', fontSize: 11, fontWeight: 700 }}>S</span>]].map(([c, icon]) => (
        <button key={c} onMouseDown={e => { e.preventDefault(); cmd(c) }}
          style={{ color: '#e2e8f0', padding: '2px 6px', borderRadius: 4, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
          onMouseEnter={e => e.target.closest('button').style.background = '#334155'}
          onMouseLeave={e => e.target.closest('button').style.background = 'transparent'}>
          {icon}
        </button>
      ))}
      <div style={{ width: 1, height: 16, background: '#475569', margin: '0 2px' }} />
      {[['justifyLeft', <AlignLeft size={12} />], ['justifyCenter', <AlignCenter size={12} />], ['justifyRight', <AlignRight size={12} />]].map(([c, icon]) => (
        <button key={c} onMouseDown={e => { e.preventDefault(); cmd(c) }}
          style={{ color: '#e2e8f0', padding: '2px 5px', borderRadius: 4, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
          onMouseEnter={e => e.target.closest('button').style.background = '#334155'}
          onMouseLeave={e => e.target.closest('button').style.background = 'transparent'}>
          {icon}
        </button>
      ))}
      <div style={{ width: 1, height: 16, background: '#475569', margin: '0 2px' }} />
      <label title="Text color" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '0 4px' }}>
        <span style={{ fontSize: 11, color: '#e2e8f0', fontWeight: 700 }}>A</span>
        <input type="color" style={{ width: 14, height: 14, border: 'none', padding: 0, background: 'none', cursor: 'pointer', opacity: 0, position: 'absolute' }}
          onChange={e => cmd('foreColor', e.target.value)} />
        <span style={{ width: 12, height: 3, background: 'currentColor', color: '#ef4444', display: 'block', marginTop: 1 }} />
      </label>
    </div>,
    document.body
  )
}

// ─── Block Preview ────────────────────────────────────────────────────────────

function BlockPreview({ block, selected, editing, onSelect, onStartEdit, onStopEdit, onDelete, onDuplicate, onContentChange, branding, insertPlaceholder, dragHandleProps }) {
  const primary   = branding?.primary_color  || '#1e3a5f'
  const textColor = branding?.text_color     || '#1a1a1a'
  const headColor = branding?.heading_color  || '#1e3a5f'
  const fontFam   = branding?.font_family    || 'Arial, sans-serif'
  const props     = block.properties || {}
  const editorRef = useRef(null)

  const baseStyle = {
    fontFamily: fontFam,
    fontSize: `${props.font_size || 11}pt`,
    color: props.color || textColor,
    textAlign: props.text_align || 'left',
    marginTop: `${props.margin_top || 0}px`,
    marginBottom: `${props.margin_bottom || 0}px`,
    backgroundColor: props.background_color || 'transparent',
    fontWeight: props.font_weight || 'normal',
    fontStyle: props.font_style || 'normal',
    lineHeight: props.line_height || 1.5,
    letterSpacing: props.letter_spacing ? `${props.letter_spacing}px` : undefined,
    padding: `${props.padding_v || 0}px ${props.padding_h || 0}px`,
  }

  const isText = ['text', 'paragraph', 'heading'].includes(block.type)

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => onContentChange(block.id, ev.target.result)
    reader.readAsDataURL(file)
  }

  const renderContent = () => {
    const c = block.content
    switch (block.type) {
      case 'heading':
        return (
          <div
            ref={editorRef}
            contentEditable={editing}
            suppressContentEditableWarning
            dangerouslySetInnerHTML={!editing ? { __html: c || 'Heading' } : undefined}
            onBlur={editing ? e => { onStopEdit(); onContentChange(block.id, e.currentTarget.innerHTML) } : undefined}
            style={{ ...baseStyle, color: headColor, fontWeight: 'bold', outline: 'none', minHeight: editing ? 24 : undefined }}
          >{editing ? undefined : null}</div>
        )
      case 'text': case 'paragraph':
        return (
          <div
            ref={editorRef}
            contentEditable={editing}
            suppressContentEditableWarning
            dangerouslySetInnerHTML={!editing ? { __html: c || 'Text block' } : undefined}
            onBlur={editing ? e => { onStopEdit(); onContentChange(block.id, e.currentTarget.innerHTML) } : undefined}
            style={{ ...baseStyle, outline: 'none', minHeight: editing ? 48 : undefined }}
          >{editing ? undefined : null}</div>
        )
      case 'list_items':
        return (
          <ul style={{ ...baseStyle, paddingLeft: '20px', listStyleType: 'disc' }}>
            {(Array.isArray(c) ? c : [c]).map((item, i) => <li key={i} dangerouslySetInnerHTML={{ __html: item }} />)}
          </ul>
        )
      case 'two_column':
        return (
          <div style={{ display: 'flex', gap: '16px' }}>
            <div style={{ flex: 1, fontSize: '10pt', padding: '8px', borderLeft: `3px solid ${primary}` }} dangerouslySetInnerHTML={{ __html: c?.left || 'Left column' }} />
            <div style={{ flex: 1, fontSize: '10pt', padding: '8px', borderLeft: `3px solid ${primary}` }} dangerouslySetInnerHTML={{ __html: c?.right || 'Right column' }} />
          </div>
        )
      case 'divider':
        return <hr style={{ border: 'none', borderTop: `${props.thickness || 1}px solid ${props.color || '#e2e8f0'}` }} />
      case 'spacer':
        return <div style={{ height: props.height || '20px', background: 'repeating-linear-gradient(45deg,#f0f0f0,#f0f0f0 2px,transparent 2px,transparent 8px)' }} />
      case 'page_break':
        return (
          <div style={{ margin: '8px -8px', position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1, height: 1, background: '#f59e0b', opacity: 0.4 }} />
              <div style={{ padding: '3px 10px', background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 99, fontSize: 10, color: '#92400e', whiteSpace: 'nowrap', fontWeight: 600 }}>
                ↕ Page Break — next page starts here
              </div>
              <div style={{ flex: 1, height: 1, background: '#f59e0b', opacity: 0.4 }} />
            </div>
          </div>
        )
      case 'table': {
        const hds = c?.headers || []
        const rows = c?.rows || []
        return (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9pt' }}>
            {hds.length > 0 && (
              <thead>
                <tr>{hds.map((h, i) => <th key={i} style={{ background: c?.header_bg || primary, color: c?.header_color || '#fff', padding: '5px 8px', textAlign: 'left', fontSize: '9pt', border: '1px solid rgba(0,0,0,0.1)' }}>{h}</th>)}</tr>
              </thead>
            )}
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri} style={{ background: c?.stripe_rows ? (ri % 2 === 0 ? '#f8f9fa' : '#fff') : '#fff' }}>
                  {row.map((cell, ci) => <td key={ci} style={{ padding: '4px 8px', border: '1px solid #e5e7eb', fontSize: '9pt' }} dangerouslySetInnerHTML={{ __html: cell }} />)}
                </tr>
              ))}
            </tbody>
          </table>
        )
      }
      case 'salary_table': {
        const earnings   = c?.earnings   || []
        const deductions = c?.deductions || []
        const rows = Math.max(earnings.length, deductions.length)
        return (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9pt' }}>
            <thead>
              <tr>{['Earnings', 'Amount', 'Deductions', 'Amount'].map((h, i) => (
                <th key={i} style={{ background: primary, color: '#fff', padding: '5px 8px', textAlign: 'left', border: '1px solid rgba(0,0,0,0.1)' }}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {Array.from({ length: rows }).map((_, i) => (
                <tr key={i}>
                  <td style={{ padding: '4px 8px', borderBottom: '1px solid #e5e7eb' }}>{earnings[i]?.label || ''}</td>
                  <td style={{ padding: '4px 8px', borderBottom: '1px solid #e5e7eb' }}>{earnings[i]?.value || ''}</td>
                  <td style={{ padding: '4px 8px', borderBottom: '1px solid #e5e7eb' }}>{deductions[i]?.label || ''}</td>
                  <td style={{ padding: '4px 8px', borderBottom: '1px solid #e5e7eb' }}>{deductions[i]?.value || ''}</td>
                </tr>
              ))}
              <tr style={{ background: primary, color: '#fff', fontWeight: 'bold' }}>
                <td colSpan={2} style={{ padding: '6px 8px' }}>Gross Earnings</td>
                <td colSpan={2} style={{ padding: '6px 8px' }}>{'{{salary_gross}}'}</td>
              </tr>
              <tr style={{ background: '#374151', color: '#fff', fontWeight: 'bold' }}>
                <td colSpan={2} style={{ padding: '6px 8px' }}>Net Pay</td>
                <td colSpan={2} style={{ padding: '6px 8px' }}>{'{{salary_net}}'}</td>
              </tr>
            </tbody>
          </table>
        )
      }
      case 'employee_details': case 'company_details':
        return (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9pt' }}>
            <tbody>
              {Object.entries(c || {}).map(([k, v]) => (
                <tr key={k}>
                  <td style={{ padding: '4px 8px', fontWeight: '600', color: primary, width: '35%', borderBottom: '1px solid #e5e7eb' }}>{k}</td>
                  <td style={{ padding: '4px 8px', borderBottom: '1px solid #e5e7eb' }} dangerouslySetInnerHTML={{ __html: v }} />
                </tr>
              ))}
            </tbody>
          </table>
        )
      case 'signature': {
        const sigs = Array.isArray(c) ? c : [c || {}]
        return (
          <div style={{ display: 'flex', gap: '32px', marginTop: '8px', flexWrap: 'wrap' }}>
            {sigs.map((sig, i) => (
              <div key={i} style={{ textAlign: 'center', minWidth: '120px' }}>
                {sig?.image
                  ? <img src={sig.image} alt="" style={{ height: '48px', width: '120px', objectFit: 'contain', display: 'block', margin: '0 auto' }} />
                  : <div style={{ height: '48px', borderBottom: '1px solid #333', width: '120px', margin: '0 auto' }} />
                }
                <div style={{ fontSize: '9pt', fontWeight: 'bold', marginTop: '4px' }}>{sig?.name || sig?.label || 'Signature'}</div>
                <div style={{ fontSize: '8pt', color: '#666' }}>{sig?.designation || ''}</div>
              </div>
            ))}
          </div>
        )
      }
      case 'image': case 'logo':
        return c
          ? <div style={{ textAlign: props.text_align || 'center' }}><img src={c} alt="" style={{ maxWidth: props.width || '200px', maxHeight: '120px', objectFit: 'contain' }} /></div>
          : (
            <label style={{ display: 'block', textAlign: 'center', cursor: 'pointer' }}>
              <div style={{ background: '#f1f5f9', border: '2px dashed #94a3b8', borderRadius: '6px', padding: '20px', fontSize: '10px', color: '#94a3b8' }}>
                <Upload size={20} style={{ margin: '0 auto 6px', opacity: 0.5 }} />
                <div>Click to upload {block.type}</div>
              </div>
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileUpload} />
            </label>
          )
      case 'qr_code':
        return <QRBlockRenderer content={c} />
      default:
        return <div style={baseStyle}>{typeof c === 'string' ? c : JSON.stringify(c)}</div>
    }
  }

  return (
    <div
      onClick={e => { e.stopPropagation(); onSelect(block.id) }}
      onDoubleClick={e => { e.stopPropagation(); if (isText && !block.is_locked) onStartEdit(block.id) }}
      style={{
        position: 'relative',
        padding: '6px 8px',
        borderRadius: 6,
        cursor: block.is_locked ? 'default' : 'pointer',
        boxShadow: selected ? '0 0 0 2px var(--accent-blue)' : 'none',
        background: block.is_hidden ? 'rgba(0,0,0,0.03)' : (selected ? 'rgba(37,99,235,0.04)' : 'transparent'),
        opacity: block.is_hidden ? 0.4 : 1,
        outline: 'none',
        transition: 'box-shadow 0.15s',
      }}
    >
      {/* Quick action buttons */}
      {selected && !block.is_locked && (
        <div style={{ position: 'absolute', right: -2, top: -2, display: 'flex', gap: 2, zIndex: 10 }}>
          <button onClick={e => { e.stopPropagation(); onDuplicate(block.id) }}
            style={{ width: 20, height: 20, borderRadius: 4, background: '#3b82f6', color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Copy size={9} />
          </button>
          <button onClick={e => { e.stopPropagation(); onDelete(block.id) }}
            style={{ width: 20, height: 20, borderRadius: 4, background: '#ef4444', color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={9} />
          </button>
        </div>
      )}
      {block.is_locked && selected && (
        <div style={{ position: 'absolute', right: -2, top: -2, zIndex: 10 }}>
          <span style={{ fontSize: 9, background: '#f59e0b', color: '#fff', borderRadius: 4, padding: '1px 4px' }}>Locked</span>
        </div>
      )}
      {editing && isText && (
        <div style={{ position: 'absolute', top: -22, left: 0, fontSize: 9, background: 'var(--accent-blue)', color: '#fff', borderRadius: 4, padding: '2px 6px', zIndex: 10 }}>
          Editing — click outside to finish
        </div>
      )}
      {renderContent()}
    </div>
  )
}

// ─── Sortable wrapper (dnd-kit) ───────────────────────────────────────────────

function SortableBlock({ block, ...rest }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: block.id,
    disabled: block.is_locked,
  })
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        position: 'relative',
        paddingLeft: 28,
      }}
    >
      <div
        {...attributes}
        {...listeners}
        style={{
          position: 'absolute',
          left: 4,
          top: '50%',
          transform: 'translateY(-50%)',
          cursor: block.is_locked ? 'not-allowed' : 'grab',
          color: '#94a3b8',
          opacity: 0,
          transition: 'opacity 0.15s',
        }}
        className="drag-handle"
      >
        <GripVertical size={13} />
      </div>
      <BlockPreview block={block} {...rest} />
    </div>
  )
}

// ─── Table Cell Editor ────────────────────────────────────────────────────────

function TableEditor({ block, onChange }) {
  const c = block.content || {}
  const headers = c.headers || []
  const rows = c.rows || []
  const set = (patch) => onChange({ ...block, content: { ...c, ...patch } })

  const addRow    = () => set({ rows: [...rows, Array(headers.length).fill('')] })
  const addCol    = () => set({ headers: [...headers, `Col ${headers.length + 1}`], rows: rows.map(r => [...r, '']) })
  const removeRow = (ri) => set({ rows: rows.filter((_, i) => i !== ri) })
  const removeCol = (ci) => set({ headers: headers.filter((_, i) => i !== ci), rows: rows.map(r => r.filter((_, i) => i !== ci)) })
  const setHeader = (ci, v) => { const h = [...headers]; h[ci] = v; set({ headers: h }) }
  const setCell   = (ri, ci, v) => { const nr = rows.map(r => [...r]); nr[ri][ci] = v; set({ rows: nr }) }

  return (
    <div style={{ padding: '12px 16px' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <button onClick={addRow} style={btnSm}>+ Row</button>
        <button onClick={addCol} style={btnSm}>+ Column</button>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-secondary)' }}>
          <input type="checkbox" checked={!!c.stripe_rows} onChange={e => set({ stripe_rows: e.target.checked })} />
          Stripes
        </label>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 11 }}>
          {c.has_header !== false && (
            <thead>
              <tr>
                {headers.map((h, ci) => (
                  <th key={ci} style={{ padding: 2, border: '1px solid var(--border-color)', minWidth: 80 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <input value={h} onChange={e => setHeader(ci, e.target.value)}
                        style={{ flex: 1, border: 'none', outline: 'none', background: 'var(--bg-secondary)', padding: '3px 5px', fontSize: 11, color: 'var(--text-primary)', borderRadius: 3 }} />
                      <button onClick={() => removeCol(ci)} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}><X size={10} /></button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => (
                  <td key={ci} style={{ padding: 2, border: '1px solid var(--border-color)' }}>
                    <input value={cell} onChange={e => setCell(ri, ci, e.target.value)}
                      style={{ width: '100%', border: 'none', outline: 'none', background: 'transparent', padding: '3px 5px', fontSize: 11, color: 'var(--text-primary)' }} />
                  </td>
                ))}
                <td style={{ padding: '0 4px' }}>
                  <button onClick={() => removeRow(ri)} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}><X size={10} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 8 }}>
        <label style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>Header Background</label>
        <input type="color" value={c.header_bg || '#1e3a5f'} onChange={e => set({ header_bg: e.target.value })}
          style={{ width: '100%', height: 28, borderRadius: 6, border: '1px solid var(--border-color)', cursor: 'pointer' }} />
      </div>
    </div>
  )
}

// ─── Salary Table Editor ──────────────────────────────────────────────────────

function SalaryTableEditor({ block, onChange }) {
  const c = block.content || {}
  const earnings   = c.earnings   || []
  const deductions = c.deductions || []
  const setC = (patch) => onChange({ ...block, content: { ...c, ...patch } })

  const addEarning    = () => setC({ earnings:   [...earnings,   { label: 'New Earning',   value: '' }] })
  const addDeduction  = () => setC({ deductions: [...deductions, { label: 'New Deduction', value: '' }] })
  const delEarning    = (i) => setC({ earnings:   earnings.filter((_, j) => j !== i) })
  const delDeduction  = (i) => setC({ deductions: deductions.filter((_, j) => j !== i) })
  const setEarning    = (i, k, v) => { const arr = earnings.map(r => ({ ...r })); arr[i][k] = v; setC({ earnings: arr }) }
  const setDeduction  = (i, k, v) => { const arr = deductions.map(r => ({ ...r })); arr[i][k] = v; setC({ deductions: arr }) }

  const rowStyle = { display: 'flex', gap: 4, alignItems: 'center', marginBottom: 4 }

  return (
    <div style={{ padding: '12px 16px' }}>
      <div style={{ marginBottom: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)' }}>Earnings</span>
          <button onClick={addEarning} style={btnSm}>+ Add</button>
        </div>
        {earnings.map((row, i) => (
          <div key={i} style={rowStyle}>
            <input value={row.label} onChange={e => setEarning(i, 'label', e.target.value)} placeholder="Label"
              style={{ ...inputSm, flex: '1 1 50%' }} />
            <input value={row.value} onChange={e => setEarning(i, 'value', e.target.value)} placeholder="Value / {{var}}"
              style={{ ...inputSm, flex: '1 1 50%' }} />
            <button onClick={() => delEarning(i)} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}><X size={11} /></button>
          </div>
        ))}
      </div>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)' }}>Deductions</span>
          <button onClick={addDeduction} style={btnSm}>+ Add</button>
        </div>
        {deductions.map((row, i) => (
          <div key={i} style={rowStyle}>
            <input value={row.label} onChange={e => setDeduction(i, 'label', e.target.value)} placeholder="Label"
              style={{ ...inputSm, flex: '1 1 50%' }} />
            <input value={row.value} onChange={e => setDeduction(i, 'value', e.target.value)} placeholder="Value / {{var}}"
              style={{ ...inputSm, flex: '1 1 50%' }} />
            <button onClick={() => delDeduction(i)} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}><X size={11} /></button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Small shared styles ──────────────────────────────────────────────────────

const btnSm = {
  fontSize: 11, padding: '3px 8px', borderRadius: 5, border: '1px solid var(--border-color)',
  background: 'var(--bg-secondary)', color: 'var(--text-primary)', cursor: 'pointer',
}
const inputSm = {
  fontSize: 11, padding: '4px 6px', borderRadius: 5, border: '1px solid var(--border-color)',
  background: 'var(--bg-secondary)', color: 'var(--text-primary)', outline: 'none',
}

// ─── Block Inline Editor (right panel Content tab) ────────────────────────────

function BlockInlineEditor({ block, onChange }) {
  if (!block) return <div style={{ padding: 16, color: 'var(--text-disabled)', fontSize: 12, textAlign: 'center' }}>Select a block to edit its content</div>

  const setC = (val) => onChange({ ...block, content: val })

  if (['text', 'paragraph', 'heading'].includes(block.type)) {
    return (
      <div style={{ padding: 16 }}>
        <label style={labelSt}>Content (HTML)</label>
        <div
          contentEditable
          suppressContentEditableWarning
          dangerouslySetInnerHTML={{ __html: block.content || '' }}
          onBlur={e => setC(e.currentTarget.innerHTML)}
          style={{ ...inputSm, minHeight: 80, lineHeight: 1.6, display: 'block', whiteSpace: 'pre-wrap', wordBreak: 'break-word', width: '100%', boxSizing: 'border-box', outline: 'none' }}
        />
        <p style={{ fontSize: 10, color: 'var(--text-disabled)', marginTop: 4 }}>Use {'{{placeholder}}'} for variables. Double-click block on canvas to edit inline.</p>
      </div>
    )
  }

  if (block.type === 'list_items') {
    const items = Array.isArray(block.content) ? block.content : [block.content]
    return (
      <div style={{ padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <label style={labelSt}>List Items</label>
          <button onClick={() => setC([...items, 'New item'])} style={btnSm}>+ Add</button>
        </div>
        {items.map((item, i) => (
          <div key={i} style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
            <input value={item} onChange={e => { const n = [...items]; n[i] = e.target.value; setC(n) }}
              style={{ ...inputSm, flex: 1 }} />
            <button onClick={() => setC(items.filter((_, j) => j !== i))}
              style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}><X size={11} /></button>
          </div>
        ))}
      </div>
    )
  }

  if (block.type === 'two_column') {
    const c = block.content || {}
    return (
      <div style={{ padding: 16 }}>
        <label style={labelSt}>Left Column</label>
        <div contentEditable suppressContentEditableWarning dangerouslySetInnerHTML={{ __html: c.left || '' }}
          onBlur={e => setC({ ...c, left: e.currentTarget.innerHTML })}
          style={{ ...inputSm, minHeight: 60, display: 'block', marginBottom: 10, whiteSpace: 'pre-wrap', outline: 'none', width: '100%', boxSizing: 'border-box' }} />
        <label style={labelSt}>Right Column</label>
        <div contentEditable suppressContentEditableWarning dangerouslySetInnerHTML={{ __html: c.right || '' }}
          onBlur={e => setC({ ...c, right: e.currentTarget.innerHTML })}
          style={{ ...inputSm, minHeight: 60, display: 'block', whiteSpace: 'pre-wrap', outline: 'none', width: '100%', boxSizing: 'border-box' }} />
      </div>
    )
  }

  if (block.type === 'table') {
    return <TableEditor block={block} onChange={onChange} />
  }

  if (block.type === 'salary_table') {
    return <SalaryTableEditor block={block} onChange={onChange} />
  }

  if (block.type === 'employee_details' || block.type === 'company_details') {
    const entries = Object.entries(block.content || {})
    const setEntry = (oldKey, newKey, newVal) => {
      const obj = {}
      entries.forEach(([k, v]) => { obj[k === oldKey ? newKey : k] = k === oldKey ? newVal : v })
      setC(obj)
    }
    const addRow = () => setC({ ...block.content, 'New Field': '' })
    const delRow = (key) => { const o = { ...block.content }; delete o[key]; setC(o) }
    return (
      <div style={{ padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <label style={labelSt}>Fields</label>
          <button onClick={addRow} style={btnSm}>+ Add</button>
        </div>
        {entries.map(([k, v]) => (
          <div key={k} style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
            <input value={k} onChange={e => setEntry(k, e.target.value, v)} placeholder="Label" style={{ ...inputSm, flex: '0 0 40%' }} />
            <input value={v} onChange={e => setEntry(k, k, e.target.value)} placeholder="Value / {{var}}" style={{ ...inputSm, flex: 1 }} />
            <button onClick={() => delRow(k)} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}><X size={11} /></button>
          </div>
        ))}
      </div>
    )
  }

  if (block.type === 'signature') {
    const sigs = Array.isArray(block.content) ? block.content : [block.content || {}]
    const setSig = (i, patch) => { const arr = sigs.map((s, j) => j === i ? { ...s, ...patch } : s); setC(arr) }
    const addSig = () => setC([...sigs, { label: 'Signatory', name: '', designation: '' }])
    const delSig = (i) => setC(sigs.filter((_, j) => j !== i))
    const uploadSig = (i, file) => {
      if (!file) return
      const reader = new FileReader()
      reader.onload = e => setSig(i, { image: e.target.result })
      reader.readAsDataURL(file)
    }
    return (
      <div style={{ padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <label style={labelSt}>Signatories</label>
          <button onClick={addSig} style={btnSm}>+ Add</button>
        </div>
        {sigs.map((sig, i) => (
          <div key={i} style={{ border: '1px solid var(--border-color)', borderRadius: 6, padding: 8, marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>Signatory {i + 1}</span>
              <button onClick={() => delSig(i)} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontSize: 10 }}>Remove</button>
            </div>
            <input value={sig.name || ''} onChange={e => setSig(i, { name: e.target.value })} placeholder="Name (e.g. {{reporting_manager}})"
              style={{ ...inputSm, width: '100%', boxSizing: 'border-box', marginBottom: 4 }} />
            <input value={sig.designation || ''} onChange={e => setSig(i, { designation: e.target.value })} placeholder="Designation"
              style={{ ...inputSm, width: '100%', boxSizing: 'border-box', marginBottom: 6 }} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 11, color: 'var(--accent-blue)' }}>
              <Upload size={11} /> Upload signature image
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => uploadSig(i, e.target.files?.[0])} />
            </label>
            {sig.image && <button onClick={() => setSig(i, { image: undefined })} style={{ fontSize: 10, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}>Remove image</button>}
          </div>
        ))}
      </div>
    )
  }

  if (block.type === 'image' || block.type === 'logo') {
    return (
      <div style={{ padding: 16 }}>
        <label style={labelSt}>Upload Image</label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '8px 12px', border: '1px dashed var(--border-color)', borderRadius: 6, marginBottom: 8, fontSize: 12, color: 'var(--accent-blue)' }}>
          <Upload size={14} /> Choose file
          <input type="file" accept="image/*" style={{ display: 'none' }}
            onChange={e => {
              const file = e.target.files?.[0]
              if (!file) return
              const reader = new FileReader()
              reader.onload = ev => onChange({ ...block, content: ev.target.result })
              reader.readAsDataURL(file)
            }} />
        </label>
        <label style={labelSt}>— or enter URL —</label>
        <input value={typeof block.content === 'string' && block.content.startsWith('http') ? block.content : ''}
          onChange={e => onChange({ ...block, content: e.target.value })}
          placeholder="https://..."
          style={{ ...inputSm, width: '100%', boxSizing: 'border-box' }} />
        {block.content && (
          <button onClick={() => onChange({ ...block, content: '' })}
            style={{ marginTop: 6, fontSize: 11, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}>
            Clear image
          </button>
        )}
      </div>
    )
  }

  if (block.type === 'qr_code') {
    return (
      <div style={{ padding: 16 }}>
        <label style={labelSt}>Verification URL</label>
        <input value={block.content || ''} onChange={e => setC(e.target.value)}
          placeholder="https://verify.example.com/{{document_number}}"
          style={{ ...inputSm, width: '100%', boxSizing: 'border-box' }} />
        <p style={{ fontSize: 10, color: 'var(--text-disabled)', marginTop: 4 }}>Use {'{{document_number}}'} for unique document ID</p>
      </div>
    )
  }

  return null
}

const labelSt = { fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }

// ─── Properties Panel ─────────────────────────────────────────────────────────

function PropertiesPanel({ block, onChange, branding, onBrandingChange, header, onHeaderChange, footer, onFooterChange, watermark, onWatermarkChange }) {
  if (!block) {
    return (
      <div style={{ padding: 16, overflowY: 'auto' }}>
        <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12 }}>Branding</p>

        <label style={labelSt}>Primary Color</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 4 }}>
          {['#1e3a5f','#2563eb','#10b981','#f59e0b','#ef4444','#8b5cf6','#0ea5e9','#374151'].map(c => (
            <button key={c} onClick={() => onBrandingChange('primary_color', c)}
              style={{ width: 22, height: 22, borderRadius: '50%', background: c, border: branding?.primary_color === c ? '2px solid #fff' : '2px solid transparent', outline: branding?.primary_color === c ? `2px solid ${c}` : 'none', cursor: 'pointer' }} />
          ))}
        </div>
        <input type="color" value={branding?.primary_color || '#1e3a5f'} onChange={e => onBrandingChange('primary_color', e.target.value)}
          style={{ width: '100%', height: 28, borderRadius: 6, border: '1px solid var(--border-color)', cursor: 'pointer', marginBottom: 10 }} />

        <label style={labelSt}>Font Family</label>
        <select value={branding?.font_family || 'Arial'} onChange={e => onBrandingChange('font_family', e.target.value)}
          style={{ ...inputSm, width: '100%', boxSizing: 'border-box', marginBottom: 10 }}>
          {FONTS.map(f => <option key={f} value={f}>{f}</option>)}
        </select>

        <label style={labelSt}>Base Font Size (pt)</label>
        <input type="number" min={8} max={18} value={branding?.font_size || 11} onChange={e => onBrandingChange('font_size', +e.target.value)}
          style={{ ...inputSm, width: '100%', boxSizing: 'border-box', marginBottom: 10 }} />

        <label style={labelSt}>Text Color</label>
        <input type="color" value={branding?.text_color || '#1a1a1a'} onChange={e => onBrandingChange('text_color', e.target.value)}
          style={{ width: '100%', height: 28, borderRadius: 6, border: '1px solid var(--border-color)', cursor: 'pointer', marginBottom: 10 }} />

        <label style={labelSt}>Heading Color</label>
        <input type="color" value={branding?.heading_color || '#1e3a5f'} onChange={e => onBrandingChange('heading_color', e.target.value)}
          style={{ width: '100%', height: 28, borderRadius: 6, border: '1px solid var(--border-color)', cursor: 'pointer', marginBottom: 16 }} />

        <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 10 }}>Watermark</p>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={watermark?.enabled || false} onChange={e => onWatermarkChange({ ...watermark, enabled: e.target.checked })} />
          Enable watermark
        </label>
        {watermark?.enabled && (
          <>
            <input value={watermark.text || 'CONFIDENTIAL'} onChange={e => onWatermarkChange({ ...watermark, text: e.target.value })}
              placeholder="Watermark text" style={{ ...inputSm, width: '100%', boxSizing: 'border-box', marginBottom: 6 }} />
            <label style={labelSt}>Opacity ({Math.round((watermark.opacity || 0.1) * 100)}%)</label>
            <input type="range" min={5} max={50} value={Math.round((watermark.opacity || 0.1) * 100)}
              onChange={e => onWatermarkChange({ ...watermark, opacity: +e.target.value / 100 })}
              style={{ width: '100%', marginBottom: 6 }} />
            <label style={labelSt}>Rotation ({watermark.rotation || -45}°)</label>
            <input type="range" min={-90} max={90} value={watermark.rotation || -45}
              onChange={e => onWatermarkChange({ ...watermark, rotation: +e.target.value })}
              style={{ width: '100%' }} />
          </>
        )}
      </div>
    )
  }

  const props = block.properties || {}
  const setProp = (key, val) => onChange({ ...block, properties: { ...props, [key]: val } })

  return (
    <div style={{ padding: 16, overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', textTransform: 'capitalize' }}>{block.type.replace(/_/g, ' ')}</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={() => onChange({ ...block, is_locked: !block.is_locked })}
            title={block.is_locked ? 'Unlock' : 'Lock'}
            style={{ ...btnSm, color: block.is_locked ? '#f59e0b' : 'var(--text-secondary)' }}>
            {block.is_locked ? <Lock size={11} /> : <Unlock size={11} />}
          </button>
          <button onClick={() => onChange({ ...block, is_hidden: !block.is_hidden })}
            title={block.is_hidden ? 'Show' : 'Hide'}
            style={{ ...btnSm }}>
            {block.is_hidden ? <EyeOff size={11} /> : <Eye size={11} />}
          </button>
        </div>
      </div>

      {/* Alignment */}
      {['heading','text','paragraph','list_items','two_column'].includes(block.type) && (
        <div style={{ marginBottom: 10 }}>
          <label style={labelSt}>Alignment</label>
          <div style={{ display: 'flex', gap: 4 }}>
            {[['left', <AlignLeft size={13} />], ['center', <AlignCenter size={13} />], ['right', <AlignRight size={13} />]].map(([a, icon]) => (
              <button key={a} onClick={() => setProp('text_align', a)}
                style={{ flex: 1, padding: '5px', borderRadius: 5, border: '1px solid var(--border-color)', background: props.text_align === a ? 'var(--accent-blue)' : 'var(--bg-secondary)', color: props.text_align === a ? '#fff' : 'var(--text-secondary)', cursor: 'pointer', display: 'flex', justifyContent: 'center' }}>
                {icon}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Font size */}
      {['heading','text','paragraph','list_items'].includes(block.type) && (
        <div style={{ marginBottom: 10 }}>
          <label style={labelSt}>Font Size (pt)</label>
          <input type="number" min={7} max={72} value={props.font_size || 11} onChange={e => setProp('font_size', +e.target.value)}
            style={{ ...inputSm, width: '100%', boxSizing: 'border-box' }} />
        </div>
      )}

      {/* Bold / Italic */}
      {['heading','text','paragraph'].includes(block.type) && (
        <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
          {[['font_weight','bold','normal','Bold'],['font_style','italic','normal','Italic']].map(([prop, on, off, label]) => (
            <button key={prop} onClick={() => setProp(prop, props[prop] === on ? off : on)}
              style={{ flex: 1, padding: '5px 8px', borderRadius: 5, border: '1px solid var(--border-color)', background: props[prop] === on ? 'var(--accent-blue)' : 'var(--bg-secondary)', color: props[prop] === on ? '#fff' : 'var(--text-secondary)', cursor: 'pointer', fontSize: 11, fontWeight: on === 'bold' ? 700 : 400, fontStyle: on === 'italic' ? 'italic' : 'normal' }}>
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Line height */}
      {['heading','text','paragraph'].includes(block.type) && (
        <div style={{ marginBottom: 10 }}>
          <label style={labelSt}>Line Height</label>
          <input type="number" min={1} max={3} step={0.1} value={props.line_height || 1.5} onChange={e => setProp('line_height', +e.target.value)}
            style={{ ...inputSm, width: '100%', boxSizing: 'border-box' }} />
        </div>
      )}

      {/* Text color */}
      {['heading','text','paragraph','list_items'].includes(block.type) && (
        <div style={{ marginBottom: 10 }}>
          <label style={labelSt}>Text Color</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: 4 }}>
            {COLORS_PRESET.map(c => (
              <button key={c} onClick={() => setProp('color', c)}
                style={{ width: 18, height: 18, borderRadius: '50%', background: c, border: props.color === c ? '2px solid #3b82f6' : '1px solid #e5e7eb', cursor: 'pointer' }} />
            ))}
          </div>
          <input type="color" value={props.color || '#000000'} onChange={e => setProp('color', e.target.value)}
            style={{ width: '100%', height: 24, borderRadius: 5, border: '1px solid var(--border-color)', cursor: 'pointer' }} />
        </div>
      )}

      {/* Background color */}
      <div style={{ marginBottom: 10 }}>
        <label style={labelSt}>Background</label>
        <input type="color" value={props.background_color || '#ffffff'} onChange={e => setProp('background_color', e.target.value === '#ffffff' ? 'transparent' : e.target.value)}
          style={{ width: '100%', height: 24, borderRadius: 5, border: '1px solid var(--border-color)', cursor: 'pointer' }} />
      </div>

      {/* Spacing */}
      <div style={{ marginBottom: 10 }}>
        <label style={labelSt}>Spacing (px)</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {[['margin_top','Top'],['margin_bottom','Bottom'],['padding_h','Pad H'],['padding_v','Pad V']].map(([k, l]) => (
            <div key={k}>
              <span style={{ fontSize: 10, color: 'var(--text-disabled)' }}>{l}</span>
              <input type="number" min={0} max={100} value={props[k] || 0} onChange={e => setProp(k, +e.target.value)}
                style={{ ...inputSm, width: '100%', boxSizing: 'border-box' }} />
            </div>
          ))}
        </div>
      </div>

      {/* Spacer height */}
      {block.type === 'spacer' && (
        <div style={{ marginBottom: 10 }}>
          <label style={labelSt}>Spacer Height</label>
          <input value={props.height || '20px'} onChange={e => setProp('height', e.target.value)}
            style={{ ...inputSm, width: '100%', boxSizing: 'border-box' }} />
        </div>
      )}

      {/* Divider thickness */}
      {block.type === 'divider' && (
        <>
          <div style={{ marginBottom: 10 }}>
            <label style={labelSt}>Thickness (px)</label>
            <input type="number" min={1} max={8} value={props.thickness || 1} onChange={e => setProp('thickness', +e.target.value)}
              style={{ ...inputSm, width: '100%', boxSizing: 'border-box' }} />
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={labelSt}>Color</label>
            <input type="color" value={props.color || '#e2e8f0'} onChange={e => setProp('color', e.target.value)}
              style={{ width: '100%', height: 28, borderRadius: 6, border: '1px solid var(--border-color)', cursor: 'pointer' }} />
          </div>
        </>
      )}

      {/* Image width */}
      {['image','logo'].includes(block.type) && (
        <div style={{ marginBottom: 10 }}>
          <label style={labelSt}>Max Width</label>
          <input value={props.width || '200px'} onChange={e => setProp('width', e.target.value)}
            style={{ ...inputSm, width: '100%', boxSizing: 'border-box' }} />
        </div>
      )}
    </div>
  )
}

// ─── Placeholder Browser ──────────────────────────────────────────────────────

function PlaceholderBrowser({ onInsert }) {
  const [open, setOpen] = useState({})
  const [search, setSearch] = useState('')
  const toggle = g => setOpen(p => ({ ...p, [g]: !p[g] }))

  return (
    <div style={{ padding: 12 }}>
      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search variables…"
        style={{ ...inputSm, width: '100%', boxSizing: 'border-box', marginBottom: 10 }} />
      <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8 }}>
        Click to append to selected block
      </p>
      {Object.entries(PLACEHOLDER_GROUPS).map(([group, keys]) => {
        const filtered = search ? keys.filter(k => k.includes(search.toLowerCase())) : keys
        if (search && filtered.length === 0) return null
        return (
          <div key={group} style={{ marginBottom: 6 }}>
            <button onClick={() => toggle(group)}
              style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px', borderRadius: 6, border: 'none', background: 'var(--bg-secondary)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
              <span>{group}</span>
              {(open[group] || search) ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            </button>
            {(open[group] || search) && (
              <div style={{ paddingLeft: 8, marginTop: 2 }}>
                {filtered.map(key => (
                  <button key={key} onClick={() => onInsert(`{{${key}}}`)}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '3px 8px', borderRadius: 4, border: 'none', background: 'none', cursor: 'pointer', fontSize: 11, fontFamily: 'monospace', color: 'var(--accent-blue)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-secondary)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                    {'{{' + key + '}}'}
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Layers Panel ─────────────────────────────────────────────────────────────

function LayersPanel({ blocks, selectedBlockId, onSelect, onUpdate, onDelete, onReorder }) {
  const [renaming, setRenaming] = useState(null)
  const [renameVal, setRenameVal] = useState('')

  const startRename = (b) => { setRenaming(b.id); setRenameVal(b.label || b.type.replace(/_/g, ' ')) }
  const commitRename = (b) => { onUpdate({ ...b, label: renameVal }); setRenaming(null) }

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      {blocks.length === 0 && (
        <p style={{ fontSize: 11, color: 'var(--text-disabled)', textAlign: 'center', padding: '20px 12px' }}>No blocks yet</p>
      )}
      {[...blocks].reverse().map((b, ri) => {
        const realIdx = blocks.length - 1 - ri
        const isSel = b.id === selectedBlockId
        return (
          <div key={b.id}
            onClick={() => onSelect(b.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px',
              background: isSel ? 'rgba(37,99,235,0.08)' : 'transparent',
              borderLeft: isSel ? '2px solid var(--accent-blue)' : '2px solid transparent',
              cursor: 'pointer', userSelect: 'none',
            }}>
            {/* Layer number */}
            <span style={{ fontSize: 9, color: 'var(--text-disabled)', width: 14, textAlign: 'right', flexShrink: 0 }}>{realIdx + 1}</span>

            {/* Name */}
            <div style={{ flex: 1, minWidth: 0 }}>
              {renaming === b.id
                ? <input autoFocus value={renameVal} onChange={e => setRenameVal(e.target.value)}
                    onBlur={() => commitRename(b)} onKeyDown={e => e.key === 'Enter' && commitRename(b)}
                    style={{ ...inputSm, width: '100%', boxSizing: 'border-box', padding: '1px 4px', fontSize: 11 }} />
                : <span onDoubleClick={() => startRename(b)} style={{ fontSize: 11, color: isSel ? 'var(--accent-blue)' : 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}
                    title="Double-click to rename">
                    {b.label || b.type.replace(/_/g, ' ')}
                  </span>
              }
            </div>

            {/* Controls */}
            <div style={{ display: 'flex', gap: 1, flexShrink: 0 }}>
              <button onClick={e => { e.stopPropagation(); onUpdate({ ...b, is_hidden: !b.is_hidden }) }}
                title={b.is_hidden ? 'Show' : 'Hide'}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: b.is_hidden ? '#94a3b8' : 'var(--text-secondary)', padding: '1px 2px' }}>
                {b.is_hidden ? <EyeOff size={10} /> : <Eye size={10} />}
              </button>
              <button onClick={e => { e.stopPropagation(); onUpdate({ ...b, is_locked: !b.is_locked }) }}
                title={b.is_locked ? 'Unlock' : 'Lock'}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: b.is_locked ? '#f59e0b' : 'var(--text-secondary)', padding: '1px 2px' }}>
                {b.is_locked ? <Lock size={10} /> : <Unlock size={10} />}
              </button>
              <button onClick={e => { e.stopPropagation(); if (realIdx > 0) onReorder(realIdx, realIdx - 1) }}
                disabled={realIdx === 0}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '1px 2px', opacity: realIdx === 0 ? 0.3 : 1 }}>
                <ChevronUp size={10} />
              </button>
              <button onClick={e => { e.stopPropagation(); if (realIdx < blocks.length - 1) onReorder(realIdx, realIdx + 1) }}
                disabled={realIdx === blocks.length - 1}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '1px 2px', opacity: realIdx === blocks.length - 1 ? 0.3 : 1 }}>
                <ChevronDown size={10} />
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Header Designer (in left panel Settings tab) ─────────────────────────────

function HeaderDesigner({ header, onChange, branding }) {
  const upload = (file) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = e => onChange({ ...header, logo: e.target.result })
    reader.readAsDataURL(file)
  }
  return (
    <div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, cursor: 'pointer', fontSize: 11, color: 'var(--text-secondary)' }}>
        <input type="checkbox" checked={header.enabled} onChange={e => onChange({ ...header, enabled: e.target.checked })} />
        Show Header
      </label>
      {header.enabled && (
        <>
          <label style={labelSt}>Company Name</label>
          <input value={header.company_name || ''} onChange={e => onChange({ ...header, company_name: e.target.value })}
            placeholder="{{company_name}} or literal name"
            style={{ ...inputSm, width: '100%', boxSizing: 'border-box', marginBottom: 6 }} />

          <label style={labelSt}>Address</label>
          <input value={header.company_address || ''} onChange={e => onChange({ ...header, company_address: e.target.value })}
            placeholder="{{company_address}}"
            style={{ ...inputSm, width: '100%', boxSizing: 'border-box', marginBottom: 6 }} />

          <label style={labelSt}>Phone / Email</label>
          <input value={header.company_contact || ''} onChange={e => onChange({ ...header, company_contact: e.target.value })}
            placeholder="{{company_phone}} | {{company_email}}"
            style={{ ...inputSm, width: '100%', boxSizing: 'border-box', marginBottom: 8 }} />

          <label style={labelSt}>Logo</label>
          {header.logo
            ? <div style={{ marginBottom: 6 }}>
                <img src={header.logo} alt="logo" style={{ maxHeight: 40, maxWidth: 120, objectFit: 'contain', display: 'block', marginBottom: 4 }} />
                <button onClick={() => onChange({ ...header, logo: '' })} style={{ fontSize: 10, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}>Remove logo</button>
              </div>
            : null
          }
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 11, color: 'var(--accent-blue)', marginBottom: 8 }}>
            <Upload size={11} /> Upload logo
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => upload(e.target.files?.[0])} />
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, cursor: 'pointer', fontSize: 11, color: 'var(--text-secondary)' }}>
            <input type="checkbox" checked={header.border_bottom !== false} onChange={e => onChange({ ...header, border_bottom: e.target.checked })} />
            Bottom border line
          </label>
        </>
      )}
    </div>
  )
}

function FooterDesigner({ footer, onChange }) {
  return (
    <div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, cursor: 'pointer', fontSize: 11, color: 'var(--text-secondary)' }}>
        <input type="checkbox" checked={footer.enabled} onChange={e => onChange({ ...footer, enabled: e.target.checked })} />
        Show Footer
      </label>
      {footer.enabled && (
        <>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, cursor: 'pointer', fontSize: 11, color: 'var(--text-secondary)' }}>
            <input type="checkbox" checked={footer.show_page_numbers} onChange={e => onChange({ ...footer, show_page_numbers: e.target.checked })} />
            Page numbers
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, cursor: 'pointer', fontSize: 11, color: 'var(--text-secondary)' }}>
            <input type="checkbox" checked={footer.show_generated_date} onChange={e => onChange({ ...footer, show_generated_date: e.target.checked })} />
            Generated date
          </label>
          <label style={labelSt}>Footer Text / Disclaimer</label>
          <input value={footer.disclaimer || ''} onChange={e => onChange({ ...footer, disclaimer: e.target.value })}
            placeholder="Confidential | © Company Name"
            style={{ ...inputSm, width: '100%', boxSizing: 'border-box', marginBottom: 6 }} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 11, color: 'var(--text-secondary)' }}>
            <input type="checkbox" checked={footer.border_top !== false} onChange={e => onChange({ ...footer, border_top: e.target.checked })} />
            Top border line
          </label>
        </>
      )}
    </div>
  )
}

// ─── Interactive Header Canvas ────────────────────────────────────────────────

const HEADER_PRESETS = [
  { id: 'text-left-logo-right', label: '⬛→',  logo_align: 'right',  name_side: 'left'   },
  { id: 'logo-left-text-right', label: '←⬛',  logo_align: 'left',   name_side: 'right'  },
  { id: 'centered',             label: '↕',    logo_align: 'center', name_side: 'center' },
  { id: 'text-only',            label: 'T',    logo_align: 'none',   name_side: 'left'   },
]

function InteractiveHeaderCanvas({ header, onChange, branding }) {
  const [logoSel, setLogoSel] = useState(false)
  const [hoverBar, setHoverBar] = useState(false)
  const headerRef = useRef(null)
  const primary = header.border_color || branding?.primary_color || '#1e3a5f'
  const logoAlign = header.logo_align || 'right'
  const nameSide  = header.name_side  || 'left'

  const startLogoDrag = useCallback((e) => {
    e.preventDefault(); e.stopPropagation()
    const rect = headerRef.current.getBoundingClientRect()
    const startX = e.clientX - (header.logo_x || 0)
    const startY = e.clientY - (header.logo_y || 0)
    const onMove = (ev) => {
      const x = Math.max(0, Math.min(ev.clientX - startX, rect.width - (header.logo_width || 120)))
      const y = Math.max(0, Math.min(ev.clientY - startY, (header.height || 80) - (header.logo_height || 48)))
      onChange({ ...header, logo_x: Math.round(x), logo_y: Math.round(y), logo_free: true })
    }
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [header, onChange])

  const startLogoResize = useCallback((dir, e) => {
    e.preventDefault(); e.stopPropagation()
    const sw = header.logo_width || 120, sh = header.logo_height || 48
    const sx = e.clientX, sy = e.clientY
    const aspect = sw / sh
    const onMove = (ev) => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy
      let nw = sw, nh = sh
      if (dir.includes('e')) nw = Math.max(20, sw + dx)
      if (dir.includes('w')) nw = Math.max(20, sw - dx)
      if (dir.includes('s')) nh = Math.max(10, sh + dy)
      if (dir.includes('n')) nh = Math.max(10, sh - dy)
      if (header.logo_lock_aspect !== false) {
        if (dir.includes('e') || dir.includes('w')) nh = nw / aspect
        else nw = nh * aspect
      }
      onChange({ ...header, logo_width: Math.round(nw), logo_height: Math.round(nh) })
    }
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [header, onChange])

  const logoPositionStyle = () => {
    const w = header.logo_width || 120, h = header.logo_height || 48
    if (header.logo_free) return { position: 'absolute', left: header.logo_x || 0, top: header.logo_y || 0, width: w, height: h }
    if (logoAlign === 'left')   return { position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', width: w, height: h }
    if (logoAlign === 'center') return { position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: w, height: h }
    if (logoAlign === 'right')  return { position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)', width: w, height: h }
    return { position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)', width: w, height: h }
  }

  const textBlockStyle = () => {
    const hasLogo = !!header.logo && logoAlign !== 'none'
    const lw = (header.logo_width || 120) + 12
    if (nameSide === 'center') return { position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center', width: hasLogo ? `calc(100% - ${lw}px)` : '100%' }
    if (nameSide === 'right')  return { position: 'absolute', right: hasLogo && logoAlign === 'left' ? lw : 0, top: 0, textAlign: 'right', maxWidth: `calc(100% - ${hasLogo ? lw : 0}px)` }
    return { position: 'absolute', left: hasLogo && logoAlign === 'left' ? lw : 0, top: 0, maxWidth: `calc(100% - ${hasLogo ? lw : 0}px)` }
  }

  return (
    <div
      ref={headerRef}
      className="header-canvas"
      style={{ position: 'relative', minHeight: header.height || 80, marginBottom: 16, paddingBottom: 8, borderBottom: header.border_bottom !== false ? `2px solid ${primary}` : 'none', overflow: 'visible' }}
      onClick={() => setLogoSel(false)}
      onMouseEnter={() => setHoverBar(true)}
      onMouseLeave={() => setHoverBar(false)}
    >
      {/* Layout preset bar */}
      {hoverBar && (
        <div style={{ position: 'absolute', top: 0, right: 0, display: 'flex', gap: 2, zIndex: 30, background: 'rgba(255,255,255,0.95)', borderRadius: 6, padding: '3px 5px', boxShadow: '0 2px 8px rgba(0,0,0,0.12)', backdropFilter: 'blur(4px)' }}
          onClick={e => e.stopPropagation()}>
          <span style={{ fontSize: 9, color: '#94a3b8', display: 'flex', alignItems: 'center', paddingRight: 4 }}>Layout:</span>
          {HEADER_PRESETS.map(p => (
            <button key={p.id}
              onClick={() => onChange({ ...header, logo_align: p.logo_align, name_side: p.name_side, logo_free: false })}
              title={p.id.replace(/-/g, ' ')}
              style={{ width: 26, height: 22, border: `1px solid ${(header.logo_align === p.logo_align && header.name_side === p.name_side) ? primary : '#e2e8f0'}`, borderRadius: 4, background: (header.logo_align === p.logo_align && header.name_side === p.name_side) ? primary : 'white', cursor: 'pointer', fontSize: 9, color: (header.logo_align === p.logo_align && header.name_side === p.name_side) ? 'white' : '#374151', fontWeight: 700 }}>
              {p.label}
            </button>
          ))}
          <div style={{ width: 1, background: '#e2e8f0', margin: '2px 4px' }} />
          <label title="Upload logo" style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', padding: '2px 5px', borderRadius: 4, border: '1px solid #e2e8f0', fontSize: 10, color: '#374151', background: 'white', gap: 3 }}>
            <Upload size={10} /> Logo
            <input type="file" accept="image/*" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = ev => onChange({ ...header, logo: ev.target.result }); r.readAsDataURL(f) }} />
          </label>
        </div>
      )}

      {/* Text block */}
      {nameSide !== 'none' && (
        <div style={textBlockStyle()}>
          <div
            contentEditable
            suppressContentEditableWarning
            style={{ fontSize: `${header.name_font_size || 14}pt`, fontWeight: header.name_font_weight || 'bold', color: header.name_color || primary, fontFamily: branding?.font_family || 'Arial', outline: 'none', cursor: 'text', minWidth: 40, display: 'inline-block' }}
            onBlur={e => onChange({ ...header, company_name: e.currentTarget.innerText })}
            dangerouslySetInnerHTML={{ __html: header.company_name || 'Company Name' }}
          />
          {header.company_address !== undefined && (
            <div
              contentEditable
              suppressContentEditableWarning
              style={{ fontSize: '9pt', color: '#555', outline: 'none', cursor: 'text', display: 'block', marginTop: 1 }}
              onBlur={e => onChange({ ...header, company_address: e.currentTarget.innerText })}
              dangerouslySetInnerHTML={{ __html: header.company_address || '' }}
              data-placeholder="Address line (click to edit)"
            />
          )}
          {header.company_contact !== undefined && (
            <div
              contentEditable
              suppressContentEditableWarning
              style={{ fontSize: '9pt', color: '#555', outline: 'none', cursor: 'text', display: 'block' }}
              onBlur={e => onChange({ ...header, company_contact: e.currentTarget.innerText })}
              dangerouslySetInnerHTML={{ __html: header.company_contact || '' }}
              data-placeholder="Phone | Email (click to edit)"
            />
          )}
        </div>
      )}

      {/* Logo */}
      {header.logo && logoAlign !== 'none' ? (
        <div
          style={{ ...logoPositionStyle(), cursor: logoSel ? 'move' : 'pointer', outline: logoSel ? '2px solid #3b82f6' : '2px solid transparent', outlineOffset: 2, zIndex: logoSel ? 20 : 3, borderRadius: 2, userSelect: 'none' }}
          onClick={e => { e.stopPropagation(); setLogoSel(s => !s) }}
          onMouseDown={logoSel ? startLogoDrag : undefined}
        >
          <img
            src={header.logo} alt="logo"
            style={{ width: '100%', height: '100%', objectFit: 'contain', opacity: header.logo_opacity ?? 1, borderRadius: header.logo_border_radius || 0, transform: `rotate(${header.logo_rotation || 0}deg)`, pointerEvents: 'none', display: 'block' }}
            draggable={false}
          />
          {/* Corner resize handles */}
          {logoSel && ['nw','ne','sw','se'].map(dir => (
            <div key={dir}
              style={{ position: 'absolute', ...(dir.includes('n') ? { top: -5 } : { bottom: -5 }), ...(dir.includes('w') ? { left: -5 } : { right: -5 }), width: 9, height: 9, background: '#fff', border: '2px solid #3b82f6', borderRadius: 2, zIndex: 50, cursor: `${dir}-resize` }}
              onMouseDown={e => startLogoResize(dir, e)}
            />
          ))}
          {/* Quick actions toolbar */}
          {logoSel && (
            <div style={{ position: 'absolute', top: -38, left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 1, background: '#1e293b', borderRadius: 7, padding: '4px 8px', zIndex: 60, whiteSpace: 'nowrap', boxShadow: '0 4px 16px rgba(0,0,0,0.35)', pointerEvents: 'all' }}
              onClick={e => e.stopPropagation()}>
              {[['L', 'left'], ['C', 'center'], ['R', 'right']].map(([l, a]) => (
                <button key={a} onClick={() => onChange({ ...header, logo_align: a, logo_free: false })}
                  style={{ color: logoAlign === a ? '#60a5fa' : '#e2e8f0', background: 'none', border: 'none', cursor: 'pointer', padding: '1px 5px', fontSize: 11, fontWeight: 700, borderRadius: 3 }}>
                  {l}
                </button>
              ))}
              <div style={{ width: 1, height: 14, background: '#475569', margin: '0 3px' }} />
              <button onClick={() => { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.onchange = ev => { const f = ev.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = ev2 => onChange({ ...header, logo: ev2.target.result }); r.readAsDataURL(f) }; inp.click() }}
                style={{ color: '#93c5fd', background: 'none', border: 'none', cursor: 'pointer', padding: '1px 5px', fontSize: 10, borderRadius: 3 }}>
                Replace
              </button>
              <button onClick={() => { onChange({ ...header, logo: '' }); setLogoSel(false) }}
                style={{ color: '#f87171', background: 'none', border: 'none', cursor: 'pointer', padding: '1px 5px', fontSize: 10, borderRadius: 3 }}>
                Del
              </button>
            </div>
          )}
        </div>
      ) : !header.logo && hoverBar ? (
        <label
          style={{ position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 90, height: 44, border: '1.5px dashed #94a3b8', borderRadius: 5, zIndex: 5 }}>
          <div style={{ textAlign: 'center', fontSize: 9, color: '#94a3b8', lineHeight: 1.4 }}>
            <Upload size={13} style={{ display: 'block', margin: '0 auto 2px', opacity: 0.6 }} />
            Drop logo here
          </div>
          <input type="file" accept="image/*" style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = ev => onChange({ ...header, logo: ev.target.result }); r.readAsDataURL(f) }} />
        </label>
      ) : null}
    </div>
  )
}

// ─── Auto-Pagination Overlay ──────────────────────────────────────────────────

function PaginationOverlay({ contentRef, headerH, footerH, margins, pageConfig }) {
  const [breakY, setBreakY] = useState([])

  useEffect(() => {
    if (!contentRef?.current) return
    // A4: 297mm, Letter: 279.4mm, Legal: 355.6mm
    const sizes = { A4: 297, LETTER: 279.4, LEGAL: 355.6, A3: 420, A5: 210 }
    const mmH    = sizes[pageConfig?.size || 'A4']
    const pxH    = mmH / 25.4 * 96
    const mTop   = (margins?.top  || 20) / 25.4 * 96
    const mBot   = (margins?.bottom || 20) / 25.4 * 96
    const hH     = headerH > 0 ? headerH + 24 : 0 // header + marginBottom
    const fH     = footerH > 0 ? footerH + 24 : 0
    const usable = pxH - mTop - mBot - hH - fH

    const recalc = () => {
      if (!contentRef.current) return
      const totalH = contentRef.current.scrollHeight
      const pts = []
      let y = usable
      while (y < totalH) { pts.push(y); y += usable }
      setBreakY(pts)
    }
    const ro = new ResizeObserver(recalc)
    ro.observe(contentRef.current)
    recalc()
    return () => ro.disconnect()
  }, [contentRef, headerH, footerH, margins, pageConfig])

  if (!breakY.length) return null
  return (
    <>
      {breakY.map((y, i) => (
        <div key={i} style={{ position: 'absolute', left: -40, right: -40, top: y, zIndex: 50, pointerEvents: 'none' }}>
          <div style={{ height: 24, background: '#e8edf2', display: 'flex', alignItems: 'center', justifyContent: 'center', borderTop: '1px solid #c4cdd6', borderBottom: '1px solid #c4cdd6' }}>
            <span style={{ fontSize: 10, color: '#6b7280', fontWeight: 500, userSelect: 'none' }}>
              ── Page {i + 2} ──
            </span>
          </div>
        </div>
      ))}
    </>
  )
}

// ─── Main Builder ─────────────────────────────────────────────────────────────

export default function DocumentTemplateBuilder() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const isNew = id === 'new'

  const [saving, setSaving]   = useState(false)
  const [loading, setLoading] = useState(!isNew)
  const [leftTab, setLeftTab] = useState('blocks')
  const [rightTab, setRightTab] = useState('props')
  const [selectedId, setSelectedId] = useState(null)
  const [editingId, setEditingId]   = useState(null)
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [zoomMenuOpen, setZoomMenuOpen]     = useState(false)
  const [saveState, setSaveState]           = useState('saved') // 'saved' | 'unsaved' | 'saving'
  const contentRef = useRef(null) // for pagination overlay

  const [meta, setMeta] = useState({ name: 'Untitled Template', description: '', doc_type: 'custom', category: 'hr', is_active: true })
  const [branding, setBranding] = useState({ primary_color: '#1e3a5f', secondary_color: '#4a90d9', font_family: 'Arial', font_size: 11, text_color: '#1a1a1a', heading_color: '#1e3a5f' })
  const [header, setHeader]   = useState({
    enabled: true,
    height: 80,
    // Logo
    logo: '', logo_align: 'right', logo_free: false,
    logo_x: 0, logo_y: 0, logo_width: 120, logo_height: 48,
    logo_opacity: 1, logo_border_radius: 0, logo_rotation: 0, logo_lock_aspect: true,
    // Text
    company_name: '', company_address: '', company_contact: '',
    name_side: 'left', name_font_size: 14, name_font_weight: 'bold', name_color: '',
    border_bottom: true, border_color: '',
  })
  const [footer, setFooter]   = useState({ enabled: true, show_page_numbers: true, show_generated_date: true, disclaimer: '', border_top: true })
  const [watermark, setWatermark] = useState({ enabled: false, type: 'text', text: 'CONFIDENTIAL', opacity: 0.10, rotation: -45, font_size: 60 })
  const [pageConfig, setPageConfig] = useState({ size: 'A4', orientation: 'portrait', margin_top: 20, margin_right: 20, margin_bottom: 20, margin_left: 20 })
  const [blocks, setBlocks] = useState([])
  const [zoom, setZoom]     = useState(100)

  const histRef    = useRef({ stack: [], idx: -1 })
  const [undoInfo, setUndoInfo] = useState({ canUndo: false, canRedo: false })
  const [draftBanner, setDraftBanner] = useState(null)
  const DRAFT_KEY  = `doc_builder_draft_${id}`
  const canvasRef  = useRef(null)
  const handleSaveRef = useRef(null)

  // ── Resizable panel widths ─────────────────────────────────────────────────
  const leftWidthRef  = useRef(224)
  const rightWidthRef = useRef(224)
  const [, forceLayout] = useReducer(x => x + 1, 0)
  const resizingPanel = useRef(null)

  const startPanelResize = useCallback((side, e) => {
    e.preventDefault()
    resizingPanel.current = { side, startX: e.clientX, startW: side === 'left' ? leftWidthRef.current : rightWidthRef.current }
    const onMove = (ev) => {
      if (!resizingPanel.current) return
      const { side, startX, startW } = resizingPanel.current
      const delta = side === 'left' ? ev.clientX - startX : startX - ev.clientX
      const newW = Math.max(180, Math.min(400, startW + delta))
      if (side === 'left') leftWidthRef.current = newW
      else rightWidthRef.current = newW
      forceLayout()
    }
    const onUp = () => {
      resizingPanel.current = null
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [])

  // dnd-kit sensors
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  // ── History ────────────────────────────────────────────────────────────────
  const recordHistory = useCallback((newBlocks) => {
    const h = histRef.current
    h.stack = h.stack.slice(0, h.idx + 1)
    h.stack.push(JSON.stringify(newBlocks))
    if (h.stack.length > 50) h.stack.shift()
    h.idx = h.stack.length - 1
    setUndoInfo({ canUndo: h.idx > 0, canRedo: false })
  }, [])

  const undo = useCallback(() => {
    const h = histRef.current
    if (h.idx <= 0) return
    h.idx--
    setBlocks(JSON.parse(h.stack[h.idx]))
    setUndoInfo({ canUndo: h.idx > 0, canRedo: true })
  }, [])

  const redo = useCallback(() => {
    const h = histRef.current
    if (h.idx >= h.stack.length - 1) return
    h.idx++
    setBlocks(JSON.parse(h.stack[h.idx]))
    setUndoInfo({ canUndo: h.idx > 0, canRedo: h.idx < h.stack.length - 1 })
  }, [])

  // ── Load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (isNew) return
    const savedDraft = localStorage.getItem(DRAFT_KEY)
    if (savedDraft) {
      try {
        const parsed = JSON.parse(savedDraft)
        if (Date.now() - parsed.savedAt < 24 * 60 * 60 * 1000) setDraftBanner(parsed)
      } catch {}
    }
    setLoading(true)
    hrmService.getDocumentTemplate(id).then(res => {
      const t = res.data
      setMeta({ name: t.name, description: t.description || '', doc_type: t.doc_type, category: t.category, is_active: t.is_active })
      if (t.branding)    setBranding(t.branding)
      if (t.header)      setHeader(h => ({ ...h, ...t.header }))
      if (t.footer)      setFooter(f => ({ ...f, ...t.footer }))
      if (t.watermark)   setWatermark(t.watermark)
      if (t.page_config) setPageConfig(t.page_config)
      const sorted = (t.blocks || []).sort((a, b) => a.order - b.order)
      setBlocks(sorted)
      recordHistory(sorted)
    }).catch(() => { toast.error('Failed to load template'); navigate('/hrm/doc-templates') })
    .finally(() => setLoading(false))
  }, [id, isNew])

  useEffect(() => {
    if (!isNew) return
    const typeParam = params.get('type')
    if (typeParam) setMeta(m => ({ ...m, doc_type: typeParam }))
  }, [isNew, params])

  // ── Mark dirty on any content change ─────────────────────────────────────
  const firstMount = useRef(true)
  useEffect(() => {
    if (firstMount.current) { firstMount.current = false; return }
    setSaveState('unsaved')
  }, [blocks, branding, header, footer, watermark, pageConfig, meta])

  // ── Prevent close with unsaved changes ───────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (saveState === 'unsaved') { e.preventDefault(); e.returnValue = '' }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [saveState])

  // ── Auto-save draft every 30s + auto-save to DB if not new ───────────────
  useEffect(() => {
    if (isNew) return
    const interval = setInterval(() => {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ blocks, branding, header, footer, watermark, pageConfig, meta, savedAt: Date.now() }))
      // Auto-save to server silently if unsaved
      if (saveState === 'unsaved') {
        setSaveState('saving')
        const payload = { ...meta, branding, header, footer, watermark, page_config: pageConfig, blocks: blocks.map((b, i) => ({ ...b, order: i })), version_note: `Auto-saved ${new Date().toLocaleTimeString()}` }
        hrmService.updateDocumentTemplate(id, payload)
          .then(() => setSaveState('saved'))
          .catch(() => setSaveState('unsaved'))
      }
    }, 30_000)
    return () => clearInterval(interval)
  }, [blocks, branding, header, footer, watermark, pageConfig, meta, isNew, DRAFT_KEY, saveState, id])

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (editingId) return // don't intercept while editing text
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') { e.preventDefault(); undo() }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) { e.preventDefault(); redo() }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 's') { e.preventDefault(); handleSaveRef.current?.() }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedId && document.activeElement.tagName === 'BODY') { e.preventDefault(); deleteBlock(selectedId) }
      }
      if (e.key === 'Escape') { setSelectedId(null); setEditingId(null) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [undo, redo, selectedId, editingId])

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = async (versionNote = '', isActive = meta.is_active) => {
    if (!meta.name.trim()) { toast.error('Template name is required'); return }
    setSaving(true); setSaveState('saving')
    try {
      const payload = { ...meta, is_active: isActive, branding, header, footer, watermark, page_config: pageConfig,
        blocks: blocks.map((b, i) => ({ ...b, order: i })),
        version_note: versionNote || `Saved ${new Date().toLocaleTimeString()}`,
      }
      if (isNew) {
        const res = await hrmService.createDocumentTemplate(payload)
        localStorage.removeItem(DRAFT_KEY)
        setSaveState('saved')
        toast.success(isActive ? 'Template created!' : 'Draft saved!')
        navigate(`/hrm/doc-builder/${res.data.id}`, { replace: true })
      } else {
        await hrmService.updateDocumentTemplate(id, payload)
        localStorage.removeItem(DRAFT_KEY)
        setDraftBanner(null)
        setSaveState('saved')
        toast.success(isActive ? 'Template saved!' : 'Draft saved!')
      }
    } catch (e) {
      setSaveState('unsaved')
      toast.error(e?.response?.data?.detail || 'Failed to save')
    } finally { setSaving(false) }
  }

  useEffect(() => { handleSaveRef.current = handleSave })

  // ── Export helpers ────────────────────────────────────────────────────────
  const getPrintData = useCallback(() => ({ blocks, branding, header, footer, watermark, pageConfig, meta }), [blocks, branding, header, footer, watermark, pageConfig, meta])
  const handleExportPDF  = useCallback(() => { doExportPDF(getPrintData()); setShowExportMenu(false) }, [getPrintData])
  const handleExportDOCX = useCallback(() => { doExportDOCX(getPrintData()); setShowExportMenu(false) }, [getPrintData])
  const handlePrint      = useCallback(() => { doExportPDF(getPrintData()); setShowExportMenu(false) }, [getPrintData])

  // ── Block ops ──────────────────────────────────────────────────────────────
  const addBlock = useCallback((type, atIndex) => {
    const b = createBlock(type)
    setBlocks(prev => {
      let next
      if (atIndex != null) {
        const arr = [...prev]
        arr.splice(atIndex, 0, { ...b, order: atIndex })
        next = arr.map((x, i) => ({ ...x, order: i }))
      } else {
        next = [...prev, { ...b, order: prev.length }]
      }
      recordHistory(next)
      return next
    })
    setSelectedId(b.id)
  }, [recordHistory])

  const updateBlock = useCallback((updated) => {
    setBlocks(prev => {
      const next = prev.map(b => b.id === updated.id ? updated : b)
      recordHistory(next)
      return next
    })
  }, [recordHistory])

  const deleteBlock = useCallback((blockId) => {
    setBlocks(prev => {
      const next = prev.filter(b => b.id !== blockId)
      recordHistory(next)
      return next
    })
    if (selectedId === blockId) setSelectedId(null)
  }, [selectedId, recordHistory])

  const duplicateBlock = useCallback((blockId) => {
    const src = blocks.find(b => b.id === blockId)
    if (!src) return
    const srcIdx = blocks.findIndex(b => b.id === blockId)
    const nb = { ...JSON.parse(JSON.stringify(src)), id: uuid() }
    setBlocks(prev => {
      const arr = [...prev]
      arr.splice(srcIdx + 1, 0, nb)
      const next = arr.map((b, i) => ({ ...b, order: i }))
      recordHistory(next)
      return next
    })
    setSelectedId(nb.id)
  }, [blocks, recordHistory])

  const reorderBlocks = useCallback((fromIdx, toIdx) => {
    setBlocks(prev => {
      const arr = [...prev]
      const [moved] = arr.splice(fromIdx, 1)
      arr.splice(toIdx, 0, moved)
      const next = arr.map((b, i) => ({ ...b, order: i }))
      recordHistory(next)
      return next
    })
  }, [recordHistory])

  // dnd-kit drag end
  const handleDragEnd = useCallback((event) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIdx = blocks.findIndex(b => b.id === active.id)
    const newIdx = blocks.findIndex(b => b.id === over.id)
    if (oldIdx === -1 || newIdx === -1) return
    setBlocks(prev => {
      const next = arrayMove(prev, oldIdx, newIdx).map((b, i) => ({ ...b, order: i }))
      recordHistory(next)
      return next
    })
  }, [blocks, recordHistory])

  // Palette → canvas drop
  const handleCanvasDrop = useCallback((e) => {
    e.preventDefault()
    const blockType = e.dataTransfer.getData('block-type')
    if (blockType) addBlock(blockType)
  }, [addBlock])

  // Placeholder insertion
  const insertPlaceholder = useCallback((placeholder) => {
    if (!selectedId) { toast('Select a text block first', { icon: 'ℹ️' }); return }
    const block = blocks.find(b => b.id === selectedId)
    if (!block || !['text','paragraph','heading'].includes(block.type)) {
      toast('Select a text block to insert', { icon: 'ℹ️' }); return
    }
    updateBlock({ ...block, content: (block.content || '') + placeholder })
  }, [selectedId, blocks, updateBlock])

  const selectedBlock = blocks.find(b => b.id === selectedId) || null

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <div className="eb-spinner" style={{ width: 32, height: 32, borderRadius: '50%', border: '3px solid var(--accent-blue)', borderTopColor: 'transparent' }} />
    </div>
  )

  // Compute page count from page_break blocks
  const pageCount = 1 + blocks.filter(b => b.type === 'page_break').length

  // Inline preview handler – works even before first save
  const handlePreview = useCallback(() => {
    const html = buildPrintHTML({ blocks, branding, header, footer, watermark, pageConfig, meta })
    const win = window.open('', '_blank', 'width=900,height=700')
    if (!win) { toast.error('Allow popups for preview'); return }
    win.document.write(`
      <html><head><title>Preview — ${meta.name}</title>
      <style>body{margin:0;background:#e8edf2;} .page{background:#fff;margin:20px auto;padding:20mm;max-width:794px;box-shadow:0 4px 24px rgba(0,0,0,.15);}</style></head>
      <body><div class="page">${buildPrintHTML({ blocks, branding, header, footer, watermark, pageConfig, meta }).replace(/<!DOCTYPE html>[\s\S]*?<body[^>]*>/, '').replace('</body></html>', '')}</div></body></html>
    `)
    win.document.close()
  }, [blocks, branding, header, footer, watermark, pageConfig, meta])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: 'var(--bg-primary)' }}
      onClick={() => { setShowExportMenu(false); setZoomMenuOpen(false) }}>

      {/* ── Inject enterprise CSS ────────────────────────────────────────── */}
      <style>{ENTERPRISE_CSS}</style>

      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '0 8px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-card)', flexShrink: 0, zIndex: 20, height: 46, gap: 0 }}>

        {/* ── Left cluster: back + name + type ────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: '0 0 auto', marginRight: 8 }}>
          <button onClick={() => navigate('/hrm/doc-templates')}
            title="Back to templates"
            style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 12, color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px', borderRadius: 5, flexShrink: 0, whiteSpace: 'nowrap' }}>
            <ArrowLeft size={14} /> Back
          </button>
          <div style={{ width: 1, height: 18, background: 'var(--border-color)', flexShrink: 0 }} />
          <input
            value={meta.name}
            onChange={e => setMeta(m => ({ ...m, name: e.target.value }))}
            placeholder="Template name"
            title="Ctrl+S to save"
            style={{ fontWeight: 600, fontSize: 13, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-primary)', width: 160 }}
          />
          {meta.is_active === false && (
            <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, background: 'var(--bg-warning)', color: 'var(--text-warning)', flexShrink: 0, whiteSpace: 'nowrap' }}>Draft</span>
          )}
          <select value={meta.doc_type} onChange={e => setMeta(m => ({ ...m, doc_type: e.target.value }))}
            style={{ ...inputSm, fontSize: 11, flexShrink: 0, maxWidth: 130 }}>
            {DOC_TYPES.map(dt => <option key={dt.value} value={dt.value}>{dt.label}</option>)}
          </select>
        </div>

        {/* ── Spacer pushes right cluster to the right ─────────────────── */}
        <div style={{ flex: 1 }} />

        {/* ── Right cluster: undo/redo + zoom + page + status + actions ─── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>

          {/* Undo / Redo */}
          <div style={{ display: 'flex', border: '1px solid var(--border-color)', borderRadius: 6 }}>
            <button onClick={undo} disabled={!undoInfo.canUndo} title="Undo (Ctrl+Z)"
              style={{ padding: '4px 7px', background: 'none', border: 'none', cursor: undoInfo.canUndo ? 'pointer' : 'default', color: 'var(--text-secondary)', opacity: undoInfo.canUndo ? 1 : 0.3, display: 'flex', alignItems: 'center' }}>
              <RotateCcw size={13} />
            </button>
            <div style={{ width: 1, background: 'var(--border-color)' }} />
            <button onClick={redo} disabled={!undoInfo.canRedo} title="Redo (Ctrl+Y)"
              style={{ padding: '4px 7px', background: 'none', border: 'none', cursor: undoInfo.canRedo ? 'pointer' : 'default', color: 'var(--text-secondary)', opacity: undoInfo.canRedo ? 1 : 0.3, display: 'flex', alignItems: 'center', transform: 'scaleX(-1)' }}>
              <RotateCcw size={13} />
            </button>
          </div>

          {/* Zoom */}
          <div style={{ position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 1, border: '1px solid var(--border-color)', borderRadius: 6, padding: '2px 4px' }}>
              <button onClick={() => setZoom(z => Math.max(50, z - 10))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', padding: '1px 3px' }}><ZoomOut size={12} /></button>
              <button onClick={e => { e.stopPropagation(); setZoomMenuOpen(z => !z) }}
                style={{ fontSize: 11, color: 'var(--text-secondary)', width: 38, textAlign: 'center', background: 'none', border: 'none', cursor: 'pointer', padding: '1px 0' }}>
                {zoom}%
              </button>
              <button onClick={() => setZoom(z => Math.min(150, z + 10))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', padding: '1px 3px' }}><ZoomIn size={12} /></button>
            </div>
            {zoomMenuOpen && (
              <div style={{ position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: 4, background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.15)', zIndex: 999, minWidth: 90, overflow: 'hidden' }}
                onClick={e => e.stopPropagation()}>
                {[50,75,100,125,150].map(z => (
                  <button key={z} onClick={() => { setZoom(z); setZoomMenuOpen(false) }}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 14px', border: 'none', background: zoom === z ? 'var(--accent-blue)' : 'none', color: zoom === z ? '#fff' : 'var(--text-primary)', cursor: 'pointer', fontSize: 12 }}>
                    {z}%
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Page count */}
          <span style={{ fontSize: 11, color: 'var(--text-disabled)', padding: '0 2px', whiteSpace: 'nowrap' }}>
            {pageCount}pg
          </span>

          <div style={{ width: 1, height: 18, background: 'var(--border-color)' }} />

          {/* Preview (works even for unsaved new template) */}
          <button onClick={handlePreview} title="Preview document"
            style={{ ...btnSm, display: 'flex', alignItems: 'center', gap: 4 }}>
            <Eye size={12} /> Preview
          </button>

          {/* Draft save */}
          <button onClick={() => handleSave('Draft', false)} disabled={saving} title="Save as inactive draft"
            style={{ ...btnSm, display: 'flex', alignItems: 'center', gap: 4 }}>
            <Clock size={12} /> Draft
          </button>

          {/* Export menu */}
          <div style={{ position: 'relative' }}>
            <button onClick={e => { e.stopPropagation(); setShowExportMenu(v => !v) }}
              style={{ ...btnSm, display: 'flex', alignItems: 'center', gap: 4 }}>
              <Download size={12} /> Export
            </button>
            {showExportMenu && (
              <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.15)', zIndex: 999, minWidth: 170, overflow: 'hidden' }}
                onClick={e => e.stopPropagation()}>
                <button onClick={handleExportPDF}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '9px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-primary)', textAlign: 'left' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-secondary)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                  <FileText size={13} style={{ color: '#ef4444' }} /> Export PDF
                </button>
                <button onClick={handleExportDOCX}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '9px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-primary)', textAlign: 'left' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-secondary)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                  <FileText size={13} style={{ color: '#2563eb' }} /> Export DOCX (.doc)
                </button>
                <div style={{ height: 1, background: 'var(--border-color)', margin: '2px 0' }} />
                <button onClick={handlePrint}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '9px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-primary)', textAlign: 'left' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-secondary)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                  <Printer size={13} /> Print
                </button>
              </div>
            )}
          </div>

          {/* ── SAVE BUTTON — always visible, always right-most ──────────── */}
          <button
            onClick={() => handleSave()}
            disabled={saving}
            title="Save template (Ctrl+S)"
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 16px', borderRadius: 8,
              border: 'none',
              background: saveState === 'unsaved' ? '#2563eb' : saveState === 'saving' ? '#3b82f6' : '#2563eb',
              color: '#fff', fontSize: 13, fontWeight: 700,
              cursor: saving ? 'default' : 'pointer',
              opacity: saving ? 0.75 : 1,
              boxShadow: '0 2px 8px rgba(37,99,235,0.35)',
              transition: 'all 0.15s',
              minWidth: 72,
              justifyContent: 'center',
            }}
            onMouseEnter={e => { if (!saving) e.currentTarget.style.background = '#1d4ed8' }}
            onMouseLeave={e => { e.currentTarget.style.background = '#2563eb' }}
          >
            {saving
              ? <><span className="eb-spinner" style={{ width: 12, height: 12, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', flexShrink: 0 }} /> Saving</>
              : <><Save size={13} /> Save</>
            }
          </button>

          {/* Save status dot (compact — beside the Save button) */}
          <div title={saveState === 'saved' ? 'All changes saved' : saveState === 'saving' ? 'Saving…' : 'Unsaved changes — click Save or Ctrl+S'}
            style={{
              width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
              background: saveState === 'saved' ? '#10b981' : saveState === 'saving' ? '#f59e0b' : '#ef4444',
              boxShadow: saveState === 'unsaved' ? '0 0 0 2px rgba(239,68,68,0.25)' : 'none',
            }}
          />
        </div>
      </div>

      {/* ── Draft restore banner ──────────────────────────────────────────── */}
      {draftBanner && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 16px', background: '#fef3c7', borderBottom: '1px solid #fcd34d', flexShrink: 0, fontSize: 12, color: '#92400e' }}>
          <span>⚡ Unsaved draft from {new Date(draftBanner.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => { try { if (draftBanner.blocks) { setBlocks(draftBanner.blocks); recordHistory(draftBanner.blocks) } if (draftBanner.meta) setMeta(draftBanner.meta); toast.success('Draft restored') } catch {} setDraftBanner(null) }}
              style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, border: 'none', background: 'var(--accent-blue)', color: '#fff', cursor: 'pointer' }}>
              Restore
            </button>
            <button onClick={() => { localStorage.removeItem(DRAFT_KEY); setDraftBanner(null) }}
              style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, border: 'none', background: 'rgba(0,0,0,0.1)', cursor: 'pointer', color: '#92400e' }}>
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* ── Main layout ──────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ── Left panel (resizable) ────────────────────────────────────── */}
        <div style={{ width: leftWidthRef.current, flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border-color)', background: 'var(--bg-card)', overflow: 'hidden' }}>
          {/* Tab bar */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', flexShrink: 0 }}>
            {[['blocks', Layers, 'Blocks'], ['placeholders', Code, 'Vars'], ['layers', Palette, 'Layers'], ['settings', Settings, 'Setup']].map(([tab, Icon, label]) => (
              <button key={tab} onClick={() => setLeftTab(tab)}
                style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '7px 2px', fontSize: 9, border: 'none', borderBottom: leftTab === tab ? '2px solid var(--accent-blue)' : '2px solid transparent', background: 'none', color: leftTab === tab ? 'var(--accent-blue)' : 'var(--text-secondary)', cursor: 'pointer', gap: 2 }}>
                <Icon size={13} />
                {label}
              </button>
            ))}
          </div>

          <div className="eb-scroll" style={{ flex: 1, overflowY: 'auto' }}>
            {/* Blocks palette */}
            {leftTab === 'blocks' && (
              <div style={{ padding: 10 }}>
                <p style={{ fontSize: 10, color: 'var(--text-disabled)', marginBottom: 8 }}>Click to add • Drag to canvas</p>
                {BLOCK_PALETTE.map(({ group, items }) => (
                  <div key={group} style={{ marginBottom: 12 }}>
                    <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text-disabled)', marginBottom: 6 }}>{group}</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
                      {items.map(({ type, label, icon: Icon, desc }) => (
                        <div key={type}
                          draggable
                          onDragStart={e => { e.dataTransfer.setData('block-type', type); e.dataTransfer.effectAllowed = 'copy' }}
                          onClick={() => addBlock(type)}
                          title={desc}
                          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '8px 4px', borderRadius: 7, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', cursor: 'grab', fontSize: 10, color: 'var(--text-primary)', userSelect: 'none', transition: 'border-color 0.15s' }}
                          onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent-blue)'}
                          onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-color)'}>
                          <Icon size={15} style={{ color: 'var(--accent-blue)' }} />
                          <span style={{ textAlign: 'center', lineHeight: 1.2 }}>{label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {leftTab === 'placeholders' && (
              <PlaceholderBrowser onInsert={insertPlaceholder} />
            )}

            {leftTab === 'layers' && (
              <LayersPanel
                blocks={blocks}
                selectedBlockId={selectedId}
                onSelect={setSelectedId}
                onUpdate={updateBlock}
                onDelete={deleteBlock}
                onReorder={reorderBlocks}
              />
            )}

            {leftTab === 'settings' && (
              <div style={{ padding: 12, overflowY: 'auto' }}>
                {/* Page size */}
                <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>Page</p>
                <label style={labelSt}>Size</label>
                <select value={pageConfig.size} onChange={e => setPageConfig(c => ({ ...c, size: e.target.value }))}
                  style={{ ...inputSm, width: '100%', boxSizing: 'border-box', marginBottom: 8 }}>
                  {['A4','LETTER','LEGAL','A3','A5'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <label style={labelSt}>Orientation</label>
                <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                  {['portrait','landscape'].map(o => (
                    <button key={o} onClick={() => setPageConfig(c => ({ ...c, orientation: o }))}
                      style={{ flex: 1, padding: '5px 4px', borderRadius: 5, border: '1px solid var(--border-color)', background: pageConfig.orientation === o ? 'var(--accent-blue)' : 'var(--bg-secondary)', color: pageConfig.orientation === o ? '#fff' : 'var(--text-secondary)', cursor: 'pointer', fontSize: 11, textTransform: 'capitalize' }}>
                      {o}
                    </button>
                  ))}
                </div>
                <label style={labelSt}>Margins (mm)</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5, marginBottom: 14 }}>
                  {[['margin_top','Top'],['margin_right','Right'],['margin_bottom','Bottom'],['margin_left','Left']].map(([k, l]) => (
                    <div key={k}>
                      <span style={{ fontSize: 9, color: 'var(--text-disabled)' }}>{l}</span>
                      <input type="number" min={5} max={50} value={pageConfig[k] || 20} onChange={e => setPageConfig(c => ({ ...c, [k]: +e.target.value }))}
                        style={{ ...inputSm, width: '100%', boxSizing: 'border-box' }} />
                    </div>
                  ))}
                </div>

                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 12, marginBottom: 12 }}>
                  <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>Header</p>
                  <HeaderDesigner header={header} onChange={setHeader} branding={branding} />
                </div>

                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 12, marginBottom: 12 }}>
                  <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>Footer</p>
                  <FooterDesigner footer={footer} onChange={setFooter} />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Left splitter ─────────────────────────────────────────────── */}
        <div className="eb-splitter" onMouseDown={e => startPanelResize('left', e)} />

        {/* ── Canvas ────────────────────────────────────────────────────── */}
        <div className="eb-scroll"
          style={{ flex: 1, overflowY: 'auto', background: '#e8edf2', padding: '24px 16px' }}
          onClick={() => { setSelectedId(null); setEditingId(null) }}
          onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }}
          onDrop={handleCanvasDrop}
        >
          <div style={{ width: `${Math.min(800, 800 * zoom / 100)}px`, margin: '0 auto', transformOrigin: 'top center', transform: `scale(${zoom / 100})` }}>
            <div
              ref={canvasRef}
              style={{
                background: '#ffffff',
                boxShadow: '0 4px 24px rgba(0,0,0,0.15)',
                borderRadius: 8,
                padding: `${pageConfig.margin_top || 20}mm ${pageConfig.margin_right || 20}mm ${pageConfig.margin_bottom || 20}mm ${pageConfig.margin_left || 20}mm`,
                minHeight: '1050px',
                position: 'relative',
              }}
              onClick={e => e.stopPropagation()}
            >
              {/* Watermark */}
              {watermark.enabled && (
                <div style={{
                  position: 'absolute', top: '50%', left: '50%',
                  transform: `translate(-50%, -50%) rotate(${watermark.rotation || -45}deg)`,
                  fontSize: `${watermark.font_size || 60}px`,
                  color: watermark.color || '#cccccc', opacity: watermark.opacity || 0.10,
                  fontWeight: 'bold', whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 0, userSelect: 'none',
                }}>
                  {watermark.text || 'CONFIDENTIAL'}
                </div>
              )}

              {/* Interactive Header */}
              {header.enabled && (
                <InteractiveHeaderCanvas header={header} onChange={setHeader} branding={branding} />
              )}

              {/* Floating rich-text toolbar */}
              <RichTextToolbar containerRef={canvasRef} />

              {/* Blocks + Auto-pagination overlay */}
              <div ref={contentRef} style={{ position: 'relative', zIndex: 1 }}>
                {/* Auto-pagination visual breaks */}
                <PaginationOverlay
                  contentRef={contentRef}
                  headerH={header.enabled ? (header.height || 80) : 0}
                  footerH={footer.enabled ? 50 : 0}
                  margins={{ top: pageConfig.margin_top, bottom: pageConfig.margin_bottom }}
                  pageConfig={pageConfig}
                />

                {blocks.length === 0 && (
                  <div
                    onDragOver={e => e.preventDefault()}
                    style={{ textAlign: 'center', padding: '60px 20px', color: '#94a3b8', border: '2px dashed #e2e8f0', borderRadius: 8 }}>
                    <Layers size={32} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
                    <p style={{ fontSize: 14, marginBottom: 6 }}>Canvas is empty</p>
                    <p style={{ fontSize: 12 }}>Click a block from the left panel, or drag it here</p>
                  </div>
                )}

                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={blocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
                    {blocks.map((block) => (
                      <div key={block.id}
                        style={{ marginBottom: 4 }}
                        onMouseEnter={e => { const h = e.currentTarget.querySelector('.drag-handle'); if (h) h.style.opacity = 1 }}
                        onMouseLeave={e => { const h = e.currentTarget.querySelector('.drag-handle'); if (h) h.style.opacity = 0 }}>
                        <SortableBlock
                          block={block}
                          selected={selectedId === block.id}
                          editing={editingId === block.id}
                          onSelect={setSelectedId}
                          onStartEdit={bid => { setEditingId(bid); setRightTab('content') }}
                          onStopEdit={() => setEditingId(null)}
                          onDelete={deleteBlock}
                          onDuplicate={duplicateBlock}
                          onContentChange={(blockId, newContent) => {
                            const b = blocks.find(x => x.id === blockId)
                            if (b) updateBlock({ ...b, content: newContent })
                          }}
                          branding={branding}
                          insertPlaceholder={insertPlaceholder}
                        />
                      </div>
                    ))}
                  </SortableContext>
                </DndContext>
              </div>

              {/* Footer */}
              {footer.enabled && (
                <div style={{ marginTop: 24, paddingTop: 10, borderTop: footer.border_top ? `1px solid ${branding.primary_color}` : 'none', fontSize: '8pt', color: '#888', position: 'relative', zIndex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{[footer.show_generated_date && `Generated: ${new Date().toLocaleDateString('en-IN')}`, footer.disclaimer].filter(Boolean).join(' | ')}</span>
                    {footer.show_page_numbers && <span>Page 1</span>}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Right splitter ────────────────────────────────────────────── */}
        <div className="eb-splitter" onMouseDown={e => startPanelResize('right', e)} />

        {/* ── Right panel (resizable) ────────────────────────────────────── */}
        <div style={{ width: rightWidthRef.current, flexShrink: 0, borderLeft: '1px solid var(--border-color)', background: 'var(--bg-card)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', flexShrink: 0 }}>
            {[['props', Settings, 'Style'], ['content', FileText, 'Content']].map(([tab, Icon, label]) => (
              <button key={tab} onClick={() => setRightTab(tab)}
                style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '7px 2px', fontSize: 9, border: 'none', borderBottom: rightTab === tab ? '2px solid var(--accent-blue)' : '2px solid transparent', background: 'none', color: rightTab === tab ? 'var(--accent-blue)' : 'var(--text-secondary)', cursor: 'pointer', gap: 2 }}>
                <Icon size={13} />
                {label}
              </button>
            ))}
          </div>

          <div className="eb-scroll" style={{ flex: 1, overflowY: 'auto' }}>
            {rightTab === 'props' && (
              <PropertiesPanel
                block={selectedBlock}
                onChange={updateBlock}
                branding={branding}
                onBrandingChange={(k, v) => setBranding(b => ({ ...b, [k]: v }))}
                header={header}
                onHeaderChange={setHeader}
                footer={footer}
                onFooterChange={setFooter}
                watermark={watermark}
                onWatermarkChange={setWatermark}
              />
            )}
            {rightTab === 'content' && (
              <BlockInlineEditor block={selectedBlock} onChange={updateBlock} />
            )}
          </div>

          {/* Block count hint */}
          {blocks.length > 0 && (
            <div style={{ borderTop: '1px solid var(--border-color)', padding: '6px 12px', fontSize: 10, color: 'var(--text-disabled)', textAlign: 'center', flexShrink: 0 }}>
              {blocks.length} block{blocks.length !== 1 ? 's' : ''} · {blocks.filter(b => b.is_locked).length} locked · {blocks.filter(b => b.is_hidden).length} hidden
            </div>
          )}
        </div>
      </div>

      {/* CSS for drag handle hover + spin animation */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .drag-handle { transition: opacity 0.15s; }
      `}</style>
    </div>
  )
}
