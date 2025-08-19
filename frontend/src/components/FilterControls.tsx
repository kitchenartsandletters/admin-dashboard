import React, { ChangeEvent } from 'react';

export interface FilterControlsProps {
  selectedFilter: string;
  handleFilterChange: (e: ChangeEvent<HTMLInputElement>) => void;
}

const FilterControls: React.FC<FilterControlsProps> = ({
  selectedFilter,
  handleFilterChange,
}) => {
  return (
    <div className="flex gap-3 flex-wrap items-center">
      <input
        type="text"
        placeholder="Filter by title, email or ID..."
        value={selectedFilter}
        onChange={handleFilterChange}
        className="px-3 py-2 border rounded text-sm dark:bg-gray-800 dark:text-white"
      />
    </div>
  );
};

export default FilterControls;