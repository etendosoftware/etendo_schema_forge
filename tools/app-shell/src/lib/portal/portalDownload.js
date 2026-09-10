/**
 * Hands a fetched `Blob` to the browser as a saved file (ETP-5267).
 *
 * The portal cannot offer a plain `<a href="/sws/portal/…/pdf" download>`: the token is a
 * header, not a query parameter (plan §5.4), so the PDF has to be fetched through `apiFetch`
 * and only then turned into something the browser will save. That is what this does — the same
 * object-URL / synthetic-anchor sequence `DocumentPrintDrawer` uses for the back-office
 * download, kept in its own module so the portal's page stays free of DOM plumbing.
 *
 * Isolated here for one more reason: `URL.createObjectURL` is not implemented in jsdom, so a
 * component test of `PortalPage` mocks THIS module rather than reaching for a global stub.
 *
 * @param {Blob} blob the file contents
 * @param {string} fileName the name offered to the user
 */
export function saveBlobAsFile(blob, fileName) {
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    // Not appended to the document: a detached anchor's click still triggers the download in
    // every browser the app supports, and it leaves no node behind to clean up.
    anchor.click();
  } finally {
    // Revoked in `finally` so a click that throws does not leak the object URL for the rest of
    // the session — the BP may download every invoice in the list from this one page load.
    URL.revokeObjectURL(url);
  }
}
