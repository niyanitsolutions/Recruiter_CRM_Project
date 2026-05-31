import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  Save, Eye, Download, Send, ChevronDown, ChevronUp,
  Bold, Italic, Underline, Strikethrough, AlignLeft, AlignCenter,
  AlignRight, AlignJustify, List, ListOrdered, Table, Image, Link2,
  Type, Palette, Minus, Plus, Settings, FileText, Hash,
  RotateCcw, RotateCw, Wand2, X, Check, Loader2, Code,
} from 'lucide-react'
import documentCenterService from '../../../services/documentCenterService'

// ─── Dynamic HR field definitions ─────────────────────────────────────────────
const HR_FIELDS = [
  { label: 'Employee Name',    field: '{{employee_name}}',    group: 'Employee' },
  { label: 'Employee ID',      field: '{{employee_id}}',      group: 'Employee' },
  { label: 'Department',       field: '{{department}}',       group: 'Employee' },
  { label: 'Designation',      field: '{{designation}}',      group: 'Employee' },
  { label: 'Salary',           field: '{{salary}}',           group: 'Employee' },
  { label: 'Joining Date',     field: '{{joining_date}}',     group: 'Employee' },
  { label: 'Exit Date',        field: '{{exit_date}}',        group: 'Employee' },
  { label: 'Manager Name',     field: '{{manager_name}}',     group: 'Employee' },
  { label: 'Employee Email',   field: '{{employee_email}}',   group: 'Employee' },
  { label: 'Employee Address', field: '{{employee_address}}', group: 'Employee' },
  { label: 'Employee Phone',   field: '{{employee_phone}}',   group: 'Employee' },
  { label: 'Company Name',     field: '{{company_name}}',     group: 'Company' },
  { label: 'Current Date',     field: '{{current_date}}',     group: 'Date' },
  { label: 'Month & Year',     field: '{{month_year}}',       group: 'Date' },
  // Payroll
  { label: 'Basic Salary',     field: '{{basic}}',            group: 'Payroll' },
  { label: 'HRA',              field: '{{hra}}',              group: 'Payroll' },
  { label: 'Gross Salary',     field: '{{gross}}',            group: 'Payroll' },
  { label: 'Net Salary',       field: '{{net_salary}}',       group: 'Payroll' },
  { label: 'Total Deductions', field: '{{total_deductions}}', group: 'Payroll' },
]

const FONT_FAMILIES = ['Arial', 'Times New Roman', 'Courier New', 'Georgia', 'Verdana', 'Helvetica', 'Trebuchet MS']
const FONT_SIZES    = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72]

const TABLE_TEMPLATES = {
  employee: `<table border="1" style="width:100%;border-collapse:collapse;">
  <tr><th style="background:#7c3aed;color:white;padding:8px;">Field</th><th style="background:#7c3aed;color:white;padding:8px;">Value</th></tr>
  <tr><td style="padding:8px;">Employee Name</td><td style="padding:8px;">{{employee_name}}</td></tr>
  <tr><td style="padding:8px;">Employee ID</td><td style="padding:8px;">{{employee_id}}</td></tr>
  <tr><td style="padding:8px;">Department</td><td style="padding:8px;">{{department}}</td></tr>
  <tr><td style="padding:8px;">Designation</td><td style="padding:8px;">{{designation}}</td></tr>
  <tr><td style="padding:8px;">Joining Date</td><td style="padding:8px;">{{joining_date}}</td></tr>
</table>`,
  salary: `<table border="1" style="width:100%;border-collapse:collapse;">
  <tr><th style="background:#7c3aed;color:white;padding:8px;">Component</th><th style="background:#7c3aed;color:white;padding:8px;">Amount</th></tr>
  <tr><td style="padding:8px;">Basic Salary</td><td style="padding:8px;">{{basic}}</td></tr>
  <tr><td style="padding:8px;">HRA</td><td style="padding:8px;">{{hra}}</td></tr>
  <tr><td style="padding:8px;">Gross Salary</td><td style="padding:8px;font-weight:bold;">{{gross}}</td></tr>
  <tr><td style="padding:8px;">Total Deductions</td><td style="padding:8px;">{{total_deductions}}</td></tr>
  <tr><td style="padding:8px;font-weight:bold;">Net Pay</td><td style="padding:8px;font-weight:bold;">{{net_salary}}</td></tr>
</table>`,
  custom: `<table border="1" style="width:100%;border-collapse:collapse;">
  <tr><th style="background:#7c3aed;color:white;padding:8px;">Column 1</th><th style="background:#7c3aed;color:white;padding:8px;">Column 2</th><th style="background:#7c3aed;color:white;padding:8px;">Column 3</th></tr>
  <tr><td style="padding:8px;">&nbsp;</td><td style="padding:8px;">&nbsp;</td><td style="padding:8px;">&nbsp;</td></tr>
  <tr><td style="padding:8px;">&nbsp;</td><td style="padding:8px;">&nbsp;</td><td style="padding:8px;">&nbsp;</td></tr>
</table>`,
}

// ─── Toolbar button ────────────────────────────────────────────────────────────
const TB = ({ icon: Icon, label, active, onClick, disabled }) => (
  <button
    type="button"
    title={label}
    disabled={disabled}
    onClick={onClick}
    className={`p-1.5 rounded transition-colors flex-shrink-0 ${
      active
        ? 'bg-violet-600 text-white'
        : 'hover:bg-gray-100 dark:hover:bg-gray-700'
    } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
    style={{ color: active ? undefined : 'var(--text-body)' }}
  >
    <Icon className="w-4 h-4" />
  </button>
)

// ─── Section panel (collapsible) ──────────────────────────────────────────────
const Panel = ({ title, children, defaultOpen = false }) => {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border rounded-lg overflow-hidden mb-3" style={{ borderColor: 'var(--border)' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium"
        style={{ background: 'var(--bg-secondary)', color: 'var(--text-heading)' }}
      >
        {title}
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      {open && (
        <div className="p-3 space-y-2" style={{ background: 'var(--bg-primary)' }}>
          {children}
        </div>
      )}
    </div>
  )
}

const Label = ({ children }) => (
  <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>{children}</p>
)

const Input = ({ ...props }) => (
  <input
    {...props}
    className="w-full px-2 py-1.5 text-sm rounded border focus:outline-none focus:ring-1 focus:ring-violet-500"
    style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)', color: 'var(--text-body)' }}
  />
)

const Select = ({ children, ...props }) => (
  <select
    {...props}
    className="w-full px-2 py-1.5 text-sm rounded border focus:outline-none focus:ring-1 focus:ring-violet-500"
    style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)', color: 'var(--text-body)' }}
  >
    {children}
  </select>
)

const Toggle = ({ label, checked, onChange }) => (
  <label className="flex items-center gap-2 cursor-pointer">
    <div
      onClick={() => onChange(!checked)}
      className={`w-9 h-5 rounded-full transition-colors relative ${checked ? 'bg-violet-600' : 'bg-gray-300'}`}
    >
      <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
    </div>
    <span className="text-xs" style={{ color: 'var(--text-body)' }}>{label}</span>
  </label>
)

// ─── Main Component ────────────────────────────────────────────────────────────
export default function TemplateBuilder() {
  const { id }     = useParams()
  const navigate   = useNavigate()
  const editorRef  = useRef(null)
  const savedSel   = useRef(null)

  const [loading,  setLoading]  = useState(!!id)
  const [saving,   setSaving]   = useState(false)
  const [preview,  setPreview]  = useState(false)
  const [activePanel, setActivePanel] = useState('fields') // fields | table | paper | watermark | header | footer

  // Template metadata
  const [name,        setName]        = useState('Untitled Template')
  const [description, setDescription] = useState('')
  const [categoryId,  setCategoryId]  = useState('')
  const [tags,        setTags]        = useState('')
  const [categories,  setCategories]  = useState([])

  // Header config
  const [header, setHeader] = useState({
    show: true, company_name: '', company_address: '', company_email: '',
    company_phone: '', alignment: 'left', font_size: 12,
    font_color: '#000000', background_color: '#ffffff', border_bottom: true,
  })

  // Footer config
  const [footer, setFooter] = useState({
    show: true, text: '', show_page_numbers: true, show_date: true,
    confidential_label: false, alignment: 'center', font_size: 10,
    font_color: '#666666', border_top: true,
  })

  // Paper settings
  const [paper, setPaper] = useState({
    size: 'A4', orientation: 'portrait',
    margin_top: 72, margin_bottom: 72, margin_left: 72, margin_right: 72,
  })

  // Watermark
  const [watermark, setWatermark] = useState({
    enabled: false, type: 'text', text: 'CONFIDENTIAL',
    opacity: 0.15, rotation: -45, size: 72,
  })

  // Load categories & existing template
  useEffect(() => {
    documentCenterService.listCategories().then(r => setCategories(r.data?.data || [])).catch(() => {})

    if (id) {
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
    }
  }, [id])

  // Exec formatting command
  const exec = useCallback((cmd, value = null) => {
    editorRef.current?.focus()
    document.execCommand(cmd, false, value)
  }, [])

  // Save selection before panel interaction
  const saveSelection = () => {
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0) savedSel.current = sel.getRangeAt(0).cloneRange()
  }

  const restoreSelection = () => {
    if (!savedSel.current) return
    const sel = window.getSelection()
    sel.removeAllRanges()
    sel.addRange(savedSel.current)
  }

  const insertHtml = (html) => {
    editorRef.current?.focus()
    restoreSelection()
    document.execCommand('insertHTML', false, html)
  }

  const insertField = (field) => {
    const highlighted = `<span class="doc-field" style="background:#ede9fe;color:#7c3aed;padding:2px 4px;border-radius:3px;font-family:monospace;font-size:0.85em;">${field}</span>`
    insertHtml(highlighted)
  }

  const insertTable = (type) => {
    insertHtml(TABLE_TEMPLATES[type] || TABLE_TEMPLATES.custom)
  }

  const insertDivider = () => insertHtml('<hr style="border:none;border-top:2px solid #e5e7eb;margin:16px 0;" />')
  const insertPageBreak = () => insertHtml('<div style="page-break-after:always;border-top:2px dashed #e5e7eb;margin:16px 0;text-align:center;color:#9ca3af;font-size:12px;padding:4px 0;">— Page Break —</div>')

  const getBodyHtml = () => editorRef.current?.innerHTML || ''

  const buildPayload = () => ({
    name,
    description,
    category_id: categoryId || null,
    template_type: 'simple',
    tags: tags.split(',').map(t => t.trim()).filter(Boolean),
    change_summary: 'Updated via Template Builder',
    content: {
      header,
      body_html: getBodyHtml(),
      footer,
      paper,
      watermark,
      canvas_elements: [],
    },
    dynamic_fields: [...new Set(
      [...getBodyHtml().matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1])
    )],
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
        if (newId) navigate(`/hrm/doc-center/builder/${newId}`, { replace: true })
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

  // ─── Paper dimensions for preview ──
  const paperW = paper.orientation === 'landscape' ? '297mm' : '210mm'
  const paperH = paper.orientation === 'landscape' ? '210mm' : '297mm'
  const ml = paper.margin_left / 72 * 25.4 + 'mm'
  const mr = paper.margin_right / 72 * 25.4 + 'mm'
  const mt = paper.margin_top / 72 * 25.4 + 'mm'
  const mb = paper.margin_bottom / 72 * 25.4 + 'mm'

  // ─── Group HR fields ─────────────────────────────────────────────────────────
  const fieldGroups = HR_FIELDS.reduce((acc, f) => {
    if (!acc[f.group]) acc[f.group] = []
    acc[f.group].push(f)
    return acc
  }, {})

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-primary)' }}>

      {/* ── Top bar ── */}
      <div
        className="flex items-center gap-3 px-4 py-2.5 border-b flex-shrink-0"
        style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
      >
        <div className="flex-1 min-w-0">
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            className="bg-transparent border-none outline-none text-base font-semibold w-full"
            style={{ color: 'var(--text-heading)' }}
            placeholder="Template Name"
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPreview(p => !p)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
              preview ? 'bg-violet-600 text-white border-violet-600' : ''
            }`}
            style={preview ? {} : { borderColor: 'var(--border)', color: 'var(--text-body)' }}
          >
            <Eye className="w-4 h-4" />
            {preview ? 'Edit' : 'Preview'}
          </button>
          {id && (
            <button
              onClick={() => navigate(`/hrm/doc-center/generated?template_id=${id}`)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors"
              style={{ borderColor: 'var(--border)', color: 'var(--text-body)' }}
            >
              <Wand2 className="w-4 h-4" />
              Generate Doc
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-semibold text-white transition-colors"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">

        {/* ── Left panel: Right-click tools ── */}
        <aside
          className="w-64 flex-shrink-0 border-r overflow-y-auto flex flex-col"
          style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
        >
          <div className="p-3">
            {/* Metadata */}
            <Panel title="Template Info" defaultOpen>
              <div>
                <Label>Description</Label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  rows={2}
                  className="w-full px-2 py-1.5 text-sm rounded border resize-none"
                  style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)', color: 'var(--text-body)' }}
                  placeholder="Template description…"
                />
              </div>
              <div>
                <Label>Category</Label>
                <Select value={categoryId} onChange={e => setCategoryId(e.target.value)}>
                  <option value="">— No Category —</option>
                  {categories.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
                </Select>
              </div>
              <div>
                <Label>Tags (comma separated)</Label>
                <Input value={tags} onChange={e => setTags(e.target.value)} placeholder="e.g. HR, Offer, Legal" />
              </div>
            </Panel>

            {/* Dynamic HR fields */}
            <Panel title="Dynamic HR Fields" defaultOpen>
              <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
                Click to insert a field placeholder into the document.
              </p>
              {Object.entries(fieldGroups).map(([group, fields]) => (
                <div key={group} className="mb-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>{group}</p>
                  <div className="flex flex-wrap gap-1">
                    {fields.map(f => (
                      <button
                        key={f.field}
                        type="button"
                        onClick={() => insertField(f.field)}
                        className="text-[11px] px-2 py-0.5 rounded-full border font-mono transition-colors hover:bg-violet-600 hover:text-white hover:border-violet-600"
                        style={{ borderColor: 'var(--border)', color: 'var(--text-body)' }}
                        title={f.field}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </Panel>

            {/* Table insertion */}
            <Panel title="Insert Table">
              <div className="space-y-1">
                {[
                  { key: 'employee', label: 'Employee Table' },
                  { key: 'salary',   label: 'Salary Table' },
                  { key: 'custom',   label: 'Custom Table (3×3)' },
                ].map(t => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => insertTable(t.key)}
                    className="w-full text-left text-sm px-3 py-1.5 rounded-lg border transition-colors hover:bg-violet-50 hover:border-violet-400"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-body)' }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </Panel>

            {/* Visual elements */}
            <Panel title="Insert Element">
              <div className="grid grid-cols-2 gap-1">
                {[
                  { label: 'Divider', fn: insertDivider },
                  { label: 'Page Break', fn: insertPageBreak },
                  { label: 'Heading 1', fn: () => exec('formatBlock', 'h1') },
                  { label: 'Heading 2', fn: () => exec('formatBlock', 'h2') },
                  { label: 'Heading 3', fn: () => exec('formatBlock', 'h3') },
                  { label: 'Paragraph',  fn: () => exec('formatBlock', 'p') },
                  { label: 'Quote',      fn: () => exec('formatBlock', 'blockquote') },
                ].map(el => (
                  <button
                    key={el.label}
                    type="button"
                    onClick={el.fn}
                    className="text-xs px-2 py-1.5 rounded border transition-colors text-center hover:bg-violet-50 hover:border-violet-400"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-body)' }}
                  >
                    {el.label}
                  </button>
                ))}
              </div>
            </Panel>

            {/* Header settings */}
            <Panel title="Header">
              <Toggle label="Show Header" checked={header.show} onChange={v => setHeader(h => ({ ...h, show: v }))} />
              <div>
                <Label>Company Name</Label>
                <Input value={header.company_name} onChange={e => setHeader(h => ({ ...h, company_name: e.target.value }))} placeholder="Acme Corp" />
              </div>
              <div>
                <Label>Address</Label>
                <Input value={header.company_address} onChange={e => setHeader(h => ({ ...h, company_address: e.target.value }))} placeholder="123 Main St, City" />
              </div>
              <div>
                <Label>Email</Label>
                <Input value={header.company_email} onChange={e => setHeader(h => ({ ...h, company_email: e.target.value }))} placeholder="hr@company.com" />
              </div>
              <div>
                <Label>Phone</Label>
                <Input value={header.company_phone} onChange={e => setHeader(h => ({ ...h, company_phone: e.target.value }))} placeholder="+1 234 567 890" />
              </div>
              <div>
                <Label>Alignment</Label>
                <Select value={header.alignment} onChange={e => setHeader(h => ({ ...h, alignment: e.target.value }))}>
                  <option value="left">Left</option>
                  <option value="center">Center</option>
                  <option value="right">Right</option>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Font Size</Label>
                  <Input type="number" value={header.font_size} min={8} max={24}
                    onChange={e => setHeader(h => ({ ...h, font_size: +e.target.value }))} />
                </div>
                <div>
                  <Label>Text Color</Label>
                  <input type="color" value={header.font_color}
                    onChange={e => setHeader(h => ({ ...h, font_color: e.target.value }))}
                    className="w-full h-8 rounded border cursor-pointer" style={{ borderColor: 'var(--border)' }} />
                </div>
              </div>
              <Toggle label="Border Bottom" checked={header.border_bottom} onChange={v => setHeader(h => ({ ...h, border_bottom: v }))} />
            </Panel>

            {/* Footer settings */}
            <Panel title="Footer">
              <Toggle label="Show Footer" checked={footer.show} onChange={v => setFooter(f => ({ ...f, show: v }))} />
              <div>
                <Label>Footer Text</Label>
                <Input value={footer.text} onChange={e => setFooter(f => ({ ...f, text: e.target.value }))} placeholder="Company confidential" />
              </div>
              <Toggle label="Show Page Numbers"   checked={footer.show_page_numbers}  onChange={v => setFooter(f => ({ ...f, show_page_numbers: v }))} />
              <Toggle label="Show Current Date"   checked={footer.show_date}           onChange={v => setFooter(f => ({ ...f, show_date: v }))} />
              <Toggle label="Confidential Label"  checked={footer.confidential_label}  onChange={v => setFooter(f => ({ ...f, confidential_label: v }))} />
            </Panel>

            {/* Paper settings */}
            <Panel title="Paper Settings">
              <div>
                <Label>Size</Label>
                <Select value={paper.size} onChange={e => setPaper(p => ({ ...p, size: e.target.value }))}>
                  <option value="A4">A4</option>
                  <option value="letter">Letter</option>
                  <option value="legal">Legal</option>
                </Select>
              </div>
              <div>
                <Label>Orientation</Label>
                <Select value={paper.orientation} onChange={e => setPaper(p => ({ ...p, orientation: e.target.value }))}>
                  <option value="portrait">Portrait</option>
                  <option value="landscape">Landscape</option>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {['top','bottom','left','right'].map(side => (
                  <div key={side}>
                    <Label>Margin {side.charAt(0).toUpperCase() + side.slice(1)} (pt)</Label>
                    <Input type="number" value={paper[`margin_${side}`]} min={0} max={200}
                      onChange={e => setPaper(p => ({ ...p, [`margin_${side}`]: +e.target.value }))} />
                  </div>
                ))}
              </div>
            </Panel>

            {/* Watermark */}
            <Panel title="Watermark">
              <Toggle label="Enable Watermark" checked={watermark.enabled} onChange={v => setWatermark(w => ({ ...w, enabled: v }))} />
              {watermark.enabled && <>
                <div>
                  <Label>Text</Label>
                  <Input value={watermark.text} onChange={e => setWatermark(w => ({ ...w, text: e.target.value }))} placeholder="CONFIDENTIAL" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label>Opacity (0–1)</Label>
                    <Input type="number" value={watermark.opacity} min={0.05} max={1} step={0.05}
                      onChange={e => setWatermark(w => ({ ...w, opacity: +e.target.value }))} />
                  </div>
                  <div>
                    <Label>Rotation (°)</Label>
                    <Input type="number" value={watermark.rotation} min={-180} max={180}
                      onChange={e => setWatermark(w => ({ ...w, rotation: +e.target.value }))} />
                  </div>
                </div>
                <div>
                  <Label>Font Size (pt)</Label>
                  <Input type="number" value={watermark.size} min={24} max={200}
                    onChange={e => setWatermark(w => ({ ...w, size: +e.target.value }))} />
                </div>
              </>}
            </Panel>
          </div>
        </aside>

        {/* ── Center: Formatting toolbar + Document canvas ── */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Formatting toolbar */}
          {!preview && (
            <div
              className="flex items-center flex-wrap gap-1 px-3 py-1.5 border-b flex-shrink-0"
              style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
            >
              {/* Font family */}
              <select
                className="text-xs px-1.5 py-1 rounded border"
                style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)', color: 'var(--text-body)' }}
                onChange={e => exec('fontName', e.target.value)}
                defaultValue="Arial"
              >
                {FONT_FAMILIES.map(f => <option key={f} value={f}>{f}</option>)}
              </select>

              {/* Font size */}
              <select
                className="text-xs px-1.5 py-1 rounded border w-14"
                style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)', color: 'var(--text-body)' }}
                onChange={e => exec('fontSize', e.target.value)}
                defaultValue="3"
              >
                {[1,2,3,4,5,6,7].map(s => <option key={s} value={s}>{[8,10,12,14,18,24,36][s-1]}px</option>)}
              </select>

              <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-0.5" />

              <TB icon={Bold}          label="Bold"          onClick={() => exec('bold')} />
              <TB icon={Italic}        label="Italic"        onClick={() => exec('italic')} />
              <TB icon={Underline}     label="Underline"     onClick={() => exec('underline')} />
              <TB icon={Strikethrough} label="Strikethrough" onClick={() => exec('strikeThrough')} />

              <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-0.5" />

              {/* Text color */}
              <label title="Text Color" className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer">
                <Palette className="w-4 h-4" style={{ color: 'var(--text-body)' }} />
                <input type="color" className="sr-only" onChange={e => exec('foreColor', e.target.value)} />
              </label>

              {/* Background color */}
              <label title="Highlight Color" className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer">
                <Type className="w-4 h-4" style={{ color: 'var(--text-body)' }} />
                <input type="color" className="sr-only" onChange={e => exec('backColor', e.target.value)} />
              </label>

              <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-0.5" />

              <TB icon={AlignLeft}    label="Align Left"    onClick={() => exec('justifyLeft')} />
              <TB icon={AlignCenter}  label="Align Center"  onClick={() => exec('justifyCenter')} />
              <TB icon={AlignRight}   label="Align Right"   onClick={() => exec('justifyRight')} />
              <TB icon={AlignJustify} label="Justify"       onClick={() => exec('justifyFull')} />

              <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-0.5" />

              <TB icon={List}        label="Bullet List"   onClick={() => exec('insertUnorderedList')} />
              <TB icon={ListOrdered} label="Numbered List" onClick={() => exec('insertOrderedList')} />

              <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-0.5" />

              <TB icon={RotateCcw} label="Undo" onClick={() => exec('undo')} />
              <TB icon={RotateCw}  label="Redo" onClick={() => exec('redo')} />

              <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-0.5" />

              {/* Indent */}
              <TB icon={Plus}  label="Indent"   onClick={() => exec('indent')} />
              <TB icon={Minus} label="Outdent"  onClick={() => exec('outdent')} />

              {/* Link */}
              <TB
                icon={Link2}
                label="Insert Link"
                onClick={() => {
                  const url = prompt('Enter URL:')
                  if (url) exec('createLink', url)
                }}
              />
            </div>
          )}

          {/* Document canvas */}
          <div
            className="flex-1 overflow-auto py-6 px-4"
            style={{ background: '#e5e7eb' }}
          >
            {/* Paper */}
            <div
              className="mx-auto shadow-2xl relative"
              style={{
                width: paperW,
                minHeight: paperH,
                background: 'white',
                fontFamily: 'Arial, sans-serif',
              }}
            >
              {/* Watermark overlay (preview only) */}
              {watermark.enabled && (
                <div
                  style={{
                    position: 'absolute', inset: 0, display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    pointerEvents: 'none', zIndex: 1,
                    transform: `rotate(${watermark.rotation}deg)`,
                    fontSize: watermark.size,
                    opacity: watermark.opacity,
                    color: '#999',
                    fontWeight: 'bold',
                    userSelect: 'none',
                  }}
                >
                  {watermark.text}
                </div>
              )}

              {/* Header */}
              {header.show && (
                <div
                  style={{
                    paddingLeft: ml, paddingRight: mr, paddingTop: '12px',
                    borderBottom: header.border_bottom ? '1px solid #d1d5db' : 'none',
                    paddingBottom: '8px',
                    textAlign: header.alignment,
                    backgroundColor: header.background_color,
                    color: header.font_color,
                    fontSize: header.font_size,
                  }}
                >
                  {header.company_name && <div style={{ fontWeight: 'bold', fontSize: header.font_size + 2 }}>{header.company_name}</div>}
                  {header.company_address && <div style={{ fontSize: header.font_size - 1 }}>{header.company_address}</div>}
                  {(header.company_email || header.company_phone) && (
                    <div style={{ fontSize: header.font_size - 1, color: '#6b7280' }}>
                      {header.company_email}{header.company_email && header.company_phone ? '  |  ' : ''}{header.company_phone}
                    </div>
                  )}
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
                  paddingTop: mt,
                  paddingBottom: mb,
                  paddingLeft: ml,
                  paddingRight: mr,
                  minHeight: '400px',
                  fontSize: '12pt',
                  lineHeight: 1.6,
                  color: '#1f2937',
                  position: 'relative',
                  zIndex: 2,
                }}
                data-placeholder={preview ? '' : 'Start typing your document content here…'}
              />

              {/* Footer */}
              {footer.show && (
                <div
                  style={{
                    paddingLeft: ml, paddingRight: mr, paddingBottom: '12px',
                    borderTop: footer.border_top ? '1px solid #d1d5db' : 'none',
                    paddingTop: '8px',
                    textAlign: footer.alignment,
                    fontSize: footer.font_size,
                    color: footer.font_color,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <span>{footer.show_date ? new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : ''}</span>
                  <span>{footer.text}{footer.confidential_label ? (footer.text ? '  |  CONFIDENTIAL' : 'CONFIDENTIAL') : ''}</span>
                  <span>{footer.show_page_numbers ? 'Page 1' : ''}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        [data-placeholder]:empty:before {
          content: attr(data-placeholder);
          color: #9ca3af;
          pointer-events: none;
        }
        .doc-field {
          display: inline;
          background: #ede9fe;
          color: #7c3aed;
          padding: 2px 4px;
          border-radius: 3px;
          font-family: monospace;
          font-size: 0.85em;
        }
        blockquote {
          border-left: 4px solid #7c3aed;
          padding-left: 12px;
          color: #6b7280;
          margin: 8px 0;
        }
        table { border-collapse: collapse; }
        table td, table th { border: 1px solid #e5e7eb; padding: 6px 10px; }
      `}</style>
    </div>
  )
}
