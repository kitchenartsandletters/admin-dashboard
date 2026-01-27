import React, { ChangeEvent, useEffect, useRef } from 'react';
import { useState } from 'react';
import { StatusPhase } from '../types';

// Moved ALL_STATUSES to types or passed down, but for display logic:
const ALL_STATUSES: StatusPhase[] = [
  "New",
  "In Progress",
  "Request Filed",
  "Complete"
];

export interface FilterControlsProps {
  selectedFilter: string;
  handleFilterChange: (e: ChangeEvent<HTMLInputElement>) => void;
  selectedStatuses: StatusPhase[];
  onStatusToggle: (status: StatusPhase) => void;
  clearStatusFilter: () => void;
  selectAllStatusFilter: () => void;
}

const FilterControls: React.FC<FilterControlsProps> = ({
  selectedFilter,
  handleFilterChange,
  selectedStatuses,
  onStatusToggle,
  clearStatusFilter,
  selectAllStatusFilter,
}) => {
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);

  // 1. Create a ref for the dropdown container
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 2. Add Event Listener to detect outside clicks
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowStatusDropdown(false);
      }
    }

    // Bind the event listener
    document.addEventListener("mousedown", handleClickOutside);
    
    // Unbind the listener on cleanup (component unmount)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  return (
    // Changed to flex-col for mobile, flex-row for desktop
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full">
      <input
        type="text"
        placeholder="Filter by title, email or ID..."
        value={selectedFilter}
        onChange={handleFilterChange}
        className="px-3 py-2 border rounded text-sm bg-white dark:bg-gray-800 dark:text-white dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none flex-1"
      />
      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setShowStatusDropdown(!showStatusDropdown)}
          className={`
            w-full sm:w-auto px-3 py-2 border rounded text-sm flex justify-between items-center gap-2
            ${selectedStatuses.length > 0 && selectedStatuses.length < 4
              ? 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800' 
              : 'bg-white dark:bg-gray-800 dark:text-white dark:border-gray-600'}
          `}
        >
          <span>{selectedStatuses.length < 4 ? `${selectedStatuses.length} Statuses` : `${selectedStatuses.length} Statuses`}</span>
          <span className="text-xs">▾</span>
        </button>

        {showStatusDropdown && (
          <div className="absolute top-full left-0 mt-2 w-full sm:w-48 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded shadow-xl p-2 z-50">
            <div className="space-y-1">
              {ALL_STATUSES.map((status) => (
                <label key={status} className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedStatuses.includes(status)}
                    onChange={() => onStatusToggle(status)}
                    className="rounded text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-200">{status}</span>
                </label>
              ))}
            </div>
            {/* 3. Updated Footer with Two Buttons */}
            <div className="border-t dark:border-gray-700 mt-2 pt-2 flex gap-2">
               <button
                type="button"
                onClick={selectAllStatusFilter} // No close logic here
                className="flex-1 text-xs text-center text-blue-600 dark:text-blue-400 hover:underline py-1 border-r border-gray-200 dark:border-gray-700"
              >
                Select All
              </button>
              <button
                type="button"
                onClick={clearStatusFilter} // No close logic here
                className="flex-1 text-xs text-center text-red-500 hover:text-red-700 hover:underline py-1"
              >
                Clear
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FilterControls;