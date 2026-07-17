export default function TabBar({ tabs, active, onChange }) {
  return (
    <div className="flex px-6 py-3">
      <div className="inline-flex gap-1 p-1 rounded-xl" style={{ background: '#F5F7F9' }}>
        {tabs.map((tab, i) => (
          <button
            key={tab}
            type="button"
            onClick={() => onChange(i)}
            className={`px-4 py-[5px] text-sm rounded-lg transition-colors
              ${active === i
                ? 'bg-card font-medium text-[#121217] shadow-[0px_1px_3px_rgba(18,18,23,0.1),0px_1px_2px_rgba(18,18,23,0.06)]'
                : 'font-normal text-[#121217] hover:bg-card/50'}`}
          >
            {tab}
          </button>
        ))}
      </div>
    </div>
  );
}
