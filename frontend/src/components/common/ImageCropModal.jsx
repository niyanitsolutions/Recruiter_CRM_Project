import React, { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, ZoomIn, ZoomOut, RotateCcw, RotateCw, Check, Move } from 'lucide-react'

const CANVAS_SIZE = 320   // display canvas size in px
const CROP_RADIUS = 150   // circular crop radius inside the canvas

export default function ImageCropModal({ file, onSave, onClose }) {
  const canvasRef  = useRef(null)
  const imgRef     = useRef(null)
  const dragOrigin = useRef(null)

  const [scale,    setScale]    = useState(1)
  const [rotation, setRotation] = useState(0)
  const [offset,   setOffset]   = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const [loaded,   setLoaded]   = useState(false)
  const [saving,   setSaving]   = useState(false)

  // Lock body scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev || '' }
  }, [])

  // Load image from file blob
  useEffect(() => {
    if (!file) return
    const url = URL.createObjectURL(file)
    const img  = new Image()
    img.onload = () => {
      imgRef.current = img
      const minDim = Math.min(img.naturalWidth, img.naturalHeight)
      setScale((CROP_RADIUS * 2) / minDim)
      setOffset({ x: 0, y: 0 })
      setRotation(0)
      setLoaded(true)
    }
    img.src = url
    return () => URL.revokeObjectURL(url)
  }, [file])

  // Draw the canvas on every state change
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const img    = imgRef.current
    if (!canvas || !img) return

    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)

    // Dark background
    ctx.fillStyle = '#18181b'
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)

    // Draw image with transforms centred on canvas
    ctx.save()
    ctx.translate(CANVAS_SIZE / 2 + offset.x, CANVAS_SIZE / 2 + offset.y)
    ctx.rotate((rotation * Math.PI) / 180)
    ctx.scale(scale, scale)
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2)
    ctx.restore()

    // Dark overlay outside the crop circle (even-odd fill)
    ctx.save()
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)'
    ctx.beginPath()
    ctx.rect(0, 0, CANVAS_SIZE, CANVAS_SIZE)
    ctx.arc(CANVAS_SIZE / 2, CANVAS_SIZE / 2, CROP_RADIUS, 0, Math.PI * 2, true)
    ctx.fill('evenodd')
    // Circle border
    ctx.strokeStyle = 'rgba(255,255,255,0.75)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(CANVAS_SIZE / 2, CANVAS_SIZE / 2, CROP_RADIUS, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
  }, [scale, rotation, offset])

  useEffect(() => { draw() }, [draw])

  // ── Drag handlers ─────────────────────────────────────────────────
  const startDrag = (clientX, clientY) => {
    setDragging(true)
    dragOrigin.current = {
      startX: clientX,
      startY: clientY,
      startOffX: offset.x,
      startOffY: offset.y,
    }
  }

  const moveDrag = (clientX, clientY) => {
    if (!dragging || !dragOrigin.current) return
    setOffset({
      x: dragOrigin.current.startOffX + (clientX - dragOrigin.current.startX),
      y: dragOrigin.current.startOffY + (clientY - dragOrigin.current.startY),
    })
  }

  const endDrag = () => {
    setDragging(false)
    dragOrigin.current = null
  }

  // ── Export the circular crop ──────────────────────────────────────
  const handleSave = () => {
    const img = imgRef.current
    if (!img) return
    setSaving(true)

    const D   = CROP_RADIUS * 2
    const out = document.createElement('canvas')
    out.width  = D
    out.height = D
    const ctx  = out.getContext('2d')

    // Clip to circle then draw with same transforms
    ctx.beginPath()
    ctx.arc(CROP_RADIUS, CROP_RADIUS, CROP_RADIUS, 0, Math.PI * 2)
    ctx.clip()

    ctx.translate(CROP_RADIUS + offset.x, CROP_RADIUS + offset.y)
    ctx.rotate((rotation * Math.PI) / 180)
    ctx.scale(scale, scale)
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2)

    out.toBlob(
      (blob) => {
        setSaving(false)
        if (blob) onSave(blob)
      },
      'image/jpeg',
      0.92,
    )
  }

  // Render into document.body — parent already conditions this component's mount
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)' }}
    >
      <div
        style={{ maxWidth: 420, width: '100%', background: '#fff', borderRadius: 20, overflow: 'hidden', boxShadow: '0 25px 60px rgba(0,0,0,0.4)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #e5e7eb' }}>
          <div>
            <p style={{ fontWeight: 600, fontSize: 15, color: '#111827' }}>Crop Profile Photo</p>
            <p style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>Drag · Zoom · Rotate · then save</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ padding: 6, borderRadius: 8, background: 'transparent', border: 'none', cursor: 'pointer', color: '#6b7280' }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Canvas */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: 20 }}>
          <div style={{ borderRadius: '50%', overflow: 'hidden', width: CANVAS_SIZE, height: CANVAS_SIZE, cursor: dragging ? 'grabbing' : 'grab', userSelect: 'none', flexShrink: 0 }}>
            {loaded ? (
              <canvas
                ref={canvasRef}
                width={CANVAS_SIZE}
                height={CANVAS_SIZE}
                style={{ display: 'block' }}
                onMouseDown={e => startDrag(e.clientX, e.clientY)}
                onMouseMove={e => moveDrag(e.clientX, e.clientY)}
                onMouseUp={endDrag}
                onMouseLeave={endDrag}
                onTouchStart={e => { const t = e.touches[0]; startDrag(t.clientX, t.clientY) }}
                onTouchMove={e => { e.preventDefault(); const t = e.touches[0]; moveDrag(t.clientX, t.clientY) }}
                onTouchEnd={endDrag}
              />
            ) : (
              <div style={{ width: CANVAS_SIZE, height: CANVAS_SIZE, background: '#18181b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: 32, height: 32, border: '3px solid #6366f1', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
              </div>
            )}
          </div>

          {/* Zoom slider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
            <button type="button" onClick={() => setScale(s => Math.max(0.1, +(s - 0.1).toFixed(2)))}
              style={{ padding: 6, borderRadius: 8, border: 'none', background: '#f3f4f6', cursor: 'pointer', color: '#374151' }}>
              <ZoomOut size={16} />
            </button>
            <input
              type="range" min={0.1} max={6} step={0.05} value={scale}
              onChange={e => setScale(Number(e.target.value))}
              style={{ flex: 1, accentColor: '#6366f1' }}
            />
            <button type="button" onClick={() => setScale(s => Math.min(6, +(s + 0.1).toFixed(2)))}
              style={{ padding: 6, borderRadius: 8, border: 'none', background: '#f3f4f6', cursor: 'pointer', color: '#374151' }}>
              <ZoomIn size={16} />
            </button>
          </div>

          {/* Rotate */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
            <button type="button" onClick={() => setRotation(r => (r - 90 + 360) % 360)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: 13, color: '#374151' }}>
              <RotateCcw size={14} /> −90°
            </button>
            <span style={{ fontSize: 13, color: '#9ca3af', minWidth: 48, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{rotation}°</span>
            <button type="button" onClick={() => setRotation(r => (r + 90) % 360)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: 13, color: '#374151' }}>
              <RotateCw size={14} /> +90°
            </button>
          </div>

          <p style={{ fontSize: 12, color: '#9ca3af', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Move size={12} /> Drag the image inside the circle to reposition
          </p>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, padding: '0 20px 20px' }}>
          <button type="button" onClick={onClose}
            style={{ flex: 1, padding: '10px 0', borderRadius: 12, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 500, color: '#374151' }}>
            Cancel
          </button>
          <button type="button" onClick={handleSave} disabled={saving || !loaded}
            style={{ flex: 1, padding: '10px 0', borderRadius: 12, border: 'none', background: saving || !loaded ? '#a5b4fc' : '#6366f1', cursor: saving || !loaded ? 'not-allowed' : 'pointer', fontSize: 14, fontWeight: 600, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <Check size={15} />
            {saving ? 'Saving…' : 'Use Photo'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
