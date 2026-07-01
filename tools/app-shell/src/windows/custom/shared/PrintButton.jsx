import { useUI } from '@/i18n';

export default function PrintButton({ onClick, loading }) {
  const ui = useUI();
  return (
    <button type="button" onClick={onClick} disabled={loading}
      style={{ padding: '4px 12px', borderRadius: '6px', opacity: loading ? 0.6 : 1, cursor: loading ? 'not-allowed' : 'pointer', border: '1px solid #D1D5DB', background: 'transparent', color: '#6B7280', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 9V2h12v7" /><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" /><rect x="6" y="14" width="12" height="8" />
      </svg>
      {ui('print')}
    </button>
  );
}
