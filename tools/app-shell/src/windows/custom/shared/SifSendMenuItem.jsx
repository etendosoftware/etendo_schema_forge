import { useUI } from '@/i18n';
import { requestSifSendModal } from './sifSending.js';
import { useInvoiceSifSending } from './useInvoiceSifSending.js';

/**
 * Form-view kebab (⋮) entry that sends the open invoice to its fiscal system(s).
 *
 * ETP-5700 — wired through `decisions.json → window.customComponents.moreMenuContent`
 * (the `customMenuContent` slot of `DetailMoreActionsMenu`). A plain `menuActions`
 * entry cannot express it: its caption is a fixed `labelKey`, and its visibility can
 * only test the document status or a record field, while this action depends on the
 * org's fiscal configuration (profile, territory, adoption dates).
 *
 * Gating and caption come from `useInvoiceSifSending`, the same hook the topbar
 * `SendToSifButton` uses, so the two entry points can never disagree. Returning `null`
 * when nothing is pending also lets the kebab hide itself when it would be empty.
 *
 * The click does NOT open a modal here: the kebab unmounts its content as soon as the
 * menu closes, and a click inside the modal closes it. It hands the request to
 * `SifSendModalHost`, which the invoice window keeps mounted next to the form
 * (`requestSifSendModal`). It must not depend on the topbar `SendToSifButton`, which is
 * conditionally rendered.
 *
 * Receives the `customMenuContent` props: `data`, `recordId`, `apiBaseUrl`, `onClose`.
 */
export default function SifSendMenuItem({ data, recordId, apiBaseUrl, onClose }) {
  const ui = useUI();
  const { specName, pendingTargets, hasPendingTargets, labelKey } = useInvoiceSifSending({ data, apiBaseUrl });
  const currentId = data?.id || recordId;

  if (data?.documentStatus !== 'CO' || !hasPendingTargets || !currentId) return null;

  // Same markup as DetailMoreActionsMenu's standard menuActions items (classes, font,
  // `menu-action-<key>` data-testid), so it reads as part of one menu.
  return (
    <button
      type="button"
      data-testid="menu-action-sendToSif"
      onClick={() => {
        onClose?.();
        requestSifSendModal(specName, currentId, pendingTargets);
      }}
      className="w-full text-left px-2 py-1 text-sm leading-6 transition-colors flex items-center gap-2 text-foreground hover:bg-secondary"
      style={{ fontFamily: 'Inter, sans-serif', fontWeight: 400 }}
    >
      <span>{ui(labelKey)}</span>
    </button>
  );
}
