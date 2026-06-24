export type ReportId =
  | 'daily_sales_kal'
  | 'daily_sales_nyfs'
  | 'weekly_maintenance'
  | 'lop_unfulfilled';

export type DeliveryMethod = 'email' | 'table';
export type ReportFormat   = 'pdf' | 'csv';

export interface ReportDefinition {
  id:                       ReportId;
  title:                    string;
  description:              string;
  cadence:                  'daily' | 'weekly' | 'on_demand';
  // 0=Sun 1=Mon … 6=Sat. Days the automated run fires.
  scheduledDays:            number[];
  // Hour in ET (24h) at which the automated run fires.
  scheduledRunHourET:       number | null;
  // Minutes before scheduledRunHourET at which the window edit locks.
  editCutoffMinutes:        number;
  rolesAllowed:             Array<'admin' | 'editor' | 'user'>;
  supportsManualRun:        boolean;
  supportsParameters:       boolean;
  supportsDateRange:        boolean;
  supportsScheduleOverride: boolean;
  supportedFormats:         ReportFormat[];
  supportedDeliveryMethods: DeliveryMethod[];
  status:                   'active' | 'disabled' | 'experimental';
  // Location metadata — present on location-scoped reports
  locationLabel?:           string;
  locationShort?:           'kal' | 'nyfs';
}

export const REPORTS: ReportDefinition[] = [
  {
    id:          'daily_sales_kal',
    title:       'Daily Sales Report',
    description: 'Previous business-day sales for 1435 Lexington Ave, grouped by product. Includes inventory, preorder, backorder, OOS, and out-of-print sections. Delivered via email as CSV + PDF.',
    cadence:                  'daily',
    scheduledDays:            [1, 2, 3, 4, 5, 6], // Mon–Sat
    scheduledRunHourET:       10,
    editCutoffMinutes:        60,  // locks at 9:00 AM ET
    rolesAllowed:             ['admin', 'editor'],
    supportsManualRun:        true,
    supportsParameters:       true,
    supportsDateRange:        true,
    supportsScheduleOverride: true,
    supportedFormats:         ['pdf', 'csv'],
    supportedDeliveryMethods: ['email', 'table'],
    status:                   'active',
    locationLabel:            'Kitchen Arts & Letters',
    locationShort:            'kal',
  },
  {
    id:          'daily_sales_nyfs',
    title:       'Daily Sales Report',
    description: 'Previous business-day sales for 111 Broadway, grouped by product. Includes inventory, preorder, backorder, OOS, and out-of-print sections. Delivered via email as CSV + PDF.',
    cadence:                  'daily',
    scheduledDays:            [2, 3, 4, 5, 6, 0], // Tue–Sun (0=Sun)
    scheduledRunHourET:       12,
    editCutoffMinutes:        60,  // locks at 11:00 AM ET
    rolesAllowed:             ['admin', 'editor'],
    supportsManualRun:        true,
    supportsParameters:       true,
    supportsDateRange:        true,
    supportsScheduleOverride: true,
    supportedFormats:         ['pdf', 'csv'],
    supportedDeliveryMethods: ['email', 'table'],
    status:                   'active',
    locationLabel:            'New York Food Stories',
    locationShort:            'nyfs',
  },
  {
    id:          'weekly_maintenance',
    title:       'Weekly Maintenance Report',
    description: 'Inventory hygiene checks including negative inventory, published products without collections, and OOS items with unfulfilled orders.',
    cadence:                  'weekly',
    scheduledDays:            [1], // Monday
    scheduledRunHourET:       10,
    editCutoffMinutes:        60,
    rolesAllowed:             ['admin', 'editor'],
    supportsManualRun:        true,
    supportsParameters:       true,
    supportsDateRange:        true,
    supportsScheduleOverride: false,
    supportedFormats:         ['csv'],
    supportedDeliveryMethods: ['email', 'table'],
    status:                   'active',
  },
  {
    id:          'lop_unfulfilled',
    title:       'LOP Unfulfilled Orders',
    description: 'Unfulfilled and partially fulfilled shipping orders since the most recent LOP-tagged order. Outputs detailed and summary CSV.',
    cadence:                  'on_demand',
    scheduledDays:            [],
    scheduledRunHourET:       null,
    editCutoffMinutes:        0,
    rolesAllowed:             ['admin', 'editor'],
    supportsManualRun:        true,
    supportsParameters:       true,
    supportsDateRange:        true,
    supportsScheduleOverride: false,
    supportedFormats:         ['csv'],
    supportedDeliveryMethods: ['email', 'table'],
    status:                   'active',
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

// Returns the daily sales reports grouped — used by DailySalesGroup
export function getDailySalesReports(role: string): ReportDefinition[] {
  return getReportsForRole(role).filter(r => r.id.startsWith('daily_sales_'));
}

// Returns non-daily-sales reports — used by ReportsPage for the general grid
export function getOtherReports(role: string): ReportDefinition[] {
  return getReportsForRole(role).filter(r => !r.id.startsWith('daily_sales_'));
}