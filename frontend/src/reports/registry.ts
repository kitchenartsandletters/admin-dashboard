export type ReportId =
  | 'daily_sales'
  | 'weekly_maintenance'
  | 'lop_unfulfilled';

export type DeliveryMethod = 'email' | 'table';
export type ReportFormat = 'pdf' | 'csv';

export interface ReportDefinition {
  id: ReportId;
  title: string;
  description: string;
  cadence: 'daily' | 'weekly' | 'on_demand';
  rolesAllowed: Array<'admin' | 'editor' | 'user'>;
  supportsManualRun: boolean;
  supportsParameters: boolean;
  supportsDateRange: boolean;
  supportedFormats: ReportFormat[];
  supportedDeliveryMethods: DeliveryMethod[];
  status: 'active' | 'disabled' | 'experimental';
}

export const REPORTS: ReportDefinition[] = [
  {
    id: 'daily_sales',
    title: 'Daily Sales Report',
    description:
      'Previous business-day sales grouped by product. Includes inventory, preorder, backorder, and OOS sections. Delivered via email as CSV + PDF.',
    cadence: 'daily',
    rolesAllowed: ['admin', 'editor'],
    supportsManualRun: true,
    supportsParameters: true,
    supportsDateRange: true,
    supportedFormats: ['pdf', 'csv'],
    supportedDeliveryMethods: ['email', 'table'],
    status: 'active',
  },
  {
    id: 'weekly_maintenance',
    title: 'Weekly Maintenance Report',
    description:
      'Inventory hygiene checks including negative inventory, published products without collections, and OOS items with unfulfilled orders.',
    cadence: 'weekly',
    rolesAllowed: ['admin'],
    supportsManualRun: true,
    supportsParameters: true,
    supportsDateRange: true,
    supportedFormats: ['csv'],
    supportedDeliveryMethods: ['email', 'table'],
    status: 'active',
  },
  {
    id: 'lop_unfulfilled',
    title: 'LOP Unfulfilled Orders',
    description:
      'Unfulfilled and partially fulfilled shipping orders since the most recent LOP-tagged order. Outputs detailed and summary CSV.',
    cadence: 'on_demand',
    rolesAllowed: ['admin', 'editor'],
    supportsManualRun: true,
    supportsParameters: true,
    supportsDateRange: true,
    supportedFormats: ['csv'],
    supportedDeliveryMethods: ['email', 'table'],
    status: 'active',
  },
];

export function getReportsForRole(role: string): ReportDefinition[] {
  return REPORTS.filter(r => r.rolesAllowed.includes(role as any));
}

export function getRunnableReportsForRole(role: string): ReportDefinition[] {
  return REPORTS.filter(
    r =>
      r.supportsManualRun &&
      r.status === 'active' &&
      r.rolesAllowed.includes(role as any)
  );
}

export function getReportById(id: ReportId): ReportDefinition | undefined {
  return REPORTS.find(r => r.id === id);
}