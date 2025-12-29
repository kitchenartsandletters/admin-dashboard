import { useAuth } from '../auth/AuthProvider';
import { getReportsForRole } from './registry';
import ReportCard from '../reports/ReportCard';

export default function ReportsPage() {
  const { role } = useAuth();

  const reports = role ? getReportsForRole(role) : [];

  return (
    <div className="p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Reports</h1>
        <p className="text-sm text-gray-500">
          Operational reports generated from Shopify data. Reports are delivered by email.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {reports.map(report => (
          <ReportCard key={report.id} report={report} />
        ))}
      </div>
    </div>
  );
}