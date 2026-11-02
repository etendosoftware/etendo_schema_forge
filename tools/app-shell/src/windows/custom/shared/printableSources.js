/**
 * printableSources.js — the single source of what the browser sends to jsreport for a
 * document printable: template, CSS, Handlebars helpers, chrome-pdf options and the label
 * keys of each document. ETP-6013.
 *
 * WHY A SEPARATE, ALIAS-FREE MODULE
 * ---------------------------------
 * Two consumers render the same document:
 *
 *   - the browser (`documentPdf.js` / `pdfUtils.js` and the `use*Pdf` hooks), and
 *   - the backend (com.etendoerp.go `NeoPrintableRenderer`), which renders a completed
 *     document server-side so the MCP can return or email a PDF nobody opened in the UI.
 *
 * The backend does not hold a copy of the template. The frontend build publishes, next to
 * the SPA bundle, a JSON manifest per document built from THIS module
 * (`vite-plugins/printables-publish.js` → `dist/printables/<document>.json`), and the
 * backend fetches it at render time. So this file must load in plain Node at build time:
 * it imports nothing that needs the Vite aliases, React or a browser global. Keep it that
 * way — an `@/` import here breaks the build-time publication, not the app.
 *
 * Everything the browser sends is defined here once and re-exported by its historical
 * owner (`DOCUMENT_TEMPLATE`/`DOCUMENT_CSS` by `documentPdf.js`, `COMMON_HANDLEBARS_HELPERS`
 * by `pdfUtils.js`), so no caller had to change. See `docs/document-printables.md`.
 */
import { buildJsreportHelpersString } from '../../../../../../templates/reports/helpers/report-html-helpers.js';

// ---------------------------------------------------------------------------
// Commercial template (invoice, orders, quotation) — moved verbatim from documentPdf.js
// ---------------------------------------------------------------------------
// labels.documentSection — set per-document-type by each hook's labels object
// labels.validUntil      — rendered only when data.validUntil is set (quotations only)
// currencyCode           — ISO 4217 code of the DOCUMENT currency (ETP-5125), rendered
//                          in the header meta block only when resolved; see
//                          resolveDocumentCurrencyCode() in documentPdf.js
export const DOCUMENT_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

:root {
  --gray-100:#E8E8ED; --gray-400:#8A8AA3; --gray-500:#6C6C89; --gray-700:#3F3F50; --gray-900:#121217;
  --fg-1:var(--gray-900); --fg-2:var(--gray-700); --fg-3:var(--gray-500); --fg-4:var(--gray-400);
  --border-1:var(--gray-100);
  --radius-lg:12px;
  --font-sans:'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
}

* { margin:0; padding:0; box-sizing:border-box; }
body { font-family: var(--font-sans); font-size: 13px; line-height: 18px; color: var(--fg-2); background:#fff; -webkit-font-smoothing:antialiased; text-rendering:optimizeLegibility; }

.invoice {
  width: 794px;
  min-height: 1123px;
  padding: 56px 56px 48px;
  background:#fff;
  color: var(--fg-1);
  display:flex;
  flex-direction:column;
  gap:24px;
}

/* Verifactu tax QR (ETP-4912). Geometry mandated by the AEAT spec v0.4.7:
   a 40x40mm symbol (art. 21.1) and a quiet zone of at least 2mm, 6mm recommended
   (section 3) — expressed here in px because this document is laid out at 96dpi
   (794px = A4 width), so 40mm = 151px and 6mm = 23px. The label and caption must be
   legible and no smaller than the rest of the invoice data (art. 20.1.b); the body is
   13px, so these must not go below it. */
.inv-verifactu-qr { text-align:center; }
.inv-verifactu-qr-label { font-size:14px; font-weight:600; color:var(--fg-1); }
.inv-verifactu-qr-img { width:151px; height:151px; padding:23px; box-sizing:content-box; background:#fff; display:block; margin:0 auto; }
.inv-verifactu-qr-caption { font-size:13px; color:var(--fg-1); line-height:17px; }

/* Shared company atom */
.inv-company-name { font-weight:700; font-size:16px; line-height:22px; letter-spacing:-0.01em; color:var(--fg-1); }
.inv-company-lines { color:var(--fg-2); font-size:12px; line-height:18px; }
.inv-company-lines .muted { color:var(--fg-3); }

/* Logo */
.inv-logo-img { max-width:140px; max-height:56px; object-fit:contain; object-position:left center; flex-shrink:0; display:block; }

/* Eyebrow */
.eyebrow {
  font-size:10px;
  font-weight:600;
  text-transform:uppercase;
  letter-spacing:0.08em;
  color:var(--fg-3);
}

/* Header B — full-width bar */
.inv-header-b {
  display:grid;
  grid-template-columns:auto 1fr auto;
  gap:28px;
  align-items:center;
  padding:20px 24px;
  background:#fff;
  border:1px solid var(--border-1);
  border-radius:var(--radius-lg);
}
.inv-header-b.no-logo { grid-template-columns:1fr auto; }
.inv-header-b .meta { text-align:right; border-left:1px solid var(--border-1); padding-left:24px; }
.inv-header-b .meta .label { font-size:10px; text-transform:uppercase; letter-spacing:0.08em; color:var(--fg-3); font-weight:600; }
.inv-header-b .meta .doc-type { font-size:12px; color:var(--fg-2); margin-top:2px; }
.inv-header-b .meta .num { font-size:22px; font-weight:700; line-height:28px; letter-spacing:-0.01em; color:var(--fg-1); margin-top:2px; font-variant-numeric:tabular-nums; }
.inv-header-b .meta .currency { font-size:12px; color:var(--fg-2); margin-top:4px; }

/* Info grid */
.inv-info-grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
.inv-info-card { border:1px solid var(--border-1); border-radius:var(--radius-lg); padding:16px 18px; background:#fff; }
.inv-info-card .eyebrow { margin-bottom:8px; }
.inv-info-card .row { font-size:13px; line-height:20px; color:var(--fg-2); }
.inv-info-card .row strong { color:var(--fg-1); font-weight:600; }
.inv-address-lines { margin-top:2px; display:flex; flex-direction:column; gap:2px; }

/* Lines table */
.inv-table { width:100%; border-collapse:collapse; font-size:13px; margin-top:4px; }
.inv-table thead th { text-align:left; font-size:10px; font-weight:600; letter-spacing:0.08em; text-transform:uppercase; color:var(--fg-3); padding:10px 8px; border-bottom:1px solid var(--border-1); }
.inv-table thead th.num, .inv-table tbody td.num { text-align:right; font-variant-numeric:tabular-nums; }
.inv-table tbody td { padding:14px 8px; color:var(--fg-2); vertical-align:top; }
.inv-table tbody tr + tr td { border-top:1px solid var(--border-1); }
.inv-table tbody td.code { color:var(--fg-3); font-variant-numeric:tabular-nums; }
.inv-table tbody td.desc { color:var(--fg-1); font-weight:500; }
.inv-table .iva-pill { display:inline-block; font-size:11px; color:var(--fg-2); white-space:nowrap; }

/* Totals */
.inv-totals { display:flex; justify-content:flex-end; padding-top:12px; border-top:1px solid var(--border-1); }
.inv-totals-inner { width:300px; display:flex; flex-direction:column; gap:8px; }
.inv-totals .row { display:flex; justify-content:space-between; font-size:13px; color:var(--fg-2); font-variant-numeric:tabular-nums; }
.inv-totals .row.grand { margin-top:8px; padding-top:10px; border-top:1px solid var(--border-1); font-size:15px; font-weight:700; color:var(--fg-1); }
.inv-totals .row.discount { color:var(--fg-3); font-size:12px; }
.inv-totals .row.conversion-row { color:var(--fg-3); font-size:11px; font-weight:700; margin-top:4px; }
.inv-totals .rate-note { color:var(--fg-4); font-size:10px; font-weight:700; margin-left:4px; }

/* Observations */
.inv-observ { border:1px solid var(--border-1); border-radius:var(--radius-lg); padding:14px 18px; display:grid; grid-template-columns:120px 1fr; gap:16px; margin-top:8px; }
.inv-observ .eyebrow { padding-top:2px; }
.inv-observ .body { font-size:12px; line-height:18px; color:var(--fg-2); }

/* Footer */
.inv-footer { margin-top:auto; padding-top:24px; border-top:1px solid var(--border-1); display:flex; justify-content:space-between; font-size:10px; color:var(--fg-4); text-transform:uppercase; letter-spacing:0.08em; }

@page { size:A4 portrait; margin:0; }
`;

// ---------------------------------------------------------------------------
// Handlebars template
// labels.documentSection — set per-document-type by each hook's labels object
// labels.validUntil      — rendered only when data.validUntil is set (quotations only)
// currencyCode           — ISO 4217 code of the DOCUMENT currency (ETP-5125), rendered
//                          in the header meta block only when resolved; see
//                          resolveDocumentCurrencyCode() below
// ---------------------------------------------------------------------------
export const DOCUMENT_TEMPLATE = `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><style>{{{css}}}</style></head>
<body>
<div class="invoice">

  {{!-- Verifactu tax QR (ETP-4912) — AEAT spec v0.4.7, Orden arts. 20-21 + section 3.
       Rendered at the very top of the invoice, centred between the margins, and only
       when the AEAT URL has been issued. The label and the phrase are hardcoded Spanish
       legal literals (they match classic's AD messages ETVFAC_fiscal_QR /
       ETVFAC_verifiable_AEAT, whose en_US translation is identical), so they are NOT
       routed through {{labels}}. --}}
  {{#if verifactuQrDataUrl}}
  <div class="inv-verifactu-qr">
    <div class="inv-verifactu-qr-label">QR Tributario:</div>
    <img class="inv-verifactu-qr-img" src="{{verifactuQrDataUrl}}" alt="QR Tributario">
    <div class="inv-verifactu-qr-caption">Factura verificable en la sede electrónica de la AEAT</div>
  </div>
  {{/if}}

  <!-- Header B: logo | company data | document meta -->
  <div class="inv-header-b{{#unless companyLogoDataUrl}} no-logo{{/unless}}">
    {{#if companyLogoDataUrl}}
    <img class="inv-logo-img" src="{{companyLogoDataUrl}}" alt="{{companyName}}">
    {{/if}}
    <div class="inv-company-lines">
      <div class="inv-company-name">{{companyName}}</div>
      {{#if companyAddress1}}<div style="margin-top:6px">{{companyAddress1}}</div>{{/if}}
      {{#if companyAddress2}}<div>{{companyAddress2}}</div>{{/if}}
      {{#if companyCityLine}}<div>{{companyCityLine}}</div>{{/if}}
      {{#if companyTaxId}}<div class="muted">{{labels.taxId}} {{companyTaxId}}</div>{{/if}}
    </div>
    <div class="meta">
      <div class="label">{{labels.title}}</div>
      <div class="doc-type">{{labels.documentNo}}</div>
      <div class="num">{{documentNo}}</div>
      {{#if currencyCode}}<div class="currency">{{labels.currency}} {{currencyCode}}</div>{{/if}}
    </div>
  </div>

  <!-- Info cards -->
  <div class="inv-info-grid">
    <div class="inv-info-card">
      <div class="eyebrow">{{labels.customerSection}}</div>
      <div class="row"><strong>{{labels.customer}}</strong> {{customerName}}</div>
      {{#if hasCustomerAddress}}
      <div class="row"><strong>{{labels.address}}</strong></div>
      <div class="inv-address-lines">
        {{#each customerAddressLines}}<div class="row">{{this}}</div>{{/each}}
      </div>
      {{/if}}
    </div>
    <div class="inv-info-card">
      <div class="eyebrow">{{labels.documentSection}}</div>
      <div class="row"><strong>{{labels.date}}</strong> {{fmtDate invoiceDate}}</div>
      {{#if paymentTerms}}<div class="row"><strong>{{labels.paymentTerms}}</strong> {{paymentTerms}}</div>{{/if}}
      {{#if paymentMethod}}<div class="row"><strong>{{labels.paymentMethod}}</strong> {{paymentMethod}}</div>{{/if}}
      {{#if validUntil}}<div class="row"><strong>{{labels.validUntil}}</strong> {{fmtDate validUntil}}</div>{{/if}}
    </div>
  </div>

  <!-- Lines table -->
  <table class="inv-table">
    <thead>
      <tr>
        <th style="width:56px">{{labels.colCode}}</th>
        <th>{{labels.colDescription}}</th>
        <th class="num" style="width:90px">{{labels.colQty}}</th>
        <th class="num" style="width:96px">{{labels.colUnitPrice}}</th>
        <th class="num" style="width:70px">{{labels.colDiscount}}</th>
        <th style="width:90px">{{labels.colTax}}</th>
        <th class="num" style="width:80px">{{labels.colTotal}}</th>
      </tr>
    </thead>
    <tbody>
      {{#each lines}}
      <tr>
        <td class="code">{{this.productCode}}</td>
        <td class="desc">{{this.productName}}</td>
        <td class="num">{{formatCurrency this.quantity}}</td>
        <td class="num">{{formatCurrency this.unitPrice}}</td>
        <td class="num">{{#if this.discount}}{{this.discount}}%{{else}}–{{/if}}</td>
        <td><span class="iva-pill">{{this.taxName}}</span></td>
        <td class="num">{{formatCurrency this.lineTotal}}</td>
      </tr>
      {{/each}}
    </tbody>
  </table>

  <!-- Totals -->
  <div class="inv-totals">
    <div class="inv-totals-inner">
      {{!-- discountPerProduct/totalDiscountAmt already carry the correct printed
           sign (positive amounts, computed as -discountAmt) from the data
           builder — the sign is NOT re-derived here, so a negative-quantity
           line (a same-invoice return) still prints a positive discount
           magnitude, matching DocumentTotalsPanel on screen (ETP-5132). Do
           NOT reintroduce a hardcoded "−" prefix in front of these two rows. --}}
      {{#if grossAmount}}
      <div class="row"><span>{{labels.subtotalWithoutDiscount}}</span><span>{{formatCurrency grossAmount}}</span></div>
      <div class="row discount"><span>{{labels.discountPerProduct}}</span><span>{{formatCurrency discountPerProduct}}</span></div>
      {{/if}}
      {{#if totalDiscountAmt}}
      <div class="row discount"><span>{{labels.totalDiscount}} ({{etgoTotalDiscount}}%)</span><span>{{formatCurrency totalDiscountAmt}}</span></div>
      {{/if}}
      <div class="row"><span>{{labels.subtotal}}</span><span>{{formatCurrency netAmount}}</span></div>
      <div class="row"><span>{{labels.tax}}</span><span>{{formatCurrency taxAmount}}</span></div>
      <div class="row grand"><span>{{labels.grandTotal}}</span><span>{{formatCurrency grandTotal}}</span></div>
      {{#if exchangeRate}}
      <div class="row conversion-row"><span>{{orgCurrencyCode}}</span><span>{{formatCurrency orgGrandTotal}} <span class="rate-note">({{formatNumber exchangeRate}})</span></span></div>
      {{/if}}
    </div>
  </div>

  <!-- Observations -->
  <div class="inv-observ">
    <div class="eyebrow">{{labels.notes}}</div>
    <div class="body">{{notes}}</div>
  </div>

  <!-- Footer -->
  <div class="inv-footer">
    <span>{{companyName}}</span>
    <span>{{labels.page}} 1</span>
  </div>

</div>
</body></html>`;

// ---------------------------------------------------------------------------
// Shared Handlebars helpers (date + conditional — no fmt, which differs per doc).
// Moved verbatim from pdfUtils.js, which re-exports it.
// ---------------------------------------------------------------------------
export const COMMON_HANDLEBARS_HELPERS = `
function fmtDate(v) {
  if (!v) return '';
  var d = new Date(v);
  if (isNaN(d.getTime())) return String(v);
  return ('0'+d.getDate()).slice(-2)+'/'+('0'+(d.getMonth()+1)).slice(-2)+'/'+d.getFullYear();
}
function ifEq(a, b, opts) { return a === b ? opts.fn(this) : opts.inverse(this); }
function fmtRate(v, maybeDecimals) {
  if (v == null || v === '') return '';
  var n = Number(v);
  if (isNaN(n)) return '';
  var d = (typeof maybeDecimals === 'number' && maybeDecimals >= 0) ? maybeDecimals : 4;
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
}
`;

/**
 * The chrome-pdf options every document printable is rendered with (A4 portrait, no
 * margins: the template draws its own). `renderPdf` (pdfUtils.js) sends exactly this
 * object, and the published manifest carries it, so the server render cannot drift.
 */
export const JSREPORT_CHROME_A4 = Object.freeze({
  format: 'A4',
  landscape: false,
  marginTop: '0mm',
  marginBottom: '0mm',
  marginLeft: '0mm',
  marginRight: '0mm',
  printBackground: true,
});

// ---------------------------------------------------------------------------
// Movement family (goods shipment, both returns) — moved verbatim from pdfUtils.js and the
// three use*Pdf hooks (ETP-6013). Quantities and a receiver signature, deliberately no
// prices (D9). pdfUtils.js re-exports the shared pieces; each hook composes its template
// from them and its own *_TEMPLATE_BODY, exactly as movementTemplate() does for the manifest.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Shared PDF CSS (A4 document layout — used by all delivery-note hooks)
// ---------------------------------------------------------------------------
export const COMMON_PDF_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

:root {
  --gray-50:#F8F8FA; --gray-100:#E8E8ED; --gray-400:#8A8AA3; --gray-500:#6C6C89; --gray-700:#3F3F50; --gray-900:#121217;
  --fg-1:var(--gray-900); --fg-2:var(--gray-700); --fg-3:var(--gray-500); --fg-4:var(--gray-400);
  --border-1:var(--gray-100);
  --radius-sm:8px; --radius-lg:12px;
  --font-sans:'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
}

* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:var(--font-sans); font-size:13px; line-height:18px; color:var(--fg-2); background:#fff; -webkit-font-smoothing:antialiased; text-rendering:optimizeLegibility; }

.doc { width:794px; padding:56px 56px 48px; background:#fff; color:var(--fg-1); display:flex; flex-direction:column; gap:24px; }

/* ── Header ─────────────────────────────────────── */
.doc-header { display:flex; justify-content:space-between; align-items:center; padding-bottom:20px; border-bottom:2px solid var(--border-1); }
.doc-header-left { display:flex; align-items:center; gap:16px; }
.doc-logo-img { width:160px; height:64px; object-fit:contain; object-position:left center; display:block; flex-shrink:0; }
.doc-header-company .company-name { font-weight:700; font-size:15px; line-height:20px; color:var(--fg-1); }
.doc-header-company .company-cif { font-size:11px; color:var(--fg-3); margin-top:3px; }
.doc-header-meta { text-align:right; }
.doc-header-meta .doc-label { font-size:10px; font-weight:600; text-transform:uppercase; letter-spacing:0.08em; color:var(--fg-3); }
.doc-header-meta .doc-num { font-size:22px; font-weight:700; letter-spacing:-0.01em; color:var(--fg-1); line-height:28px; margin-top:2px; font-variant-numeric:tabular-nums; }

/* ── Parties ─────────────────────────────────────── */
.doc-parties { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
.doc-party-card { border:1px solid var(--border-1); border-radius:var(--radius-lg); padding:16px 18px; }
.doc-party-card .eyebrow { font-size:10px; font-weight:600; text-transform:uppercase; letter-spacing:0.08em; color:var(--fg-3); margin-bottom:8px; }
.doc-party-card .party-name { font-weight:600; font-size:14px; color:var(--fg-1); line-height:20px; }
.doc-party-card .party-line { font-size:12px; line-height:18px; color:var(--fg-2); margin-top:2px; }
.doc-party-card .party-line.muted { color:var(--fg-3); }

/* ── Movement band ───────────────────────────────── */
.doc-movement { display:grid; grid-template-columns:1fr 1fr 1fr; background:var(--gray-50); border-radius:var(--radius-lg); padding:14px 20px; gap:16px; }
.doc-movement-cell .cell-label { font-size:10px; font-weight:600; text-transform:uppercase; letter-spacing:0.08em; color:var(--fg-3); margin-bottom:4px; }
.doc-movement-cell .cell-value { font-size:13px; font-weight:500; color:var(--fg-1); }

/* ── Table ───────────────────────────────────────── */
.doc-table { width:100%; border-collapse:collapse; font-size:13px; }
.doc-table thead tr { background:var(--gray-50); }
.doc-table thead th { text-align:left; font-size:10px; font-weight:600; letter-spacing:0.08em; text-transform:uppercase; color:var(--fg-3); padding:10px 12px; }
.doc-table thead th:first-child { border-radius:var(--radius-sm) 0 0 var(--radius-sm); }
.doc-table thead th:last-child { border-radius:0 var(--radius-sm) var(--radius-sm) 0; }
.doc-table thead th.num, .doc-table tbody td.num { text-align:right; font-variant-numeric:tabular-nums; }
.doc-table tbody td { padding:12px 12px; color:var(--fg-2); vertical-align:top; }
.doc-table tbody tr + tr td { border-top:1px solid var(--border-1); }
.doc-table tbody td.code { color:var(--fg-3); font-size:12px; font-variant-numeric:tabular-nums; }
.doc-table tbody td.desc { color:var(--fg-1); font-weight:500; }

/* ── Observations ────────────────────────────────── */
.doc-observ { border:1px solid var(--border-1); border-radius:var(--radius-lg); padding:14px 18px; }
.doc-observ .eyebrow { font-size:10px; font-weight:600; text-transform:uppercase; letter-spacing:0.08em; color:var(--fg-3); margin-bottom:6px; }
.doc-observ .body { font-size:12px; line-height:18px; color:var(--fg-2); }

/* ── Signature ───────────────────────────────────── */
.doc-signature { border-top:1px solid var(--border-1); padding-top:24px; display:grid; grid-template-columns:1fr 1fr; gap:32px; }
.doc-sig-field .sig-label { font-size:10px; font-weight:600; text-transform:uppercase; letter-spacing:0.08em; color:var(--fg-3); margin-bottom:72px; display:block; }
.doc-sig-field .sig-line { border-top:1px solid var(--gray-400); }

/* ── Footer ──────────────────────────────────────── */
.doc-footer { padding-top:20px; border-top:1px solid var(--border-1); display:flex; justify-content:space-between; font-size:10px; color:var(--fg-4); text-transform:uppercase; letter-spacing:0.08em; }

@page { size:A4 portrait; margin:0; }
`;

// Return-doc helpers: adds fmt() (3-decimal number formatter) to the common set
export const RETURN_DOC_HELPERS = `
function fmt(v) {
  if (v == null || v === '') return '0';
  var n = Number(v);
  if (isNaN(n)) return String(v);
  return new Intl.NumberFormat('es', { minimumFractionDigits: 0, maximumFractionDigits: 3 }).format(n);
}
` + COMMON_HANDLEBARS_HELPERS;

// ---------------------------------------------------------------------------
// Shared HTML template fragments — movement-type documents (shipment, receipt)
// ---------------------------------------------------------------------------
export const MOVEMENT_TEMPLATE_OPEN = `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><style>{{{css}}}</style></head>
<body>
<div class="doc">`;

export const MOVEMENT_TEMPLATE_HEADER = `
  <div class="doc-header">
    <div class="doc-header-left">
      {{#if companyLogoDataUrl}}<img class="doc-logo-img" src="{{companyLogoDataUrl}}" alt="">{{/if}}
      <div class="doc-header-company">
        <div class="company-name">{{companyName}}</div>
        {{#if companyTaxId}}<div class="company-cif">{{labels.taxId}} {{companyTaxId}}</div>{{/if}}
      </div>
    </div>
    <div class="doc-header-meta">
      <div class="doc-label">{{labels.title}}</div>
      <div class="doc-num">{{documentNo}}</div>
    </div>
  </div>`;

export const MOVEMENT_TEMPLATE_PARTIES = `
  <div class="doc-parties">
    <div class="doc-party-card">
      <div class="eyebrow">{{labels.issuerSection}}</div>
      <div class="party-name">{{companyName}}</div>
      {{#if companyAddress1}}<div class="party-line">{{companyAddress1}}</div>{{/if}}
      {{#if companyAddress2}}<div class="party-line">{{companyAddress2}}</div>{{/if}}
      {{#if companyCityLine}}<div class="party-line">{{companyCityLine}}</div>{{/if}}
      {{#if companyTaxId}}<div class="party-line muted">{{labels.taxId}} {{companyTaxId}}</div>{{/if}}
    </div>
    <div class="doc-party-card">
      <div class="eyebrow">{{labels.deliverySection}}</div>
      <div class="party-name">{{customerName}}</div>
      {{#each customerAddressLines}}<div class="party-line">{{this}}</div>{{/each}}
    </div>
  </div>`;

export const MOVEMENT_TEMPLATE_SIGNATURE = `
  <div class="doc-signature">
    <div class="doc-sig-field">
      <span class="sig-label">{{labels.signatureReceiver}}</span>
      <div class="sig-line"></div>
    </div>
    <div class="doc-sig-field">
      <span class="sig-label">{{labels.signatureDate}}</span>
      <div class="sig-line"></div>
    </div>
  </div>`;

export const MOVEMENT_TEMPLATE_NOTES = `
  {{#if notes}}
  <div class="doc-observ">
    <div class="eyebrow">{{labels.notes}}</div>
    <div class="body">{{notes}}</div>
  </div>
  {{/if}}`;

export const MOVEMENT_TEMPLATE_FOOTER = `
  <div class="doc-footer">
    <span>{{companyName}}</span>
    <span>{{labels.page}} 1</span>
  </div>

</div>
</body></html>`;

/** The middle fragment of each movement document, between the parties and the signature. */
export const SHIPMENT_TEMPLATE_BODY = `
  <div class="doc-movement">
    <div class="doc-movement-cell">
      <div class="cell-label">{{labels.date}}</div>
      <div class="cell-value">{{fmtDate movementDate}}</div>
    </div>
    <div class="doc-movement-cell">
      <div class="cell-label">{{labels.salesOrder}}</div>
      <div class="cell-value">{{#if salesOrderRef}}{{salesOrderRef}}{{else}}—{{/if}}</div>
    </div>
    <div class="doc-movement-cell">
      <div class="cell-label">{{labels.warehouse}}</div>
      <div class="cell-value">{{#if warehouse}}{{warehouse}}{{else}}—{{/if}}</div>
    </div>
  </div>

  <table class="doc-table">
    <thead>
      <tr>
        <th style="width:64px">{{labels.colCode}}</th>
        <th>{{labels.colDescription}}</th>
        <th class="num" style="width:110px">{{labels.colOrdered}}</th>
        <th class="num" style="width:120px">{{labels.colDelivered}}</th>
      </tr>
    </thead>
    <tbody>
      {{#each lines}}
      <tr>
        <td class="code">{{this.productCode}}</td>
        <td class="desc">{{this.productName}}</td>
        <td class="num">{{fmt this.orderedQty}}</td>
        <td class="num">{{fmt this.deliveredQty}}</td>
      </tr>
      {{/each}}
    </tbody>
  </table>`;

export const RETURN_TO_VENDOR_TEMPLATE_BODY = `
  <div class="doc-movement">
    <div class="doc-movement-cell">
      <div class="cell-label">{{labels.date}}</div>
      <div class="cell-value">{{fmtDate movementDate}}</div>
    </div>
    <div class="doc-movement-cell">
      <div class="cell-label">{{labels.sourceReceipt}}</div>
      <div class="cell-value">{{#if sourceReceiptRef}}{{sourceReceiptRef}}{{else}}—{{/if}}</div>
    </div>
    <div class="doc-movement-cell">
      <div class="cell-label">{{labels.warehouse}}</div>
      <div class="cell-value">{{#if warehouse}}{{warehouse}}{{else}}—{{/if}}</div>
    </div>
  </div>

  <table class="doc-table">
    <thead>
      <tr>
        <th style="width:64px">{{labels.colCode}}</th>
        <th>{{labels.colDescription}}</th>
        <th class="num" style="width:130px">{{labels.colReturned}}</th>
        <th class="num" style="width:130px">{{labels.colOriginalQty}}</th>
      </tr>
    </thead>
    <tbody>
      {{#each lines}}
      <tr>
        <td class="code">{{this.productCode}}</td>
        <td class="desc">{{this.productName}}</td>
        <td class="num">{{fmt this.returnedQty}}</td>
        <td class="num">{{fmt this.originalQty}}</td>
      </tr>
      {{/each}}
    </tbody>
  </table>`;

export const RETURN_RECEIPT_TEMPLATE_BODY = `
  <div class="doc-movement">
    <div class="doc-movement-cell">
      <div class="cell-label">{{labels.date}}</div>
      <div class="cell-value">{{fmtDate movementDate}}</div>
    </div>
    <div class="doc-movement-cell">
      <div class="cell-label">{{labels.sourceShipment}}</div>
      <div class="cell-value">{{#if sourceShipmentRef}}{{sourceShipmentRef}}{{else}}—{{/if}}</div>
    </div>
    <div class="doc-movement-cell">
      <div class="cell-label">{{labels.warehouse}}</div>
      <div class="cell-value">{{#if warehouse}}{{warehouse}}{{else}}—{{/if}}</div>
    </div>
  </div>

  <table class="doc-table">
    <thead>
      <tr>
        <th style="width:64px">{{labels.colCode}}</th>
        <th>{{labels.colDescription}}</th>
        <th class="num" style="width:130px">{{labels.colReturned}}</th>
      </tr>
    </thead>
    <tbody>
      {{#each lines}}
      <tr>
        <td class="code">{{this.productCode}}</td>
        <td class="desc">{{this.productName}}</td>
        <td class="num">{{fmt this.returnedQty}}</td>
      </tr>
      {{/each}}
    </tbody>
  </table>`;

/**
 * A movement document's full template: the shared fragments around its own body — the
 * composition every movement hook writes inline (`TEMPLATE = MOVEMENT_TEMPLATE_OPEN + …`).
 *
 * @param {string} body  one of the *_TEMPLATE_BODY constants
 * @returns {string}
 */
export function movementTemplate(body) {
  return MOVEMENT_TEMPLATE_OPEN
    + MOVEMENT_TEMPLATE_HEADER
    + MOVEMENT_TEMPLATE_PARTIES
    + body
    + MOVEMENT_TEMPLATE_SIGNATURE
    + MOVEMENT_TEMPLATE_NOTES
    + MOVEMENT_TEMPLATE_FOOTER;
}

/** The labels of the movement documents (formerly inlined in get*PdfLabels). */
export const SHIPMENT_PDF_LABEL_KEYS = Object.freeze({
  title:             i18nKey('shipmentPdfTitle'),
  taxId:             'invoicePdfTaxId',
  page:              'invoicePdfPage',
  issuerSection:     'shipmentPdfIssuerSection',
  deliverySection:   'shipmentPdfDeliverySection',
  salesOrder:        'shipmentPdfSalesOrder',
  date:              'shipmentPdfDate',
  warehouse:         'shipmentPdfWarehouse',
  colCode:           'invoicePdfColCode',
  colDescription:    'invoicePdfColDescription',
  colOrdered:        'shipmentPdfColOrdered',
  colDelivered:      'shipmentPdfColDelivered',
  notes:             'invoicePdfNotes',
  signatureReceiver: 'shipmentPdfSignatureReceiver',
  signatureDate:     'shipmentPdfSignatureDate',
});

export const RETURN_TO_VENDOR_PDF_LABEL_KEYS = Object.freeze({
  title:             i18nKey('returnToVendorPdfTitle'),
  taxId:             'invoicePdfTaxId',
  page:              'invoicePdfPage',
  issuerSection:     'shipmentPdfIssuerSection',
  deliverySection:   'shipmentPdfDeliverySection',
  sourceReceipt:     'returnToVendorPdfSourceReceipt',
  date:              'shipmentPdfDate',
  warehouse:         'shipmentPdfWarehouse',
  colCode:           'invoicePdfColCode',
  colDescription:    'invoicePdfColDescription',
  colReturned:       'returnToVendorPdfColReturned',
  colOriginalQty:    'returnToVendorPdfColOriginalQty',
  notes:             'invoicePdfNotes',
  signatureReceiver: 'shipmentPdfSignatureReceiver',
  signatureDate:     'shipmentPdfSignatureDate',
});

export const RETURN_RECEIPT_PDF_LABEL_KEYS = Object.freeze({
  title:             i18nKey('returnReceiptPdfTitle'),
  taxId:             'invoicePdfTaxId',
  page:              'invoicePdfPage',
  issuerSection:     'shipmentPdfIssuerSection',
  deliverySection:   'shipmentPdfDeliverySection',
  sourceShipment:    'returnReceiptPdfSourceShipment',
  date:              'shipmentPdfDate',
  warehouse:         'shipmentPdfWarehouse',
  colCode:           'invoicePdfColCode',
  colDescription:    'invoicePdfColDescription',
  colReturned:       'returnReceiptPdfColReturned',
  notes:             'invoicePdfNotes',
  signatureReceiver: 'shipmentPdfSignatureReceiver',
  signatureDate:     'shipmentPdfSignatureDate',
});

// ---------------------------------------------------------------------------
// Helpers string of the commercial template
// ---------------------------------------------------------------------------

/**
 * The `helpers` string the commercial template is rendered with: the canonical jsreport
 * helper set (currency/number formatting with the instance separators baked in) plus the
 * date/conditional helpers. `rateDecimals` is the exchange-rate precision `formatNumber`
 * uses; a missing or negative value falls back to 4, as it always did.
 *
 * @param {number} [rateDecimals]
 * @param {{ thousandsSeparator?: string, decimalSeparator?: string }} [separators]
 * @returns {string}
 */
export function buildCommercialHelpers(rateDecimals, separators) {
  const d = (typeof rateDecimals === 'number' && rateDecimals >= 0) ? rateDecimals : 4;
  return buildJsreportHelpersString('', { minimumFractionDigits: d, maximumFractionDigits: d }, separators)
    + '\n\n' + COMMON_HANDLEBARS_HELPERS;
}

/**
 * Placeholders the PUBLISHED helpers string carries instead of the three values that are
 * only known at render time. The backend replaces each one before calling jsreport:
 *
 *   - `thousandsSeparator` / `decimalSeparator` appear as JSON string literals
 *     (`"@@SF_THOUSANDS_SEPARATOR@@"`, quotes included) — replace the quoted token with the
 *     JSON-quoted separator from the instance currency format (`/sws/neo/currency-format`);
 *   - `rateDecimals` appears as a bare token — replace it with the integer precision.
 *
 * `__tests__/printableSources.vitest.js` proves the substitution reproduces `buildCommercialHelpers` byte for
 * byte, so the server sends exactly what the browser sends.
 */
export const HELPER_PLACEHOLDERS = Object.freeze({
  thousandsSeparator: '@@SF_THOUSANDS_SEPARATOR@@',
  decimalSeparator: '@@SF_DECIMAL_SEPARATOR@@',
  rateDecimals: '@@SF_RATE_DECIMALS@@',
});

/** The commercial helpers string with the render-time values left as placeholders. */
export function buildCommercialHelpersTemplate() {
  return buildJsreportHelpersString('', {
    minimumFractionDigits: HELPER_PLACEHOLDERS.rateDecimals,
    maximumFractionDigits: HELPER_PLACEHOLDERS.rateDecimals,
  }, {
    thousandsSeparator: HELPER_PLACEHOLDERS.thousandsSeparator,
    decimalSeparator: HELPER_PLACEHOLDERS.decimalSeparator,
  }) + '\n\n' + COMMON_HANDLEBARS_HELPERS;
}

// ---------------------------------------------------------------------------
// Labels: which genericLabels key fills each {{labels.*}} of the template
// ---------------------------------------------------------------------------

/** The keys shared by every commercial document (formerly inlined in buildDocumentPdfLabels). */
export const COMMERCIAL_LABEL_KEYS = Object.freeze({
  taxId:           'invoicePdfTaxId',
  currency:        'invoicePdfCurrency',
  page:            'invoicePdfPage',
  customerSection: 'invoicePdfCustomerSection',
  customer:        'invoicePdfCustomer',
  address:         'invoicePdfAddress',
  paymentTerms:    'invoicePdfPaymentTerms',
  paymentMethod:   'invoicePdfPaymentMethod',
  colCode:         'invoicePdfColCode',
  colDescription:  'invoicePdfColDescription',
  colUnitPrice:    'invoicePdfColUnitPrice',
  colDiscount:     'invoicePdfColDiscount',
  colTax:          'invoicePdfColTax',
  colTotal:        'invoicePdfColTotal',
  subtotal:                'invoicePdfSubtotal',
  tax:                     'invoicePdfTax',
  grandTotal:              'invoicePdfGrandTotal',
  notes:                   'invoicePdfNotes',
  subtotalWithoutDiscount: 'subtotalWithoutDiscount',
  discountPerProduct:      'discountPerProduct',
  totalDiscount:           'totalDiscount',
});

/** Per-document overrides of the commercial labels (the old `buildXxxPdfLabels` bodies). */
export const INVOICE_PDF_LABEL_KEYS = Object.freeze({
  title:           i18nKey('invoicePdfTitle'),
  documentNo:      'invoicePdfDocumentNo',
  documentSection: 'invoicePdfInvoiceSection',
  date:            'invoicePdfDate',
  colQty:          'invoicePdfColQty',
});

export const SALES_ORDER_PDF_LABEL_KEYS = Object.freeze({
  title:           i18nKey('orderPdfTitle'),
  documentNo:      'orderPdfDocumentNo',
  documentSection: 'orderPdfSection',
  date:            'orderPdfDate',
  colQty:          'orderPdfColQty',
});

export const PURCHASE_ORDER_PDF_LABEL_KEYS = Object.freeze({
  title:           i18nKey('purchaseOrderPdfTitle'),
  documentNo:      'purchaseOrderPdfDocumentNo',
  documentSection: 'purchaseOrderPdfSection',
  date:            'orderPdfDate',
  colQty:          'orderPdfColQty',
  // ETP-5300 (Lea's QA comment) — shared DOCUMENT_TEMPLATE defaults to
  // "Cliente", but `customerName` here is the business partner on a PURCHASE
  // order, i.e. the vendor, not a customer.
  customerSection: 'purchaseOrderPdfCustomerSection',
  customer:        'purchaseOrderPdfCustomer',
});

export const QUOTATION_PDF_LABEL_KEYS = Object.freeze({
  title:           i18nKey('quotationPdfTitle'),
  documentNo:      'quotationPdfDocumentNo',
  documentSection: 'quotationPdfSection',
  date:            'quotationPdfDate',
  validUntil:      'quotationPdfValidUntil',
  colQty:          'quotationPdfColQty',
});

/**
 * Marks a value of a label key map as a `genericLabels` KEY, not display text. Identity at runtime.
 *
 * The `title` entries need it: the sfqg i18n check reports any `title: '<string literal>'` property
 * as a hardcoded title, and here that string is the key the title is translated from
 * (`resolveLabelKeys` turns it into text through `ui()`). Hoisted, so the maps above can use it.
 *
 * @param {string} key a `genericLabels` key
 * @returns {string} the same key
 */
function i18nKey(key) {
  return key;
}

/**
 * Resolves a `{ label: genericLabelsKey }` map through a translator.
 *
 * @param {(key: string) => string} ui  `useUI()`'s result, or any `key → text` function
 * @param {Record<string, string>} keys
 * @returns {Record<string, string>}
 */
export function resolveLabelKeys(ui, keys) {
  const out = {};
  for (const [name, key] of Object.entries(keys)) out[name] = ui(key);
  return out;
}

// ---------------------------------------------------------------------------
// The published manifests
// ---------------------------------------------------------------------------

/** Bumped when the manifest SHAPE changes; the backend refuses a version it does not know. */
export const PRINTABLE_MANIFEST_VERSION = 1;

/**
 * Every document the backend may render, keyed by the document key a backend entity
 * declares (`MCP_CONFIG.pdf.print.document`). The key is the window's spec name, the same
 * key `documentPdfRegistry.js` uses.
 *
 * Two families: `commercial` (DOCUMENT_TEMPLATE, helpers with render-time placeholders) and
 * `movement` (its own template per document, the fixed return-doc helpers — no placeholder to
 * fill, so the backend's substitution is a no-op for them).
 */
export const PRINTABLE_DOCUMENTS = Object.freeze({
  'sales-invoice':   { family: 'commercial', labelKeys: { ...COMMERCIAL_LABEL_KEYS, ...INVOICE_PDF_LABEL_KEYS } },
  'sales-order':     { family: 'commercial', labelKeys: { ...COMMERCIAL_LABEL_KEYS, ...SALES_ORDER_PDF_LABEL_KEYS } },
  'purchase-order':  { family: 'commercial', labelKeys: { ...COMMERCIAL_LABEL_KEYS, ...PURCHASE_ORDER_PDF_LABEL_KEYS } },
  'sales-quotation': { family: 'commercial', labelKeys: { ...COMMERCIAL_LABEL_KEYS, ...QUOTATION_PDF_LABEL_KEYS } },
  'goods-shipment':            { family: 'movement', body: SHIPMENT_TEMPLATE_BODY, labelKeys: SHIPMENT_PDF_LABEL_KEYS },
  'return-to-vendor-shipment': { family: 'movement', body: RETURN_TO_VENDOR_TEMPLATE_BODY, labelKeys: RETURN_TO_VENDOR_PDF_LABEL_KEYS },
  'return-material-receipt':   { family: 'movement', body: RETURN_RECEIPT_TEMPLATE_BODY, labelKeys: RETURN_RECEIPT_PDF_LABEL_KEYS },
});

/** `resolveUI` of app-shell-core, inlined: this module must not import the core package. */
function lookup(dictionary, key) {
  return dictionary?.genericLabels?.[key] ?? key;
}

/**
 * The manifest the build publishes for one document — exactly what the browser sends to
 * jsreport, minus the record data.
 *
 * @param {string} document  a key of PRINTABLE_DOCUMENTS
 * @param {Record<string, object>} dictionaries  locale code (`es_ES`) → that locale's core
 *        dictionary (`src/locales/generated/core.<locale>.json`, the one `useUI` reads)
 * @param {{ builtAt?: number }} [meta]
 * @returns {object}
 */
export function buildPrintableManifest(document, dictionaries, meta = {}) {
  const def = PRINTABLE_DOCUMENTS[document];
  if (!def) throw new Error(`Unknown printable document "${document}"`);
  const labels = {};
  for (const [locale, dictionary] of Object.entries(dictionaries || {})) {
    labels[locale] = resolveLabelKeys((key) => lookup(dictionary, key), def.labelKeys);
  }
  return {
    manifestVersion: PRINTABLE_MANIFEST_VERSION,
    document,
    family: def.family,
    builtAt: meta.builtAt ?? null,
    template: {
      content: def.family === 'movement' ? movementTemplate(def.body) : DOCUMENT_TEMPLATE,
      engine: 'handlebars',
      recipe: 'chrome-pdf',
      chrome: { ...JSREPORT_CHROME_A4 },
    },
    css: def.family === 'movement' ? COMMON_PDF_CSS : DOCUMENT_CSS,
    helpers: def.family === 'movement' ? RETURN_DOC_HELPERS : buildCommercialHelpersTemplate(),
    helperPlaceholders: { ...HELPER_PLACEHOLDERS },
    labels,
  };
}
