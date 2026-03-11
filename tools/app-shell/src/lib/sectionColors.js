// Section accent colors — distinguishes Sales from Purchases visually
export const SECTION_COLORS = {
  Home: { accent: '#6366f1', bg: 'bg-indigo-50', border: 'border-indigo-400', text: 'text-indigo-600' },
  Sales: { accent: '#2563eb', bg: 'bg-blue-50', border: 'border-blue-500', text: 'text-blue-600' },
  Purchases: { accent: '#7c3aed', bg: 'bg-violet-50', border: 'border-violet-500', text: 'text-violet-600' },
  Finance: { accent: '#059669', bg: 'bg-emerald-50', border: 'border-emerald-500', text: 'text-emerald-600' },
  Inventory: { accent: '#d97706', bg: 'bg-amber-50', border: 'border-amber-500', text: 'text-amber-600' },
  People: { accent: '#db2777', bg: 'bg-pink-50', border: 'border-pink-500', text: 'text-pink-600' },
  Projects: { accent: '#0891b2', bg: 'bg-cyan-50', border: 'border-cyan-500', text: 'text-cyan-600' },
  Settings: { accent: '#6b7280', bg: 'bg-gray-50', border: 'border-gray-400', text: 'text-gray-600' },
};

export function getSectionColor(groupName) {
  return SECTION_COLORS[groupName] || SECTION_COLORS.Home;
}
