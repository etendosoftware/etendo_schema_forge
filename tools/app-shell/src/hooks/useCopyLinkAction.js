import { useCallback } from 'react';
import { toast } from 'sonner';
import { useUI } from '@/i18n';

// Writes a URL to the clipboard and surfaces a success/error toast via the
// existing i18n keys. Shared by every copy-link hook below.
async function copyUrl(url, ui) {
  try {
    await navigator.clipboard.writeText(url);
    toast.success(ui('linkCopied'));
  } catch {
    toast.error(ui('copyFailed'));
  }
}

function copyRecordUrl(id, windowName, ui) {
  return copyUrl(`${window.location.origin}/${windowName}/${id}`, ui);
}

// ListView.jsx's iconSizeClass() isn't exported, so re-implemented here.
export function useCopyLinkAction({ selectedRows, windowName, selectionBarSize = 'sm' }) {
  const ui = useUI();

  const visible = Array.isArray(selectedRows) && selectedRows.length === 1;

  const onCopyLink = useCallback(async () => {
    const row = selectedRows?.[0];
    const id = row?.id || row;
    await copyRecordUrl(id, windowName, ui);
  }, [selectedRows, windowName, ui]);

  return {
    visible,
    iconSizeClass: selectionBarSize === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4',
    onCopyLink,
  };
}

// ETP-4721 — form-view (single-record) variant used in the DetailView topbar.
// No selection gating here (there's only one record on screen): visible
// whenever a persisted record exists — i.e. `recordId` is set and isn't the
// 'new' sentinel used for unsaved records.
export function useCopyRecordLinkAction({ recordId, windowName }) {
  const ui = useUI();

  const visible = recordId != null && recordId !== 'new';

  const onCopyLink = useCallback(async () => {
    await copyRecordUrl(recordId, windowName, ui);
  }, [recordId, windowName, ui]);

  return {
    visible,
    onCopyLink,
  };
}

// ETP-5593 — list-view (page) variant: copies the CURRENT page URL as-is, so any
// state a window keeps in the query string (filters, search) travels with the link.
// Backs ListView's toolbar "Share" button.
export function useCopyPageLink() {
  const ui = useUI();
  return useCallback(() => copyUrl(window.location.href, ui), [ui]);
}
