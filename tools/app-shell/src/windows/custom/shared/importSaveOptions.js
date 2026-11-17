/**
 * Options every «Importar desde…» popup passes to DetailView's `handleImportClick` (reached by the
 * bottom panels as `onSave(modalType, IMPORT_SAVE_OPTIONS)`).
 *
 * `skipSaveWhenClean`: opening the popup on an EXISTING record with no unsaved header edits does
 * not save it first (so no re-read and no «Registro guardado» toast). With pending header edits the
 * header is saved before the popup opens, and a NEW record is still created (save + navigate +
 * forceOpen) — both exactly as before. ETP-5828 introduced the option for sales «Importar desde
 * pedido»; ETP-6099 extended it to every import popup of sales/purchase invoice, goods shipment and
 * goods receipt.
 */
export const IMPORT_SAVE_OPTIONS = Object.freeze({ skipSaveWhenClean: true });
