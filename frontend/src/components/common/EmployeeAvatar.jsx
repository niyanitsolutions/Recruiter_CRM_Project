import React, { useState } from 'react'

const GRADIENTS = [
  ['#7c3aed', '#4f46e5'],
  ['#0ea5e9', '#0284c7'],
  ['#10b981', '#059669'],
  ['#f59e0b', '#d97706'],
  ['#ef4444', '#dc2626'],
  ['#8b5cf6', '#7c3aed'],
  ['#ec4899', '#db2777'],
  ['#14b8a6', '#0d9488'],
  ['#f97316', '#ea580c'],
  ['#6366f1', '#4338ca'],
]

function getInitials(name) {
  if (!name) return 'U'
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return name.charAt(0).toUpperCase()
}

function colorIndex(name) {
  if (!name) return 0
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return Math.abs(h) % GRADIENTS.length
}

export default function EmployeeAvatar({ name, photoUrl, size = 40, className = '', style = {} }) {
  const [imgError, setImgError] = useState(false)
  const initials = getInitials(name)
  const [c1, c2] = GRADIENTS[colorIndex(name)]
  const fontSize = Math.max(10, Math.round(size * 0.36))

  const base = {
    width: size,
    height: size,
    borderRadius: '50%',
    flexShrink: 0,
    ...style,
  }

  if (photoUrl && !imgError) {
    return (
      <img
        src={photoUrl}
        alt={name || 'Employee'}
        style={{ ...base, objectFit: 'cover' }}
        className={className}
        onError={() => setImgError(true)}
      />
    )
  }

  return (
    <div
      style={{
        ...base,
        background: `linear-gradient(135deg, ${c1}, ${c2})`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        fontWeight: 600,
        fontSize,
        userSelect: 'none',
      }}
      className={className}
    >
      {initials}
    </div>
  )
}
