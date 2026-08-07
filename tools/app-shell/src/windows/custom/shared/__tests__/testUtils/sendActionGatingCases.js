// Shared "Send action gating by documentStatus (ETP-4717 Pair 3)" test builders,
// reused by every preview-panel test suite that gates its Send action on the
// document's status. Each preview panel gates a slightly different trigger
// (a testid button, a text link, an onSend prop passed to EmailsCard) and a
// different pair of statuses (e.g. DR/CO vs DR/UE), so these builders take the
// render calls and the lookup as config rather than hardcoding either — the
// predicate itself (=== 'CO' vs !== 'DR') lives in the component under test,
// not here; this file only removes the repeated "render + assert" shape.
//
// Usage in a test file (inside a `describe('Send action gating ...', ...)`):
//
//   expectPresenceGatedByStatus({
//     hiddenIt: 'does NOT render the top action-bar email button when order.documentStatus is DR (draft)',
//     shownIt: 'renders the top action-bar email button when order.documentStatus is CO (completed)',
//     renderHidden: () => renderOrderPreview({ order: { ...defaultOrder, documentStatus: 'DR' } }),
//     renderShown: () => renderOrderPreview({ order: { ...defaultOrder, documentStatus: 'CO' } }),
//     findElement: () => screen.queryByTestId('email-btn'),
//   });
import { it, expect } from 'vitest';

/**
 * Generates the "hidden on one status / shown on another" test pair for a
 * Send-trigger element (a button, link, icon, etc. looked up via Testing
 * Library queries). Mirrors the repeated
 *   render...(); expect(query(...)).not.toBeInTheDocument();
 *   render...(); expect(query(...)).toBeInTheDocument();
 * shape found across OrderPreview/InvoicePreview/QuotationPreview/GoodsShipmentPreview.
 *
 * @param {object} config
 * @param {string} config.hiddenIt - test description for the "hidden" case
 * @param {string} config.shownIt - test description for the "shown" case
 * @param {() => void} config.renderHidden - renders the preview in the status that must hide the trigger
 * @param {() => void} config.renderShown - renders the preview in the status that must show the trigger
 * @param {() => (HTMLElement|null)} config.findElement - Testing Library `queryBy...` lookup for the trigger, called after each render
 */
export function expectPresenceGatedByStatus({ hiddenIt, shownIt, renderHidden, renderShown, findElement }) {
  it(hiddenIt, () => {
    renderHidden();
    expect(findElement()).not.toBeInTheDocument();
  });

  it(shownIt, () => {
    renderShown();
    expect(findElement()).toBeInTheDocument();
  });
}

/**
 * Generates the "onSend undefined on one status / truthy function on another"
 * test pair for the EmailsCard prop-inspection pattern shared by
 * OrderPreview/InvoicePreview/QuotationPreview (GoodsShipmentPreview does not
 * render EmailsCard with a gated onSend, so it does not use this builder).
 *
 * @param {object} config
 * @param {string} config.hiddenIt - test description for the "onSend undefined" case
 * @param {string} config.shownIt - test description for the "onSend truthy function" case
 * @param {() => void} config.renderHidden - renders the preview in the status that must gate onSend away
 * @param {() => void} config.renderShown - renders the preview in the status that must pass a real onSend
 * @param {import('vitest').Mock} config.EmailsCardMock - `vi.mocked(EmailsCard)` for the suite's mocked component
 */
export function expectEmailsCardOnSendGatedByStatus({ hiddenIt, shownIt, renderHidden, renderShown, EmailsCardMock }) {
  it(hiddenIt, () => {
    renderHidden();
    const lastCall = EmailsCardMock.mock.calls.at(-1)?.[0];
    expect(lastCall).toBeDefined();
    expect(lastCall.onSend).toBeUndefined();
  });

  it(shownIt, () => {
    renderShown();
    const lastCall = EmailsCardMock.mock.calls.at(-1)?.[0];
    expect(lastCall).toBeDefined();
    expect(typeof lastCall.onSend).toBe('function');
  });
}

/**
 * Generates the "disabled on one status / enabled on another" test pair for a
 * gated trigger that stays IN the DOM but toggles its `disabled` attribute —
 * the pattern used by "Descargar PDF" (ETP-4789), as opposed to the Send
 * trigger which is removed from the DOM entirely (see
 * `expectPresenceGatedByStatus` above). The PDF must already be available
 * (hasPdf/pdfBlob/pdfUrl truthy) in BOTH renders, so the only variable under
 * test is the documentStatus gate — otherwise a false positive is possible
 * (disabled because there's no PDF yet, not because of the status gate).
 *
 * @param {object} config
 * @param {string} config.hiddenIt - test description for the "disabled" case
 * @param {string} config.shownIt - test description for the "enabled" case
 * @param {() => void} config.renderHidden - renders the preview (with a PDF already available) in the status that must disable the trigger
 * @param {() => void} config.renderShown - renders the preview (with a PDF already available) in the status that must enable the trigger
 * @param {() => (HTMLElement|null)} config.findElement - Testing Library lookup for the trigger, called after each render
 */
export function expectDisabledGatedByStatus({ hiddenIt, shownIt, renderHidden, renderShown, findElement }) {
  it(hiddenIt, () => {
    renderHidden();
    expect(findElement()).toBeDisabled();
  });

  it(shownIt, () => {
    renderShown();
    expect(findElement()).not.toBeDisabled();
  });
}
