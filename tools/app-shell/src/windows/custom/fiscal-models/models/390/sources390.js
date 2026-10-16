// Modelo 390 — the "Facturas" tab (ETP-5716): filter state, request parameters and the CSV
// export of `GET /fiscal390/sources`. Plain functions (no React) so the filters, the
// "Ver facturas" navigation and the CSV are testable on their own.
//
// Contract: {etendo_root}/modules/com.etendoerp.go/docs/aeat-390-endpoints.md, "GET
// /fiscal390/sources". Every row lists the boxes it feeds and, per box, the amount it
// contributes (`boxAmounts`): for each box, the sum over its rows equals the box value.
import { csvField } from '@etendosoftware/app-shell-core/lib/csv/csvSerializer.js';

/** Rows per page of the tab. */
export const SOURCES_PAGE_SIZE = 25;

/** Machine values of the "Tipo" filter / the row `type`. */
export const SOURCE_TYPES = ['sales', 'purchase'];

/** The tab with no filter. */
export function emptySourcesFilter() {
  return { box: null, type: '', tax: '', q: '' };
}

/**
 * The tab filtered by one box — what "Ver facturas" opens, from the Casillas tab or (later) from
 * an incident. `box` is an AEAT box number (`5`, `"05"`, `"[05]"`).
 */
export function sourcesFilterForBox(box) {
  const n = Number(String(box ?? '').replace(/[[\]\s]/g, ''));
  return { ...emptySourcesFilter(), box: Number.isInteger(n) && n > 0 ? n : null };
}

/** True when any filter is set. */
export function hasSourcesFilter(filter) {
  return Boolean(filter && (filter.box != null || filter.type || filter.tax || String(filter.q ?? '').trim()));
}

/**
 * The query parameters of the filter (`box`, `type`, `tax`, `q`), plus the page. `pageSize: 0`
 * asks for every filtered row (the CSV export).
 */
export function sourcesQueryParams(filter, { page = 1, pageSize = SOURCES_PAGE_SIZE } = {}) {
  const params = {};
  if (filter?.box != null) params.box = String(filter.box);
  if (filter?.type) params.type = filter.type;
  if (filter?.tax) params.tax = filter.tax;
  const q = String(filter?.q ?? '').trim();
  if (q) params.q = q;
  params.page = String(page);
  params.pageSize = String(pageSize);
  return params;
}

/** Number of pages for `count` rows. */
export function pageCount(count, pageSize = SOURCES_PAGE_SIZE) {
  return Math.max(1, Math.ceil((Number(count) || 0) / pageSize));
}

/** "05" for 5 — how the screen and the AEAT form print box numbers. */
export function boxLabel(box) {
  return String(box).padStart(2, '0');
}

/** The boxes of the payload (`{ "<box>": "<amount>" }`) as `[{ box, amount }]`, ascending. */
export function sourceBoxes(boxes) {
  return Object.entries(boxes ?? {})
    .map(([box, amount]) => ({ box: Number(box), amount }))
    .filter(e => Number.isInteger(e.box))
    .sort((a, b) => a.box - b.box);
}

/** The amount a row contributes to `box` (its `boxAmounts`), or `null`. */
export function rowBoxAmount(row, box) {
  if (box == null) return null;
  const v = row?.boxAmounts?.[String(box)];
  return v ?? null;
}

/** The translated "Tipo" of a row. */
export function sourceTypeLabel(type, t) {
  if (type === 'sales') return t('fm.m390.sources.type.sales');
  if (type === 'purchase') return t('fm.m390.sources.type.purchase');
  return type ?? '';
}

/**
 * The CSV of the filtered rows. Every header and cell goes through `csvField` (formula
 * neutralization + RFC 4180 quoting — CLAUDE.md, CSV policy); amounts are the backend's plain
 * 2-decimal strings and dates ISO `yyyy-MM-dd`, so a spreadsheet reads them as numbers/dates
 * (a negative amount is neutralized like any other `-` value, as the policy requires). With a
 * box filter a last column carries each row's contribution to that box, which adds up to it.
 * Starts with a UTF-8 BOM so Excel opens accents correctly.
 */
export function buildSources390Csv(rows, t, { box = null } = {}) {
  const header = [
    t('fm.sources.col.date'), t('fm.sources.col.accountingDate'), t('fm.sources.col.ref'),
    t('fm.sources.col.type'), t('fm.sources.col.party'), t('fm.m390.sources.col.tax'),
    t('fm.m390.sources.col.rate'), t('fm.sources.col.base'), t('fm.sources.col.vat'),
    t('fm.sources.col.total'), t('fm.sources.col.boxes'),
  ];
  if (box != null) header.push(t('fm.m390.sources.col.box_amount', { box: boxLabel(box) }));
  const lines = [header.map(csvField).join(',')];
  for (const r of rows ?? []) {
    const cells = [
      r.date ?? '', r.accountingDate ?? '', r.ref ?? '', sourceTypeLabel(r.type, t), r.party ?? '',
      r.tax ?? '', r.rate ?? '', r.base ?? '', r.vat ?? '', r.total ?? '',
      String(r.boxes ?? '').split(',').filter(Boolean).map(boxLabel).join(' '),
    ];
    if (box != null) cells.push(rowBoxAmount(r, box) ?? '');
    lines.push(cells.map(csvField).join(','));
  }
  return `﻿${lines.join('\r\n')}\r\n`;
}

/** Download name of the CSV: `facturas_390_<year>[_casilla_<box>].csv`. */
export function sourcesCsvFileName(year, box = null) {
  return `facturas_390_${year}${box != null ? `_casilla_${boxLabel(box)}` : ''}.csv`;
}
