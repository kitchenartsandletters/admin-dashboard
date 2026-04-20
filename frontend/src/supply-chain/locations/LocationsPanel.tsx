// LocationsPanel.tsx
// Locations registry panel for the System Status page.
// Shows all locations from the supply chain registry with their Shopify GIDs,
// seasonal flags, and sync status. Provides a "Sync from Shopify" button.
//
// Drop this into SystemStatusDashboard.tsx:
//   import LocationsPanel from '../supply-chain/locations/LocationsPanel'
//   <LocationsPanel />

import React from 'react'
import { useLocations } from '../hooks/useLocations'

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold
      ${active
        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
        : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
      }`}
    >
      {active ? 'Active' : 'Inactive'}
    </span>
  )
}

function SeasonalBadge({ seasonal }: { seasonal: boolean }) {
  if (!seasonal) return null
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 ml-1">
      Seasonal
    </span>
  )
}

export default function LocationsPanel() {
  const {
    locations,
    loading,
    triggerSync,
    syncing,
    syncResult,
    syncError,
  } = useLocations()

  return (
    <div className="border dark:border-gray-700 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700">
        <div>
          <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-100">
            Shopify Locations
          </h3>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            {loading
              ? 'Loading…'
              : `${locations.length} location${locations.length !== 1 ? 's' : ''} in registry`}
          </p>
        </div>
        <button
          onClick={triggerSync}
          disabled={syncing || loading}
          className="px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold disabled:opacity-50 transition-colors active:scale-[0.98]"
        >
          {syncing ? 'Syncing…' : 'Sync from Shopify'}
        </button>
      </div>

      {/* Sync result */}
      {syncResult && (
        <div className="px-4 py-2.5 bg-green-50 dark:bg-green-900/20 border-b dark:border-gray-700 text-xs text-green-700 dark:text-green-300">
          Sync complete — {syncResult.synced} locations fetched,{' '}
          {syncResult.created} created, {syncResult.updated} updated
          {syncResult.deactivated > 0 && `, ${syncResult.deactivated} deactivated`}
        </div>
      )}

      {/* Sync error */}
      {syncError && (
        <div className="px-4 py-2.5 bg-red-50 dark:bg-red-900/20 border-b dark:border-gray-700 text-xs text-red-700 dark:text-red-300">
          Sync failed: {syncError}
        </div>
      )}

      {/* Location list */}
      {loading ? (
        <div className="divide-y dark:divide-gray-800">
          {[1, 2].map(i => (
            <div key={i} className="px-4 py-3 flex items-center justify-between">
              <div className="space-y-1.5">
                <div className="h-3 w-36 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                <div className="h-2 w-52 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
              </div>
              <div className="h-4 w-14 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse" />
            </div>
          ))}
        </div>
      ) : locations.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-gray-400 dark:text-gray-500">
          No locations in registry.{' '}
          <button
            onClick={triggerSync}
            className="text-blue-500 hover:underline"
          >
            Sync from Shopify
          </button>{' '}
          to populate.
        </div>
      ) : (
        <div className="divide-y dark:divide-gray-800">
          {locations.map(loc => (
            <div key={loc.id} className="px-4 py-3 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {loc.name}
                  </span>
                  <SeasonalBadge seasonal={loc.is_seasonal} />
                </div>
                {loc.address && (
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                    {loc.address}
                  </p>
                )}
                <p className="text-[10px] font-mono text-gray-300 dark:text-gray-600 mt-1 truncate">
                  {loc.id}
                </p>
                {loc.is_seasonal && (loc.active_from || loc.active_until) && (
                  <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">
                    {loc.active_from && `Opens ${loc.active_from}`}
                    {loc.active_from && loc.active_until && ' · '}
                    {loc.active_until && `Closes ${loc.active_until}`}
                  </p>
                )}
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <StatusBadge active={loc.is_active} />
                {loc.is_fulfillment && (
                  <span className="text-[10px] text-gray-400 dark:text-gray-500">
                    Fulfillment
                  </span>
                )}
                {loc.shopify_synced_at && (
                  <span className="text-[10px] text-gray-300 dark:text-gray-600">
                    Synced {new Date(loc.shopify_synced_at).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
