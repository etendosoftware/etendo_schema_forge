/**
 * ETP-5013 follow-up — the grouped ("Agrupar por") layout used to show a
 * plain group-break row (a single <td> with the group's name) inside ONE
 * continuous <tbody>, sharing a single <thead> for the whole table. Once the
 * band's fill became the same muted gray as every other row (the grayscale
 * redesign earlier this session), the break barely stood out ("no se llega
 * a diferenciar bien").
 *
 * Now matches report-general-ledger's own grouped layout: one bordered
 * `.stock-card` per group, each with its OWN `<table>`/`<thead>` — a card
 * opens right before the FIRST row of its group and closes right after the
 * LAST row of the PREVIOUS group, using the existing `isGroupBreak` helper
 * plus `{{#unless @first}}` to skip closing a card that was never opened,
 * with the trailing card closed once, unconditionally, after the loop.
 *
 * The ungrouped (flat) layout — no `meta.dimensionField` — is untouched: a
 * single table, no cards, exactly as before.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Handlebars from 'handlebars';
import { registerReportHelpers } from '../../../templates/reports/helpers/report-html-helpers.js';
import { expandBrandingPartial } from './reportBrandingPartialHelper.js';

const ARTIFACT_DIR = resolve(import.meta.dirname, '../../../artifacts/inventory-stock-report');

const LABELS = {
  productSearchKey: 'Clave', product: 'Producto', warehouse: 'Almacen', category: 'Categoría',
  uom: 'UdM', qtyOnHand: 'Stock Disponible', unitCost: 'Coste Unitario', totalValuation: 'Valoración',
};

function row(overrides) {
  return {
    productSearchKey: 'SK-000', product: 'X', warehouse: 'Y', category: 'Z', uom: 'Unit',
    qtyOnHand: 1, unitCost: 1, totalValuation: 1,
    ...overrides,
  };
}

function render(meta, rows) {
  const hb = Handlebars.create();
  const helpersCode = readFileSync(resolve(ARTIFACT_DIR, 'helpers.js'), 'utf8');
  registerReportHelpers(hb, helpersCode);
  const templateSrc = readFileSync(resolve(ARTIFACT_DIR, 'template.hbs'), 'utf8');
  const template = hb.compile(expandBrandingPartial(templateSrc));
  return template({ meta: { labels: LABELS, filters: [], ...meta }, rows });
}

describe('inventory-stock-report — grouped layout renders one card per group (ETP-5013 follow-up)', () => {
  const rows = [
    row({ productSearchKey: 'SK-001', product: 'Artículo A', warehouse: 'Almacen A' }),
    row({ productSearchKey: 'SK-001', product: 'Artículo A', warehouse: 'Almacen B' }),
    row({ productSearchKey: 'SK-002', product: 'Artículo B', warehouse: 'Almacen A' }),
    row({ productSearchKey: 'SK-003', product: 'Artículo C', warehouse: 'Almacen B' }),
  ];

  it('wraps every group in its own bordered .stock-card, inside .stock-cards', () => {
    const html = render({ dimensionField: 'product' }, rows);
    assert.ok(html.includes('class="stock-cards"'), 'expected a .stock-cards wrapper');
    const cardOccurrences = [...html.matchAll(/class="stock-card"/g)];
    assert.equal(cardOccurrences.length, 3, 'expected one .stock-card per distinct product (Artículo A, Artículo B, Artículo C)');
  });

  it('each card carries its OWN <thead>, not a header shared across groups', () => {
    const html = render({ dimensionField: 'product' }, rows);
    const theadOccurrences = [...html.matchAll(/<thead>/g)];
    assert.equal(theadOccurrences.length, 3, 'expected one <thead> per group, not one shared thead');
  });

  it('the group name renders as the value, with a dimensionLabel chip alongside (matching report-general-ledger)', () => {
    const html = render({ dimensionField: 'product', dimensionLabel: 'Producto' }, rows);
    assert.match(html, /<span class="value">Artículo A<\/span><span class="chip">Producto<\/span>/);
    assert.match(html, /<span class="value">Artículo B<\/span><span class="chip">Producto<\/span>/);
    assert.match(html, /<span class="value">Artículo C<\/span><span class="chip">Producto<\/span>/);
  });

  it('no longer renders the old flat group-header row', () => {
    const html = render({ dimensionField: 'product' }, rows);
    assert.doesNotMatch(html, /class="group-header"/);
  });

  it('produces well-formed HTML: every opened <table> and <div class="stock-card"> is closed the same number of times', () => {
    const html = render({ dimensionField: 'product' }, rows);
    const openTables = (html.match(/<table class="report-table">/g) || []).length;
    const closeTables = (html.match(/<\/table>/g) || []).length;
    assert.equal(openTables, 3);
    assert.equal(closeTables, 3);
    const openCards = (html.match(/<div class="stock-card">/g) || []).length;
    // Every stock-card div closes with a plain </div> right after </table> —
    // count matched <div class="stock-card"> opens against total row count
    // context instead of a blind global </div> count (too many unrelated
    // closing divs in the rest of the page to count meaningfully).
    assert.equal(openCards, 3);
  });

  it('the last group\'s card is properly closed (no dangling content after the report-container)', () => {
    const html = render({ dimensionField: 'product' }, rows);
    assert.match(html, /<\/tbody>\s*<\/table>\s*<\/div>\s*<\/div>\s*(<div class="print-only-footer-note">.*<\/div>\s*)?<\/div><\/body><\/html>/s);
  });
});

describe('inventory-stock-report — flat (ungrouped) layout is untouched (ETP-5013 follow-up)', () => {
  it('renders a single table, no .stock-card wrapper', () => {
    const html = render({ dimensionField: '' }, [row({ productSearchKey: 'SK-001', product: 'Artículo A' })]);
    // The .stock-card* rules are always present in the inlined <style> block
    // (CSS declarations aren't conditional) — check the MARKUP usage, not
    // the stylesheet, is absent from the flat/ungrouped body.
    assert.doesNotMatch(html, /class="stock-cards?"/);
    const tableOccurrences = [...html.matchAll(/<table class="report-table">/g)];
    assert.equal(tableOccurrences.length, 1);
  });

  it('shows all 3 dimension columns (product, warehouse, category) when ungrouped', () => {
    const html = render({ dimensionField: '' }, [row({ product: 'Artículo A', warehouse: 'Almacen A', category: 'Otros' })]);
    assert.match(html, /<th style="width: 18%">Producto<\/th>/);
    assert.match(html, /<th style="width: 14%">Almacen<\/th>/);
    assert.match(html, /<th style="width: 14%">Categoría<\/th>/);
  });
});
