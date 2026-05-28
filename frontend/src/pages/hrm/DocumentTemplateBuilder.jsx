import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  Save, ArrowLeft, Eye, EyeOff, Undo, Redo, Plus, Trash2, GripVertical,
  Type, Heading, Table, Image, PenTool, Minus, AlignLeft, AlignCenter,
  AlignRight, Bold, Italic, Underline, ChevronDown, ChevronRight,
  Settings, Code, Layers, Copy, ZoomIn, ZoomOut, Maximize2, X,
  FileText, Hash, DollarSign, Users, Building, Calendar, RotateCcw,
  CheckCircle, AlertTriangle, Clock, Layout
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
  { group: 'Content',    items: [
    { type: 'heading',   label: 'Heading',    icon: Heading,  desc: 'Section heading' },
    { type: 'text',      label: 'Text Block', icon: Type,     desc: 'Rich text paragraph' },
    { type: 'paragraph', label: 'Paragraph',  icon: AlignLeft, desc: 'Body paragraph' },
    { type: 'list_items', label: 'List',      icon: Hash,     desc: 'Bulleted list' },
    { type: 'two_column', label: '2 Columns', icon: Layout,   desc: 'Side by side' },
  ]},
  { group: 'Structure',  items: [
    { type: 'divider',   label: 'Divider',    icon: Minus,    desc: 'Horizontal rule' },
    { type: 'spacer',    label: 'Spacer',     icon: AlignLeft, desc: 'Blank space' },
    { type: 'page_break', label: 'Page Break', icon: FileText, desc: 'Force new page' },
  ]},
  { group: 'Data',       items: [
    { type: 'table',         label: 'Table',          icon: Table,      desc: 'Custom data table' },
    { type: 'salary_table',  label: 'Salary Table',   icon: DollarSign, desc: 'Earnings & deductions' },
    { type: 'employee_details', label: 'Employee Block', icon: Users,   desc: 'Employee info grid' },
    { type: 'company_details',  label: 'Company Block',  icon: Building, desc: 'Company info grid' },
  ]},
  { group: 'Media',      items: [
    { type: 'image',     label: 'Image',      icon: Image,    desc: 'Insert image' },
    { type: 'logo',      label: 'Logo',       icon: Image,    desc: 'Company logo' },
    { type: 'signature', label: 'Signature',  icon: PenTool,  desc: 'Signature field' },
    { type: 'qr_code',   label: 'QR Code',    icon: Code,     desc: 'Verification QR' },
  ]},
]

const PLACEHOLDER_GROUPS = {
  'Candidate': [
    'candidate_name', 'candidate_email', 'candidate_phone', 'position',
    'department', 'joining_date', 'salary_ctc', 'location',
    'offer_expiry_date', 'probation_period', 'work_mode', 'shift', 'bonus',
  ],
  'Employee': [
    'employee_name', 'employee_id', 'employee_email', 'designation',
    'department', 'employment_type', 'date_of_joining', 'bank_account', 'uan_number',
  ],
  'Company': [
    'company_name', 'company_address', 'company_phone',
    'company_email', 'company_website', 'company_gst',
  ],
  'Payroll': [
    'payroll_month', 'payroll_year', 'salary_basic', 'salary_hra',
    'salary_special', 'salary_gross', 'deduct_pf', 'deduct_pt',
    'deduct_tds', 'total_deductions', 'salary_net',
    'working_days', 'present_days', 'lop_days',
  ],
  'HR': [
    'leave_type', 'leave_from', 'leave_to', 'leave_days', 'approved_by',
    'increment_amount', 'increment_percent', 'old_salary', 'new_salary',
    'effective_date', 'reporting_manager',
  ],
  'Dates': ['date_today', 'date_formatted', 'current_month', 'current_year', 'document_number'],
}

const FONTS = ['Helvetica', 'Arial', 'Georgia', 'Times New Roman', 'Courier New', 'Verdana', 'Calibri']
const COLORS_PRESET = ['#000000', '#1e3a5f', '#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ffffff', '#f1f5f9', '#e2e8f0']

const uuid = () => Math.random().toString(36).slice(2, 10)

// ─── Default block factory ────────────────────────────────────────────────────

const createBlock = (type) => {
  const base = { id: uuid(), type, order: 0, is_locked: false, condition: null,
    properties: { margin_top: 6, margin_bottom: 6, text_align: 'left', font_size: 11 } }
  const defaults = {
    heading:    { content: 'Section Heading', properties: { ...base.properties, font_size: 18, font_weight: 'bold', text_align: 'center' } },
    text:       { content: 'Enter your text here. Use placeholders like <b>{{employee_name}}</b> to insert dynamic values.' },
    paragraph:  { content: 'This is a paragraph. You can write any content here and use dynamic placeholders.' },
    list_items: { content: ['First item', 'Second item', 'Third item'] },
    two_column: { content: { left: 'Left column content', right: 'Right column content' } },
    divider:    { content: '', properties: { ...base.properties, color: '#e2e8f0' } },
    spacer:     { content: '', properties: { ...base.properties, height: '20px' } },
    page_break: { content: '' },
    table:      { content: {
      headers: ['Column 1', 'Column 2', 'Column 3'],
      rows: [['Data 1', 'Data 2', 'Data 3'], ['Data 4', 'Data 5', 'Data 6']],
      has_header: true, border_style: 'full', header_bg: '#1e3a5f', header_color: '#ffffff', stripe_rows: true
    }},
    salary_table: { content: {
      earnings: [
        { label: 'Basic Salary', key: 'salary_basic', value: '{{salary_basic}}' },
        { label: 'HRA', key: 'salary_hra', value: '{{salary_hra}}' },
        { label: 'Special Allowance', key: 'salary_special', value: '{{salary_special}}' },
        { label: 'Bonus', key: 'salary_bonus', value: '{{salary_bonus}}' },
      ],
      deductions: [
        { label: 'PF (Employee)', key: 'deduct_pf', value: '{{deduct_pf}}' },
        { label: 'Professional Tax', key: 'deduct_pt', value: '{{deduct_pt}}' },
        { label: 'TDS', key: 'deduct_tds', value: '{{deduct_tds}}' },
      ]
    }},
    employee_details: { content: { 'Employee Name': '{{employee_name}}', 'Employee ID': '{{employee_id}}', 'Designation': '{{designation}}', 'Department': '{{department}}', 'Date of Joining': '{{date_of_joining}}' } },
    company_details:  { content: { 'Company': '{{company_name}}', 'Address': '{{company_address}}', 'Phone': '{{company_phone}}', 'Email': '{{company_email}}' } },
    image:      { content: '', properties: { ...base.properties, width: '200px', text_align: 'center' } },
    logo:       { content: '', properties: { ...base.properties, width: '120px', text_align: 'center' } },
    signature:  { content: { label: 'Authorized Signatory', name: '', designation: '', position: 'left' } },
    qr_code:    { content: 'https://verify.example.com/{{document_number}}' },
  }
  return { ...base, ...defaults[type], order: Date.now() }
}

// ─── Block Renderer (Canvas) ──────────────────────────────────────────────────

function BlockPreview({ block, selected, onSelect, onDelete, onDuplicate, branding, dragHandleProps }) {
  const primary = branding?.primary_color || '#1e3a5f'
  const textColor = branding?.text_color || '#1a1a1a'
  const headingColor = branding?.heading_color || '#1e3a5f'
  const fontFamily = branding?.font_family || 'Arial, sans-serif'
  const props = block.properties || {}

  const baseStyle = {
    fontFamily,
    fontSize: `${props.font_size || 11}pt`,
    color: props.color || textColor,
    textAlign: props.text_align || 'left',
    marginTop: `${props.margin_top || 0}px`,
    marginBottom: `${props.margin_bottom || 0}px`,
    backgroundColor: props.background_color || 'transparent',
    fontWeight: props.font_weight || 'normal',
    fontStyle: props.font_style || 'normal',
    lineHeight: props.line_height || 1.5,
  }

  const renderContent = () => {
    const c = block.content
    switch (block.type) {
      case 'heading':
        return <div style={{ ...baseStyle, color: headingColor, fontWeight: 'bold' }} dangerouslySetInnerHTML={{ __html: c || 'Heading' }} />
      case 'text': case 'paragraph':
        return <div style={baseStyle} dangerouslySetInnerHTML={{ __html: c || 'Text block' }} />
      case 'list_items':
        return <ul style={{ ...baseStyle, paddingLeft: '20px', listStyleType: 'disc' }}>
          {(Array.isArray(c) ? c : [c]).map((item, i) => <li key={i}>{item}</li>)}
        </ul>
      case 'two_column':
        return <div style={{ display: 'flex', gap: '16px' }}>
          <div style={{ flex: 1, fontSize: '10pt', padding: '8px', borderLeft: `3px solid ${primary}` }}
            dangerouslySetInnerHTML={{ __html: c?.left || 'Left column' }} />
          <div style={{ flex: 1, fontSize: '10pt', padding: '8px', borderLeft: `3px solid ${primary}` }}
            dangerouslySetInnerHTML={{ __html: c?.right || 'Right column' }} />
        </div>
      case 'divider':
        return <hr style={{ border: 'none', borderTop: `1px solid ${props.color || '#e2e8f0'}` }} />
      case 'spacer':
        return <div style={{ height: props.height || '20px', background: 'repeating-linear-gradient(45deg,#f0f0f0,#f0f0f0 2px,transparent 2px,transparent 8px)' }} />
      case 'page_break':
        return <div style={{ textAlign: 'center', padding: '8px', background: '#fef3c7', border: '1px dashed #f59e0b', borderRadius: '4px', fontSize: '10px', color: '#92400e' }}>── Page Break ──</div>
      case 'table': {
        const headers = c?.headers || []
        const rows = c?.rows || []
        return (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9pt' }}>
            {headers.length > 0 && (
              <thead>
                <tr>{headers.map((h, i) => <th key={i} style={{ background: c?.header_bg || primary, color: c?.header_color || '#fff', padding: '5px 8px', textAlign: 'left', fontSize: '9pt' }}>{h}</th>)}</tr>
              </thead>
            )}
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri} style={{ background: ri % 2 === 0 ? '#f8f9fa' : '#fff' }}>
                  {row.map((cell, ci) => <td key={ci} style={{ padding: '4px 8px', border: '1px solid #e5e7eb', fontSize: '9pt' }}>{cell}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        )
      }
      case 'salary_table': {
        const earnings = c?.earnings || []
        const deductions = c?.deductions || []
        return (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9pt' }}>
            <thead>
              <tr>
                {['Earnings', 'Amount', 'Deductions', 'Amount'].map((h, i) => (
                  <th key={i} style={{ background: primary, color: '#fff', padding: '5px 8px', textAlign: 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: Math.max(earnings.length, deductions.length) }).map((_, i) => (
                <tr key={i}>
                  <td style={{ padding: '4px 8px', borderBottom: '1px solid #e5e7eb' }}>{earnings[i]?.label || ''}</td>
                  <td style={{ padding: '4px 8px', borderBottom: '1px solid #e5e7eb' }}>{earnings[i]?.value || ''}</td>
                  <td style={{ padding: '4px 8px', borderBottom: '1px solid #e5e7eb' }}>{deductions[i]?.label || ''}</td>
                  <td style={{ padding: '4px 8px', borderBottom: '1px solid #e5e7eb' }}>{deductions[i]?.value || ''}</td>
                </tr>
              ))}
              <tr style={{ background: primary, color: '#fff', fontWeight: 'bold' }}>
                <td colSpan={2} style={{ padding: '6px 8px' }}>Net Pay</td>
                <td colSpan={2} style={{ padding: '6px 8px' }}>{{salary_net}}</td>
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
                  <td style={{ padding: '4px 8px', borderBottom: '1px solid #e5e7eb' }}>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      case 'signature': {
        const sc = Array.isArray(c) ? c : [c || {}]
        return (
          <div style={{ display: 'flex', gap: '24px', marginTop: '8px' }}>
            {sc.map((sig, i) => (
              <div key={i} style={{ textAlign: 'center', minWidth: '120px' }}>
                <div style={{ height: '36px', borderBottom: '1px solid #333', width: '100px', margin: '0 auto 4px' }} />
                <div style={{ fontSize: '9pt', fontWeight: 'bold' }}>{sig?.name || sig?.label || 'Signature'}</div>
                <div style={{ fontSize: '8pt', color: '#666' }}>{sig?.designation || ''}</div>
              </div>
            ))}
          </div>
        )
      }
      case 'image': case 'logo':
        return c
          ? <div style={{ textAlign: props.text_align || 'center' }}><img src={c} alt="" style={{ maxWidth: props.width || '200px', maxHeight: '80px', objectFit: 'contain' }} /></div>
          : <div style={{ background: '#f1f5f9', border: '2px dashed #94a3b8', borderRadius: '6px', padding: '20px', textAlign: 'center', fontSize: '10px', color: '#94a3b8' }}>Image placeholder</div>
      case 'qr_code':
        return <div style={{ border: '1px solid #e2e8f0', padding: '8px', display: 'inline-block', borderRadius: '6px', fontSize: '9pt', color: '#666' }}>
          <div style={{ width: '60px', height: '60px', background: `repeating-conic-gradient(#1e3a5f 0%, #1e3a5f 25%, white 0%, white 50%) 0 / 6px 6px`, margin: '0 auto 4px', borderRadius: '3px' }} />
          <div style={{ textAlign: 'center', fontSize: '7pt' }}>Verification QR</div>
        </div>
      default:
        return <div style={baseStyle}>{typeof c === 'string' ? c : JSON.stringify(c)}</div>
    }
  }

  return (
    <div
      onClick={() => onSelect(block.id)}
      className={`relative group rounded-lg transition-all cursor-pointer ${selected ? 'ring-2' : 'hover:ring-1 hover:ring-blue-300'}`}
      style={{
        padding: '8px',
        background: selected ? '#eff6ff' : 'transparent',
        ring: selected ? 'var(--accent-blue)' : undefined,
        outline: selected ? '2px solid var(--accent-blue)' : 'none',
      }}
    >
      {/* Drag handle + actions */}
      <div className={`absolute -left-7 top-1/2 -translate-y-1/2 flex items-center gap-1 transition-opacity ${selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
        <div {...dragHandleProps} className="cursor-grab p-1 rounded hover:bg-gray-200">
          <GripVertical size={12} style={{ color: '#94a3b8' }} />
        </div>
      </div>
      <div className={`absolute -right-1 -top-1 flex gap-1 transition-opacity ${selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
        <button onClick={e => { e.stopPropagation(); onDuplicate(block.id) }}
          className="w-5 h-5 rounded bg-blue-500 text-white flex items-center justify-center hover:bg-blue-600 z-10">
          <Copy size={9} />
        </button>
        <button onClick={e => { e.stopPropagation(); onDelete(block.id) }}
          className="w-5 h-5 rounded bg-red-500 text-white flex items-center justify-center hover:bg-red-600 z-10">
          <X size={9} />
        </button>
      </div>

      {renderContent()}
    </div>
  )
}

// ─── Properties Panel ─────────────────────────────────────────────────────────

function PropertiesPanel({ block, onChange, branding, onBrandingChange, templateMeta, onMetaChange }) {
  if (!block) {
    // Show template-level settings
    return (
      <div className="p-4 space-y-4">
        <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Template Settings</h3>
        <div>
          <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>Primary Color</label>
          <div className="flex gap-2 flex-wrap">
            {['#1e3a5f','#2563eb','#10b981','#f59e0b','#ef4444','#8b5cf6','#0ea5e9','#374151'].map(c => (
              <button key={c} onClick={() => onBrandingChange('primary_color', c)}
                className="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110"
                style={{ background: c, borderColor: branding?.primary_color === c ? '#fff' : 'transparent', outline: branding?.primary_color === c ? `2px solid ${c}` : 'none' }} />
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>Font Family</label>
          <select value={branding?.font_family || 'Helvetica'}
            onChange={e => onBrandingChange('font_family', e.target.value)}
            className="w-full px-2 py-1.5 rounded border text-xs"
            style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}>
            {FONTS.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>Base Font Size</label>
          <input type="number" min={8} max={18} value={branding?.font_size || 11}
            onChange={e => onBrandingChange('font_size', parseInt(e.target.value))}
            className="w-full px-2 py-1.5 rounded border text-xs"
            style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }} />
        </div>
        <div>
          <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>Watermark</label>
          <div className="flex items-center gap-2 mb-2">
            <input type="checkbox" checked={templateMeta?.watermark?.enabled || false}
              onChange={e => onMetaChange('watermark', { ...(templateMeta?.watermark || {}), enabled: e.target.checked })} />
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Enable watermark</span>
          </div>
          {templateMeta?.watermark?.enabled && (
            <input value={templateMeta?.watermark?.text || 'CONFIDENTIAL'}
              onChange={e => onMetaChange('watermark', { ...(templateMeta?.watermark || {}), text: e.target.value })}
              className="w-full px-2 py-1.5 rounded border text-xs"
              style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
              placeholder="Watermark text" />
          )}
        </div>
      </div>
    )
  }

  const props = block.properties || {}
  const setProp = (key, val) => onChange({ ...block, properties: { ...props, [key]: val } })
  const setContent = (val) => onChange({ ...block, content: val })

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm capitalize" style={{ color: 'var(--text-primary)' }}>
          {block.type.replace('_', ' ')} Properties
        </h3>
        <span className="text-xs px-2 py-0.5 rounded-full"
          style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
          {block.type}
        </span>
      </div>

      {/* Text alignment */}
      {['heading', 'text', 'paragraph'].includes(block.type) && (
        <div>
          <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>Alignment</label>
          <div className="flex gap-1">
            {[['left', AlignLeft], ['center', AlignCenter], ['right', AlignRight]].map(([a, Icon]) => (
              <button key={a} onClick={() => setProp('text_align', a)}
                className="flex-1 py-1.5 rounded border text-xs flex items-center justify-center"
                style={{
                  background: props.text_align === a ? 'var(--accent-blue)' : 'var(--bg-secondary)',
                  color: props.text_align === a ? '#fff' : 'var(--text-secondary)',
                  borderColor: 'var(--border-color)',
                }}>
                <Icon size={13} />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Font size */}
      {['heading', 'text', 'paragraph', 'list_items'].includes(block.type) && (
        <div>
          <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>Font Size (pt)</label>
          <input type="number" min={7} max={36} value={props.font_size || 11}
            onChange={e => setProp('font_size', parseInt(e.target.value))}
            className="w-full px-2 py-1.5 rounded border text-xs"
            style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }} />
        </div>
      )}

      {/* Font weight */}
      {['heading', 'text', 'paragraph'].includes(block.type) && (
        <div className="flex gap-2">
          <button onClick={() => setProp('font_weight', props.font_weight === 'bold' ? 'normal' : 'bold')}
            className="flex-1 py-1.5 rounded border text-xs font-bold"
            style={{
              background: props.font_weight === 'bold' ? 'var(--accent-blue)' : 'var(--bg-secondary)',
              color: props.font_weight === 'bold' ? '#fff' : 'var(--text-secondary)',
              borderColor: 'var(--border-color)',
            }}>B Bold</button>
          <button onClick={() => setProp('font_style', props.font_style === 'italic' ? 'normal' : 'italic')}
            className="flex-1 py-1.5 rounded border text-xs italic"
            style={{
              background: props.font_style === 'italic' ? 'var(--accent-blue)' : 'var(--bg-secondary)',
              color: props.font_style === 'italic' ? '#fff' : 'var(--text-secondary)',
              borderColor: 'var(--border-color)',
            }}>I Italic</button>
        </div>
      )}

      {/* Text color */}
      {['heading', 'text', 'paragraph', 'divider'].includes(block.type) && (
        <div>
          <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>Color</label>
          <div className="flex gap-1.5 flex-wrap mb-1">
            {COLORS_PRESET.map(c => (
              <button key={c} onClick={() => setProp('color', c)}
                className="w-5 h-5 rounded-full border transition-transform hover:scale-110"
                style={{ background: c, borderColor: (props.color === c) ? '#3b82f6' : '#e5e7eb', outline: props.color === c ? '1px solid #3b82f6' : 'none' }} />
            ))}
          </div>
          <input type="color" value={props.color || '#000000'} onChange={e => setProp('color', e.target.value)}
            className="w-full h-7 rounded border cursor-pointer"
            style={{ borderColor: 'var(--border-color)' }} />
        </div>
      )}

      {/* Background color */}
      <div>
        <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>Background</label>
        <input type="color" value={props.background_color || '#ffffff'} onChange={e => setProp('background_color', e.target.value)}
          className="w-full h-7 rounded border cursor-pointer"
          style={{ borderColor: 'var(--border-color)' }} />
      </div>

      {/* Margins */}
      <div>
        <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>Spacing (px)</label>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <span className="text-xs" style={{ color: 'var(--text-disabled)' }}>Top</span>
            <input type="number" min={0} max={100} value={props.margin_top || 0}
              onChange={e => setProp('margin_top', parseInt(e.target.value))}
              className="w-full px-2 py-1 rounded border text-xs"
              style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }} />
          </div>
          <div>
            <span className="text-xs" style={{ color: 'var(--text-disabled)' }}>Bottom</span>
            <input type="number" min={0} max={100} value={props.margin_bottom || 0}
              onChange={e => setProp('margin_bottom', parseInt(e.target.value))}
              className="w-full px-2 py-1 rounded border text-xs"
              style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }} />
          </div>
        </div>
      </div>

      {/* Spacer height */}
      {block.type === 'spacer' && (
        <div>
          <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>Height (e.g. 20px)</label>
          <input value={props.height || '20px'} onChange={e => setProp('height', e.target.value)}
            className="w-full px-2 py-1.5 rounded border text-xs"
            style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }} />
        </div>
      )}

      {/* Table header bg */}
      {block.type === 'table' && typeof block.content === 'object' && (
        <div>
          <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>Header Background</label>
          <input type="color" value={block.content?.header_bg || '#1e3a5f'}
            onChange={e => setContent({ ...block.content, header_bg: e.target.value })}
            className="w-full h-7 rounded border cursor-pointer" style={{ borderColor: 'var(--border-color)' }} />
        </div>
      )}
    </div>
  )
}

// ─── Placeholder Browser ──────────────────────────────────────────────────────

function PlaceholderBrowser({ onInsert }) {
  const [open, setOpen] = useState({})
  const toggle = (g) => setOpen(prev => ({ ...prev, [g]: !prev[g] }))

  return (
    <div className="p-3">
      <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
        Click a placeholder to insert at cursor, or drag to canvas
      </p>
      {Object.entries(PLACEHOLDER_GROUPS).map(([group, keys]) => (
        <div key={group} className="mb-2">
          <button onClick={() => toggle(group)}
            className="w-full flex items-center justify-between py-1.5 px-2 rounded text-xs font-medium"
            style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>
            <span>{group}</span>
            {open[group] ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
          {open[group] && (
            <div className="mt-1 space-y-0.5 pl-2">
              {keys.map(key => (
                <button key={key} onClick={() => onInsert(`{{${key}}}`)}
                  className="w-full text-left px-2 py-1 rounded text-xs font-mono hover:bg-blue-50 transition-colors"
                  style={{ color: 'var(--accent-blue)' }}>
                  {'{{' + key + '}}'}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Block Inline Editor ──────────────────────────────────────────────────────

function BlockInlineEditor({ block, onChange }) {
  if (!block) return null

  const setContent = (val) => onChange({ ...block, content: val })

  if (['text', 'paragraph', 'heading'].includes(block.type)) {
    return (
      <div className="p-4 border-t" style={{ borderColor: 'var(--border-color)' }}>
        <label className="text-xs font-medium mb-2 block" style={{ color: 'var(--text-secondary)' }}>Content</label>
        <div
          contentEditable
          suppressContentEditableWarning
          dangerouslySetInnerHTML={{ __html: block.content || '' }}
          onBlur={e => setContent(e.currentTarget.innerHTML)}
          className="min-h-[60px] p-3 rounded-lg border text-sm outline-none focus:ring-1 focus:ring-blue-500"
          style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)', lineHeight: 1.5 }}
        />
        <p className="text-xs mt-1" style={{ color: 'var(--text-disabled)' }}>
          Use {'{{placeholder}}'} for dynamic values. Supports basic HTML (b, i, u).
        </p>
      </div>
    )
  }

  if (block.type === 'list_items') {
    const items = Array.isArray(block.content) ? block.content : [block.content]
    return (
      <div className="p-4 border-t" style={{ borderColor: 'var(--border-color)' }}>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>List Items</label>
          <button onClick={() => setContent([...items, 'New item'])}
            className="text-xs px-2 py-1 rounded" style={{ background: 'var(--accent-blue)', color: '#fff' }}>
            + Add
          </button>
        </div>
        {items.map((item, i) => (
          <div key={i} className="flex gap-2 mb-1">
            <input value={item} onChange={e => { const n = [...items]; n[i] = e.target.value; setContent(n) }}
              className="flex-1 px-2 py-1 rounded border text-xs"
              style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }} />
            <button onClick={() => setContent(items.filter((_, j) => j !== i))}
              className="p-1 rounded" style={{ background: '#fee2e2' }}>
              <X size={11} style={{ color: '#ef4444' }} />
            </button>
          </div>
        ))}
      </div>
    )
  }

  if (block.type === 'qr_code') {
    return (
      <div className="p-4 border-t" style={{ borderColor: 'var(--border-color)' }}>
        <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>Verification URL</label>
        <input value={block.content || ''} onChange={e => setContent(e.target.value)}
          className="w-full px-2 py-1.5 rounded border text-xs"
          style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
          placeholder="https://verify.example.com/{{document_number}}" />
      </div>
    )
  }

  if (block.type === 'image' || block.type === 'logo') {
    return (
      <div className="p-4 border-t" style={{ borderColor: 'var(--border-color)' }}>
        <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>Image URL</label>
        <input value={block.content || ''} onChange={e => setContent(e.target.value)}
          className="w-full px-2 py-1.5 rounded border text-xs"
          style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
          placeholder="https://..." />
      </div>
    )
  }

  return null
}

// ─── Main Builder ─────────────────────────────────────────────────────────────

export default function DocumentTemplateBuilder() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const isNew = id === 'new'

  const [saving, setSaving]         = useState(false)
  const [loading, setLoading]       = useState(!isNew)
  const [leftTab, setLeftTab]       = useState('blocks') // blocks | placeholders | layers
  const [selectedBlockId, setSelectedBlockId] = useState(null)
  const [rightTab, setRightTab]     = useState('props')  // props | settings

  const [meta, setMeta] = useState({
    name: 'Untitled Template',
    description: '',
    doc_type: 'custom',
    category: 'hr',
    is_active: true,
  })

  const [branding, setBranding] = useState({
    primary_color: '#1e3a5f', secondary_color: '#4a90d9',
    font_family: 'Helvetica', font_size: 11,
    text_color: '#1a1a1a', heading_color: '#1e3a5f',
  })

  const [header, setHeader]     = useState({ enabled: true, logo_position: 'left', show_company_name: true, show_address: true, border_bottom: true })
  const [footer, setFooter]     = useState({ enabled: true, show_page_numbers: true, show_generated_date: true, disclaimer: '', border_top: true })
  const [watermark, setWatermark] = useState({ enabled: false, type: 'text', text: 'CONFIDENTIAL', opacity: 0.10, rotation: -45, font_size: 60 })
  const [pageConfig, setPageConfig] = useState({ size: 'A4', orientation: 'portrait', margin_top: 20, margin_right: 20, margin_bottom: 20, margin_left: 20 })

  const [blocks, setBlocks]     = useState([])
  const [zoom, setZoom]         = useState(100)

  // Drag state
  const dragIdx = useRef(null)
  const canvasRef = useRef(null)
  const activeEditorRef = useRef(null)

  // ── Load existing template ─────────────────────────────────────────────────
  useEffect(() => {
    if (isNew) return
    setLoading(true)
    hrmService.getDocumentTemplate(id).then(res => {
      const t = res.data
      setMeta({ name: t.name, description: t.description || '', doc_type: t.doc_type, category: t.category, is_active: t.is_active })
      if (t.branding)   setBranding(t.branding)
      if (t.header)     setHeader(t.header)
      if (t.footer)     setFooter(t.footer)
      if (t.watermark)  setWatermark(t.watermark)
      if (t.page_config) setPageConfig(t.page_config)
      setBlocks((t.blocks || []).sort((a, b) => a.order - b.order))
    }).catch(() => {
      toast.error('Failed to load template')
      navigate('/hrm/doc-templates')
    }).finally(() => setLoading(false))
  }, [id, isNew])

  // ── Save ───────────────────────────────────────────────────────────────────
  const handleSave = async (versionNote = '') => {
    if (!meta.name.trim()) { toast.error('Template name is required'); return }
    setSaving(true)
    try {
      const payload = {
        ...meta,
        branding, header, footer, watermark,
        page_config: pageConfig,
        blocks: blocks.map((b, i) => ({ ...b, order: i })),
        version_note: versionNote || `Saved ${new Date().toLocaleTimeString()}`,
      }
      if (isNew) {
        const res = await hrmService.createDocumentTemplate(payload)
        toast.success('Template created!')
        navigate(`/hrm/doc-builder/${res.data.id}`, { replace: true })
      } else {
        await hrmService.updateDocumentTemplate(id, payload)
        toast.success('Template saved!')
      }
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to save template')
    } finally {
      setSaving(false)
    }
  }

  // ── Block operations ───────────────────────────────────────────────────────
  const addBlock = (type) => {
    const b = createBlock(type)
    setBlocks(prev => [...prev, { ...b, order: prev.length }])
    setSelectedBlockId(b.id)
  }

  const updateBlock = (updated) => {
    setBlocks(prev => prev.map(b => b.id === updated.id ? updated : b))
  }

  const deleteBlock = (blockId) => {
    setBlocks(prev => prev.filter(b => b.id !== blockId))
    if (selectedBlockId === blockId) setSelectedBlockId(null)
  }

  const duplicateBlock = (blockId) => {
    const src = blocks.find(b => b.id === blockId)
    if (!src) return
    const newBlock = { ...JSON.parse(JSON.stringify(src)), id: uuid(), order: src.order + 0.5 }
    setBlocks(prev => {
      const arr = [...prev, newBlock].sort((a, b) => a.order - b.order).map((b, i) => ({ ...b, order: i }))
      return arr
    })
    setSelectedBlockId(newBlock.id)
  }

  // ── Drag-and-drop reorder ──────────────────────────────────────────────────
  const handleDragStart = (e, idx) => { dragIdx.current = idx; e.dataTransfer.effectAllowed = 'move' }
  const handleDragOver  = (e, idx) => {
    e.preventDefault()
    if (dragIdx.current === null || dragIdx.current === idx) return
    setBlocks(prev => {
      const arr = [...prev]
      const [moved] = arr.splice(dragIdx.current, 1)
      arr.splice(idx, 0, moved)
      dragIdx.current = idx
      return arr.map((b, i) => ({ ...b, order: i }))
    })
  }
  const handleDragEnd = () => { dragIdx.current = null }

  // ── Placeholder insertion into focused block ───────────────────────────────
  const insertPlaceholder = (placeholder) => {
    if (!selectedBlockId) { toast('Select a text block first', { icon: 'ℹ️' }); return }
    const block = blocks.find(b => b.id === selectedBlockId)
    if (!block || !['text', 'paragraph', 'heading'].includes(block.type)) {
      toast('Select a text block to insert placeholder', { icon: 'ℹ️' }); return
    }
    const updated = { ...block, content: (block.content || '') + placeholder }
    updateBlock(updated)
  }

  const selectedBlock = blocks.find(b => b.id === selectedBlockId)

  if (loading) return (
    <div className="flex items-center justify-center h-96">
      <div className="animate-spin w-8 h-8 rounded-full border-4 border-blue-500 border-t-transparent" />
    </div>
  )

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
      {/* ── Top toolbar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2 border-b shrink-0 z-10"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/hrm/doc-templates')}
            className="flex items-center gap-1.5 text-sm"
            style={{ color: 'var(--text-secondary)' }}>
            <ArrowLeft size={16} /> Back
          </button>
          <div className="w-px h-5" style={{ background: 'var(--border-color)' }} />
          <input value={meta.name} onChange={e => setMeta(m => ({ ...m, name: e.target.value }))}
            className="font-semibold text-sm bg-transparent border-none outline-none"
            style={{ color: 'var(--text-primary)', minWidth: '200px' }} />
        </div>

        <div className="flex items-center gap-2">
          {/* Doc type selector */}
          <select value={meta.doc_type} onChange={e => setMeta(m => ({ ...m, doc_type: e.target.value }))}
            className="px-3 py-1.5 rounded-lg border text-xs"
            style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}>
            {DOC_TYPES.map(dt => <option key={dt.value} value={dt.value}>{dt.label}</option>)}
          </select>

          {/* Zoom */}
          <div className="flex items-center gap-1 border rounded-lg px-2 py-1"
            style={{ borderColor: 'var(--border-color)' }}>
            <button onClick={() => setZoom(z => Math.max(50, z - 10))} className="p-0.5 hover:bg-gray-100 rounded">
              <ZoomOut size={12} style={{ color: 'var(--text-secondary)' }} />
            </button>
            <span className="text-xs w-10 text-center" style={{ color: 'var(--text-secondary)' }}>{zoom}%</span>
            <button onClick={() => setZoom(z => Math.min(150, z + 10))} className="p-0.5 hover:bg-gray-100 rounded">
              <ZoomIn size={12} style={{ color: 'var(--text-secondary)' }} />
            </button>
          </div>

          <button onClick={() => navigate(`/hrm/doc-generator?template=${id}&preview=1`)}
            disabled={isNew}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border disabled:opacity-40"
            style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>
            <Eye size={13} /> Preview
          </button>

          <button onClick={() => handleSave()} disabled={saving}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-60"
            style={{ background: 'var(--accent-blue)' }}>
            <Save size={13} /> {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {/* ── Main area ───────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── Left panel ──────────────────────────────────────────────────── */}
        <div className="w-56 shrink-0 flex flex-col border-r overflow-hidden"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
          {/* Tab bar */}
          <div className="flex border-b shrink-0" style={{ borderColor: 'var(--border-color)' }}>
            {[['blocks', Layers, 'Blocks'], ['placeholders', Code, 'Vars'], ['settings', Settings, 'Page']].map(([tab, Icon, label]) => (
              <button key={tab} onClick={() => setLeftTab(tab)}
                className="flex-1 flex flex-col items-center py-2 text-xs transition-colors"
                style={{
                  borderBottom: leftTab === tab ? `2px solid var(--accent-blue)` : '2px solid transparent',
                  color: leftTab === tab ? 'var(--accent-blue)' : 'var(--text-secondary)',
                }}>
                <Icon size={14} />
                <span className="mt-0.5">{label}</span>
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto">
            {leftTab === 'blocks' && (
              <div className="p-3 space-y-3">
                {BLOCK_PALETTE.map(({ group, items }) => (
                  <div key={group}>
                    <p className="text-xs font-semibold mb-1.5 uppercase tracking-wide" style={{ color: 'var(--text-disabled)' }}>{group}</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {items.map(({ type, label, icon: Icon, desc }) => (
                        <button key={type} onClick={() => addBlock(type)}
                          title={desc}
                          className="flex flex-col items-center gap-1 p-2 rounded-lg border text-xs hover:border-blue-400 hover:bg-blue-50 transition-all"
                          style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}>
                          <Icon size={15} style={{ color: 'var(--accent-blue)' }} />
                          <span className="text-center leading-tight">{label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {leftTab === 'placeholders' && (
              <PlaceholderBrowser onInsert={insertPlaceholder} />
            )}

            {leftTab === 'settings' && (
              <div className="p-3 space-y-4">
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>Page Size</label>
                  <select value={pageConfig.size} onChange={e => setPageConfig(c => ({ ...c, size: e.target.value }))}
                    className="w-full px-2 py-1.5 rounded border text-xs"
                    style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}>
                    {['A4', 'LETTER', 'LEGAL', 'A3'].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>Orientation</label>
                  <div className="flex gap-2">
                    {['portrait', 'landscape'].map(o => (
                      <button key={o} onClick={() => setPageConfig(c => ({ ...c, orientation: o }))}
                        className="flex-1 py-1.5 rounded border text-xs capitalize"
                        style={{
                          background: pageConfig.orientation === o ? 'var(--accent-blue)' : 'var(--bg-secondary)',
                          color: pageConfig.orientation === o ? '#fff' : 'var(--text-secondary)',
                          borderColor: 'var(--border-color)',
                        }}>
                        {o}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>Margins (mm)</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {['margin_top', 'margin_right', 'margin_bottom', 'margin_left'].map(m => (
                      <div key={m}>
                        <span className="text-xs capitalize" style={{ color: 'var(--text-disabled)' }}>{m.replace('margin_', '')}</span>
                        <input type="number" min={5} max={50} value={pageConfig[m] || 20}
                          onChange={e => setPageConfig(c => ({ ...c, [m]: parseInt(e.target.value) }))}
                          className="w-full px-2 py-1 rounded border text-xs"
                          style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }} />
                      </div>
                    ))}
                  </div>
                </div>
                {/* Header settings */}
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <input type="checkbox" checked={header.enabled} onChange={e => setHeader(h => ({ ...h, enabled: e.target.checked }))} />
                    <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Show Header</label>
                  </div>
                  {header.enabled && (
                    <>
                      <div className="flex items-center gap-2 mb-1">
                        <input type="checkbox" checked={header.show_company_name} onChange={e => setHeader(h => ({ ...h, show_company_name: e.target.checked }))} />
                        <label className="text-xs" style={{ color: 'var(--text-secondary)' }}>Company Name</label>
                      </div>
                      <div className="flex items-center gap-2 mb-1">
                        <input type="checkbox" checked={header.show_address} onChange={e => setHeader(h => ({ ...h, show_address: e.target.checked }))} />
                        <label className="text-xs" style={{ color: 'var(--text-secondary)' }}>Address</label>
                      </div>
                    </>
                  )}
                </div>
                {/* Footer settings */}
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <input type="checkbox" checked={footer.enabled} onChange={e => setFooter(f => ({ ...f, enabled: e.target.checked }))} />
                    <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Show Footer</label>
                  </div>
                  {footer.enabled && (
                    <>
                      <div className="flex items-center gap-2 mb-1">
                        <input type="checkbox" checked={footer.show_page_numbers} onChange={e => setFooter(f => ({ ...f, show_page_numbers: e.target.checked }))} />
                        <label className="text-xs" style={{ color: 'var(--text-secondary)' }}>Page Numbers</label>
                      </div>
                      <div className="flex items-center gap-2 mb-1">
                        <input type="checkbox" checked={footer.show_generated_date} onChange={e => setFooter(f => ({ ...f, show_generated_date: e.target.checked }))} />
                        <label className="text-xs" style={{ color: 'var(--text-secondary)' }}>Generated Date</label>
                      </div>
                      <input value={footer.disclaimer || ''} onChange={e => setFooter(f => ({ ...f, disclaimer: e.target.value }))}
                        placeholder="Footer disclaimer…"
                        className="w-full px-2 py-1 rounded border text-xs mt-1"
                        style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }} />
                    </>
                  )}
                </div>
                {/* Watermark */}
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <input type="checkbox" checked={watermark.enabled} onChange={e => setWatermark(w => ({ ...w, enabled: e.target.checked }))} />
                    <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Watermark</label>
                  </div>
                  {watermark.enabled && (
                    <input value={watermark.text || ''} onChange={e => setWatermark(w => ({ ...w, text: e.target.value }))}
                      placeholder="CONFIDENTIAL"
                      className="w-full px-2 py-1 rounded border text-xs"
                      style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }} />
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Canvas ──────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-6" style={{ background: '#f1f5f9' }}
          onClick={() => setSelectedBlockId(null)}>
          <div
            ref={canvasRef}
            style={{
              width: `${Math.min(800, 800 * zoom / 100)}px`,
              margin: '0 auto',
              background: '#ffffff',
              boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
              borderRadius: '8px',
              padding: `${pageConfig.margin_top || 20}mm ${pageConfig.margin_right || 20}mm ${pageConfig.margin_bottom || 20}mm ${pageConfig.margin_left || 20}mm`,
              transform: `scale(${zoom / 100})`,
              transformOrigin: 'top center',
              minHeight: '1050px',
              position: 'relative',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Watermark overlay */}
            {watermark.enabled && (
              <div style={{
                position: 'absolute', top: '50%', left: '50%',
                transform: `translate(-50%, -50%) rotate(${watermark.rotation || -45}deg)`,
                fontSize: `${watermark.font_size || 60}px`,
                color: watermark.color || '#cccccc',
                opacity: watermark.opacity || 0.10,
                fontWeight: 'bold', whiteSpace: 'nowrap',
                pointerEvents: 'none', zIndex: 0,
              }}>
                {watermark.text || 'CONFIDENTIAL'}
              </div>
            )}

            {/* Header preview */}
            {header.enabled && (
              <div style={{
                paddingBottom: '12px', marginBottom: '16px',
                borderBottom: header.border_bottom ? `2px solid ${branding.primary_color}` : 'none',
              }}>
                <table style={{ width: '100%' }}>
                  <tbody>
                    <tr>
                      <td>
                        {header.show_company_name && (
                          <strong style={{ fontSize: '14pt', color: branding.primary_color }}>
                            Company Name
                          </strong>
                        )}
                        {header.show_address && (
                          <div style={{ fontSize: '9pt', color: '#555' }}>Company Address, City, State</div>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ width: '80px', height: '40px', background: '#e2e8f0', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '8px', color: '#94a3b8' }}>
                          Logo
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {/* Blocks */}
            <div className="space-y-1" style={{ position: 'relative', zIndex: 1 }}>
              {blocks.length === 0 && (
                <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94a3b8', border: '2px dashed #e2e8f0', borderRadius: '8px' }}>
                  <Layers size={32} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
                  <p style={{ fontSize: '14px', marginBottom: '6px' }}>Canvas is empty</p>
                  <p style={{ fontSize: '12px' }}>Add blocks from the left panel to start building your template</p>
                </div>
              )}
              {blocks.map((block, idx) => (
                <div key={block.id}
                  draggable
                  onDragStart={e => handleDragStart(e, idx)}
                  onDragOver={e => handleDragOver(e, idx)}
                  onDragEnd={handleDragEnd}
                  style={{ position: 'relative', paddingLeft: '24px' }}
                >
                  <BlockPreview
                    block={block}
                    selected={selectedBlockId === block.id}
                    onSelect={setSelectedBlockId}
                    onDelete={deleteBlock}
                    onDuplicate={duplicateBlock}
                    branding={branding}
                    dragHandleProps={{
                      draggable: false,
                      style: { cursor: 'grab' }
                    }}
                  />
                </div>
              ))}
            </div>

            {/* Footer preview */}
            {footer.enabled && (
              <div style={{
                marginTop: '24px', paddingTop: '10px',
                borderTop: footer.border_top ? `1px solid ${branding.primary_color}` : 'none',
                fontSize: '8pt', color: '#888', textAlign: 'center',
              }}>
                {[footer.show_generated_date && 'Generated: ' + new Date().toLocaleDateString('en-IN'), footer.disclaimer].filter(Boolean).join(' | ')}
                {footer.show_page_numbers && <span style={{ float: 'right', marginTop: '-14px' }}>Page 1</span>}
              </div>
            )}
          </div>
        </div>

        {/* ── Right panel ─────────────────────────────────────────────────── */}
        <div className="w-56 shrink-0 border-l flex flex-col overflow-hidden"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
          <div className="flex border-b shrink-0" style={{ borderColor: 'var(--border-color)' }}>
            {[['props', Settings, 'Style'], ['content', Type, 'Content']].map(([tab, Icon, label]) => (
              <button key={tab} onClick={() => setRightTab(tab)}
                className="flex-1 flex flex-col items-center py-2 text-xs transition-colors"
                style={{
                  borderBottom: rightTab === tab ? `2px solid var(--accent-blue)` : '2px solid transparent',
                  color: rightTab === tab ? 'var(--accent-blue)' : 'var(--text-secondary)',
                }}>
                <Icon size={14} />
                <span className="mt-0.5">{label}</span>
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto">
            {rightTab === 'props' && (
              <PropertiesPanel
                block={selectedBlock}
                onChange={updateBlock}
                branding={branding}
                onBrandingChange={(k, v) => setBranding(b => ({ ...b, [k]: v }))}
                templateMeta={{ watermark }}
                onMetaChange={(k, v) => { if (k === 'watermark') setWatermark(v) }}
              />
            )}
            {rightTab === 'content' && (
              <BlockInlineEditor block={selectedBlock} onChange={updateBlock} />
            )}
          </div>

          {/* Layers panel at bottom */}
          {blocks.length > 0 && (
            <div className="border-t p-2" style={{ borderColor: 'var(--border-color)' }}>
              <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>Layers ({blocks.length})</p>
              <div className="max-h-32 overflow-y-auto space-y-0.5">
                {blocks.map((b, i) => (
                  <button key={b.id} onClick={() => setSelectedBlockId(b.id)}
                    className="w-full text-left px-2 py-1 rounded text-xs flex items-center gap-1.5 transition-colors"
                    style={{
                      background: selectedBlockId === b.id ? '#eff6ff' : 'transparent',
                      color: selectedBlockId === b.id ? 'var(--accent-blue)' : 'var(--text-secondary)',
                    }}>
                    <span className="text-xs opacity-50 w-4">{i + 1}.</span>
                    <span className="truncate">{b.type.replace('_', ' ')}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
