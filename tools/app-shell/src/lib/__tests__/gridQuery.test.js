/**
 * gridQuery.test.js — node:test coverage for the display/filter/sort utilities.
 *
 * gridQuery.js is a pure-function module (no React, no DOM, no network), so the
 * node test runner can exercise the whole public surface directly.
 *
 * Emphasis is on the *round trips* a real user performs — type text into a
 * column filter (parseUserFilter) and have it become a backend criteria array
 * (buildBackendFilter) — plus the advanced-filter builder path
 * (buildAdvancedFilterCriteria), which is where the operator/mode matrix lives.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getDisplayText,
  parseUserFilter,
  resolveBackendSort,
  buildBackendFilter,
  resolveFilterMode,
  buildAdvancedFilterCriteria,
  getFilteredKey,
} from '../gridQuery.js';

// ---------------------------------------------------------------------------
// getDisplayText
// ---------------------------------------------------------------------------

describe('getDisplayText', () => {
  it('prefers the $_identifier sibling field for selector columns', () => {
    // The grid shows the BP display name, never the UUID stored in the raw key.
    const row = { businessPartner: 'A1B2C3', businessPartner$_identifier: 'Juan Perez' };
    assert.equal(getDisplayText(row, { key: 'businessPartner', type: 'selector' }), 'Juan Perez');
  });

  it('falls back to the nested object name when no $_identifier is present', () => {
    // Some NEO payloads embed the referenced entity instead of flattening it.
    const row = { businessPartner: { id: 'A1', name: 'Acme SA' } };
    assert.equal(getDisplayText(row, { key: 'businessPartner', type: 'selector' }), 'Acme SA');
  });

  it('falls back to the raw value when a selector object carries no name', () => {
    // Guards the `return null` tail of trySelectorText: without a name there is
    // nothing display-worthy, so the generic String(raw) path must take over.
    const row = { businessPartner: { id: 'A1' } };
    assert.equal(getDisplayText(row, { key: 'businessPartner', type: 'selector' }), '[object Object]');
  });

  it('uses filterMode=identifier as an alias for the selector display rule', () => {
    // Columns can opt into identifier semantics without declaring type=selector.
    const row = { owner: 'ID9', owner$_identifier: 'Warehouse 1' };
    assert.equal(getDisplayText(row, { key: 'owner', filterMode: 'identifier' }), 'Warehouse 1');
  });

  it('maps a raw enum code through enumLabels', () => {
    const col = { key: 'docStatus', type: 'status', enumLabels: { DR: 'Borrador', CO: 'Completado' } };
    assert.equal(getDisplayText({ docStatus: 'CO' }, col), 'Completado');
  });

  it('shows the raw code when enumLabels has no entry for it', () => {
    // An unmapped status must stay visible (debuggable) rather than blank out.
    const col = { key: 'docStatus', type: 'status', enumLabels: { DR: 'Borrador' } };
    assert.equal(getDisplayText({ docStatus: 'XX' }, col), 'XX');
  });

  it('ignores enum mapping when the column declares no enumLabels', () => {
    assert.equal(getDisplayText({ docStatus: 'CO' }, { key: 'docStatus', type: 'status' }), 'CO');
  });

  it('maps NEO Y/N and JS booleans through badgeLabels', () => {
    // NEO returns 'Y'/'N' chars for AD button/boolean columns; both plus a real
    // JS boolean must land on the same badge.
    const col = { key: 'posted', type: 'boolean', badgeLabels: { true: 'Contabilizado', false: 'Pendiente' } };
    assert.equal(getDisplayText({ posted: 'Y' }, col), 'Contabilizado');
    assert.equal(getDisplayText({ posted: true }, col), 'Contabilizado');
    assert.equal(getDisplayText({ posted: 'true' }, col), 'Contabilizado');
    assert.equal(getDisplayText({ posted: 'N' }, col), 'Pendiente');
    assert.equal(getDisplayText({ posted: false }, col), 'Pendiente');
  });

  it('picks es_ES first from a per-locale badgeLabels object', () => {
    // badgeLabels may arrive as { es_ES, en_US }; the cell must render a string,
    // never "[object Object]".
    const col = {
      key: 'active', type: 'boolean',
      badgeLabels: { true: { es_ES: 'Activo', en_US: 'Active' }, false: { es_ES: 'Inactivo' } },
    };
    assert.equal(getDisplayText({ active: true }, col), 'Activo');
    assert.equal(getDisplayText({ active: false }, col), 'Inactivo');
  });

  it('falls back to en_US, then to any locale value, then to empty string', () => {
    const enOnly = { key: 'f', type: 'boolean', badgeLabels: { true: { en_US: 'Yes' } } };
    assert.equal(getDisplayText({ f: true }, enOnly), 'Yes');

    const otherLocale = { key: 'f', type: 'boolean', badgeLabels: { true: { fr_FR: 'Oui' } } };
    assert.equal(getDisplayText({ f: true }, otherLocale), 'Oui');

    const emptyObj = { key: 'f', type: 'boolean', badgeLabels: { true: {} } };
    assert.equal(getDisplayText({ f: true }, emptyObj), '');
  });

  it('falls through to the raw value when the matching badge label is absent', () => {
    // badgeLabels.false missing → tryBooleanText returns null → String(raw).
    const col = { key: 'posted', type: 'boolean', badgeLabels: { true: 'Si' } };
    assert.equal(getDisplayText({ posted: 'N' }, col), 'N');
  });

  it('returns empty string for a missing row, a missing col.key, or a nullish value', () => {
    assert.equal(getDisplayText(null, { key: 'x' }), '');
    assert.equal(getDisplayText({ x: 1 }, null), '');
    assert.equal(getDisplayText({ x: 1 }, {}), '');
    assert.equal(getDisplayText({ x: null }, { key: 'x' }), '');
    assert.equal(getDisplayText({}, { key: 'x' }), '');
  });

  it('coerces non-string scalars to their string form', () => {
    assert.equal(getDisplayText({ n: 1234.5 }, { key: 'n', type: 'amount' }), '1234.5');
    assert.equal(getDisplayText({ n: 0 }, { key: 'n', type: 'number' }), '0');
  });
});

// ---------------------------------------------------------------------------
// resolveFilterMode / inferFilterMode  (the function ETP-4681 changed)
// ---------------------------------------------------------------------------

describe('resolveFilterMode', () => {
  it('returns text for a nullish column', () => {
    assert.equal(resolveFilterMode(null), 'text');
    assert.equal(resolveFilterMode(undefined), 'text');
  });

  it('lets an explicit filterMode win over every inference step', () => {
    // ETP-4681: a `custom` cell hides its real data type, so declaring
    // filterMode explicitly is the only way to get numeric/date operators.
    assert.equal(resolveFilterMode({ key: 'a', type: 'custom', filterMode: 'numeric' }), 'numeric');
    assert.equal(resolveFilterMode({ key: 'a', type: 'custom', filterMode: 'date' }), 'date');
    // Even against a type that would otherwise infer something else, and
    // against the _ID foreign-key heuristic.
    assert.equal(resolveFilterMode({ key: 'a', type: 'date', filterMode: 'text' }), 'text');
    assert.equal(resolveFilterMode({ key: 'a', column: 'C_BPartner_ID', filterMode: 'text' }), 'text');
  });

  it('infers a mode from every recognized column type', () => {
    const expected = {
      date: 'date',
      selector: 'identifier',
      status: 'enumLabel',
      enum: 'enumLabel',
      boolean: 'booleanLabel',
      number: 'numeric',
      amount: 'numeric',
      percent: 'numeric',
      signedDelta: 'numeric',
    };
    for (const [type, mode] of Object.entries(expected)) {
      assert.equal(resolveFilterMode({ key: 'a', type }), mode, `type=${type}`);
    }
  });

  it('applies the _ID foreign-key heuristic to unrecognized types', () => {
    // A `custom` cell over C_BPartner_ID must filter the display label, not the
    // UUID — so "jua" matches "Juan Perez".
    assert.equal(resolveFilterMode({ key: 'bp', type: 'custom', column: 'C_BPartner_ID' }), 'identifier');
    // Case-insensitive, and applies with no type at all.
    assert.equal(resolveFilterMode({ key: 'bp', column: 'c_bpartner_id' }), 'identifier');
  });

  it('falls back to text when nothing identifies the column', () => {
    // This is inferFilterMode's `default` arm — the single new uncovered line on
    // the ETP-4681 branch. Reached by an unrecognized type, by a plain column
    // name, and by no type at all.
    assert.equal(resolveFilterMode({ key: 'a', type: 'custom' }), 'text');
    assert.equal(resolveFilterMode({ key: 'a', type: 'custom', column: 'Description' }), 'text');
    assert.equal(resolveFilterMode({ key: 'a', type: 'string' }), 'text');
    assert.equal(resolveFilterMode({ key: 'a' }), 'text');
    // A non-string `column` must not blow up the regex test.
    assert.equal(resolveFilterMode({ key: 'a', column: 42 }), 'text');
  });
});

// ---------------------------------------------------------------------------
// parseUserFilter
// ---------------------------------------------------------------------------

describe('parseUserFilter', () => {
  it('returns null for empty, blank or null input', () => {
    const col = { key: 'x' };
    assert.equal(parseUserFilter(col, ''), null);
    assert.equal(parseUserFilter(col, '   '), null);
    assert.equal(parseUserFilter(col, '\t\n'), null);
    assert.equal(parseUserFilter(col, null), null);
  });

  it('trims the value but keeps the untrimmed input as originalValue', () => {
    // originalValue is what gets echoed back into the filter input, so it must
    // survive verbatim while the query uses the trimmed form.
    const parsed = parseUserFilter({ key: 'name', type: 'string' }, '  acme  ');
    assert.deepEqual(parsed, { mode: 'text', value: 'acme', originalValue: '  acme  ' });
  });

  describe('date mode', () => {
    const col = { key: 'orderDate', type: 'date' };

    it('accepts every supported locale separator as dd/mm/yyyy', () => {
      for (const input of ['14/04/2026', '14-04-2026', '14.04.2026']) {
        assert.deepEqual(
          parseUserFilter(col, input),
          { mode: 'date', op: '=', value: '2026-04-14', originalValue: input },
          input,
        );
      }
    });

    it('accepts ISO yyyy-mm-dd and truncates an ISO datetime', () => {
      assert.equal(parseUserFilter(col, '2026-04-14').value, '2026-04-14');
      assert.equal(parseUserFilter(col, '2026-04-14T18:30:00Z').value, '2026-04-14');
    });

    it('accepts yyyy/mm/dd and yyyy.mm.dd (year-first, zero-pads parts)', () => {
      assert.equal(parseUserFilter(col, '2026/4/9').value, '2026-04-09');
      assert.equal(parseUserFilter(col, '2026.4.9').value, '2026-04-09');
    });

    it('zero-pads single-digit day/month in the dd/mm/yyyy form', () => {
      assert.equal(parseUserFilter(col, '9/4/2026').value, '2026-04-09');
    });

    it('parses a ".." range, including dot-separated dates on both sides', () => {
      assert.deepEqual(parseUserFilter(col, '01/04/2026..15/04/2026').value, ['2026-04-01', '2026-04-15']);
      assert.deepEqual(parseUserFilter(col, '14.04.2026..15.04.2026').value, ['2026-04-14', '2026-04-15']);
      assert.equal(parseUserFilter(col, '01/04/2026..15/04/2026').op, 'range');
    });

    it('parses each comparison operator prefix', () => {
      for (const op of ['>=', '<=', '>', '<', '=']) {
        const parsed = parseUserFilter(col, `${op}2026-04-01`);
        assert.equal(parsed.op, op);
        assert.equal(parsed.value, '2026-04-01');
      }
    });

    it('treats a bare 4-digit input as a whole-year filter', () => {
      assert.deepEqual(
        parseUserFilter(col, '2026'),
        { mode: 'date', op: 'year', value: '2026', originalValue: '2026' },
      );
    });

    it('returns null for input that is not a date', () => {
      assert.equal(parseUserFilter(col, 'abc'), null);          // unparseable plain
      assert.equal(parseUserFilter(col, '>abc'), null);         // unparseable with operator
      assert.equal(parseUserFilter(col, 'abc..def'), null);     // unparseable range
      assert.equal(parseUserFilter(col, '14/04'), null);        // only two parts
      assert.equal(parseUserFilter(col, '1/2/3'), null);        // no part looks like a year
      assert.equal(parseUserFilter(col, 'a/b/2026'), null);     // NaN parts
    });
  });

  describe('enumLabel mode', () => {
    const col = {
      key: 'docStatus', type: 'status',
      enumLabels: { DR: 'Borrador', CO: 'Completado', CL: 'Cerrado' },
    };

    it('accepts a raw code committed from a dropdown', () => {
      assert.deepEqual(parseUserFilter(col, 'CO').value, ['CO']);
    });

    it('matches labels case-insensitively by substring', () => {
      assert.deepEqual(parseUserFilter(col, 'borra').value, ['DR']);
      assert.deepEqual(parseUserFilter(col, 'BORRADOR').value, ['DR']);
    });

    it('collects every label matching the typed fragment', () => {
      // "c" hits both "Completado" and "Cerrado" → an inSet query downstream.
      assert.deepEqual(parseUserFilter(col, 'rad').value, ['DR', 'CL']);
    });

    it('returns null when nothing matches', () => {
      assert.equal(parseUserFilter(col, 'zzz'), null);
    });

    it('returns null when enumLabels is missing or not an object', () => {
      assert.equal(parseUserFilter({ key: 's', type: 'status' }, 'CO'), null);
      assert.equal(parseUserFilter({ key: 's', type: 'status', enumLabels: null }, 'CO'), null);
      assert.equal(parseUserFilter({ key: 's', type: 'status', enumLabels: 'nope' }, 'CO'), null);
    });
  });

  describe('booleanLabel mode', () => {
    const col = { key: 'posted', type: 'boolean', badgeLabels: { true: 'Contabilizado', false: 'Pendiente' } };

    it('accepts the generic truthy keywords in both languages', () => {
      for (const input of ['true', 'yes', 'si', 'sí', '1', 'y', 'SI', 'Y']) {
        assert.equal(parseUserFilter(col, input).value, true, input);
      }
    });

    it('accepts the generic falsy keywords', () => {
      for (const input of ['false', 'no', '0', 'n', 'NO']) {
        assert.equal(parseUserFilter(col, input).value, false, input);
      }
    });

    it('matches the column badge labels by substring', () => {
      assert.equal(parseUserFilter(col, 'contab').value, true);
      assert.equal(parseUserFilter(col, 'pend').value, false);
    });

    it('returns null for unrecognized input, with or without badgeLabels', () => {
      assert.equal(parseUserFilter(col, 'maybe'), null);
      assert.equal(parseUserFilter({ key: 'p', type: 'boolean' }, 'maybe'), null);
    });
  });

  describe('numeric mode', () => {
    const col = { key: 'total', type: 'amount' };

    it('defaults a bare number to equality', () => {
      assert.deepEqual(
        parseUserFilter(col, '100.5'),
        { mode: 'numeric', op: '=', value: 100.5, originalValue: '100.5' },
      );
    });

    it('parses each operator prefix', () => {
      const expected = { '>=': 'gte', '<=': 'lte', '>': 'gt', '<': 'lt', '=': 'eq' };
      for (const op of Object.keys(expected)) {
        const parsed = parseUserFilter(col, `${op}42`);
        assert.equal(parsed.op, op);
        assert.equal(parsed.value, 42);
      }
    });

    it('strips thousands separators, with and without an operator', () => {
      assert.equal(parseUserFilter(col, '1,234.56').value, 1234.56);
      assert.equal(parseUserFilter(col, '>=1,000').value, 1000);
    });

    it('parses negative values', () => {
      assert.equal(parseUserFilter(col, '-50').value, -50);
      assert.equal(parseUserFilter(col, '<-50').value, -50);
    });

    it('returns null for non-numeric text', () => {
      assert.equal(parseUserFilter(col, 'abc'), null);
    });
  });

  it('produces an identifier filter for selector columns and _ID heuristics', () => {
    assert.deepEqual(
      parseUserFilter({ key: 'businessPartner', type: 'selector' }, 'jua'),
      { mode: 'identifier', value: 'jua', originalValue: 'jua' },
    );
    assert.equal(parseUserFilter({ key: 'bp', column: 'C_BPartner_ID' }, 'jua').mode, 'identifier');
  });
});

// ---------------------------------------------------------------------------
// resolveBackendSort
// ---------------------------------------------------------------------------

describe('resolveBackendSort', () => {
  it('emits a bare token / minus-prefixed token for identifier sorts', () => {
    // OpenBravo's AdvancedQueryBuilder only detects an identifier sort when the
    // token ENDS in `._identifier`; a trailing " asc"/" desc" breaks it (500).
    const col = { key: 'businessPartner', type: 'selector' };
    assert.equal(resolveBackendSort(col, 'asc'), 'businessPartner$_identifier');
    assert.equal(resolveBackendSort(col, 'desc'), '-businessPartner$_identifier');
  });

  it('treats an explicit backendSortKey as an identifier sort (no direction suffix)', () => {
    const col = { key: 'bp', backendSortKey: 'businessPartner$name' };
    assert.equal(resolveBackendSort(col, 'asc'), 'businessPartner$name');
    assert.equal(resolveBackendSort(col, 'desc'), '-businessPartner$name');
  });

  it('honors an explicit sortMode=identifier over the column type', () => {
    assert.equal(resolveBackendSort({ key: 'code', type: 'string', sortMode: 'identifier' }, 'asc'), 'code$_identifier');
  });

  it('emits "<key> <dir>" for raw sorts', () => {
    assert.equal(resolveBackendSort({ key: 'orderDate', type: 'date' }, 'desc'), 'orderDate desc');
    assert.equal(resolveBackendSort({ key: 'total', type: 'amount' }, 'asc'), 'total asc');
    assert.equal(resolveBackendSort({ key: 'name' }, 'asc'), 'name asc');
  });

  it('sorts enum and boolean columns on the raw key, not the label', () => {
    // enumLabel/booleanLabel are not identifier sorts, so the direction suffix
    // form is correct for them.
    assert.equal(resolveBackendSort({ key: 'docStatus', type: 'status' }, 'asc'), 'docStatus asc');
    assert.equal(resolveBackendSort({ key: 'posted', type: 'boolean' }, 'desc'), 'posted desc');
    assert.equal(resolveBackendSort({ key: 's', enumLabels: { A: 'a' } }, 'asc'), 's asc');
    assert.equal(resolveBackendSort({ key: 'b', badgeLabels: { true: 'x' } }, 'asc'), 'b asc');
  });

  it('coerces any non-"desc" direction to asc', () => {
    assert.equal(resolveBackendSort({ key: 'n' }, 'ASC'), 'n asc');
    assert.equal(resolveBackendSort({ key: 'n' }, 'bogus'), 'n asc');
    assert.equal(resolveBackendSort({ key: 'n' }, undefined), 'n asc');
  });

  it('does not throw on a nullish column', () => {
    assert.equal(resolveBackendSort(null, 'asc'), ' asc');
    assert.equal(resolveBackendSort(undefined, 'desc'), ' desc');
  });
});

// ---------------------------------------------------------------------------
// buildBackendFilter  (and the parse → build round trip)
// ---------------------------------------------------------------------------

describe('buildBackendFilter', () => {
  it('returns null without a parsed filter or without a column key', () => {
    assert.equal(buildBackendFilter({ key: 'x' }, null), null);
    assert.equal(buildBackendFilter({ key: 'x' }, undefined), null);
    assert.equal(buildBackendFilter({}, { mode: 'text', value: 'y' }), null);
    assert.equal(buildBackendFilter(null, { mode: 'text', value: 'y' }), null);
  });

  it('builds a case-insensitive contains filter for text', () => {
    assert.deepEqual(
      buildBackendFilter({ key: 'documentNo' }, { mode: 'text', value: 'INV' }),
      [{ fieldName: 'documentNo', operator: 'iContains', value: 'INV' }],
    );
  });

  it('falls back to iContains for an unknown mode', () => {
    assert.deepEqual(
      buildBackendFilter({ key: 'x' }, { mode: 'somethingNew', value: 'v' }),
      [{ fieldName: 'x', operator: 'iContains', value: 'v' }],
    );
  });

  it('filters identifier columns against $_identifier', () => {
    assert.deepEqual(
      buildBackendFilter({ key: 'businessPartner' }, { mode: 'identifier', value: 'jua' }),
      [{ fieldName: 'businessPartner$_identifier', operator: 'iContains', value: 'jua' }],
    );
  });

  it('uses equals for one enum code and inSet for several', () => {
    assert.deepEqual(
      buildBackendFilter({ key: 'docStatus' }, { mode: 'enumLabel', value: ['CO'] }),
      [{ fieldName: 'docStatus', operator: 'equals', value: 'CO' }],
    );
    assert.deepEqual(
      buildBackendFilter({ key: 'docStatus' }, { mode: 'enumLabel', value: ['CO', 'CL'] }),
      [{ fieldName: 'docStatus', operator: 'inSet', value: 'CO,CL' }],
    );
  });

  it('serializes booleans to the backend Y/N chars (never a JS boolean)', () => {
    // Verified against NEO: `posted=true` returns 0 rows, `posted='Y'` matches.
    assert.deepEqual(
      buildBackendFilter({ key: 'posted' }, { mode: 'booleanLabel', value: true }),
      [{ fieldName: 'posted', operator: 'equals', value: 'Y' }],
    );
    assert.deepEqual(
      buildBackendFilter({ key: 'posted' }, { mode: 'booleanLabel', value: false }),
      [{ fieldName: 'posted', operator: 'equals', value: 'N' }],
    );
  });

  it('maps every numeric operator, defaulting an unknown one to equals', () => {
    const cases = [
      ['=', 'equals'], ['>', 'greaterThan'], ['<', 'lessThan'],
      ['>=', 'greaterOrEqual'], ['<=', 'lessOrEqual'],
    ];
    for (const [op, operator] of cases) {
      assert.deepEqual(
        buildBackendFilter({ key: 'total' }, { mode: 'numeric', op, value: 10 }),
        [{ fieldName: 'total', operator, value: 10 }], op,
      );
    }
    assert.deepEqual(
      buildBackendFilter({ key: 'total' }, { mode: 'numeric', op: '!=', value: 10 }),
      [{ fieldName: 'total', operator: 'equals', value: 10 }],
    );
  });

  it('honors backendFilterKey for every mode', () => {
    const col = { key: 'bp', backendFilterKey: 'businessPartner$name' };
    const modes = [
      { mode: 'text', value: 'x' },
      { mode: 'identifier', value: 'x' },
      { mode: 'enumLabel', value: ['A'] },
      { mode: 'booleanLabel', value: true },
      { mode: 'numeric', op: '=', value: 1 },
      { mode: 'date', op: '>=', value: '2026-01-01' },
    ];
    for (const parsed of modes) {
      const [first] = buildBackendFilter(col, parsed);
      assert.equal(first.fieldName, 'businessPartner$name', parsed.mode);
    }
  });

  describe('date day-level range semantics', () => {
    // The backend column is a datetime, so every date comparison has to be
    // expressed as an inclusive day boundary or rows on the boundary day are
    // silently dropped.
    const col = { key: 'orderDate' };

    it('expands an exact date to a greaterOrEqual + lessOrEqual pair', () => {
      assert.deepEqual(buildBackendFilter(col, { mode: 'date', op: '=', value: '2026-04-14' }), [
        { fieldName: 'orderDate', operator: 'greaterOrEqual', value: '2026-04-14' },
        { fieldName: 'orderDate', operator: 'lessOrEqual', value: '2026-04-14' },
      ]);
    });

    it('expands a year to its first and last day', () => {
      assert.deepEqual(buildBackendFilter(col, { mode: 'date', op: 'year', value: '2026' }), [
        { fieldName: 'orderDate', operator: 'greaterOrEqual', value: '2026-01-01' },
        { fieldName: 'orderDate', operator: 'lessOrEqual', value: '2026-12-31' },
      ]);
    });

    it('maps a range to its inclusive bounds', () => {
      assert.deepEqual(
        buildBackendFilter(col, { mode: 'date', op: 'range', value: ['2026-04-01', '2026-04-15'] }),
        [
          { fieldName: 'orderDate', operator: 'greaterOrEqual', value: '2026-04-01' },
          { fieldName: 'orderDate', operator: 'lessOrEqual', value: '2026-04-15' },
        ],
      );
    });

    it('shifts the boundary day by one for the strict < and > operators', () => {
      assert.deepEqual(buildBackendFilter(col, { mode: 'date', op: '<', value: '2026-04-14' }), [
        { fieldName: 'orderDate', operator: 'lessOrEqual', value: '2026-04-13' },
      ]);
      assert.deepEqual(buildBackendFilter(col, { mode: 'date', op: '>', value: '2026-04-14' }), [
        { fieldName: 'orderDate', operator: 'greaterOrEqual', value: '2026-04-15' },
      ]);
    });

    it('crosses month and year boundaries when shifting', () => {
      // Regression guard for naive string arithmetic on the day component.
      assert.equal(
        buildBackendFilter(col, { mode: 'date', op: '<', value: '2026-05-01' })[0].value,
        '2026-04-30',
      );
      assert.equal(
        buildBackendFilter(col, { mode: 'date', op: '>', value: '2026-12-31' })[0].value,
        '2027-01-01',
      );
      // 2028 is a leap year: 28 Feb + 1 day = 29 Feb, not 1 Mar.
      assert.equal(
        buildBackendFilter(col, { mode: 'date', op: '>', value: '2028-02-28' })[0].value,
        '2028-02-29',
      );
    });

    it('keeps the boundary day for the inclusive <= and >= operators', () => {
      assert.deepEqual(buildBackendFilter(col, { mode: 'date', op: '>=', value: '2026-04-14' }), [
        { fieldName: 'orderDate', operator: 'greaterOrEqual', value: '2026-04-14' },
      ]);
      assert.deepEqual(buildBackendFilter(col, { mode: 'date', op: '<=', value: '2026-04-14' }), [
        { fieldName: 'orderDate', operator: 'lessOrEqual', value: '2026-04-14' },
      ]);
    });
  });

  describe('round trip: user input → backend criteria', () => {
    // This is the real code path behind a column filter box; asserting it
    // end-to-end catches mismatches between the parser and the builder that
    // per-function tests can miss.
    const build = (col, input) => buildBackendFilter(col, parseUserFilter(col, input));

    it('a locale date typed by the user becomes an inclusive day range', () => {
      assert.deepEqual(build({ key: 'orderDate', type: 'date' }, '14/04/2026'), [
        { fieldName: 'orderDate', operator: 'greaterOrEqual', value: '2026-04-14' },
        { fieldName: 'orderDate', operator: 'lessOrEqual', value: '2026-04-14' },
      ]);
    });

    it('a Spanish status label becomes an equals on the raw code', () => {
      const col = { key: 'docStatus', type: 'status', enumLabels: { DR: 'Borrador', CO: 'Completado' } };
      assert.deepEqual(build(col, 'borra'), [
        { fieldName: 'docStatus', operator: 'equals', value: 'DR' },
      ]);
    });

    it('an ambiguous status fragment becomes an inSet', () => {
      const col = { key: 'docStatus', type: 'status', enumLabels: { DR: 'Borrador', CO: 'Cerrado' } };
      assert.deepEqual(build(col, 'rad'), [
        { fieldName: 'docStatus', operator: 'inSet', value: 'DR,CO' },
      ]);
    });

    it('"si" on a boolean column becomes equals Y', () => {
      const col = { key: 'posted', type: 'boolean', badgeLabels: { true: 'Contabilizado', false: 'Pendiente' } };
      assert.deepEqual(build(col, 'si'), [{ fieldName: 'posted', operator: 'equals', value: 'Y' }]);
    });

    it('a thousands-separated amount expression becomes a numeric comparison', () => {
      assert.deepEqual(build({ key: 'total', type: 'amount' }, '>=1,000.50'), [
        { fieldName: 'total', operator: 'greaterOrEqual', value: 1000.5 },
      ]);
    });

    it('free text on a foreign-key column filters the display label', () => {
      assert.deepEqual(build({ key: 'bp', column: 'C_BPartner_ID' }, 'jua'), [
        { fieldName: 'bp$_identifier', operator: 'iContains', value: 'jua' },
      ]);
    });

    it('unparseable input yields no criteria at all', () => {
      assert.equal(build({ key: 'orderDate', type: 'date' }, 'nope'), null);
      assert.equal(build({ key: 'total', type: 'amount' }, 'nope'), null);
    });
  });
});

// ---------------------------------------------------------------------------
// buildAdvancedFilterCriteria (+ the per-row criteria matrix)
// ---------------------------------------------------------------------------

describe('buildAdvancedFilterCriteria', () => {
  const COLUMNS = [
    { key: 'documentNo', type: 'string' },
    { key: 'orderDate', type: 'date' },
    { key: 'total', type: 'amount' },
    { key: 'posted', type: 'boolean', badgeLabels: { true: 'Si', false: 'No' } },
    { key: 'businessPartner', type: 'selector' },
  ];
  const build = (advancedFilter, columns = COLUMNS) => buildAdvancedFilterCriteria(advancedFilter, columns);

  describe('guards', () => {
    it('returns null for a missing, empty or malformed filter', () => {
      assert.equal(build(null), null);
      assert.equal(build({}), null);
      assert.equal(build({ conditions: [] }), null);
      assert.equal(build({ conditions: null }), null);
    });

    it('returns null when columns is not an array', () => {
      const filter = { conditions: [{ field: 'documentNo', operator: 'iContains', value: 'A' }] };
      assert.equal(build(filter, null), null);
      assert.equal(build(filter, 'documentNo'), null);
      assert.equal(build(filter, { documentNo: {} }), null);
    });

    it('skips conditions whose field is not a known column', () => {
      const result = build({
        conditions: [
          { field: 'ghost', operator: 'iContains', value: 'A' },
          { field: 'documentNo', operator: 'iContains', value: 'B' },
        ],
      });
      assert.deepEqual(result, [{ fieldName: 'documentNo', operator: 'iContains', value: 'B' }]);
    });

    it('returns null when every condition is unusable', () => {
      assert.equal(build({ conditions: [{ field: 'ghost', operator: 'iContains', value: 'A' }] }), null);
      // No operator picked yet in the builder UI.
      assert.equal(build({ conditions: [{ field: 'documentNo', value: 'A' }] }), null);
      // Value cleared.
      assert.equal(build({ conditions: [{ field: 'documentNo', operator: 'iContains', value: '' }] }), null);
      assert.equal(build({ conditions: [{ field: 'documentNo', operator: 'iContains', value: null }] }), null);
      assert.equal(build({ conditions: [{ field: 'documentNo', operator: 'iContains' }] }), null);
    });
  });

  describe('row composition', () => {
    it('emits AND rows flat so they compose with the surrounding AND layer', () => {
      const result = build({
        rowOperator: 'and',
        conditions: [
          { field: 'documentNo', operator: 'iContains', value: 'INV' },
          { field: 'total', operator: 'greaterThan', value: '100' },
        ],
      });
      assert.deepEqual(result, [
        { fieldName: 'documentNo', operator: 'iContains', value: 'INV' },
        { fieldName: 'total', operator: 'greaterThan', value: 100 },
      ]);
    });

    it('wraps OR rows in a single AdvancedCriteria object', () => {
      // The outer merge treats the whole advanced block as one AND-level item.
      const result = build({
        rowOperator: 'or',
        conditions: [
          { field: 'documentNo', operator: 'iContains', value: 'INV' },
          { field: 'documentNo', operator: 'iContains', value: 'ORD' },
        ],
      });
      assert.deepEqual(result, [{
        _constructor: 'AdvancedCriteria',
        operator: 'or',
        criteria: [
          { fieldName: 'documentNo', operator: 'iContains', value: 'INV' },
          { fieldName: 'documentNo', operator: 'iContains', value: 'ORD' },
        ],
      }]);
    });

    it('does not wrap an OR filter that produced a single criterion', () => {
      const result = build({
        rowOperator: 'or',
        conditions: [{ field: 'documentNo', operator: 'iContains', value: 'INV' }],
      });
      assert.deepEqual(result, [{ fieldName: 'documentNo', operator: 'iContains', value: 'INV' }]);
    });
  });

  describe('operators', () => {
    it('maps isNull / isNotNull to isNull / notNull with no value', () => {
      assert.deepEqual(
        build({ conditions: [{ field: 'businessPartner', operator: 'isNull' }] }),
        [{ fieldName: 'businessPartner', operator: 'isNull' }],
      );
      assert.deepEqual(
        build({ conditions: [{ field: 'businessPartner', operator: 'isNotNull' }] }),
        [{ fieldName: 'businessPartner', operator: 'notNull' }],
      );
    });

    it('expands "between" into an inclusive pair, coercing numerics', () => {
      assert.deepEqual(
        build({ conditions: [{ field: 'total', operator: 'between', value: ['1,000', '2000'] }] }),
        [
          { fieldName: 'total', operator: 'greaterOrEqual', value: 1000 },
          { fieldName: 'total', operator: 'lessOrEqual', value: 2000 },
        ],
      );
    });

    it('leaves non-numeric "between" bounds untouched (dates stay ISO strings)', () => {
      assert.deepEqual(
        build({ conditions: [{ field: 'orderDate', operator: 'between', value: ['2026-01-01', '2026-12-31'] }] }),
        [
          { fieldName: 'orderDate', operator: 'greaterOrEqual', value: '2026-01-01' },
          { fieldName: 'orderDate', operator: 'lessOrEqual', value: '2026-12-31' },
        ],
      );
    });

    it('returns null for an incomplete or invalid "between"', () => {
      const between = (value) => build({ conditions: [{ field: 'total', operator: 'between', value }] });
      assert.equal(between('2026-01-01'), null);        // not an array
      assert.equal(between(['', '2000']), null);        // empty from
      assert.equal(between(['1000', '']), null);        // empty to
      assert.equal(between([null, '2000']), null);      // null from
      assert.equal(between(['1000', null]), null);      // null to
      assert.equal(between(['abc', '2000']), null);     // from not coercible
      assert.equal(between(['1000', 'abc']), null);     // to not coercible
    });

    it('turns inSet into OR-composed iEquals clauses', () => {
      const result = build({
        conditions: [{ field: 'documentNo', operator: 'inSet', value: ['A', 'B'] }],
      });
      assert.deepEqual(result, [{
        _constructor: 'AdvancedCriteria',
        operator: 'or',
        criteria: [
          { fieldName: 'documentNo', operator: 'iEquals', value: 'A' },
          { fieldName: 'documentNo', operator: 'iEquals', value: 'B' },
        ],
      }]);
    });

    it('accepts a comma-separated string for inSet and trims each item', () => {
      const result = build({
        conditions: [{ field: 'documentNo', operator: 'inSet', value: ' A , B ,C ' }],
      });
      assert.deepEqual(result[0].criteria.map((c) => c.value), ['A', 'B', 'C']);
    });

    it('does not OR-wrap an inSet that resolves to one item', () => {
      assert.deepEqual(
        build({ conditions: [{ field: 'documentNo', operator: 'inSet', value: ['A'] }] }),
        [{ fieldName: 'documentNo', operator: 'iEquals', value: 'A' }],
      );
      assert.deepEqual(
        build({ conditions: [{ field: 'documentNo', operator: 'inSet', value: 'A' }] }),
        [{ fieldName: 'documentNo', operator: 'iEquals', value: 'A' }],
      );
    });

    it('drops blank and nullish inSet items, and returns null when none survive', () => {
      const result = build({
        conditions: [{ field: 'documentNo', operator: 'inSet', value: ['A', '', null, undefined, 'B'] }],
      });
      assert.deepEqual(result[0].criteria.map((c) => c.value), ['A', 'B']);
      assert.equal(build({ conditions: [{ field: 'documentNo', operator: 'inSet', value: [] }] }), null);
      assert.equal(build({ conditions: [{ field: 'documentNo', operator: 'inSet', value: ['', null] }] }), null);
      assert.equal(build({ conditions: [{ field: 'documentNo', operator: 'inSet', value: ',' }] }), null);
    });

    it('OR-composes the picked operator across a multi-value array', () => {
      // Multi-select checkbox popover: same operator, several values.
      const result = build({
        conditions: [{ field: 'documentNo', operator: 'iNotContains', value: ['A', 'B'] }],
      });
      assert.deepEqual(result, [{
        _constructor: 'AdvancedCriteria',
        operator: 'or',
        criteria: [
          { fieldName: 'documentNo', operator: 'iNotContains', value: 'A' },
          { fieldName: 'documentNo', operator: 'iNotContains', value: 'B' },
        ],
      }]);
      // Single-element arrays stay flat, and an all-blank array yields nothing.
      assert.deepEqual(
        build({ conditions: [{ field: 'documentNo', operator: 'equals', value: ['A'] }] }),
        [{ fieldName: 'documentNo', operator: 'equals', value: 'A' }],
      );
      assert.equal(build({ conditions: [{ field: 'documentNo', operator: 'equals', value: ['', null] }] }), null);
    });
  });

  describe('mode-specific value handling', () => {
    it('coerces numeric-mode values, and drops the row when coercion fails', () => {
      assert.deepEqual(
        build({ conditions: [{ field: 'total', operator: 'greaterThan', value: '1,500.25' }] }),
        [{ fieldName: 'total', operator: 'greaterThan', value: 1500.25 }],
      );
      assert.deepEqual(
        build({ conditions: [{ field: 'total', operator: 'equals', value: 42 }] }),
        [{ fieldName: 'total', operator: 'equals', value: 42 }],
      );
      assert.equal(build({ conditions: [{ field: 'total', operator: 'equals', value: 'abc' }] }), null);
    });

    it('serializes booleanLabel-mode values to Y/N', () => {
      const bool = (value) => build({ conditions: [{ field: 'posted', operator: 'equals', value }] });
      assert.deepEqual(bool(true), [{ fieldName: 'posted', operator: 'equals', value: 'Y' }]);
      assert.deepEqual(bool('Y'), [{ fieldName: 'posted', operator: 'equals', value: 'Y' }]);
      assert.deepEqual(bool('true'), [{ fieldName: 'posted', operator: 'equals', value: 'Y' }]);
      assert.deepEqual(bool(false), [{ fieldName: 'posted', operator: 'equals', value: 'N' }]);
      assert.deepEqual(bool('N'), [{ fieldName: 'posted', operator: 'equals', value: 'N' }]);
    });

    it('routes identifier columns to $_identifier only for textual operators', () => {
      // Free text typed by the user matches the BP display name; a value picked
      // from the checkbox popover is a UUID and must hit the raw FK column.
      const bp = (operator, value = 'x') => build({ conditions: [{ field: 'businessPartner', operator, value }] });
      for (const op of ['iContains', 'iNotContains', 'iEquals', 'iNotEqual']) {
        assert.equal(bp(op)[0].fieldName, 'businessPartner$_identifier', op);
      }
      for (const op of ['equals', 'notEqual']) {
        assert.equal(bp(op)[0].fieldName, 'businessPartner', op);
      }
    });

    it('honors backendFilterKey over the identifier routing', () => {
      const columns = [{ key: 'bp', type: 'selector', backendFilterKey: 'bp$name' }];
      const result = build({ conditions: [{ field: 'bp', operator: 'iContains', value: 'jua' }] }, columns);
      assert.deepEqual(result, [{ fieldName: 'bp$name', operator: 'iContains', value: 'jua' }]);
    });

    it('gives a custom column with an explicit numeric filterMode numeric semantics', () => {
      // ETP-4681: without the explicit filterMode a `custom` cell would fall
      // back to text and the value would stay a string.
      const columns = [{ key: 'daysOverdue', type: 'custom', filterMode: 'numeric' }];
      const result = build({
        conditions: [{ field: 'daysOverdue', operator: 'greaterThan', value: '30' }],
      }, columns);
      assert.deepEqual(result, [{ fieldName: 'daysOverdue', operator: 'greaterThan', value: 30 }]);
    });
  });

  describe('column-supplied buildCriteria override', () => {
    it('delegates entirely to col.buildCriteria when present', () => {
      const columns = [{
        key: 'aging',
        type: 'custom',
        buildCriteria: (row) => [{ fieldName: 'daysDue', operator: row.operator, value: Number(row.value) }],
      }];
      const result = build({ conditions: [{ field: 'aging', operator: 'greaterThan', value: '30' }] }, columns);
      assert.deepEqual(result, [{ fieldName: 'daysDue', operator: 'greaterThan', value: 30 }]);
    });

    it('normalizes an undefined buildCriteria result to null and skips the row', () => {
      const columns = [
        { key: 'aging', type: 'custom', buildCriteria: () => undefined },
        { key: 'documentNo', type: 'string' },
      ];
      assert.equal(build({ conditions: [{ field: 'aging', operator: 'equals', value: '1' }] }, columns), null);

      const mixed = build({
        conditions: [
          { field: 'aging', operator: 'equals', value: '1' },
          { field: 'documentNo', operator: 'iContains', value: 'INV' },
        ],
      }, columns);
      assert.deepEqual(mixed, [{ fieldName: 'documentNo', operator: 'iContains', value: 'INV' }]);
    });
  });
});

// ---------------------------------------------------------------------------
// getFilteredKey — cross-checked here against the mode returned by
// resolveFilterMode, which is how buildRowCriteria actually calls it.
// (Its standalone unit tests live in getFilteredKey.test.js.)
// ---------------------------------------------------------------------------

describe('getFilteredKey composed with resolveFilterMode', () => {
  it('routes a selector column to $_identifier for a textual operator', () => {
    const col = { key: 'businessPartner', type: 'selector' };
    assert.equal(getFilteredKey(col, resolveFilterMode(col), 'iContains'), 'businessPartner$_identifier');
  });

  it('leaves a text column on its raw key even for a textual operator', () => {
    const col = { key: 'documentNo', type: 'string' };
    assert.equal(getFilteredKey(col, resolveFilterMode(col), 'iContains'), 'documentNo');
  });
});
