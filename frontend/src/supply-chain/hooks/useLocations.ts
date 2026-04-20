// useLocations.ts
// Shared hook for fetching the location registry from the supply chain service.
// Caches results in module-level state so multiple components don't re-fetch
// on every mount. Cache is invalidated when syncLocations() is called.
//
// Usage:
//   const { locations, locationName, loading } = useLocations()
//   locationName('gid://shopify/Location/12345') // → "Kitchen Arts & Letters"
//
// locationName() is safe to call before loading completes — returns the raw
// GID as a fallback so the UI never shows undefined.

import { useEffect, useState, useCallback } from 'react'
import { fetchLocations, syncLocations, Location } from '../../api/supplyChainApi'

// Module-level cache — survives component unmounts
let _cache: Location[] | null = null
let _loading = false
let _listeners: Array<() => void> = []

function notifyListeners() {
  _listeners.forEach(fn => fn())
}

export function useLocations() {
  const [locations, setLocations] = useState<Location[]>(_cache ?? [])
  const [loading, setLoading] = useState(_cache === null)
  const [syncResult, setSyncResult] = useState<{
    synced: number
    created: number
    updated: number
    deactivated: number
  } | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)

  useEffect(() => {
    // Register as a listener so we update when cache changes
    const update = () => {
      setLocations(_cache ?? [])
      setLoading(false)
    }
    _listeners.push(update)

    // Load from cache or fetch
    if (_cache !== null) {
      setLocations(_cache)
      setLoading(false)
    } else if (!_loading) {
      _loading = true
      fetchLocations()
        .then(data => {
          _cache = data
          notifyListeners()
        })
        .catch(() => {
          _cache = []
          notifyListeners()
        })
        .finally(() => {
          _loading = false
        })
    }

    return () => {
      _listeners = _listeners.filter(fn => fn !== update)
    }
  }, [])

  // Resolve a Shopify GID to a human-readable name
  const locationName = useCallback((id: string | null | undefined): string => {
    if (!id) return '—'
    const match = (_cache ?? []).find(l => l.id === id)
    return match?.name ?? id  // fallback to raw GID while loading
  }, [locations]) // eslint-disable-line react-hooks/exhaustive-deps

  // Trigger a sync from Shopify and refresh the cache
  const triggerSync = useCallback(async () => {
    setSyncing(true)
    setSyncError(null)
    setSyncResult(null)
    try {
      const result = await syncLocations()
      // Invalidate cache and reload
      _cache = null
      const fresh = await fetchLocations()
      _cache = fresh
      notifyListeners()
      setSyncResult(result)
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }, [])

  return {
    locations,
    loading,
    locationName,
    triggerSync,
    syncing,
    syncResult,
    syncError,
  }
}
