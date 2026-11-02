// @covers artifacts/inventory-stock-report/helpers.js
// @covers artifacts/inventory-stock-report/template-csv.hbs
// @covers artifacts/inventory-stock-report/template-excel.hbs
// @covers artifacts/inventory-stock-report/template.hbs
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
  // The browser preview registers ONLY the canonical helper set (helpers.js is read
  // for number-format options, never executed), so template.hbs must render with
  // nothing else. Registering a per-report helper here would mask a "Missing helper".
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

  it('the group name renders as the value, with a dimensionLabel chip appearing FIRST (matching report-general-ledger, ETP-5128)', () => {
    const html = render({ dimensionField: 'product', dimensionLabel: 'Producto' }, rows);
    // Order is chip-then-value since ETP-5013 (template.hbs line 57); the names are
    // neutral because ETP-5079 deleted the demo products this used to name.
    assert.match(html, /<span class="chip">Producto<\/span><span class="value">Artículo A<\/span>/);
    assert.match(html, /<span class="chip">Producto<\/span><span class="value">Artículo B<\/span>/);
    assert.match(html, /<span class="chip">Producto<\/span><span class="value">Artículo C<\/span>/);
  });

  it('no longer renders the old flat group-header row', () => {
    const html = render({ dimensionField: 'product' }, rows);
    assert.doesNotMatch(html, /class="group-header"/);
  });

  it('produces well-formed HTML: every opened <table> and <div class="stock-card"> is closed the same number of times', () => {
    const html = render({ dimensionField: 'product' }, rows);
    const openTables = (html.match(/<table class="report-table"[^>]*>/g) || []).length;
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
    const tableOccurrences = [...html.matchAll(/<table class="report-table"[^>]*>/g)];
    assert.equal(tableOccurrences.length, 1);
  });

  it('shows all 3 dimension columns (product, warehouse, category) when ungrouped', () => {
    const html = render({ dimensionField: '' }, [row({ product: 'Artículo A', warehouse: 'Almacen A', category: 'Otros' })]);
    assert.match(html, /<th style="width: 18%">Producto<\/th>/);
    assert.match(html, /<th style="width: 14%">Almacen<\/th>/);
    assert.match(html, /<th style="width: 14%">Categoría<\/th>/);
  });
});

// ---------------------------------------------------------------------------
// A product with no cost reaches the report as unitCost/totalValuation = null.
// It must render the "\u2014" placeholder (same as Warehouse > Products) in every
// output — never 0, never an empty cell, never the literal NaN html-to-xlsx writes
// for a data-cell-type="number" cell holding no number.
// ---------------------------------------------------------------------------
function loadHelperFns() {
  const code = readFileSync(resolve(ARTIFACT_DIR, 'helpers.js'), 'utf8');
  return new Function(`${code}; return { round2, numCellType, dashIfBlank };`)();
}

function renderTemplate(file, rows) {
  const hb = Handlebars.create();
  registerReportHelpers(hb, readFileSync(resolve(ARTIFACT_DIR, 'helpers.js'), 'utf8'));
  // Report-specific helpers (loaded by jsreport from helpers.js) registered explicitly.
  const { round2, numCellType, dashIfBlank } = loadHelperFns();
  hb.registerHelper('round2', round2);
  hb.registerHelper('dashIfBlank', dashIfBlank);
  hb.registerHelper('numCellType', numCellType);
  const tpl = hb.compile(readFileSync(resolve(ARTIFACT_DIR, file), 'utf8'));
  return tpl({ meta: { labels: LABELS }, rows });
}

const COST_ROWS = [
  row({ productSearchKey: 'P1', product: 'With cost', qtyOnHand: 10, unitCost: 9.56, totalValuation: 95.6 }),
  row({ productSearchKey: 'P2', product: 'No cost', qtyOnHand: 5, unitCost: null, totalValuation: null }),
  row({ productSearchKey: 'P3', product: 'Zero cost', qtyOnHand: 3, unitCost: 0, totalValuation: 0 }),
];

describe('inventory-stock-report helpers — round2 / numCellType with missing cost', () => {
  const { round2, numCellType } = loadHelperFns();

  it('round2 returns an empty string for null, undefined and empty string', () => {
    assert.equal(round2(null), '');
    assert.equal(round2(undefined), '');
    assert.equal(round2(''), '');
  });

  it('round2 keeps a real zero as 0 and rounds numbers to 2 decimals', () => {
    assert.equal(round2(0), 0);
    assert.equal(round2(9.56), 9.56);
    assert.equal(round2(12.345), Math.round(12.345 * 100) / 100);
    assert.equal(round2(1.2), 1.2);
  });

  it('round2 returns 0 for a non-numeric string', () => {
    assert.equal(round2('abc'), 0);
  });

  it('numCellType is string for null, undefined and empty string', () => {
    assert.equal(numCellType(null), 'string');
    assert.equal(numCellType(undefined), 'string');
    assert.equal(numCellType(''), 'string');
  });

  it('numCellType is number for a value, including a real zero', () => {
    assert.equal(numCellType(0), 'number');
    assert.equal(numCellType(9.56), 'number');
    assert.equal(numCellType('abc'), 'number');
  });
});

describe('inventory-stock-report helpers — dashIfBlank', () => {
  const { dashIfBlank } = loadHelperFns();

  it('returns the em dash for null, undefined and empty string', () => {
    assert.equal(dashIfBlank(null, ''), '\u2014');
    assert.equal(dashIfBlank(undefined, ''), '\u2014');
    assert.equal(dashIfBlank('', ''), '\u2014');
  });

  it('returns the shown value unchanged for a real value and for a real zero', () => {
    assert.equal(dashIfBlank(9.56, '9,56 EUR'), '9,56 EUR');
    assert.equal(dashIfBlank(0, '0,00 EUR'), '0,00 EUR');
    assert.equal(dashIfBlank(0, 0), 0);
  });
});

describe('inventory-stock-report — template.hbs (HTML/PDF) with a product that has no cost', () => {
  for (const [label, meta] of [['grouped cards', { dimensionField: 'product' }], ['ungrouped table', { dimensionField: '' }]]) {
    describe(label, () => {
      const html = render(meta, COST_ROWS);
      // Rows are located by search key: the product column is hidden when grouped by product.
      const amountCells = (key) => {
        const tr = html.split('<tr').find((r) => r.includes(`>${key}<`));
        return [...tr.matchAll(/<td class="cell-amount">([^<]*)<\/td>/g)].map((m) => m[1].trim()).slice(-2);
      };

      it('null cost and valuation render the em dash, not an empty cell', () => {
        assert.deepEqual(amountCells('P2'), ['\u2014', '\u2014']);
      });

      it('a real cost renders the formatCurrency output (no dash)', () => {
        const cells = amountCells('P1');
        for (const c of cells) {
          assert.notEqual(c, '');
          assert.notEqual(c, '\u2014');
        }
        assert.match(cells[0], /9[.,]56/);
        assert.match(cells[1], /95[.,]6/);
      });

      it('a zero cost renders the formatted zero, not the dash', () => {
        const cells = amountCells('P3');
        for (const c of cells) {
          assert.notEqual(c, '\u2014');
          assert.match(c, /0/);
        }
      });
    });
  }
});

describe('inventory-stock-report — template-csv.hbs with a product that has no cost', () => {
  const lines = renderTemplate('template-csv.hbs', COST_ROWS).split('\n');

  it('a row with cost keeps both amounts', () => {
    assert.ok(lines.find((l) => l.includes('With cost')).endsWith(',10,9.56,95.6'));
  });

  it('a null-cost row ends with an em dash in both amount columns (no empty trailing fields)', () => {
    const l = lines.find((x) => x.includes('No cost'));
    assert.ok(l.endsWith(',5,\u2014,\u2014'), l);
    assert.equal(l.split(',').length, 8);
  });

  it('stays one line per row (header + 3 rows)', () => {
    assert.equal(lines.filter((x) => x.trim() !== '').length, 4);
  });

  it('a real zero cost renders 0, not blank', () => {
    const l = lines.find((x) => x.includes('Zero cost'));
    assert.ok(l.endsWith(',3,0,0'), l);
  });
});

describe('inventory-stock-report — template-excel.hbs with a product that has no cost', () => {
  const html = renderTemplate('template-excel.hbs', COST_ROWS);
  const rowHtml = (name) => html.split('<tr>').find((r) => r.includes(name));

  it('never emits NaN anywhere', () => {
    assert.doesNotMatch(html, /NaN/);
  });

  it('null-cost cells are string-typed cells holding the em dash', () => {
    const cells = [...rowHtml('No cost').matchAll(/<td data-cell-type="(\w+)">([^<]*)<\/td>/g)];
    const [unit, total] = cells.slice(-2);
    assert.deepEqual([unit[1], unit[2]], ['string', '\u2014']);
    assert.deepEqual([total[1], total[2]], ['string', '\u2014']);
  });

  it('zero-cost cells are number-typed with 0', () => {
    const cells = [...rowHtml('Zero cost').matchAll(/<td data-cell-type="(\w+)">([^<]*)<\/td>/g)];
    const [unit, total] = cells.slice(-2);
    assert.deepEqual([unit[1], unit[2]], ['number', '0']);
    assert.deepEqual([total[1], total[2]], ['number', '0']);
  });

  it('cells with a cost are number-typed with the rounded amount', () => {
    const cells = [...rowHtml('With cost').matchAll(/<td data-cell-type="(\w+)">([^<]*)<\/td>/g)];
    const [unit, total] = cells.slice(-2);
    assert.deepEqual([unit[1], unit[2]], ['number', '9.56']);
    assert.deepEqual([total[1], total[2]], ['number', '95.6']);
  });
});

describe('inventory-stock-report — template.hbs uses only canonical helpers (browser preview)', () => {
  const helpersSrc = readFileSync(resolve(ARTIFACT_DIR, 'helpers.js'), 'utf8');
  const templateSrc = readFileSync(resolve(ARTIFACT_DIR, 'template.hbs'), 'utf8');
  const reportHelperNames = [...helpersSrc.matchAll(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);

  it('helpers.js declares the per-report helpers this guard checks', () => {
    for (const n of ['round2', 'numCellType', 'dashIfBlank']) assert.ok(reportHelperNames.includes(n), n);
  });

  it('template.hbs does not call any helper defined in the report helpers.js', () => {
    for (const name of reportHelperNames) {
      const call = new RegExp(`(\\{\\{[#~/^]?\\s*|\\()${name.replace(/\$/g, '\\$')}(?=[\\s})])`);
      assert.doesNotMatch(
        templateSrc,
        call,
        `template.hbs uses "${name}" from helpers.js, but the browser preview registers only the canonical helpers `
          + '(registerReportHelpers) and never loads a report\'s helpers.js — jsreport does that only for the Excel/CSV templates. '
          + 'Use canonical helpers in template.hbs.',
      );
    }
  });
});
