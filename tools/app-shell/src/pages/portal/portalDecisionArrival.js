// Relative imports, not the `@/` alias: keeps this module loadable by plain `node --test`.
import { writePortalView } from './portalPresentation.js';

/**
 * ETP-6209 Part C — the way from a confirmed quotation decision into the portal.
 *
 * The confirmation landing (`/portal/decision/:token`) receives, in the confirm POST's answer, a
 * fresh portal token (`portalToken`) and the quotation (`quotationId`). It then opens the portal
 * on the quotation, with no notice: the Figma has none (the confirmation page already said what
 * happened), so the earlier one-off "Has rechazado el presupuesto…" banner was removed.
 */

/** The quotation kind the portal opens on (the backend's `PortalDocumentKind`). */
const QUOTATION_KIND = 'QUOTATION';

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
