import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  Save, Eye, Bold, Italic, Underline, Strikethrough,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, Link2, RotateCcw, RotateCw,
  Palette, Image as ImageIcon,
  ChevronDown, ChevronUp, Loader2, ArrowLeft, FileText,
  ZoomIn, ZoomOut, X, Download, Printer, Clock, CheckCircle,
  AlertCircle, Upload, Maximize2, Wand2, Type, Settings,
  PenLine, Building2, LayoutTemplate,
} from 'lucide-react'
import documentCenterService from '../../../services/documentCenterService'

// ─── Constants ─────────────────────────────────────────────────────────────────
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
  'Offer Letter', 'Experience Letter', 'Relieving Letter', 'Appointment Letter',
  'NDA', 'HR Policy', 'Payslip', 'Warning Letter',
  'Promotion Letter', 'Transfer Letter', 'Internship Letter', 'Other',
]

const FONT_FAMILIES = ['Arial', 'Times New Roman', 'Georgia', 'Courier New', 'Verdana', 'Trebuchet MS', 'Helvetica']
const WATERMARK_PRESETS = ['DRAFT', 'CONFIDENTIAL', 'INTERNAL', 'APPROVED', 'FOR YOUR EYES ONLY']

// ─── Shared atom components ────────────────────────────────────────────────────
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
  <label className="flex items-center gap-2 cursor-pointer">
    <div onClick={() => onChange(!checked)}
      className={`w-9 h-5 rounded-full transition-colors relative flex-shrink-0 ${checked ? 'bg-violet-600' : 'bg-gray-300 dark:bg-gray-600'}`}>
      <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
    </div>
    <span className="text-xs" style={{ color: 'var(--text-body)' }}>{label}</span>
  </label>
)

// ─── Accordion Section ─────────────────────────────────────────────────────────
function Section({ id, title, icon: Icon, open, onToggle, children, badge }) {
  return (
    <div className="border-b last:border-b-0" style={{ borderColor: 'var(--border)' }}>
      <button
        type="button"
        onClick={() => onToggle(id)}
        className="w-full flex items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-violet-50 dark:hover:bg-violet-900/10"
        style={{ background: open ? 'rgba(124,58,237,0.06)' : 'transparent' }}
      >
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
        {open
          ? <ChevronUp className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
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

// ─── Toolbar button (body editor) ──────────────────────────────────────────────
const TB = ({ icon: Icon, label, onClick }) => (
  <button type="button" title={label} onMouseDown={e => { e.preventDefault(); onClick() }}
    className="p-1.5 rounded transition-colors hover:bg-gray-200 dark:hover:bg-gray-600"
    style={{ color: 'var(--text-body)' }}>
    <Icon className="w-3.5 h-3.5" />
  </button>
)

// ─── Body Editor ───────────────────────────────────────────────────────────────
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

  const fieldGroups = HR_FIELDS.reduce((acc, f) => {
    if (!acc[f.group]) acc[f.group] = []
    acc[f.group].push(f)
    return acc
  }, {})

  return (
    <div className="border rounded-xl overflow-hidden" style={{ borderColor: 'var(--border)' }}>
      {/* Formatting toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b"
        style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
        <select className="text-xs px-1.5 py-1 rounded border mr-1"
          style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)', color: 'var(--text-body)' }}
          onMouseDown={saveSel}
          onChange={e => exec('fontName', e.target.value)}>
          {FONT_FAMILIES.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
        <select className="text-xs px-1.5 py-1 rounded border w-14 mr-1"
          style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)', color: 'var(--text-body)' }}
          defaultValue="3"
          onMouseDown={saveSel}
          onChange={e => exec('fontSize', e.target.value)}>
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
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={onInput}
        onMouseUp={saveSel}
        onKeyUp={saveSel}
        className="focus:outline-none px-4 py-3"
        style={{ minHeight: 220, maxHeight: 420, overflowY: 'auto', fontSize: '12pt', lineHeight: 1.7, color: '#1f2937', fontFamily: 'Arial, sans-serif' }}
        data-placeholder="Type your document body content here. Use HR fields below to insert dynamic placeholders like {{employee_name}}…"
      />

      {/* HR Field insert strip */}
      <div className="border-t px-3 py-2.5" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
        <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Insert HR Field</p>
        <div className="space-y-1.5">
          {Object.entries(fieldGroups).map(([group, fields]) => (
            <div key={group}>
              <p className="text-[9px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>{group}</p>
              <div className="flex flex-wrap gap-1">
                {fields.map(f => (
                  <button key={f.field} type="button"
                    onMouseDown={saveSel}
                    onClick={() => insertField(f.field)}
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

// ─── Live Preview ───────────────────────────────────────────────────────────────
function LivePreview({ header, footer, paper, watermark, docTitle, bodyHtml, sigCfg }) {
  const paperW = paper.size === 'A4' ? '210mm' : paper.size === 'letter' ? '216mm' : '216mm'
  const ml = `${(paper.margin_left || 72) / 72 * 25.4}mm`
  const mr = `${(paper.margin_right || 72) / 72 * 25.4}mm`
  const mt = `${(paper.margin_top  || 72) / 72 * 25.4}mm`
  const mb = `${(paper.margin_bottom || 72) / 72 * 25.4}mm`

  const titleHtml = docTitle?.text ? `<div style="
    text-align:${docTitle.alignment || 'center'};
    font-family:${docTitle.font_family || 'Arial'},sans-serif;
    font-size:${docTitle.font_size || 16}pt;
    color:${docTitle.color || '#111827'};
    font-weight:${docTitle.bold ? 'bold' : 'normal'};
    font-style:${docTitle.italic ? 'italic' : 'normal'};
    text-decoration:${docTitle.underline ? 'underline' : 'none'};
    margin:12px 0 14px;
  ">${docTitle.text}</div>` : ''

  let sigHtml = ''
  if (sigCfg?.enabled) {
    const pos = sigCfg.position || 'left'
    const imgPart = sigCfg.image_url
      ? `<img src="${sigCfg.image_url}" style="height:44px;margin-bottom:4px;display:block;${pos === 'right' ? 'margin-left:auto;' : pos === 'center' ? 'margin:0 auto;' : ''}" />`
      : ''
    sigHtml = `<table style="width:100%;margin:24px 0 0;border-collapse:collapse;">
      <tr>
        ${pos === 'right' ? '<td style="width:60%;"></td>' : ''}
        <td style="width:${pos === 'center' ? '100%' : '40%'};padding:0 8px;vertical-align:bottom;text-align:${pos === 'right' ? 'right' : pos === 'center' ? 'center' : 'left'};">
          ${imgPart}
          <div style="border-top:1.5px solid #374151;padding-top:5px;font-size:11px;color:#374151;line-height:1.5;">
            <strong>${sigCfg.authorized_person || 'Authorized Signatory'}</strong>
            ${sigCfg.designation ? `<br/><span style="color:#6b7280;">${sigCfg.designation}</span>` : ''}
            ${sigCfg.department  ? `<br/><span style="color:#6b7280;">${sigCfg.department}</span>`  : ''}
          </div>
        </td>
        ${pos === 'left' ? '<td style="width:60%;"></td>' : ''}
      </tr>
    </table>`
  }

  const bodyContent = bodyHtml || ''
  const hasContent  = titleHtml || bodyContent.trim().replace(/<br\s*\/?>/gi, '').replace(/<p>\s*<\/p>/gi, '').trim()

  return (
    <div className="bg-white shadow-2xl relative overflow-hidden"
      style={{ width: paperW, fontFamily: 'Arial, sans-serif', boxSizing: 'border-box', minHeight: '297mm' }}>

      {/* Watermark */}
      {watermark.enabled && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none', zIndex: 1,
          transform: `rotate(${watermark.rotation || -45}deg)`,
          fontSize: watermark.size || 72, opacity: watermark.opacity || 0.12,
          color: '#9ca3af', fontWeight: 'bold', userSelect: 'none',
        }}>
          {watermark.text || 'CONFIDENTIAL'}
        </div>
      )}

      {/* Header */}
      {header.show && (
        <div style={{
          padding: `${header.padding_top ?? 12}px ${header.padding_right ?? 16}px ${header.padding_bottom ?? 8}px ${header.padding_left ?? 16}px`,
          minHeight: `${header.header_height || 80}px`,
          borderBottom: header.border_bottom ? `${header.border_width ?? 1}px solid ${header.border_color || '#d1d5db'}` : 'none',
          textAlign: header.company_alignment || 'left',
          backgroundColor: header.background_color || '#fff',
          color: header.font_color || '#000',
          fontSize: header.font_size || 11,
          fontFamily: header.font_family || 'Arial',
          boxSizing: 'border-box', position: 'relative', zIndex: 2,
        }}>
          {header.logo_url && (
            <img src={header.logo_url} alt="Logo" style={{
              height: header.logo_height || 40, display: 'block',
              margin: (header.logo_alignment || 'left') === 'center' ? '0 auto 4px'
                    : (header.logo_alignment || 'left') === 'right'  ? '0 0 4px auto' : '0 0 4px 0',
            }} />
          )}
          {header.company_name    && <div style={{ fontWeight: 'bold', fontSize: (header.font_size || 11) + 2 }}>{header.company_name}</div>}
          {header.company_address && <div style={{ fontSize: (header.font_size || 11) - 1 }}>{header.company_address}</div>}
          {(header.company_email || header.company_phone) && (
            <div style={{ fontSize: (header.font_size || 11) - 1, color: '#6b7280' }}>
              {[header.company_email, header.company_phone].filter(Boolean).join('  |  ')}
            </div>
          )}
          {header.company_website && <div style={{ fontSize: (header.font_size || 11) - 1, color: '#6b7280' }}>{header.company_website}</div>}
          {(header.gst_number || header.reg_number) && (
            <div style={{ fontSize: (header.font_size || 11) - 2, color: '#9ca3af', marginTop: 2 }}>
              {[header.gst_number && `GST: ${header.gst_number}`, header.reg_number && `Reg: ${header.reg_number}`].filter(Boolean).join('  |  ')}
            </div>
          )}
        </div>
      )}

      {/* Body */}
      <div style={{ paddingTop: mt, paddingBottom: mb, paddingLeft: ml, paddingRight: mr, position: 'relative', zIndex: 2 }}>
        {hasContent
          ? <div dangerouslySetInnerHTML={{ __html: titleHtml + bodyContent + sigHtml }}
              style={{ fontSize: '12pt', lineHeight: 1.7, color: '#1f2937' }} />
          : <div style={{ color: '#9ca3af', fontStyle: 'italic', fontSize: '11pt', textAlign: 'center', paddingTop: 40 }}>
              Fill in the form on the left — your document preview will appear here.
            </div>
        }
      </div>

      {/* Footer */}
      {footer.show && (
        <div style={{
          padding: `${footer.padding_top ?? 8}px ${footer.padding_right ?? 16}px ${footer.padding_bottom ?? 12}px ${footer.padding_left ?? 16}px`,
          minHeight: `${footer.footer_height || 40}px`,
          borderTop: footer.border_top ? `${footer.border_width ?? 1}px solid ${footer.border_color || '#d1d5db'}` : 'none',
          fontSize: footer.font_size || 10, color: footer.font_color || '#666',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          boxSizing: 'border-box', position: 'relative', zIndex: 2,
        }}>
          <span>{footer.show_date ? new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : ''}</span>
          <span>{footer.text || ''}{footer.confidential_label ? (footer.text ? ' | CONFIDENTIAL' : 'CONFIDENTIAL') : ''}</span>
          <span>{footer.show_page_numbers ? 'Page 1' : ''}</span>
        </div>
      )}
    </div>
  )
}

// ─── Fullscreen Preview Modal ──────────────────────────────────────────────────
function PreviewModal({ onClose, children }) {
  const [zoom, setZoom] = useState(75)
  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'rgba(0,0,0,0.88)' }}>
      <div className="flex items-center gap-3 px-4 py-2.5 flex-shrink-0"
        style={{ background: '#1e1e2e', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <span className="text-white text-sm font-semibold flex-1">Document Preview</span>
        <button onClick={() => setZoom(z => Math.max(40, z - 10))} className="p-1.5 rounded text-white hover:bg-white/10"><ZoomOut className="w-4 h-4" /></button>
        <span className="text-white text-xs w-10 text-center">{zoom}%</span>
        <button onClick={() => setZoom(z => Math.min(150, z + 10))} className="p-1.5 rounded text-white hover:bg-white/10"><ZoomIn className="w-4 h-4" /></button>
        <button onClick={onClose} className="p-1.5 rounded text-white hover:bg-white/10"><X className="w-4 h-4" /></button>
      </div>
      <div className="flex-1 overflow-auto py-10 px-4 flex justify-center" style={{ background: '#2d2d3d' }}>
        <div style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top center', transition: 'transform 0.2s' }}>
          {children}
        </div>
      </div>
    </div>
  )
}

// ─── Main QuickBuilder ─────────────────────────────────────────────────────────
export default function QuickBuilder() {
  const { id }   = useParams()
  const navigate = useNavigate()
  const editorRef     = useRef(null)
  const autoSaveTimer = useRef(null)
  const exportRef     = useRef(null)
  // Keep latest state in a ref so auto-save always sees fresh values
  const latestRef = useRef({})

  const [loading,         setLoading]         = useState(!!id)
  const [saving,          setSaving]          = useState(false)
  const [showFullPreview, setShowFullPreview] = useState(false)
  const [showExport,      setShowExport]      = useState(false)
  const [openSection,     setOpenSection]     = useState('template-info')
  const [autoSaveStatus,  setAutoSaveStatus]  = useState('saved')
  const [categories,      setCategories]      = useState([])
  const [bodyHtml,        setBodyHtml]        = useState('')

  // ── Template metadata ──
  const [name,         setName]         = useState('Untitled Template')
  const [description,  setDescription]  = useState('')
  const [categoryId,   setCategoryId]   = useState('')
  const [tags,         setTags]         = useState('')
  const [templateType, setTemplateType] = useState('')

  // ── Document title ──
  const [docTitle, setDocTitle] = useState({
    text: '', font_family: 'Arial', font_size: 16,
    color: '#111827', alignment: 'center', bold: true, italic: false, underline: false,
  })

  // ── Header ──
  const [header, setHeader] = useState({
    show: true, logo_url: '', logo_height: 40, logo_alignment: 'left',
    company_alignment: 'left', header_height: 120,
    padding_top: 12, padding_right: 16, padding_bottom: 8, padding_left: 16,
    margin_top: 0, margin_right: 0, margin_bottom: 0, margin_left: 0,
    company_name: '', company_address: '', company_email: '',
    company_phone: '', company_website: '', gst_number: '', reg_number: '',
    font_family: 'Arial', font_size: 11, font_color: '#000000', background_color: '#ffffff',
    border_bottom: true, border_color: '#d1d5db', border_width: 1,
  })

  // ── Signature ──
  const [sigCfg, setSigCfg] = useState({
    enabled: false, type: 'text',
    authorized_person: '', designation: '', department: '',
    position: 'left', image_url: '',
  })

  // ── Footer ──
  const [footer, setFooter] = useState({
    show: true, text: '', description: '', show_page_numbers: true,
    show_date: true, confidential_label: false, footer_height: 60,
    padding_top: 8, padding_right: 16, padding_bottom: 12, padding_left: 16,
    margin_top: 0, margin_right: 0, margin_bottom: 0, margin_left: 0,
    alignment: 'center', font_size: 10, font_color: '#666666',
    border_top: true, border_color: '#d1d5db', border_width: 1,
  })

  // ── Paper ──
  const [paper, setPaper] = useState({
    size: 'A4', orientation: 'portrait',
    margin_top: 72, margin_bottom: 72, margin_left: 72, margin_right: 72,
  })

  // ── Watermark ──
  const [watermark, setWatermark] = useState({
    enabled: false, type: 'text', text: 'CONFIDENTIAL',
    opacity: 0.12, rotation: -45, size: 72,
  })

  const toggleSection = (key) => setOpenSection(k => k === key ? null : key)

  // Sync latest values into ref for auto-save
  useEffect(() => {
    latestRef.current = { id, name, description, categoryId, tags, header, footer, paper, watermark, docTitle, sigCfg }
  })

  // ── Load categories ──
  useEffect(() => {
    documentCenterService.listCategories().then(r => setCategories(r.data?.data || [])).catch(() => {})
  }, [])

  // ── Load existing template ──
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

  // ── Build payload ──
  const buildPayload = useCallback((summary, overrideHtml) => {
    const s = latestRef.current
    const html = overrideHtml ?? editorRef.current?.innerHTML ?? bodyHtml ?? ''
    return {
      name:          s.name,
      description:   s.description,
      category_id:   s.categoryId || null,
      template_type: 'simple',
      tags:          s.tags.split(',').map(t => t.trim()).filter(Boolean),
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

  // ── Auto-save ──
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

  // ── Body editor input ──
  const handleEditorInput = useCallback(() => {
    const html = editorRef.current?.innerHTML || ''
    setBodyHtml(html)
    scheduleAutoSave()
  }, [scheduleAutoSave])

  // ── Close export on outside click ──
  useEffect(() => {
    const fn = (e) => { if (exportRef.current && !exportRef.current.contains(e.target)) setShowExport(false) }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [])

  // ── Save ──
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

  // ── Logo upload ──
  const handleLogoUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { toast.error('Please select an image file'); return }
    if (file.size > 2 * 1024 * 1024) { toast.error('Logo must be under 2 MB'); return }
    const reader = new FileReader()
    reader.onload = ev => setHeader(h => ({ ...h, logo_url: ev.target.result }))
    reader.readAsDataURL(file)
  }

  // ── Signature image upload ──
  const handleSigImageUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setSigCfg(s => ({ ...s, image_url: ev.target.result }))
    reader.readAsDataURL(file)
  }

  // ── Build full HTML for export/print ──
  const buildFullHtml = useCallback(() => {
    const s = latestRef.current
    const html = editorRef.current?.innerHTML || bodyHtml || ''
    const ml = `${(s.paper.margin_left || 72) / 72 * 25.4}mm`
    const mr = `${(s.paper.margin_right || 72) / 72 * 25.4}mm`
    const mt = `${(s.paper.margin_top  || 72) / 72 * 25.4}mm`
    const mb = `${(s.paper.margin_bottom || 72) / 72 * 25.4}mm`
    const h = s.header
    const f = s.footer
    const dt = s.docTitle
    const sig = s.sigCfg

    const titleBlock = dt?.text ? `<div style="text-align:${dt.alignment};font-family:${dt.font_family},sans-serif;font-size:${dt.font_size}pt;color:${dt.color};font-weight:${dt.bold?'bold':'normal'};font-style:${dt.italic?'italic':'normal'};text-decoration:${dt.underline?'underline':'none'};margin:12px 0 14px;">${dt.text}</div>` : ''

    let sigBlock = ''
    if (sig?.enabled) {
      const pos = sig.position || 'left'
      const imgPart = sig.image_url ? `<img src="${sig.image_url}" style="height:44px;margin-bottom:4px;display:block;${pos==='right'?'margin-left:auto;':pos==='center'?'margin:0 auto;':''}" />` : ''
      sigBlock = `<table style="width:100%;margin:24px 0 0;border-collapse:collapse;"><tr>
        ${pos==='right'?'<td style="width:60%;"></td>':''}
        <td style="width:${pos==='center'?'100%':'40%'};padding:0 8px;vertical-align:bottom;text-align:${pos==='right'?'right':pos==='center'?'center':'left'};">
          ${imgPart}
          <div style="border-top:1.5px solid #374151;padding-top:5px;font-size:11px;line-height:1.5;">
            <strong>${sig.authorized_person||'Authorized Signatory'}</strong>
            ${sig.designation?`<br/><span style="color:#6b7280;">${sig.designation}</span>`:''}
            ${sig.department?`<br/><span style="color:#6b7280;">${sig.department}</span>`:''}
          </div>
        </td>
        ${pos==='left'?'<td style="width:60%;"></td>':''}
      </tr></table>`
    }

    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${s.name}</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;font-family:Arial,sans-serif;font-size:12pt;line-height:1.7;color:#1f2937}
  @page{size:${s.paper.size} ${s.paper.orientation};margin:${mt} ${mr} ${mb} ${ml}}
  table{border-collapse:collapse;width:100%}
  td,th{border:1px solid #e5e7eb;padding:6px 10px}
  th{background:#7c3aed;color:white}
  blockquote{border-left:4px solid #7c3aed;padding-left:12px;color:#6b7280;margin:8px 0}
</style></head><body>
${h.show ? `<div style="padding:${h.padding_top}px ${h.padding_right}px ${h.padding_bottom}px ${h.padding_left}px;min-height:${h.header_height}px;background:${h.background_color};color:${h.font_color};text-align:${h.company_alignment};border-bottom:${h.border_bottom?`${h.border_width}px solid ${h.border_color}`:'none'};font-family:${h.font_family},sans-serif;font-size:${h.font_size}px;">
  ${h.logo_url?`<img src="${h.logo_url}" style="height:${h.logo_height}px;display:block;margin:${h.logo_alignment==='center'?'0 auto 4px':h.logo_alignment==='right'?'0 0 4px auto':'0 0 4px 0'};" />`:''}
  ${h.company_name?`<div style="font-weight:bold;font-size:${h.font_size+2}px;">${h.company_name}</div>`:''}
  ${h.company_address?`<div style="font-size:${h.font_size-1}px;">${h.company_address}</div>`:''}
  ${(h.company_email||h.company_phone)?`<div style="font-size:${h.font_size-1}px;color:#6b7280;">${[h.company_email,h.company_phone].filter(Boolean).join(' | ')}</div>`:''}
  ${h.company_website?`<div style="font-size:${h.font_size-1}px;color:#6b7280;">${h.company_website}</div>`:''}
</div>` : ''}
<div style="padding:${mt} ${mr} ${mb} ${ml};">${titleBlock}${html}${sigBlock}</div>
${f.show ? `<div style="padding:${f.padding_top}px ${f.padding_right}px ${f.padding_bottom}px ${f.padding_left}px;border-top:${f.border_top?`${f.border_width}px solid ${f.border_color}`:'none'};font-size:${f.font_size}px;color:${f.font_color};display:flex;justify-content:space-between;align-items:center;min-height:${f.footer_height}px;">
  <span>${f.show_date?new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'}):''}</span>
  <span>${f.text||''}${f.confidential_label?' | CONFIDENTIAL':''}</span>
  <span>${f.show_page_numbers?'Page 1':''}</span>
</div>` : ''}
</body></html>`
  }, [bodyHtml])

  // ── Export handlers ──
  const handleExportPDF = () => {
    setShowExport(false)
    const w = window.open('', '_blank')
    w.document.write(buildFullHtml())
    w.document.close(); w.focus()
    toast.success('Print dialog opening — select "Save as PDF"')
    setTimeout(() => { w.print(); w.close() }, 500)
  }
  const handleExportHTML = () => {
    setShowExport(false)
    const blob = new Blob([buildFullHtml()], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `${name||'document'}.html`; a.click()
    URL.revokeObjectURL(url)
  }
  const handleExportTXT = () => {
    setShowExport(false)
    const txt = (editorRef.current?.innerText || '').trim()
    const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `${name||'document'}.txt`; a.click()
    URL.revokeObjectURL(url)
  }
  const handlePrint = () => {
    setShowExport(false)
    const w = window.open('', '_blank')
    w.document.write(buildFullHtml())
    w.document.close(); w.focus()
    setTimeout(() => { w.print(); w.close() }, 400)
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
        window.open(documentCenterService.downloadDOCX(genId), '_blank')
        toast.success('DOCX ready', { id: toastId })
      }
    } catch { toast.error('DOCX export failed', { id: toastId }) }
  }

  // ── Auto-save status indicator ──
  const AutoSaveIcon = autoSaveStatus === 'saved' ? CheckCircle
    : autoSaveStatus === 'saving' ? Loader2
    : autoSaveStatus === 'error'  ? AlertCircle : Clock
  const autoSaveColor = { saved: 'text-green-500', saving: 'text-gray-400', unsaved: 'text-amber-400', error: 'text-red-400' }[autoSaveStatus]
  const autoSaveLabel = { saved: 'Saved', saving: 'Saving…', unsaved: 'Unsaved', error: 'Error' }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 animate-spin text-violet-600" />
    </div>
  )

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-primary)' }}>

      {/* ── Top Bar ── */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b flex-shrink-0"
        style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>

        <button onClick={() => navigate('/hrm/doc-center/templates')}
          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex-shrink-0" title="Back">
          <ArrowLeft className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
        </button>

        {/* Template name inline edit */}
        <input value={name}
          onChange={e => { setName(e.target.value); scheduleAutoSave() }}
          className="bg-transparent border-none outline-none text-sm font-semibold flex-1 min-w-0"
          style={{ color: 'var(--text-heading)' }}
          placeholder="Template Name" />

        {/* Auto-save status */}
        {id && (
          <div className={`flex items-center gap-1 text-xs flex-shrink-0 ${autoSaveColor}`}>
            <AutoSaveIcon className={`w-3 h-3 ${autoSaveStatus === 'saving' ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{autoSaveLabel[autoSaveStatus]}</span>
          </div>
        )}

        {/* Preview */}
        <button onClick={() => setShowFullPreview(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors flex-shrink-0"
          style={{ borderColor: 'var(--border)', color: 'var(--text-body)' }}>
          <Maximize2 className="w-4 h-4" />
          <span className="hidden md:inline">Preview</span>
        </button>

        {/* Export dropdown */}
        <div className="relative flex-shrink-0" ref={exportRef}>
          <button onClick={() => setShowExport(v => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors"
            style={{ borderColor: 'var(--border)', color: 'var(--text-body)' }}>
            <Download className="w-4 h-4" />
            <span className="hidden md:inline">Export</span>
            <ChevronDown className="w-3 h-3" />
          </button>
          {showExport && (
            <div className="absolute right-0 top-full mt-1 z-50 rounded-xl border shadow-xl overflow-hidden"
              style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', minWidth: 160 }}>
              {[
                { label: 'Export PDF',  fn: handleExportPDF  },
                { label: 'Export DOCX', fn: handleExportDOCX },
                { label: 'Export HTML', fn: handleExportHTML },
                { label: 'Export TXT',  fn: handleExportTXT  },
                { label: 'Print',       fn: handlePrint       },
              ].map(item => (
                <button key={item.label} onClick={item.fn}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors text-left"
                  style={{ color: 'var(--text-body)' }}>
                  <FileText className="w-3.5 h-3.5 text-violet-500" />
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Generate */}
        {id && (
          <button onClick={() => navigate(`/hrm/doc-center/generated?tmpl=${id}`)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors flex-shrink-0"
            style={{ borderColor: 'var(--border)', color: 'var(--text-body)' }}>
            <Wand2 className="w-4 h-4" />
            <span className="hidden md:inline">Generate</span>
          </button>
        )}

        {/* Save */}
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-semibold text-white flex-shrink-0 disabled:opacity-60"
          style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      {/* ── Main Layout: Form + Preview ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left: Accordion Form Wizard ── */}
        <div className="flex-shrink-0 overflow-y-auto border-r"
          style={{ width: 420, background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>

          {/* Wizard header */}
          <div className="flex items-center gap-3 px-5 py-3 border-b"
            style={{ borderColor: 'var(--border)' }}>
            <div className="w-7 h-7 rounded-lg bg-violet-600 flex items-center justify-center flex-shrink-0">
              <LayoutTemplate className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold" style={{ color: 'var(--text-heading)' }}>Quick Builder</p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Fill the form — preview updates live</p>
            </div>
          </div>

          {/* ── Section 1: Template Info ── */}
          <Section id="template-info" title="Template Info" icon={FileText}
            open={openSection === 'template-info'} onToggle={toggleSection}>
            <div>
              <Lbl>Template Name *</Lbl>
              <Inp value={name}
                onChange={e => { setName(e.target.value); scheduleAutoSave() }}
                placeholder="e.g. Offer Letter 2025" />
            </div>
            <div>
              <Lbl>Description</Lbl>
              <textarea value={description}
                onChange={e => { setDescription(e.target.value); scheduleAutoSave() }}
                rows={2} placeholder="Brief description of this template…"
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
              <Lbl>Template Type</Lbl>
              <Sel value={templateType} onChange={e => setTemplateType(e.target.value)}>
                <option value="">— Select Type —</option>
                {TEMPLATE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </Sel>
            </div>
            <div>
              <Lbl>Tags (comma separated)</Lbl>
              <Inp value={tags}
                onChange={e => { setTags(e.target.value); scheduleAutoSave() }}
                placeholder="HR, Offer, Legal…" />
            </div>
          </Section>

          {/* ── Section 2: Header ── */}
          <Section id="header" title="Header" icon={Building2}
            open={openSection === 'header'} onToggle={toggleSection}
            badge={header.show ? 'ON' : 'OFF'}>
            <Tog label="Show Header" checked={header.show} onChange={v => setHeader(h => ({ ...h, show: v }))} />
            {header.show && <>
              {/* Logo */}
              <div>
                <Lbl>Company Logo</Lbl>
                {header.logo_url ? (
                  <div className="flex items-center gap-3">
                    <img src={header.logo_url} alt="Logo"
                      style={{ height: 36, maxWidth: 120, objectFit: 'contain', borderRadius: 4, border: '1px solid var(--border)' }} />
                    <button onClick={() => setHeader(h => ({ ...h, logo_url: '' }))}
                      className="text-xs text-red-500 hover:text-red-700 transition-colors">Remove</button>
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
              <div className="grid grid-cols-2 gap-2">
                <div><Lbl>Logo Height (px)</Lbl>
                  <Inp type="number" value={header.logo_height || 40} min={20} max={120}
                    onChange={e => setHeader(h => ({ ...h, logo_height: +e.target.value }))} />
                </div>
                <div><Lbl>Logo Alignment</Lbl>
                  <Sel value={header.logo_alignment || 'left'} onChange={e => setHeader(h => ({ ...h, logo_alignment: e.target.value }))}>
                    <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
                  </Sel>
                </div>
              </div>
              <div><Lbl>Company Name</Lbl>
                <Inp value={header.company_name} onChange={e => setHeader(h => ({ ...h, company_name: e.target.value }))} placeholder="Acme Corp Pvt Ltd" />
              </div>
              <div><Lbl>Company Address</Lbl>
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
                <div><Lbl>Font Family</Lbl>
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
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Padding (px)</p>
              <div className="grid grid-cols-4 gap-1">
                {['top','right','bottom','left'].map(s => (
                  <div key={s}><p className="text-[9px] text-center mb-0.5" style={{ color: 'var(--text-muted)' }}>{s[0].toUpperCase()}</p>
                    <Inp type="number" value={header[`padding_${s}`] ?? 12} min={0} max={80}
                      onChange={e => setHeader(h => ({ ...h, [`padding_${s}`]: +e.target.value }))} />
                  </div>
                ))}
              </div>
              <Tog label="Show Border Bottom" checked={header.border_bottom} onChange={v => setHeader(h => ({ ...h, border_bottom: v }))} />
            </>}
          </Section>

          {/* ── Section 3: Document Title ── */}
          <Section id="doc-title" title="Document Title" icon={Type}
            open={openSection === 'doc-title'} onToggle={toggleSection}>
            <div>
              <Lbl>Title Text</Lbl>
              <Inp value={docTitle.text}
                onChange={e => setDocTitle(d => ({ ...d, text: e.target.value }))}
                placeholder="e.g. OFFER LETTER" />
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
              Use the toolbar for formatting. Click any HR field chip to insert a dynamic placeholder.
            </p>
            <BodyEditor editorRef={editorRef} onInput={handleEditorInput} />
          </Section>

          {/* ── Section 5: Signature ── */}
          <Section id="signature" title="Signature" icon={PenLine}
            open={openSection === 'signature'} onToggle={toggleSection}
            badge={sigCfg.enabled ? 'ON' : 'OFF'}>
            <Tog label="Add Signature Block" checked={sigCfg.enabled} onChange={v => setSigCfg(s => ({ ...s, enabled: v }))} />
            {sigCfg.enabled && <>
              <div>
                <Lbl>Signature Type</Lbl>
                <div className="flex gap-2">
                  {['text', 'upload'].map(t => (
                    <button key={t} type="button"
                      onClick={() => setSigCfg(s => ({ ...s, type: t }))}
                      className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors ${sigCfg.type === t ? 'bg-violet-600 text-white border-violet-600' : ''}`}
                      style={sigCfg.type !== t ? { borderColor: 'var(--border)', color: 'var(--text-body)' } : {}}>
                      {t === 'text' ? 'Text Line' : 'Upload Image'}
                    </button>
                  ))}
                </div>
              </div>
              {sigCfg.type === 'upload' && (
                <div>
                  <Lbl>Signature Image</Lbl>
                  {sigCfg.image_url ? (
                    <div className="flex items-center gap-3">
                      <img src={sigCfg.image_url} alt="Signature"
                        style={{ height: 40, maxWidth: 120, objectFit: 'contain', border: '1px solid var(--border)', borderRadius: 4 }} />
                      <button onClick={() => setSigCfg(s => ({ ...s, image_url: '' }))}
                        className="text-xs text-red-500 hover:text-red-700 transition-colors">Remove</button>
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
              <div><Lbl>Authorized Person</Lbl>
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
                <Sel value={footer.footer_height || 60} onChange={e => setFooter(f => ({ ...f, footer_height: +e.target.value }))}>
                  {[40,50,60,80,100].map(v => <option key={v} value={v}>{v}px</option>)}
                </Sel>
              </div>
              <div className="space-y-2">
                <Tog label="Show Page Numbers"  checked={footer.show_page_numbers}  onChange={v => setFooter(f => ({ ...f, show_page_numbers: v }))} />
                <Tog label="Show Date"          checked={footer.show_date}          onChange={v => setFooter(f => ({ ...f, show_date: v }))} />
                <Tog label="Confidential Label" checked={footer.confidential_label} onChange={v => setFooter(f => ({ ...f, confidential_label: v }))} />
                <Tog label="Show Border Top"    checked={footer.border_top}         onChange={v => setFooter(f => ({ ...f, border_top: v }))} />
              </div>
            </>}
          </Section>

          {/* ── Section 7: Watermark ── */}
          <Section id="watermark" title="Watermark" icon={Settings}
            open={openSection === 'watermark'} onToggle={toggleSection}
            badge={watermark.enabled ? 'ON' : 'OFF'}>
            <Tog label="Enable Watermark" checked={watermark.enabled} onChange={v => setWatermark(w => ({ ...w, enabled: v }))} />
            {watermark.enabled && <>
              <div>
                <Lbl>Preset</Lbl>
                <div className="flex flex-wrap gap-1">
                  {WATERMARK_PRESETS.map(p => (
                    <button key={p} type="button"
                      onClick={() => setWatermark(w => ({ ...w, text: p }))}
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
              <div className="grid grid-cols-3 gap-2">
                <div><Lbl>Opacity</Lbl>
                  <Inp type="number" value={watermark.opacity} min={0.05} max={1} step={0.05}
                    onChange={e => setWatermark(w => ({ ...w, opacity: +e.target.value }))} />
                </div>
                <div><Lbl>Rotation (°)</Lbl>
                  <Inp type="number" value={watermark.rotation} min={-180} max={180}
                    onChange={e => setWatermark(w => ({ ...w, rotation: +e.target.value }))} />
                </div>
                <div><Lbl>Size (px)</Lbl>
                  <Inp type="number" value={watermark.size || 72} min={20} max={200}
                    onChange={e => setWatermark(w => ({ ...w, size: +e.target.value }))} />
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

        </div>{/* end left panel */}

        {/* ── Right: Live Preview ── */}
        <div className="flex-1 overflow-auto py-8 px-6 flex flex-col items-center" style={{ background: '#e5e7eb' }}>
          {/* Live indicator */}
          <div className="flex items-center gap-2 mb-5 self-start">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Live Preview</span>
          </div>

          <LivePreview
            header={header}
            footer={footer}
            paper={paper}
            watermark={watermark}
            docTitle={docTitle}
            bodyHtml={bodyHtml}
            sigCfg={sigCfg}
          />
        </div>

      </div>{/* end main layout */}

      {/* ── Fullscreen Preview Modal ── */}
      {showFullPreview && (
        <PreviewModal onClose={() => setShowFullPreview(false)}>
          <LivePreview
            header={header} footer={footer} paper={paper} watermark={watermark}
            docTitle={docTitle} bodyHtml={bodyHtml} sigCfg={sigCfg}
          />
        </PreviewModal>
      )}

      <style>{`
        [data-placeholder]:empty::before {
          content: attr(data-placeholder);
          color: #9ca3af;
          pointer-events: none;
          font-style: italic;
        }
      `}</style>
    </div>
  )
}
