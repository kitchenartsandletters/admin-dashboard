type Tab = "dashboard" | "responses";

export default function CampaignTabs({
  activeTab,
  onChange,
}: {
  activeTab: Tab;
  onChange: (tab: Tab) => void;
}) {
  function TabButton({
    label,
    value,
  }: {
    label: string;
    value: Tab;
  }) {
    const active = activeTab === value;

    return (
      <button
        onClick={() => onChange(value)}
        className={`px-3 py-1 text-sm rounded ${
          active
            ? "bg-white text-black shadow-sm"
            : "text-gray-500"
        }`}
      >
        {label}
      </button>
    );
  }

  return (
    <div className="inline-flex p-1 bg-gray-100 rounded-md border">
      <TabButton label="Dashboard" value="dashboard" />
      <TabButton label="Responses" value="responses" />
    </div>
  );
}