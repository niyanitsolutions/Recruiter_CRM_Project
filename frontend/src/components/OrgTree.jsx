/**
 * OrgTree - Hierarchical organisation chart
 *
 * Props:
 *   nodes      {Array}   – tree root nodes returned by GET /users/org-tree
 *   highlightId {string} – user ID to highlight (the one being edited)
 *   filterUserId {string|null} – when set, shows only this user's chain
 *                                (managers above + subordinates below)
 */
import { useState, useMemo } from 'react'
import { ChevronRight, ChevronDown, User } from 'lucide-react'

// ── Colour map for role badges ─────────────────────────────────────────────
const ROLE_COLORS = {
  admin:                  'bg-purple-100 text-purple-700',
  candidate_coordinator:  'bg-blue-100   text-blue-700',
  client_coordinator:     'bg-cyan-100   text-cyan-700',
  hr:                     'bg-green-100  text-green-700',
  accounts:               'bg-yellow-100 text-yellow-700',
  partner:                'bg-orange-100 text-orange-700',
}
const roleColor = (role) => ROLE_COLORS[role] || 'bg-gray-100 text-gray-600'

// ── Collect all IDs in a subtree ───────────────────────────────────────────
function collectIds(node, set = new Set()) {
  set.add(node.id)
  for (const child of node.children || []) collectIds(child, set)
  return set
}

// ── Find the ancestor chain for a given ID ─────────────────────────────────
function findAncestorIds(nodes, targetId, path = []) {
  for (const node of nodes) {
    const current = [...path, node.id]
    if (node.id === targetId) return current
    const found = findAncestorIds(node.children || [], targetId, current)
    if (found) return found
  }
  return null
}

// ── Single tree node ───────────────────────────────────────────────────────
function OrgNode({ node, highlightId, visibleIds, depth = 0 }) {
  const isHighlighted = node.id === highlightId
  const hasChildren   = (node.children || []).length > 0
  const isVisible     = !visibleIds || visibleIds.has(node.id)

  // Start expanded when depth < 3 or when the node is on the highlighted path
  const [expanded, setExpanded] = useState(
    depth < 3 || (visibleIds ? visibleIds.has(node.id) : false)
  )

  if (!isVisible) return null

  const visibleChildren = visibleIds
    ? (node.children || []).filter(c => visibleIds.has(c.id))
    : (node.children || [])

  return (
    <div className={depth > 0 ? 'ml-6 border-l border-gray-200' : ''}>
      <div className="relative flex items-start gap-0 py-1">
        {/* Horizontal connector */}
        {depth > 0 && (
          <div className="absolute left-0 top-5 w-4 border-t border-gray-200 -translate-x-full" />
        )}

        <div className="flex flex-col w-full">
          {/* Node card */}
          <div
            className={`
              ml-4 flex items-center gap-2 px-3 py-2 rounded-lg border transition-all
              ${isHighlighted
                ? 'border-accent-500 bg-accent-50 shadow-sm ring-1 ring-accent-300'
                : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'}
            `}
          >
            {/* Expand / collapse toggle */}
            <button
              type="button"
              onClick={() => setExpanded(e => !e)}
              className={`flex-shrink-0 w-5 h-5 flex items-center justify-center rounded text-gray-400
                hover:text-gray-600 transition-colors
                ${!hasChildren ? 'invisible' : ''}`}
            >
              {expanded
                ? <ChevronDown className="w-4 h-4" />
                : <ChevronRight className="w-4 h-4" />}
            </button>

            {/* Avatar */}
            <div className={`
              w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-semibold
              ${isHighlighted ? 'bg-accent-600 text-white' : 'bg-gray-100 text-gray-700'}
            `}>
              {node.name?.[0]?.toUpperCase() || <User className="w-4 h-4" />}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium truncate ${isHighlighted ? 'text-accent-800' : 'text-gray-900'}`}>
                {node.name}
                {isHighlighted && (
                  <span className="ml-2 text-xs text-accent-600 font-normal">(you)</span>
                )}
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                {node.designation && (
                  <span className="text-xs text-gray-500 truncate">{node.designation}</span>
                )}
                {node.department && (
                  <span className="text-xs text-gray-400 truncate">· {node.department}</span>
                )}
              </div>
            </div>

            {/* Role badge */}
            <span className={`flex-shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${roleColor(node.role)}`}>
              {node.role_name || node.role}
            </span>

            {/* Status dot */}
            <span className={`flex-shrink-0 w-2 h-2 rounded-full ${
              node.status === 'active' ? 'bg-green-400' :
              node.status === 'inactive' ? 'bg-gray-300' : 'bg-yellow-400'
            }`} title={node.status} />
          </div>

          {/* Children */}
          {expanded && hasChildren && (
            <div className="mt-1">
              {visibleChildren.map(child => (
                <OrgNode
                  key={child.id}
                  node={child}
                  highlightId={highlightId}
                  visibleIds={visibleIds}
                  depth={depth + 1}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Public component ───────────────────────────────────────────────────────
export default function OrgTree({ nodes = [], highlightId, filterUserId }) {
  /**
   * filterUserId: when provided (non-admin view), compute the set of IDs that
   * should be visible: ancestor chain + the user's own subtree.
   */
  const visibleIds = useMemo(() => {
    if (!filterUserId) return null          // admin → show everything

    const ancestors = findAncestorIds(nodes, filterUserId) || []
    const targetNode = (function find(list) {
      for (const n of list) {
        if (n.id === filterUserId) return n
        const f = find(n.children || [])
        if (f) return f
      }
      return null
    })(nodes)

    const ids = new Set(ancestors)
    if (targetNode) collectIds(targetNode, ids)
    return ids
  }, [nodes, filterUserId])

  if (!nodes.length) {
    return (
      <div className="py-8 text-center text-gray-400 text-sm">
        No users found in the organisation.
      </div>
    )
  }

  const visibleRoots = visibleIds
    ? nodes.filter(n => visibleIds.has(n.id))
    : nodes

  return (
    <div className="space-y-1 overflow-auto">
      {visibleRoots.map(root => (
        <OrgNode
          key={root.id}
          node={root}
          highlightId={highlightId}
          visibleIds={visibleIds}
          depth={0}
        />
      ))}
    </div>
  )
}
