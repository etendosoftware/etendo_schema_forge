export const STATUS_BADGE = {
  CO: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  CL: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  RPPC: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  RPR: 'bg-blue-50 text-blue-700 border-blue-200',
  RDNC: 'bg-blue-50 text-blue-700 border-blue-200',
  PPM: 'bg-blue-50 text-blue-700 border-blue-200',
  DR: 'bg-gray-50 text-gray-600 border-gray-200',
  PWNC: 'bg-amber-50 text-amber-700 border-amber-200',
  VO: 'bg-red-50 text-red-700 border-red-200',
};

export const STATUS_KEYS = {
  CO: 'statusCompleted',
  DR: 'statusDraft',
  VO: 'statusVoided',
  CL: 'statusClosed',
  RPPC: 'statusReceived',
  RPR: 'statusReceived',
  PPM: 'statusPaid',
  PWNC: 'statusPending',
  RDNC: 'statusDeposited',
};

export const CHIP_ICONS = {
  shipment: (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="1" y="3" width="22" height="5" rx="1" />
      <path d="M1 8l2 13h18l2-13" />
    </svg>
  ),
  invoice: (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <path d="M14 2v6h6M8 13h8M8 17h8M8 9h2" />
    </svg>
  ),
  payment: (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="10" />
      <path d="M16 8h-4a2 2 0 100 4h2a2 2 0 110 4H8M12 6v2m0 8v2" />
    </svg>
  ),
  quotation: (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
      <rect x="9" y="3" width="6" height="4" rx="1" />
      <path d="M9 14l2 2 4-4" />
    </svg>
  ),
  order: (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
      <rect x="9" y="3" width="6" height="4" rx="1" />
      <path d="M9 12h6M9 16h6" />
    </svg>
  ),
  receipt: (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M4 2v20l3-2 3 2 3-2 3 2 3-2 3 2V2l-3 2-3-2-3 2-3-2-3 2-3-2z" />
      <path d="M8 10h8M8 14h4" />
    </svg>
  ),
  returnDoc: (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M9 14l-4-4 4-4" />
      <path d="M5 10h11a4 4 0 010 8h-1" />
    </svg>
  ),
};

export const CHIP_COLORS = {
  shipment: 'text-blue-600',
  invoice: 'text-purple-600',
  payment: 'text-emerald-600',
  quotation: 'text-amber-600',
  order: 'text-indigo-600',
  receipt: 'text-teal-600',
  returnDoc: 'text-orange-600',
};
