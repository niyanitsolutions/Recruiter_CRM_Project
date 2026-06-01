import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  Save, Eye, Wand2, Bold, Italic, Underline, Strikethrough,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, Link2, RotateCcw, RotateCw,
  Plus, Minus, Type, Palette, Table, Image as ImageIcon,
  ChevronDown, ChevronUp, Loader2, ArrowLeft, FileText,
  CheckSquare, Stamp,
} from 'lucide-react'
import documentCenterService from '../../../services/documentCenterService'

// ─── HR Field Definitions ──────────────────────────────────────────────────────
const HR_FIELDS = [
  { group: 'Employee',  label: 'Employee Name',     field: '{{employee_name}}' },
  { group: 'Employee',  label: 'Employee ID',        field: '{{employee_id}}' },
  { group: 'Employee',  label: 'Department',         field: '{{department}}' },
  { group: 'Employee',  label: 'Designation',        field: '{{designation}}' },
  { group: 'Employee',  label: 'Joining Date',       field: '{{joining_date}}' },
  { group: 'Employee',  label: 'Exit Date',          field: '{{exit_date}}' },
  { group: 'Employee',  label: 'Salary',             field: '{{salary}}' },
  { group: 'Employee',  label: 'Manager Name',       field: '{{manager_name}}' },
  { group: 'Employee',  label: 'Email',              field: '{{employee_email}}' },
  { group: 'Employee',  label: 'Address',            field: '{{employee_address}}' },
  { group: 'Employee',  label: 'Phone',              field: '{{employee_phone}}' },
  { group: 'Company',   label: 'Company Name',       field: '{{company_name}}' },
  { group: 'Company',   label: 'Company Address',    field: '{{company_address}}' },
  { group: 'Company',   label: 'Company Phone',      field: '{{company_phone}}' },
  { group: 'Company',   label: 'Company Email',      field: '{{company_email}}' },
  { group: 'Date',      label: 'Current Date',       field: '{{current_date}}' },
  { group: 'Date',      label: 'Month & Year',       field: '{{month_year}}' },
  { group: 'Payroll',   label: 'Basic Salary',       field: '{{basic}}' },
  { group: 'Payroll',   label: 'HRA',                field: '{{hra}}' },
  { group: 'Payroll',   label: 'Special Allowance',  field: '{{special_allowance}}' },
  { group: 'Payroll',   label: 'Gross Salary',       field: '{{gross}}' },
  { group: 'Payroll',   label: 'Provident Fund',     field: '{{pf}}' },
  { group: 'Payroll',   label: 'Professional Tax',   field: '{{pt}}' },
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

// ─── Shared sub-components ─────────────────────────────────────────────────────
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

const Panel = ({ title, children, defaultOpen = false }) => {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b" style={{ borderColor: 'var(--border)' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold uppercase tracking-wider"
        style={{ color: 'var(--text-muted)' }}
      >
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

// ─── Main Component ────────────────────────────────────────────────────────────
export default function QuickBuilder({ initialHtml, onSaved }) {
  const { id }    = useParams()
  const navigate  = useNavigate()
  const editorRef = useRef(null)
  const savedSel  = useRef(null)

  const [loading, setLoading]   = useState(!!id)
  const [saving,  setSaving]    = useState(false)
  const [preview, setPreview]   = useState(false)
  const [name,        setName]        = useState('Untitled Template')
  const [description, setDescription] = useState('')
  const [categoryId,  setCategoryId]  = useState('')
  const [tags,        setTags]        = useState('')
  const [categories,  setCategories]  = useState([])

  const [header, setHeader] = useState({
    show: true, company_name: '', company_address: '', company_email: '',
    company_phone: '', company_website: '', alignment: 'left',
    font_size: 12, font_color: '#000000', background_color: '#ffffff', border_bottom: true,
  })
  const [footer, setFooter] = useState({
    show: true, text: '', description: '', show_page_numbers: true,
    show_date: true, confidential_label: false,
    alignment: 'center', font_size: 10, font_color: '#666666', border_top: true,
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
      })
      .catch(() => toast.error('Failed to load template'))
      .finally(() => setLoading(false))
  }, [id, initialHtml])

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
  }
  const insertField = (field) => insertHtml(
    `<span class="doc-field" style="background:#ede9fe;color:#7c3aed;padding:1px 4px;border-radius:3px;font-family:monospace;font-size:0.85em;">${field}</span>`
  )
  const insertTable  = (key) => insertHtml(TABLE_TEMPLATES[key] || TABLE_TEMPLATES.custom3)
  const insertDivider = () => insertHtml('<hr style="border:none;border-top:2px solid #e5e7eb;margin:12px 0;" />')
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

  const getBodyHtml = () => editorRef.current?.innerHTML || ''
  const buildPayload = () => ({
    name,
    description,
    category_id: categoryId || null,
    template_type: 'simple',
    tags: tags.split(',').map(t => t.trim()).filter(Boolean),
    change_summary: id ? 'Updated via Quick Builder' : 'Created via Quick Builder',
    content: { header, body_html: getBodyHtml(), footer, paper, watermark, canvas_elements: [] },
    dynamic_fields: [...new Set([...getBodyHtml().matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]))],
  })

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Template name is required'); return }
    setSaving(true)
    try {
      if (id) {
        await documentCenterService.updateTemplate(id, buildPayload())
        toast.success('Template saved')
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
            onChange={e => setName(e.target.value)}
            className="bg-transparent border-none outline-none text-sm font-semibold w-full"
            style={{ color: 'var(--text-heading)' }}
            placeholder="Template Name"
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPreview(p => !p)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
              preview ? 'bg-violet-600 text-white border-violet-600' : ''
            }`}
            style={preview ? {} : { borderColor: 'var(--border)', color: 'var(--text-body)' }}
          >
            <Eye className="w-4 h-4" />
            {preview ? 'Edit' : 'Preview'}
          </button>
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

      <div className="flex flex-1 overflow-hidden">

        {/* ── Left panel ── */}
        <aside className="w-64 flex-shrink-0 border-r overflow-y-auto flex flex-col"
          style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>

          <Panel title="Template Info" defaultOpen>
            <div>
              <Lbl>Description</Lbl>
              <textarea value={description} onChange={e => setDescription(e.target.value)}
                rows={2} placeholder="Optional description…"
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
              <Lbl>Tags (comma separated)</Lbl>
              <Inp value={tags} onChange={e => setTags(e.target.value)} placeholder="HR, Offer, Legal…" />
            </div>
          </Panel>

          <Panel title="Header" defaultOpen>
            <Tog label="Show Header" checked={header.show} onChange={v => setHeader(h => ({ ...h, show: v }))} />
            {header.show && <>
              <div><Lbl>Company Name</Lbl><Inp value={header.company_name} onChange={e => setHeader(h => ({ ...h, company_name: e.target.value }))} placeholder="Acme Corp" /></div>
              <div><Lbl>Address</Lbl><Inp value={header.company_address} onChange={e => setHeader(h => ({ ...h, company_address: e.target.value }))} placeholder="123 Main St…" /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Lbl>Email</Lbl><Inp value={header.company_email} onChange={e => setHeader(h => ({ ...h, company_email: e.target.value }))} placeholder="hr@co.com" /></div>
                <div><Lbl>Phone</Lbl><Inp value={header.company_phone} onChange={e => setHeader(h => ({ ...h, company_phone: e.target.value }))} placeholder="+1 234…" /></div>
              </div>
              <div><Lbl>Website</Lbl><Inp value={header.company_website || ''} onChange={e => setHeader(h => ({ ...h, company_website: e.target.value }))} placeholder="www.company.com" /></div>
              <div><Lbl>Alignment</Lbl>
                <Sel value={header.alignment} onChange={e => setHeader(h => ({ ...h, alignment: e.target.value }))}>
                  <option value="left">Left</option>
                  <option value="center">Center</option>
                  <option value="right">Right</option>
                </Sel>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Lbl>Font Size</Lbl><Inp type="number" value={header.font_size} min={8} max={24} onChange={e => setHeader(h => ({ ...h, font_size: +e.target.value }))} /></div>
                <div><Lbl>Text Color</Lbl><input type="color" value={header.font_color} onChange={e => setHeader(h => ({ ...h, font_color: e.target.value }))} className="w-full h-8 rounded-lg border cursor-pointer" style={{ borderColor: 'var(--border)' }} /></div>
              </div>
              <Tog label="Border Bottom" checked={header.border_bottom} onChange={v => setHeader(h => ({ ...h, border_bottom: v }))} />
            </>}
          </Panel>

          <Panel title="Footer">
            <Tog label="Show Footer" checked={footer.show} onChange={v => setFooter(f => ({ ...f, show: v }))} />
            {footer.show && <>
              <div><Lbl>Footer Text</Lbl><Inp value={footer.text} onChange={e => setFooter(f => ({ ...f, text: e.target.value }))} placeholder="Company Confidential" /></div>
              <div><Lbl>Description</Lbl><Inp value={footer.description || ''} onChange={e => setFooter(f => ({ ...f, description: e.target.value }))} placeholder="Extra footer line…" /></div>
              <Tog label="Show Page Numbers"  checked={footer.show_page_numbers} onChange={v => setFooter(f => ({ ...f, show_page_numbers: v }))} />
              <Tog label="Show Current Date"  checked={footer.show_date}          onChange={v => setFooter(f => ({ ...f, show_date: v }))} />
              <Tog label="Confidential Label" checked={footer.confidential_label} onChange={v => setFooter(f => ({ ...f, confidential_label: v }))} />
            </>}
          </Panel>

          <Panel title="Paper Settings">
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
            <div className="grid grid-cols-2 gap-2">
              {['top','bottom','left','right'].map(s => (
                <div key={s}><Lbl>Margin {s.charAt(0).toUpperCase() + s.slice(1)} (pt)</Lbl>
                  <Inp type="number" value={paper[`margin_${s}`]} min={0} max={200}
                    onChange={e => setPaper(p => ({ ...p, [`margin_${s}`]: +e.target.value }))} />
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Watermark">
            <Tog label="Enable Watermark" checked={watermark.enabled} onChange={v => setWatermark(w => ({ ...w, enabled: v }))} />
            {watermark.enabled && <>
              <div>
                <Lbl>Preset</Lbl>
                <div className="flex flex-wrap gap-1">
                  {WATERMARK_PRESETS.map(p => (
                    <button key={p} type="button" onClick={() => setWatermark(w => ({ ...w, text: p }))}
                      className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                        watermark.text === p ? 'bg-violet-600 text-white border-violet-600' : ''
                      }`}
                      style={watermark.text !== p ? { borderColor: 'var(--border)', color: 'var(--text-body)' } : {}}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>
              <div><Lbl>Custom Text</Lbl><Inp value={watermark.text} onChange={e => setWatermark(w => ({ ...w, text: e.target.value }))} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Lbl>Opacity (0–1)</Lbl><Inp type="number" value={watermark.opacity} min={0.05} max={1} step={0.05} onChange={e => setWatermark(w => ({ ...w, opacity: +e.target.value }))} /></div>
                <div><Lbl>Rotation (°)</Lbl><Inp type="number" value={watermark.rotation} min={-180} max={180} onChange={e => setWatermark(w => ({ ...w, rotation: +e.target.value }))} /></div>
              </div>
            </>}
          </Panel>

          <Panel title="HR Fields" defaultOpen>
            <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>Click to insert into document</p>
            {Object.entries(fieldGroups).map(([group, fields]) => (
              <div key={group} className="mb-2">
                <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>{group}</p>
                <div className="flex flex-wrap gap-1">
                  {fields.map(f => (
                    <button key={f.field} type="button" onClick={() => insertField(f.field)}
                      className="text-[11px] px-2 py-0.5 rounded-full border font-mono transition-colors hover:bg-violet-600 hover:text-white hover:border-violet-600"
                      style={{ borderColor: 'var(--border)', color: 'var(--text-body)' }} title={f.field}>
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </Panel>

          <Panel title="Insert Table">
            <div className="space-y-1.5">
              {[
                { key: 'employee', label: 'Employee Info Table' },
                { key: 'salary',   label: 'Salary Slip Table' },
                { key: 'custom2',  label: '2-Column Table' },
                { key: 'custom3',  label: '3-Column Table' },
              ].map(t => (
                <button key={t.key} type="button" onClick={() => insertTable(t.key)}
                  className="w-full text-left text-xs px-3 py-2 rounded-lg border transition-colors hover:bg-violet-50 dark:hover:bg-violet-900/20 hover:border-violet-400 flex items-center gap-2"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-body)' }}>
                  <Table className="w-3.5 h-3.5 flex-shrink-0 text-violet-500" />
                  {t.label}
                </button>
              ))}
            </div>
          </Panel>

          <Panel title="Insert Element">
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
                <button key={el.label} type="button" onClick={el.fn}
                  className="text-xs px-2 py-1.5 rounded-lg border transition-colors text-center hover:bg-violet-50 dark:hover:bg-violet-900/20 hover:border-violet-400"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-body)' }}>
                  {el.label}
                </button>
              ))}
            </div>
          </Panel>
        </aside>

        {/* ── Center: Toolbar + Canvas ── */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Formatting toolbar */}
          {!preview && (
            <div className="flex items-center flex-wrap gap-1 px-3 py-1.5 border-b flex-shrink-0"
              style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
              <select className="text-xs px-1.5 py-1 rounded-lg border" defaultValue="Arial"
                style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)', color: 'var(--text-body)' }}
                onChange={e => exec('fontName', e.target.value)}>
                {FONT_FAMILIES.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
              <select className="text-xs px-1.5 py-1 rounded-lg border w-14" defaultValue="3"
                style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)', color: 'var(--text-body)' }}
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
                <input type="color" className="sr-only" onChange={e => exec('foreColor', e.target.value)} />
              </label>
              <label title="Highlight" className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer">
                <Type className="w-4 h-4" style={{ color: 'var(--text-body)' }} />
                <input type="color" className="sr-only" onChange={e => exec('backColor', e.target.value)} />
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
              <TB icon={Link2} label="Insert Link" onClick={() => { const u = prompt('URL:'); if (u) exec('createLink', u) }} />
            </div>
          )}

          {/* Document canvas */}
          <div className="flex-1 overflow-auto py-8 px-4" style={{ background: '#e5e7eb' }}>
            <div className="mx-auto shadow-2xl relative bg-white" style={{ width: paperW, minHeight: '297mm', fontFamily: 'Arial, sans-serif' }}>

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
                  textAlign: header.alignment, backgroundColor: header.background_color, color: header.font_color,
                  fontSize: header.font_size,
                }}>
                  {header.company_name && <div style={{ fontWeight: 'bold', fontSize: header.font_size + 2 }}>{header.company_name}</div>}
                  {header.company_address && <div style={{ fontSize: header.font_size - 1 }}>{header.company_address}</div>}
                  {(header.company_email || header.company_phone) && (
                    <div style={{ fontSize: header.font_size - 1, color: '#6b7280' }}>
                      {[header.company_email, header.company_phone].filter(Boolean).join('  |  ')}
                    </div>
                  )}
                  {header.company_website && <div style={{ fontSize: header.font_size - 1, color: '#6b7280' }}>{header.company_website}</div>}
                </div>
              )}

              {/* Body */}
              <div
                ref={editorRef}
                contentEditable={!preview}
                suppressContentEditableWarning
                onMouseUp={saveSelection}
                onKeyUp={saveSelection}
                className="focus:outline-none"
                style={{
                  paddingTop: mt, paddingBottom: mb, paddingLeft: ml, paddingRight: mr,
                  minHeight: '400px', fontSize: '12pt', lineHeight: 1.6, color: '#1f2937',
                  position: 'relative', zIndex: 2,
                }}
                data-placeholder={preview ? '' : 'Start typing your document content here…'}
              />

              {/* Footer */}
              {footer.show && (
                <div style={{
                  paddingLeft: ml, paddingRight: mr, paddingBottom: '12px', paddingTop: '8px',
                  borderTop: footer.border_top ? '1px solid #d1d5db' : 'none',
                  textAlign: footer.alignment, fontSize: footer.font_size, color: footer.font_color,
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <span style={{ fontSize: footer.font_size - 1 }}>
                    {footer.show_date ? new Date().toLocaleDateString('en-US', { year:'numeric',month:'long',day:'numeric' }) : ''}
                  </span>
                  <span>
                    {footer.text}{footer.confidential_label ? (footer.text ? '  |  CONFIDENTIAL' : 'CONFIDENTIAL') : ''}
                    {footer.description ? <><br /><span style={{ fontSize: footer.font_size - 2 }}>{footer.description}</span></> : null}
                  </span>
                  <span>{footer.show_page_numbers ? 'Page 1' : ''}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        [data-placeholder]:empty::before { content: attr(data-placeholder); color: #9ca3af; pointer-events: none; }
        .doc-field { display: inline; }
        blockquote { border-left: 4px solid #7c3aed; padding-left: 12px; color: #6b7280; margin: 8px 0; }
        table { border-collapse: collapse; width: 100%; }
        table td, table th { border: 1px solid #e5e7eb; padding: 6px 10px; }
      `}</style>
    </div>
  )
}
