import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react'
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
const DRAFT_LS_PREFIX = 'qb_draft_'

const HEADER_LAYOUTS = [
  { value: 'company_left_logo_right',  label: 'Company Left / Logo Right' },
  { value: 'logo_left_company_right',  label: 'Logo Left / Company Right' },
  { value: 'logo_top_company_bottom',  label: 'Logo Top / Company Bottom (Centered)' },
  { value: 'company_top_logo_bottom',  label: 'Company Top / Logo Bottom (Centered)' },
  { value: 'logo_only',                label: 'Logo Only' },
  { value: 'company_only',             label: 'Company Only' },
  { value: 'center',                   label: 'Logo + Company Centered (Side by Side)' },
  { value: 'split_3',                  label: 'Logo | Company | Contact (3-Column)' },
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
// keepMounted=true renders children but hides with CSS — prevents editor unmount
function Section({ id, title, icon: Icon, open, onToggle, children, badge, keepMounted }) {
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
      {keepMounted ? (
        <div className="px-5 pb-5 pt-2 space-y-3" style={{ background: 'var(--bg-primary)', display: open ? undefined : 'none' }}>
          {children}
        </div>
      ) : open ? (
        <div className="px-5 pb-5 pt-2 space-y-3" style={{ background: 'var(--bg-primary)' }}>
          {children}
        </div>
      ) : null}
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

// ─── Table Dialog ─────────────────────────────────────────────────────────────
function TableDialog({ onInsert, onClose }) {
  const [rows, setCols_r] = useState(3)
  const [cols, setCols_c] = useState(3)

  const buildHtml = (r, c) => {
    const headerCells = Array.from({ length: c }, (_, i) =>
      `<th style="padding:8px 10px;background:#7c3aed;color:white;border:1px solid #e5e7eb;text-align:left;">Header ${i + 1}</th>`
    ).join('')
    const bodyRows = Array.from({ length: r - 1 }, (_, ri) =>
      `<tr>${Array.from({ length: c }, (_, ci) =>
        `<td style="padding:8px 10px;border:1px solid #e5e7eb;background:${ri % 2 === 0 ? 'white' : '#f9fafb'};">Cell ${ri + 1}.${ci + 1}</td>`
      ).join('')}</tr>`
    ).join('')
    return `<table border="1" style="border-collapse:collapse;width:100%;margin:8px 0;"><tr>${headerCells}</tr>${bodyRows}</table>`
  }

  const previewR = Math.min(rows, 4)
  const previewC = Math.min(cols, 5)

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.55)' }}>
      <div className="rounded-xl border shadow-2xl p-6" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', width: 420 }}>
        <h3 className="text-sm font-bold mb-4" style={{ color: 'var(--text-heading)' }}>Insert Custom Table</h3>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Rows (1–20)</p>
            <input type="number" min={1} max={20} value={rows}
              onChange={e => setCols_r(Math.max(1, Math.min(20, +e.target.value || 1)))}
              className="w-full px-2.5 py-1.5 text-sm rounded-lg border focus:outline-none focus:ring-1 focus:ring-violet-500"
              style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)', color: 'var(--text-body)' }} />
          </div>
          <div>
            <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Columns (1–10)</p>
            <input type="number" min={1} max={10} value={cols}
              onChange={e => setCols_c(Math.max(1, Math.min(10, +e.target.value || 1)))}
              className="w-full px-2.5 py-1.5 text-sm rounded-lg border focus:outline-none focus:ring-1 focus:ring-violet-500"
              style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)', color: 'var(--text-body)' }} />
          </div>
        </div>

        {/* Mini preview */}
        <div className="mb-3 overflow-auto rounded border" style={{ borderColor: 'var(--border)', maxHeight: 140 }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 11 }}>
            <tbody>
              {Array.from({ length: previewR }, (_, ri) => (
                <tr key={ri}>
                  {Array.from({ length: previewC }, (_, ci) => (
                    <td key={ci} style={{
                      border: '1px solid #e5e7eb', padding: '3px 6px',
                      background: ri === 0 ? '#7c3aed' : ri % 2 ? '#f9fafb' : 'white',
                      color: ri === 0 ? 'white' : '#374151',
                    }}>
                      {ri === 0 ? `H${ci + 1}` : `${ri}.${ci + 1}`}
                    </td>
                  ))}
                  {cols > 5 && <td style={{ padding: '2px 4px', color: '#9ca3af', fontSize: 10 }}>…</td>}
                </tr>
              ))}
            </tbody>
          </table>
          {rows > 4 && <p style={{ fontSize: 10, color: '#9ca3af', textAlign: 'center', padding: 4 }}>…{rows - 4} more rows</p>}
        </div>

        <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>{rows} × {cols} table</p>
        <div className="flex gap-2">
          <button onClick={onClose}
            className="flex-1 py-2 rounded-lg text-sm font-medium border transition-colors"
            style={{ borderColor: 'var(--border)', color: 'var(--text-body)' }}>
            Cancel
          </button>
          <button onClick={() => { onInsert(buildHtml(rows, cols)); onClose() }}
            className="flex-1 py-2 rounded-lg text-sm font-semibold text-white"
            style={{ background: 'linear-gradient(135deg,#7c3aed,#4f46e5)' }}>
            Insert {rows}×{cols} Table
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Image Resize Toolbar ─────────────────────────────────────────────────────
function ImageResizeToolbar({ img, onClose }) {
  const [w, setW] = useState(() => img.width || img.naturalWidth || 200)
  const [lock, setLock] = useState(true)
  const ratio = img.naturalWidth / (img.naturalHeight || 1)

  const apply = (newW, newH) => {
    img.style.width  = newW + 'px'
    img.style.height = newH ? newH + 'px' : 'auto'
    img.style.maxWidth = '100%'
  }

  const handleW = (v) => {
    const nw = Math.max(20, Math.min(800, +v || 20))
    setW(nw)
    apply(nw, lock ? Math.round(nw / ratio) : null)
  }

  const handleAlign = (align) => {
    if (align === 'center') { img.style.display = 'block'; img.style.margin = '0 auto' }
    else if (align === 'right') { img.style.display = 'block'; img.style.marginLeft = 'auto'; img.style.marginRight = '0' }
    else { img.style.display = 'inline'; img.style.margin = '0' }
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg border shadow-lg flex-wrap"
      style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', fontSize: 12 }}>
      <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Image:</span>
      <label style={{ color: 'var(--text-muted)' }}>W
        <input type="number" value={w} min={20} max={800}
          onChange={e => handleW(e.target.value)}
          className="ml-1 w-16 px-1.5 py-0.5 rounded border text-xs"
          style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)', color: 'var(--text-body)' }} />px
      </label>
      <button onClick={() => setLock(v => !v)}
        className={`px-2 py-0.5 rounded text-xs border transition-colors ${lock ? 'bg-violet-600 text-white border-violet-600' : ''}`}
        style={lock ? {} : { borderColor: 'var(--border)', color: 'var(--text-muted)' }}
        title="Lock aspect ratio">
        {lock ? '🔒' : '🔓'}
      </button>
      <div className="w-px h-4 bg-gray-300 dark:bg-gray-600" />
      {['left', 'center', 'right'].map(a => (
        <button key={a} onClick={() => handleAlign(a)}
          className="px-2 py-0.5 rounded text-xs border transition-colors hover:bg-violet-50 dark:hover:bg-violet-900/20"
          style={{ borderColor: 'var(--border)', color: 'var(--text-body)' }}>
          {a[0].toUpperCase() + a.slice(1)}
        </button>
      ))}
      <button onClick={onClose}
        className="ml-auto px-2 py-0.5 rounded text-xs border transition-colors text-red-500 border-red-200 hover:bg-red-50">
        ✕
      </button>
    </div>
  )
}

// ─── Body Editor ──────────────────────────────────────────────────────────────
function BodyEditor({ editorRef, onInput, initialHtml }) {
  const savedSel = useRef(null)
  const [showTableDialog, setShowTableDialog] = useState(false)
  const [selectedImg, setSelectedImg]         = useState(null)

  // Restore content on mount — keeps editor populated when section re-opens (keepMounted)
  useLayoutEffect(() => {
    if (editorRef.current && initialHtml && !editorRef.current.innerHTML.trim()) {
      editorRef.current.innerHTML = initialHtml
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Image click detection inside editor
  useEffect(() => {
    const el = editorRef.current
    if (!el) return
    const handler = (e) => {
      if (e.target.tagName === 'IMG') setSelectedImg(e.target)
      else setSelectedImg(null)
    }
    el.addEventListener('click', handler)
    return () => el.removeEventListener('click', handler)
  }, [editorRef])

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
        <TB icon={TableIcon}  label="Insert Table"      onClick={() => { saveSel(); setShowTableDialog(true) }} />
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
        style={{ minHeight: 300, overflowY: 'visible', fontSize: '12pt', lineHeight: 1.7, color: '#1f2937', fontFamily: 'Arial, sans-serif' }}
        data-placeholder="Type your document body content here…" />

      {/* Image resize toolbar (appears when an image is selected in editor) */}
      {selectedImg && (
        <div className="border-t px-3 py-2" style={{ borderColor: 'var(--border)' }}>
          <ImageResizeToolbar img={selectedImg} onClose={() => setSelectedImg(null)} />
        </div>
      )}

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

      {/* Table dialog modal */}
      {showTableDialog && (
        <TableDialog
          onInsert={html => insertHtml(html)}
          onClose={() => setShowTableDialog(false)}
        />
      )}
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
  return `<div data-qb-type="title" style="text-align:${docTitle.alignment || 'center'};font-family:${docTitle.font_family || 'Arial'},sans-serif;font-size:${docTitle.font_size || 16}pt;color:${docTitle.color || '#111827'};font-weight:${docTitle.bold ? 'bold' : 'normal'};font-style:${docTitle.italic ? 'italic' : 'normal'};text-decoration:${docTitle.underline ? 'underline' : 'none'};margin:${mt}px 0 ${mb}px;">${docTitle.text}</div>`
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

  return `<table data-qb-type="sig" style="width:100%;margin:24px 0 0;border-collapse:collapse;"><tr>
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

// ─── Cursor helpers (global char-offset across all editable page divs) ────────
function getGlobalTextOffset(editableEls, sel) {
  if (!sel?.rangeCount) return null
  const range = sel.getRangeAt(0)
  let total = 0
  for (const el of editableEls) {
    if (!el) continue
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    let node
    while ((node = walker.nextNode())) {
      if (node === range.startContainer) return total + range.startOffset
      total += node.length
    }
    total++ // page boundary separator
  }
  return null
}

function setGlobalTextOffset(editableEls, targetOffset) {
  let remaining = targetOffset
  for (const el of editableEls) {
    if (!el) continue
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    let node
    while ((node = walker.nextNode())) {
      if (remaining <= node.length) {
        try {
          const range = document.createRange()
          range.setStart(node, remaining)
          range.collapse(true)
          const sel = window.getSelection()
          sel.removeAllRanges()
          sel.addRange(range)
          el.focus({ preventScroll: true })
          // Scroll the containing page-box into view so the caret is visible
          // after large pastes or cross-page content redistribution.
          const pageBox = el.closest('[data-qb-page]') || el.parentElement
          if (pageBox) pageBox.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
        } catch (_) {}
        return true
      }
      remaining -= node.length
    }
    remaining-- // page boundary
  }
  return false
}

// ─── Paragraph splitter: line-estimation split + Range-based HTML extraction ──

// Split containerEl's DOM at the given text node + character offset.
// Returns { part1: htmlString, part2: htmlString } or null on failure.
function splitDomAtPoint(containerEl, splitNode, splitOffset) {
  const tag  = containerEl.tagName.toLowerCase()
  const attrs = [...containerEl.attributes].map(a => `${a.name}="${a.value}"`).join(' ')
  const open  = `<${tag}${attrs ? ' ' + attrs : ''}>`
  const close = `</${tag}>`
  try {
    const r1 = document.createRange()
    r1.setStart(containerEl, 0)
    r1.setEnd(splitNode, splitOffset)
    const d1 = document.createElement('div')
    d1.appendChild(r1.cloneContents())

    const r2 = document.createRange()
    r2.setStart(splitNode, splitOffset)
    r2.setEnd(containerEl, containerEl.childNodes.length)
    const d2 = document.createElement('div')
    d2.appendChild(r2.cloneContents())

    const h1 = d1.innerHTML.trim()
    const h2 = d2.innerHTML.trim()
    if (!h1 || !h2) return null
    return { part1: open + h1 + close, part2: open + h2 + close }
  } catch (_) { return null }
}

// Walk text nodes in containerEl and split at the given global character position.
function splitAtChar(containerEl, charPos) {
  let remaining = charPos
  const walker = document.createTreeWalker(containerEl, NodeFilter.SHOW_TEXT)
  let node
  while ((node = walker.nextNode())) {
    if (remaining <= node.length) return splitDomAtPoint(containerEl, node, remaining)
    remaining -= node.length
  }
  return null
}

// Attempt to split a block at `remainingH` pixels from its top using line-height
// estimation and Range-based HTML extraction.  Returns null if splitting is not
// possible or would produce a trivially small first part.
function tryBlockSplitInDOM(blockHtml, qbType, remainingH, contentW) {
  const SPLITTABLE = new Set(['P','H1','H2','H3','H4','H5','H6','DIV','BLOCKQUOTE','LI'])
  const tmp = document.createElement('div')
  Object.assign(tmp.style, {
    position: 'absolute', top: '-99999px', left: '-99999px',
    width: `${contentW}px`, fontSize: '12pt', lineHeight: '1.7',
    fontFamily: 'Arial, sans-serif', color: '#1f2937',
    visibility: 'hidden', pointerEvents: 'none',
  })
  tmp.innerHTML = blockHtml
  document.body.appendChild(tmp)
  let result = null
  try {
    const el = tmp.firstElementChild
    if (!el || !SPLITTABLE.has(el.tagName)) return null

    const cs     = window.getComputedStyle(el)
    const lineH  = parseFloat(cs.lineHeight) || 28
    if (!isFinite(lineH) || lineH < 4) return null

    const totalH     = el.offsetHeight
    const linesTotal = Math.max(1, Math.round(totalH / lineH))
    const linesFit   = Math.floor(remainingH / lineH)
    if (linesFit < 1 || linesFit >= linesTotal) return null

    const fullText    = el.textContent || ''
    const rawSplit    = Math.round(fullText.length * linesFit / linesTotal)
    const wordBound   = fullText.lastIndexOf(' ', rawSplit)
    if (wordBound <= 0) return null

    const split = splitAtChar(el, wordBound + 1) // split right after the space
    if (!split) return null

    // Measure heights of the two resulting parts
    tmp.innerHTML = split.part1 + split.part2
    const [e1, e2] = tmp.children
    const h1 = e1 ? (e1.offsetHeight || remainingH)        : remainingH
    const h2 = e2 ? (e2.offsetHeight || totalH - remainingH) : (totalH - remainingH)

    result = {
      part1: { html: split.part1, height: h1, qbType },
      part2: { html: split.part2, height: h2, qbType },
    }
  } finally {
    if (document.body.contains(tmp)) document.body.removeChild(tmp)
  }
  return result
}

// ─── Cross-page cursor helpers ────────────────────────────────────────────────

function isCaretAtStart(el) {
  const sel = window.getSelection()
  if (!sel?.rangeCount || !range_collapsed(sel)) return false
  const range = sel.getRangeAt(0)
  const r2 = document.createRange()
  r2.selectNodeContents(el)
  r2.collapse(true)
  return range.compareBoundaryPoints(Range.START_TO_START, r2) <= 0
}

function isCaretAtEnd(el) {
  const sel = window.getSelection()
  if (!sel?.rangeCount || !range_collapsed(sel)) return false
  const range = sel.getRangeAt(0)
  const r2 = document.createRange()
  r2.selectNodeContents(el)
  r2.collapse(false)
  return range.compareBoundaryPoints(Range.END_TO_END, r2) >= 0
}

function range_collapsed(sel) { return sel.getRangeAt(0).collapsed }

function placeCursorAtStart(el) {
  const range = document.createRange()
  range.selectNodeContents(el)
  range.collapse(true)
  const sel = window.getSelection()
  sel.removeAllRanges()
  sel.addRange(range)
  el.focus({ preventScroll: true })
  el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
}

function placeCursorAtEnd(el) {
  const range = document.createRange()
  range.selectNodeContents(el)
  range.collapse(false)
  const sel = window.getSelection()
  sel.removeAllRanges()
  sel.addRange(range)
  el.focus({ preventScroll: true })
  el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
}

// Shared block distribution logic used by both the pagination effect and the blur flush.
// Tries to split paragraphs at page boundaries rather than always pushing whole blocks.
function distributeBlocksToPages(blocks, usableH, contentW) {
  const pages = [[]]
  let usedH = 0
  for (const block of blocks) {
    const bh = Math.max(block.height, 4)
    if (usedH === 0 || usedH + bh <= usableH) {
      pages[pages.length - 1].push(block)
      usedH += bh
    } else {
      const remainingH = usableH - usedH
      // Try to split the block at the page boundary if meaningful space remains
      if (remainingH > 60) {
        const split = tryBlockSplitInDOM(block.html, block.qbType, remainingH, contentW)
        if (split) {
          pages[pages.length - 1].push(split.part1)
          pages.push([split.part2])
          usedH = Math.max(split.part2.height, 4)
          continue
        }
      }
      // No split — start fresh page, always place at least one block
      pages.push([block])
      usedH = bh
    }
  }
  return pages
}

// ─── Table splitter: distributes rows across page-height chunks ───────────────
function splitTableByRows(tableEl, usableH, qbType) {
  const allRows = Array.from(tableEl.querySelectorAll('tr'))
  if (allRows.length === 0) {
    return [{ html: tableEl.outerHTML, height: tableEl.offsetHeight || 40, qbType }]
  }

  const border  = tableEl.getAttribute('border')  || ''
  const style   = tableEl.getAttribute('style')   || ''
  const cls     = tableEl.getAttribute('class')   || ''
  const openTag = `<table${border ? ` border="${border}"` : ''}${style ? ` style="${style}"` : ''}${cls ? ` class="${cls}"` : ''}>`

  const headerHtml = allRows[0].outerHTML
  const headerH    = (allRows[0].offsetHeight || 30) + 2

  const chunks   = []
  let chunkRows  = [allRows[0]]
  let chunkH     = headerH

  for (let i = 1; i < allRows.length; i++) {
    const rh = (allRows[i].offsetHeight || 28) + 1
    if (chunkRows.length > 1 && chunkH + rh > usableH * 0.9) {
      chunks.push({ html: openTag + chunkRows.map(r => r.outerHTML).join('') + '</table>', height: chunkH })
      chunkRows = [allRows[0], allRows[i]] // repeat header on continuation
      chunkH    = headerH + rh
    } else {
      chunkRows.push(allRows[i])
      chunkH += rh
    }
  }
  if (chunkRows.length > 0) {
    chunks.push({ html: openTag + chunkRows.map(r => r.outerHTML).join('') + '</table>', height: chunkH })
  }

  return chunks.map(c => ({ html: c.html, height: c.height, qbType }))
}

// ─── Paginated Doc Preview ────────────────────────────────────────────────────
// MS Word-style: header area → [top margin] → text area → [bottom margin] → footer area
// Each page is exactly ph px tall. Content is windowed per page via overflow:hidden + negative margin.
function PaginatedDocPreview({ header, footer, paper, watermark, docTitle, bodyHtml, sigCfg, onBodyChange }) {

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

  // pageBlocks: array-of-pages, each page = array of {html, height, qbType}
  // qbType values: 'title' | 'body' | 'sig' — derived from data-qb-type attribute in HTML
  const [pageBlocks, setPageBlocks] = useState([[]])

  // Refs — editable body divs (read-only mode), master editor (editable mode)
  const editableRefs    = useRef([])
  const masterEditorRef = useRef(null)
  const anyFocused      = useRef(false)
  const onBodyChangeRef = useRef(onBodyChange)
  const paginationTimer = useRef(null)
  const rAFHandle       = useRef(null)
  const spacerTimerRef  = useRef(null)

  // Master editor page count (used to size the absolute-positioned page backgrounds)
  const [masterPageCount, setMasterPageCount] = useState(1)

  useEffect(() => { onBodyChangeRef.current = onBodyChange })

  // ── Pagination: measures fullBodyHtml in a hidden div, distributes to pages ──
  // Runs at ≤60 ms delay during editing (fast enough to feel live), immediate otherwise.
  // Tables are split row-by-row with header repetition on continuation pages.
  useEffect(() => {
    clearTimeout(paginationTimer.current)
    cancelAnimationFrame(rAFHandle.current)

    if (!fullBodyHtml.trim()) { setPageBlocks([[]]); return }

    const run = () => {
      const container = document.createElement('div')
      container.setAttribute('aria-hidden', 'true')
      Object.assign(container.style, {
        position: 'absolute', top: '-99999px', left: '-99999px',
        width: `${contentW}px`,
        fontSize: '12pt', lineHeight: '1.7',
        fontFamily: 'Arial, sans-serif', color: '#1f2937',
        visibility: 'hidden', pointerEvents: 'none',
      })
      container.innerHTML = fullBodyHtml
      document.body.appendChild(container)

      rAFHandle.current = requestAnimationFrame(() => {
        const children = Array.from(container.children)
        let blocks = []

        if (children.length === 0) {
          blocks = [{ html: fullBodyHtml, height: container.scrollHeight || 40, qbType: 'body' }]
        } else {
          for (const el of children) {
            const qbType = el.getAttribute('data-qb-type') || 'body'
            const cs     = window.getComputedStyle(el)
            const extra  = (parseInt(cs.marginTop) || 0) + (parseInt(cs.marginBottom) || 0)

            if (el.tagName === 'TABLE') {
              // Split table rows across pages with header repetition
              const tableChunks = splitTableByRows(el, usableH, qbType)
              blocks.push(...tableChunks)
            } else {
              const blockH = (el.offsetHeight || 20) + extra
              blocks.push({ html: el.outerHTML, height: blockH, qbType })
            }
          }
        }

        if (document.body.contains(container)) document.body.removeChild(container)

        // Distribute blocks across pages with paragraph-level splitting
        setPageBlocks(distributeBlocksToPages(blocks, usableH, contentW))
      })
    }

    // During active editing use a short delay to batch rapid keystrokes;
    // run immediately when content changes from outside (template load, preset apply, etc.)
    paginationTimer.current = setTimeout(run, anyFocused.current ? 60 : 0)

    return () => {
      clearTimeout(paginationTimer.current)
      cancelAnimationFrame(rAFHandle.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullBodyHtml, contentW, usableH])

  // ── Sync: write ONLY body blocks into editable divs ──
  // When the user is actively editing we save and restore the cursor position so
  // real-time repagination doesn't lose the caret.
  useEffect(() => {
    if (!onBodyChangeRef.current) return

    // Save cursor as a global text-character offset across all page divs
    const sel = window.getSelection()
    const savedOffset = anyFocused.current ? getGlobalTextOffset(editableRefs.current, sel) : null

    pageBlocks.forEach((blocks, i) => {
      const el = editableRefs.current[i]
      if (!el) return
      const newHtml = blocks.filter(b => b.qbType === 'body').map(b => b.html).join('')
      // Skip DOM write if content is identical (avoids caret flicker when nothing moved)
      if (el.innerHTML !== newHtml) el.innerHTML = newHtml
    })

    // Restore cursor after the DOM settles
    if (savedOffset !== null) {
      requestAnimationFrame(() => {
        const restored = setGlobalTextOffset(editableRefs.current, savedOffset)
        if (!restored) {
          // Fallback: place cursor at end of last page div
          const lastEl = [...editableRefs.current].filter(Boolean).pop()
          if (lastEl) {
            const range = document.createRange()
            range.selectNodeContents(lastEl)
            range.collapse(false)
            const s = window.getSelection()
            s.removeAllRanges()
            s.addRange(range)
            lastEl.focus({ preventScroll: true })
          }
        }
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageBlocks])

  // In editable mode the single master editor drives pageCount via spacer injection.
  // In read-only mode pageBlocks.length is authoritative.
  const pageCount = onBodyChange ? Math.max(1, masterPageCount) : Math.max(1, pageBlocks.length)

  // ── Container-level focus/blur ──
  const handleContainerFocus = () => { anyFocused.current = true }
  const handleContainerBlur  = (e) => {
    if (e.currentTarget.contains(e.relatedTarget)) return // focus stayed within the editor
    anyFocused.current = false
    // Flush any pending debounced pagination immediately on blur so the final
    // state is accurate before the user sees the result.
    if (paginationTimer.current) {
      clearTimeout(paginationTimer.current)
      paginationTimer.current = null
      // Re-schedule with zero delay; anyFocused is now false so it fires instantly.
      paginationTimer.current = setTimeout(() => {
        cancelAnimationFrame(rAFHandle.current)
        if (!fullBodyHtml.trim()) { setPageBlocks([[]]); return }
        const container = document.createElement('div')
        container.setAttribute('aria-hidden', 'true')
        Object.assign(container.style, {
          position: 'absolute', top: '-99999px', left: '-99999px',
          width: `${contentW}px`, fontSize: '12pt', lineHeight: '1.7',
          fontFamily: 'Arial, sans-serif', color: '#1f2937',
          visibility: 'hidden', pointerEvents: 'none',
        })
        container.innerHTML = fullBodyHtml
        document.body.appendChild(container)
        rAFHandle.current = requestAnimationFrame(() => {
          const children = Array.from(container.children)
          const blocks = []
          if (children.length === 0) {
            blocks.push({ html: fullBodyHtml, height: container.scrollHeight || 40, qbType: 'body' })
          } else {
            for (const el of children) {
              const qbType = el.getAttribute('data-qb-type') || 'body'
              const cs     = window.getComputedStyle(el)
              const extra  = (parseInt(cs.marginTop) || 0) + (parseInt(cs.marginBottom) || 0)
              if (el.tagName === 'TABLE') {
                blocks.push(...splitTableByRows(el, usableH, qbType))
              } else {
                blocks.push({ html: el.outerHTML, height: (el.offsetHeight || 20) + extra, qbType })
              }
            }
          }
          if (document.body.contains(container)) document.body.removeChild(container)
          setPageBlocks(distributeBlocksToPages(blocks, usableH, contentW))
        })
      }, 0)
    }
  }

  // ── Master editor: spacer injection + sync ──────────────────────────────
  // The page gap height that spacers must fill:
  //   = footer + bottom-margin + 32px page gap + header + header-spacing
  const PAGE_GAP   = 32
  const spacerH    = footerH + mb + PAGE_GAP + headerH + headerSpacing  // == ph - usableH + PAGE_GAP

  // Inject non-editable spacer elements between block children of the master editor
  // so that content aligns with the A4 page background boxes behind it.
  // Called after each debounced input and after external bodyHtml updates.
  const injectMasterSpacers = useCallback((el) => {
    if (!el) return
    // Strip stale spacers first
    el.querySelectorAll('[data-qb-spacer]').forEach(s => s.remove())

    let usedH = 0
    let pageNum = 1
    const children = [...el.children]

    for (const child of children) {
      if (child.dataset.qbSpacer) continue
      const bh = Math.max(child.offsetHeight, 1)

      if (usedH > 0 && usedH + bh > usableH) {
        // Insert spacer between pages
        const remaining  = usableH - usedH
        const totalSpH   = remaining + spacerH
        const spacer     = document.createElement('div')
        spacer.setAttribute('data-qb-spacer', String(pageNum))
        spacer.setAttribute('contenteditable', 'false')
        spacer.style.cssText = [
          `height:${totalSpH}px`,
          'display:block',
          'user-select:none',
          'pointer-events:none',
          'background:transparent',
        ].join(';')
        child.before(spacer)
        usedH = bh
        pageNum++
      } else {
        usedH += bh
      }
    }
    setMasterPageCount(pageNum)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usableH, spacerH])

  // Load initial / externally-changed bodyHtml into the master editor (without clobbering live edits)
  useEffect(() => {
    if (!onBodyChange) return           // read-only mode — master editor not used
    const el = masterEditorRef.current
    if (!el || anyFocused.current) return
    // Strip spacers from master editor, compare pure HTML
    const clone = el.cloneNode(true)
    clone.querySelectorAll('[data-qb-spacer]').forEach(s => s.remove())
    if (clone.innerHTML === (bodyHtml || '')) return  // already in sync
    el.innerHTML = bodyHtml || ''
    requestAnimationFrame(() => injectMasterSpacers(el))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bodyHtml, onBodyChange])

  // Tab-key handler for master editor (prevents focus loss, inserts spaces instead)
  const handleMasterKeyDown = (e) => {
    if (e.key === 'Tab') {
      e.preventDefault()
      document.execCommand('insertText', false, '    ')
    }
  }

  // Master editor input → strip spacers → propagate pure bodyHtml → re-inject spacers
  const handleMasterInput = useCallback(() => {
    const el = masterEditorRef.current
    if (!el) return
    const clone = el.cloneNode(true)
    clone.querySelectorAll('[data-qb-spacer]').forEach(s => s.remove())
    onBodyChangeRef.current?.(clone.innerHTML)
    // Debounce spacer re-injection (60 ms during fast typing)
    clearTimeout(spacerTimerRef.current)
    spacerTimerRef.current = setTimeout(() => injectMasterSpacers(el), 60)
  }, [injectMasterSpacers])

  // ── Cross-page keyboard navigation ───────────────────────────────────────
  // Makes cursor flow Word-style: ArrowDown/Right at page bottom → next page top,
  // ArrowUp/Left at page top → previous page bottom, Backspace at page top → prev page end,
  // Tab → insert spaces instead of losing focus.
  const handlePageKeyDown = (e, pageIdx) => {
    const el = editableRefs.current[pageIdx]
    if (!el) return
    const sel = window.getSelection()
    if (!sel?.rangeCount || !sel.getRangeAt(0).collapsed) return // ignore when selection active

    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      const nextEl = editableRefs.current[pageIdx + 1]
      if (nextEl && isCaretAtEnd(el)) { e.preventDefault(); placeCursorAtStart(nextEl) }
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      const prevEl = editableRefs.current[pageIdx - 1]
      if (prevEl && isCaretAtStart(el)) { e.preventDefault(); placeCursorAtEnd(prevEl) }
    } else if (e.key === 'Backspace' && pageIdx > 0) {
      const prevEl = editableRefs.current[pageIdx - 1]
      if (prevEl && isCaretAtStart(el)) {
        // Move cursor to end of previous page; user's next Backspace deletes there naturally
        e.preventDefault()
        placeCursorAtEnd(prevEl)
      }
    } else if (e.key === 'Tab') {
      e.preventDefault()
      document.execCommand('insertText', false, '    ')
    }
  }

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
    if (layout === 'center') {
      return (
        <div style={{ ...containerStyle, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          {logoEl}
          {companyBlockEl}
        </div>
      )
    }
    if (layout === 'split_3') {
      const contactEl = (header.company_email || header.company_phone || header.company_website) ? (
        <div style={{ lineHeight: 1.4, textAlign: 'right', fontSize: fs - 1, color: textColor }}>
          {header.company_email && <div>{header.company_email}</div>}
          {header.company_phone && <div>{header.company_phone}</div>}
          {header.company_website && <div style={{ color: '#6b7280' }}>{header.company_website}</div>}
        </div>
      ) : null
      return (
        <div style={{ ...containerStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          {logoEl}
          <div style={{ flex: 1, textAlign: 'center' }}>{companyBlockEl}</div>
          {contactEl}
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


  // ──────────────────────────────────────────────────────────────────────────
  // EDITABLE MODE — single master contentEditable with spacer-based page breaks
  // Page backgrounds are absolutely positioned A4 boxes; the master editor floats
  // above them all as one continuous editing surface (true Word-style).
  // ──────────────────────────────────────────────────────────────────────────
  if (onBodyChange) {
    const containerH = masterPageCount * ph + (masterPageCount - 1) * PAGE_GAP
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingBottom: 32 }}>
        {/* Position:relative wrapper — page backgrounds are absolute inside it */}
        <div style={{ position: 'relative', width: pw, minHeight: containerH }}>

          {/* ── A4 page background boxes (purely decorative, pointer-events:none) ── */}
          {Array.from({ length: masterPageCount }).map((_, i) => (
            <div
              key={i}
              data-qb-page
              style={{
                position: 'absolute',
                top: i * (ph + PAGE_GAP),
                left: 0, width: pw, height: ph,
                background: 'white',
                boxShadow: '0 1px 4px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.10), 0 12px 40px rgba(0,0,0,0.08)',
                borderRadius: 2,
                overflow: 'hidden',
                pointerEvents: 'none',
                zIndex: 0,
              }}
            >
              {/* Watermark */}
              {watermark.enabled && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `rotate(${watermark.rotation ?? -45}deg)`, fontSize: watermark.size || 72, opacity: Math.min(watermark.opacity || 0.12, 1), color: watermark.color || '#9ca3af', fontWeight: 'bold', userSelect: 'none', zIndex: 0 }}>
                  {watermark.text || 'CONFIDENTIAL'}
                </div>
              )}
              {/* Header */}
              {headerVisible && renderDocHeader()}
              {/* Footer */}
              {footer.show && renderDocFooter(i + 1)}
              {/* Page label (above each page background) */}
              <div style={{ position: 'absolute', top: -22, left: 0, right: 0, textAlign: 'center', fontSize: 10, fontWeight: 600, color: '#9ca3af', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Page {i + 1}{masterPageCount > 1 ? ` / ${masterPageCount}` : ''}
              </div>
            </div>
          ))}

          {/* ── Single master editor — spans across all page backgrounds ── */}
          <div style={{
            position: 'absolute',
            top: headerH + headerSpacing,
            left: ml, right: mr,
            zIndex: 1,
            fontSize: '12pt', lineHeight: 1.7, color: '#1f2937', fontFamily: 'Arial, sans-serif',
          }}>
            {/* Title (non-editable block above the editable body) */}
            {docTitle?.text && (
              <div
                contentEditable={false}
                suppressContentEditableWarning
                dangerouslySetInnerHTML={{ __html: buildTitleHtml(docTitle) }}
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              />
            )}

            {/* THE SINGLE MASTER EDITOR — one contentEditable for the whole document */}
            <div
              ref={masterEditorRef}
              contentEditable
              suppressContentEditableWarning
              data-qb-master
              onFocus={() => { anyFocused.current = true }}
              onBlur={() => {
                anyFocused.current = false
                clearTimeout(spacerTimerRef.current)
                injectMasterSpacers(masterEditorRef.current)
              }}
              onKeyDown={handleMasterKeyDown}
              onInput={handleMasterInput}
              style={{ outline: 'none', cursor: 'text', minHeight: usableH }}
              data-placeholder={!bodyHtml?.trim() ? 'Click to start typing your document…' : undefined}
            />

            {/* Signature block (non-editable) */}
            {sigCfg?.enabled && (
              <div
                contentEditable={false}
                suppressContentEditableWarning
                dangerouslySetInnerHTML={{ __html: buildSigHtml(sigCfg) }}
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              />
            )}
          </div>
        </div>
      </div>
    )
  }

  // ──────────────────────────────────────────────────────────────────────────
  // READ-ONLY MODE — paginated A4 boxes, unchanged (used by Preview Modal)
  // ──────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 32, paddingBottom: 32 }}>
      {pageBlocks.map((blocks, i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          {/* Page label */}
          <div style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af', marginBottom: 6, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Page {i + 1}{pageCount > 1 ? ` / ${pageCount}` : ''}
          </div>
          {/* Page box */}
          <div data-qb-page style={{ width: pw, height: ph, background: 'white', boxShadow: '0 1px 4px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.10), 0 12px 40px rgba(0,0,0,0.08)', borderRadius: 2, overflow: 'hidden', position: 'relative', flexShrink: 0 }}>
            {/* Watermark */}
            {watermark.enabled && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `rotate(${watermark.rotation ?? -45}deg)`, fontSize: watermark.size || 72, opacity: Math.min(watermark.opacity || 0.12, 1), color: watermark.color || '#9ca3af', fontWeight: 'bold', userSelect: 'none', pointerEvents: 'none', zIndex: 1 }}>
                {watermark.text || 'CONFIDENTIAL'}
              </div>
            )}
            {/* Header */}
            {headerVisible && renderDocHeader()}
            {/* Content */}
            <div style={{ position: 'absolute', top: headerH + headerSpacing, left: ml, right: mr, height: usableH, overflow: 'hidden', zIndex: 2, fontSize: '12pt', lineHeight: 1.7, color: '#1f2937', fontFamily: 'Arial, sans-serif' }}>
              {blocks.length > 0 ? (
                blocks.map((block, bi) => (
                  <div key={bi} dangerouslySetInnerHTML={{ __html: block.html }} />
                ))
              ) : (
                i === 0 && !fullBodyHtml.trim() && (
                  <div style={{ color: '#9ca3af', fontStyle: 'italic', fontSize: '11pt', textAlign: 'center', paddingTop: 40 }}>
                    Fill in the form on the left — your document preview will appear here.
                  </div>
                )
              )}
            </div>
            {/* Footer */}
            {footer.show && renderDocFooter(i + 1)}
          </div>
        </div>
      ))}
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

  // ── Draft system ──────────────────────────────────────────────────────────
  const draftKey = DRAFT_LS_PREFIX + (id || '__new__')

  const saveDraft = useCallback(() => {
    try {
      const html = editorRef.current?.innerHTML || bodyHtml || ''
      const draft = {
        name, description, categoryId, tags, templateType,
        header, footer, paper, watermark, docTitle, sigCfg,
        bodyHtml: html, savedAt: new Date().toISOString(),
      }
      localStorage.setItem(draftKey, JSON.stringify(draft))
    } catch (_) { /* localStorage quota */ }
  }, [name, description, categoryId, tags, templateType, header, footer, paper, watermark, docTitle, sigCfg, bodyHtml, draftKey])

  const restoreFromDraft = useCallback((draft) => {
    if (!draft) return
    try {
      if (draft.name)         setName(draft.name)
      if (draft.description)  setDescription(draft.description)
      if (draft.categoryId)   setCategoryId(draft.categoryId)
      if (draft.tags)         setTags(draft.tags)
      if (draft.templateType) setTemplateType(draft.templateType)
      if (draft.header)       setHeader(h => ({ ...h, ...draft.header }))
      if (draft.footer)       setFooter(f => ({ ...f, ...draft.footer }))
      if (draft.paper)        setPaper(p => ({ ...p, ...draft.paper }))
      if (draft.watermark)    setWatermark(w => ({ ...w, ...draft.watermark }))
      if (draft.docTitle)     setDocTitle(d => ({ ...d, ...draft.docTitle }))
      if (draft.sigCfg)       setSigCfg(s => ({ ...s, ...draft.sigCfg }))
      const html = draft.bodyHtml || ''
      setBodyHtml(html)
      if (editorRef.current) editorRef.current.innerHTML = html
    } catch (_) {}
  }, [])

  // 30-second interval draft save
  useEffect(() => {
    const interval = setInterval(saveDraft, 30000)
    return () => clearInterval(interval)
  }, [saveDraft])

  // Save draft on page unload
  useEffect(() => {
    const fn = () => saveDraft()
    window.addEventListener('beforeunload', fn)
    return () => window.removeEventListener('beforeunload', fn)
  }, [saveDraft])

  // On mount: offer to restore draft for new templates
  useEffect(() => {
    if (id) return // existing template — don't auto-restore
    const raw = localStorage.getItem(draftKey)
    if (!raw) return
    try {
      const draft = JSON.parse(raw)
      if (!draft.savedAt) return
      const age = Date.now() - new Date(draft.savedAt).getTime()
      if (age > 7 * 24 * 60 * 60 * 1000) { localStorage.removeItem(draftKey); return } // older than 7 days
      toast((t) => (
        <div className="flex flex-col gap-2">
          <span className="font-semibold text-sm">Draft restored</span>
          <span className="text-xs text-gray-500">Saved {new Date(draft.savedAt).toLocaleString()}</span>
          <div className="flex gap-2">
            <button onClick={() => { restoreFromDraft(draft); toast.dismiss(t.id); toast.success('Draft restored successfully') }}
              className="px-3 py-1 rounded bg-violet-600 text-white text-xs font-semibold">Restore</button>
            <button onClick={() => { localStorage.removeItem(draftKey); toast.dismiss(t.id) }}
              className="px-3 py-1 rounded border text-xs">Discard</button>
          </div>
        </div>
      ), { duration: 10000 })
    } catch (_) {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
      const payload = buildPayload()
      // Guard against excessively large payloads (MongoDB 16 MB limit)
      const payloadBytes = new Blob([JSON.stringify(payload)]).size
      if (payloadBytes > 12 * 1024 * 1024) {
        toast.error('Document too large (>12 MB). Remove large images or reduce content.')
        setSaving(false)
        return
      }
      if (id) {
        await documentCenterService.updateTemplate(id, payload)
        toast.success('Template saved')
        setAutoSaveStatus('saved')
        localStorage.removeItem(draftKey)
      } else {
        const r = await documentCenterService.createTemplate(payload)
        const newId = r.data?.data?._id
        toast.success('Template created')
        localStorage.removeItem(draftKey)
        if (newId) navigate(`/hrm/doc-center/quick/${newId}`, { replace: true })
      }
    } catch (err) {
      const detail = err?.response?.data?.detail || err?.message || 'Unknown error'
      toast.error(`Save failed: ${detail}`)
      console.error('[QuickBuilder] save error', err?.response?.data || err)
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
      if (layout === 'center')
        return `<div style="${base}display:flex;align-items:center;justify-content:center;gap:16px;">${logoHtml}${compHtml}</div>`
      if (layout === 'split_3') {
        const contactHtml = (h.company_email || h.company_phone || h.company_website)
          ? `<div style="line-height:1.4;text-align:right;font-size:${fs-1}px;color:${tc};">${[h.company_email,h.company_phone,h.company_website].filter(Boolean).map(v=>`<div>${v}</div>`).join('')}</div>`
          : ''
        return `<div style="${base}display:flex;align-items:center;justify-content:space-between;gap:12px;">${logoHtml}<div style="flex:1;text-align:center;">${compHtml}</div>${contactHtml}</div>`
      }
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

      {/* ── Main Layout ── independently scrolling panels */}
      <div className="flex flex-1 min-h-0" style={{ overflow: 'hidden' }}>

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

            {/* ── Section 4: Body Content ── keepMounted so editor never unmounts */}
            <Section id="body" title="Body Content" icon={AlignLeft}
              open={openSection === 'body'} onToggle={toggleSection} keepMounted>
              <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
                Use the toolbar for formatting. Insert HR fields below for dynamic content.
              </p>
              <BodyEditor editorRef={editorRef} onInput={handleEditorInput} initialHtml={bodyHtml} />
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

            {/* ── Section 9: Draft Management ── */}
            <Section id="drafts" title="Drafts" icon={Clock}
              open={openSection === 'drafts'} onToggle={toggleSection}>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Drafts auto-save every 30 seconds and on browser close.
              </p>
              <div className="flex gap-2 flex-wrap">
                <button onClick={saveDraft}
                  className="flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors hover:bg-violet-50 dark:hover:bg-violet-900/20"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-body)' }}>
                  Save Draft Now
                </button>
                <button onClick={() => {
                  const raw = localStorage.getItem(draftKey)
                  if (!raw) { toast.error('No draft found'); return }
                  try {
                    const draft = JSON.parse(raw)
                    restoreFromDraft(draft)
                    toast.success(`Draft restored from ${new Date(draft.savedAt).toLocaleString()}`)
                  } catch { toast.error('Failed to restore draft') }
                }}
                  className="flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors hover:bg-green-50 dark:hover:bg-green-900/20"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-body)' }}>
                  Restore Draft
                </button>
                <button onClick={() => {
                  localStorage.removeItem(draftKey)
                  toast.success('Draft deleted')
                }}
                  className="flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors hover:bg-red-50"
                  style={{ borderColor: '#fca5a5', color: '#ef4444' }}>
                  Delete Draft
                </button>
              </div>
              {(() => {
                try {
                  const raw = localStorage.getItem(draftKey)
                  if (!raw) return null
                  const d = JSON.parse(raw)
                  return <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    Last saved: {new Date(d.savedAt).toLocaleString()}
                  </p>
                } catch { return null }
              })()}
            </Section>

            {/* ── Section 10: Document Presets ── */}
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
          <div className="flex items-center gap-3 mb-5 self-start flex-shrink-0 flex-wrap">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Live Preview
              </span>
            </div>
          </div>

          <PaginatedDocPreview
            header={header} footer={footer} paper={paper} watermark={watermark}
            docTitle={docTitle} bodyHtml={bodyHtml} sigCfg={sigCfg}
            onBodyChange={(html) => {
              setBodyHtml(html)
              if (editorRef.current) editorRef.current.innerHTML = html
              scheduleAutoSave()
            }}
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
        [data-qb-master]:empty::before {
          content: attr(data-placeholder);
          color: #9ca3af; pointer-events: none; font-style: italic;
        }
        [data-qb-master]::-webkit-scrollbar { display: none; }
        [data-qb-master] { scrollbar-width: none; -ms-overflow-style: none; }
      `}</style>
    </div>
  )
}
