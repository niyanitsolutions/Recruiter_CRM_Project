import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  Save, Loader2, Layers, Trash2, Lock, Unlock, Eye, EyeOff,
  ChevronUp, ChevronDown, Copy, Plus, Type, Image, Table,
  Minus, Square, Circle, Minus as DividerIcon, ZoomIn, ZoomOut,
  AlignCenter, Bold, Italic, Underline, Palette,
} from 'lucide-react'
import documentCenterService from '../../../services/documentCenterService'

const ELEMENT_TYPES = [
  { type: 'text',       label: 'Text Block',   icon: Type },
  { type: 'heading',    label: 'Heading',      icon: Type },
  { type: 'image',      label: 'Image',        icon: Image },
  { type: 'table',      label: 'Table',        icon: Table },
  { type: 'shape_rect', label: 'Rectangle',    icon: Square },
  { type: 'shape_oval', label: 'Ellipse',      icon: Circle },
  { type: 'divider',    label: 'Divider',      icon: DividerIcon },
  { type: 'signature',  label: 'Signature Box', icon: AlignCenter },
]

const A4_WIDTH  = 595   // px (A4 at 72dpi)
const A4_HEIGHT = 842

const DEFAULT_PROPS = {
  text:       { text: 'Double-click to edit text', fontSize: 14, fontFamily: 'Arial', fontWeight: 'normal', fontStyle: 'normal', color: '#1f2937', align: 'left', background: 'transparent' },
  heading:    { text: 'Heading', fontSize: 24, fontFamily: 'Arial', fontWeight: 'bold', fontStyle: 'normal', color: '#111827', align: 'left', background: 'transparent' },
  image:      { src: '', alt: 'Image', objectFit: 'contain' },
  table:      { rows: 3, cols: 3, data: [['Header 1','Header 2','Header 3'],['','',''],['','',' ']], headerColor: '#7c3aed', borderColor: '#e5e7eb' },
  shape_rect: { background: '#7c3aed', borderRadius: 4, borderColor: 'transparent', borderWidth: 0 },
  shape_oval: { background: '#4f46e5', borderRadius: '50%' },
  divider:    { color: '#e5e7eb', thickness: 2, style: 'solid' },
  signature:  { label: 'Signature', labelPosition: 'bottom', lineColor: '#1f2937' },
}

const newElement = (type, x = 80, y = 100) => ({
  id: `el_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
  type,
  x,
  y,
  width:  type === 'divider' ? 400 : type === 'image' ? 200 : 180,
  height: type === 'divider' ? 20  : type === 'image' ? 150 : type === 'text' || type === 'heading' ? 60 : 80,
  rotation: 0,
  z_index:  1,
  locked:   false,
  visible:  true,
  properties: { ...DEFAULT_PROPS[type] },
})

// ─── Element renderers ────────────────────────────────────────────────────────
const RenderElement = ({ el, isSelected, scale }) => {
  const { type, width, height, properties: p } = el

  if (!el.visible) return null

  const baseStyle = {
    width:    '100%',
    height:   '100%',
    boxSizing: 'border-box',
    overflow:  'hidden',
    userSelect: 'none',
  }

  if (type === 'text' || type === 'heading') {
    return (
      <div style={{
        ...baseStyle,
        fontFamily: p.fontFamily,
        fontSize:   p.fontSize,
        fontWeight: p.fontWeight,
        fontStyle:  p.fontStyle,
        color:      p.color,
        textAlign:  p.align,
        background: p.background,
        padding: '4px',
        lineHeight: 1.4,
        whiteSpace: 'pre-wrap',
        wordBreak:  'break-word',
      }}>
        {p.text}
      </div>
    )
  }

  if (type === 'image') {
    return p.src
      ? <img src={p.src} alt={p.alt} style={{ ...baseStyle, objectFit: p.objectFit }} />
      : (
        <div style={{ ...baseStyle, background: '#f3f4f6', border: '2px dashed #d1d5db', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 12 }}>
          Click to add image
        </div>
      )
  }

  if (type === 'table') {
    return (
      <div style={{ ...baseStyle, overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 11 }}>
          <tbody>
            {(p.data || []).map((row, ri) => (
              <tr key={ri}>
                {(row || []).map((cell, ci) => (
                  <td key={ci} style={{
                    border: `1px solid ${p.borderColor}`,
                    padding: '4px 6px',
                    background: ri === 0 ? p.headerColor : (ri % 2 === 0 ? '#f9fafb' : 'white'),
                    color: ri === 0 ? 'white' : '#1f2937',
                    fontWeight: ri === 0 ? 'bold' : 'normal',
                  }}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  if (type === 'shape_rect' || type === 'shape_oval') {
    return (
      <div style={{
        ...baseStyle,
        background:   p.background,
        borderRadius: p.borderRadius,
        border:       p.borderWidth ? `${p.borderWidth}px solid ${p.borderColor}` : 'none',
      }} />
    )
  }

  if (type === 'divider') {
    return (
      <div style={{ ...baseStyle, display: 'flex', alignItems: 'center' }}>
        <hr style={{ width: '100%', border: 'none', borderTop: `${p.thickness}px ${p.style} ${p.color}` }} />
      </div>
    )
  }

  if (type === 'signature') {
    return (
      <div style={{ ...baseStyle, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', padding: '4px' }}>
        <div style={{ width: '80%', borderBottom: `2px solid ${p.lineColor}` }} />
        <div style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>{p.label}</div>
      </div>
    )
  }

  return null
}

// ─── Properties panel for selected element ────────────────────────────────────
const PropPanel = ({ element, onChange }) => {
  if (!element) return (
    <div className="flex items-center justify-center h-32 text-sm" style={{ color: 'var(--text-muted)' }}>
      Select an element to edit properties
    </div>
  )

  const set = (key, val) => onChange({ ...element, properties: { ...element.properties, [key]: val } })
  const setEl = (key, val) => onChange({ ...element, [key]: val })
  const p = element.properties

  return (
    <div className="space-y-3 text-sm">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs mb-0.5 block" style={{ color: 'var(--text-muted)' }}>X</label>
          <input type="number" value={Math.round(element.x)} onChange={e => setEl('x', +e.target.value)}
            className="w-full px-2 py-1 rounded border text-xs" style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)', color: 'var(--text-body)' }} />
        </div>
        <div>
          <label className="text-xs mb-0.5 block" style={{ color: 'var(--text-muted)' }}>Y</label>
          <input type="number" value={Math.round(element.y)} onChange={e => setEl('y', +e.target.value)}
            className="w-full px-2 py-1 rounded border text-xs" style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)', color: 'var(--text-body)' }} />
        </div>
        <div>
          <label className="text-xs mb-0.5 block" style={{ color: 'var(--text-muted)' }}>Width</label>
          <input type="number" value={Math.round(element.width)} onChange={e => setEl('width', +e.target.value)}
            className="w-full px-2 py-1 rounded border text-xs" style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)', color: 'var(--text-body)' }} />
        </div>
        <div>
          <label className="text-xs mb-0.5 block" style={{ color: 'var(--text-muted)' }}>Height</label>
          <input type="number" value={Math.round(element.height)} onChange={e => setEl('height', +e.target.value)}
            className="w-full px-2 py-1 rounded border text-xs" style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)', color: 'var(--text-body)' }} />
        </div>
      </div>
      <div>
        <label className="text-xs mb-0.5 block" style={{ color: 'var(--text-muted)' }}>Rotation (°)</label>
        <input type="number" value={element.rotation} min={-180} max={180} onChange={e => setEl('rotation', +e.target.value)}
          className="w-full px-2 py-1 rounded border text-xs" style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)', color: 'var(--text-body)' }} />
      </div>

      {/* Type-specific */}
      {(element.type === 'text' || element.type === 'heading') && (
        <>
          <div>
            <label className="text-xs mb-0.5 block" style={{ color: 'var(--text-muted)' }}>Content</label>
            <textarea value={p.text} onChange={e => set('text', e.target.value)} rows={3}
              className="w-full px-2 py-1 rounded border text-xs resize-none" style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)', color: 'var(--text-body)' }} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs mb-0.5 block" style={{ color: 'var(--text-muted)' }}>Font Size</label>
              <input type="number" value={p.fontSize} min={8} max={96} onChange={e => set('fontSize', +e.target.value)}
                className="w-full px-2 py-1 rounded border text-xs" style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)', color: 'var(--text-body)' }} />
            </div>
            <div>
              <label className="text-xs mb-0.5 block" style={{ color: 'var(--text-muted)' }}>Color</label>
              <input type="color" value={p.color} onChange={e => set('color', e.target.value)} className="w-full h-7 rounded border cursor-pointer" style={{ borderColor: 'var(--border)' }} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs mb-0.5 block" style={{ color: 'var(--text-muted)' }}>Weight</label>
              <select value={p.fontWeight} onChange={e => set('fontWeight', e.target.value)}
                className="w-full px-2 py-1 rounded border text-xs" style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)', color: 'var(--text-body)' }}>
                <option value="normal">Normal</option>
                <option value="bold">Bold</option>
                <option value="600">SemiBold</option>
              </select>
            </div>
            <div>
              <label className="text-xs mb-0.5 block" style={{ color: 'var(--text-muted)' }}>Align</label>
              <select value={p.align} onChange={e => set('align', e.target.value)}
                className="w-full px-2 py-1 rounded border text-xs" style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)', color: 'var(--text-body)' }}>
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </div>
          </div>
        </>
      )}

      {(element.type === 'shape_rect' || element.type === 'shape_oval') && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs mb-0.5 block" style={{ color: 'var(--text-muted)' }}>Fill Color</label>
            <input type="color" value={p.background} onChange={e => set('background', e.target.value)} className="w-full h-7 rounded border cursor-pointer" style={{ borderColor: 'var(--border)' }} />
          </div>
          {element.type === 'shape_rect' && (
            <div>
              <label className="text-xs mb-0.5 block" style={{ color: 'var(--text-muted)' }}>Border Radius</label>
              <input type="number" value={p.borderRadius} min={0} max={100} onChange={e => set('borderRadius', +e.target.value)}
                className="w-full px-2 py-1 rounded border text-xs" style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)', color: 'var(--text-body)' }} />
            </div>
          )}
        </div>
      )}

      {element.type === 'divider' && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs mb-0.5 block" style={{ color: 'var(--text-muted)' }}>Color</label>
            <input type="color" value={p.color} onChange={e => set('color', e.target.value)} className="w-full h-7 rounded border cursor-pointer" style={{ borderColor: 'var(--border)' }} />
          </div>
          <div>
            <label className="text-xs mb-0.5 block" style={{ color: 'var(--text-muted)' }}>Thickness</label>
            <input type="number" value={p.thickness} min={1} max={20} onChange={e => set('thickness', +e.target.value)}
              className="w-full px-2 py-1 rounded border text-xs" style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)', color: 'var(--text-body)' }} />
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function AdvancedDesigner() {
  const { id }    = useParams()
  const navigate  = useNavigate()
  const canvasRef = useRef(null)

  const [elements,   setElements]   = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [dragging,   setDragging]   = useState(null)   // { id, startX, startY, origX, origY }
  const [resizing,   setResizing]   = useState(null)
  const [zoom,       setZoom]       = useState(0.85)
  const [saving,     setSaving]     = useState(false)
  const [loading,    setLoading]    = useState(!!id)
  const [name,       setName]       = useState('Advanced Template')
  const [categories, setCategories] = useState([])
  const [categoryId, setCategoryId] = useState('')

  useEffect(() => {
    documentCenterService.listCategories().then(r => setCategories(r.data?.data || [])).catch(() => {})
    if (id) {
      documentCenterService.getTemplate(id)
        .then(r => {
          const t = r.data?.data
          if (!t) return
          setName(t.name)
          setCategoryId(t.category_id || '')
          setElements((t.content?.canvas_elements || []).map(e => ({
            ...e, properties: e.properties || {},
          })))
        })
        .catch(() => toast.error('Failed to load template'))
        .finally(() => setLoading(false))
    }
  }, [id])

  const selectedEl = elements.find(e => e.id === selectedId) || null

  const addElement = (type) => {
    const nextZ = elements.length ? Math.max(...elements.map(e => e.z_index || 1)) + 1 : 1
    const el = { ...newElement(type, 60 + Math.random() * 40, 80 + elements.length * 30), z_index: nextZ }
    setElements(els => [...els, el])
    setSelectedId(el.id)
  }

  const updateElement = useCallback((updated) => {
    setElements(els => els.map(e => e.id === updated.id ? updated : e))
  }, [])

  const deleteSelected = () => {
    setElements(els => els.filter(e => e.id !== selectedId))
    setSelectedId(null)
  }

  const duplicateSelected = () => {
    const el = selectedEl
    if (!el) return
    const dup = { ...el, id: `el_${Date.now()}`, x: el.x + 20, y: el.y + 20, z_index: el.z_index + 1 }
    setElements(els => [...els, dup])
    setSelectedId(dup.id)
  }

  const toggleLock = () => {
    if (!selectedEl) return
    updateElement({ ...selectedEl, locked: !selectedEl.locked })
  }

  const toggleVisibility = () => {
    if (!selectedEl) return
    updateElement({ ...selectedEl, visible: !selectedEl.visible })
  }

  const moveZ = (dir) => {
    if (!selectedEl) return
    updateElement({ ...selectedEl, z_index: Math.max(1, (selectedEl.z_index || 1) + dir) })
  }

  // ── Mouse drag for moving elements ──────────────────────────────────────────
  const onMouseDown = (e, elId) => {
    const el = elements.find(el => el.id === elId)
    if (!el || el.locked) return
    e.stopPropagation()
    setSelectedId(elId)
    const canvasRect = canvasRef.current.getBoundingClientRect()
    setDragging({
      id: elId,
      startX: e.clientX,
      startY: e.clientY,
      origX:  el.x,
      origY:  el.y,
    })
  }

  const onMouseMove = useCallback((e) => {
    if (!dragging) return
    const dx = (e.clientX - dragging.startX) / zoom
    const dy = (e.clientY - dragging.startY) / zoom
    const el = elements.find(el => el.id === dragging.id)
    if (!el) return
    const newX = Math.max(0, Math.min(A4_WIDTH  - el.width,  dragging.origX + dx))
    const newY = Math.max(0, Math.min(A4_HEIGHT - el.height, dragging.origY + dy))
    setElements(els => els.map(e => e.id === dragging.id ? { ...e, x: newX, y: newY } : e))
  }, [dragging, zoom, elements])

  const onMouseUp = useCallback(() => {
    setDragging(null)
    setResizing(null)
  }, [])

  useEffect(() => {
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup',   onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup',   onMouseUp)
    }
  }, [onMouseMove, onMouseUp])

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Template name is required'); return }
    setSaving(true)
    const payload = {
      name,
      category_id: categoryId || null,
      template_type: 'advanced',
      change_summary: 'Updated in Advanced Designer',
      content: {
        body_html: elements.map(el => {
          if (el.type === 'text' || el.type === 'heading') return `<p>${el.properties?.text || ''}</p>`
          return ''
        }).join('\n'),
        canvas_elements: elements,
        paper: { size: 'A4', orientation: 'portrait', margin_top: 72, margin_bottom: 72, margin_left: 72, margin_right: 72 },
      },
    }
    try {
      if (id) {
        await documentCenterService.updateTemplate(id, payload)
        toast.success('Template saved')
      } else {
        const r = await documentCenterService.createTemplate(payload)
        const newId = r.data?.data?._id
        toast.success('Template created')
        if (newId) navigate(`/hrm/doc-center/designer/${newId}`, { replace: true })
      }
    } catch {
      toast.error('Save failed')
    } finally {
      setSaving(false)
    }
  }

  const sortedElements = [...elements].sort((a, b) => (a.z_index || 1) - (b.z_index || 1))

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 animate-spin text-violet-600" />
    </div>
  )

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-primary)' }}>

      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b flex-shrink-0" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
        <input value={name} onChange={e => setName(e.target.value)}
          className="bg-transparent border-none outline-none text-base font-semibold flex-1"
          style={{ color: 'var(--text-heading)' }} placeholder="Template Name" />

        <div className="flex items-center gap-1">
          <button onClick={() => setZoom(z => Math.max(0.4, z - 0.1))} className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"><ZoomOut className="w-4 h-4" style={{ color: 'var(--text-body)' }} /></button>
          <span className="text-xs w-12 text-center" style={{ color: 'var(--text-muted)' }}>{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom(z => Math.min(2, z + 0.1))} className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"><ZoomIn className="w-4 h-4" style={{ color: 'var(--text-body)' }} /></button>
        </div>

        {selectedId && (
          <div className="flex items-center gap-1 border rounded-lg px-2 py-1" style={{ borderColor: 'var(--border)' }}>
            <button onClick={duplicateSelected} title="Duplicate" className="p-1 hover:bg-gray-100 rounded"><Copy className="w-3.5 h-3.5" style={{ color: 'var(--text-body)' }} /></button>
            <button onClick={toggleLock}       title={selectedEl?.locked ? 'Unlock' : 'Lock'} className="p-1 hover:bg-gray-100 rounded">
              {selectedEl?.locked ? <Lock className="w-3.5 h-3.5 text-amber-500" /> : <Unlock className="w-3.5 h-3.5" style={{ color: 'var(--text-body)' }} />}
            </button>
            <button onClick={toggleVisibility} title={selectedEl?.visible ? 'Hide' : 'Show'} className="p-1 hover:bg-gray-100 rounded">
              {selectedEl?.visible ? <Eye className="w-3.5 h-3.5" style={{ color: 'var(--text-body)' }} /> : <EyeOff className="w-3.5 h-3.5 text-gray-400" />}
            </button>
            <button onClick={() => moveZ(1)}  title="Bring Forward" className="p-1 hover:bg-gray-100 rounded"><ChevronUp className="w-3.5 h-3.5" style={{ color: 'var(--text-body)' }} /></button>
            <button onClick={() => moveZ(-1)} title="Send Back"     className="p-1 hover:bg-gray-100 rounded"><ChevronDown className="w-3.5 h-3.5" style={{ color: 'var(--text-body)' }} /></button>
            <button onClick={deleteSelected}  title="Delete"        className="p-1 hover:bg-red-50 rounded"><Trash2 className="w-3.5 h-3.5 text-red-500" /></button>
          </div>
        )}

        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-semibold text-white"
          style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">

        {/* Left: Elements panel */}
        <aside className="w-48 flex-shrink-0 border-r overflow-y-auto" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
          <div className="p-3">
            <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Elements</p>
            <div className="space-y-1">
              {ELEMENT_TYPES.map(et => (
                <button key={et.type} onClick={() => addElement(et.type)}
                  className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm border transition-colors hover:bg-violet-50 hover:border-violet-400 text-left"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-body)' }}>
                  <et.icon className="w-4 h-4 flex-shrink-0" style={{ color: '#7c3aed' }} />
                  {et.label}
                </button>
              ))}
            </div>

            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Category</p>
              <select value={categoryId} onChange={e => setCategoryId(e.target.value)}
                className="w-full px-2 py-1.5 text-xs rounded border" style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)', color: 'var(--text-body)' }}>
                <option value="">— None —</option>
                {categories.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
              </select>
            </div>

            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                <Layers className="w-3 h-3" /> Layers
              </p>
              <div className="space-y-0.5 max-h-48 overflow-y-auto">
                {[...elements].reverse().map(el => (
                  <div key={el.id}
                    onClick={() => setSelectedId(el.id)}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer text-xs truncate ${selectedId === el.id ? 'bg-violet-100 text-violet-700' : ''}`}
                    style={selectedId !== el.id ? { color: 'var(--text-body)' } : {}}
                  >
                    {el.locked ? <Lock className="w-3 h-3 text-amber-400" /> : null}
                    {!el.visible ? <EyeOff className="w-3 h-3 text-gray-400" /> : null}
                    <span className="truncate">{el.type}: {el.properties?.text?.slice(0, 20) || el.type}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </aside>

        {/* Center: Canvas */}
        <div className="flex-1 overflow-auto flex items-start justify-center py-8" style={{ background: '#d1d5db' }}>
          <div
            ref={canvasRef}
            style={{
              width:      A4_WIDTH  * zoom,
              height:     A4_HEIGHT * zoom,
              background: 'white',
              boxShadow:  '0 4px 24px rgba(0,0,0,0.15)',
              position:   'relative',
              transform:  `scale(${zoom})`,
              transformOrigin: 'top center',
              flexShrink: 0,
              cursor:     dragging ? 'grabbing' : 'default',
            }}
            onClick={(e) => { if (e.target === canvasRef.current) setSelectedId(null) }}
          >
            {sortedElements.map(el => (
              <div
                key={el.id}
                onMouseDown={(e) => onMouseDown(e, el.id)}
                style={{
                  position:  'absolute',
                  left:      el.x,
                  top:       el.y,
                  width:     el.width,
                  height:    el.height,
                  transform: `rotate(${el.rotation || 0}deg)`,
                  zIndex:    el.z_index || 1,
                  opacity:   el.visible === false ? 0.3 : 1,
                  cursor:    el.locked ? 'not-allowed' : 'move',
                  outline:   selectedId === el.id ? '2px solid #7c3aed' : 'none',
                  outlineOffset: 1,
                  boxSizing: 'border-box',
                }}
              >
                <RenderElement el={el} isSelected={selectedId === el.id} scale={zoom} />

                {/* Resize handle */}
                {selectedId === el.id && !el.locked && (
                  <div
                    onMouseDown={(e) => {
                      e.stopPropagation()
                      setResizing({ id: el.id, startX: e.clientX, startY: e.clientY, origW: el.width, origH: el.height })
                    }}
                    style={{
                      position: 'absolute', bottom: -4, right: -4,
                      width: 10, height: 10, background: '#7c3aed', borderRadius: 2,
                      cursor: 'se-resize', zIndex: 100,
                    }}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Right: Properties panel */}
        <aside className="w-56 flex-shrink-0 border-l overflow-y-auto p-3" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
          <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>Properties</p>
          <PropPanel element={selectedEl} onChange={updateElement} />
        </aside>
      </div>
    </div>
  )
}
