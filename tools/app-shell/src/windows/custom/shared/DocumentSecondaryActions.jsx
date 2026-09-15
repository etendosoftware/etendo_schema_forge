import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useUI } from '@/i18n';
import CopyRecordLinkButton from '@/components/contract-ui/CopyRecordLinkButton';
import CloneOrderModal from '@/components/contract-ui/CloneOrderModal';
import { SendDocumentButton } from '@/components/contract-ui/SendDocumentModal';
import { buildHeaders } from '@/auth/api.js';
import CloneButton from './CloneButton.jsx';

/**
 * Shared secondary/utility document-actions group for the detail topbar (ETP-5260).
 *
 * Renders, in the DF-mandated order: Copy link -> Clone -> Send. Pass this (or a
 * thin window-specific adapter around it, see below) as `topbarSecondary` to
 * `DetailView` — NEVER as `topbarRight`, which is reserved for PRIMARY
 * document-flow actions (Confirm, manage receipt/invoice, status badges). See
 * the classification comment near DetailView.jsx's `topbarRight`/`topbarSecondary`
 * render for the full split rationale.
 *
 * This component replaces the three divergent inline Clone-button copies that
 * used to live in `purchase-order`, `sales-order` and the mostly-unused shared
 * `CloneButton.jsx` (ETP-4781 tech debt) — a single implementation is what makes
 * "consistent order across every document" (ticket AC #5) actually enforceable.
 *
 * Props:
 *   recordId     — current record id (DetailView passes `data?.id || recordId`)
 *   data         — current record data (forwarded to CloneOrderModal)
 *   windowName   — spec name, e.g. 'purchase-order' — used for the copy-link URL
 *                  and as the default post-clone navigation target
 *   apiBaseUrl   — e.g. '/sws/neo/purchase-order'
 *   token        — bearer token; used to build `headers` when `headers` is not
 *                  passed explicitly
 *   headers      — optional pre-built { Authorization, 'Content-Type' } object;
 *                  overrides the token-derived one
 *   showCopyLink — boolean, default true — gate for the Copy link button
 *   clone        — false (default, hidden) | true (enabled with defaults) | an
 *                  object of CloneOrderModal overrides:
 *                    { onCloned, cloneActionName, headerEntity, errorKey,
 *                      processingKey, titleKey, routePrefix }
 *                  When `onCloned` is omitted AND `routePrefix` is not set, the
 *                  default behaviour navigates to `/{windowName}/{newId}` after a
 *                  successful clone (mirrors the pre-ETP-5260 inline behaviour in
 *                  purchase-order/purchase-invoice). Passing `routePrefix`
 *                  switches CloneOrderModal into its own "State 2" (list of
 *                  cloned documents with internal navigation on row click,
 *                  mirroring the pre-ETP-5260 inline behaviour in
 *                  goods-shipment/goods-receipt) — in that mode this component
 *                  does NOT auto-navigate or auto-close on clone; only
 *                  `cloneConfig.onCloned`, if given, still fires.
 *                  `titleKey` overrides the button's tooltip/title i18n key
 *                  (defaults to the existing `cloneOrderBtn` key).
 *   showSend     — boolean, default false — gate for the Send button
 *   onSendClick  — required when showSend is true; the window owns its own
 *                  SendDocumentModal (documentType/pdf/etc. vary per window), so
 *                  this component only renders the button and defers opening the
 *                  modal to the caller (e.g. via a window CustomEvent, see
 *                  purchase-order's PurchaseOrderSecondaryActions adapter).
 *   children     — optional extra secondary-slot content, rendered after the
 *                  Send button (e.g. a window-specific action that isn't the
 *                  generic "send by email" — a fiscal send-to-SII/TBAI button,
 *                  say — but still belongs in the DF's "Enviar" position; see
 *                  `artifacts/purchase-invoice/custom/PurchaseInvoiceSecondaryActions.jsx`).
 *                  A window's own modals for that action are the window's
 *                  responsibility, same as `showSend`'s modal.
 *
 * A window that needs window-specific config (e.g. gating `showSend` on
 * `data.documentStatus`) wraps this component in a small adapter — see
 * `artifacts/purchase-order/custom/PurchaseOrderSecondaryActions.jsx` for the
 * reference implementation new windows should copy.
 */
export default function DocumentSecondaryActions({
  recordId,
  data,
  windowName,
  apiBaseUrl,
  token,
  headers: headersProp,
  showCopyLink = true,
  clone = false,
  showSend = false,
  onSendClick,
  children = null,
}) {
  const navigate = useNavigate();
  const ui = useUI();
  const [showCloneModal, setShowCloneModal] = useState(false);

  if (!recordId) return null;

  const cloneConfig = clone === true ? {} : (clone || null);
  const headers = headersProp ?? (token ? buildHeaders(token) : undefined);

  return (
    <>
      {showCopyLink && (
        <CopyRecordLinkButton recordId={recordId} windowName={windowName} data-testid="DocumentSecondaryActions__copyLink" />
      )}
      {cloneConfig && (
        <CloneButton
          onClick={() => setShowCloneModal(true)}
          title={ui(cloneConfig.titleKey || 'cloneOrderBtn')}
          data-testid="DocumentSecondaryActions__clone" />
      )}
      {showSend && (
        <SendDocumentButton onClick={onSendClick} data-testid="DocumentSecondaryActions__send" />
      )}
      {children}
      {cloneConfig && showCloneModal && createPortal(
        <CloneOrderModal
          recordId={recordId}
          data={data}
          apiBaseUrl={apiBaseUrl}
          headers={headers}
          cloneActionName={cloneConfig.cloneActionName}
          headerEntity={cloneConfig.headerEntity}
          errorKey={cloneConfig.errorKey}
          processingKey={cloneConfig.processingKey}
          routePrefix={cloneConfig.routePrefix}
          onClose={() => setShowCloneModal(false)}
          onCloned={cloneConfig.routePrefix
            ? cloneConfig.onCloned
            : (newId) => {
                setShowCloneModal(false);
                if (cloneConfig.onCloned) cloneConfig.onCloned(newId);
                else navigate(`/${windowName}/${newId}`);
              }}
          data-testid="DocumentSecondaryActions__cloneModal" />,
        document.body,
      )}
    </>
  );
}
