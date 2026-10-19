/**
 * ETP-5577 — the way out of a period refusal shown inside a modal, under its inline error: the
 * "Ir al calendario" link (closing the modal first) or the "ask the owner" hint. `recovery` is
 * what `periodNotAvailableToastOptions` returns; empty renders nothing.
 */
export function PeriodRecoveryLink({ recovery, onBeforeGo }) {
  if (recovery?.description) return <div style={{ marginTop: 4 }}>{recovery.description}</div>;
  if (!recovery?.action) return null;
  return (
    <button
      type="button"
      onClick={() => { onBeforeGo?.(); recovery.action.onClick(); }}
      style={{ display: 'block', marginTop: 4, padding: 0, background: 'none', border: 'none', color: 'inherit', fontWeight: 600, textDecoration: 'underline', cursor: 'pointer' }}
      data-testid="PeriodRecoveryLink">
      {recovery.action.label}
    </button>
  );
}
