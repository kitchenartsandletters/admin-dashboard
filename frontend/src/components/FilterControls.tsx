
import React, { ChangeEvent } from 'react';
import { useState } from 'react';

const ALL_STATUSES = [
  "New",
  "In Progress",
  "Request Filed",
  "Complete"
] as const;

export type StatusPhase = typeof ALL_STATUSES[number];

export interface FilterControlsProps {
  selectedFilter: string;
  handleFilterChange: (e: ChangeEvent<HTMLInputElement>) => void;
  selectedStatuses: StatusPhase[];
  onStatusToggle: (status: StatusPhase) => void;
  clearStatusFilter: () => void;
}

const FilterControls: React.FC<FilterControlsProps> = ({
  selectedFilter,
  handleFilterChange,
  selectedStatuses,
  onStatusToggle,
  clearStatusFilter,
}) => {
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  return (
    <div className="flex gap-3 flex-wrap items-center">
      <input
        type="text"
        placeholder="Filter by title, email or ID..."
        value={selectedFilter}
        onChange={handleFilterChange}
        className="px-3 py-2 border rounded text-sm dark:bg-gray-800 dark:text-white"
      />
      <div className="relative">
        <button
          type="button"
          onClick={() => setShowStatusDropdown(!showStatusDropdown)}
          className="px-3 py-2 border rounded text-sm bg-white dark:bg-gray-800 dark:text-white"
        >
          Status Filter ▾
        </button>

        {showStatusDropdown && (
          <div className="absolute mt-2 w-48 bg-white dark:bg-gray-800 border rounded shadow p-2 z-10">
            {ALL_STATUSES.map((status) => (
              <label key={status} className="flex items-center gap-2 py-1">
                <input
                  type="checkbox"
                  checked={selectedStatuses.includes(status)}
                  onChange={() => onStatusToggle(status)}
                />
                <span className="text-sm dark:text-white">{status}</span>
              </label>
            ))}

            <button
              type="button"
              onClick={clearStatusFilter}
              className="mt-2 w-full text-xs text-left text-blue-600 dark:text-blue-400"
            >
              Clear
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default FilterControls;