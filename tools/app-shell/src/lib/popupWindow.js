/**
 * Shared popup-window sizing for the Salt Edge SCA flows (bank connection, PIS payment
 * authorization) — ETP-4895.
 *
 * Every Salt Edge popup Classic opens (payment authorization, consent, reconnect) sizes itself to
 * 70% of the screen, centered — see `GenerateBankPayment.js`, `Consent.js` and `Reconnect.js` in
 * the com.etendoerp.psd2.bank.integration module. Etendo Go's own bank-connection flow
 * (`useBankConnectionActions.js`) already matched that. The PIS payment popup was the one outlier,
 * hardcoded to a fixed 500x720: on a wide bank SCA screen (e.g. Santander's) that clips the content
 * and forces horizontal scroll instead of just showing a smaller, still-legible page.
 */

/**
 * Window-features fragment (`width=…,height=…,left=…,top=…`) for a popup sized to `ratio` of the
 * screen and centered on it.
 *
 * @param {number} [ratio=0.7] fraction of the screen each dimension should occupy
 * @returns {string}
 */
export function centeredPopupDimensions(ratio = 0.7) {
  const screenWidth = window.screen?.width || 1024;
  const screenHeight = window.screen?.height || 768;
  const w = Math.floor(screenWidth * ratio);
  const h = Math.floor(screenHeight * ratio);
  const left = Math.floor((screenWidth - w) / 2);
  const top = Math.floor((screenHeight - h) / 2);
  return `width=${w},height=${h},left=${left},top=${top}`;
}

/**
 * Opens (or, via a reused `name`, focuses) a popup window sized to 70% of the screen and centered.
 *
 * @param {string} url page to load; pass `''` to open blank and navigate later via
 *   `popup.location.href = …` — needed when the destination URL is only resolved after the popup
 *   must already be open (Safari/Chrome block `window.open` calls made outside the click handler).
 * @param {string} name window target name; reusing it across calls reuses the same popup instead
 *   of opening a new one each time.
 * @param {string} [extraFeatures] additional window-features to prepend (e.g.
 *   `'popup=yes,resizable=yes,scrollbars=yes'`).
 * @returns {Window|null}
 */
export function openCenteredPopup(url, name, extraFeatures = '') {
  const dims = centeredPopupDimensions();
  const features = extraFeatures ? `${extraFeatures},${dims}` : dims;
  return window.open(url, name, features);
}
