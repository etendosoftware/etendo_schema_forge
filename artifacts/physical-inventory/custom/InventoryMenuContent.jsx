import { useState } from 'react';
import { toast } from 'sonner';
import { useUI } from '@/i18n';
import InventoryCreateListModal from './InventoryCreateListModal';
import { useApiFetch } from '@/auth/useApiFetch.js';

// ETP-5601 — same markup as the generic kebab items (DetailMoreActionsMenu), so these two
// entries read as part of one menu instead of a 13px inline-styled block with a JS hover.
const itemCls = 'w-full text-left px-2 py-1 text-sm leading-6 transition-colors flex items-center gap-2 text-foreground hover:bg-secondary disabled:opacity-50 disabled:cursor-not-allowed';
const itemFont = { fontFamily: 'Inter, sans-serif', fontWeight: 400 };

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
        className={itemCls}
        style={itemFont}
        onClick={() => { onClose(); setShowModal(true); }}
      >
        {ui('createInventoryCountList')}
      </button>
      <button
        type="button"
        disabled={updating}
        className={itemCls}
        style={itemFont}
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
