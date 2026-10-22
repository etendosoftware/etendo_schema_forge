import { useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useUI } from '@/i18n';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { getSpecBaseUrl } from '@/lib/neoBaseUrl.js';
import { RECORD_SAVE_TOAST_ID } from '@/hooks/useEntity';

/**
 * Contact category (ETP-5791): after a category is saved, tell the user — only when the category
 * already has contacts — that the change does not reach them and applies to new contacts only.
 *
 * The notice REPLACES the generic "Registro guardado" toast rather than stacking on it: it is
 * shown with the generic save toast's own id (`RECORD_SAVE_TOAST_ID`), which sonner treats as an
 * in-place update (see the comment on that constant in useEntity.js). The lookup is awaited after
 * the save already showed its toast, so the update always lands on it; a category without
 * contacts keeps the plain success toast.
 *
 * A category's type flags and accounts are COPIED into a contact when the contact is created, so
 * editing the category never modifies existing contacts; the notice makes that explicit.
 *
 * "Has contacts" is a one-row read of the Contacts spec filtered by category
 * (`criteria` businessPartnerCategory = id, `_endRow=1`) — the generic NEO list, no dedicated
 * endpoint. A role that cannot read Contacts gets a refusal and simply no notice.
 */
function contactsByCategoryQuery(categoryId) {
  const criteria = JSON.stringify([{ fieldName: 'businessPartnerCategory', operator: 'equals', value: categoryId }]);
  return `/businessPartner?criteria=${encodeURIComponent(criteria)}&_startRow=0&_endRow=1`;
}

/** Returns `notify(categoryId)`: shows the notice when the category has at least one contact. */
export function useAssociatedContactsNotice() {
  const ui = useUI();
  const apiFetch = useApiFetch(getSpecBaseUrl('contacts'));
  return useCallback(async (categoryId) => {
    if (!categoryId) return;
    try {
      const res = await apiFetch(contactsByCategoryQuery(categoryId));
      if (!res.ok) return;
      const body = await res.json();
      const rows = body?.response?.data ?? body?.data ?? [];
      if (rows.length > 0) toast.info(ui('bpCategorySavedWithContacts'), { id: RECORD_SAVE_TOAST_ID, action: undefined });
    } catch {
      // The notice is advisory: a failed lookup must never look like a failed save.
    }
  }, [apiFetch, ui]);
}

/**
 * Fires the notice when the header record is saved. A save is detected as a change of the
 * record's `updated` audit token for the SAME id — the token the backend bumps on every write
 * and returns with the saved record, whatever path saved it (toolbar Save or autosave on blur).
 * The first value seen for an id is a load, not a save, and is ignored.
 */
export function useNotifyOnHeaderSave(record) {
  const notify = useAssociatedContactsNotice();
  const seen = useRef({ id: null, updated: null });
  const id = record?.id ?? null;
  const updated = record?.updated ?? null;
  useEffect(() => {
    const prev = seen.current;
    seen.current = { id, updated };
    if (!id || !updated || prev.id !== id || !prev.updated || prev.updated === updated) return;
    notify(id);
  }, [id, updated, notify]);
}
