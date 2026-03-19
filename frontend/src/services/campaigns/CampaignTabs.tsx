type Tab = "dashboard" | "responses";

export default function CampaignTabs({
  activeTab,
  onChange,
}: {
  activeTab: Tab;
  onChange: (tab: Tab) => void;
}) {
  return (
    <div className="inline-flex p-1 bg-gray-100 dark:bg-gray-800 rounded-md border dark:border-gray-700 shadow-sm">
      <button
        onClick={() => onChange("dashboard")}
        className={`px-4 py-1.5 text-xs sm:text-sm font-medium rounded transition-all ${
          activeTab === "dashboard"
            ? "bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm"
            : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
        }`}
      >
        Dashboard
      </button>
      <button
        onClick={() => onChange("responses")}
        className={`px-4 py-1.5 text-xs sm:text-sm font-medium rounded transition-all ${
          activeTab === "responses"
            ? "bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm"
            : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
        }`}
      >
        Responses
      </button>
    </div>
  );
}