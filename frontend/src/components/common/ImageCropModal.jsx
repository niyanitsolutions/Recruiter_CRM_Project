import React, { useState, useRef, useEffect, useCallback } from 'react'
import { X, ZoomIn, ZoomOut, RotateCcw, RotateCw, Check, Move } from 'lucide-react'
import ModalPortal from './ModalPortal'

const CANVAS_SIZE = 320   // display canvas size (px)
const CROP_RADIUS = 150   // circular crop radius inside the canvas

export default function ImageCropModal({ file, onSave, onClose }) {
  const canvasRef = useRef(null)
  const imgRef    = useRef(null)

  const [scale,    setScale]    = useState(1)
  const [rotation, setRotation] = useState(0)
  const [offset,   setOffset]   = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const dragOrigin = useRef(null)   // { startX, startY, startOffX, startOffY }
  const [loaded,   setLoaded]   = useState(false)
  const [saving,   setSaving]   = useState(false)

  // Load image from file
  useEffect(() => {
    if (!file) return
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      imgRef.current = img
      // Initial scale: fit the shorter side to the crop circle diameter
      const minDim = Math.min(img.naturalWidth, img.naturalHeight)
      setScale((CROP_RADIUS * 2) / minDim)
      setOffset({ x: 0, y: 0 })
      setRotation(0)
      setLoaded(true)
    }
    img.src = url
    return () => URL.revokeObjectURL(url)
  }, [file])

  // Draw scene on canvas
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

    // Dark overlay outside the crop circle
    ctx.save()
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)'
    ctx.beginPath()
    ctx.rect(0, 0, CANVAS_SIZE, CANVAS_SIZE)
    // Cut out the crop circle (even-odd rule)
    ctx.arc(CANVAS_SIZE / 2, CANVAS_SIZE / 2, CROP_RADIUS, 0, Math.PI * 2, true)
    ctx.fill('evenodd')
    // Circle border
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(CANVAS_SIZE / 2, CANVAS_SIZE / 2, CROP_RADIUS, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
  }, [scale, rotation, offset])

  useEffect(() => { draw() }, [draw])

  // ── Pointer / Mouse drag ─────────────────────────────────────────
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
    const dx = clientX - dragOrigin.current.startX
    const dy = clientY - dragOrigin.current.startY
    setOffset({
      x: dragOrigin.current.startOffX + dx,
      y: dragOrigin.current.startOffY + dy,
    })
  }

  const endDrag = () => {
    setDragging(false)
    dragOrigin.current = null
  }

  // ── Save: export only the circular crop area ─────────────────────
  const handleSave = () => {
    const img = imgRef.current
    if (!img) return
    setSaving(true)

    const out = document.createElement('canvas')
    const D   = CROP_RADIUS * 2
    out.width  = D
    out.height = D
    const ctx  = out.getContext('2d')

    // Clip to circle
    ctx.beginPath()
    ctx.arc(CROP_RADIUS, CROP_RADIUS, CROP_RADIUS, 0, Math.PI * 2)
    ctx.clip()

    // Replicate same transform (origin now = centre of output canvas)
    ctx.translate(CROP_RADIUS + offset.x, CROP_RADIUS + offset.y)
    ctx.rotate((rotation * Math.PI) / 180)
    ctx.scale(scale, scale)
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2)

    out.toBlob(
      (blob) => {
        if (blob) onSave(blob)
        setSaving(false)
      },
      'image/jpeg',
      0.92,
    )
  }

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: 'rgba(0,0,0,0.75)' }}
      >
        <div
          className="bg-white rounded-2xl shadow-2xl w-full overflow-hidden"
          style={{ maxWidth: 420 }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border-card)' }}>
            <div>
              <h3 className="font-semibold text-base" style={{ color: 'var(--text-heading)' }}>Crop Photo</h3>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Drag to reposition · Scroll to zoom · Rotate as needed</p>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100">
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>

          {/* Canvas area */}
          <div className="flex flex-col items-center gap-4 p-5">
            <div
              style={{
                borderRadius: '50%',
                overflow: 'hidden',
                width: CANVAS_SIZE,
                height: CANVAS_SIZE,
                cursor: dragging ? 'grabbing' : 'grab',
                userSelect: 'none',
              }}
            >
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
                <div
                  style={{ width: CANVAS_SIZE, height: CANVAS_SIZE, background: '#18181b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <div className="w-8 h-8 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>

            {/* Zoom slider */}
            <div className="w-full flex items-center gap-3">
              <button
                type="button"
                onClick={() => setScale(s => Math.max(0.1, +(s - 0.1).toFixed(2)))}
                className="p-1.5 rounded-lg hover:bg-gray-100"
              >
                <ZoomOut className="w-4 h-4 text-gray-500" />
              </button>
              <input
                type="range"
                min={0.1}
                max={6}
                step={0.05}
                value={scale}
                onChange={e => setScale(Number(e.target.value))}
                className="flex-1 accent-indigo-600"
              />
              <button
                type="button"
                onClick={() => setScale(s => Math.min(6, +(s + 0.1).toFixed(2)))}
                className="p-1.5 rounded-lg hover:bg-gray-100"
              >
                <ZoomIn className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            {/* Rotate buttons */}
            <div className="flex items-center justify-center gap-4">
              <button
                type="button"
                onClick={() => setRotation(r => (r - 90 + 360) % 360)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-gray-600 hover:bg-gray-100"
              >
                <RotateCcw className="w-4 h-4" /> −90°
              </button>
              <span className="text-sm text-gray-400 w-14 text-center font-mono">{rotation}°</span>
              <button
                type="button"
                onClick={() => setRotation(r => (r + 90) % 360)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-gray-600 hover:bg-gray-100"
              >
                <RotateCw className="w-4 h-4" /> +90°
              </button>
            </div>

            <p className="text-xs text-gray-400 flex items-center gap-1">
              <Move className="w-3 h-3" /> Drag the image to reposition
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-3 px-5 pb-5">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !loaded}
              className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60 flex items-center justify-center gap-2"
            >
              <Check className="w-4 h-4" />
              {saving ? 'Saving…' : 'Use Photo'}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}
