// SupplierCosmologyMap.tsx
// Phase 1 MVP Refactored — Highly Visual, Flow-Oriented Read/Write Supplier Cosmology Map.
// Replaces tedious multi-nested tree toggles with an elegant, scannable flow architecture.

import React, { useState, useEffect, useMemo, useCallback, useRef, forwardRef } from 'react'

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
  // Client-built structures
  children: CosmologyNode[]
  depth: number
}

type Tab = 'visual' | 'lookup'

// ---------------------------------------------------------------------------
// Constants & Configuration
// ---------------------------------------------------------------------------

const REL_TYPE_CONFIG: Record<string, {
  label: string
  color: string
  border: string
  dot: string
  description: string
}> = {
  ordering_party: {
    label: 'Ordering Party',
    color: 'bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-300',
    border: 'border-blue-200 dark:border-blue-800 focus:border-blue-500',
    dot: 'bg-blue-500',
    description: 'Direct targets for purchase orders.',
  },
  imprint: {
    label: 'Imprint',
    color: 'bg-indigo-50 dark:bg-indigo-950/20 text-indigo-700 dark:text-indigo-300',
    border: 'border-indigo-200 dark:border-indigo-800 focus:border-indigo-500',
    dot: 'bg-indigo-500',
    description: 'Editorially distinct branch. Orders flow through parent.',
  },
  distribution_client: {
    label: 'Distribution Client',
    color: 'bg-teal-50 dark:bg-teal-950/20 text-teal-700 dark:text-teal-300',
    border: 'border-teal-200 dark:border-teal-800 focus:border-teal-500',
    dot: 'bg-teal-500',
    description: 'Independent house distributed via parent entity.',
  },
  direct: {
    label: 'Direct',
    color: 'bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-300',
    border: 'border-amber-200 dark:border-amber-800 focus:border-amber-500',
    dot: 'bg-amber-500',
    description: 'Isolated workflow — bypassing distributor setups.',
  },
  deprecated_code: {
    label: 'Deprecated',
    color: 'bg-red-50 dark:bg-red-950/10 text-red-600 dark:text-red-400',
    border: 'border-red-200 dark:border-red-900/40 focus:border-red-500',
    dot: 'bg-red-400',
    description: 'Legacy configuration. Avoid matching to active orders.',
  },
}

const ORDERING_METHOD_LABELS: Record<string, string> = {
  email: '✉️ Email', edi: '⚡ EDI', portal: '🌐 Portal', phone: '📞 Phone', other: '⚙️ Other',
}

const SC_BASE_URL = import.meta.env.VITE_SC_BASE_URL as string
const SC_TOKEN = import.meta.env.VITE_SC_ADMIN_TOKEN as string

// ---------------------------------------------------------------------------
// Data Fetching and Structuring
// ---------------------------------------------------------------------------

async function fetchCosmology(): Promise<CosmologyNode[]> {
  const res = await fetch(`${SC_BASE_URL}/api/suppliers/cosmology`, {
    headers: { 'X-Admin-Token': SC_TOKEN },
  })
  if (!res.ok) throw new Error(`Failed to load cosmology: ${res.status}`)
  return res.json()
}

function organizeCosmologyColumns(flat: CosmologyNode[]) {
  const map = new Map<string, CosmologyNode>()
  flat.forEach(n => map.set(n.id, { ...n, children: [], depth: 0 }))

  const roots: CosmologyNode[] = []
  const subTier: CosmologyNode[] = []
  const unclassified: CosmologyNode[] = []

  map.forEach(node => {
    if (node.parent_id && map.has(node.parent_id)) {
      map.get(node.parent_id)!.children.push(node)
      subTier.push(node)
    } else if (node.relationship_type === 'ordering_party' || node.relationship_type === 'direct') {
      roots.push(node)
    } else {
      unclassified.push(node)
    }
  })

  const sortByName = (a: CosmologyNode, b: CosmologyNode) => a.name.localeCompare(b.name)
  roots.sort(sortByName)
  subTier.sort(sortByName)
  unclassified.sort(sortByName)

  return { roots, subTier, unclassified }
}

// ---------------------------------------------------------------------------
// Reimagined Minimal Micro-Components
// ---------------------------------------------------------------------------

function RelBadge({ type }: { type: string | null }) {
  if (!type) return null
  const cfg = REL_TYPE_CONFIG[type]
  if (!cfg) return null
  return (
    <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wide shrink-0 ${cfg.color}`}>
      {cfg.label}
    </span>
  )
}

function CodeChip({ code }: { code: string }) {
  return (
    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200/50 dark:border-gray-700/50">
      {code}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Reimagined Interactive Flow Node Card
// ---------------------------------------------------------------------------

function FlowNodeCard({
  node,
  isSelected,
  isHighlighted,
  onHover,
  onClick
}: {
  node: CosmologyNode
  isSelected: boolean
  isHighlighted: boolean
  onHover: (id: string | null) => void
  onClick: () => void
}) {
  const cfg = REL_TYPE_CONFIG[node.relationship_type ?? '']
  const isDeprecated = node.is_deprecated || node.relationship_type === 'deprecated_code'

  return (
    <div
      onMouseEnter={() => onHover(node.id)}
      onMouseLeave={() => onHover(null)}
      onClick={onClick}
      className={`group relative p-3 border rounded-xl cursor-pointer transition-all duration-200 bg-white dark:bg-gray-950
        ${isSelected 
          ? 'ring-2 ring-blue-500 shadow-md transform -translate-x-1 border-transparent' 
          : isHighlighted 
            ? 'border-blue-400 bg-blue-50/40 dark:bg-blue-950/10 shadow-sm' 
            : 'border-gray-200 dark:border-gray-800 hover:shadow-sm hover:border-gray-300 dark:hover:border-gray-700'
        } ${isDeprecated ? 'opacity-50' : ''}`}
    >
      {/* Decorative Upstream Flow Trace Line indicators */}
      {isHighlighted && (
        <div className="absolute top-1/2 -left-2 w-2 h-0.5 bg-blue-400 transform -translate-y-1/2 dynamic-flow-line" />
      )}
      
      <div className="flex items-start gap-2">
        {cfg && <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${cfg.dot}`} />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className={`text-xs font-semibold truncate ${isSelected ? 'text-blue-600 dark:text-blue-400' : 'text-gray-900 dark:text-gray-100'}`}>
              {node.name}
            </span>
            <RelBadge type={node.relationship_type} />
          </div>

          <div className="flex flex-wrap gap-1 items-center">
            {node.shopify_vendor_codes?.slice(0, 2).map(c => (
              <CodeChip key={c} code={c} />
            ))}
            {(node.shopify_vendor_codes?.length ?? 0) > 2 && (
              <span className="text-[9px] text-gray-400 font-medium">
                +{node.shopify_vendor_codes!.length - 2}
              </span>
            )}
          </div>

          {node.primary_account_label && (
            <div className="mt-1.5 pt-1.5 border-t border-gray-100 dark:border-gray-900 text-[10px] text-gray-400 flex items-center justify-between">
              <span className="truncate max-w-[120px]">{node.primary_account_label}</span>
              {node.ordering_method && <span>{ORDERING_METHOD_LABELS[node.ordering_method] || node.ordering_method}</span>}
            </div>
          )}

          {node.child_count > 0 && !node.parent_id && (
            <div className="mt-1 text-[9px] text-gray-400 font-medium tracking-wide uppercase">
              ➔ Directs {node.child_count} downward entities
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Backend Network Mutation Mechanics
// ---------------------------------------------------------------------------

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

  const prevIdRef = useRef(node.id)
  useEffect(() => {
    if (prevIdRef.current !== node.id) {
      prevIdRef.current = node.id
      setEditing(false)
    }
  }, [node.id])

  return (
    <div className="border-l dark:border-gray-800 bg-white dark:bg-gray-950 flex flex-col h-full">
      <div className="flex items-start justify-between p-4 border-b dark:border-gray-800 shrink-0">
        <div className="min-w-0">
          <h3 className={`font-bold text-sm leading-tight ${isDeprecated ? 'line-through text-gray-400' : 'text-gray-900 dark:text-white'}`}>
            {node.name}
          </h3>
          {cfg && (
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">{cfg.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2 ml-2 shrink-0">
          {!editing && !isDeprecated && (
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
            key={node.id}
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

function NodeReadView({ node, relNotes, isDeprecated }: {
  node: CosmologyNode
  relNotes: string | null
  isDeprecated: boolean
  cfg: typeof REL_TYPE_CONFIG[string] | undefined
}) {
  return (
    <div className="p-4 space-y-4 text-xs">
      {isDeprecated && (
        <div className="px-2.5 py-2 rounded bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/30 text-red-600 dark:text-red-400">
          ⛔ Deprecated legacy entity configuration.
        </div>
      )}
      {node.shopify_vendor_codes && node.shopify_vendor_codes.length > 0 && (
        <div>
          <p className="text-[9px] uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500 mb-1">Assigned Vendor Codes</p>
          <div className="flex flex-wrap gap-1">
            {node.shopify_vendor_codes.map(c => <CodeChip key={c} code={c} />)}
          </div>
        </div>
      )}
      {node.relationship_type && (
        <div>
          <p className="text-[9px] uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500 mb-1">Architecture Assignment</p>
          <RelBadge type={node.relationship_type} />
        </div>
      )}
      {node.primary_account_label && (
        <div className="bg-gray-50 dark:bg-gray-900/40 p-2.5 rounded-lg border border-gray-100 dark:border-gray-800">
          <p className="text-[9px] uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500 mb-1">Upstream Processing Account</p>
          <p className="font-semibold text-gray-800 dark:text-gray-200">{node.primary_account_label}</p>
          {node.primary_account_number && <p className="font-mono text-[11px] text-gray-500 mt-0.5">#{node.primary_account_number}</p>}
          {node.ordering_method && <p className="text-gray-400 mt-1">Order Submission: {ORDERING_METHOD_LABELS[node.ordering_method] ?? node.ordering_method}</p>}
          {node.ordering_email && <p className="text-blue-500 font-medium mt-0.5">{node.ordering_email}</p>}
        </div>
      )}
      {relNotes && (
        <div>
          <p className="text-[9px] uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500 mb-1">Internal Log Notes</p>
          <p className="text-gray-600 dark:text-gray-400 leading-relaxed bg-gray-50 dark:bg-gray-900/20 p-2 rounded">{relNotes}</p>
        </div>
      )}
    </div>
  )
}

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
  const [notes, setNotes] = useState(node.notes?.replace(/^\[(IMPRINT|DISTRIBUTION CLIENT)\]\s*/, '') ?? '')
  const [codes, setCodes] = useState<string[]>(node.shopify_vendor_codes ?? [])
  const [newCode, setNewCode] = useState('')
  const codeInputRef = useRef<HTMLInputElement>(null)

  const isOrderingParty = node.relationship_type === 'ordering_party'
  const [selectedParentId, setSelectedParentId] = useState<string | null>(node.parent_id)
  const [selectedParentName, setSelectedParentName] = useState('')
  const [parentSearch, setParentSearch] = useState('')
  const [parentResults, setParentResults] = useState<CosmologyNode[]>([])
  const [showParentSearch, setShowParentSearch] = useState(false)
  const [reparentReason, setReparentReason] = useState('')
  const parentSearchRef = useRef<HTMLDivElement>(null)

  const [showDeprecate, setShowDeprecate] = useState(false)
  const [deprecateReason, setDeprecateReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (parentSearchRef.current && !parentSearchRef.current.contains(e.target as Node)) {
        setParentResults([])
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (parentSearch.length < 2) { setParentResults([]); return }
    fetchParentCandidates(parentSearch).then(setParentResults)
  }, [parentSearch])

  const addCode = () => {
    const c = newCode.trim().toUpperCase()
    if (c && !codes.includes(c)) setCodes(prev => [...prev, c])
    setNewCode('')
    setTimeout(() => codeInputRef.current?.focus(), 0)
  }

  const removeCode = (c: string) => setCodes(prev => prev.filter(x => x !== c))

  const handleSelectParent = (party: CosmologyNode) => {
    setSelectedParentId(party.id)
    setSelectedParentName(party.name)
    setParentSearch('')
    setParentResults([])
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const updated: Partial<CosmologyNode> = {}
      const editBody: Record<string, unknown> = { reason: 'Admin edit via cosmology map' }

      if (name.trim() !== node.name) { editBody.name = name.trim(); updated.name = name.trim() }
      if (relType !== (node.relationship_type ?? '')) { editBody.relationship_type = relType || null; updated.relationship_type = relType }
      if (notes !== (node.notes?.replace(/^\[(IMPRINT|DISTRIBUTION CLIENT)\]\s*/, '') ?? '')) {
        editBody.notes = notes; updated.notes = notes
      }
      const codesChanged = JSON.stringify([...codes].sort()) !== JSON.stringify([...(node.shopify_vendor_codes ?? [])].sort())
      if (codesChanged) { editBody.shopify_vendor_codes = codes; updated.shopify_vendor_codes = codes }

      if (Object.keys(editBody).length > 1) {
        await apiPatch(`/api/suppliers/${node.id}/cosmology`, editBody)
      }

      if (selectedParentId !== node.parent_id) {
        if (!reparentReason.trim()) {
          setError('Reason required for architecture reparenting.')
          setSaving(false)
          return
        }
        await apiPatch(`/api/suppliers/${node.id}/parent`, {
          new_parent_id: selectedParentId,
          new_relationship_type: relType || undefined,
          reason: reparentReason,
        })
        updated.parent_id = selectedParentId
      }

      onSaved(updated)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Operation failure')
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
      setError(e instanceof Error ? e.message : 'Deprecate operation failed')
    } finally {
      setSaving(false)
    }
  }

  const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
    (props, ref) => (
      <input
        ref={ref}
        {...props}
        className={`w-full px-2 py-1.5 border rounded text-xs dark:bg-gray-900 dark:text-white dark:border-gray-700 focus:ring-1 focus:ring-blue-500 outline-none ${props.className ?? ''}`}
      />
    )
  )

  return (
    <div className="p-4 space-y-4 text-xs">
      <div>
        <p className="text-[9px] uppercase font-bold text-gray-400 mb-1">Entity Name</p>
        <Input value={name} onChange={e => setName(e.target.value)} />
      </div>

      <div>
        <p className="text-[9px] uppercase font-bold text-gray-400 mb-1">Relationship Model</p>
        <select value={relType} onChange={e => setRelType(e.target.value)}
          className="w-full px-2 py-1.5 border rounded text-xs dark:bg-gray-900 dark:text-white dark:border-gray-700 outline-none">
          <option value="">— Unclassified Tier —</option>
          {REL_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      <div>
        <p className="text-[9px] uppercase font-bold text-gray-400 mb-1">Active Matching Codes</p>
        <div className="flex flex-wrap gap-1 mb-2 min-h-[20px]">
          {codes.map(c => (
            <span key={c} className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
              {c} <button type="button" onClick={() => removeCode(c)} className="text-gray-400 hover:text-red-500">×</button>
            </span>
          ))}
        </div>
        <div className="flex gap-1">
          <Input ref={codeInputRef} value={newCode} onChange={e => setNewCode(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCode() } }} placeholder="Add operational code..." className="flex-1" />
          <button type="button" onClick={addCode} className="px-2 py-1 bg-gray-100 dark:bg-gray-800 font-semibold rounded">Add</button>
        </div>
      </div>

      <div>
        <p className="text-[9px] uppercase font-bold text-gray-400 mb-1">Notes</p>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
          className="w-full px-2 py-1.5 border rounded text-xs dark:bg-gray-900 dark:text-white dark:border-gray-700 outline-none resize-none" />
      </div>

      {!isOrderingParty && (
        <div className="p-2 bg-gray-50 dark:bg-gray-900/40 rounded-lg border border-gray-100 dark:border-gray-800">
          <p className="text-[9px] uppercase font-bold text-gray-400 mb-1">Upstream Router Parent</p>
          <div className="mb-1.5">
            {selectedParentId ? (
              <div className="flex items-center justify-between text-[11px] text-blue-700 dark:text-blue-300 font-medium">
                <span className="truncate">{selectedParentName || '(Assigned Parent Entity)'}</span>
                <button type="button" onClick={() => setSelectedParentId(null)} className="text-red-400 hover:text-red-600 ml-2">×</button>
              </div>
            ) : <span className="text-gray-400 italic text-[11px]">No active parent (Becomes independent Root)</span>}
          </div>

          <div ref={parentSearchRef}>
            <button type="button" onClick={() => setShowParentSearch(v => !v)} className="text-[11px] text-blue-500 hover:underline">
              {showParentSearch ? 'Close Selector' : 'Change Stream Assignment...'}
            </button>

            {showParentSearch && (
              <div className="mt-2 space-y-1">
                <Input value={parentSearch} onChange={e => setParentSearch(e.target.value)} placeholder="Type upstream parent entity name..." autoFocus />
                {parentResults.length > 0 && (
                  <div className="border dark:border-gray-700 rounded bg-white dark:bg-gray-950 max-h-24 overflow-y-auto">
                    {parentResults.map(p => (
                      <button key={p.id} type="button" onMouseDown={e => { e.preventDefault(); handleSelectParent(p) }}
                        className="w-full text-left px-2 py-1 hover:bg-gray-50 dark:hover:bg-gray-800 text-[11px] block truncate">
                        {p.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {selectedParentId !== node.parent_id && (
            <div className="mt-2">
              <p className="text-[9px] uppercase font-bold text-amber-500 mb-1">Reparenting Authorization Reason *</p>
              <Input value={reparentReason} onChange={e => setReparentReason(e.target.value)} placeholder="e.g. Distributor reassignment agreement" />
            </div>
          )}
        </div>
      )}

      {error && <div className="p-2 rounded bg-red-50 text-red-600 border border-red-100 text-[11px]">{error}</div>}

      <div className="flex gap-2 pt-2">
        <button type="button" onClick={onCancel} disabled={saving} className="px-3 py-1.5 rounded border border-gray-200 text-gray-500 hover:bg-gray-50">Cancel</button>
        <button type="button" onClick={handleSave} disabled={saving} className="flex-1 px-3 py-1.5 rounded bg-blue-600 text-white font-medium hover:bg-blue-700">{saving ? 'Saving...' : 'Save Changes'}</button>
      </div>

      {!node.is_deprecated && (
        <div className="border-t dark:border-gray-800 pt-3 mt-2">
          {!showDeprecate ? (
            <button type="button" onClick={() => setShowDeprecate(true)} className="text-[11px] text-red-500 hover:underline">Deprecate entity...</button>
          ) : (
            <div className="space-y-1.5 p-2 bg-red-50/50 dark:bg-red-950/10 rounded border border-red-100 dark:border-red-950/30">
              <Input value={deprecateReason} onChange={e => setDeprecateReason(e.target.value)} placeholder="Reason for deprecation..." autoFocus />
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowDeprecate(false)} className="px-2 py-1 border text-gray-500 rounded text-[11px]">Back</button>
                <button type="button" onClick={handleDeprecate} disabled={saving || !deprecateReason.trim()} className="px-2 py-1 bg-red-600 text-white rounded text-[11px]">Confirm Drop</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Design System Legend
// ---------------------------------------------------------------------------

function Legend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-medium text-gray-500 dark:text-gray-400">
      {Object.entries(REL_TYPE_CONFIG).map(([key, cfg]) => (
        <div key={key} className="flex items-center gap-1.5">
          <div className={`w-2 h-2 rounded-full ${cfg.dot}`} />
          <span>{cfg.label}</span>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Fast Flat Code Lookup Reference View
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
        placeholder="Quick lookup by publisher name, vendor code, or account index..."
        autoFocus
        className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-800 dark:text-white dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none"
      />

      <div className="border dark:border-gray-700 rounded-xl overflow-hidden bg-white dark:bg-gray-950">
        <table className="w-full text-xs border-collapse">
          <thead className="bg-gray-50 dark:bg-gray-900 text-left text-gray-400 font-semibold uppercase tracking-wider border-b border-gray-100 dark:border-gray-800">
            <tr>
              <th className="px-4 py-2.5">Supplier Name</th>
              <th className="px-4 py-2.5">Active Marketplace Codes</th>
              <th className="px-4 py-2.5">Upstream Target Route</th>
              <th className="px-4 py-2.5">Typology</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {results.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-400 italic">
                  No active entities matching "{query}"
                </td>
              </tr>
            ) : results.map(node => (
              <tr key={node.id} className={`${node.is_deprecated ? 'opacity-40' : 'hover:bg-gray-50/50 dark:hover:bg-gray-900/30'}`}>
                <td className="px-4 py-2.5 font-medium text-gray-900 dark:text-gray-100">{node.name}</td>
                <td className="px-4 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {node.shopify_vendor_codes?.map(c => <CodeChip key={c} code={c} />) ?? <span className="text-gray-300">—</span>}
                  </div>
                </td>
                <td className="px-4 py-2.5 text-gray-500">{node.primary_account_label || 'Direct processing'}</td>
                <td className="px-4 py-2.5"><RelBadge type={node.relationship_type} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main High-Fidelity Workspace Component
// ---------------------------------------------------------------------------

export default function SupplierCosmologyMap() {
  const [tab, setTab] = useState<Tab>('visual')
  const [flat, setFlat] = useState<CosmologyNode[]>([])
  const [columns, setColumns] = useState<{ roots: CosmologyNode[], subTier: CosmologyNode[], unclassified: CosmologyNode[] }>({ roots: [], subTier: [], unclassified: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedNode, setSelectedNode] = useState<CosmologyNode | null>(null)
  
  // Interactive connection state hooks
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  const [showDeprecated, setShowDeprecated] = useState(false)

  const reloadData = useCallback(() => {
    fetchCosmology()
      .then(data => {
        setFlat(data)
        setColumns(organizeCosmologyColumns(data))
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to synchronize system state'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    reloadData()
  }, [reloadData])

  // Computed visual dependencies for real-time relational flow pathing
  const relationalHighlightSet = useMemo(() => {
    const activeId = hoveredNodeId || selectedNode?.id
    if (!activeId) return new Set<string>()

    const highlighted = new Set<string>([activeId])
    const targetNode = flat.find(n => n.id === activeId)

    if (targetNode) {
      if (targetNode.parent_id) {
        highlighted.add(targetNode.parent_id)
        const absoluteGrandparent = flat.find(n => n.id === targetNode.parent_id)
        if (absoluteGrandparent?.parent_id) highlighted.add(absoluteGrandparent.parent_id)
      }
      flat.forEach(n => {
        if (n.parent_id === activeId) {
          highlighted.add(n.id)
        }
      })
    }
    return highlighted
  }, [hoveredNodeId, selectedNode, flat])

  const visibleRoots = useMemo(() => 
    showDeprecated ? columns.roots : columns.roots.filter(n => !n.is_deprecated)
  , [columns.roots, showDeprecated])

  const visibleSubTier = useMemo(() => 
    showDeprecated ? columns.subTier : columns.subTier.filter(n => !n.is_deprecated)
  , [columns.subTier, showDeprecated])

  const stats = useMemo(() => ({
    total: flat.length,
    active: flat.filter(n => n.is_active && !n.is_deprecated).length,
    ordering: flat.filter(n => n.relationship_type === 'ordering_party').length,
    unclassified: columns.unclassified.filter(n => !n.is_deprecated).length
  }), [flat, columns.unclassified])

  return (
    <div className="flex flex-col h-screen max-h-screen bg-gray-50/40 dark:bg-gray-950 p-6 text-gray-900 dark:text-gray-100 overflow-hidden">
      {/* Structural Page Header */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-gray-900 dark:text-gray-50">Supplier Cosmology Ecosystem</h1>
          {!loading && (
            <p className="text-xs text-gray-500 mt-0.5 font-medium">
              Ecosystem Map Indexing: <span className="text-blue-600 font-semibold">{stats.active}</span> active publishers · <span className="text-indigo-600 font-semibold">{stats.ordering}</span> fulfillment endpoints · <span className="text-amber-600 font-semibold">{stats.unclassified}</span> awaiting triage
            </p>
          )}
        </div>
        
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-xs font-semibold text-gray-500 cursor-pointer bg-white dark:bg-gray-900 px-3 py-1.5 border dark:border-gray-800 rounded-lg shadow-sm">
            <input type="checkbox" checked={showDeprecated} onChange={e => setShowDeprecated(e.target.checked)} className="rounded text-blue-600 focus:ring-0" />
            Include Deprecated References
          </label>
        </div>
      </div>

      {/* Structural Action Tabs */}
      <div className="flex gap-2 p-1 bg-gray-200/60 dark:bg-gray-900 rounded-xl mb-4 self-start shrink-0">
        <button onClick={() => setTab('visual')} className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${tab === 'visual' ? 'bg-white dark:bg-gray-800 shadow-sm text-blue-600 dark:text-blue-400' : 'text-gray-500 hover:text-gray-800'}`}>
          Network Topology Map
        </button>
        <button onClick={() => setTab('lookup')} className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${tab === 'lookup' ? 'bg-white dark:bg-gray-800 shadow-sm text-blue-600 dark:text-blue-400' : 'text-gray-500 hover:text-gray-800'}`}>
          Flat Code Registry Index
        </button>
      </div>

      {error && <div className="p-3 mb-4 rounded-xl bg-red-50 text-red-600 text-xs font-semibold border border-red-100 shrink-0">{error}</div>}

      {loading ? (
        <div className="grid grid-cols-3 gap-4 flex-1 animate-pulse">
          {[1, 2, 3].map(c => (
            <div key={c} className="bg-gray-100 dark:bg-gray-900 rounded-xl border dark:border-gray-800 p-4 space-y-3">
              <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-1/3 mb-4" />
              <div className="h-16 bg-gray-200/50 dark:bg-gray-800/50 rounded-xl" />
              <div className="h-16 bg-gray-200/50 dark:bg-gray-800/50 rounded-xl" />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex-1 flex gap-4 min-h-0 overflow-hidden">
          {tab === 'visual' ? (
            <div className="flex-1 flex gap-4 min-h-0 items-stretch">
              
              {/* INTERACTIVE STREAMING ARCHITECTURE BLOCK */}
              <div className={`flex-1 grid grid-cols-3 gap-4 border dark:border-gray-800 rounded-2xl p-4 bg-gray-100/40 dark:bg-gray-900/10 overflow-hidden min-h-0`}>
                
                {/* COLUMN 1: UPSTREAM ORDERING PARTIES / DISTRIBUTORS */}
                <div className="flex flex-col min-h-0">
                  <div className="mb-2 pb-2 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between shrink-0">
                    <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Level 1: Primary Routers & Directs</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-blue-100 text-blue-700">{visibleRoots.length}</span>
                  </div>
                  <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                    {visibleRoots.map(node => (
                      <FlowNodeCard
                        key={node.id}
                        node={node}
                        isSelected={selectedNode?.id === node.id}
                        isHighlighted={relationalHighlightSet.has(node.id)}
                        onHover={setHoveredNodeId}
                        onClick={() => setSelectedNode(node)}
                      />
                    ))}
                  </div>
                </div>

                {/* COLUMN 2: DOWNSTREAM IMPRINTS & CLIENTS */}
                <div className="flex flex-col min-h-0 border-l border-r border-gray-200/60 dark:border-gray-800/60 px-2">
                  <div className="mb-2 pb-2 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between shrink-0">
                    <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Level 2: Dependent Sub-Imprints</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-indigo-100 text-indigo-700">{visibleSubTier.length}</span>
                  </div>
                  <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                    {visibleSubTier.map(node => (
                      <FlowNodeCard
                        key={node.id}
                        node={node}
                        isSelected={selectedNode?.id === node.id}
                        isHighlighted={relationalHighlightSet.has(node.id)}
                        onHover={setHoveredNodeId}
                        onClick={() => setSelectedNode(node)}
                      />
                    ))}
                  </div>
                </div>

                {/* COLUMN 3: SYSTEM UNCLASSIFIED / SEEDED DRAFTS */}
                <div className="flex flex-col min-h-0">
                  <div className="mb-2 pb-2 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between shrink-0">
                    <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Triage: Seeded Data Drafts</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-amber-100 text-amber-700">{columns.unclassified.filter(n => showDeprecated ? true : !n.is_deprecated).length}</span>
                  </div>
                  <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                    {columns.unclassified
                      .filter(node => showDeprecated ? true : !node.is_deprecated)
                      .map(node => (
                        <FlowNodeCard
                          key={node.id}
                          node={node}
                          isSelected={selectedNode?.id === node.id}
                          isHighlighted={relationalHighlightSet.has(node.id)}
                          onHover={setHoveredNodeId}
                          onClick={() => setSelectedNode(node)}
                        />
                    ))}
                  </div>
                </div>

              </div>

              {/* DYNAMIC METRIC & EDIT CONTROLLER DRAWER */}
              <div className={`shrink-0 transition-all duration-300 flex flex-col h-full overflow-hidden ${selectedNode ? 'w-80' : 'w-64 bg-white dark:bg-gray-950 border dark:border-gray-800 rounded-2xl p-4 justify-between shadow-sm'}`}>
                {selectedNode ? (
                  <div className="h-full border dark:border-gray-800 rounded-2xl overflow-hidden shadow-sm">
                    <NodeDetail
                      node={selectedNode}
                      onClose={() => setSelectedNode(null)}
                      onUpdated={(updated) => {
                        reloadData()
                        const fresh = flat.find(n => n.id === selectedNode?.id)
                        if (fresh) setSelectedNode({ ...fresh, children: [], depth: 0 })
                      }}
                    />
                  </div>
                ) : (
                  <>
                    <div className="space-y-4">
                      <div className="border-b dark:border-gray-800 pb-2">
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Topology Guideline</p>
                        <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                          Hover over any entity card to dynamically path its upstream routing network or downstream operational children.
                        </p>
                      </div>
                      <Legend />
                    </div>
                    
                    <div className="bg-gray-50 dark:bg-gray-900/50 rounded-xl p-3 border border-gray-100 dark:border-gray-800">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Ecosystem Status</p>
                      <div className="text-[11px] font-medium text-gray-500 space-y-1">
                        <div className="flex justify-between"><span>Active System Keys:</span><span className="font-bold text-gray-900 dark:text-gray-100">{stats.active}</span></div>
                        <div className="flex justify-between"><span>Total Monitored Nodes:</span><span>{stats.total}</span></div>
                      </div>
                    </div>
                  </>
                )}
              </div>

            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              <CodeLookup flat={flat} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}