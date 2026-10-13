import { useCallback, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '@/auth/AuthContext.jsx';
import { useFiscalConfig } from '@/windows/custom/fiscal-config/useFiscalConfig.js';
import { getPendingSifTargets, getSifBodyKey, getSifButtonLabelKey } from './sifSending.js';
import SifSendingModal from './SifSendingModal.jsx';

/**
 * Row-kebab descriptor for "send this invoice to its fiscal system", or `null` when the
 * row has nothing pending. Pure, so the gate can be tested without rendering.
 *
 * Same rules as the form/detail entry points (`getPendingSifTargets`): completed
 * document, system enabled by the profile (and territory, for a purchase TBAI target),
 * document dated on/after the system's earliest cutover, not already sent.
 *
 * @param {object} params
 * @param {object} params.row the list row
 * @param {string} params.specName `sales-invoice` | `purchase-invoice`
 * @param {object} params.fiscalConfig the `useFiscalConfig` result
 * @param {(row: object, pendingTargets: object) => void} params.onSend
 * @returns {object|null}
 */
export function buildSifRowMenuAction({ row, specName, fiscalConfig, onSend }) {
  if (row?.documentStatus !== 'CO' || !row?.id) return null;
  const { profile, tbaiRecord, earliestSiiCutoverDate, earliestTbaiCutoverDate } = fiscalConfig ?? {};
  const pendingTargets = getPendingSifTargets(
    specName, profile, row, tbaiRecord?.etsgSifTerritory ?? null, tbaiRecord ?? null,
    earliestSiiCutoverDate ?? null, earliestTbaiCutoverDate ?? null,
  );
  if (!pendingTargets.sendSii && !pendingTargets.sendTbai) return null;
  return {
    key: 'sendToSif',
    labelKey: getSifButtonLabelKey(specName, pendingTargets),
    // RowQuickActions awaits onClick and hands the result to onMenuActionExecuted,
    // which ignores entries that are neither neoAction nor documentAction — so no
    // spurious toast: the modal reports the outcome itself.
    onClick: () => {
      onSend(row, pendingTargets);
      return { success: true };
    },
  };
}

/**
 * ETP-5700 — the grid row-hover kebab entry that sends an invoice to SII / TicketBAI
 * (Batuz on purchases), reusing the exact gate (`getPendingSifTargets`) and modal
 * (`SifSendingModal`) of the form and detail entry points.
 *
 * The fiscal config is the one of the org selected in the top-nav selector, the same
 * one the list's fiscal status columns already use (InvoiceHeaderTable /
 * PurchaseInvoiceHeaderTable). Resolving it per row's own org is ETP-5248's scope.
 *
 * @param {object} params
 * @param {string} params.specName `sales-invoice` | `purchase-invoice`
 * @param {string} params.apiBaseUrl the window's NEO base (`/sws/neo/<spec>`)
 * @param {boolean} [params.enabled=true] false under the read-only access tier
 * @param {() => void} [params.onRefresh] refreshes the list after a successful send
 * @param {boolean} [params.loadConfig=true] false skips the fiscal-config fetch (e.g. a
 *   window in its form view, where the grid is not mounted and nothing else reads it)
 * @returns {{ fiscalConfig: object, sifMenuActions: (row: object) => object|null, sifModal: React.ReactNode }}
 */
export function useSifRowSendAction({ specName, apiBaseUrl, enabled = true, onRefresh, loadConfig = true }) {
  const { selectedOrg } = useAuth();
  const fiscalConfig = useFiscalConfig(loadConfig ? (selectedOrg?.id ?? null) : null, apiBaseUrl);
  const [target, setTarget] = useState(null);
  const sentRef = useRef(false);
  const base = useMemo(() => (apiBaseUrl || '').replace(/\/[^/]+$/, ''), [apiBaseUrl]);

  const { profile, tbaiRecord, earliestSiiCutoverDate, earliestTbaiCutoverDate } = fiscalConfig;
  const sifMenuActions = useCallback((row) => {
    if (!enabled) return null;
    return buildSifRowMenuAction({
      row,
      specName,
      fiscalConfig: { profile, tbaiRecord, earliestSiiCutoverDate, earliestTbaiCutoverDate },
      onSend: (sendRow, pendingTargets) => {
        sentRef.current = false;
        setTarget({ recordId: sendRow.id, pendingTargets });
      },
    });
  }, [enabled, specName, profile, tbaiRecord, earliestSiiCutoverDate, earliestTbaiCutoverDate]);

  const sifModal = target && typeof document !== 'undefined'
    ? createPortal(
      <SifSendingModal
        pendingTargets={target.pendingTargets}
        bodyKey={getSifBodyKey(specName, target.pendingTargets)}
        base={base}
        specName={specName}
        recordId={target.recordId}
        onClose={() => {
          setTarget(null);
          if (sentRef.current) {
            sentRef.current = false;
            onRefresh?.();
          }
        }}
        onAfterSend={(next) => {
          if (Object.values(next).some((r) => r?.ok)) sentRef.current = true;
        }}
        titleId="send-to-sif-row-title"
        data-testid="SifSendingModal__rowSend" />,
      document.body,
    )
    : null;

  return { fiscalConfig, sifMenuActions, sifModal };
}
