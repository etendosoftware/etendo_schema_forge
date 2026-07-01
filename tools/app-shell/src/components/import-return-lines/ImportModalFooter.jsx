export function ImportModalHeader({ title, bpName, onClose }) {
  return (
    <div style={{ padding: '14px 16px', borderBottom: '2px solid #E5E7EB' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>{title}</span>
        <button type="button" onClick={onClose} style={{ fontSize: 18, lineHeight: 1, padding: '2px 6px', borderRadius: 4, background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280' }}>&times;</button>
      </div>
      {bpName && <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 2 }}>{bpName}</div>}
    </div>
  );
}

export default function ImportModalFooter({ selectedCount, importing, importButtonLabel, onClose, onImport, ui }) {
  const disabled = selectedCount === 0 || importing;
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#F8F9FA', borderTop: '1px solid #E5E7EB', padding: '10px 16px' }}>
      <span style={{ fontSize: 12, color: selectedCount > 0 ? 'var(--color-text-info, #2563eb)' : '#6B7280', fontWeight: selectedCount > 0 ? 500 : 400 }}>
        {selectedCount > 0 ? ui('selectedLinesCount').replace('{count}', String(selectedCount)) : ui('selectLinesToImport')}
      </span>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={onClose}
          style={{ fontSize: 13, padding: '5px 14px', borderRadius: 6, border: '1px solid #E5E7EB', background: 'transparent', color: '#6B7280', cursor: 'pointer' }}
        >
          {ui('cancel')}
        </button>
        <button
          type="button"
          onClick={onImport}
          disabled={disabled}
          style={{ fontSize: 13, fontWeight: 500, padding: '5px 14px', borderRadius: 6, border: 'none', background: '#18181b', color: '#fff', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.4 : 1 }}
        >
          {importButtonLabel}
        </button>
      </div>
    </div>
  );
}
