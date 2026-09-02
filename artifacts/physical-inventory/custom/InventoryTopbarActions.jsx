import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { useUI } from '@/i18n';
import InventoryCreateListModal from './InventoryCreateListModal';
import { useApiFetch } from '@/auth/useApiFetch.js';

function IconBtn({ label, onClick, disabled, children }) {
  const [rect, setRect] = useState(null);
  const timer = useRef(null);
  const btnRef = useRef(null);

  const show = () => {
    timer.current = setTimeout(() => {
      if (btnRef.current) setRect(btnRef.current.getBoundingClientRect());
    }, 150);
  };
  const hide = () => { clearTimeout(timer.current); setRect(null); };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={onClick}
        disabled={disabled}
        onMouseEnter={show}
        onMouseLeave={hide}
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 32, height: 32, borderRadius: 6, flexShrink: 0,
          border: '0.5px solid hsl(var(--border-subtle))', background: 'hsl(var(--card))', color: 'hsl(var(--foreground))',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
        }}
      >
        {children}
      </button>
      {rect && createPortal(
        <div style={{
          position: 'fixed',
          top: rect.bottom + 6,
          left: rect.left + rect.width / 2,
          transform: 'translateX(-50%)',
          background: 'hsl(var(--foreground))', color: 'hsl(var(--card))',
          fontSize: 12, padding: '4px 8px', borderRadius: 4,
          whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 50,
        }}>
          {label}
        </div>,
        document.body,
      )}
    </>
  );
}

export default function InventoryTopbarActions({ data, recordId, token, apiBaseUrl }) {
  // ETP-4576 - the credential belongs to apiFetch, not to the component.
  const apiFetch = useApiFetch(apiBaseUrl);
  const ui = useUI();
  const [showModal, setShowModal] = useState(false);
  const [updating, setUpdating] = useState(false);

  const isProcessed = data?.processed === 'Y' || data?.processed === true;

  if (!recordId || recordId === 'new' || isProcessed) return null;

  const handleUpdateQuantities = async () => {
    if (updating) return;
    setUpdating(true);
    try {
      const res = await apiFetch(`${apiBaseUrl}/inventory/${recordId}/action/updateQuantities`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.response?.message || `${ui('errorUpdatingQuantities')} (${res.status})`);
      }
      toast.success(ui('quantitiesUpdated'));
      window.location.reload();
    } catch (err) {
      toast.error(err.message || ui('errorUpdatingQuantities'));
    } finally {
      setUpdating(false);
    }
  };

  return (
    <>
      <IconBtn label={ui('createInventoryCountList')} onClick={() => setShowModal(true)}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="8" y1="6" x2="21" y2="6" />
          <line x1="8" y1="12" x2="21" y2="12" />
          <line x1="8" y1="18" x2="21" y2="18" />
          <line x1="3" y1="6" x2="3.01" y2="6" />
          <line x1="3" y1="12" x2="3.01" y2="12" />
          <line x1="3" y1="18" x2="3.01" y2="18" />
        </svg>
      </IconBtn>

      <IconBtn label={ui('updateListSystemCount')} onClick={handleUpdateQuantities} disabled={updating}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: updating ? 'spin 1s linear infinite' : 'none' }}>
          <path d="M21 2v6h-6" />
          <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
          <path d="M3 22v-6h6" />
          <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
        </svg>
      </IconBtn>

      {showModal && (
        <InventoryCreateListModal
          inventoryId={recordId}
          warehouseId={data?.warehouse?.id ?? data?.warehouse}
          apiBaseUrl={apiBaseUrl}
          token={token}
          onClose={() => setShowModal(false)}
          onSuccess={() => {
            setShowModal(false);
            toast.success(ui('inventoryListGenerated'));
            window.location.reload();
          }}
        />
      )}
    </>
  );
}
