import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  Save, Eye, Wand2, Bold, Italic, Underline, Strikethrough,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, Link2, RotateCcw, RotateCw,
  Plus, Minus, Type, Palette, Table, Image as ImageIcon,
  ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
  Loader2, ArrowLeft, FileText,
  Stamp, ZoomIn, ZoomOut, X, Download, Printer, GripVertical,
  Clock, CheckCircle, AlertCircle, Upload, Maximize2,
  PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen,
} from 'lucide-react'
import documentCenterService from '../../../services/documentCenterService'

// ─── HR Fields ─────────────────────────────────────────────────────────────────
const HR_FIELDS = [
  { group: 'Employee',  label: 'Employee Name',     field: '{{employee_name}}' },
  { group: 'Employee',  label: 'Employee ID',        field: '{{employee_id}}' },
  { group: 'Employee',  label: 'Department',         field: '{{department}}' },
  { group: 'Employee',  label: 'Designation',        field: '{{designation}}' },
  { group: 'Employee',  label: 'Joining Date',       field: '{{joining_date}}' },
  { group: 'Employee',  label: 'Exit Date',          field: '{{exit_date}}' },
  { group: 'Employee',  label: 'Salary',             field: '{{salary}}' },
  { group: 'Employee',  label: 'Manager',            field: '{{manager_name}}' },
  { group: 'Employee',  label: 'Email',              field: '{{employee_email}}' },
  { group: 'Employee',  label: 'Phone',              field: '{{employee_phone}}' },
  { group: 'Employee',  label: 'Address',            field: '{{employee_address}}' },
  { group: 'Company',   label: 'Company Name',       field: '{{company_name}}' },
  { group: 'Company',   label: 'Company Address',    field: '{{company_address}}' },
  { group: 'Company',   label: 'Company Phone',      field: '{{company_phone}}' },
  { group: 'Company',   label: 'Company Email',      field: '{{company_email}}' },
  { group: 'Company',   label: 'GST Number',         field: '{{gst_number}}' },
  { group: 'Company',   label: 'Reg. Number',        field: '{{reg_number}}' },
  { group: 'Date',      label: 'Current Date',       field: '{{current_date}}' },
  { group: 'Date',      label: 'Month & Year',       field: '{{month_year}}' },
  { group: 'Date',      label: 'Current Year',       field: '{{current_year}}' },
  { group: 'Payroll',   label: 'Basic Salary',       field: '{{basic}}' },
  { group: 'Payroll',   label: 'HRA',                field: '{{hra}}' },
  { group: 'Payroll',   label: 'Special Allowance',  field: '{{special_allowance}}' },
  { group: 'Payroll',   label: 'Gross Salary',       field: '{{gross}}' },
  { group: 'Payroll',   label: 'PF',                 field: '{{pf}}' },
  { group: 'Payroll',   label: 'Prof. Tax',          field: '{{pt}}' },
  { group: 'Payroll',   label: 'TDS',                field: '{{tds}}' },
  { group: 'Payroll',   label: 'Total Deductions',   field: '{{total_deductions}}' },
  { group: 'Payroll',   label: 'Net Salary',         field: '{{net_salary}}' },
  { group: 'Payroll',   label: 'Salary in Words',    field: '{{salary_in_words}}' },
]

const TABLE_TEMPLATES = {
  employee: `<table border="1" style="width:100%;border-collapse:collapse;margin:8px 0;">
  <tr><th style="background:#7c3aed;color:white;padding:8px;text-align:left;">Field</th><th style="background:#7c3aed;color:white;padding:8px;text-align:left;">Value</th></tr>
  <tr><td style="padding:8px;border:1px solid #e5e7eb;">Employee Name</td><td style="padding:8px;border:1px solid #e5e7eb;">{{employee_name}}</td></tr>
  <tr style="background:#f9fafb;"><td style="padding:8px;border:1px solid #e5e7eb;">Employee ID</td><td style="padding:8px;border:1px solid #e5e7eb;">{{employee_id}}</td></tr>
  <tr><td style="padding:8px;border:1px solid #e5e7eb;">Department</td><td style="padding:8px;border:1px solid #e5e7eb;">{{department}}</td></tr>
  <tr style="background:#f9fafb;"><td style="padding:8px;border:1px solid #e5e7eb;">Designation</td><td style="padding:8px;border:1px solid #e5e7eb;">{{designation}}</td></tr>
  <tr><td style="padding:8px;border:1px solid #e5e7eb;">Joining Date</td><td style="padding:8px;border:1px solid #e5e7eb;">{{joining_date}}</td></tr>
</table>`,
  salary: `<table border="1" style="width:100%;border-collapse:collapse;margin:8px 0;">
  <tr><th style="background:#7c3aed;color:white;padding:8px;">Component</th><th style="background:#7c3aed;color:white;padding:8px;">Amount (₹)</th></tr>
  <tr><td style="padding:8px;border:1px solid #e5e7eb;">Basic Salary</td><td style="padding:8px;border:1px solid #e5e7eb;">{{basic}}</td></tr>
  <tr style="background:#f9fafb;"><td style="padding:8px;border:1px solid #e5e7eb;">HRA</td><td style="padding:8px;border:1px solid #e5e7eb;">{{hra}}</td></tr>
  <tr><td style="padding:8px;border:1px solid #e5e7eb;">Special Allowance</td><td style="padding:8px;border:1px solid #e5e7eb;">{{special_allowance}}</td></tr>
  <tr style="background:#f9fafb;font-weight:bold;"><td style="padding:8px;border:1px solid #e5e7eb;">Gross Salary</td><td style="padding:8px;border:1px solid #e5e7eb;">{{gross}}</td></tr>
  <tr><td style="padding:8px;border:1px solid #e5e7eb;">Provident Fund</td><td style="padding:8px;border:1px solid #e5e7eb;">{{pf}}</td></tr>
  <tr style="background:#f9fafb;"><td style="padding:8px;border:1px solid #e5e7eb;">Professional Tax</td><td style="padding:8px;border:1px solid #e5e7eb;">{{pt}}</td></tr>
  <tr style="font-weight:bold;"><td style="padding:8px;border:1px solid #e5e7eb;">Total Deductions</td><td style="padding:8px;border:1px solid #e5e7eb;">{{total_deductions}}</td></tr>
  <tr style="background:#ede9fe;font-weight:bold;"><td style="padding:8px;border:1px solid #7c3aed;">Net Pay</td><td style="padding:8px;border:1px solid #7c3aed;">{{net_salary}}</td></tr>
</table>`,
  custom2: `<table border="1" style="width:100%;border-collapse:collapse;margin:8px 0;">
  <tr><th style="background:#7c3aed;color:white;padding:8px;">Column 1</th><th style="background:#7c3aed;color:white;padding:8px;">Column 2</th></tr>
  <tr><td style="padding:8px;border:1px solid #e5e7eb;">&nbsp;</td><td style="padding:8px;border:1px solid #e5e7eb;">&nbsp;</td></tr>
  <tr style="background:#f9fafb;"><td style="padding:8px;border:1px solid #e5e7eb;">&nbsp;</td><td style="padding:8px;border:1px solid #e5e7eb;">&nbsp;</td></tr>
</table>`,
  custom3: `<table border="1" style="width:100%;border-collapse:collapse;margin:8px 0;">
  <tr><th style="background:#7c3aed;color:white;padding:8px;">Column 1</th><th style="background:#7c3aed;color:white;padding:8px;">Column 2</th><th style="background:#7c3aed;color:white;padding:8px;">Column 3</th></tr>
  <tr><td style="padding:8px;border:1px solid #e5e7eb;">&nbsp;</td><td style="padding:8px;border:1px solid #e5e7eb;">&nbsp;</td><td style="padding:8px;border:1px solid #e5e7eb;">&nbsp;</td></tr>
  <tr style="background:#f9fafb;"><td style="padding:8px;border:1px solid #e5e7eb;">&nbsp;</td><td style="padding:8px;border:1px solid #e5e7eb;">&nbsp;</td><td style="padding:8px;border:1px solid #e5e7eb;">&nbsp;</td></tr>
</table>`,
}

const WATERMARK_PRESETS = ['DRAFT', 'CONFIDENTIAL', 'INTERNAL', 'APPROVED', 'FOR YOUR EYES ONLY']
const FONT_FAMILIES = ['Arial', 'Times New Roman', 'Georgia', 'Courier New', 'Verdana', 'Trebuchet MS', 'Helvetica']

// ─── Toolbar button ────────────────────────────────────────────────────────────
const TB = ({ icon: Icon, label, onClick, active, disabled }) => (
  <button
    type="button"
    title={label}
    disabled={disabled}
    onClick={onClick}
    className={`p-1.5 rounded transition-colors flex-shrink-0 ${
      active ? 'bg-violet-600 text-white' : 'hover:bg-gray-100 dark:hover:bg-gray-700'
    } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
    style={{ color: active ? undefined : 'var(--text-body)' }}
  >
    <Icon className="w-4 h-4" />
  </button>
)

// ─── Accordion Panel (controlled) ────────────────────────────────────────────
const Panel = ({ title, children, open, onToggle }) => (
  <div className="border-b" style={{ borderColor: 'var(--border)' }}>
    <button
      type="button"
      onClick={onToggle}
      className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold uppercase tracking-wider"
      style={{ color: 'var(--text-muted)' }}
    >
      {title}
      {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
    </button>
    {open && <div className="px-4 pb-4 space-y-3">{children}</div>}
  </div>
)

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

// ─── Resize Divider ────────────────────────────────────────────────────────────
function ResizeDivider({ onDrag, side = 'right' }) {
  const handleMouseDown = (e) => {
    e.preventDefault()
    const startX = e.clientX
    const onMove = (ev) => onDrag(ev.clientX - startX)
    const onUp   = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }
  return (
    <div
      onMouseDown={handleMouseDown}
      className="flex-shrink-0 flex items-center justify-center w-1.5 cursor-col-resize hover:bg-violet-200 dark:hover:bg-violet-800 transition-colors z-10"
      style={{ borderLeft: '1px solid var(--border)', borderRight: '1px solid var(--border)' }}
      title="Drag to resize"
    >
      <GripVertical className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
    </div>
  )
}

// ─── Page break splitter ─────────────────────────────────────────────────────
function splitHtmlByPageBreaks(html) {
  // Split on explicit page-break divs inserted by insertPageBreak()
  const marker = /<div[^>]*style="[^"]*page-break-after\s*:\s*always[^"]*"[^>]*>.*?<\/div>/gi
  const parts = html.split(marker)
  return parts.length > 1 ? parts : [html]
}

// ─── Shared header renderer ───────────────────────────────────────────────────
function DocHeader({ header, ml, mr }) {
  if (!header.show) return null
  return (
    <div style={{
      padding: `${header.padding_top??12}px ${header.padding_right??16}px ${header.padding_bottom??8}px ${header.padding_left??16}px`,
      margin: `${header.margin_top??0}px ${header.margin_right??0}px ${header.margin_bottom??0}px ${header.margin_left??0}px`,
      minHeight: `${header.header_height||120}px`,
      borderBottom: header.border_bottom ? `${header.border_width??1}px solid ${header.border_color||'#d1d5db'}` : 'none',
      textAlign: header.company_alignment || 'left',
      backgroundColor: header.background_color || '#fff',
      color: header.font_color || '#000',
      fontSize: header.font_size || 12,
      fontFamily: header.font_family || 'Arial',
      boxSizing: 'border-box',
    }}>
      {header.logo_url && (
        <img src={header.logo_url} alt="Logo" style={{
          height: header.logo_height || 40, display: 'block',
          margin: (header.logo_alignment||'left')==='center'?'0 auto 4px'
                : (header.logo_alignment||'left')==='right'?'0 0 4px auto':'0 0 4px 0',
        }} />
      )}
      {header.company_name && <div style={{ fontWeight: 'bold', fontSize: (header.font_size||12)+2 }}>{header.company_name}</div>}
      {header.company_address && <div style={{ fontSize: (header.font_size||12)-1 }}>{header.company_address}</div>}
      {(header.company_email||header.company_phone) && (
        <div style={{ fontSize: (header.font_size||12)-1, color: '#6b7280' }}>
          {[header.company_email, header.company_phone].filter(Boolean).join('  |  ')}
        </div>
      )}
      {header.company_website && <div style={{ fontSize: (header.font_size||12)-1, color: '#6b7280' }}>{header.company_website}</div>}
      {(header.gst_number||header.reg_number) && (
        <div style={{ fontSize: (header.font_size||12)-2, color: '#6b7280', marginTop: 2 }}>
          {[header.gst_number&&`GST: ${header.gst_number}`, header.reg_number&&`Reg: ${header.reg_number}`].filter(Boolean).join('  |  ')}
        </div>
      )}
    </div>
  )
}

// ─── Shared footer renderer ───────────────────────────────────────────────────
function DocFooter({ footer, pageNum, ml, mr }) {
  if (!footer.show) return null
  return (
    <div style={{
      padding: `${footer.padding_top??8}px ${footer.padding_right??16}px ${footer.padding_bottom??12}px ${footer.padding_left??16}px`,
      margin: `${footer.margin_top??0}px ${footer.margin_right??0}px ${footer.margin_bottom??0}px ${footer.margin_left??0}px`,
      minHeight: `${footer.footer_height||60}px`,
      borderTop: footer.border_top ? `${footer.border_width??1}px solid ${footer.border_color||'#d1d5db'}` : 'none',
      fontSize: footer.font_size || 10, color: footer.font_color || '#666',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      boxSizing: 'border-box',
    }}>
      <span style={{ fontSize: (footer.font_size||10)-1 }}>
        {footer.show_date ? new Date().toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' }) : ''}
      </span>
      <span>
        {footer.text||''}{footer.confidential_label?(footer.text?' | CONFIDENTIAL':'CONFIDENTIAL'):''}
        {footer.description?<><br/><span style={{fontSize:(footer.font_size||10)-2}}>{footer.description}</span></>:null}
      </span>
      <span>{footer.show_page_numbers ? `Page ${pageNum}` : ''}</span>
    </div>
  )
}

// ─── Paginated Document (editor + preview) ────────────────────────────────────
function PaginatedDocument({ html, header, footer, paper, watermark, ml, mr, mt, mb, paperW, editorRef, onInput, onKeyUp, onMouseUp, readOnly = false }) {
  const pages = splitHtmlByPageBreaks(html || '')

  const WatermarkLayer = () => watermark.enabled ? (
    <div style={{
      position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
      pointerEvents: 'none', zIndex: 1, transform: `rotate(${watermark.rotation}deg)`,
      fontSize: watermark.size, opacity: watermark.opacity, color: '#9ca3af', fontWeight: 'bold', userSelect: 'none',
    }}>
      {watermark.text}
    </div>
  ) : null

  if (readOnly) {
    // Preview mode: static paginated pages
    return (
      <>
        {pages.map((pageHtml, i) => (
          <div key={i} className="mb-8">
            {pages.length > 1 && i > 0 && (
              <div className="flex items-center justify-center mb-2 gap-3">
                <div className="h-px flex-1 bg-gray-400" />
                <span className="text-xs text-white px-2 py-0.5 rounded font-medium" style={{ background: '#6b7280' }}>Page {i + 1}</span>
                <div className="h-px flex-1 bg-gray-400" />
              </div>
            )}
            <div className="bg-white shadow-2xl relative" style={{ width: paperW, fontFamily: 'Arial, sans-serif', boxSizing: 'border-box' }}>
              <WatermarkLayer />
              <DocHeader header={header} ml={ml} mr={mr} />
              <div style={{ paddingTop: mt, paddingBottom: mb, paddingLeft: ml, paddingRight: mr, fontSize: '12pt', lineHeight: 1.6, color: '#1f2937', position: 'relative', zIndex: 2 }}
                dangerouslySetInnerHTML={{ __html: pageHtml }} />
              <DocFooter footer={footer} pageNum={i + 1} ml={ml} mr={mr} />
            </div>
          </div>
        ))}
      </>
    )
  }

  // Editor mode: first page is contentEditable, rest are visual separators
  return (
    <>
      {/* Single contentEditable div — we show page-break guides */}
      <div className="bg-white shadow-2xl relative" style={{ width: paperW, fontFamily: 'Arial, sans-serif' }}>
        <WatermarkLayer />
        <DocHeader header={header} ml={ml} mr={mr} />
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onMouseUp={onMouseUp}
          onKeyUp={onKeyUp}
          onInput={onInput}
          className="focus:outline-none"
          style={{
            paddingTop: mt, paddingBottom: mb, paddingLeft: ml, paddingRight: mr,
            minHeight: '400px', fontSize: '12pt', lineHeight: 1.6, color: '#1f2937',
            position: 'relative', zIndex: 2,
          }}
          data-placeholder="Start typing your document content here…"
        />
        <DocFooter footer={footer} pageNum={1} ml={ml} mr={mr} />
      </div>
    </>
  )
}

// ─── Fullscreen Preview Modal ──────────────────────────────────────────────────
function PreviewModal({ html, header, footer, paper, watermark, onClose }) {
  const [zoom, setZoom] = useState(100)

  const paperW = paper.size === 'A4' ? (paper.orientation === 'landscape' ? '297mm' : '210mm')
               : paper.size === 'letter' ? (paper.orientation === 'landscape' ? '279mm' : '216mm')
               : (paper.orientation === 'landscape' ? '356mm' : '216mm')

  const ml = paper.margin_left   / 72 * 25.4 + 'mm'
  const mr = paper.margin_right  / 72 * 25.4 + 'mm'
  const mt = paper.margin_top    / 72 * 25.4 + 'mm'
  const mb = paper.margin_bottom / 72 * 25.4 + 'mm'

  const handlePrint = () => {
    const w = window.open('', '_blank')
    w.document.write(`<!DOCTYPE html><html><head>
      <style>
        body { margin: 0; font-family: Arial, sans-serif; }
        @page { margin: ${mt} ${mr} ${mb} ${ml}; }
        @media print { .no-print { display: none !important; } }
        table { border-collapse: collapse; width: 100%; }
        td, th { border: 1px solid #e5e7eb; padding: 6px 10px; }
        blockquote { border-left: 4px solid #7c3aed; padding-left: 12px; color: #6b7280; }
      </style>
    </head><body>
      ${header.show ? `<div style="text-align:${header.alignment};padding:12px ${mr} 8px ${ml};${header.border_bottom ? 'border-bottom:1px solid #d1d5db;' : ''}background:${header.background_color};color:${header.font_color};font-size:${header.font_size}px;">
        ${header.logo_url ? `<img src="${header.logo_url}" style="height:40px;display:block;margin:${header.alignment === 'center' ? '0 auto' : header.alignment === 'right' ? '0 0 0 auto' : '0'};" />` : ''}
        ${header.company_name ? `<div style="font-weight:bold;font-size:${header.font_size + 2}px;">${header.company_name}</div>` : ''}
        ${header.company_address ? `<div style="font-size:${header.font_size - 1}px;">${header.company_address}</div>` : ''}
        ${(header.company_email || header.company_phone) ? `<div style="font-size:${header.font_size - 1}px;color:#6b7280;">${[header.company_email, header.company_phone].filter(Boolean).join('  |  ')}</div>` : ''}
      </div>` : ''}
      <div style="padding:${mt} ${mr} ${mb} ${ml};font-size:12pt;line-height:1.6;color:#1f2937;">${html}</div>
      ${footer.show ? `<div style="text-align:${footer.alignment};padding:8px ${mr} 12px ${ml};${footer.border_top ? 'border-top:1px solid #d1d5db;' : ''}font-size:${footer.font_size}px;color:${footer.font_color};display:flex;justify-content:space-between;">
        <span>${footer.show_date ? new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : ''}</span>
        <span>${footer.text || ''}${footer.confidential_label ? (footer.text ? '  |  CONFIDENTIAL' : 'CONFIDENTIAL') : ''}</span>
        <span>${footer.show_page_numbers ? 'Page 1' : ''}</span>
      </div>` : ''}
    </body></html>`)
    w.document.close()
    w.print()
  }

  const handleExportHTML = () => {
    const fullHtml = `<!DOCTYPE html><html><head>
<meta charset="UTF-8">
<style>
  body { margin: 40px auto; max-width: 800px; font-family: Arial, sans-serif; font-size: 12pt; line-height: 1.6; color: #1f2937; }
  table { border-collapse: collapse; width: 100%; }
  td, th { border: 1px solid #e5e7eb; padding: 6px 10px; }
  th { background: #7c3aed; color: white; }
  blockquote { border-left: 4px solid #7c3aed; padding-left: 12px; color: #6b7280; margin: 8px 0; }
  .header { border-bottom: 1px solid #d1d5db; padding-bottom: 12px; margin-bottom: 24px; text-align: ${header.alignment}; }
  .footer { border-top: 1px solid #d1d5db; padding-top: 8px; margin-top: 24px; display: flex; justify-content: space-between; color: #6b7280; font-size: 10pt; }
</style>
</head><body>
${header.show ? `<div class="header">
  ${header.logo_url ? `<img src="${header.logo_url}" style="height:40px;" />` : ''}
  ${header.company_name ? `<h2 style="margin:4px 0;">${header.company_name}</h2>` : ''}
  ${header.company_address ? `<p style="margin:2px 0;">${header.company_address}</p>` : ''}
</div>` : ''}
${html}
${footer.show ? `<div class="footer">
  <span>${footer.show_date ? new Date().toLocaleDateString() : ''}</span>
  <span>${footer.text || ''}${footer.confidential_label ? ' | CONFIDENTIAL' : ''}</span>
  <span>${footer.show_page_numbers ? 'Page 1' : ''}</span>
</div>` : ''}
</body></html>`
    const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = 'document.html'; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'rgba(0,0,0,0.85)' }}>
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2.5 flex-shrink-0"
        style={{ background: '#1e1e2e', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <span className="text-white text-sm font-semibold flex-1">Preview</span>
        <div className="flex items-center gap-2">
          <button onClick={() => setZoom(z => Math.max(50, z - 25))}
            className="p-1.5 rounded text-white hover:bg-white/10"><ZoomOut className="w-4 h-4" /></button>
          <span className="text-white text-xs w-10 text-center">{zoom}%</span>
          <button onClick={() => setZoom(z => Math.min(200, z + 25))}
            className="p-1.5 rounded text-white hover:bg-white/10"><ZoomIn className="w-4 h-4" /></button>
          <select value={zoom} onChange={e => setZoom(+e.target.value)}
            className="text-xs px-2 py-1 rounded"
            style={{ background: '#2d2d3d', color: 'white', border: '1px solid rgba(255,255,255,0.2)' }}>
            {[50, 75, 100, 125, 150, 175, 200].map(z => <option key={z} value={z}>{z}%</option>)}
          </select>
        </div>
        <div className="w-px h-5 bg-white/20" />
        <button onClick={handlePrint}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs text-white hover:bg-white/10">
          <Printer className="w-3.5 h-3.5" /> Print
        </button>
        <button onClick={handleExportHTML}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs text-white hover:bg-white/10">
          <Download className="w-3.5 h-3.5" /> HTML
        </button>
        <div className="w-px h-5 bg-white/20" />
        <button onClick={onClose}
          className="p-1.5 rounded text-white hover:bg-white/10">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Canvas */}
      <div className="flex-1 overflow-auto py-8 px-4" style={{ background: '#2d2d3d' }}>
        <div style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top center', transition: 'transform 0.2s' }}>
          <PaginatedDocument
            html={html}
            header={header}
            footer={footer}
            paper={paper}
            watermark={watermark}
            ml={ml} mr={mr} mt={mt} mb={mb}
            paperW={paperW}
            readOnly
          />
        </div>
      </div>
    </div>
  )
}

// ─── Right Properties Panel ────────────────────────────────────────────────────
function RightPanel({ editorRef, exec, insertField, insertHtml }) {
  const [bold,      setBold]      = useState(false)
  const [italic,    setItalic]    = useState(false)
  const [underline, setUnderline] = useState(false)
  const [strike,    setStrike]    = useState(false)
  const [align,     setAlign]     = useState('left')
  const [wordCount, setWordCount] = useState(0)
  const [charCount, setCharCount] = useState(0)

  const refresh = useCallback(() => {
    try {
      setBold(document.queryCommandState('bold'))
      setItalic(document.queryCommandState('italic'))
      setUnderline(document.queryCommandState('underline'))
      setStrike(document.queryCommandState('strikeThrough'))
      const al = document.queryCommandValue('justifyLeft')   === 'true' ? 'left'
               : document.queryCommandValue('justifyCenter') === 'true' ? 'center'
               : document.queryCommandValue('justifyRight')  === 'true' ? 'right'
               : document.queryCommandValue('justifyFull')   === 'true' ? 'justify'
               : 'left'
      setAlign(al)
    } catch {}

    const text = editorRef.current?.innerText || ''
    const words = text.trim().split(/\s+/).filter(w => w.length > 0)
    setWordCount(words.length)
    setCharCount(text.length)
  }, [editorRef])

  useEffect(() => {
    document.addEventListener('selectionchange', refresh)
    const interval = setInterval(refresh, 1000)
    return () => {
      document.removeEventListener('selectionchange', refresh)
      clearInterval(interval)
    }
  }, [refresh])

  const pBtn = (label, active, fn, danger = false) => (
    <button
      type="button"
      onClick={fn}
      className={`flex-1 py-1.5 rounded text-xs font-semibold border transition-all ${
        active ? 'bg-violet-600 text-white border-violet-600' : danger ? 'text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20' : 'hover:bg-gray-100 dark:hover:bg-gray-700'
      }`}
      style={active || danger ? {} : { borderColor: 'var(--border)', color: 'var(--text-body)' }}
    >
      {label}
    </button>
  )

  const alignBtn = (a, label) => (
    <button
      key={a}
      type="button"
      onClick={() => exec(`justify${a.charAt(0).toUpperCase() + a.slice(1)}`)}
      className={`flex-1 py-1.5 rounded text-xs border transition-all ${align === a ? 'bg-violet-600 text-white border-violet-600' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}`}
      style={align !== a ? { borderColor: 'var(--border)', color: 'var(--text-body)' } : {}}
    >
      {label}
    </button>
  )

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="px-3 py-2.5 border-b flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Properties</p>
      </div>

      {/* Text Style */}
      <div className="p-3 border-b space-y-2" style={{ borderColor: 'var(--border)' }}>
        <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Text Style</p>
        <div className="flex gap-1">
          {pBtn('B', bold,      () => exec('bold'))}
          {pBtn('I', italic,    () => exec('italic'))}
          {pBtn('U', underline, () => exec('underline'))}
          {pBtn('S̶', strike,   () => exec('strikeThrough'))}
        </div>
        <div className="flex gap-1">
          {alignBtn('left', 'L')}
          {alignBtn('center', 'C')}
          {alignBtn('right', 'R')}
          {alignBtn('full', 'J')}
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <div>
            <p className="text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>Text Color</p>
            <input type="color" defaultValue="#000000"
              onChange={e => exec('foreColor', e.target.value)}
              className="w-full h-7 rounded border cursor-pointer" style={{ borderColor: 'var(--border)' }} />
          </div>
          <div>
            <p className="text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>Highlight</p>
            <input type="color" defaultValue="#ffff00"
              onChange={e => exec('hiliteColor', e.target.value)}
              className="w-full h-7 rounded border cursor-pointer" style={{ borderColor: 'var(--border)' }} />
          </div>
        </div>
      </div>

      {/* Insert */}
      <div className="p-3 border-b space-y-1.5" style={{ borderColor: 'var(--border)' }}>
        <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Insert</p>
        {[
          { label: 'Page Break', fn: () => insertHtml('<div style="page-break-after:always;text-align:center;color:#9ca3af;font-size:11px;border-top:2px dashed #d1d5db;margin:16px 0;padding:6px 0;">— Page Break —</div>') },
          { label: 'Divider',    fn: () => insertHtml('<hr style="border:none;border-top:2px solid #e5e7eb;margin:12px 0;" />') },
          { label: 'Signature',  fn: () => insertHtml(`<table style="width:100%;margin:16px 0;border-collapse:collapse;"><tr><td style="width:45%;padding:8px;vertical-align:bottom;"><div style="border-top:2px solid #1f2937;padding-top:4px;font-size:11px;color:#374151;">Employee Signature<br>Name: {{employee_name}}<br>Date: ____________</div></td><td style="width:10%;"></td><td style="width:45%;padding:8px;vertical-align:bottom;"><div style="border-top:2px solid #1f2937;padding-top:4px;font-size:11px;color:#374151;">Authorized Signatory<br>Name: ____________<br>Date: ____________</div></td></tr></table>`) },
        ].map(item => (
          <button key={item.label} type="button" onClick={item.fn}
            className="w-full text-left text-xs px-2.5 py-1.5 rounded-lg border transition-colors hover:bg-violet-50 dark:hover:bg-violet-900/20"
            style={{ borderColor: 'var(--border)', color: 'var(--text-body)' }}>
            {item.label}
          </button>
        ))}
      </div>

      {/* Quick Fields */}
      <div className="p-3 border-b" style={{ borderColor: 'var(--border)' }}>
        <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Quick Fields</p>
        <div className="flex flex-wrap gap-1">
          {[
            { label: 'Name',     field: '{{employee_name}}' },
            { label: 'Dept',     field: '{{department}}' },
            { label: 'Role',     field: '{{designation}}' },
            { label: 'Date',     field: '{{current_date}}' },
            { label: 'Company',  field: '{{company_name}}' },
            { label: 'Salary',   field: '{{salary}}' },
          ].map(f => (
            <button key={f.field} type="button" onClick={() => insertField(f.field)}
              className="text-[10px] px-1.5 py-0.5 rounded-full border font-mono hover:bg-violet-600 hover:text-white hover:border-violet-600 transition-colors"
              style={{ borderColor: 'var(--border)', color: 'var(--text-body)' }}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Document Stats */}
      <div className="p-3 space-y-2 mt-auto">
        <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Document</p>
        {[
          { label: 'Words',    value: wordCount.toLocaleString() },
          { label: 'Characters', value: charCount.toLocaleString() },
          { label: 'Est. Pages', value: Math.max(1, Math.ceil(wordCount / 300)).toString() },
        ].map(stat => (
          <div key={stat.label} className="flex items-center justify-between">
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{stat.label}</span>
            <span className="text-xs font-semibold" style={{ color: 'var(--text-heading)' }}>{stat.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function QuickBuilder({ initialHtml, onSaved }) {
  const { id }    = useParams()
  const navigate  = useNavigate()
  const editorRef = useRef(null)
  const savedSel  = useRef(null)
  const autoSaveTimer = useRef(null)

  const [loading,  setLoading]  = useState(!!id)
  const [saving,   setSaving]   = useState(false)
  const [preview,  setPreview]  = useState(false)
  const [showFullPreview, setShowFullPreview] = useState(false)
  const [autoSaveStatus, setAutoSaveStatus]   = useState('saved') // saved | saving | unsaved | error
  const [showExport, setShowExport] = useState(false)
  const exportRef = useRef(null)

  const [name,        setName]        = useState('Untitled Template')
  const [description, setDescription] = useState('')
  const [categoryId,  setCategoryId]  = useState('')
  const [tags,        setTags]        = useState('')
  const [categories,  setCategories]  = useState([])

  // Panel widths (persisted to localStorage)
  const [leftWidth,  setLeftWidth]  = useState(() => parseInt(localStorage.getItem('qb_left_w')  || '260'))
  const [rightWidth, setRightWidth] = useState(() => parseInt(localStorage.getItem('qb_right_w') || '220'))

  // Panel collapse (persisted)
  const [leftCollapsed,  setLeftCollapsed]  = useState(() => localStorage.getItem('qb_left_col')  === 'true')
  const [rightCollapsed, setRightCollapsed] = useState(() => localStorage.getItem('qb_right_col') === 'true')

  // Accordion: which left panel section is open
  const [openSection, setOpenSection] = useState('header')
  const toggleSection = (key) => setOpenSection(k => k === key ? null : key)

  const [header, setHeader] = useState({
    show: true, logo_url: '', logo_height: 40,
    logo_alignment: 'left', company_alignment: 'left',
    header_height: 120,
    padding_top: 12, padding_right: 16, padding_bottom: 8, padding_left: 16,
    margin_top: 0, margin_right: 0, margin_bottom: 0, margin_left: 0,
    company_name: '', company_address: '', company_email: '',
    company_phone: '', company_website: '', gst_number: '', reg_number: '',
    font_family: 'Arial',
    font_size: 12, font_color: '#000000', background_color: '#ffffff',
    border_bottom: true, border_color: '#d1d5db', border_width: 1,
  })
  const [footer, setFooter] = useState({
    show: true, text: '', description: '', show_page_numbers: true,
    show_date: true, confidential_label: false,
    footer_height: 60,
    padding_top: 8, padding_right: 16, padding_bottom: 12, padding_left: 16,
    margin_top: 0, margin_right: 0, margin_bottom: 0, margin_left: 0,
    alignment: 'center', font_size: 10, font_color: '#666666',
    border_top: true, border_color: '#d1d5db', border_width: 1,
  })
  const [paper, setPaper] = useState({
    size: 'A4', orientation: 'portrait',
    margin_top: 72, margin_bottom: 72, margin_left: 72, margin_right: 72,
  })
  const [watermark, setWatermark] = useState({
    enabled: false, type: 'text', text: 'CONFIDENTIAL',
    opacity: 0.12, rotation: -45, size: 72,
  })

  // Load categories
  useEffect(() => {
    documentCenterService.listCategories().then(r => setCategories(r.data?.data || [])).catch(() => {})
  }, [])

  // Load existing template
  useEffect(() => {
    if (initialHtml !== undefined && editorRef.current) {
      editorRef.current.innerHTML = initialHtml
    }
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
          if (editorRef.current && t.content.body_html != null) {
            editorRef.current.innerHTML = t.content.body_html
          }
        }
        setAutoSaveStatus('saved')
      })
      .catch(() => toast.error('Failed to load template'))
      .finally(() => setLoading(false))
  }, [id, initialHtml])

  // Panel resize handlers
  const handleLeftResize  = useCallback((dx) => {
    setLeftWidth(prev => {
      const next = Math.max(200, Math.min(460, prev + dx))
      localStorage.setItem('qb_left_w', next)
      return next
    })
  }, [])
  const handleRightResize = useCallback((dx) => {
    setRightWidth(prev => {
      const next = Math.max(180, Math.min(380, prev - dx))
      localStorage.setItem('qb_right_w', next)
      return next
    })
  }, [])

  // Panel collapse toggles
  const toggleLeftPanel = useCallback(() => {
    setLeftCollapsed(v => { const n = !v; localStorage.setItem('qb_left_col', n); return n })
  }, [])
  const toggleRightPanel = useCallback(() => {
    setRightCollapsed(v => { const n = !v; localStorage.setItem('qb_right_col', n); return n })
  }, [])

  // Close export dropdown on outside click
  useEffect(() => {
    const onOutside = (e) => { if (exportRef.current && !exportRef.current.contains(e.target)) setShowExport(false) }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [])

  // Auto-save (only for existing templates)
  const scheduleAutoSave = useCallback(() => {
    if (!id) return
    setAutoSaveStatus('unsaved')
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(async () => {
      setAutoSaveStatus('saving')
      try {
        const html = editorRef.current?.innerHTML || ''
        const payload = {
          name, description,
          category_id: categoryId || null,
          template_type: 'simple',
          tags: tags.split(',').map(t => t.trim()).filter(Boolean),
          change_summary: 'Auto-saved',
          content: { header, body_html: html, footer, paper, watermark, canvas_elements: [] },
          dynamic_fields: [...new Set([...html.matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]))],
        }
        await documentCenterService.updateTemplate(id, payload)
        setAutoSaveStatus('saved')
      } catch {
        setAutoSaveStatus('error')
      }
    }, 3000)
  }, [id, name, description, categoryId, tags, header, footer, paper, watermark])

  // Trigger auto-save on settings changes
  useEffect(() => { scheduleAutoSave() }, [header, footer, paper, watermark, name, description, categoryId, tags])

  const exec = useCallback((cmd, value = null) => {
    editorRef.current?.focus()
    document.execCommand(cmd, false, value)
  }, [])

  const saveSelection = () => {
    const sel = window.getSelection()
    if (sel?.rangeCount > 0) savedSel.current = sel.getRangeAt(0).cloneRange()
  }
  const restoreSelection = () => {
    if (!savedSel.current) return
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(savedSel.current)
  }
  const insertHtml = (html) => {
    editorRef.current?.focus()
    restoreSelection()
    document.execCommand('insertHTML', false, html)
    scheduleAutoSave()
  }
  const insertField = (field) => insertHtml(
    `<span class="doc-field" style="background:#ede9fe;color:#7c3aed;padding:1px 4px;border-radius:3px;font-family:monospace;font-size:0.85em;">${field}</span>`
  )
  const insertTable  = (key) => insertHtml(TABLE_TEMPLATES[key] || TABLE_TEMPLATES.custom3)
  const insertDivider   = () => insertHtml('<hr style="border:none;border-top:2px solid #e5e7eb;margin:12px 0;" />')
  const insertPageBreak = () => insertHtml('<div style="page-break-after:always;text-align:center;color:#9ca3af;font-size:11px;border-top:2px dashed #d1d5db;margin:16px 0;padding:6px 0;">— Page Break —</div>')
  const insertSignatureBlock = () => insertHtml(`
    <table style="width:100%;margin:16px 0;border-collapse:collapse;">
      <tr>
        <td style="width:45%;padding:8px;vertical-align:bottom;">
          <div style="border-top:2px solid #1f2937;padding-top:4px;font-size:11px;color:#374151;">
            Employee Signature<br>Name: {{employee_name}}<br>Date: ____________
          </div>
        </td>
        <td style="width:10%;"></td>
        <td style="width:45%;padding:8px;vertical-align:bottom;">
          <div style="border-top:2px solid #1f2937;padding-top:4px;font-size:11px;color:#374151;">
            Authorized Signatory<br>Name: ____________<br>Date: ____________
          </div>
        </td>
      </tr>
    </table>`)

  // Export helpers
  const buildFullHtml = (html) => {
    const hPt = `${header.padding_top}px ${header.padding_right}px ${header.padding_bottom}px ${header.padding_left}px`
    const fPt = `${footer.padding_top}px ${footer.padding_right}px ${footer.padding_bottom}px ${footer.padding_left}px`
    return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
  body { margin: 0; font-family: Arial, sans-serif; font-size: 12pt; line-height: 1.6; color: #1f2937; }
  @page { margin: ${mt} ${mr} ${mb} ${ml}; }
  @media print { .no-print { display:none!important; } }
  table { border-collapse: collapse; width: 100%; }
  td, th { border: 1px solid #e5e7eb; padding: 6px 10px; }
  th { background: #7c3aed; color: white; }
  blockquote { border-left: 4px solid #7c3aed; padding-left: 12px; color: #6b7280; margin: 8px 0; }
  .doc-header { background: ${header.background_color}; color: ${header.font_color}; padding: ${hPt};
    border-bottom: ${header.border_bottom ? `${header.border_width}px solid ${header.border_color}` : 'none'};
    margin: ${header.margin_top}px ${header.margin_right}px ${header.margin_bottom}px ${header.margin_left}px;
    min-height: ${header.header_height}px; box-sizing: border-box; }
  .doc-footer { color: ${footer.font_color}; font-size: ${footer.font_size}px; padding: ${fPt};
    border-top: ${footer.border_top ? `${footer.border_width}px solid ${footer.border_color}` : 'none'};
    margin: ${footer.margin_top}px ${footer.margin_right}px ${footer.margin_bottom}px ${footer.margin_left}px;
    min-height: ${footer.footer_height}px; box-sizing: border-box; display: flex; justify-content: space-between; align-items: center; }
  .page-break { page-break-after: always; }
</style>
</head><body>
${header.show ? `<div class="doc-header" style="text-align:${header.company_alignment}">
  ${header.logo_url ? `<img src="${header.logo_url}" style="height:${header.logo_height}px;display:block;margin:${header.logo_alignment==='center'?'0 auto 4px':header.logo_alignment==='right'?'0 0 4px auto':'0 0 4px 0'};" />` : ''}
  ${header.company_name ? `<div style="font-weight:bold;font-size:${header.font_size+2}px;">${header.company_name}</div>` : ''}
  ${header.company_address ? `<div style="font-size:${header.font_size-1}px;">${header.company_address}</div>` : ''}
  ${(header.company_email||header.company_phone) ? `<div style="font-size:${header.font_size-1}px;color:#6b7280;">${[header.company_email,header.company_phone].filter(Boolean).join(' | ')}</div>` : ''}
</div>` : ''}
<div style="padding:${mt} ${mr} ${mb} ${ml};">${html}</div>
${footer.show ? `<div class="doc-footer">
  <span>${footer.show_date ? new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'}) : ''}</span>
  <span>${footer.text||''}${footer.confidential_label?(footer.text?' | CONFIDENTIAL':'CONFIDENTIAL'):''}</span>
  <span>${footer.show_page_numbers ? 'Page 1' : ''}</span>
</div>` : ''}
</body></html>`
  }

  const handleExportHTML = () => {
    const html = buildFullHtml(getBodyHtml())
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a'); a.href = url; a.download = `${name || 'document'}.html`; a.click()
    URL.revokeObjectURL(url)
    setShowExport(false)
  }

  const handleExportTXT = () => {
    const txt = (editorRef.current?.innerText || '').trim()
    const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a'); a.href = url; a.download = `${name || 'document'}.txt`; a.click()
    URL.revokeObjectURL(url)
    setShowExport(false)
  }

  const handlePrint = () => {
    const w = window.open('', '_blank')
    w.document.write(buildFullHtml(getBodyHtml()))
    w.document.close(); w.focus()
    setTimeout(() => { w.print(); w.close() }, 400)
    setShowExport(false)
  }

  const handleExportPDF = () => {
    // Use browser print → matches preview exactly (PDF via system print dialog)
    setShowExport(false)
    const hPt = `${header.padding_top??12}px ${header.padding_right??16}px ${header.padding_bottom??8}px ${header.padding_left??16}px`
    const fPt = `${footer.padding_top??8}px ${footer.padding_right??16}px ${footer.padding_bottom??12}px ${footer.padding_left??16}px`
    const pages = splitHtmlByPageBreaks(getBodyHtml())
    const pagesHtml = pages.map((p, i) => `
      <div class="doc-page">
        ${header.show ? `<div class="doc-header" style="text-align:${header.company_alignment||'left'}">
          ${header.logo_url ? `<img src="${header.logo_url}" style="height:${header.logo_height||40}px;display:block;margin:${(header.logo_alignment||'left')==='center'?'0 auto 4px':(header.logo_alignment||'left')==='right'?'0 0 4px auto':'0 0 4px 0'};" />` : ''}
          ${header.company_name?`<div style="font-weight:bold;font-size:${(header.font_size||12)+2}px;">${header.company_name}</div>`:''}
          ${header.company_address?`<div style="font-size:${(header.font_size||12)-1}px;">${header.company_address}</div>`:''}
          ${(header.company_email||header.company_phone)?`<div style="font-size:${(header.font_size||12)-1}px;color:#6b7280;">${[header.company_email,header.company_phone].filter(Boolean).join(' | ')}</div>`:''}
        </div>` : ''}
        <div class="doc-body">${p}</div>
        ${footer.show ? `<div class="doc-footer">
          <span>${footer.show_date?new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'}):''}</span>
          <span>${footer.text||''}${footer.confidential_label?' | CONFIDENTIAL':''}</span>
          <span>${footer.show_page_numbers?`Page ${i+1}`:''}</span>
        </div>` : ''}
      </div>
      ${i < pages.length-1 ? '<div class="page-break"></div>' : ''}
    `).join('')

    const w = window.open('', '_blank')
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${name||'Document'}</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: ${header.font_family||'Arial'}, sans-serif; font-size: 12pt; line-height: 1.6; color: #1f2937; }
  @page { size: ${paper.size} ${paper.orientation}; margin: ${mt} ${mr} ${mb} ${ml}; }
  @media print { .page-break { page-break-after: always; } }
  .doc-page { position: relative; }
  .doc-header { background: ${header.background_color||'#fff'}; color: ${header.font_color||'#000'};
    padding: ${hPt}; min-height: ${header.header_height||120}px; font-size: ${header.font_size||12}px;
    border-bottom: ${header.border_bottom?`${header.border_width||1}px solid ${header.border_color||'#d1d5db'}`:'none'}; }
  .doc-body { padding: ${mt} ${mr} ${mb} ${ml}; }
  .doc-footer { color: ${footer.font_color||'#666'}; font-size: ${footer.font_size||10}px; padding: ${fPt};
    min-height: ${footer.footer_height||60}px; border-top: ${footer.border_top?`${footer.border_width||1}px solid ${footer.border_color||'#d1d5db'}`:'none'};
    display: flex; justify-content: space-between; align-items: center; }
  table { border-collapse: collapse; width: 100%; } td, th { border: 1px solid #e5e7eb; padding: 6px 10px; }
  th { background: #7c3aed; color: white; }
  blockquote { border-left: 4px solid #7c3aed; padding-left: 12px; color: #6b7280; margin: 8px 0; }
</style></head><body>${pagesHtml}</body></html>`)
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
      if (genId) {
        const url = documentCenterService.downloadDOCX(genId)
        window.open(url, '_blank')
        toast.success('DOCX ready', { id: toastId })
      }
    } catch { toast.error('DOCX export failed', { id: toastId }) }
  }

  // Logo upload → base64 data URL
  const handleLogoUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { toast.error('Please select an image file'); return }
    if (file.size > 2 * 1024 * 1024) { toast.error('Logo must be under 2 MB'); return }
    const reader = new FileReader()
    reader.onload = (ev) => {
      setHeader(h => ({ ...h, logo_url: ev.target.result }))
    }
    reader.readAsDataURL(file)
  }

  const getBodyHtml = () => editorRef.current?.innerHTML || ''
  const buildPayload = (summary) => ({
    name,
    description,
    category_id: categoryId || null,
    template_type: 'simple',
    tags: tags.split(',').map(t => t.trim()).filter(Boolean),
    change_summary: summary || (id ? 'Updated via Quick Builder' : 'Created via Quick Builder'),
    content: { header, body_html: getBodyHtml(), footer, paper, watermark, canvas_elements: [] },
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
        onSaved?.()
      } else {
        const r = await documentCenterService.createTemplate(buildPayload())
        const newId = r.data?.data?._id
        toast.success('Template created')
        if (newId) navigate(`/hrm/doc-center/quick/${newId}`, { replace: true })
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

  const paperW = paper.size === 'A4' ? (paper.orientation === 'landscape' ? '297mm' : '210mm')
               : paper.size === 'letter' ? (paper.orientation === 'landscape' ? '279mm' : '216mm')
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

  const AutoSaveIcon = autoSaveStatus === 'saved'  ? CheckCircle
    : autoSaveStatus === 'saving'  ? Loader2
    : autoSaveStatus === 'error'   ? AlertCircle
    : Clock
  const autoSaveColor = autoSaveStatus === 'saved' ? 'text-green-500'
    : autoSaveStatus === 'error' ? 'text-red-400'
    : 'text-gray-400'
  const autoSaveLabel = { saved: 'Saved', saving: 'Saving…', unsaved: 'Unsaved changes', error: 'Save failed' }

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-primary)' }}>

      {/* ── Top bar ── */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b flex-shrink-0"
        style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
        <button onClick={() => navigate('/hrm/doc-center/templates')}
          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          title="Back to Templates">
          <ArrowLeft className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
        </button>
        <div className="flex-1 min-w-0">
          <input
            value={name}
            onChange={e => { setName(e.target.value); scheduleAutoSave() }}
            className="bg-transparent border-none outline-none text-sm font-semibold w-full"
            style={{ color: 'var(--text-heading)' }}
            placeholder="Template Name"
          />
        </div>

        {/* Auto-save status */}
        {id && (
          <div className={`flex items-center gap-1 text-xs flex-shrink-0 ${autoSaveColor}`}>
            <AutoSaveIcon className={`w-3 h-3 ${autoSaveStatus === 'saving' ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{autoSaveLabel[autoSaveStatus]}</span>
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFullPreview(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors"
            style={{ borderColor: 'var(--border)', color: 'var(--text-body)' }}
            title="Fullscreen Preview"
          >
            <Maximize2 className="w-4 h-4" />
            <span className="hidden sm:inline">Preview</span>
          </button>
          <button
            onClick={() => setPreview(p => !p)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${preview ? 'bg-violet-600 text-white border-violet-600' : ''}`}
            style={preview ? {} : { borderColor: 'var(--border)', color: 'var(--text-body)' }}
          >
            <Eye className="w-4 h-4" />
            {preview ? 'Edit' : 'Preview'}
          </button>

          {/* Export dropdown */}
          <div className="relative" ref={exportRef}>
            <button
              onClick={() => setShowExport(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors"
              style={{ borderColor: 'var(--border)', color: 'var(--text-body)' }}
            >
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
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors text-left"
                    style={{ color: 'var(--text-body)' }}>
                    <item.icon className="w-3.5 h-3.5 text-violet-500" />
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {id && (
            <button
              onClick={() => navigate(`/hrm/doc-center/generated?tmpl=${id}`)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors"
              style={{ borderColor: 'var(--border)', color: 'var(--text-body)' }}
            >
              <Wand2 className="w-4 h-4" /> Generate
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-semibold text-white"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden select-none">

        {/* ── Left panel ── */}
        <aside
          className="flex-shrink-0 border-r flex flex-col transition-all duration-200 overflow-hidden"
          style={{ width: leftCollapsed ? 0 : leftWidth, background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
        >
          <div className="flex-1 overflow-y-auto">
          <Panel title="Template Info" open={openSection === 'info'} onToggle={() => toggleSection('info')}>
            <div>
              <Lbl>Description</Lbl>
              <textarea value={description} onChange={e => { setDescription(e.target.value); scheduleAutoSave() }}
                rows={2} placeholder="Optional description…"
                className="w-full px-2.5 py-1.5 text-sm rounded-lg border resize-none focus:outline-none focus:ring-1 focus:ring-violet-500"
                style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)', color: 'var(--text-body)' }} />
            </div>
            <div>
              <Lbl>Category</Lbl>
              <Sel value={categoryId} onChange={e => { setCategoryId(e.target.value); scheduleAutoSave() }}>
                <option value="">— No Category —</option>
                {categories.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
              </Sel>
            </div>
            <div>
              <Lbl>Tags (comma separated)</Lbl>
              <Inp value={tags} onChange={e => { setTags(e.target.value); scheduleAutoSave() }} placeholder="HR, Offer, Legal…" />
            </div>
          </Panel>

          <Panel title="Header" open={openSection === 'header'} onToggle={() => toggleSection('header')}>
            <Tog label="Show Header" checked={header.show} onChange={v => setHeader(h => ({ ...h, show: v }))} />
            {header.show && <>
              {/* Logo */}
              <div>
                <Lbl>Logo</Lbl>
                {header.logo_url ? (
                  <div className="relative inline-block">
                    <img src={header.logo_url} alt="Logo"
                      style={{ height: 36, maxWidth: '100%', borderRadius: 4, border: '1px solid var(--border)' }} />
                    <button onClick={() => setHeader(h => ({ ...h, logo_url: '' }))}
                      className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center">
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </div>
                ) : (
                  <label className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
                    <Upload className="w-3.5 h-3.5" />
                    <span className="text-xs">Upload Logo</span>
                    <input type="file" accept="image/*" className="sr-only" onChange={handleLogoUpload} />
                  </label>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Lbl>Logo Height (px)</Lbl>
                  <Inp type="number" value={header.logo_height || 40} min={20} max={120}
                    onChange={e => setHeader(h => ({ ...h, logo_height: +e.target.value }))} />
                </div>
                <div><Lbl>Logo Align</Lbl>
                  <Sel value={header.logo_alignment || 'left'} onChange={e => setHeader(h => ({ ...h, logo_alignment: e.target.value }))}>
                    <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
                  </Sel>
                </div>
              </div>
              {/* Header height */}
              <div><Lbl>Header Height (px)</Lbl>
                <Sel value={header.header_height || 120} onChange={e => setHeader(h => ({ ...h, header_height: +e.target.value }))}>
                  {[80,100,120,140,160,200].map(v => <option key={v} value={v}>{v}px</option>)}
                </Sel>
              </div>
              {/* Company info */}
              <div><Lbl>Company Name</Lbl><Inp value={header.company_name} onChange={e => setHeader(h => ({ ...h, company_name: e.target.value }))} placeholder="Acme Corp" /></div>
              <div><Lbl>Address</Lbl><Inp value={header.company_address} onChange={e => setHeader(h => ({ ...h, company_address: e.target.value }))} placeholder="123 Main St…" /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Lbl>Email</Lbl><Inp value={header.company_email} onChange={e => setHeader(h => ({ ...h, company_email: e.target.value }))} placeholder="hr@co.com" /></div>
                <div><Lbl>Phone</Lbl><Inp value={header.company_phone} onChange={e => setHeader(h => ({ ...h, company_phone: e.target.value }))} placeholder="+91 …" /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Lbl>Website</Lbl><Inp value={header.company_website || ''} onChange={e => setHeader(h => ({ ...h, company_website: e.target.value }))} placeholder="www.co.com" /></div>
                <div><Lbl>Company Align</Lbl>
                  <Sel value={header.company_alignment || 'left'} onChange={e => setHeader(h => ({ ...h, company_alignment: e.target.value }))}>
                    <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
                  </Sel>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Lbl>GST No.</Lbl><Inp value={header.gst_number || ''} onChange={e => setHeader(h => ({ ...h, gst_number: e.target.value }))} placeholder="GSTIN…" /></div>
                <div><Lbl>Reg. No.</Lbl><Inp value={header.reg_number || ''} onChange={e => setHeader(h => ({ ...h, reg_number: e.target.value }))} placeholder="CIN…" /></div>
              </div>
              {/* Fonts */}
              <div className="grid grid-cols-2 gap-2">
                <div><Lbl>Font Size</Lbl><Inp type="number" value={header.font_size} min={8} max={24} onChange={e => setHeader(h => ({ ...h, font_size: +e.target.value }))} /></div>
                <div><Lbl>Font Family</Lbl>
                  <Sel value={header.font_family || 'Arial'} onChange={e => setHeader(h => ({ ...h, font_family: e.target.value }))}>
                    {FONT_FAMILIES.map(f => <option key={f} value={f}>{f}</option>)}
                  </Sel>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Lbl>Text Color</Lbl><input type="color" value={header.font_color} onChange={e => setHeader(h => ({ ...h, font_color: e.target.value }))} className="w-full h-8 rounded-lg border cursor-pointer" style={{ borderColor: 'var(--border)' }} /></div>
                <div><Lbl>Background</Lbl><input type="color" value={header.background_color || '#ffffff'} onChange={e => setHeader(h => ({ ...h, background_color: e.target.value }))} className="w-full h-8 rounded-lg border cursor-pointer" style={{ borderColor: 'var(--border)' }} /></div>
              </div>
              {/* Padding */}
              <p className="text-[10px] font-bold uppercase tracking-wider pt-1" style={{ color: 'var(--text-muted)' }}>Padding (px)</p>
              <div className="grid grid-cols-4 gap-1">
                {['top','right','bottom','left'].map(s => (
                  <div key={s}><p className="text-[9px] text-center mb-0.5" style={{ color: 'var(--text-muted)' }}>{s[0].toUpperCase()}</p>
                    <Inp type="number" value={header[`padding_${s}`] ?? 12} min={0} max={80}
                      onChange={e => setHeader(h => ({ ...h, [`padding_${s}`]: +e.target.value }))} /></div>
                ))}
              </div>
              {/* Margin */}
              <p className="text-[10px] font-bold uppercase tracking-wider pt-1" style={{ color: 'var(--text-muted)' }}>Margin (px)</p>
              <div className="grid grid-cols-4 gap-1">
                {['top','right','bottom','left'].map(s => (
                  <div key={s}><p className="text-[9px] text-center mb-0.5" style={{ color: 'var(--text-muted)' }}>{s[0].toUpperCase()}</p>
                    <Inp type="number" value={header[`margin_${s}`] ?? 0} min={0} max={80}
                      onChange={e => setHeader(h => ({ ...h, [`margin_${s}`]: +e.target.value }))} /></div>
                ))}
              </div>
              {/* Border */}
              <div className="grid grid-cols-2 gap-2">
                <div><Lbl>Border Color</Lbl><input type="color" value={header.border_color || '#d1d5db'} onChange={e => setHeader(h => ({ ...h, border_color: e.target.value }))} className="w-full h-8 rounded-lg border cursor-pointer" style={{ borderColor: 'var(--border)' }} /></div>
                <div><Lbl>Border Width</Lbl><Inp type="number" value={header.border_width ?? 1} min={0} max={8} onChange={e => setHeader(h => ({ ...h, border_width: +e.target.value }))} /></div>
              </div>
              <Tog label="Show Border Bottom" checked={header.border_bottom} onChange={v => setHeader(h => ({ ...h, border_bottom: v }))} />
            </>}
          </Panel>

          <Panel title="Footer" open={openSection === 'footer'} onToggle={() => toggleSection('footer')}>
            <Tog label="Show Footer" checked={footer.show} onChange={v => setFooter(f => ({ ...f, show: v }))} />
            {footer.show && <>
              <div><Lbl>Footer Text</Lbl><Inp value={footer.text} onChange={e => setFooter(f => ({ ...f, text: e.target.value }))} placeholder="Company Confidential" /></div>
              <div><Lbl>Description Line</Lbl><Inp value={footer.description || ''} onChange={e => setFooter(f => ({ ...f, description: e.target.value }))} placeholder="Extra footer line…" /></div>
              {/* Footer height */}
              <div><Lbl>Footer Height (px)</Lbl>
                <Sel value={footer.footer_height || 60} onChange={e => setFooter(f => ({ ...f, footer_height: +e.target.value }))}>
                  {[40,50,60,80,100].map(v => <option key={v} value={v}>{v}px</option>)}
                </Sel>
              </div>
              <div><Lbl>Alignment</Lbl>
                <Sel value={footer.alignment} onChange={e => setFooter(f => ({ ...f, alignment: e.target.value }))}>
                  <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
                </Sel>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Lbl>Font Size</Lbl><Inp type="number" value={footer.font_size} min={6} max={18} onChange={e => setFooter(f => ({ ...f, font_size: +e.target.value }))} /></div>
                <div><Lbl>Text Color</Lbl><input type="color" value={footer.font_color} onChange={e => setFooter(f => ({ ...f, font_color: e.target.value }))} className="w-full h-8 rounded-lg border cursor-pointer" style={{ borderColor: 'var(--border)' }} /></div>
              </div>
              {/* Padding */}
              <p className="text-[10px] font-bold uppercase tracking-wider pt-1" style={{ color: 'var(--text-muted)' }}>Padding (px)</p>
              <div className="grid grid-cols-4 gap-1">
                {['top','right','bottom','left'].map(s => (
                  <div key={s}><p className="text-[9px] text-center mb-0.5" style={{ color: 'var(--text-muted)' }}>{s[0].toUpperCase()}</p>
                    <Inp type="number" value={footer[`padding_${s}`] ?? 8} min={0} max={60}
                      onChange={e => setFooter(f => ({ ...f, [`padding_${s}`]: +e.target.value }))} /></div>
                ))}
              </div>
              {/* Margin */}
              <p className="text-[10px] font-bold uppercase tracking-wider pt-1" style={{ color: 'var(--text-muted)' }}>Margin (px)</p>
              <div className="grid grid-cols-4 gap-1">
                {['top','right','bottom','left'].map(s => (
                  <div key={s}><p className="text-[9px] text-center mb-0.5" style={{ color: 'var(--text-muted)' }}>{s[0].toUpperCase()}</p>
                    <Inp type="number" value={footer[`margin_${s}`] ?? 0} min={0} max={60}
                      onChange={e => setFooter(f => ({ ...f, [`margin_${s}`]: +e.target.value }))} /></div>
                ))}
              </div>
              {/* Border */}
              <div className="grid grid-cols-2 gap-2">
                <div><Lbl>Border Color</Lbl><input type="color" value={footer.border_color || '#d1d5db'} onChange={e => setFooter(f => ({ ...f, border_color: e.target.value }))} className="w-full h-8 rounded-lg border cursor-pointer" style={{ borderColor: 'var(--border)' }} /></div>
                <div><Lbl>Border Width</Lbl><Inp type="number" value={footer.border_width ?? 1} min={0} max={8} onChange={e => setFooter(f => ({ ...f, border_width: +e.target.value }))} /></div>
              </div>
              <Tog label="Page Numbers"       checked={footer.show_page_numbers} onChange={v => setFooter(f => ({ ...f, show_page_numbers: v }))} />
              <Tog label="Current Date"       checked={footer.show_date}          onChange={v => setFooter(f => ({ ...f, show_date: v }))} />
              <Tog label="Confidential Label" checked={footer.confidential_label} onChange={v => setFooter(f => ({ ...f, confidential_label: v }))} />
              <Tog label="Show Border Top"    checked={footer.border_top}         onChange={v => setFooter(f => ({ ...f, border_top: v }))} />
            </>}
          </Panel>

          <Panel title="Paper Settings" open={openSection === 'paper'} onToggle={() => toggleSection('paper')}>
            <div><Lbl>Size</Lbl>
              <Sel value={paper.size} onChange={e => setPaper(p => ({ ...p, size: e.target.value }))}>
                <option value="A4">A4 (210 × 297 mm)</option>
                <option value="letter">Letter (216 × 279 mm)</option>
                <option value="legal">Legal (216 × 356 mm)</option>
              </Sel>
            </div>
            <div><Lbl>Orientation</Lbl>
              <Sel value={paper.orientation} onChange={e => setPaper(p => ({ ...p, orientation: e.target.value }))}>
                <option value="portrait">Portrait</option>
                <option value="landscape">Landscape</option>
              </Sel>
            </div>
            <p className="text-[10px] font-bold uppercase tracking-wider pt-1" style={{ color: 'var(--text-muted)' }}>Margins (pt)</p>
            <div className="grid grid-cols-2 gap-2">
              {['top','bottom','left','right'].map(s => (
                <div key={s}><Lbl>{s.charAt(0).toUpperCase() + s.slice(1)}</Lbl>
                  <Inp type="number" value={paper[`margin_${s}`]} min={0} max={200}
                    onChange={e => setPaper(p => ({ ...p, [`margin_${s}`]: +e.target.value }))} />
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Watermark" open={openSection === 'watermark'} onToggle={() => toggleSection('watermark')}>
            <Tog label="Enable Watermark" checked={watermark.enabled} onChange={v => setWatermark(w => ({ ...w, enabled: v }))} />
            {watermark.enabled && <>
              <div><Lbl>Preset</Lbl>
                <div className="flex flex-wrap gap-1">
                  {WATERMARK_PRESETS.map(p => (
                    <button key={p} type="button" onClick={() => setWatermark(w => ({ ...w, text: p }))}
                      className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${watermark.text === p ? 'bg-violet-600 text-white border-violet-600' : ''}`}
                      style={watermark.text !== p ? { borderColor: 'var(--border)', color: 'var(--text-body)' } : {}}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>
              <div><Lbl>Custom Text</Lbl><Inp value={watermark.text} onChange={e => setWatermark(w => ({ ...w, text: e.target.value }))} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Lbl>Opacity</Lbl><Inp type="number" value={watermark.opacity} min={0.05} max={1} step={0.05} onChange={e => setWatermark(w => ({ ...w, opacity: +e.target.value }))} /></div>
                <div><Lbl>Rotation (°)</Lbl><Inp type="number" value={watermark.rotation} min={-180} max={180} onChange={e => setWatermark(w => ({ ...w, rotation: +e.target.value }))} /></div>
              </div>
              <div><Lbl>Font Size (px)</Lbl><Inp type="number" value={watermark.size || 72} min={20} max={200} onChange={e => setWatermark(w => ({ ...w, size: +e.target.value }))} /></div>
            </>}
          </Panel>

          <Panel title="HR Fields" open={openSection === 'fields'} onToggle={() => toggleSection('fields')}>
            <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>Click to insert into document</p>
            {Object.entries(fieldGroups).map(([group, fields]) => (
              <div key={group} className="mb-2">
                <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>{group}</p>
                <div className="flex flex-wrap gap-1">
                  {fields.map(f => (
                    <button key={f.field} type="button"
                      onMouseDown={saveSelection}
                      onClick={() => insertField(f.field)}
                      className="text-[11px] px-2 py-0.5 rounded-full border font-mono transition-colors hover:bg-violet-600 hover:text-white hover:border-violet-600"
                      style={{ borderColor: 'var(--border)', color: 'var(--text-body)' }} title={f.field}>
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </Panel>

          <Panel title="Insert Table" open={openSection === 'tables'} onToggle={() => toggleSection('tables')}>
            <div className="space-y-1.5">
              {[
                { key: 'employee', label: 'Employee Info Table' },
                { key: 'salary',   label: 'Salary Slip Table' },
                { key: 'custom2',  label: '2-Column Table' },
                { key: 'custom3',  label: '3-Column Table' },
              ].map(t => (
                <button key={t.key} type="button"
                  onMouseDown={saveSelection}
                  onClick={() => insertTable(t.key)}
                  className="w-full text-left text-xs px-3 py-2 rounded-lg border transition-colors hover:bg-violet-50 dark:hover:bg-violet-900/20 hover:border-violet-400 flex items-center gap-2"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-body)' }}>
                  <Table className="w-3.5 h-3.5 flex-shrink-0 text-violet-500" />
                  {t.label}
                </button>
              ))}
            </div>
          </Panel>

          <Panel title="Insert Element" open={openSection === 'elements'} onToggle={() => toggleSection('elements')}>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { label: 'Heading 1', fn: () => exec('formatBlock', 'h1') },
                { label: 'Heading 2', fn: () => exec('formatBlock', 'h2') },
                { label: 'Heading 3', fn: () => exec('formatBlock', 'h3') },
                { label: 'Paragraph',  fn: () => exec('formatBlock', 'p') },
                { label: 'Quote',      fn: () => exec('formatBlock', 'blockquote') },
                { label: 'Divider',    fn: insertDivider },
                { label: 'Page Break', fn: insertPageBreak },
                { label: 'Signature',  fn: insertSignatureBlock },
              ].map(el => (
                <button key={el.label} type="button"
                  onMouseDown={saveSelection}
                  onClick={el.fn}
                  className="text-xs px-2 py-1.5 rounded-lg border transition-colors text-center hover:bg-violet-50 dark:hover:bg-violet-900/20 hover:border-violet-400"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-body)' }}>
                  {el.label}
                </button>
              ))}
            </div>
          </Panel>
          </div>
        </aside>

        {/* ── Left collapse toggle + resize divider ── */}
        <div className="flex flex-col flex-shrink-0 relative">
          <button
            onClick={toggleLeftPanel}
            title={leftCollapsed ? 'Show blocks panel' : 'Hide blocks panel'}
            className="absolute top-2 -right-3 z-20 w-6 h-6 rounded-full border flex items-center justify-center hover:bg-violet-600 hover:text-white hover:border-violet-600 transition-colors"
            style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}
          >
            {leftCollapsed ? <PanelLeftOpen className="w-3 h-3" /> : <PanelLeftClose className="w-3 h-3" />}
          </button>
          {!leftCollapsed && <ResizeDivider onDrag={handleLeftResize} />}
        </div>

        {/* ── Center: Toolbar + Canvas ── */}
        <div className="flex-1 flex flex-col overflow-hidden select-text">

          {/* Formatting toolbar */}
          {!preview && (
            <div className="flex items-center flex-wrap gap-1 px-3 py-1.5 border-b flex-shrink-0"
              style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
              <select className="text-xs px-1.5 py-1 rounded-lg border" defaultValue="Arial"
                style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)', color: 'var(--text-body)' }}
                onMouseDown={saveSelection}
                onChange={e => exec('fontName', e.target.value)}>
                {FONT_FAMILIES.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
              <select className="text-xs px-1.5 py-1 rounded-lg border w-16" defaultValue="3"
                style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)', color: 'var(--text-body)' }}
                onMouseDown={saveSelection}
                onChange={e => exec('fontSize', e.target.value)}>
                {[1,2,3,4,5,6,7].map(s => <option key={s} value={s}>{[8,10,12,14,18,24,36][s-1]}px</option>)}
              </select>
              <div className="w-px h-5 bg-gray-300 dark:bg-gray-600" />
              <TB icon={Bold}          label="Bold"          onClick={() => exec('bold')} />
              <TB icon={Italic}        label="Italic"        onClick={() => exec('italic')} />
              <TB icon={Underline}     label="Underline"     onClick={() => exec('underline')} />
              <TB icon={Strikethrough} label="Strikethrough" onClick={() => exec('strikeThrough')} />
              <div className="w-px h-5 bg-gray-300 dark:bg-gray-600" />
              <label title="Text Color" className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer">
                <Palette className="w-4 h-4" style={{ color: 'var(--text-body)' }} />
                <input type="color" className="sr-only" onMouseDown={saveSelection} onChange={e => exec('foreColor', e.target.value)} />
              </label>
              <label title="Highlight" className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer">
                <Type className="w-4 h-4" style={{ color: 'var(--text-body)' }} />
                <input type="color" className="sr-only" onMouseDown={saveSelection} onChange={e => exec('hiliteColor', e.target.value)} />
              </label>
              <div className="w-px h-5 bg-gray-300 dark:bg-gray-600" />
              <TB icon={AlignLeft}    label="Left"    onClick={() => exec('justifyLeft')} />
              <TB icon={AlignCenter}  label="Center"  onClick={() => exec('justifyCenter')} />
              <TB icon={AlignRight}   label="Right"   onClick={() => exec('justifyRight')} />
              <TB icon={AlignJustify} label="Justify" onClick={() => exec('justifyFull')} />
              <div className="w-px h-5 bg-gray-300 dark:bg-gray-600" />
              <TB icon={List}        label="Bullet List"   onClick={() => exec('insertUnorderedList')} />
              <TB icon={ListOrdered} label="Numbered List" onClick={() => exec('insertOrderedList')} />
              <div className="w-px h-5 bg-gray-300 dark:bg-gray-600" />
              <TB icon={Plus}      label="Indent"   onClick={() => exec('indent')} />
              <TB icon={Minus}     label="Outdent"  onClick={() => exec('outdent')} />
              <TB icon={RotateCcw} label="Undo"     onClick={() => exec('undo')} />
              <TB icon={RotateCw}  label="Redo"     onClick={() => exec('redo')} />
              <div className="w-px h-5 bg-gray-300 dark:bg-gray-600" />
              <TB icon={Link2} label="Insert Link" onClick={() => {
                saveSelection()
                const u = prompt('Enter URL:')
                if (u) { restoreSelection(); exec('createLink', u) }
              }} />
              <div className="w-px h-5 bg-gray-300 dark:bg-gray-600" />
              <label title="Insert Image" className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer">
                <ImageIcon className="w-4 h-4" style={{ color: 'var(--text-body)' }} />
                <input type="file" accept="image/*" className="sr-only"
                  onChange={e => {
                    const file = e.target.files[0]
                    if (!file) return
                    const reader = new FileReader()
                    reader.onload = ev => insertHtml(`<img src="${ev.target.result}" style="max-width:100%;height:auto;" />`)
                    reader.readAsDataURL(file)
                    e.target.value = ''
                  }} />
              </label>
            </div>
          )}

          {/* Document canvas */}
          <div className="flex-1 overflow-auto py-8 px-4" style={{ background: '#e5e7eb' }}>
            {preview ? (
              /* Preview mode: paginated, read-only */
              <PaginatedDocument
                html={editorRef.current?.innerHTML || ''}
                header={header} footer={footer} paper={paper} watermark={watermark}
                ml={ml} mr={mr} mt={mt} mb={mb} paperW={paperW}
                readOnly
              />
            ) : (
              /* Edit mode: single contentEditable with page-break guides */
              <PaginatedDocument
                html=""
                header={header} footer={footer} paper={paper} watermark={watermark}
                ml={ml} mr={mr} mt={mt} mb={mb} paperW={paperW}
                editorRef={editorRef}
                onMouseUp={saveSelection}
                onKeyUp={() => { saveSelection(); scheduleAutoSave() }}
                onInput={scheduleAutoSave}
                readOnly={false}
              />
            )}
          </div>
        </div>

        {/* ── Right collapse toggle + resize divider ── */}
        {!preview && (
          <div className="flex flex-col flex-shrink-0 relative">
            <button
              onClick={toggleRightPanel}
              title={rightCollapsed ? 'Show properties panel' : 'Hide properties panel'}
              className="absolute top-2 -left-3 z-20 w-6 h-6 rounded-full border flex items-center justify-center hover:bg-violet-600 hover:text-white hover:border-violet-600 transition-colors"
              style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}
            >
              {rightCollapsed ? <PanelRightOpen className="w-3 h-3" /> : <PanelRightClose className="w-3 h-3" />}
            </button>
            {!rightCollapsed && <ResizeDivider onDrag={handleRightResize} />}
          </div>
        )}

        {/* ── Right panel: Properties ── */}
        {!preview && (
          <aside
            className="flex-shrink-0 border-l flex flex-col overflow-hidden transition-all duration-200"
            style={{ width: rightCollapsed ? 0 : rightWidth, background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
          >
            <RightPanel
              editorRef={editorRef}
              exec={(cmd, val) => { restoreSelection(); exec(cmd, val) }}
              insertField={(f) => { restoreSelection(); insertField(f) }}
              insertHtml={(h) => { restoreSelection(); insertHtml(h) }}
            />
          </aside>
        )}
      </div>

      {/* ── Fullscreen Preview Modal ── */}
      {showFullPreview && (
        <PreviewModal
          html={getBodyHtml()}
          header={header}
          footer={footer}
          paper={paper}
          watermark={watermark}
          onClose={() => setShowFullPreview(false)}
        />
      )}

      <style>{`
        [data-placeholder]:empty::before { content: attr(data-placeholder); color: #9ca3af; pointer-events: none; }
        .doc-field { display: inline; }
        blockquote { border-left: 4px solid #7c3aed; padding-left: 12px; color: #6b7280; margin: 8px 0; }
        table { border-collapse: collapse; width: 100%; }
        table td, table th { border: 1px solid #e5e7eb; padding: 6px 10px; }
        a { color: #7c3aed; }
      `}</style>
    </div>
  )
}
