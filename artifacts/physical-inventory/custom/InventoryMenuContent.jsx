import { useState } from 'react';
import { toast } from 'sonner';
import { useUI } from '@/i18n';
import InventoryCreateListModal from './InventoryCreateListModal';
import { useApiFetch } from '@/auth/useApiFetch.js';

const itemStyle = {
  width: '100%', textAlign: 'left', padding: '6px 12px',
  fontSize: 13, background: 'none', border: 'none', cursor: 'pointer',
  color: 'hsl(var(--foreground))',
};

export default function InventoryMenuContent({ data, recordId, token, apiBaseUrl, onClose }) {
  // ETP-4576 - the credential belongs to apiFetch, not to the component.
  // Empty base ON PURPOSE: every URL below is already absolute, and several address a
  // DIFFERENT spec than this window's. resolveApiUrl only skips the prefix when the path
  // starts with that same base, so a configured base turns a cross-spec call into
  // /sws/neo/<this>/sws/neo/<other>/... and a 404.
  const apiFetch = useApiFetch('');
  const ui = useUI();
  const [showModal, setShowModal] = useState(false);
  const [updating, setUpdating] = useState(false);

  if (!recordId || recordId === 'new') return null;
  if (data?.processed === true || data?.processed === 'Y') return null;

  const handleUpdateQuantities = async () => {
    onClose();
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
      <button
        type="button"
        style={itemStyle}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'hsl(var(--card))'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
        onClick={() => { onClose(); setShowModal(true); }}
      >
        {ui('createInventoryCountList')}
      </button>
      <button
        type="button"
        disabled={updating}
        style={{ ...itemStyle, opacity: updating ? 0.5 : 1, cursor: updating ? 'not-allowed' : 'pointer' }}
        onMouseEnter={(e) => { if (!updating) e.currentTarget.style.background = 'hsl(var(--card))'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
        onClick={handleUpdateQuantities}
      >
        {updating ? ui('updating') : ui('updateListSystemCount')}
      </button>

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
