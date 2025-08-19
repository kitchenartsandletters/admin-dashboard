import React, { useEffect, useState } from 'react';
import { fetchSystemStatuses, ServiceStatus, EndpointStatus } from '../components/SystemStatusService';

const statusColor = (status: string) => {
  switch (status) {
    case 'Healthy': return 'bg-green-100 text-green-700 border-green-300';
    case 'Degraded': return 'bg-yellow-100 text-yellow-700 border-yellow-300';
    case 'Offline': return 'bg-red-100 text-red-700 border-red-300';
    case 'Partial': return 'bg-orange-100 text-orange-700 border-orange-300';
    default: return 'bg-gray-100 text-gray-700 border-gray-300';
  }
};

const SystemStatusDashboard: React.FC = () => {
  const [statuses, setStatuses] = useState<ServiceStatus[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadStatuses = async () => {
      const results = await fetchSystemStatuses();
      setStatuses(results);
      setLoading(false);
    };

    loadStatuses();
    const interval = setInterval(loadStatuses, 1800 * 1000); // every 30 minutes

    return () => clearInterval(interval);
  }, []);

  const allStatuses = statuses.flatMap(svc => svc.endpoints.map(ep => ep.status));
  let summaryStatus: 'Healthy' | 'Degraded' | 'Offline' | 'Partial' = 'Healthy';
  if (allStatuses.every(s => s === 'Healthy')) {
    summaryStatus = 'Healthy';
  } else if (allStatuses.every(s => s === 'Offline')) {
    summaryStatus = 'Offline';
  } else if (allStatuses.some(s => s === 'Offline')) {
    summaryStatus = 'Partial';
  } else {
    summaryStatus = 'Degraded';
  }

  return (
    <div className="space-y-4">
      <div className={`inline-block px-3 py-1 rounded text-sm font-medium ${statusColor(summaryStatus)}`}>
        Overall System Status: {summaryStatus}
      </div>
      <h1 className="text-2xl font-semibold mb-4">System Status</h1>
      {loading ? (
        <p>Loading status...</p>
      ) : (
        <div className="space-y-6">
          {statuses.map((service, sIdx) => (
            <div key={sIdx}>
              <h2 className="text-lg font-semibold">{service.name}</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {service.endpoints.map((ep: EndpointStatus, eIdx: number) => (
                  <div
                    key={eIdx}
                    className={`border rounded-lg p-4 shadow-md dark:bg-gray-800 dark:border-gray-700 ${statusColor(ep.status)}`}
                  >
                    <p className="text-sm break-words">
                      <strong>URL:</strong> {ep.url}
                    </p>
                    <p className="text-sm">
                      <strong>Status:</strong> {ep.status}
                    </p>
                    {ep.code && (
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        Code: {ep.code} — {ep.message}
                      </p>
                    )}
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                      Checked: {service.lastChecked}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SystemStatusDashboard;