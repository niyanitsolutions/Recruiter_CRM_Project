import React, { useState, useEffect, useCallback } from 'react'
import { GitBranch, Users, ChevronDown, ChevronRight, Search, Loader2, AlertCircle, UserCircle } from 'lucide-react'
import hrmService from '../../services/hrmService'

// depth → border/bg tokens
const DEPTH_CARD_STYLE = [
  { border: 'var(--text-link)', background: 'var(--bg-info)', boxShadow: '0 4px 16px rgba(99,102,241,0.15)' },
  { border: 'var(--border-focus)', background: 'var(--bg-card-alt)', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' },
  { border: 'var(--border-card)', background: 'var(--bg-card)', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
]

// ── Single node card ────────────────────────────────────────────────────────
function OrgNode({ node, depth = 0 }) {
  const [expanded, setExpanded] = useState(depth < 2)
  const hasChildren = node.children && node.children.length > 0
  const cardStyle = DEPTH_CARD_STYLE[Math.min(depth, 2)]

  return (
    <div className="flex flex-col items-center">
      {/* Card */}
      <div
        className="relative flex flex-col items-center p-3 rounded-xl border-2 cursor-pointer select-none transition-all w-40 text-center"
        style={cardStyle}
        onClick={() => hasChildren && setExpanded(!expanded)}
      >
        {node.photo_url ? (
          <img src={node.photo_url} alt={node.name}
            className="w-10 h-10 rounded-full object-cover mb-1.5"
            style={{ outline: '2px solid var(--bg-card)', outlineOffset: '1px' }} />
        ) : (
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center mb-1.5 font-semibold text-sm"
            style={depth === 0
              ? { background: 'var(--text-link)', color: '#fff' }
              : { background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}
          >
            {node.name?.charAt(0) || '?'}
          </div>
        )}
        <p className="text-xs font-semibold leading-tight" style={{ color: 'var(--text-heading)' }}>{node.name}</p>
        {node.designation && (
          <p className="text-[10px] mt-0.5 leading-tight" style={{ color: 'var(--text-muted)' }}>{node.designation}</p>
        )}
        {node.department && (
          <p className="text-[9px] mt-0.5 font-medium truncate w-full" style={{ color: 'var(--text-link)' }}>{node.department}</p>
        )}
        {hasChildren && (
          <span
            className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full flex items-center justify-center shadow-sm"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}
          >
            {expanded
              ? <ChevronDown className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
              : <ChevronRight className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />}
          </span>
        )}
      </div>

      {/* Children */}
      {hasChildren && expanded && (
        <div className="mt-6 pt-2 relative">
          {/* Vertical connector from parent */}
          <div className="absolute top-0 left-1/2 -translate-x-px w-0.5 h-2" style={{ background: 'var(--border)' }} />
          {/* Horizontal bar across children */}
          {node.children.length > 1 && (
            <div
              className="absolute top-2 h-0.5"
              style={{
                background: 'var(--border)',
                left: `calc(50% - ${(node.children.length - 1) * 88}px)`,
                width: `${(node.children.length - 1) * 176}px`,
              }}
            />
          )}
          <div className="flex gap-6">
            {node.children.map((child) => (
              <div key={child.id} className="flex flex-col items-center">
                {/* Vertical drop to child */}
                <div className="w-0.5 h-4" style={{ background: 'var(--border)' }} />
                <OrgNode node={child} depth={depth + 1} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Flat search list item ───────────────────────────────────────────────────
function FlatListItem({ node }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl transition-colors"
         style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
      {node.photo_url ? (
        <img src={node.photo_url} alt={node.name} className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
      ) : (
        <div className="w-9 h-9 rounded-full flex items-center justify-center font-semibold text-sm flex-shrink-0"
             style={{ background: 'var(--bg-info)', color: 'var(--text-info)' }}>
          {node.name?.charAt(0) || '?'}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-heading)' }}>{node.name}</p>
        <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{node.designation} {node.department ? `· ${node.department}` : ''}</p>
      </div>
      {node.employee_id && (
        <span className="text-xs font-mono flex-shrink-0" style={{ color: 'var(--text-disabled)' }}>{node.employee_id}</span>
      )}
    </div>
  )
}

// ── Flatten tree for search ─────────────────────────────────────────────────
function flattenTree(nodes, acc = []) {
  for (const n of nodes) {
    acc.push(n)
    if (n.children?.length) flattenTree(n.children, acc)
  }
  return acc
}

export default function OrgChart() {
  const [tree, setTree]       = useState([])
  const [total, setTotal]     = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [search, setSearch]   = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await hrmService.getOrgChart()
      setTree(res.data.tree || [])
      setTotal(res.data.total || 0)
    } catch (e) {
      setError(e?.response?.data?.detail || 'Failed to load org chart')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const flatList = flattenTree(tree)
  const filtered = search.trim()
    ? flatList.filter(n =>
        n.name?.toLowerCase().includes(search.toLowerCase()) ||
        n.designation?.toLowerCase().includes(search.toLowerCase()) ||
        n.department?.toLowerCase().includes(search.toLowerCase()) ||
        n.employee_id?.toLowerCase().includes(search.toLowerCase())
      )
    : []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: 'var(--text-heading)' }}>
            <GitBranch className="w-6 h-6" style={{ color: 'var(--text-link)' }} />
            Organization Chart
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>{total} active employees</p>
        </div>
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-disabled)' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search employee, designation…"
            className="input pl-9 text-sm"
          />
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--text-link)' }} />
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-xl p-4 text-sm"
             style={{ color: 'var(--text-danger)', background: 'var(--bg-danger)', border: '1px solid var(--border-danger, var(--border-card))' }}>
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          {error}
        </div>
      )}

      {!loading && !error && (
        <>
          {/* Search results — flat list */}
          {search.trim() ? (
            <div className="space-y-2">
              {filtered.length === 0 ? (
                <p className="text-sm text-center py-10" style={{ color: 'var(--text-disabled)' }}>No employees match your search.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {filtered.map(n => <FlatListItem key={n.id} node={n} />)}
                </div>
              )}
            </div>
          ) : (
            /* Hierarchy tree */
            <div className="overflow-x-auto pb-6">
              {tree.length === 0 ? (
                <div className="text-center py-20">
                  <UserCircle className="w-12 h-12 mx-auto mb-3" style={{ color: 'var(--text-disabled)' }} />
                  <p style={{ color: 'var(--text-muted)' }}>No active employees found.</p>
                </div>
              ) : (
                <div className="flex gap-10 min-w-max px-6 pt-6">
                  {tree.map(root => (
                    <OrgNode key={root.id} node={root} depth={0} />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
