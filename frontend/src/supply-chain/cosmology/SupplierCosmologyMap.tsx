// SupplierCosmologyMap.tsx
// Phase 1 MVP — read-only supplier cosmology map.
// Two tabs: Tree view (hierarchy) and Code Lookup (searchable reference).
//
// Route: /supply-chain/cosmology
// Data: get_supplier_cosmology() RPC — returns all parties with joined account info
//
// Phase 2 will add: admin edit panel, reparenting, deprecation, audit log

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CosmologyNode {
  id: string
  name: string
  parent_id: string | null
  relationship_type: string | null
  is_active: boolean
  is_deprecated: boolean
  shopify_vendor_codes: string[] | null
  roles: string[] | null
  notes: string | null
  primary_account_label: string | null
  primary_account_number: string | null
  ordering_method: string | null
  ordering_email: string | null
  child_count: number
  // Built client-side
  children: CosmologyNode[]
  depth: number
}

type Tab = 'tree' | 'lookup'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------


const REL_TYPE_CONFIG: Record<string, {
  label: string
  color: string
  dot: string
  description: string
}> = {
  ordering_party: {
    label: 'Ordering party',
    color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    dot: 'bg-blue-500',
    description: 'You write purchase orders directly to this party.',
  },
  imprint: {
    label: 'Imprint',
    color: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    dot: 'bg-gray-400',
    description: 'Editorially distinct imprint. Orders route through parent.',
  },
  distribution_client: {
    label: 'Distribution client',
    color: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
    dot: 'bg-teal-500',
    description: 'Independent publisher distributed via parent. Orders route through parent.',
  },
  direct: {
    label: 'Direct',
    color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    dot: 'bg-amber-500',
    description: 'Ordered directly — no distributor or rep group.',
  },
  deprecated_code: {
    label: 'Deprecated',
    color: 'bg-red-100 text-red-600 dark:bg-red-900/20 dark:text-red-400',
    dot: 'bg-red-400',
    description: 'Legacy Booklog code. Do not use for new orders.',
  },
}

const ORDERING_METHOD_LABELS: Record<string, string> = {
  email: 'Email', edi: 'EDI', portal: 'Portal', phone: 'Phone', other: 'Other',
}

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

async function fetchCosmology(): Promise<CosmologyNode[]> {
  const res = await fetch(`${SC_BASE_URL}/api/suppliers/cosmology`, {
    headers: { 'X-Admin-Token': SC_TOKEN },
  })
  if (!res.ok) throw new Error(`Failed to load cosmology: ${res.status}`)
  return res.json()
}

const ROOT_TYPES = new Set(['ordering_party', 'direct'])

function buildTree(flat: CosmologyNode[]): {
  roots: CosmologyNode[]
  unclassified: CosmologyNode[]
} {
  const map = new Map<string, CosmologyNode>()
  flat.forEach(n => map.set(n.id, { ...n, children: [], depth: 0 }))

  const roots: CosmologyNode[] = []
  const unclassified: CosmologyNode[] = []

  map.forEach(node => {
    if (node.parent_id && map.has(node.parent_id)) {
      // Has a known parent — nest under it
      map.get(node.parent_id)!.children.push(node)
    } else if (ROOT_TYPES.has(node.relationship_type ?? '')) {
      // Explicitly classified as a root-level party
      roots.push(node)
    } else {
      // parent_id is null but not a known root type —
      // seeded draft or unclassified party, park in unclassified
      unclassified.push(node)
    }
  })

  function setDepth(node: CosmologyNode, depth: number) {
    node.depth = depth
    node.children.forEach(c => setDepth(c, depth + 1))
    node.children.sort((a, b) => a.name.localeCompare(b.name))
  }

  roots.sort((a, b) => a.name.localeCompare(b.name))
  roots.forEach(r => setDepth(r, 0))
  unclassified.sort((a, b) => a.name.localeCompare(b.name))

  return { roots, unclassified }
}

// ---------------------------------------------------------------------------
// Relationship type badge
// ---------------------------------------------------------------------------

function RelBadge({ type }: { type: string | null }) {
  if (!type) return null
  const cfg = REL_TYPE_CONFIG[type]
  if (!cfg) return null
  return (
    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wide shrink-0 ${cfg.color}`}>
      {cfg.label}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Vendor code chip
// ---------------------------------------------------------------------------

function CodeChip({ code }: { code: string }) {
  return (
    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
      {code}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Tree node
// ---------------------------------------------------------------------------

function TreeNode({
  node,
  defaultExpanded,
  onNodeClick,
}: {
  node: CosmologyNode
  defaultExpanded: boolean
  onNodeClick: (node: CosmologyNode) => void
}) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const hasChildren = node.children.length > 0

  const cfg = REL_TYPE_CONFIG[node.relationship_type ?? '']
  const isDeprecated = node.is_deprecated || node.relationship_type === 'deprecated_code'

  return (
    <div>
      <div
        className={`group flex items-start gap-2 px-3 py-2 rounded-md cursor-pointer transition-colors
          ${isDeprecated
            ? 'opacity-40 hover:opacity-70'
            : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
          }`}
        style={{ paddingLeft: `${node.depth * 20 + 12}px` }}
        onClick={() => onNodeClick(node)}
      >
        {/* Expand/collapse toggle */}
        <button
          type="button"
          onClick={e => { e.stopPropagation(); if (hasChildren) setExpanded(v => !v) }}
          className={`mt-0.5 w-4 h-4 shrink-0 flex items-center justify-center text-gray-400 dark:text-gray-500
            ${hasChildren ? 'hover:text-gray-700 dark:hover:text-gray-200' : 'cursor-default'}`}
        >
          {hasChildren ? (
            <span className="text-xs font-bold leading-none">{expanded ? '▾' : '▸'}</span>
          ) : (
            <span className="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-600 inline-block" />
          )}
        </button>

        {/* Dot */}
        {cfg && (
          <div className={`w-2 h-2 rounded-full shrink-0 mt-1 ${cfg.dot}`} />
        )}

        {/* Name and codes */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-sm font-medium truncate
              ${node.depth === 0
                ? 'text-gray-900 dark:text-gray-100 font-bold'
                : 'text-gray-700 dark:text-gray-300'
              }`}>
              {node.name}
            </span>
            {node.shopify_vendor_codes?.slice(0, 3).map(c => (
              <CodeChip key={c} code={c} />
            ))}
            {(node.shopify_vendor_codes?.length ?? 0) > 3 && (
              <span className="text-[10px] text-gray-400">
                +{(node.shopify_vendor_codes?.length ?? 0) - 3} more
              </span>
            )}
            <RelBadge type={node.relationship_type} />
          </div>
          {/* Ordering context — only for root level */}
          {node.depth === 0 && node.primary_account_label && (
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
              {node.primary_account_label}
              {node.primary_account_number && ` · #${node.primary_account_number}`}
              {node.ordering_method && ` · ${ORDERING_METHOD_LABELS[node.ordering_method] ?? node.ordering_method}`}
            </p>
          )}
          {/* Child count */}
          {hasChildren && !expanded && (
            <p className="text-[10px] text-gray-400 dark:text-gray-500">
              {node.children.length} {node.children.length === 1 ? 'entry' : 'entries'}
            </p>
          )}
        </div>
      </div>

      {/* Children */}
      {expanded && hasChildren && (
        <div>
          {node.children.map(child => (
            <TreeNode
              key={child.id}
              node={child}
              defaultExpanded={false}
              onNodeClick={onNodeClick}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// API helpers for edit operations
// ---------------------------------------------------------------------------

const SC_BASE_URL  = import.meta.env.VITE_SC_BASE_URL as string
const SC_TOKEN     = import.meta.env.VITE_SC_ADMIN_TOKEN as string

async function apiPatch(path: string, body: object) {
  const res = await fetch(`${SC_BASE_URL}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'X-Admin-Token': SC_TOKEN },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail ?? `HTTP ${res.status}`)
  }
  return res.json()
}

async function apiPost(path: string, body: object) {
  const res = await fetch(`${SC_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Admin-Token': SC_TOKEN },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail ?? `HTTP ${res.status}`)
  }
  return res.json()
}

async function fetchParentCandidates(search: string): Promise<CosmologyNode[]> {
  const res = await fetch(
    `${SC_BASE_URL}/api/suppliers?search=${encodeURIComponent(search)}&active_only=false`,
    { headers: { 'X-Admin-Token': SC_TOKEN } }
  )
  if (!res.ok) return []
  const data = await res.json()
  return data.slice(0, 10)
}

// ---------------------------------------------------------------------------
// Detail panel — read view + inline edit panel
// ---------------------------------------------------------------------------

function NodeDetail({
  node,
  onClose,
  onUpdated,
}: {
  node: CosmologyNode
  onClose: () => void
  onUpdated: (updated: Partial<CosmologyNode>) => void
}) {
  const [editing, setEditing] = useState(false)
  const isDeprecated = node.is_deprecated || node.relationship_type === 'deprecated_code'
  const cfg = REL_TYPE_CONFIG[node.relationship_type ?? '']
  const relNotes = node.notes?.replace(/^\[(IMPRINT|DISTRIBUTION CLIENT)\]\s*/, '') ?? null

  return (
    <div className="border-l dark:border-gray-800 bg-white dark:bg-gray-950 flex flex-col h-full">
      <div className="flex items-start justify-between p-4 border-b dark:border-gray-800 shrink-0">
        <div className="min-w-0">
          <h3 className={`font-bold text-base leading-tight ${isDeprecated ? 'line-through text-gray-400' : 'text-gray-900 dark:text-white'}`}>
            {node.name}
          </h3>
          {cfg && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{cfg.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2 ml-2 shrink-0">
          {!editing && (
            <button
              onClick={() => setEditing(true)}
              className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
            >
              Edit
            </button>
          )}
          <button onClick={onClose} className="text-sm text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">✕</button>
        </div>
      </div>

      <div className="overflow-y-auto flex-1">
        {editing ? (
          <NodeEditPanel
            node={node}
            onCancel={() => setEditing(false)}
            onSaved={(updated) => { setEditing(false); onUpdated(updated) }}
          />
        ) : (
          <NodeReadView node={node} relNotes={relNotes} isDeprecated={isDeprecated} cfg={cfg} />
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Read view (extracted from original NodeDetail)
// ---------------------------------------------------------------------------

function NodeReadView({ node, relNotes, isDeprecated, cfg }: {
  node: CosmologyNode
  relNotes: string | null
  isDeprecated: boolean
  cfg: typeof REL_TYPE_CONFIG[string] | undefined
}) {
  return (
    <div className="p-4 space-y-5 text-sm">
      {isDeprecated && (
        <div className="px-3 py-2 rounded bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-xs text-red-600 dark:text-red-400">
          ⛔ Deprecated legacy code — do not use for new orders.
        </div>
      )}
      {node.shopify_vendor_codes && node.shopify_vendor_codes.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500 mb-1.5">Vendor codes</p>
          <div className="flex flex-wrap gap-1">
            {node.shopify_vendor_codes.map(c => <CodeChip key={c} code={c} />)}
          </div>
        </div>
      )}
      {node.relationship_type && (
        <div>
          <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500 mb-1">Relationship</p>
          <RelBadge type={node.relationship_type} />
        </div>
      )}
      {node.primary_account_label && (
        <div>
          <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500 mb-1.5">Ordering account</p>
          <p className="font-medium text-gray-900 dark:text-gray-100">{node.primary_account_label}</p>
          {node.primary_account_number && <p className="font-mono text-xs text-gray-500 mt-0.5">#{node.primary_account_number}</p>}
          {node.ordering_method && <p className="text-xs text-gray-400 mt-0.5">via {ORDERING_METHOD_LABELS[node.ordering_method] ?? node.ordering_method}</p>}
          {node.ordering_email && <p className="text-xs text-blue-500 mt-0.5">{node.ordering_email}</p>}
        </div>
      )}
      {relNotes && (
        <div>
          <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500 mb-1">Notes</p>
          <p className="text-gray-600 dark:text-gray-400 leading-relaxed">{relNotes}</p>
        </div>
      )}
      {node.child_count > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500 mb-1">Imprints & clients</p>
          <p className="text-gray-600 dark:text-gray-400">{node.child_count} linked {node.child_count === 1 ? 'entry' : 'entries'}</p>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Edit panel
// ---------------------------------------------------------------------------

const REL_TYPE_OPTIONS = [
  { value: 'ordering_party',      label: 'Ordering party' },
  { value: 'imprint',             label: 'Imprint' },
  { value: 'distribution_client', label: 'Distribution client' },
  { value: 'direct',              label: 'Direct' },
  { value: 'deprecated_code',     label: 'Deprecated code' },
]

function NodeEditPanel({ node, onCancel, onSaved }: {
  node: CosmologyNode
  onCancel: () => void
  onSaved: (updated: Partial<CosmologyNode>) => void
}) {
  const [name, setName] = useState(node.name)
  const [relType, setRelType] = useState(node.relationship_type ?? '')
  const [notes, setNotes] = useState(
    node.notes?.replace(/^\[(IMPRINT|DISTRIBUTION CLIENT)\]\s*/, '') ?? ''
  )
  const [codes, setCodes] = useState<string[]>(node.shopify_vendor_codes ?? [])
  const [newCode, setNewCode] = useState('')

  // Parent assignment
  const [parentSearch, setParentSearch] = useState('')
  const [parentResults, setParentResults] = useState<CosmologyNode[]>([])
  const [selectedParentId, setSelectedParentId] = useState<string | null>(node.parent_id)
  const [selectedParentName, setSelectedParentName] = useState('')
  const [reparentReason, setReparentReason] = useState('')
  const [showParentSearch, setShowParentSearch] = useState(false)

  // Deprecate
  const [showDeprecate, setShowDeprecate] = useState(false)
  const [deprecateReason, setDeprecateReason] = useState('')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (parentSearch.length < 2) { setParentResults([]); return }
    fetchParentCandidates(parentSearch).then(setParentResults)
  }, [parentSearch])

  const addCode = () => {
    const c = newCode.trim().toUpperCase()
    if (c && !codes.includes(c)) setCodes(prev => [...prev, c])
    setNewCode('')
  }

  const removeCode = (c: string) => setCodes(prev => prev.filter(x => x !== c))

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const updated: Partial<CosmologyNode> = {}

      // Edit fields
      const editBody: Record<string, unknown> = { reason: 'Admin edit via cosmology map' }
      if (name !== node.name) { editBody.name = name; updated.name = name }
      if (relType !== (node.relationship_type ?? '')) { editBody.relationship_type = relType; updated.relationship_type = relType }
      if (notes !== (node.notes?.replace(/^\[(IMPRINT|DISTRIBUTION CLIENT)\]\s*/, '') ?? '')) {
        editBody.notes = notes; updated.notes = notes
      }
      const codesChanged = JSON.stringify(codes.slice().sort()) !== JSON.stringify((node.shopify_vendor_codes ?? []).slice().sort())
      if (codesChanged) { editBody.shopify_vendor_codes = codes; updated.shopify_vendor_codes = codes }

      if (Object.keys(editBody).length > 1) {
        await apiPatch(`/api/suppliers/${node.id}/cosmology`, editBody)
      }

      // Reparent if parent changed
      const parentChanged = selectedParentId !== node.parent_id
      if (parentChanged) {
        if (!reparentReason.trim()) throw new Error('Reason is required when changing parent')
        await apiPatch(`/api/suppliers/${node.id}/parent`, {
          new_parent_id: selectedParentId,
          new_relationship_type: relType || undefined,
          reason: reparentReason,
        })
        updated.parent_id = selectedParentId
      }

      onSaved(updated)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleDeprecate = async () => {
    if (!deprecateReason.trim()) { setError('Reason required'); return }
    setSaving(true)
    setError(null)
    try {
      await apiPost(`/api/suppliers/${node.id}/deprecate`, { reason: deprecateReason })
      onSaved({ is_deprecated: true, is_active: false, relationship_type: 'deprecated_code' })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Deprecate failed')
    } finally {
      setSaving(false)
    }
  }

  const Label = ({ children }: { children: React.ReactNode }) => (
    <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500 mb-1">{children}</p>
  )

  const Input = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} className={`w-full px-2.5 py-1.5 border rounded text-sm dark:bg-gray-900 dark:text-white dark:border-gray-700 focus:ring-1 focus:ring-blue-500 outline-none ${props.className ?? ''}`} />
  )

  return (
    <div className="p-4 space-y-5 text-sm">
      {/* Name */}
      <div>
        <Label>Name</Label>
        <Input value={name} onChange={e => setName(e.target.value)} />
      </div>

      {/* Relationship type */}
      <div>
        <Label>Relationship type</Label>
        <select value={relType} onChange={e => setRelType(e.target.value)}
          className="w-full px-2.5 py-1.5 border rounded text-sm dark:bg-gray-900 dark:text-white dark:border-gray-700 focus:ring-1 focus:ring-blue-500 outline-none">
          <option value="">— unclassified —</option>
          {REL_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {/* Vendor codes */}
      <div>
        <Label>Vendor codes</Label>
        <div className="flex flex-wrap gap-1 mb-2">
          {codes.map(c => (
            <span key={c} className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
              {c}
              <button type="button" onClick={() => removeCode(c)} className="text-gray-400 hover:text-red-500 leading-none">×</button>
            </span>
          ))}
        </div>
        <div className="flex gap-1">
          <Input value={newCode} onChange={e => setNewCode(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addCode()}
            placeholder="Add code…" className="flex-1" />
          <button type="button" onClick={addCode}
            className="px-2.5 py-1.5 rounded bg-gray-100 dark:bg-gray-800 text-xs font-semibold hover:bg-gray-200 dark:hover:bg-gray-700">
            Add
          </button>
        </div>
      </div>

      {/* Notes */}
      <div>
        <Label>Notes</Label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
          className="w-full px-2.5 py-1.5 border rounded text-sm dark:bg-gray-900 dark:text-white dark:border-gray-700 focus:ring-1 focus:ring-blue-500 outline-none resize-none" />
      </div>

      {/* Parent assignment */}
      <div>
        <Label>Parent / ordering group</Label>
        <div className="mb-1.5">
          {selectedParentId ? (
            <div className="flex items-center justify-between px-2.5 py-1.5 rounded bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
              <span className="text-xs font-medium text-blue-800 dark:text-blue-200">
                {selectedParentName || (node.parent_id === selectedParentId ? '(current parent)' : selectedParentId.slice(0,8))}
              </span>
              <button type="button" onClick={() => { setSelectedParentId(null); setSelectedParentName('') }}
                className="text-blue-400 hover:text-red-500 text-sm">×</button>
            </div>
          ) : (
            <p className="text-xs text-gray-400 dark:text-gray-500 italic">No parent — root level</p>
          )}
        </div>
        <button type="button" onClick={() => setShowParentSearch(v => !v)}
          className="text-xs text-blue-500 hover:underline">
          {showParentSearch ? 'Cancel' : 'Change parent…'}
        </button>
        {showParentSearch && (
          <div className="mt-2 space-y-1">
            <Input value={parentSearch} onChange={e => setParentSearch(e.target.value)}
              placeholder="Search for new parent…" autoFocus />
            {parentResults.length > 0 && (
              <div className="border dark:border-gray-700 rounded overflow-hidden">
                {parentResults.map(p => (
                  <button key={p.id} type="button"
                    onMouseDown={() => {
                      setSelectedParentId(p.id)
                      setSelectedParentName(p.name)
                      setParentSearch('')
                      setParentResults([])
                      setShowParentSearch(false)
                    }}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 dark:hover:bg-gray-800 border-b dark:border-gray-800 last:border-0">
                    <span className="font-medium">{p.name}</span>
                    {p.shopify_vendor_codes?.[0] && (
                      <span className="font-mono text-gray-400 ml-1.5">{p.shopify_vendor_codes[0]}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
            {selectedParentId !== node.parent_id && (
              <div className="mt-2">
                <Label>Reason for parent change</Label>
                <Input value={reparentReason} onChange={e => setReparentReason(e.target.value)}
                  placeholder="e.g. Acquired by HarperCollins 2027" />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="px-3 py-2 rounded bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-xs text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Save / Cancel */}
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} disabled={saving}
          className="px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50">
          Cancel
        </button>
        <button type="button" onClick={handleSave} disabled={saving}
          className="flex-1 px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold disabled:opacity-50 transition-colors">
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>

      {/* Deprecate — danger zone */}
      {!node.is_deprecated && (
        <div className="border-t dark:border-gray-800 pt-4">
          {!showDeprecate ? (
            <button type="button" onClick={() => setShowDeprecate(true)}
              className="text-xs text-red-500 hover:underline">
              Deprecate this party…
            </button>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-red-600 dark:text-red-400">Deprecate — this cannot be undone easily</p>
              <Input value={deprecateReason} onChange={e => setDeprecateReason(e.target.value)}
                placeholder="Reason (e.g. defunct distributor)" />
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowDeprecate(false)}
                  className="px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 text-xs text-gray-600 dark:text-gray-300">
                  Cancel
                </button>
                <button type="button" onClick={handleDeprecate} disabled={saving}
                  className="px-3 py-1.5 rounded bg-red-600 hover:bg-red-700 text-white text-xs font-semibold disabled:opacity-50">
                  {saving ? 'Deprecating…' : 'Confirm deprecate'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}


// ---------------------------------------------------------------------------
// Legend
// ---------------------------------------------------------------------------

function Legend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
      {Object.entries(REL_TYPE_CONFIG).map(([key, cfg]) => (
        <div key={key} className="flex items-center gap-1.5">
          <div className={`w-2 h-2 rounded-full ${cfg.dot}`} />
          <span className="text-xs text-gray-500 dark:text-gray-400">{cfg.label}</span>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Code lookup tab
// ---------------------------------------------------------------------------

function CodeLookup({ flat }: { flat: CosmologyNode[] }) {
  const [query, setQuery] = useState('')

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return flat.filter(n => !n.is_deprecated).slice(0, 50)
    return flat.filter(n =>
      n.name.toLowerCase().includes(q) ||
      n.shopify_vendor_codes?.some(c => c.toLowerCase().includes(q)) ||
      n.notes?.toLowerCase().includes(q) ||
      n.primary_account_label?.toLowerCase().includes(q)
    ).slice(0, 100)
  }, [flat, query])

  return (
    <div className="space-y-3">
      <input
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Search by name, code (e.g. QSTU, Phaidon, RDH)…"
        autoFocus
        className="w-full px-3 py-2 border rounded text-sm dark:bg-gray-800 dark:text-white dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none"
      />

      <div className="border dark:border-gray-700 rounded-lg overflow-hidden">
        <table className="w-full text-sm border-collapse">
          <thead className="bg-gray-50 dark:bg-gray-800 text-left">
            <tr>
              <th className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Name</th>
              <th className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Code(s)</th>
              <th className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Orders via</th>
              <th className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Type</th>
            </tr>
          </thead>
          <tbody className="divide-y dark:divide-gray-800">
            {results.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-gray-400 dark:text-gray-500 text-xs">
                  No results for "{query}"
                </td>
              </tr>
            ) : results.map(node => (
              <tr key={node.id}
                className={`${node.is_deprecated ? 'opacity-40' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'}`}
              >
                <td className="px-3 py-2">
                  <span className={`font-medium ${node.is_deprecated ? 'line-through text-gray-400' : 'text-gray-900 dark:text-gray-100'}`}>
                    {node.name}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {node.shopify_vendor_codes?.map(c => <CodeChip key={c} code={c} />) ?? <span className="text-gray-300 dark:text-gray-600">—</span>}
                  </div>
                </td>
                <td className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
                  {node.primary_account_label ?? '—'}
                </td>
                <td className="px-3 py-2">
                  <RelBadge type={node.relationship_type} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {results.length > 0 && !query && (
          <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800 text-xs text-gray-400 dark:text-gray-500 text-center">
            Showing active parties · search to find deprecated codes
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function SupplierCosmologyMap() {
  const [tab, setTab] = useState<Tab>('tree')
  const [flat, setFlat] = useState<CosmologyNode[]>([])
  const [roots, setRoots] = useState<CosmologyNode[]>([])
  const [unclassified, setUnclassified] = useState<CosmologyNode[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedNode, setSelectedNode] = useState<CosmologyNode | null>(null)
  const [showDeprecated, setShowDeprecated] = useState(false)
  const [showUnclassified, setShowUnclassified] = useState(false)

  useEffect(() => {
    fetchCosmology()
      .then(data => {
        setFlat(data)
        const result = buildTree(data)
        setRoots(result.roots)
        setUnclassified(result.unclassified)
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  const visibleRoots = useMemo(() =>
    showDeprecated
      ? roots
      : roots.filter(n => !n.is_deprecated && n.relationship_type !== 'deprecated_code')
  , [roots, showDeprecated])

  const stats = useMemo(() => ({
    total:         flat.length,
    active:        flat.filter(n => n.is_active && !n.is_deprecated).length,
    deprecated:    flat.filter(n => n.is_deprecated).length,
    ordering:      flat.filter(n => n.relationship_type === 'ordering_party').length,
    direct:        flat.filter(n => n.relationship_type === 'direct').length,
    unclassified:  unclassified.filter(n => !n.is_deprecated).length,
  }), [flat, unclassified])

  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Supplier Cosmology</h1>
          {!loading && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {stats.active} active · {stats.ordering} ordering parties · {stats.direct} direct · {stats.unclassified} unclassified · {stats.deprecated} deprecated
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={showDeprecated}
              onChange={e => setShowDeprecated(e.target.checked)}
              className="accent-blue-600"
            />
            Show deprecated
          </label>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b dark:border-gray-800">
        {(['tree', 'lookup'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors
              ${tab === t
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
          >
            {t === 'tree' ? 'Tree view' : 'Code lookup'}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-3 rounded bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300 mb-4">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-8 bg-gray-100 dark:bg-gray-800 rounded animate-pulse"
              style={{ marginLeft: `${Math.random() > 0.7 ? 20 : 0}px`, width: `${60 + Math.random() * 30}%` }} />
          ))}
        </div>
      )}

      {!loading && !error && (
        <>
          {tab === 'tree' && (
            <div className="flex gap-4 flex-1 min-h-0">
              {/* Tree panel */}
              <div className={`flex-1 min-h-0 overflow-y-auto border dark:border-gray-800 rounded-lg bg-white dark:bg-gray-950 ${selectedNode ? 'max-w-[60%]' : ''}`}>
                {/* Legend */}
                <div className="px-3 py-2.5 border-b dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
                  <Legend />
                </div>
                <div className="py-1">
                  {visibleRoots.map(root => (
                    <TreeNode
                      key={root.id}
                      node={root}
                      defaultExpanded={root.relationship_type === 'ordering_party' || root.relationship_type === 'direct'}
                      onNodeClick={setSelectedNode}
                    />
                  ))}

                  {/* Unclassified section — seeded drafts awaiting triage */}
                  {unclassified.filter(n => !n.is_deprecated).length > 0 && (
                    <div className="border-t dark:border-gray-800 mt-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setShowUnclassified(v => !v)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded-md"
                      >
                        <span className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                          {showUnclassified ? '▾' : '▸'} Unclassified ({unclassified.filter(n => !n.is_deprecated).length})
                        </span>
                        <span className="text-[10px] text-gray-300 dark:text-gray-600">
                          Seeded drafts awaiting parent assignment
                        </span>
                      </button>
                      {showUnclassified && unclassified
                        .filter(n => !n.is_deprecated)
                        .map(node => (
                          <TreeNode
                            key={node.id}
                            node={node}
                            defaultExpanded={false}
                            onNodeClick={setSelectedNode}
                          />
                        ))
                      }
                    </div>
                  )}
                </div>
              </div>

              {/* Detail panel — sticky so it stays in view regardless of tree scroll position */}
              {selectedNode && (
                <div className="w-72 shrink-0">
                  <div className="sticky top-0 border dark:border-gray-800 rounded-lg overflow-hidden" style={{maxHeight: "calc(100vh - 2rem)"}}>
                    <NodeDetail
                    node={selectedNode}
                    onClose={() => setSelectedNode(null)}
                    onUpdated={(updated) => {
                      // Refresh tree data after any edit
                      fetchCosmology().then(data => {
                        setFlat(data)
                        const result = buildTree(data)
                        setRoots(result.roots)
                        setUnclassified(result.unclassified)
                        // Update selected node with fresh data
                        const fresh = data.find(n => n.id === selectedNode?.id)
                        if (fresh) setSelectedNode({ ...fresh, children: [], depth: 0 })
                      })
                    }}
                  />
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'lookup' && (
            <CodeLookup flat={flat} />
          )}
        </>
      )}
    </div>
  )
}
