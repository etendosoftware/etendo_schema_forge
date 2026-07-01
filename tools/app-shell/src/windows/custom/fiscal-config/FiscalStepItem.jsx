import { Check } from 'lucide-react';

export default function FiscalStepItem({ n, label, done, active, isFirst }) {
  let labelColor;
  if (done) labelColor = '#9CA3AF';
  else if (active) labelColor = '#121217';
  else labelColor = '#555B6D';
  return (
    <span className="flex items-center" style={{ gap: 6 }}>
      {!isFirst && <span className="flex-shrink-0" style={{ width: 40, height: 1, background: '#E8EAEF' }} />}
      <span className="flex items-center" style={{ gap: 6 }}>
        {done ? (
          <Check
            size={14}
            strokeWidth={2.5}
            className="text-green-500 flex-shrink-0"
            data-testid="Check__ede562" />
        ) : (
          <span
            className="flex items-center justify-center text-xs font-semibold flex-shrink-0"
            style={{
              width: 26, height: 24, borderRadius: 8,
              background: active ? '#121217' : '#F5F7F9',
              color:      active ? '#FFFFFF' : '#3F3F50',
              border:     active ? 'none' : '1px solid #D1D4DB',
            }}
          >
            {n}
          </span>
        )}
        <span
          className="text-sm"
          style={{
            color:          labelColor,
            fontWeight:     active ? 600 : 400,
            textDecoration: done ? 'line-through' : 'none',
          }}
        >
          {label}
        </span>
      </span>
    </span>
  );
}
