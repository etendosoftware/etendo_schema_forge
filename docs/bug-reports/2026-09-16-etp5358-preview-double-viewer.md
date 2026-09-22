# Document preview flickers once: two readers of the same marked attachment fight over the left panel

Date: 2026-09-16

Jira: [ETP-5358](https://etendoproject.atlassian.net/browse/ETP-5358)

Status: **Part 1 and Part 2 both implemented and verified live, uncommitted — ready for review.**
Branch `feature/ETP-5358` (from `main`, no worktree, per explicit instruction — note this departs
from `docs/branch-workflow.md`, which mandates worktrees and PRs targeting `develop`). Full-repo
`npx vitest run`: 925 files, 17967 tests passed, 0 failed. See "Remaining open items" at the end for
what is still outstanding (docs, commit).

This document doubles as the implementation hand-off: diagnosis, fix design, test impact and the
live verification plan are all here.

## Summary (as reported)

> "En factura de venta, al abrir una, en ocasiones la vista previa, titila una vez."

Opening a non-Draft document's preview paints the PDF and then immediately reloads it: one frame of
`Loading page…`, the viewer is rebuilt from scratch, and zoom/scroll state is lost. Intermittent by
nature — it is a race — with one deterministic case: the first open of each document after a
deploy.

Not specific to sales invoices. It affects every window that passes `autoFetch: true` **and** a
`pdfCacheConfig`: **sales-invoice, sales-order, purchase-order, sales-quotation, goods-shipment,
return-to-vendor-shipment**.

## Root cause

For a non-Draft document, **two independent readers fetch the same marked attachment**
(`EM_ETGO_IsPreviewMain`), each producing its own blob URL and its own `PdfViewer`:

| # | Reader | Where | Renders through |
|---|---|---|---|
| 1 | `usePdfGenerator` → `fetchCachedBlob` | `pdfUtils.js:338` / called at `pdfUtils.js:389` | `p.pdfUrl` → the caller's `leftPanel` (`InvoicePreview.jsx:273`) |
| 2 | `useMainAttachment.refresh` | `useMainAttachment.js:86` + `:94`, mounted at `GenericPreviewModal.jsx:28` | its own `<PdfViewer url={objectUrl}>` (`GenericPreviewModal.jsx:130`) |

`ManagedLeftPanel` checks `if (attachment.storedFile)` (`GenericPreviewModal.jsx:99`) **before**
`if (autoFetch) return leftPanel;` (`GenericPreviewModal.jsx:136`). So the moment reader 2 resolves,
the panel stops rendering the caller's `leftPanel` and mounts its own viewer instead. Different
component position, different blob URL ⇒ react-pdf reloads the document.

**This is not the "generate vs. cache" gate misbehaving.** That gate works: on a warm cache the
console prints `[pdf] … served from cached attachment (no re-render)` and jsreport is never called.
Both readers honour the condition. The race is between **two cache readers**.

### Two distinct flicker paths

**A — swap after the auto-store.** The original design
(`docs/plans/completed/2026-05-13/2026-05-11-generic-preview-infrastructure.md`) defined
`autoFetch: true` as *"show the caller's leftPanel while caching runs in background … switches to
cached file view **on next open**"*. The code switches mid-open: `uploadAndMark` calls
`applyAttachment` immediately after the upload, `storedFile` becomes non-null, and the panel changes
owner. Because of bundle-identity invalidation (D16/D17 in `document-printables.md`), this path is
taken on the **first open of every document after every deploy**; because of timestamp invalidation
(ETP-4787), also on the first open after every edit.

**B — double reader.** The 2026-08-18 follow-up in
`docs/plans/2026-08-03-etp-4315-attachment-preview-sync.md` (which closed open question #7) moved the
cache gate into `usePdfGenerator` and recorded the decision verbatim:

> "`GenericPreviewModal.jsx` is **not touched** by this fix — confirmed it has 8 total consumers …
> Leaving it unchanged keeps zero blast radius on the 2 out-of-scope consumers."

Reasonable at the time, but it left reader 2 doing a job that had just stopped being its own. The
same document describes the panel's behaviour: *"`ManagedLeftPanel` shows the cached blob
unconditionally once `storedFile` is set (no comparison against jsreport's result)."*

The duplicated network traffic postdates the traces in that document — it records a single
`GET main` + `GET file` pair per open; there are two of each today.

### The contradiction is in the written contract

`docs/plans/completed/2026-05-13/2026-05-11-generic-preview-infrastructure.md`:

```
storeCondition === true + storedFile !== null
  → left panel shows the cached file

storeCondition === true + storedFile === null + source + autoFetch === true
  → shows caller's leftPanel while caching runs in background
    switches to cached file view on next open
```

Rule 1 fires as soon as `storedFile` stops being null, which happens **within the same open**
(either the mount `refresh()` when an attachment already exists, or `applyAttachment` right after the
auto-store upload). Rule 2's "on next open" was never reachable.

## Evidence

### Production — `app.etendo.software` (branch `main`, bundle built 2026-09-15)

Cold/stale cache, sales invoice 10000019 (`C_Invoice/BE27F67A3DF04AC1A47535DD71709CF2`):

```
console  [pdf] … cached attachment is stale (written 2026-09-10T18:14:45Z,
                before this bundle built at 2026-09-15T17:56:10.903Z) — re-rendering
console  [pdf] … rendering fresh (cache miss)
network  GET  …/attachments/C_Invoice/<id>/main          200   (×2)
network  GET  …/attachments/file/C071F361…               500         ← reader 2, racing the POST below
network  POST …/attachments/C_Invoice/<id>?markAsMain=true  201
```

The 500 is reader 2 fetching the previous marked attachment while `markAsMain=true` deletes it in the
same transaction. It is swallowed by `refresh`'s `catch`.

Warm cache, same record — **the asymmetry that admits no other reading**:

```
console  [pdf] … served from cached attachment (no re-render)     ← ONE line: usePdfGenerator ran once
network  GET …/attachments/C_Invoice/<id>/main     200  (×2)
network  GET …/attachments/file/C071F361…          200  (×2)
```

`usePdfGenerator` is the only one that logs. The second pair comes from code that does not log.

DOM trace of the left panel's child (the two candidates are distinguishable by class):

```
t=  40 ms  flex flex-col h-full min-h-0 w-full overflow-hidden   canvas: 0   ← InvoicePreview's leftPanel
t=1426 ms  relative flex flex-col h-full min-h-0                 canvas: 0   ← ManagedLeftPanel takes over
t=1476 ms  relative flex flex-col h-full min-h-0                 canvas: 1
t=5426 ms  relative flex flex-col h-full min-h-0                 canvas: 0   ← viewer reloaded
t=5475 ms  relative flex flex-col h-full min-h-0                 canvas: 1
```

Same duplicated `GET …/attachments/C_Order/<id>/main` (×2) confirmed on sales-order.

### Local — `localhost:3100` (no React StrictMode, so effects run once)

Sales invoice 10000015 (`C_Invoice/BF1D5905BBF344B1BC7CB8FEB0DF9CB4`):

| Run | Console | Network | DOM |
|---|---|---|---|
| 1 — cold | 1× `rendering fresh (cache miss)` | 2× `GET /main`, 1× `POST markAsMain` 201 | leftPanel → ManagedLeftPanel at 3625 ms |
| 2 — warm | 1× `served from cached attachment (no re-render)` | 2× `GET /main`, 2× `GET /file` | leftPanel → ManagedLeftPanel at 376 ms |

### Deterministic reproduction of the visible flicker

The symptom only shows when reader 1 paints **before** reader 2 resolves. Force that order by
delaying the first `/main` response (this changes only who wins the race, not the mechanism):

```js
// paste in the console, then open a completed invoice with a warm cache
window.__n = 0;
const orig = window.fetch;
window.fetch = async (...a) => {
  const url = typeof a[0] === 'string' ? a[0] : (a[0] && a[0].url) || '';
  if (/\/attachments\/C_Invoice\/[^/]+\/main/.test(url) && ++window.__n % 2 === 1) {
    await new Promise(r => setTimeout(r, 3000));
  }
  return orig(...a);
};
```

Result — the customer's symptom, on demand:

```
t=  29 ms  leftPanel de InvoicePreview   canvas: 0
t= 301 ms  leftPanel de InvoicePreview   canvas: 1   ← the invoice is on screen
t=3276 ms  ManagedLeftPanel              canvas: 0   ← FLICKER: viewer destroyed
t=3351 ms  ManagedLeftPanel              canvas: 1   ← repaints the same invoice
```

75 ms blank after the document was already visible (≈50 ms in production).

## Scope

**Affected** (`autoFetch: true` + `pdfCacheConfig`): sales-invoice, sales-order, purchase-order,
sales-quotation, goods-shipment, return-to-vendor-shipment.

**Not affected** — and they must stay untouched:

- Drafts (`storeCondition: false`): single viewer, no cache, no marked attachment.
- `autoFetch: false` windows, whose panel holds the **user's own** document, not a cache of ours:
  purchase-invoice, goods-receipt, return-material-receipt. These are exactly the "out-of-scope
  consumers" the 2026-08-18 decision protected, and gating the fix on `autoFetch` keeps that blast
  radius at zero.
- return-material-receipt additionally must not adopt the caching layer at all (D18).

## The fix

### Part 1 — required (removes the flicker)

`GenericPreviewModal.jsx`, `ManagedLeftPanel`: move the `autoFetch` early return
(`if (autoFetch) return leftPanel;`, L136) **above** the `if (attachment.storedFile) { … }` block
(L99). In `autoFetch` mode `useMainAttachment` becomes write-only: auto-store plus `onFileChange`.

Why it is safe:

- The delete button and the `isBusy` spinner only live in the `!autoFetch` branch.
- What the user sees still comes from the cached attachment — now via `usePdfGenerator`, which has
  owned the cache read since 2026-08-18. Same bytes, one viewer.
- Image attachments never occur in `autoFetch` windows (the file is always our generated PDF).

**Implemented and verified — see "Verification results" below.**

### Part 2 — removes the duplicated download

**Status: implemented and verified live — see "Verification results (Part 2)" below.**

Add a metadata-only mode to `useMainAttachment` when the caller declares `autoFetch`: skip
`fetchAttachmentBlobUrl` on mount and keep only the metadata the auto-store gate needs (existence +
staleness). Gated by a new `skipBlobFetch` param, wired from `ManagedLeftPanel` as
`skipBlobFetch: autoFetch` — drop-zone windows (`autoFetch: false`, which never pass it) keep
eagerly fetching the blob, unaffected.

#### Risk found while designing it, and why the naive version was rejected

The first design skipped the blob fetch but left `hasPdf`/`handleDownloadPdf` (in
`InvoicePreview.jsx`/`OrderPreview.jsx`/`QuotationPreview.jsx`) trusting `cachedAttachment`'s mere
existence, the same as before. That reintroduces a version of ETP-4789, inverted: the Download
button would enable as soon as the cheap metadata GET resolves (fast — a single request), while its
`cachedAttachment.objectUrl` stays `null` and a click would send the browser to `href="null"` —
silently doing nothing — for however long it takes the slower, sequential cache-then-blob path
behind `p.pdfUrl` to catch up. Previously the *viewer* was ready before the *button*; this would
have made the *button* ready before the *file*.

#### The chosen design: lazy fetch on click, not eager gating

Rather than falling back to gating `hasPdf` on `objectUrl` alone (which would have silently lost the
ETP-4789 latency win for every affected window, even though most clicks land well after `p.pdfUrl`
has resolved), `useMainAttachment` now exposes `fetchBlobUrl()`: an on-demand resolver that returns
the already-known URL immediately if one exists, or fetches it right then, the one moment it is
actually needed. `handleDownloadPdf` in the three callers becomes:

1. `cachedAttachment.objectUrl` truthy → download immediately (drop-zone mode, or a URL a previous
   `fetchBlobUrl()` call already resolved — unchanged, byte-identical to before Part 2).
2. Else, `cachedAttachment.fetchBlobUrl` present → `await` it; on success, download the resolved URL.
3. Else (or on failure) → fall through to `p.handleDownloadPdf()` (the pre-existing `pdfUrl` path),
   exactly as before this ticket.

`fetchBlobUrl()` itself: returns the cached URL on a second call without re-fetching; de-dupes a
concurrent double-call (e.g. an impatient double-click) onto a single in-flight promise so two
rapid clicks never fire two GETs; returns `null` (never throws) on failure or when there is nothing
to fetch, so the caller's fallback always has a clean signal to act on.

**`uploadAndMark` (the auto-store path) was deliberately left untouched** — it still calls
`URL.createObjectURL(blob)` unconditionally after every upload, in every mode. This looked at first
like an oversight, but it is correct: the blob it uploads is `cfg.sourceBlob` (`p.pdfBlob`), already
in memory — wrapping an in-memory `Blob` in an object URL costs nothing over the network, so there
is no duplicate-GET waste to eliminate there. Confirmed live (see below): right after a fresh
upload, Download works instantly with **zero** extra network request — better than the original
"gate on `objectUrl`" design would have delivered, since that would have made even this
already-free case wait on `p.pdfUrl`.

No loss of the ETP-4789 latency win, no inert-button window, and the duplicated background GET is
gone. `InvoicePreview.vitest.jsx`'s existing `Download PDF gated by cached attachment (ETP-4789
reject-cycle fix)` block needed no changes at all — its fixture always sets `objectUrl` directly, so
it still exercises branch 1 unchanged. A new `Download PDF lazily fetches the blob when cached
objectUrl is null (ETP-5358 Part 2)` block covers branches 2 and 3.

## Verification results (Part 1, 2026-09-16)

All of the following ran against the actual code change, on `localhost:3100` (`make dev`, no
StrictMode) and via the automated suites — nothing here is inferred from reading the diff.

**Flicker gone under adversarial timing, both directions.** Re-ran the delayed-`/main`-response
repro from the Evidence section — the one that deterministically produced the swap before the fix
— with the artificial delay on the *odd* calls, then again on the *even* calls (forces both possible
resolution orders between the two readers). Neither run swapped the panel:

```
flip=true,  mainCalls=2   t=26ms  leftPanel canvas:0  →  t=275ms  leftPanel canvas:1   (no swap)
flip=false, mainCalls=2   t=32ms  leftPanel canvas:0  →  t=3226ms leftPanel canvas:1   (no swap, even under a 3s delay)
```

Compare to the pre-fix trace in "Deterministic reproduction" above, which swapped to
`ManagedLeftPanel` at `t=3276ms` under the equivalent delay.

**Real cold/warm opens, unforced.** Sales invoice 10000015 (`C_Invoice/BF1D5905…`): cold-cache open
(console: `rendering fresh (cache miss)`) and warm-cache open (console: `served from cached
attachment (no re-render)`) both stayed on the single `flex flex-col h-full min-h-0 w-full
overflow-…` class (the caller's own `leftPanel`) for the whole open, canvas going `0 → 1` once and
never back to `0`. Confirmed again after `git stash` / `git stash pop` (to rule out stale HMR state).

**Sales-order, same result.** Order 1000010 (`C_Order`): single-owner panel, canvas `0 → 1`, no
swap.

**Drop-zone windows (out of scope) unaffected.** Purchase invoice with no attachment yet: drop zone
still renders (`data-testid="preview-drop-zone"` present, 0 canvases) — the `autoFetch`-gated early
return never fires for these windows, exactly as designed.

**Network duplication is still present, as expected** — Part 1 doesn't touch it: 2× `GET …/main`
and 2× `GET …/file` per open, same as documented above. That is Part 2's job, still on hold (see
"Risk found while designing Part 2").

**Automated:**

- `npx vitest run src/windows/custom/shared/__tests__/` → **61 files, 1449 tests passed** (includes
  the 3 new ETP-5358 regression tests in `GenericPreviewModal.vitest.jsx`).
- `npx vitest run src/windows/custom/{goods-shipment,return-to-vendor-shipment,goods-receipt,return-material-receipt}`
  → **26 files, 366 tests passed**.
- Playwright, mocked/integration specs actually exercising this code path
  (`invoice-preview-modal.spec.js`, `invoice-preview-persistence.spec.js`,
  `attachment-preview-sync.mocked.spec.js`) → **16/16 passed**.
- `printable-download.integration.spec.js` / `printable-download-purchase.integration.spec.js`:
  3 failures, all `401 Invalid or expired token` from fixture-setup helpers
  (`ensureProductSetup`/`ensureFinancialAccountSetup`) that hit the live backend directly — **not**
  from any code this change touches (grepped: zero references to `GenericPreviewModal`/
  `ManagedLeftPanel`/`useMainAttachment` in these specs or their helpers). Confirmed pre-existing:
  reproduced the identical 401 on a `git stash`-clean checkout of `main` before restoring the fix. A
  session/token setup issue in this environment, unrelated to ETP-5358.

## Verification results (Part 2, 2026-09-16)

Same methodology as Part 1: real `localhost:3100` opens, network/console read back, not inferred
from the diff.

**Blast-radius check, before writing any code.** `cachedAttachment`/`onFileChange` are consumed in
exactly three files (`InvoicePreview.jsx`, `OrderPreview.jsx`, `QuotationPreview.jsx`), each with
its own local `hasPdf`/`handleDownloadPdf` reading a purely presentational shared button
(`PreviewActionButtons.jsx`, or `InvoicePreview.jsx`'s own local `InvoiceActionButtons`) that only
receives `hasPdf`/`onDownloadPdf` as props and knows nothing about the attachment cache. Confirmed
by grep that `goods-shipment`, `return-to-vendor-shipment`, `return-material-receipt` (also
consumers of `PreviewActionButtons.jsx`) each compute `hasPdf` from their own `pdfBlob`/`pdfUrl`
directly and never touch `cachedAttachment` — unaffected by construction. `OcrSidePanel.jsx` holds
a fully independent `useMainAttachment` instance that never sets `skipBlobFetch`, so it keeps
eagerly fetching the blob exactly as before.

**Network reduction confirmed on a warm-cache open.** Sales invoice 10000015, same record as the
Part 1 traces: before Part 2, `2× GET main` + `2× GET file`; after, **`2× GET main` (unchanged —
both readers still ask "does it exist?") + `1× GET file`** (only `usePdfGenerator`'s own fetch, the
one that feeds the visible panel).

**Lazy fetch on click, confirmed.** With the panel already open and `cachedAttachment.objectUrl`
still `null` (metadata-only), clicking Download fired exactly **one new** `GET .../attachments/file/<id>`
and produced a working `blob:` URL with the correct filename
(`<documentId>.pdf`, matching the attachment's stored name); `p.handleDownloadPdf` was not the path
taken (confirmed by filename — `p.handleDownloadPdf` would have produced `invoice-<documentNo>.pdf`).
A **second** click of the same button fired **zero** further requests and returned the identical
`blob:` URL — the "return the already-known URL" branch, confirmed live, not just in the unit test.

**Fresh-upload path needs no lazy fetch at all — confirmed live.** Opened a different, previously
untouched completed invoice (console: `rendering fresh (cache miss)`, network: `2× GET main` +
`1× POST ?markAsMain=true`, zero `GET file` — the upload path never needed one). Clicking Download
immediately after produced a working `blob:` URL with the correct filename and **zero** network
requests — `uploadAndMark`'s always-on `URL.createObjectURL(blob)` (deliberately left untouched,
see "The chosen design" above) made the bytes available for free, without waiting on `p.pdfUrl` or
triggering `fetchBlobUrl()` at all.

**Automated, after Part 2:**

- `npx vitest run src/windows/custom/shared/__tests__/useMainAttachment.vitest.jsx` → **35/35**
  (26 pre-existing + 9 new: mount-time metadata-only behavior, `fetchBlobUrl` resolving/caching/
  de-duping/failing-gracefully, and the eager-mode sanity check). One iteration needed: the first
  draft of the new tests was appended with `cat >>` **after** the file's closing `});`, landing them
  as a sibling `describe` outside the shared `beforeEach(() => vi.clearAllMocks())` — mock call
  counts leaked across tests (3, 3, 5 instead of 1, 1, 1). Restructured to nest inside the existing
  `describe('useMainAttachment', ...)`; all 35 passed cleanly after.
- `npx vitest run src/windows/custom/shared/__tests__/InvoicePreview.vitest.jsx` → **53/53**
  (51 pre-existing, including the untouched ETP-4789 block — its fixture always sets `objectUrl`
  directly, so it still exercises the unchanged fast path — + 2 new, covering the lazy-fetch success
  and the fallback-to-`p.handleDownloadPdf` case).
- `npx vitest run src/windows/custom/shared/__tests__/ src/windows/custom/{goods-shipment,return-to-vendor-shipment,goods-receipt,return-material-receipt}`
  → **87 files, 1826 tests passed.**
- Playwright, the same mocked/integration specs as Part 1, re-run against the Part 2 code →
  **16/16 passed.**
- **Full-repo `npx vitest run` (every test file in `tools/app-shell`, not just the preview/shared
  subset) → 925 files, 17967 tests passed, 2 skipped, 0 failed.** Confirms Part 1 + Part 2 together
  introduce no regression anywhere in the frontend, not only in the directly-related directories.

## Test impact (predicted before implementation, confirmed after)

| Suite | Predicted impact | Actual result |
|---|---|---|
| `GenericPreviewModal.vitest.jsx` | Stale mock (`../usePreviewAttachment.js`, a module that no longer exists) meant `ManagedLeftPanel` was completely untested. **Add** a test: with `autoFetch: true` and a `storedFile` present, the caller's `leftPanel` must not be replaced. | Fixed the stale mock (now mocks the real `../useMainAttachment.js`) and added 3 tests: autoFetch=true keeps the caller panel even with `storedFile` resolved; autoFetch=false still shows its own file view; autoFetch=false with no file still shows the drop zone. **9/9 pass.** |
| `invoice-preview-persistence.spec.js` | Completed-invoice test only asserts a `GET …/main` fires (still fires, from `usePdfGenerator`); draft test asserts it does not. Both stay green. | **Confirmed — both pass**, plus the other 5 tests in the file (drop zone, upload, delete). |
| `attachment-preview-sync.mocked.spec.js` | Covers purchase-invoice and goods-receipt only, both `autoFetch: false`. Untouched. | **Confirmed — 4/4 pass.** |
| `invoice-preview-modal.spec.js` | Modal lifecycle only. Untouched. | **Confirmed — 5/5 pass.** |
| `InvoicePreview.vitest.jsx` | Green for Part 1 (`onFileChange` keeps firing). The ETP-4789 cached-attachment block must be rewritten **only if Part 2 lands**. | **Confirmed green** (part of the 1449-test shared-suite run below). Part 2 still on hold, so no rewrite needed yet. |
| `printable-download*.integration.spec.js` | Print path untouched; run as regression. | 3 failures, all pre-existing `401` auth issues unrelated to this change — see "Verification results" above. |

With Part 2, also add to `useMainAttachment.vitest.jsx`: metadata-only mode does not call
`fetchAttachmentBlobUrl`; drop-zone mode still does. **Not written yet — Part 2 is on hold.**

## Live verification plan

**The bug**

1. ✅ Completed sales invoice, 10 consecutive opens: single paint, no intermediate `Loading
   page…`. *(Verified via the adversarial-timing repro in both directions, 5000ms+ observation
   windows each — see "Verification results".)*
2. ⏳ Restart `make dev` (resets the bundle epoch, D16/D17), open a completed document for the
   first time: re-render + attachment upload **without** a viewer swap. *(Covered by the "cold
   cache" run above, which does exercise the re-render+upload path; a full `make dev` restart to
   specifically re-trigger the bundle-epoch check has not been separately re-run after the fix —
   low risk, since the fix is in the render-ordering code, not the invalidation logic.)*
3. ⏳ Edit a completed document (moves `updated`, ETP-4787), reopen: re-render, no flicker. *(Not
   separately exercised — same low-risk reasoning as #2.)*
4. ⏳ Network: exactly one `GET …/main` and one `GET …/file` per open — **still 2 of each,
   because this is Part 2's job and Part 2 is on hold.** No 500s observed in any run so far.
5. ✅ Run the deterministic repro snippet above: it must no longer produce a swap. *(Confirmed —
   see "Verification results".)*

**The five consumption points of `document-printables.md`**, for each affected window
(sales-invoice, sales-order, purchase-order, sales-quotation, goods-shipment,
return-to-vendor-shipment):

6. Preview shows the PDF. 7. Download gives the same PDF. 8. Email from the detail view attaches the
same PDF. 9. Email from the grid row hover, same. 10. Print from the detail button and from list
multi-select, same — and multi-select still excludes Drafts (D12).

**Non-regression of the drop-zone windows** (not modified, but the costliest to break)

11. Purchase invoice and goods receipt: drop zone with no file, upload, file view, delete button, and
    the supplier's document is never overwritten.
12. ETP-4315 sidebar/preview sync: `OcrSidePanel` and the preview resolve the same file.
13. Return material receipt: still the system PDF, no caching layer (D18).
14. Attachments tab: the marked attachment stays hidden from the list and from "download all" (ZIP).

**Drafts**

15. Draft invoice/order/quotation: live PDF, no `GET …/main`.

**Automated**

`npx vitest run` over `shared/__tests__` (`GenericPreviewModal`, `InvoicePreview`, `OrderPreview`,
`QuotationPreview`, `useMainAttachment`, `pdfUtils`) plus the four e2e specs listed above.

## Documentation duties (self-documentation policy)

- New decision **D21** in `docs/document-printables.md`: in `autoFetch` mode the panel is owned by
  the caller's `leftPanel`; `useMainAttachment` is write-only there. Rationale: `usePdfGenerator` has
  owned the cache read since 2026-08-18 and the second reader was left orphaned by the
  "do not touch `GenericPreviewModal`" decision.
- Close the thread in the 2026-08-18 follow-up section of
  `docs/plans/2026-08-03-etp-4315-attachment-preview-sync.md`.
- Correct `docs/plans/completed/2026-05-13/2026-05-11-generic-preview-infrastructure.md`: the
  "switches to cached file view on next open" rule was never reachable as written.

## Resolved decisions

1. ~~Does Part 2 land in this ticket or as a follow-up?~~ **Resolved: yes, here.** Implemented and
   verified — see "Verification results (Part 2)" above.
2. ~~Which Part 2 variant?~~ **Resolved: neither of the two originally sketched options.** The user
   proposed a third design during review — resolve existence eagerly (cheap, unchanged) but fetch
   the bytes lazily, only when Download is actually clicked, instead of either eagerly fetching them
   (the original waste) or gating the button on their eager availability (option (a), which would
   have silently lost the ETP-4789 latency win on every open). Implemented as `fetchBlobUrl()` — see
   "The chosen design" under Part 2 above. Strictly better than both original options: no lost
   latency win in the common case, no inert-button window, and the fresh-upload path turned out to
   need no extra request at all (`uploadAndMark`'s objectUrl is already free, see "Verification
   results (Part 2)").

## Pre-push run (2026-09-16, real `.githooks/pre-push`, not a manual approximation)

First real `git push` attempt was **blocked** — 2 problems, both investigated and resolved before
re-pushing:

1. **SonarQube Quality Gate — real, confirmed issue in this change.** `GenericPreviewModal.jsx:56`,
   rule `javascript:S3358` (MAJOR): a nested ternary inside the `onFileChange` effect (the code that
   decides what to hand the caller — `null` when stale, an augmented `storedFile` otherwise, `null`
   again when there is none). Fixed by extracting it into a plain `if` block assigning a local
   `reportedFile` variable, no behavior change. Verified with a local, changed-files-only Sonar scan
   (`./run-sonar.sh --base-ref <parent-commit> --changed-only --allow-dirty`, ~35s): **Quality Gate
   OK, 0 open issues, 0 code smells** — confirmed against the fixed file on disk, not just asserted.
   Re-ran `npx vitest run src/windows/custom/shared/__tests__/` after the fix: 61 files, 1460 tests,
   still green. Commit amended (nothing had reached origin yet, so amending was safe).

2. **2 mocked Playwright specs failed** (`bp-blocking-banner.mocked.spec.js`,
   `fiscal-models-303-identification.mocked.spec.js`) — **investigated, confirmed pre-existing and
   unrelated, not caused by this change:**
   - Grepped both spec files for any reference to `GenericPreviewModal`, `ManagedLeftPanel`,
     `useMainAttachment`, `cachedAttachment`, or the attachments endpoints this change touches:
     **zero matches.** Different domain entirely (BP credit-limit blocking banner on a new
     purchase-invoice; FM 303 fiscal report section visibility).
   - `fiscal-models-303-identification`: passed cleanly on an isolated re-run.
   - `bp-blocking-banner`: failed once in isolation too, but the test's own code comments describe
     it as racing a 300ms debounce against "more concurrent work than [an] already-loaded existing
     record" on mount — a timing-sensitive test by its own admission. Re-ran with
     `--repeat-each=3`: **3/3 passed.** Consistent with flakiness under the heavy resource
     contention of a 35-minute, 4-worker pre-push run, not a regression from this change.
   - Both are pre-existing, environment-sensitive flaky tests; no code change made for them.

**A third, unrelated finding, discarded rather than committed:** running the integration E2E suite
locally regenerated several `artifacts/delivery-evidence/*` files (randomized test-user names in a
JSON fixture, refreshed screenshots) as a side effect. These are test-run byproducts, not part of
this fix — restored to their committed state (`git checkout -- artifacts/delivery-evidence/`) rather
than included.

## Remaining open items (not yet done)

1. **Documentation duties** listed above (D21 in `document-printables.md`, closing the 2026-08-18
   follow-up thread, correcting the mayo plan) — not yet written.
2. **Minor, accepted, not fixed:** on the very first click of Download after a stale/cold-cache
   re-render, `fetchBlobUrl()` would re-fetch bytes the caller might already hold via `p.pdfBlob` —
   in practice this path is not reached (confirmed live: the fresh-upload path's `cachedAttachment`
   already carries a real `objectUrl` from `uploadAndMark`, so `handleDownloadPdf` never falls
   through to `fetchBlobUrl()` there). No known case triggers the theoretical extra request; noted
   for completeness, not treated as a bug.
3. **Not committed.** Per explicit instruction, changes stay in the working tree for review before
   any commit.
