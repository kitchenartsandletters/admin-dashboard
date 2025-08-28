import { ReactNode } from 'react';
import { DashboardHeaderProps } from '../types';

const DashboardHeader = ({ title }: DashboardHeaderProps) => {
  return (
    <h1 className="text-3xl font-semibold text-gray-900 dark:text-gray-100">
      {title}
    </h1>
  );
};

export default DashboardHeader;