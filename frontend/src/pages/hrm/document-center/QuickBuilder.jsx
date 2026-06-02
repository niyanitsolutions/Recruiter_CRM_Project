import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  Save, Eye, Bold, Italic, Underline, Strikethrough,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, Link2, RotateCcw, RotateCw,
  Palette, Image as ImageIcon, Table as TableIcon,
  ChevronDown, ChevronUp, Loader2, ArrowLeft, FileText,
  ZoomIn, ZoomOut, X, Download, Printer, Clock, CheckCircle,
  AlertCircle, Upload, Maximize2, Wand2, Type, Settings,
  PenLine, Building2, LayoutTemplate, PanelLeftClose, PanelLeftOpen,
  Scissors,
} from 'lucide-react'
import documentCenterService from '../../../services/documentCenterService'

// ─── Paper dimensions px at 96 dpi ──────────────────────────────────────────
const PAPER_PX = { A4: [794, 1123], letter: [816, 1056], legal: [816, 1369] }

// ─── Constants ───────────────────────────────────────────────────────────────
const HR_FIELDS = [
  { group: 'Employee', label: 'Employee Name',    field: '{{employee_name}}' },
  { group: 'Employee', label: 'Employee ID',       field: '{{employee_id}}' },
  { group: 'Employee', label: 'Department',        field: '{{department}}' },
  { group: 'Employee', label: 'Designation',       field: '{{designation}}' },
  { group: 'Employee', label: 'Joining Date',      field: '{{joining_date}}' },
  { group: 'Employee', label: 'Exit Date',         field: '{{exit_date}}' },
  { group: 'Employee', label: 'Salary',            field: '{{salary}}' },
  { group: 'Employee', label: 'Manager',           field: '{{manager_name}}' },
  { group: 'Employee', label: 'Email',             field: '{{employee_email}}' },
  { group: 'Employee', label: 'Phone',             field: '{{employee_phone}}' },
  { group: 'Employee', label: 'Address',           field: '{{employee_address}}' },
  { group: 'Company',  label: 'Company Name',      field: '{{company_name}}' },
  { group: 'Company',  label: 'Company Address',   field: '{{company_address}}' },
  { group: 'Company',  label: 'Company Phone',     field: '{{company_phone}}' },
  { group: 'Company',  label: 'Company Email',     field: '{{company_email}}' },
  { group: 'Company',  label: 'GST Number',        field: '{{gst_number}}' },
  { group: 'Company',  label: 'Reg. Number',       field: '{{reg_number}}' },
  { group: 'Date',     label: 'Current Date',      field: '{{current_date}}' },
  { group: 'Date',     label: 'Month & Year',      field: '{{month_year}}' },
  { group: 'Date',     label: 'Current Year',      field: '{{current_year}}' },
  { group: 'Payroll',  label: 'Basic Salary',      field: '{{basic}}' },
  { group: 'Payroll',  label: 'HRA',               field: '{{hra}}' },
  { group: 'Payroll',  label: 'Special Allowance', field: '{{special_allowance}}' },
  { group: 'Payroll',  label: 'Gross Salary',      field: '{{gross}}' },
  { group: 'Payroll',  label: 'PF',                field: '{{pf}}' },
  { group: 'Payroll',  label: 'Prof. Tax',         field: '{{pt}}' },
  { group: 'Payroll',  label: 'TDS',               field: '{{tds}}' },
  { group: 'Payroll',  label: 'Total Deductions',  field: '{{total_deductions}}' },
  { group: 'Payroll',  label: 'Net Salary',        field: '{{net_salary}}' },
  { group: 'Payroll',  label: 'Salary in Words',   field: '{{salary_in_words}}' },
]
const TEMPLATE_TYPES = [
  'Offer Letter','Experience Letter','Relieving Letter','Appointment Letter',
  'NDA','HR Policy','Payslip','Warning Letter','Promotion Letter',
  'Transfer Letter','Internship Letter','Other',
]
const FONT_FAMILIES = ['Arial','Times New Roman','Georgia','Courier New','Verdana','Trebuchet MS','Helvetica']
const WATERMARK_PRESETS = ['DRAFT','CONFIDENTIAL','INTERNAL','APPROVED','FOR YOUR EYES ONLY']

const HEADER_LAYOUTS = [
  { value: 'company_left_logo_right', label: 'Company Left / Logo Right' },
  { value: 'logo_left_company_right', label: 'Logo Left / Company Right' },
  { value: 'logo_top_company_bottom', label: 'Logo Top / Company Bottom (Centered)' },
  { value: 'company_top_logo_bottom', label: 'Company Top / Logo Bottom (Centered)' },
  { value: 'logo_only',               label: 'Logo Only' },
  { value: 'company_only',            label: 'Company Only' },
]

const DOCUMENT_PRESETS = [
  { id: 'offer_letter',   name: 'Offer Letter',       headerLayout: 'company_left_logo_right', headerSpacing: 20, titleAlign: 'center', titleMt: 20, titleMb: 16, marginTop: 72, marginBottom: 72 },
  { id: 'appointment',   name: 'Appointment Letter', headerLayout: 'company_left_logo_right', headerSpacing: 20, titleAlign: 'left',   titleMt: 20, titleMb: 14, marginTop: 72, marginBottom: 72 },
  { id: 'experience',    name: 'Experience Letter',  headerLayout: 'company_left_logo_right', headerSpacing: 24, titleAlign: 'center', titleMt: 24, titleMb: 16, marginTop: 72, marginBottom: 72 },
  { id: 'relieving',     name: 'Relieving Letter',   headerLayout: 'company_left_logo_right', headerSpacing: 24, titleAlign: 'center', titleMt: 24, titleMb: 16, marginTop: 72, marginBottom: 72 },
  { id: 'certificate',   name: 'Certificate',        headerLayout: 'logo_top_company_bottom', headerSpacing: 30, titleAlign: 'center', titleMt: 30, titleMb: 20, marginTop: 72, marginBottom: 72 },
  { id: 'general_letter',name: 'General Letter',     headerLayout: 'company_left_logo_right', headerSpacing: 16, titleAlign: 'left',   titleMt: 16, titleMb: 12, marginTop: 72, marginBottom: 72 },
]

// ─── Shared atoms ────────────────────────────────────────────────────────────
const Lbl = ({ children }) => (
  <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>{children}</p>
)
const Inp = (props) => (
  <input {...props}
    className="w-full px-2.5 py-1.5 text-sm rounded-lg border focus:outline-none focus:ring-1 focus:ring-violet-500"
    style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)', color: 'var(--text-body)' }} />
)
const Sel = ({ children, ...props }) => (
  <select {...props}
    className="w-full px-2.5 py-1.5 text-sm rounded-lg border focus:outline-none focus:ring-1 focus:ring-violet-500"
    style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)', color: 'var(--text-body)' }}>
    {children}
  </select>
)
const Tog = ({ label, checked, onChange }) => (
  <label className="flex items-center gap-2 cursor-pointer select-none">
    <div onClick={() => onChange(!checked)}
      className={`w-9 h-5 rounded-full transition-colors relative flex-shrink-0 ${checked ? 'bg-violet-600' : 'bg-gray-300 dark:bg-gray-600'}`}>
      <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
    </div>
    <span className="text-xs" style={{ color: 'var(--text-body)' }}>{label}</span>
  </label>
)

// ─── Accordion Section ────────────────────────────────────────────────────────
function Section({ id, title, icon: Icon, open, onToggle, children, badge }) {
  return (
    <div className="border-b last:border-b-0" style={{ borderColor: 'var(--border)' }}>
      <button type="button" onClick={() => onToggle(id)}
        className="w-full flex items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-violet-50 dark:hover:bg-violet-900/10"
        style={{ background: open ? 'rgba(124,58,237,0.06)' : 'transparent' }}>
        {Icon && (
          <div className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 ${open ? 'bg-violet-600' : 'bg-gray-200 dark:bg-gray-700'}`}>
            <Icon className={`w-3.5 h-3.5 ${open ? 'text-white' : ''}`} style={open ? {} : { color: 'var(--text-muted)' }} />
          </div>
        )}
        <span className="flex-1 text-sm font-semibold" style={{ color: 'var(--text-heading)' }}>{title}</span>
        {badge && (
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badge === 'ON' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}>
            {badge}
          </span>
        )}
        {open ? <ChevronUp className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
               : <ChevronDown className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />}
      </button>
      {open && (
        <div className="px-5 pb-5 pt-2 space-y-3" style={{ background: 'var(--bg-primary)' }}>
          {children}
        </div>
      )}
    </div>
  )
}

// ─── Toolbar button ───────────────────────────────────────────────────────────
const TB = ({ icon: Icon, label, onClick }) => (
  <button type="button" title={label} onMouseDown={e => { e.preventDefault(); onClick() }}
    className="p-1.5 rounded transition-colors hover:bg-gray-200 dark:hover:bg-gray-600"
    style={{ color: 'var(--text-body)' }}>
    <Icon className="w-3.5 h-3.5" />
  </button>
)

// ─── Body Editor ──────────────────────────────────────────────────────────────
function BodyEditor({ editorRef, onInput }) {
  const savedSel = useRef(null)

  const saveSel = () => {
    const sel = window.getSelection()
    if (sel?.rangeCount > 0) savedSel.current = sel.getRangeAt(0).cloneRange()
  }
  const restoreSel = () => {
    if (!savedSel.current) return
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(savedSel.current)
  }
  const exec = (cmd, val = null) => {
    editorRef.current?.focus()
    restoreSel()
    document.execCommand(cmd, false, val)
    onInput?.()
  }
  const insertHtml = (html) => {
    editorRef.current?.focus()
    restoreSel()
    document.execCommand('insertHTML', false, html)
    onInput?.()
  }
  const insertField = (field) => insertHtml(
    `<span style="background:#ede9fe;color:#7c3aed;padding:1px 5px;border-radius:3px;font-family:monospace;font-size:0.85em;">${field}</span>`
  )
  const insertTable = () => insertHtml(
    `<table border="1" style="border-collapse:collapse;width:100%;margin:8px 0;">` +
    `<tr><th style="padding:8px;background:#7c3aed;color:white;border:1px solid #e5e7eb;">Header 1</th>` +
    `<th style="padding:8px;background:#7c3aed;color:white;border:1px solid #e5e7eb;">Header 2</th>` +
    `<th style="padding:8px;background:#7c3aed;color:white;border:1px solid #e5e7eb;">Header 3</th></tr>` +
    `<tr><td style="padding:8px;border:1px solid #e5e7eb;">Cell 1</td>` +
    `<td style="padding:8px;border:1px solid #e5e7eb;">Cell 2</td>` +
    `<td style="padding:8px;border:1px solid #e5e7eb;">Cell 3</td></tr>` +
    `<tr><td style="padding:8px;background:#f9fafb;border:1px solid #e5e7eb;">Cell 4</td>` +
    `<td style="padding:8px;background:#f9fafb;border:1px solid #e5e7eb;">Cell 5</td>` +
    `<td style="padding:8px;background:#f9fafb;border:1px solid #e5e7eb;">Cell 6</td></tr></table>`
  )
  const insertPageBreak = () => insertHtml(
    `<div style="page-break-after:always;border-top:2px dashed #d1d5db;margin:16px 0 0;padding-top:4px;text-align:center;">` +
    `<span style="font-size:10px;color:#9ca3af;background:white;padding:0 8px;">— Page Break —</span></div>`
  )

  const fieldGroups = HR_FIELDS.reduce((acc, f) => {
    if (!acc[f.group]) acc[f.group] = []
    acc[f.group].push(f)
    return acc
  }, {})

  return (
    <div className="border rounded-xl overflow-hidden" style={{ borderColor: 'var(--border)' }}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b"
        style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
        <select className="text-xs px-1.5 py-1 rounded border mr-1"
          style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)', color: 'var(--text-body)' }}
          onMouseDown={saveSel} onChange={e => exec('fontName', e.target.value)}>
          {FONT_FAMILIES.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
        <select className="text-xs px-1.5 py-1 rounded border w-14 mr-1"
          style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)', color: 'var(--text-body)' }}
          defaultValue="3" onMouseDown={saveSel} onChange={e => exec('fontSize', e.target.value)}>
          {[1,2,3,4,5,6,7].map(s => <option key={s} value={s}>{[8,10,12,14,18,24,36][s-1]}</option>)}
        </select>
        <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-0.5" />
        <TB icon={Bold}          label="Bold"          onClick={() => exec('bold')} />
        <TB icon={Italic}        label="Italic"        onClick={() => exec('italic')} />
        <TB icon={Underline}     label="Underline"     onClick={() => exec('underline')} />
        <TB icon={Strikethrough} label="Strikethrough" onClick={() => exec('strikeThrough')} />
        <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-0.5" />
        <label title="Text Color" className="p-1.5 rounded cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600">
          <Palette className="w-3.5 h-3.5" style={{ color: 'var(--text-body)' }} />
          <input type="color" className="sr-only" onMouseDown={saveSel} onChange={e => exec('foreColor', e.target.value)} />
        </label>
        <label title="Highlight" className="p-1.5 rounded cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600">
          <span className="w-3.5 h-3.5 inline-flex items-center justify-center text-[10px] font-bold" style={{ color: 'var(--text-body)' }}>H</span>
          <input type="color" className="sr-only" onMouseDown={saveSel} onChange={e => exec('hiliteColor', e.target.value)} />
        </label>
        <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-0.5" />
        <TB icon={AlignLeft}    label="Left"    onClick={() => exec('justifyLeft')} />
        <TB icon={AlignCenter}  label="Center"  onClick={() => exec('justifyCenter')} />
        <TB icon={AlignRight}   label="Right"   onClick={() => exec('justifyRight')} />
        <TB icon={AlignJustify} label="Justify" onClick={() => exec('justifyFull')} />
        <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-0.5" />
        <TB icon={List}        label="Bullet List"   onClick={() => exec('insertUnorderedList')} />
        <TB icon={ListOrdered} label="Numbered List" onClick={() => exec('insertOrderedList')} />
        <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-0.5" />
        <TB icon={RotateCcw} label="Undo" onClick={() => exec('undo')} />
        <TB icon={RotateCw}  label="Redo" onClick={() => exec('redo')} />
        <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-0.5" />
        <TB icon={Link2} label="Insert Link" onClick={() => {
          saveSel()
          const u = prompt('Enter URL:')
          if (u) exec('createLink', u)
        }} />
        <TB icon={TableIcon}  label="Insert Table"      onClick={insertTable} />
        <TB icon={Scissors}   label="Insert Page Break" onClick={insertPageBreak} />
        <label title="Insert Image" className="p-1.5 rounded cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600">
          <ImageIcon className="w-3.5 h-3.5" style={{ color: 'var(--text-body)' }} />
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

      {/* Editable area */}
      <div ref={editorRef} contentEditable suppressContentEditableWarning
        onInput={onInput} onMouseUp={saveSel} onKeyUp={saveSel}
        className="focus:outline-none px-4 py-3"
        style={{ minHeight: 220, maxHeight: 360, overflowY: 'auto', fontSize: '12pt', lineHeight: 1.7, color: '#1f2937', fontFamily: 'Arial, sans-serif' }}
        data-placeholder="Type your document body content here…" />

      {/* HR Field strip */}
      <div className="border-t px-3 py-2.5" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
        <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Insert HR Field</p>
        <div className="space-y-1.5">
          {Object.entries(fieldGroups).map(([group, fields]) => (
            <div key={group}>
              <p className="text-[9px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>{group}</p>
              <div className="flex flex-wrap gap-1">
                {fields.map(f => (
                  <button key={f.field} type="button" onMouseDown={saveSel} onClick={() => insertField(f.field)}
                    title={f.field}
                    className="text-[10px] px-2 py-0.5 rounded-full border font-mono transition-colors hover:bg-violet-600 hover:text-white hover:border-violet-600"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-body)' }}>
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Draw Signature Canvas ────────────────────────────────────────────────────
function DrawSignature({ onChange }) {
  const canvasRef = useRef(null)
  const drawing   = useRef(false)
  const lastPos   = useRef(null)

  const getPos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect()
    const scaleX = canvasRef.current.width  / rect.width
    const scaleY = canvasRef.current.height / rect.height
    if (e.touches) {
      return { x: (e.touches[0].clientX - rect.left) * scaleX, y: (e.touches[0].clientY - rect.top) * scaleY }
    }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY }
  }

  const start = (e) => {
    e.preventDefault()
    drawing.current = true
    lastPos.current = getPos(e)
    const ctx = canvasRef.current.getContext('2d')
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#1f2937'
  }

  const move = (e) => {
    e.preventDefault()
    if (!drawing.current) return
    const pos = getPos(e)
    const ctx = canvasRef.current.getContext('2d')
    ctx.beginPath()
    ctx.moveTo(lastPos.current.x, lastPos.current.y)
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
    lastPos.current = pos
  }

  const end = () => {
    if (!drawing.current) return
    drawing.current = false
    onChange(canvasRef.current.toDataURL('image/png'))
  }

  const clear = () => {
    const ctx = canvasRef.current.getContext('2d')
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
    onChange('')
  }

  return (
    <div>
      <canvas ref={canvasRef} width={320} height={100}
        className="w-full rounded-lg border touch-none"
        style={{ borderColor: 'var(--border)', background: 'white', cursor: 'crosshair' }}
        onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
        onTouchStart={start} onTouchMove={move} onTouchEnd={end}
      />
      <button type="button" onClick={clear}
        className="mt-1 text-xs text-red-500 hover:text-red-700 transition-colors">
        Clear Canvas
      </button>
    </div>
  )
}

// ─── HTML builders ────────────────────────────────────────────────────────────
function buildTitleHtml(docTitle) {
  if (!docTitle?.text) return ''
  const mt = docTitle.margin_top ?? 12
  const mb = docTitle.margin_bottom ?? 14
  return `<div style="text-align:${docTitle.alignment || 'center'};font-family:${docTitle.font_family || 'Arial'},sans-serif;font-size:${docTitle.font_size || 16}pt;color:${docTitle.color || '#111827'};font-weight:${docTitle.bold ? 'bold' : 'normal'};font-style:${docTitle.italic ? 'italic' : 'normal'};text-decoration:${docTitle.underline ? 'underline' : 'none'};margin:${mt}px 0 ${mb}px;">${docTitle.text}</div>`
}

function buildSigHtml(sigCfg) {
  if (!sigCfg?.enabled) return ''
  const pos    = sigCfg.position || 'left'
  const imgSrc = sigCfg.image_url || sigCfg.draw_data || ''
  const sigH   = sigCfg.height || 44
  const sigW   = sigCfg.width  ? `width:${sigCfg.width}px;` : ''
  const imgM   = pos === 'right' ? 'margin-left:auto;' : pos === 'center' ? 'margin:0 auto;' : ''
  const imgPart = imgSrc
    ? `<img src="${imgSrc}" style="height:${sigH}px;${sigW}margin-bottom:4px;display:block;${imgM}" />`
    : ''
  const lineStyle = sigCfg.show_line !== false
    ? 'border-top:1.5px solid #374151;padding-top:5px;'
    : 'padding-top:5px;'
  const textAlign = pos === 'right' ? 'right' : pos === 'center' ? 'center' : 'left'

  return `<table style="width:100%;margin:24px 0 0;border-collapse:collapse;"><tr>
    ${pos === 'right' ? '<td style="width:60%;"></td>' : ''}
    <td style="width:${pos === 'center' ? '100%' : '40%'};padding:0 8px;vertical-align:bottom;text-align:${textAlign};">
      ${imgPart}
      <div style="${lineStyle}font-size:11px;color:#374151;line-height:1.5;">
        <strong>${sigCfg.authorized_person || 'Authorized Signatory'}</strong>
        ${sigCfg.designation ? `<br/><span style="color:#6b7280;">${sigCfg.designation}</span>` : ''}
        ${sigCfg.department  ? `<br/><span style="color:#6b7280;">${sigCfg.department}</span>` : ''}
      </div>
    </td>
    ${pos === 'left' ? '<td style="width:60%;"></td>' : ''}
  </tr></table>`
}

// ─── Paginated Doc Preview ────────────────────────────────────────────────────
// MS Word-style: header area → [top margin] → text area → [bottom margin] → footer area
// Each page is exactly ph px tall. Content is windowed per page via overflow:hidden + negative margin.
function PaginatedDocPreview({ header, footer, paper, watermark, docTitle, bodyHtml, sigCfg }) {
  const measureRef = useRef(null)
  const [measuredH, setMeasuredH] = useState(0)

  // Paper pixel dimensions at 96 dpi
  const base = PAPER_PX[paper.size] || PAPER_PX.A4
  const [pw, ph] = paper.orientation === 'landscape' ? [base[1], base[0]] : base

  // Header visible when show=true OR when branding (logo/company) is set (Issue 6: Header OFF mode)
  const headerVisible = header.show || !!(header.logo_url || header.company_name)
  // Header / footer reserved space (px)
  const headerH = headerVisible ? Math.max(header.header_height || 100, 40) : 0
  const footerH = footer.show ? Math.max(footer.footer_height || 40,  20) : 0

  // Document margins (convert points to px: 1pt = 96/72 px)
  const mt = Math.round((paper.margin_top    || 72) / 72 * 96)
  const mb = Math.round((paper.margin_bottom || 72) / 72 * 96)
  const ml = Math.round((paper.margin_left   || 72) / 72 * 96)
  const mr = Math.round((paper.margin_right  || 72) / 72 * 96)

  // Content width for the measurement div (same as actual text column width)
  const contentW = Math.max(pw - ml - mr, 200)

  // Spacing from header bottom to content (Issue 9); falls back to paper top margin when no header
  const headerSpacing = headerVisible ? (header.header_spacing ?? 20) : mt

  // Usable text height per page = page - header - footer - header spacing - bottom margin
  const usableH = Math.max(ph - headerH - footerH - headerSpacing - mb, 100)

  // Build full body HTML (title + body + signature)
  const titleHtml    = buildTitleHtml(docTitle)
  const sigHtml      = buildSigHtml(sigCfg)
  const fullBodyHtml = titleHtml + (bodyHtml || '') + sigHtml

  // Measure actual rendered height using ResizeObserver for accuracy
  useEffect(() => {
    const el = measureRef.current
    if (!el) return
    const measure = () => {
      const h = el.scrollHeight
      if (h > 0) setMeasuredH(h)
    }
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    // Initial measurement after paint
    requestAnimationFrame(measure)
    return () => ro.disconnect()
  }, [fullBodyHtml, contentW])

  // Number of pages needed (at least 1)
  const pageCount = Math.max(1, Math.ceil(measuredH / usableH))

  // ── Reusable header renderer ──────────────────────────────────────────────
  const renderDocHeader = () => {
    const layout    = header.header_layout || 'company_left_logo_right'
    const padL      = Math.max(32, header.padding_left  ?? 32)
    const padR      = Math.max(32, header.padding_right ?? 32)
    const padT      = header.padding_top    ?? 20
    const padB      = header.padding_bottom ?? 8
    const fs        = header.font_size || 11
    const textColor = header.font_color || '#000'
    const showBand  = header.show
    const isCentered = layout === 'logo_top_company_bottom' || layout === 'company_top_logo_bottom'
    const companyAlign = isCentered ? 'center' : (header.company_alignment || 'left')

    const containerStyle = {
      position: 'absolute', top: 0, left: 0, right: 0,
      height: headerH, zIndex: 2, overflow: 'hidden',
      paddingTop: padT, paddingRight: padR, paddingBottom: padB, paddingLeft: padL,
      borderBottom: showBand && header.border_bottom
        ? `${header.border_width ?? 1}px solid ${header.border_color || '#d1d5db'}`
        : 'none',
      backgroundColor: showBand ? (header.background_color || '#fff') : 'transparent',
      fontFamily: header.font_family || 'Arial',
      fontSize: fs,
      color: textColor,
      boxSizing: 'border-box',
    }

    const logoEl = header.logo_url ? (
      <img src={header.logo_url} alt="Logo" style={{
        height: header.logo_height || 40,
        width: header.logo_width ? header.logo_width : 'auto',
        objectFit: 'contain',
        display: 'block',
        flexShrink: 0,
      }} />
    ) : null

    const hasCompany = !!(header.company_name || header.company_address || header.company_email || header.company_phone || header.company_website)
    const companyBlockEl = hasCompany ? (
      <div style={{ lineHeight: 1.4 }}>
        {header.company_name && (
          <div style={{
            fontWeight: 'bold',
            fontFamily: header.company_name_font || header.font_family || 'Arial',
            fontSize: header.company_name_size || (fs + 2),
            color: header.company_name_color || textColor,
            textAlign: companyAlign,
          }}>{header.company_name}</div>
        )}
        {header.company_address && (
          <div style={{ fontSize: fs - 1, textAlign: companyAlign, color: textColor }}>{header.company_address}</div>
        )}
        {(header.company_email || header.company_phone) && (
          <div style={{ fontSize: fs - 1, color: '#6b7280', textAlign: companyAlign }}>
            {[header.company_email, header.company_phone].filter(Boolean).join('  |  ')}
          </div>
        )}
        {header.company_website && (
          <div style={{ fontSize: fs - 1, color: '#6b7280', textAlign: companyAlign }}>{header.company_website}</div>
        )}
      </div>
    ) : null

    if (layout === 'logo_only') {
      return <div style={{ ...containerStyle, display: 'flex', alignItems: 'center' }}>{logoEl}</div>
    }
    if (layout === 'company_only') {
      return <div style={{ ...containerStyle, display: 'flex', alignItems: 'center' }}>{companyBlockEl}</div>
    }
    if (layout === 'logo_top_company_bottom') {
      return (
        <div style={{ ...containerStyle, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          {logoEl}
          {companyBlockEl}
        </div>
      )
    }
    if (layout === 'company_top_logo_bottom') {
      return (
        <div style={{ ...containerStyle, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          {companyBlockEl}
          {logoEl}
        </div>
      )
    }
    if (layout === 'logo_left_company_right') {
      return (
        <div style={{ ...containerStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          {logoEl}
          {companyBlockEl}
        </div>
      )
    }
    // default: company_left_logo_right
    return (
      <div style={{ ...containerStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        {companyBlockEl}
        {logoEl}
      </div>
    )
  }

  // ── Reusable footer renderer ──────────────────────────────────────────────
  const renderDocFooter = (pageNum) => (
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0,
      height: footerH, zIndex: 2,
      padding: `${footer.padding_top ?? 8}px ${footer.padding_right ?? 20}px ${footer.padding_bottom ?? 8}px ${footer.padding_left ?? 20}px`,
      borderTop: footer.border_top
        ? `${footer.border_width ?? 1}px solid ${footer.border_color || '#d1d5db'}`
        : 'none',
      fontSize: footer.font_size || 10, color: footer.font_color || '#666',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      boxSizing: 'border-box',
    }}>
      <span>
        {footer.show_date
          ? new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
          : ''}
      </span>
      <span>{footer.text || ''}{footer.confidential_label ? ' | CONFIDENTIAL' : ''}</span>
      <span>
        {footer.show_page_numbers
          ? `Page ${pageNum}${pageCount > 1 ? ` of ${pageCount}` : ''}`
          : ''}
      </span>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 32, paddingBottom: 32 }}>

      {/*
        Hidden measurement div — rendered off-screen at exact content width.
        ResizeObserver fires setMeasuredH whenever content height changes
        (e.g., after images load or HTML updates).
      */}
      <div
        ref={measureRef}
        aria-hidden="true"
        style={{
          position: 'absolute', top: -9999, left: -9999,
          width: contentW,
          fontSize: '12pt', lineHeight: 1.7,
          fontFamily: 'Arial, sans-serif', color: '#1f2937',
          pointerEvents: 'none',
        }}
        dangerouslySetInnerHTML={{ __html: fullBodyHtml }}
      />

      {/* ── One div per page ── */}
      {Array.from({ length: pageCount }, (_, i) => {
        // Content offset: page i shows HTML from pixel [i*usableH] to [(i+1)*usableH]
        // marginTop shifts the full content div UP so the right window is visible.
        const contentOffset = i * usableH

        return (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            {/* Page number label above each page */}
            <div style={{
              fontSize: 10, fontWeight: 600, color: '#9ca3af',
              marginBottom: 6, letterSpacing: '0.08em', textTransform: 'uppercase',
            }}>
              Page {i + 1}{pageCount > 1 ? ` / ${pageCount}` : ''}
            </div>

            {/* A4 page card */}
            <div style={{
              width: pw, height: ph,
              background: 'white',
              boxShadow: '0 1px 4px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.10), 0 12px 40px rgba(0,0,0,0.08)',
              borderRadius: 2,
              overflow: 'hidden',
              position: 'relative',
              flexShrink: 0,
            }}>
              {/* Watermark — z-index 1, below content */}
              {watermark.enabled && (
                <div style={{
                  position: 'absolute', inset: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transform: `rotate(${watermark.rotation ?? -45}deg)`,
                  fontSize: watermark.size || 72,
                  opacity: Math.min(watermark.opacity || 0.12, 1),
                  color: watermark.color || '#9ca3af',
                  fontWeight: 'bold', userSelect: 'none', pointerEvents: 'none', zIndex: 1,
                }}>
                  {watermark.text || 'CONFIDENTIAL'}
                </div>
              )}

              {/* Header — fixed at top of each page (also renders when header OFF but branding set) */}
              {headerVisible && renderDocHeader()}

              {/*
                Text content area:
                  top    = headerH + mt   (header height + top margin)
                  height = usableH        (pure text area, no margins)
                  overflow = hidden       (clips to this page's window)

                Inside: full HTML shifted up by contentOffset so page i
                shows the correct slice. No top margin added inside since
                mt is already encoded in the container's top position.
              */}
              <div style={{
                position: 'absolute',
                top: headerH + headerSpacing,
                left: ml, right: mr,
                height: usableH,
                overflow: 'hidden',
                zIndex: 2,
              }}>
                {fullBodyHtml.trim() ? (
                  <div
                    style={{
                      marginTop: -contentOffset,
                      fontSize: '12pt', lineHeight: 1.7,
                      color: '#1f2937', fontFamily: 'Arial, sans-serif',
                    }}
                    dangerouslySetInnerHTML={{ __html: fullBodyHtml }}
                  />
                ) : (
                  i === 0 && (
                    <div style={{
                      color: '#9ca3af', fontStyle: 'italic', fontSize: '11pt',
                      textAlign: 'center', paddingTop: 40,
                    }}>
                      Fill in the form on the left — your document preview will appear here.
                    </div>
                  )
                )}
              </div>

              {/* Footer — fixed at bottom of each page */}
              {footer.show && renderDocFooter(i + 1)}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Full Preview Modal ───────────────────────────────────────────────────────
function PreviewModal({ onClose, header, footer, paper, watermark, docTitle, bodyHtml, sigCfg }) {
  const [zoom, setZoom] = useState(60)
  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'rgba(0,0,0,0.88)' }}>
      <div className="flex items-center gap-3 px-4 py-2.5 flex-shrink-0"
        style={{ background: '#1e1e2e', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <span className="text-white text-sm font-semibold flex-1">Document Preview</span>
        <button onClick={() => setZoom(z => Math.max(30, z - 10))} className="p-1.5 rounded text-white hover:bg-white/10"><ZoomOut className="w-4 h-4" /></button>
        <span className="text-white text-xs w-10 text-center">{zoom}%</span>
        <button onClick={() => setZoom(z => Math.min(150, z + 10))} className="p-1.5 rounded text-white hover:bg-white/10"><ZoomIn className="w-4 h-4" /></button>
        <button onClick={onClose} className="p-1.5 rounded text-white hover:bg-white/10"><X className="w-4 h-4" /></button>
      </div>
      <div className="flex-1 overflow-auto py-8 px-4 flex justify-center" style={{ background: '#2d2d3d' }}>
        <div style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top center', transition: 'transform 0.2s' }}>
          <PaginatedDocPreview
            header={header} footer={footer} paper={paper} watermark={watermark}
            docTitle={docTitle} bodyHtml={bodyHtml} sigCfg={sigCfg}
          />
        </div>
      </div>
    </div>
  )
}

// ─── Main QuickBuilder ────────────────────────────────────────────────────────
export default function QuickBuilder() {
  const { id }   = useParams()
  const navigate = useNavigate()
  const editorRef      = useRef(null)
  const autoSaveTimer  = useRef(null)
  const exportRef      = useRef(null)
  const latestRef      = useRef({})

  // Panel state
  const [leftWidth,     setLeftWidth]     = useState(() => parseInt(localStorage.getItem('qb_left_w')   || '400'))
  const [leftCollapsed, setLeftCollapsed] = useState(() => localStorage.getItem('qb_left_col') === 'true')

  const toggleLeftPanel = () => setLeftCollapsed(v => {
    const n = !v; localStorage.setItem('qb_left_col', n); return n
  })
  const handleResizeMouseDown = (e) => {
    e.preventDefault()
    const startX = e.clientX, startW = leftWidth
    const onMove = (ev) => {
      const n = Math.max(300, Math.min(560, startW + (ev.clientX - startX)))
      setLeftWidth(n); localStorage.setItem('qb_left_w', n)
    }
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
    document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp)
  }

  const [loading,          setLoading]          = useState(!!id)
  const [saving,           setSaving]           = useState(false)
  const [showFullPreview,  setShowFullPreview]  = useState(false)
  const [showExport,       setShowExport]       = useState(false)
  const [openSection,      setOpenSection]      = useState('template-info')
  const [autoSaveStatus,   setAutoSaveStatus]   = useState('saved')
  const [categories,       setCategories]       = useState([])
  const [bodyHtml,         setBodyHtml]         = useState('')

  // Template metadata
  const [name,         setName]         = useState('Untitled Template')
  const [description,  setDescription]  = useState('')
  const [categoryId,   setCategoryId]   = useState('')
  const [tags,         setTags]         = useState('')
  const [templateType, setTemplateType] = useState('')

  // Document title
  const [docTitle, setDocTitle] = useState({
    text: '', font_family: 'Arial', font_size: 16,
    color: '#111827', alignment: 'center',
    bold: true, italic: false, underline: false,
    margin_top: 12, margin_bottom: 14,
  })

  // Header (32px min horizontal padding; header_layout and header_spacing per spec)
  const [header, setHeader] = useState({
    show: true,
    header_layout: 'company_left_logo_right',
    header_spacing: 20,
    logo_url: '', logo_height: 40, logo_width: 0, logo_alignment: 'left',
    company_alignment: 'left',
    company_name_font: '', company_name_size: 0, company_name_color: '', company_name_alignment: '',
    header_height: 120,
    padding_top: 20, padding_right: 32, padding_bottom: 20, padding_left: 32,
    company_name: '', company_address: '', company_email: '',
    company_phone: '', company_website: '', gst_number: '', reg_number: '',
    font_family: 'Arial', font_size: 11, font_color: '#000000', background_color: '#ffffff',
    border_bottom: true, border_color: '#d1d5db', border_width: 1,
  })

  // Signature
  const [sigCfg, setSigCfg] = useState({
    enabled: false, type: 'text',
    authorized_person: '', designation: '', department: '',
    position: 'left', image_url: '', draw_data: '',
    width: 0, height: 44, show_line: true,
  })

  // Footer
  const [footer, setFooter] = useState({
    show: true, text: '', show_page_numbers: true,
    show_date: true, confidential_label: false, footer_height: 50,
    padding_top: 8, padding_right: 20, padding_bottom: 12, padding_left: 20,
    alignment: 'center', font_size: 10, font_color: '#666666',
    border_top: true, border_color: '#d1d5db', border_width: 1,
  })

  // Paper
  const [paper, setPaper] = useState({
    size: 'A4', orientation: 'portrait',
    margin_top: 72, margin_bottom: 72, margin_left: 72, margin_right: 72,
  })

  // Watermark
  const [watermark, setWatermark] = useState({
    enabled: false, type: 'text', text: 'CONFIDENTIAL',
    opacity: 0.12, rotation: -45, size: 72, color: '#9ca3af',
  })

  const toggleSection = (key) => setOpenSection(k => k === key ? null : key)

  // Sync to ref for auto-save
  useEffect(() => {
    latestRef.current = { id, name, description, categoryId, tags, header, footer, paper, watermark, docTitle, sigCfg }
  })

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
        setName(t.name || 'Untitled Template')
        setDescription(t.description || '')
        setCategoryId(t.category_id || '')
        setTags((t.tags || []).join(', '))
        const c = t.content || {}
        if (c.header)           setHeader(h => ({ ...h, ...c.header }))
        if (c.footer)           setFooter(f => ({ ...f, ...c.footer }))
        if (c.paper)            setPaper(p => ({ ...p, ...c.paper }))
        if (c.watermark)        setWatermark(w => ({ ...w, ...c.watermark }))
        if (c.doc_title)        setDocTitle(d => ({ ...d, ...c.doc_title }))
        if (c.signature_config) setSigCfg(s => ({ ...s, ...c.signature_config }))
        const html = c.body_html || ''
        setBodyHtml(html)
        if (editorRef.current) editorRef.current.innerHTML = html
        setAutoSaveStatus('saved')
      })
      .catch(() => toast.error('Failed to load template'))
      .finally(() => setLoading(false))
  }, [id])

  // Build payload
  const buildPayload = useCallback((summary) => {
    const s = latestRef.current
    const html = editorRef.current?.innerHTML ?? bodyHtml ?? ''
    return {
      name:           s.name,
      description:    s.description,
      category_id:    s.categoryId || null,
      template_type:  'simple',
      tags:           s.tags.split(',').map(t => t.trim()).filter(Boolean),
      change_summary: summary || (s.id ? 'Updated via Quick Builder' : 'Created via Quick Builder'),
      content: {
        header:           s.header,
        footer:           s.footer,
        paper:            s.paper,
        watermark:        s.watermark,
        doc_title:        s.docTitle,
        signature_config: s.sigCfg,
        body_html:        html,
        canvas_elements:  [],
      },
      dynamic_fields: [...new Set([...html.matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]))],
    }
  }, [bodyHtml])

  // Auto-save
  const scheduleAutoSave = useCallback(() => {
    const currentId = latestRef.current?.id
    if (!currentId) return
    setAutoSaveStatus('unsaved')
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(async () => {
      setAutoSaveStatus('saving')
      try {
        await documentCenterService.updateTemplate(currentId, buildPayload('Auto-saved'))
        setAutoSaveStatus('saved')
      } catch {
        setAutoSaveStatus('error')
      }
    }, 3000)
  }, [buildPayload])

  useEffect(() => { scheduleAutoSave() }, [header, footer, paper, watermark, name, description, categoryId, tags, docTitle, sigCfg])

  const handleEditorInput = useCallback(() => {
    const html = editorRef.current?.innerHTML || ''
    setBodyHtml(html)
    scheduleAutoSave()
  }, [scheduleAutoSave])

  // Close export on outside click
  useEffect(() => {
    const fn = (e) => { if (exportRef.current && !exportRef.current.contains(e.target)) setShowExport(false) }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [])

  // Save
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
        if (newId) navigate(`/hrm/doc-center/quick/${newId}`, { replace: true })
      }
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  // Apply document preset (Issue 12)
  const applyPreset = (preset) => {
    setHeader(h => ({ ...h, header_layout: preset.headerLayout, header_spacing: preset.headerSpacing }))
    setDocTitle(d => ({ ...d, alignment: preset.titleAlign, margin_top: preset.titleMt, margin_bottom: preset.titleMb }))
    setPaper(p => ({ ...p, margin_top: preset.marginTop, margin_bottom: preset.marginBottom }))
    scheduleAutoSave()
    toast.success(`Applied "${preset.name}" preset`)
  }

  // Logo upload
  const handleLogoUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { toast.error('Please select an image file'); return }
    if (file.size > 2 * 1024 * 1024) { toast.error('Logo must be under 2 MB'); return }
    const reader = new FileReader()
    reader.onload = ev => setHeader(h => ({ ...h, logo_url: ev.target.result }))
    reader.readAsDataURL(file)
  }

  // Signature image upload
  const handleSigImageUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setSigCfg(s => ({ ...s, image_url: ev.target.result }))
    reader.readAsDataURL(file)
  }

  // Build full HTML for export/print
  const buildFullHtml = useCallback(() => {
    const s   = latestRef.current
    const html = editorRef.current?.innerHTML || bodyHtml || ''
    const ml  = `${(s.paper.margin_left  || 72) / 72 * 25.4}mm`
    const mr  = `${(s.paper.margin_right || 72) / 72 * 25.4}mm`
    const mt  = `${(s.paper.margin_top   || 72) / 72 * 25.4}mm`
    const mb  = `${(s.paper.margin_bottom|| 72) / 72 * 25.4}mm`
    const h   = s.header, f = s.footer, dt = s.docTitle, sig = s.sigCfg

    const titleBlock = buildTitleHtml(dt)
    const sigBlock   = buildSigHtml(sig)

    // ── Build header HTML string respecting header_layout ──────────────────
    const buildHeaderHtmlBlock = (h) => {
      if (!h.show && !h.logo_url && !h.company_name) return ''
      const layout   = h.header_layout || 'company_left_logo_right'
      const padL     = Math.max(32, h.padding_left  ?? 32)
      const padR     = Math.max(32, h.padding_right ?? 32)
      const padT     = h.padding_top    ?? 20
      const padB     = h.padding_bottom ?? 8
      const fs       = h.font_size || 11
      const tc       = h.font_color || '#000'
      const showBand = h.show
      const isCen    = layout === 'logo_top_company_bottom' || layout === 'company_top_logo_bottom'
      const ca       = isCen ? 'center' : (h.company_alignment || 'left')
      const border   = showBand && h.border_bottom ? `border-bottom:${h.border_width ?? 1}px solid ${h.border_color || '#d1d5db'};` : ''
      const bg       = showBand ? `background:${h.background_color || '#fff'};` : ''
      const base     = `padding:${padT}px ${padR}px ${padB}px ${padL}px;min-height:${h.header_height || 120}px;${bg}color:${tc};font-family:${h.font_family || 'Arial'},sans-serif;font-size:${fs}px;${border}box-sizing:border-box;`

      const logoHtml = h.logo_url
        ? `<img src="${h.logo_url}" style="height:${h.logo_height || 40}px;${h.logo_width ? `width:${h.logo_width}px;` : ''}object-fit:contain;display:block;flex-shrink:0;" />`
        : ''
      const compHtml = `<div style="line-height:1.4;">
        ${h.company_name ? `<div style="font-weight:bold;font-family:${h.company_name_font || h.font_family || 'Arial'},sans-serif;font-size:${h.company_name_size || (fs + 2)}px;color:${h.company_name_color || tc};text-align:${ca};">${h.company_name}</div>` : ''}
        ${h.company_address ? `<div style="font-size:${fs - 1}px;text-align:${ca};color:${tc};">${h.company_address}</div>` : ''}
        ${(h.company_email || h.company_phone) ? `<div style="font-size:${fs - 1}px;color:#6b7280;text-align:${ca};">${[h.company_email, h.company_phone].filter(Boolean).join(' | ')}</div>` : ''}
        ${h.company_website ? `<div style="font-size:${fs - 1}px;color:#6b7280;text-align:${ca};">${h.company_website}</div>` : ''}
      </div>`

      if (layout === 'logo_only')
        return `<div style="${base}display:flex;align-items:center;">${logoHtml}</div>`
      if (layout === 'company_only')
        return `<div style="${base}display:flex;align-items:center;">${compHtml}</div>`
      if (layout === 'logo_top_company_bottom')
        return `<div style="${base}display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;">${logoHtml}${compHtml}</div>`
      if (layout === 'company_top_logo_bottom')
        return `<div style="${base}display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;">${compHtml}${logoHtml}</div>`
      if (layout === 'logo_left_company_right')
        return `<div style="${base}display:flex;align-items:center;justify-content:space-between;gap:16px;">${logoHtml}${compHtml}</div>`
      // default: company_left_logo_right
      return `<div style="${base}display:flex;align-items:center;justify-content:space-between;gap:16px;">${compHtml}${logoHtml}</div>`
    }

    const headerSpacingPx = (h.show || h.logo_url || h.company_name) ? (h.header_spacing ?? 20) : 0
    const contentTopPad   = headerSpacingPx ? `${headerSpacingPx}px` : mt

    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${s.name}</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;font-family:Arial,sans-serif;font-size:12pt;line-height:1.7;color:#1f2937}
  @page{size:${s.paper.size} ${s.paper.orientation};margin:${mt} ${mr} ${mb} ${ml}}
  table{border-collapse:collapse;width:100%;page-break-inside:avoid;break-inside:avoid;}
  td,th{border:1px solid #e5e7eb;padding:6px 10px}
  th{background:#7c3aed;color:white}
  blockquote{border-left:4px solid #7c3aed;padding-left:12px;color:#6b7280;margin:8px 0}
  p{page-break-inside:avoid;break-inside:avoid;}
  ul,ol{page-break-inside:avoid;break-inside:avoid;}
  li{break-inside:avoid;}
  .sig-block{page-break-inside:avoid;break-inside:avoid;}
</style></head><body>
${buildHeaderHtmlBlock(h)}
<div style="padding:${contentTopPad} ${mr} ${mb} ${ml};">${titleBlock}${html}${sigBlock}</div>
${f.show ? `<div style="padding:${f.padding_top}px ${f.padding_right}px ${f.padding_bottom}px ${f.padding_left}px;border-top:${f.border_top ? `${f.border_width}px solid ${f.border_color}` : 'none'};font-size:${f.font_size}px;color:${f.font_color};display:flex;justify-content:space-between;align-items:center;min-height:${f.footer_height}px;">
  <span>${f.show_date ? new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : ''}</span>
  <span>${f.text || ''}${f.confidential_label ? ' | CONFIDENTIAL' : ''}</span>
  <span>${f.show_page_numbers ? 'Page 1' : ''}</span>
</div>` : ''}
</body></html>`
  }, [bodyHtml])

  // Export handlers
  const handleExportPDF = () => {
    setShowExport(false)
    const w = window.open('', '_blank')
    w.document.write(buildFullHtml()); w.document.close(); w.focus()
    toast.success('Print dialog opening — select "Save as PDF"')
    setTimeout(() => { w.print(); w.close() }, 500)
  }
  const handlePrint = () => {
    setShowExport(false)
    const w = window.open('', '_blank')
    w.document.write(buildFullHtml()); w.document.close(); w.focus()
    setTimeout(() => { w.print(); w.close() }, 400)
  }
  const handleExportHTML = () => {
    setShowExport(false)
    const blob = new Blob([buildFullHtml()], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `${name || 'document'}.html`; a.click()
    URL.revokeObjectURL(url)
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

  const AutoSaveIcon = autoSaveStatus === 'saved' ? CheckCircle : autoSaveStatus === 'saving' ? Loader2 : autoSaveStatus === 'error' ? AlertCircle : Clock
  const autoSaveColor = { saved: 'text-green-500', saving: 'text-gray-400', unsaved: 'text-amber-400', error: 'text-red-400' }[autoSaveStatus]
  const autoSaveLabel = { saved: 'Saved', saving: 'Saving…', unsaved: 'Unsaved', error: 'Error' }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 animate-spin text-violet-600" />
    </div>
  )

  return (
    <div className="flex flex-col" style={{ height: '100%', minHeight: 0, overflow: 'hidden', background: 'var(--bg-primary)' }}>

      {/* ── Top Bar ── */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b flex-shrink-0"
        style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
        <button onClick={() => navigate('/hrm/doc-center/templates')}
          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex-shrink-0">
          <ArrowLeft className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
        </button>

        <input value={name} onChange={e => { setName(e.target.value); scheduleAutoSave() }}
          className="bg-transparent border-none outline-none text-sm font-semibold flex-1 min-w-0"
          style={{ color: 'var(--text-heading)' }} placeholder="Template Name" />

        {id && (
          <div className={`flex items-center gap-1 text-xs flex-shrink-0 ${autoSaveColor}`}>
            <AutoSaveIcon className={`w-3 h-3 ${autoSaveStatus === 'saving' ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{autoSaveLabel[autoSaveStatus]}</span>
          </div>
        )}

        <button onClick={() => setShowFullPreview(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors flex-shrink-0"
          style={{ borderColor: 'var(--border)', color: 'var(--text-body)' }}>
          <Maximize2 className="w-4 h-4" /><span className="hidden md:inline">Preview</span>
        </button>

        <div className="relative flex-shrink-0" ref={exportRef}>
          <button onClick={() => setShowExport(v => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors"
            style={{ borderColor: 'var(--border)', color: 'var(--text-body)' }}>
            <Download className="w-4 h-4" /><span className="hidden md:inline">Export</span><ChevronDown className="w-3 h-3" />
          </button>
          {showExport && (
            <div className="absolute right-0 top-full mt-1 z-50 rounded-xl border shadow-xl overflow-hidden"
              style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', minWidth: 160 }}>
              {[
                { label: 'Export PDF',  fn: handleExportPDF  },
                { label: 'Export DOCX', fn: handleExportDOCX },
                { label: 'Export HTML', fn: handleExportHTML },
                { label: 'Print',       fn: handlePrint       },
              ].map(item => (
                <button key={item.label} onClick={item.fn}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors text-left"
                  style={{ color: 'var(--text-body)' }}>
                  <FileText className="w-3.5 h-3.5 text-violet-500" />{item.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {id && (
          <button onClick={() => navigate(`/hrm/doc-center/generated?tmpl=${id}`)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors flex-shrink-0"
            style={{ borderColor: 'var(--border)', color: 'var(--text-body)' }}>
            <Wand2 className="w-4 h-4" /><span className="hidden md:inline">Generate</span>
          </button>
        )}

        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-semibold text-white flex-shrink-0 disabled:opacity-60"
          style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      {/* ── Main Layout ── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* ── Left Panel ── */}
        <div className="flex-shrink-0 overflow-hidden transition-all duration-200"
          style={{ width: leftCollapsed ? 0 : leftWidth }}>
          <div className="flex flex-col border-r"
            style={{
              width: leftWidth, height: '100%', minHeight: 0,
              background: 'var(--bg-secondary)', borderColor: 'var(--border)', overflowY: 'auto',
            }}>

            {/* Panel header with collapse button */}
            <div className="flex items-center gap-3 px-5 py-3 border-b flex-shrink-0"
              style={{ borderColor: 'var(--border)' }}>
              <div className="w-7 h-7 rounded-lg bg-violet-600 flex items-center justify-center flex-shrink-0">
                <LayoutTemplate className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold" style={{ color: 'var(--text-heading)' }}>Quick Builder</p>
                <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>Fill the form — preview updates live</p>
              </div>
              {/* Collapse button at top-right of panel */}
              <button type="button" onClick={toggleLeftPanel}
                title="Collapse Builder"
                className="flex-shrink-0 p-1.5 rounded-lg border transition-colors hover:bg-violet-600 hover:text-white hover:border-violet-600"
                style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
                <PanelLeftClose className="w-4 h-4" />
              </button>
            </div>

            {/* ── Section 1: Template Info ── */}
            <Section id="template-info" title="Template Info" icon={FileText}
              open={openSection === 'template-info'} onToggle={toggleSection}>
              <div><Lbl>Template Name *</Lbl>
                <Inp value={name} onChange={e => { setName(e.target.value); scheduleAutoSave() }} placeholder="e.g. Offer Letter 2025" />
              </div>
              <div><Lbl>Description</Lbl>
                <textarea value={description} onChange={e => { setDescription(e.target.value); scheduleAutoSave() }}
                  rows={2} placeholder="Brief description…"
                  className="w-full px-2.5 py-1.5 text-sm rounded-lg border resize-none focus:outline-none focus:ring-1 focus:ring-violet-500"
                  style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)', color: 'var(--text-body)' }} />
              </div>
              <div><Lbl>Category</Lbl>
                <Sel value={categoryId} onChange={e => { setCategoryId(e.target.value); scheduleAutoSave() }}>
                  <option value="">— No Category —</option>
                  {categories.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
                </Sel>
              </div>
              <div><Lbl>Template Type</Lbl>
                <Sel value={templateType} onChange={e => setTemplateType(e.target.value)}>
                  <option value="">— Select Type —</option>
                  {TEMPLATE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </Sel>
              </div>
              <div><Lbl>Tags (comma separated)</Lbl>
                <Inp value={tags} onChange={e => { setTags(e.target.value); scheduleAutoSave() }} placeholder="HR, Offer, Legal…" />
              </div>
            </Section>

            {/* ── Section 2: Header ── */}
            <Section id="header" title="Header" icon={Building2}
              open={openSection === 'header'} onToggle={toggleSection}
              badge={header.show ? 'ON' : 'OFF'}>
              <Tog label="Show Header" checked={header.show} onChange={v => setHeader(h => ({ ...h, show: v }))} />
              {header.show && <>
                {/* Layout */}
                <div><Lbl>Header Layout</Lbl>
                  <Sel value={header.header_layout || 'company_left_logo_right'} onChange={e => setHeader(h => ({ ...h, header_layout: e.target.value }))}>
                    {HEADER_LAYOUTS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                  </Sel>
                </div>

                {/* Header → Content spacing (Issue 9) */}
                <div><Lbl>Header → Content Spacing (px)</Lbl>
                  <Sel value={header.header_spacing ?? 20} onChange={e => setHeader(h => ({ ...h, header_spacing: +e.target.value }))}>
                    {[0, 10, 20, 30, 40, 50].map(v => <option key={v} value={v}>{v}px</option>)}
                  </Sel>
                </div>

                {/* Logo */}
                <div><Lbl>Company Logo</Lbl>
                  {header.logo_url ? (
                    <div className="flex items-center gap-3">
                      <img src={header.logo_url} alt="Logo"
                        style={{ height: 36, maxWidth: 120, objectFit: 'contain', borderRadius: 4, border: '1px solid var(--border)' }} />
                      <button onClick={() => setHeader(h => ({ ...h, logo_url: '' }))}
                        className="text-xs text-red-500 hover:text-red-700">Remove</button>
                    </div>
                  ) : (
                    <label className="flex items-center gap-2 px-3 py-2.5 rounded-lg border cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                      style={{ borderColor: 'var(--border)', color: 'var(--text-muted)', borderStyle: 'dashed' }}>
                      <Upload className="w-4 h-4" />
                      <span className="text-sm">Click to upload logo (max 2 MB)</span>
                      <input type="file" accept="image/*" className="sr-only" onChange={handleLogoUpload} />
                    </label>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div><Lbl>Width (px, 0=auto)</Lbl>
                    <Inp type="number" value={header.logo_width || 0} min={0} max={300}
                      onChange={e => setHeader(h => ({ ...h, logo_width: +e.target.value }))} />
                  </div>
                  <div><Lbl>Height (px)</Lbl>
                    <Inp type="number" value={header.logo_height || 40} min={20} max={120}
                      onChange={e => setHeader(h => ({ ...h, logo_height: +e.target.value }))} />
                  </div>
                  <div><Lbl>Logo Align</Lbl>
                    <Sel value={header.logo_alignment || 'left'} onChange={e => setHeader(h => ({ ...h, logo_alignment: e.target.value }))}>
                      <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
                    </Sel>
                  </div>
                </div>

                {/* Company Name */}
                <div><Lbl>Company Name</Lbl>
                  <Inp value={header.company_name} onChange={e => setHeader(h => ({ ...h, company_name: e.target.value }))} placeholder="Acme Corp Pvt Ltd" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><Lbl>Name Font</Lbl>
                    <Sel value={header.company_name_font || ''} onChange={e => setHeader(h => ({ ...h, company_name_font: e.target.value }))}>
                      <option value="">Same as header</option>
                      {FONT_FAMILIES.map(f => <option key={f} value={f}>{f}</option>)}
                    </Sel>
                  </div>
                  <div><Lbl>Name Size (px)</Lbl>
                    <Inp type="number" value={header.company_name_size || ''} min={8} max={32} placeholder="Auto"
                      onChange={e => setHeader(h => ({ ...h, company_name_size: +e.target.value || 0 }))} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><Lbl>Name Color</Lbl>
                    <input type="color" value={header.company_name_color || header.font_color || '#000000'}
                      onChange={e => setHeader(h => ({ ...h, company_name_color: e.target.value }))}
                      className="w-full h-9 rounded-lg border cursor-pointer" style={{ borderColor: 'var(--border)' }} />
                  </div>
                  <div><Lbl>Name Alignment</Lbl>
                    <Sel value={header.company_name_alignment || ''} onChange={e => setHeader(h => ({ ...h, company_name_alignment: e.target.value }))}>
                      <option value="">Same as header</option>
                      <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
                    </Sel>
                  </div>
                </div>

                {/* Address / Contact */}
                <div><Lbl>Address</Lbl>
                  <Inp value={header.company_address} onChange={e => setHeader(h => ({ ...h, company_address: e.target.value }))} placeholder="123 Main St, City, State" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><Lbl>Email</Lbl>
                    <Inp value={header.company_email} onChange={e => setHeader(h => ({ ...h, company_email: e.target.value }))} placeholder="hr@company.com" />
                  </div>
                  <div><Lbl>Phone</Lbl>
                    <Inp value={header.company_phone} onChange={e => setHeader(h => ({ ...h, company_phone: e.target.value }))} placeholder="+91 98765 43210" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><Lbl>Website</Lbl>
                    <Inp value={header.company_website || ''} onChange={e => setHeader(h => ({ ...h, company_website: e.target.value }))} placeholder="www.company.com" />
                  </div>
                  <div><Lbl>Text Alignment</Lbl>
                    <Sel value={header.company_alignment || 'left'} onChange={e => setHeader(h => ({ ...h, company_alignment: e.target.value }))}>
                      <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
                    </Sel>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><Lbl>GST Number</Lbl>
                    <Inp value={header.gst_number || ''} onChange={e => setHeader(h => ({ ...h, gst_number: e.target.value }))} placeholder="27AAPFU0939F1ZV" />
                  </div>
                  <div><Lbl>Reg. Number</Lbl>
                    <Inp value={header.reg_number || ''} onChange={e => setHeader(h => ({ ...h, reg_number: e.target.value }))} placeholder="CIN…" />
                  </div>
                </div>

                {/* Styling */}
                <div className="grid grid-cols-2 gap-2">
                  <div><Lbl>Header Height (px)</Lbl>
                    <Sel value={header.header_height || 120} onChange={e => setHeader(h => ({ ...h, header_height: +e.target.value }))}>
                      {[60,80,100,120,140,160,200].map(v => <option key={v} value={v}>{v}px</option>)}
                    </Sel>
                  </div>
                  <div><Lbl>Font Size (px)</Lbl>
                    <Inp type="number" value={header.font_size || 11} min={8} max={18}
                      onChange={e => setHeader(h => ({ ...h, font_size: +e.target.value }))} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><Lbl>Header Font</Lbl>
                    <Sel value={header.font_family || 'Arial'} onChange={e => setHeader(h => ({ ...h, font_family: e.target.value }))}>
                      {FONT_FAMILIES.map(f => <option key={f} value={f}>{f}</option>)}
                    </Sel>
                  </div>
                  <div><Lbl>Background</Lbl>
                    <input type="color" value={header.background_color || '#ffffff'}
                      onChange={e => setHeader(h => ({ ...h, background_color: e.target.value }))}
                      className="w-full h-9 rounded-lg border cursor-pointer" style={{ borderColor: 'var(--border)' }} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><Lbl>Text Color</Lbl>
                    <input type="color" value={header.font_color || '#000000'}
                      onChange={e => setHeader(h => ({ ...h, font_color: e.target.value }))}
                      className="w-full h-9 rounded-lg border cursor-pointer" style={{ borderColor: 'var(--border)' }} />
                  </div>
                  <div><Lbl>Border Color</Lbl>
                    <input type="color" value={header.border_color || '#d1d5db'}
                      onChange={e => setHeader(h => ({ ...h, border_color: e.target.value }))}
                      className="w-full h-9 rounded-lg border cursor-pointer" style={{ borderColor: 'var(--border)' }} />
                  </div>
                </div>

                {/* Padding */}
                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Padding (px)</p>
                <div className="grid grid-cols-4 gap-1">
                  {['top','right','bottom','left'].map(s => (
                    <div key={s}><p className="text-[9px] text-center mb-0.5" style={{ color: 'var(--text-muted)' }}>{s[0].toUpperCase()}</p>
                      <Inp type="number" value={header[`padding_${s}`] ?? 20} min={0} max={80}
                        onChange={e => setHeader(h => ({ ...h, [`padding_${s}`]: +e.target.value }))} />
                    </div>
                  ))}
                </div>

                <div className="flex gap-4 flex-wrap">
                  <Tog label="Show Border Bottom" checked={header.border_bottom} onChange={v => setHeader(h => ({ ...h, border_bottom: v }))} />
                </div>
                {header.border_bottom && (
                  <div><Lbl>Border Width (px)</Lbl>
                    <Inp type="number" value={header.border_width || 1} min={1} max={8}
                      onChange={e => setHeader(h => ({ ...h, border_width: +e.target.value }))} />
                  </div>
                )}
              </>}
            </Section>

            {/* ── Section 3: Document Title ── */}
            <Section id="doc-title" title="Document Title" icon={Type}
              open={openSection === 'doc-title'} onToggle={toggleSection}>
              <div><Lbl>Title Text</Lbl>
                <Inp value={docTitle.text} onChange={e => setDocTitle(d => ({ ...d, text: e.target.value }))} placeholder="e.g. OFFER LETTER" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Lbl>Font Family</Lbl>
                  <Sel value={docTitle.font_family || 'Arial'} onChange={e => setDocTitle(d => ({ ...d, font_family: e.target.value }))}>
                    {FONT_FAMILIES.map(f => <option key={f} value={f}>{f}</option>)}
                  </Sel>
                </div>
                <div><Lbl>Font Size (pt)</Lbl>
                  <Inp type="number" value={docTitle.font_size || 16} min={10} max={40}
                    onChange={e => setDocTitle(d => ({ ...d, font_size: +e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Lbl>Color</Lbl>
                  <input type="color" value={docTitle.color || '#111827'}
                    onChange={e => setDocTitle(d => ({ ...d, color: e.target.value }))}
                    className="w-full h-9 rounded-lg border cursor-pointer" style={{ borderColor: 'var(--border)' }} />
                </div>
                <div><Lbl>Alignment</Lbl>
                  <Sel value={docTitle.alignment || 'center'} onChange={e => setDocTitle(d => ({ ...d, alignment: e.target.value }))}>
                    <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
                  </Sel>
                </div>
              </div>
              {/* Issue 10: Title position controls */}
              <div className="grid grid-cols-2 gap-2">
                <div><Lbl>Title Margin Top (px)</Lbl>
                  <Sel value={docTitle.margin_top ?? 12} onChange={e => setDocTitle(d => ({ ...d, margin_top: +e.target.value }))}>
                    {[0, 10, 20, 30, 40].map(v => <option key={v} value={v}>{v}px</option>)}
                    <option value={12}>12px</option>
                  </Sel>
                </div>
                <div><Lbl>Title Margin Bottom (px)</Lbl>
                  <Sel value={docTitle.margin_bottom ?? 14} onChange={e => setDocTitle(d => ({ ...d, margin_bottom: +e.target.value }))}>
                    {[0, 10, 20, 30, 40].map(v => <option key={v} value={v}>{v}px</option>)}
                    <option value={14}>14px</option>
                  </Sel>
                </div>
              </div>
              {/* Issue 11: Body content start — uses title margin_bottom above */}
              <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                Title Margin Bottom controls the gap between title and body content.
              </p>
              <div className="flex gap-4">
                <Tog label="Bold"      checked={docTitle.bold}      onChange={v => setDocTitle(d => ({ ...d, bold: v }))} />
                <Tog label="Italic"    checked={docTitle.italic}    onChange={v => setDocTitle(d => ({ ...d, italic: v }))} />
                <Tog label="Underline" checked={docTitle.underline} onChange={v => setDocTitle(d => ({ ...d, underline: v }))} />
              </div>
            </Section>

            {/* ── Section 4: Body Content ── */}
            <Section id="body" title="Body Content" icon={AlignLeft}
              open={openSection === 'body'} onToggle={toggleSection}>
              <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
                Use the toolbar for formatting. Insert HR fields below for dynamic content.
              </p>
              <BodyEditor editorRef={editorRef} onInput={handleEditorInput} />
            </Section>

            {/* ── Section 5: Signature ── */}
            <Section id="signature" title="Signature" icon={PenLine}
              open={openSection === 'signature'} onToggle={toggleSection}
              badge={sigCfg.enabled ? 'ON' : 'OFF'}>
              <Tog label="Add Signature Block" checked={sigCfg.enabled} onChange={v => setSigCfg(s => ({ ...s, enabled: v }))} />
              {sigCfg.enabled && <>
                <div><Lbl>Signature Type</Lbl>
                  <div className="flex gap-2">
                    {[
                      { key: 'text',   label: 'Text Line'   },
                      { key: 'upload', label: 'Upload Image' },
                      { key: 'draw',   label: 'Draw'        },
                    ].map(t => (
                      <button key={t.key} type="button"
                        onClick={() => setSigCfg(s => ({ ...s, type: t.key }))}
                        className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors ${sigCfg.type === t.key ? 'bg-violet-600 text-white border-violet-600' : ''}`}
                        style={sigCfg.type !== t.key ? { borderColor: 'var(--border)', color: 'var(--text-body)' } : {}}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                {sigCfg.type === 'upload' && (
                  <div><Lbl>Signature Image</Lbl>
                    {sigCfg.image_url ? (
                      <div className="flex items-center gap-3">
                        <img src={sigCfg.image_url} alt="Signature"
                          style={{ height: 40, maxWidth: 120, objectFit: 'contain', border: '1px solid var(--border)', borderRadius: 4 }} />
                        <button onClick={() => setSigCfg(s => ({ ...s, image_url: '' }))}
                          className="text-xs text-red-500 hover:text-red-700">Remove</button>
                      </div>
                    ) : (
                      <label className="flex items-center gap-2 px-3 py-2.5 rounded-lg border cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                        style={{ borderColor: 'var(--border)', color: 'var(--text-muted)', borderStyle: 'dashed' }}>
                        <Upload className="w-4 h-4" />
                        <span className="text-sm">Upload signature image</span>
                        <input type="file" accept="image/*" className="sr-only" onChange={handleSigImageUpload} />
                      </label>
                    )}
                  </div>
                )}

                {sigCfg.type === 'draw' && (
                  <div><Lbl>Draw Signature</Lbl>
                    <DrawSignature onChange={v => setSigCfg(s => ({ ...s, draw_data: v, image_url: v }))} />
                    {sigCfg.draw_data && (
                      <div className="mt-1">
                        <img src={sigCfg.draw_data} alt="Drawn signature" style={{ height: 40, border: '1px solid var(--border)', borderRadius: 4 }} />
                      </div>
                    )}
                  </div>
                )}

                <div><Lbl>Authorized Person Name</Lbl>
                  <Inp value={sigCfg.authorized_person} onChange={e => setSigCfg(s => ({ ...s, authorized_person: e.target.value }))} placeholder="e.g. John Smith" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><Lbl>Designation</Lbl>
                    <Inp value={sigCfg.designation} onChange={e => setSigCfg(s => ({ ...s, designation: e.target.value }))} placeholder="HR Manager" />
                  </div>
                  <div><Lbl>Department</Lbl>
                    <Inp value={sigCfg.department} onChange={e => setSigCfg(s => ({ ...s, department: e.target.value }))} placeholder="Human Resources" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><Lbl>Width (px, 0=auto)</Lbl>
                    <Inp type="number" value={sigCfg.width || 0} min={0} max={300}
                      onChange={e => setSigCfg(s => ({ ...s, width: +e.target.value }))} />
                  </div>
                  <div><Lbl>Height (px)</Lbl>
                    <Inp type="number" value={sigCfg.height || 44} min={20} max={120}
                      onChange={e => setSigCfg(s => ({ ...s, height: +e.target.value }))} />
                  </div>
                </div>
                <div><Lbl>Position</Lbl>
                  <div className="flex gap-2">
                    {['left','center','right'].map(p => (
                      <button key={p} type="button"
                        onClick={() => setSigCfg(s => ({ ...s, position: p }))}
                        className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors capitalize ${sigCfg.position === p ? 'bg-violet-600 text-white border-violet-600' : ''}`}
                        style={sigCfg.position !== p ? { borderColor: 'var(--border)', color: 'var(--text-body)' } : {}}>
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
                <Tog label="Show Signature Line" checked={sigCfg.show_line !== false} onChange={v => setSigCfg(s => ({ ...s, show_line: v }))} />
              </>}
            </Section>

            {/* ── Section 6: Footer ── */}
            <Section id="footer" title="Footer" icon={Eye}
              open={openSection === 'footer'} onToggle={toggleSection}
              badge={footer.show ? 'ON' : 'OFF'}>
              <Tog label="Show Footer" checked={footer.show} onChange={v => setFooter(f => ({ ...f, show: v }))} />
              {footer.show && <>
                <div><Lbl>Footer Text</Lbl>
                  <Inp value={footer.text} onChange={e => setFooter(f => ({ ...f, text: e.target.value }))} placeholder="Company Confidential" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><Lbl>Font Size (px)</Lbl>
                    <Inp type="number" value={footer.font_size || 10} min={6} max={14}
                      onChange={e => setFooter(f => ({ ...f, font_size: +e.target.value }))} />
                  </div>
                  <div><Lbl>Text Color</Lbl>
                    <input type="color" value={footer.font_color || '#666666'}
                      onChange={e => setFooter(f => ({ ...f, font_color: e.target.value }))}
                      className="w-full h-9 rounded-lg border cursor-pointer" style={{ borderColor: 'var(--border)' }} />
                  </div>
                </div>
                <div><Lbl>Footer Height (px)</Lbl>
                  <Sel value={footer.footer_height || 50} onChange={e => setFooter(f => ({ ...f, footer_height: +e.target.value }))}>
                    {[30,40,50,60,80,100].map(v => <option key={v} value={v}>{v}px</option>)}
                  </Sel>
                </div>
                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Padding (px)</p>
                <div className="grid grid-cols-4 gap-1">
                  {['top','right','bottom','left'].map(s => (
                    <div key={s}><p className="text-[9px] text-center mb-0.5" style={{ color: 'var(--text-muted)' }}>{s[0].toUpperCase()}</p>
                      <Inp type="number" value={footer[`padding_${s}`] ?? 8} min={0} max={60}
                        onChange={e => setFooter(f => ({ ...f, [`padding_${s}`]: +e.target.value }))} />
                    </div>
                  ))}
                </div>
                <div className="space-y-2">
                  <Tog label="Show Page Numbers"  checked={footer.show_page_numbers}  onChange={v => setFooter(f => ({ ...f, show_page_numbers: v }))} />
                  <Tog label="Show Date"           checked={footer.show_date}          onChange={v => setFooter(f => ({ ...f, show_date: v }))} />
                  <Tog label="Confidential Label"  checked={footer.confidential_label} onChange={v => setFooter(f => ({ ...f, confidential_label: v }))} />
                  <Tog label="Show Border Top"     checked={footer.border_top}         onChange={v => setFooter(f => ({ ...f, border_top: v }))} />
                </div>
              </>}
            </Section>

            {/* ── Section 7: Watermark ── */}
            <Section id="watermark" title="Watermark" icon={Settings}
              open={openSection === 'watermark'} onToggle={toggleSection}
              badge={watermark.enabled ? 'ON' : 'OFF'}>
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
                <div><Lbl>Custom Text</Lbl>
                  <Inp value={watermark.text} onChange={e => setWatermark(w => ({ ...w, text: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><Lbl>Opacity (0–1)</Lbl>
                    <Inp type="number" value={watermark.opacity} min={0.05} max={1} step={0.05}
                      onChange={e => setWatermark(w => ({ ...w, opacity: +e.target.value }))} />
                  </div>
                  <div><Lbl>Rotation (°)</Lbl>
                    <Inp type="number" value={watermark.rotation} min={-180} max={180}
                      onChange={e => setWatermark(w => ({ ...w, rotation: +e.target.value }))} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><Lbl>Size (px)</Lbl>
                    <Inp type="number" value={watermark.size || 72} min={20} max={200}
                      onChange={e => setWatermark(w => ({ ...w, size: +e.target.value }))} />
                  </div>
                  <div><Lbl>Color</Lbl>
                    <input type="color" value={watermark.color || '#9ca3af'}
                      onChange={e => setWatermark(w => ({ ...w, color: e.target.value }))}
                      className="w-full h-9 rounded-lg border cursor-pointer" style={{ borderColor: 'var(--border)' }} />
                  </div>
                </div>
              </>}
            </Section>

            {/* ── Section 8: Paper Settings ── */}
            <Section id="paper" title="Paper Settings" icon={FileText}
              open={openSection === 'paper'} onToggle={toggleSection}>
              <div className="grid grid-cols-2 gap-2">
                <div><Lbl>Paper Size</Lbl>
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
              </div>
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Margins (points, 72pt = 1 inch)</p>
              <div className="grid grid-cols-2 gap-2">
                {['top','bottom','left','right'].map(s => (
                  <div key={s}><Lbl>{s.charAt(0).toUpperCase() + s.slice(1)}</Lbl>
                    <Inp type="number" value={paper[`margin_${s}`]} min={0} max={200}
                      onChange={e => setPaper(p => ({ ...p, [`margin_${s}`]: +e.target.value }))} />
                  </div>
                ))}
              </div>
            </Section>

            {/* ── Section 9: Document Presets ── */}
            <Section id="presets" title="Document Presets" icon={Wand2}
              open={openSection === 'presets'} onToggle={toggleSection}>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                One-click layouts that set header, spacing, and title alignment for common HR documents.
              </p>
              <div className="grid grid-cols-2 gap-2 pt-1">
                {DOCUMENT_PRESETS.map(preset => (
                  <button key={preset.id} type="button" onClick={() => applyPreset(preset)}
                    className="py-2 px-3 rounded-lg text-xs font-semibold border transition-colors hover:bg-violet-50 dark:hover:bg-violet-900/20 hover:border-violet-400 text-left"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-body)' }}>
                    {preset.name}
                  </button>
                ))}
              </div>
            </Section>

          </div>
        </div>

        {/* ── Resize handle / Expand strip ── */}
        <div className="relative flex-shrink-0 flex flex-col"
          style={{ width: 12, background: 'var(--bg-secondary)', borderLeft: '1px solid var(--border)' }}>
          {/* Toggle button */}
          <button onClick={toggleLeftPanel}
            title={leftCollapsed ? 'Expand Builder' : 'Collapse Builder'}
            className="absolute top-3 left-1/2 -translate-x-1/2 z-20 w-7 h-7 rounded-full border shadow-sm flex items-center justify-center transition-all hover:bg-violet-600 hover:text-white hover:border-violet-600"
            style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
            {leftCollapsed
              ? <PanelLeftOpen className="w-3.5 h-3.5" />
              : <PanelLeftClose className="w-3.5 h-3.5" />
            }
          </button>
          {/* Resize drag area */}
          {!leftCollapsed && (
            <div className="mt-12 flex-1 cursor-col-resize hover:bg-violet-200 dark:hover:bg-violet-800 transition-colors"
              onMouseDown={handleResizeMouseDown}
            />
          )}
        </div>

        {/* ── Right: Live Preview ── */}
        <div className="flex-1 min-h-0 overflow-auto py-8 px-6 flex flex-col items-center"
          style={{ background: '#e8e8ed' }}>
          <div className="flex items-center gap-2 mb-5 self-start flex-shrink-0">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Live Preview</span>
          </div>

          <PaginatedDocPreview
            header={header} footer={footer} paper={paper} watermark={watermark}
            docTitle={docTitle} bodyHtml={bodyHtml} sigCfg={sigCfg}
          />
        </div>

      </div>

      {/* ── Full Preview Modal ── */}
      {showFullPreview && (
        <PreviewModal
          onClose={() => setShowFullPreview(false)}
          header={header} footer={footer} paper={paper} watermark={watermark}
          docTitle={docTitle} bodyHtml={bodyHtml} sigCfg={sigCfg}
        />
      )}

      <style>{`
        [data-placeholder]:empty::before {
          content: attr(data-placeholder);
          color: #9ca3af; pointer-events: none; font-style: italic;
        }
      `}</style>
    </div>
  )
}
