# ETP-4702 — Duplicate kebab (⋮) menu on completed Goods Shipment (Albarán de Venta)

## Summary

On a completed Goods Shipment (`goods-shipment` spec), the detail header toolbar renders **two independent kebab-menu buttons** side by side after "Imprimir": a hand-rolled private "⋮" dropdown built inside the custom `topbarRight` component (only for "Download PDF"), plus the generic shared kebab that `DetailView.jsx` already renders for `window.menuActions` (Post/Unpost). The fix is to delete the private dropdown and add "Download PDF" through the existing `customMenuContent`/`moreMenuContent` extension point — the platform's established convention for instant, no-confirmation kebab actions, already proven live on `internal-consumption` and `physical-inventory` — so the button renders inside the same shared dropdown as Post/Unpost. A decisions.json + one small custom-component change in this repo only, no `schema_forge_core` change needed.

## Root cause

Two separate, unrelated kebab-rendering mechanisms are both active for this window when `documentStatus === 'CO'`:

1. **Generic shared kebab** — `tools/app-shell/src/components/contract-ui/DetailView.jsx` (~line 2994-3140). Renders a `MoreVertical` icon button (line 3038) whenever `window.menuActions` resolves to a non-empty list. For `goods-shipment`, `decisions.json → window.menuActions` declares `post`/`unpost`:

   ```json
   [
     { "key": "post", "label": "Post", "labelKey": "post", "action": "post",
       "visibleWhenFieldFalse": "posted", "successKey": "documentPosted",
       "visibleWhenFieldTrue": "processed" },
     { "key": "unpost", "label": "Unpost", "labelKey": "unpost", "action": "unpost",
       "visibleWhenFieldTrue": "posted", "successKey": "documentUnposted", "destructive": true }
   ]
   ```
   This is emitted verbatim into `artifacts/goods-shipment/generated/web/goods-shipment/GoodsShipmentPage.jsx` lines 347-350 as the `menuActions={...}` prop on `<DetailView>`.

2. **Private, hand-built kebab inside the custom `topbarRight` component** — `artifacts/goods-shipment/custom/GoodsShipmentActions.jsx` lines 207-237:

   ```jsx
   {isCompleted && (
     <div ref={menuRef} style={{ position: 'relative', display: 'inline-flex' }}>
       <button type="button" onClick={() => setMenuOpen(v => !v)} ...>
         ⋮
       </button>
       {menuOpen && (
         <div style={{ position: 'absolute', ... }}>
           <button onClick={() => { setMenuOpen(false); handleDownload(); }} ...>
             {ui('invoicePreviewDownloadPdf')}
           </button>
         </div>
       )}
     </div>
   )}
   ```
   This component is wired as `window.customComponents.topbarRight = "GoodsShipmentActions"` (`artifacts/goods-shipment/decisions.json`), and `DetailView.jsx` renders `topbarRight` (line ~2931) *before* it evaluates `hidePrint` (line 2960) and the generic `menuActions` kebab (line 2994+). `GoodsShipmentPage.jsx` also sets `hidePrint` on `<DetailView>` (line 338 / 339 area — generated prop), so the generic Print button is suppressed and `GoodsShipmentActions.jsx`'s own `ui('print')` button (lines 197-205) is the only "Imprimir" the user sees.

Rendering order on a completed shipment is therefore:

`[Imprimir (custom, GoodsShipmentActions)] → [⋮ private dropdown, "Download PDF" only] → [⋮ generic MoreVertical, Post/Unpost]`

— exactly the `[Imprimir] [⋮] [⋮]` reported in the Jira screenshot. These are not two options inside one menu; they are two structurally different, independently-mounted dropdown implementations (one hand-rolled `useState`/`useRef` popover with inline styles, one the shared `DetailView` popover with `docAction`/`neoAction` dispatch).

**The platform already has two established extension points for adding a kebab item beyond `menuActions`'s own `documentAction`/`columnName`/`action` server-call types — and the difference between them is exactly what decides this fix:**

- **`menuActions[].component`** — resolved by `getMenuActionsProp` (`schema_forge_core/cli/src/generate-frontend.js:1046-1091`): sets `show<Key>MenuModal`/`<key>MenuContext` state and renders `<Component isOpen={...} token={...} apiBaseUrl={...} currentRecord={...} onClose={...} onSaved={...} />` (lines 2493-2497) as a **modal requiring an explicit user confirmation before acting**. Every live example is a confirm-dialog: `artifacts/fiscal-calendar/decisions.json` (`closeYear`/`undoCloseYear` → `CloseYearModal`/`UndoCloseYearModal`, both wrapping a shared `CloseYearConfirmModal` with a precheck + Confirm/Cancel buttons) and `artifacts/chart-of-accounts/decisions.json` (`newSubAccount` → `NewAccountModal`, a full form `Dialog` with Cancel/Save). None of the three fires on open with no dialog.
- **`customMenuContent` / `decisions.json → window.customComponents.moreMenuContent`** — wired in `generate-frontend.js:996-999` (`if (customComponents.moreMenuContent) { ...customMenuContent={${customComponents.moreMenuContent}} }`) and rendered by `DetailView.jsx` (~lines 3055-3122) as extra `<button>`(s) appended **inside the very same dropdown `<div>`** that lists the `menuActions` items — not a second popover, not a separate section. This is the convention for an **instant, no-confirmation** action: `artifacts/internal-consumption/custom/InternalConsumptionActions.jsx` lines 20-38 (`handleVoid` fires its POST directly `onClick`, no dialog) and `artifacts/physical-inventory/custom/InventoryMenuContent.jsx` lines 53-61 (`handleUpdateQuantities`, same instant-fire shape — that file also has a second, modal-opening button, proving both shapes can coexist in one `moreMenuContent` component).

Download PDF is exactly the second shape — click, fetch, download, done, no confirmation needed — so **`moreMenuContent` is the correct convention here**, not `menuActions[].component`. `GoodsShipmentActions.jsx` (topbarRight) uses neither — it builds its own private popover instead of adding a button through `moreMenuContent`.

## Affected windows

Checked windows with a completion/document flow that both (a) declare `window.menuActions` (so the generic kebab renders) and (b) have a custom `topbarRight`/similar component:

| Window | `menuActions` | Custom topbarRight/kebab component | Private "⋮" popover? | Bug present? |
|---|---|---|---|---|
| **goods-shipment** | `post`/`unpost` | `GoodsShipmentActions.jsx` | **Yes** (lines 207-237, `menuOpen` state + `⋮` button) | **Yes — confirmed** |
| sales-order | `reactivate` | `OrderCreateInvoice.jsx` | No — only wires `pdfBlobUrl`/`pdfBlobLoading` into `SendDocumentModal`, no own dropdown | No |
| sales-invoice | `reactivate`, `post` | `InvoiceTopbarExtra.jsx` | No — same PDF-forwarding pattern, no own dropdown | No |
| sales-quotation | `reject` | `QuotationTopbarActions.jsx` | No — same PDF-forwarding pattern | No |
| purchase-order | *(none declared)* | `PurchaseOrderActions.jsx` | No | No — generic kebab isn't even rendered (no `menuActions`), and `hidePrint` isn't set either, so it shows one plain Print button, no kebab at all |
| purchase-invoice | `reactivate`, `post` | *(no topbarRight; only `headerTable`/`bottomSection`)* | N/A | No — no custom top-bar component to duplicate anything |
| payment-out | *(none)* | *(no topbarRight)* | N/A | No |

A repo-wide grep for the literal `⋮` character and for `MoreVertical`/`MoreHoriz` inside every `artifacts/*/custom/*.jsx` file confirms `GoodsShipmentActions.jsx` is the **only** custom topbar/detail component that builds a private kebab popover. (`BulkOrderMoreMenu.jsx` / `BulkPurchaseOrderMoreMenu.jsx` also use `MoreVertical`, but those are **list bulk-selection-bar** menus, an unrelated surface, not the detail header.)

**Conclusion: this bug is specific to `goods-shipment`.** It is not a generic `DetailView.jsx`/`generate-frontend.js` defect — the shared kebab and its extension points (both `menuActions[].component` and the separate `customMenuContent`/`moreMenuContent` prop used by `internal-consumption`/`physical-inventory`, see `artifacts/internal-consumption/custom/InternalConsumptionActions.jsx`) work as designed; `GoodsShipmentActions.jsx` simply never adopted either convention and built its own popover instead.

## Proposed fix plan (not implemented — for review)

All changes are in **this repo** (`etendo_schema_forge`); no `schema_forge_core` change is needed since `customMenuContent`/`moreMenuContent` is already generator-supported and already proven on two other windows (`internal-consumption`, `physical-inventory`).

1. **Create `artifacts/goods-shipment/custom/GoodsShipmentMoreMenu.jsx`**, modeled directly on `InternalConsumptionActions.jsx`'s instant-action button shape (`artifacts/internal-consumption/custom/InternalConsumptionActions.jsx` lines 20-38): props `{ data, recordId, token, apiBaseUrl, onClose, onRefresh }`, returns `null` when not applicable (mirroring today's `isCompleted` gate — `data?.documentStatus === 'CO'`). Renders exactly one `<button>` styled like a dropdown item (see `InternalConsumptionActions.jsx`'s button styling / `InventoryMenuContent.jsx`'s `itemStyle` for the shared visual convention) that on click fires the existing blob-fetch-and-download logic (`generateShipmentPdf(recordId, apiBaseUrl, token, pdfLabels)` → `URL.createObjectURL` → programmatic `<a download>` click → revoke, moved verbatim from `handleDownload` in `GoodsShipmentActions.jsx`) and then calls `onClose()` (with a `toast.error` on failure, mirroring today's behavior). **Not a modal** — no `isOpen` prop, no `onSaved` call, no visible dialog.
2. **Strip the private popover from `GoodsShipmentActions.jsx`**: remove `menuOpen`/`menuRef` state, the outside-click effect (lines 49-54), and the entire `isCompleted && (<div ref={menuRef}>...)` block (lines 207-237) — that block is exactly and only the private kebab button + its dropdown. `handleDownload` moves out to the new component. **Nothing else changes**: `handlePrint` and the `ui('print')` button (lines 197-205) are a separate, unrelated code path (not part of the private-kebab block) and stay exactly as they are — this fix does not touch `hidePrint` or the Print button at all. After the removal, drop now-unused bits only if actually orphaned (check whether `pdfLoading`/`pdfLoadingAction` are still referenced by `handlePrint` alone before removing anything from that shared state).
3. **Update `artifacts/goods-shipment/decisions.json`**: add `"moreMenuContent": "GoodsShipmentMoreMenu"` to `window.customComponents` (alongside the existing `topbarRight`, `topbarExtra`, `bulkActions`, `bottomSection` keys). Do not remove `topbarRight` — `GoodsShipmentActions` still owns Create Invoice / Create Return / Clone / Send / Print. Generator wiring key re-confirmed at `schema_forge_core/cli/src/generate-frontend.js:996-999` (`if (customComponents.moreMenuContent) { ... customMenuContent={${customComponents.moreMenuContent}} }`).
4. **Regenerate**: `make regen ONLY=goods-shipment` (decisions.json is the only edited config file; the generator will emit `customMenuContent={GoodsShipmentMoreMenu}` on `<DetailView>` in `GoodsShipmentPage.jsx`, matching the `internal-consumption`/`physical-inventory` precedent).
5. **Verify**: run Steps 3-5 of the Window Change Integrity Protocol (contract integrity script, generated import-path check, addLineFields check) plus a manual check that the regenerated `GoodsShipmentPage.jsx` now passes `customMenuContent={GoodsShipmentMoreMenu}` to `<DetailView>` and that the old private-popover JSX is gone from `GoodsShipmentActions.jsx`.
6. **Tests** (delegate to Tester per CLAUDE.md's mandatory delegation rule): add a Vitest test (e.g. `artifacts/goods-shipment/custom/__tests__/GoodsShipmentMoreMenu.test.js`) asserting: (a) the component renders `null` when the document is not completed; (b) it renders the download-PDF button when completed; (c) clicking it fires the download call and then `onClose()`. Also add/extend a regression guard on `GoodsShipmentActions.jsx` confirming no `⋮`/private popover markup remains. Spot-check `tools/app-shell/src/components/contract-ui/__tests__/DetailView.moreMenuGating.test.js` / `DetailView.customMenuProbe.vitest.jsx` to confirm the shared-kebab/`customMenuContent` tests still pass unmodified (this repo's fix shouldn't touch that file at all).
7. **Docs**: update `docs/generated-custom-windows/goods-shipment.md` per the mandatory Documentation Freshness policy — note the toolbar now exposes a single unified kebab (Download PDF + Post/Unpost) instead of two, and update the "Automated evidence" list to mention the new `GoodsShipmentMoreMenu.jsx` file, the new `moreMenuContent` wiring, and the removed private popover in `GoodsShipmentActions.jsx`.

## Open questions for the coordinator/human

1. Should "Download PDF" keep its current label/i18n key (`invoicePreviewDownloadPdf`) or does unifying into the shared kebab warrant a shipment-specific key (e.g. `goodsShipment.downloadPdf`)? Reusing the existing key keeps scope minimal; flagging in case product wants distinct copy.
2. *(Resolved)* Whether a `visibleWhenStatus: "CO"` field-mapping concern applies — moot now that the fix uses `moreMenuContent` instead of a `menuActions[].component` entry; `GoodsShipmentMoreMenu.jsx` gates its own visibility in plain JS (`data?.documentStatus === 'CO'`), identical to today's `isCompleted` check, with no `menuActions` schema field involved.
3. Whether to also sweep `docs/ui-customization.md`'s extension-point decision tree to explicitly document when to use `moreMenuContent` (instant, no-confirmation action, appended to the shared dropdown — e.g. Download PDF, Void) vs `menuActions[].component` (action needs a confirm dialog or form first — e.g. Close Year, New Sub-account), and to call out "never build your own popover." This is exactly the kind of tribal-knowledge gap that caused this bug, but it's a docs-only addition and out of scope for the ETP-4702 fix itself unless the coordinator wants it bundled.
4. *(Resolved)* Whether to use `customMenuContent`/`moreMenuContent` or `menuActions[].component` — resolved in favor of `moreMenuContent`, because no existing `menuActions[].component` precedent (`fiscal-calendar`, `chart-of-accounts`) is an instant, no-confirmation action, while `moreMenuContent` has two direct matches (`internal-consumption`'s `handleVoid`, `physical-inventory`'s `handleUpdateQuantities`) that fire immediately on click with no dialog — exactly Download PDF's shape.
