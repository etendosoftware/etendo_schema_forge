import { useState } from 'react';
import { useUI } from '@/i18n';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { isVoidableRow, voidInternalConsumption } from '@/windows/custom/internal-consumption/voidInternalConsumption.js';

/**
 * moreMenuContent (kebab) for Internal Consumption.
 * Renders a "Void" action that calls M_Internal_Consumption_Post with { action: 'VO' }.
 * Only shown when the document is Completed ('CO') — voiding an open/draft document is not allowed.
 * The request and its toasts live in the shared voidInternalConsumption helper (ETP-5445), also
 * used by the grid row-hover kebab.
 */
export default function InternalConsumptionActions({ data, recordId, token, apiBaseUrl, onClose, onRefresh }) {
  // ETP-4576 - the credential belongs to apiFetch, not to the component.
  // Empty base ON PURPOSE: every URL below is already absolute, and several address a
  // DIFFERENT spec than this window's. resolveApiUrl only skips the prefix when the path
  // starts with that same base, so a configured base turns a cross-spec call into
  // /sws/neo/<this>/sws/neo/<other>/... and a 404.
  const apiFetch = useApiFetch('');
  const ui = useUI();
  const [processing, setProcessing] = useState(false);

  // Void is only available on completed documents.
  if (!isVoidableRow(data)) return null;

  const handleVoid = async () => {
    if (processing) return;
    setProcessing(true);
    try {
      const result = await voidInternalConsumption({ apiFetch, basePath: apiBaseUrl, recordId, ui });
      if (result.success) {
        onRefresh?.();
        onClose();
      }
    } finally {
      setProcessing(false);
    }
  };

  // Same markup as DetailMoreActionsMenu's standard menuActions items (classes, font,
  // data-testid pattern `menu-action-<key>`), so "Anular" renders identically to the
  // "Contabilizar"/"Descontabilizar" entries it shares the kebab with. Void uses the
  // DESTRUCTIVE variant (same classes as Descontabilizar's `destructive: true`).
  return (
    <button
      type="button"
      data-testid="menu-action-void"
      onClick={handleVoid}
      disabled={processing}
      className={`w-full text-left px-2 py-1 text-sm leading-6 transition-colors flex items-center gap-2 text-destructive hover:bg-destructive/10 ${processing ? 'opacity-50 cursor-not-allowed' : ''}`}
      style={{ fontFamily: 'Inter, sans-serif', fontWeight: 400 }}
    >
      <span>{processing ? ui('internalConsumptionVoiding') : ui('internalConsumptionVoid')}</span>
    </button>
  );
}
