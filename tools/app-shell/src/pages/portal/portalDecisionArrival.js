// Relative imports, not the `@/` alias: keeps this module loadable by plain `node --test`.
import { PORTAL_DECISION_STATE } from '../../lib/portal/portalApi.js';
import { writePortalView } from './portalPresentation.js';

/**
 * ETP-6209 Part C — the way from a confirmed quotation decision into the portal.
 *
 * The confirmation landing (`/portal/decision/:token`) receives, in the confirm POST's answer, a
 * fresh portal token (`portalToken`) and the quotation (`quotationId`). It then opens the portal
 * on the quotation and hands it a one-off notice through the router's navigation state, never the
 * URL: a bookmarked or shared portal URL must not replay "Has rechazado el presupuesto…".
 */

/** The router-state key the notice travels under. */
export const PORTAL_NOTICE_STATE_KEY = 'portalNotice';

/** The quotation kind the portal opens on (the backend's `PortalDocumentKind`). */
const QUOTATION_KIND = 'QUOTATION';

/** The notice's message key per confirmation state that applied nothing now. */
const NOTICE_KEY_BY_STATE = Object.freeze({
  [PORTAL_DECISION_STATE.confirmed]: 'portalNoticeAlreadyAnswered',
  [PORTAL_DECISION_STATE.voided]: 'portalNoticeAlreadyAnswered',
  [PORTAL_DECISION_STATE.notPending]: 'portalNoticeNotPending',
  [PORTAL_DECISION_STATE.expired]: 'portalNoticeExpired',
});

/**
 * The portal path a confirmation leads to, or `null` when its answer carries no way in (invalid
 * token, portal closed for the customer, minting failed): the landing then keeps its own card.
 *
 * @param {{ portalToken?: string|null, quotationId?: string|null }} result the confirm answer
 * @returns {string|null}
 */
export function portalEntryPath(result) {
  if (!result?.portalToken || !result?.quotationId) return null;
  const search = writePortalView({ view: 'doc', kind: QUOTATION_KIND, id: result.quotationId });
  return `/portal/${encodeURIComponent(result.portalToken)}?${search.toString()}`;
}

/**
 * The one-off notice the portal shows on arrival: what this confirmation did, or why it did not.
 * Plain data (it travels in the history entry's state); the copy is resolved where it is shown.
 *
 * @param {object} result the normalized confirm answer
 * @returns {{ messageKey: string, tone: 'success'|'neutral', number: string,
 *   reasonCode: string|null, reasonText: string|null }}
 */
export function portalDecisionNotice(result) {
  const number = result?.documentNo ?? '';
  const appliedNow = result?.state === PORTAL_DECISION_STATE.confirmed && result?.appliedNow;
  if (!appliedNow) {
    const messageKey = NOTICE_KEY_BY_STATE[result?.state] ?? 'portalNoticeNotPending';
    return { messageKey, tone: 'neutral', number, reasonCode: null, reasonText: null };
  }
  if (result.decision === 'ACCEPT') {
    return { messageKey: 'portalNoticeAccepted', tone: 'success', number, reasonCode: null, reasonText: null };
  }
  return {
    messageKey: 'portalNoticeRejected',
    tone: 'success',
    number,
    reasonCode: result.reasonCode ?? null,
    reasonText: result.reasonText ?? null,
  };
}
