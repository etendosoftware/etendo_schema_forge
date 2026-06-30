/**
 * Shared presentational bits for the two-step Cobros/Pagos modals
 * (history popup + new collection/payment), so the badge is defined once.
 */

/** Direction badge — arrow down = receipt (in), arrow up = payment (out). */
export function DirBadge({ dir, size = 36 }) {
  const isIn = dir === 'in';
  const s = Math.round(size * 0.5);
  return (
    <div style={{
      width: size, height: size, borderRadius: 8, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: isIn ? '#E2F7EA' : '#FDE2E9', color: isIn ? '#17663A' : '#C5234A',
    }}>
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        {isIn
          ? <><path d="M12 5v14" /><polyline points="19 12 12 19 5 12" /></>
          : <><path d="M12 19V5" /><polyline points="5 12 12 5 19 12" /></>}
      </svg>
    </div>
  );
}
