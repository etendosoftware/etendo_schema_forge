// Cuentas list — advanced ("by conditions") filter (ETP-5113).
//
// The module owns three things and each is covered below:
//
//  1. WHICH columns the funnel offers (`buildAccountFilterColumns`). They mirror the visible
//     grid one-for-one with a single deliberate exception: "Por conciliar"
//     (`eTGOPendingCount`) is NOT filterable — it is a reconciliation backlog counter
//     rendered as a pill, not a property of the account. Its absence is an acceptance
//     criterion, so it is asserted as an absence, not merely left untested.
//  2. The derived `countryLabel` projection (`withDerivedFields`), which is what makes the
//     País column filter over the same text `CountryCell` paints.
//  3. That evaluation goes through the declared column TYPES
//     (`ACCOUNT_FILTER_COLUMNS`). Before ETP-5113 `applyAccountAdvancedFilter` passed
//     neither the projection nor the column metadata, so every column — Saldo included —
//     fell through to the string-oriented OPERATORS table. The `numeric equality`
//     block below pins that regression by asserting BOTH paths: what the string table
//     answers and what the numeric one does.
//  4. The OPERATORS and the WIDGET each column ends up with. A declared `type` is only an
//     input to `resolveFilterMode`, and the mode in turn only picks a base operator list
//     which `required` then filters — so the thing the user actually reads in the dropdown
//     is two derivations away from the one value the spec declares. All three bugs this
//     filter shipped live in that gap:
//       - País as `string` → `text` mode: a WRONG MODE. Text's only widget is a free-text
//         box, so the country picker did not exist and the user had to type a country name
//         exactly right with no hint of which ones exist.
//       - Moneda as `selector` → `identifier` mode: a VALID mode with the WRONG OPERATOR
//         SET. It offered "Contiene / No contiene / Empieza por" for a three-character ISO
//         code, where "contiene EU" matching EUR is noise, not a feature.
//       - Then País as `selector` for one more round: same wrong operator set, for a
//         different reason — `DistinctEnumPicker` already has a search box inside the
//         popover, so a text operator is a redundant second way to do the same thing.
//     A `type` assertion catches none of the three; a mode assertion catches only the first.
//     So the `offered operators` block replays `OPERATORS_BY_MODE` + the `required` gate and
//     pins the whole spec's operator lists in one table — that is the PRIMARY guard. The
//     `resolved filter mode` block stays because the mode ALSO decides the evaluation
//     (`tableFor`) and which picker seeds from the rows, not just the dropdown.
//
//     Final spec: name text/required · type enum+catalogue/required · iban text ·
//     currencyIso enum/required · countryLabel enum · currentBalance numeric/required.
//     Moneda and País differ by `required` alone, and that difference is DATA, not tidiness —
//     see `keeps the empty checks on País and withholds them from Moneda`.
import { describe, it, expect } from 'vitest';
import {
  ACCOUNT_FILTER_COLUMNS,
  applyAccountAdvancedFilter,
  buildAccountFilterColumns,
  withDerivedFields,
} from '../accountAdvancedFilter.js';
import {
  applyConditions,
  DATE_OPERATORS,
  NUMBER_OPERATORS,
  OPERATORS,
} from '@/windows/custom/financial-account/advancedFilterApply';
import { resolveFilterMode } from '@/lib/gridQuery.js';

const ui = (key) => key; // identity translator

const ACCOUNTS = [
  {
    id: 'a1',
    name: 'Cuenta de Banco',
    type: 'B',
    iban: 'ES1212340000000000000001',
    currencyIso: 'EUR',
    countryName: 'España',
    countryIso: 'ES',
    // Stored at bank precision, displayed as "1.646,49 €" — the mismatch the numeric
    // equality operator exists for.
    currentBalance: 1646.4867,
    eTGOPendingCount: 52,
  },
  {
    id: 'a2',
    name: 'Caja',
    type: 'C',
    currencyIso: 'EUR',
    // No countryName: `countryLabel` has to fall back to the ISO code, exactly as the cell does.
    countryIso: 'PT',
    currentBalance: -226538.85,
    eTGOPendingCount: 0,
  },
  {
    id: 'a3',
    name: 'Tarjeta de prueba',
    type: 'CA',
    iban: 'DE89370400440532013000',
    currencyIso: 'USD',
    // Neither country field (pre-ETP-4896 data) → `countryLabel` is ''.
    currentBalance: 0,
    eTGOPendingCount: 0,
  },
];

const filter = (conditions, rowOperator = 'and') => ({ rowOperator, conditions });
const ids = (rows) => rows.map((a) => a.id);
const columnsByKey = (translator = ui) => Object.fromEntries(
  buildAccountFilterColumns(translator).map((c) => [c.key, c]),
);

describe('buildAccountFilterColumns — offered columns', () => {
  it('offers exactly the six filterable columns, in grid order', () => {
    expect(buildAccountFilterColumns(ui).map((c) => c.key)).toEqual([
      'name', 'type', 'iban', 'currencyIso', 'countryLabel', 'currentBalance',
    ]);
  });

  it('declares the type of every column so the evaluator can dispatch operators', () => {
    const byKey = columnsByKey();
    expect(byKey.name.type).toBe('string');
    expect(byKey.type.type).toBe('enum');
    expect(byKey.iban.type).toBe('string');
    // Moneda AND País are both `enum`: both are picked from a data-seeded list, and
    // `DistinctEnumPicker` carries its own search box, so a text operator ("Contiene EU"
    // matching EUR) buys nothing the user cannot already do inside the popover. They differ
    // only in `required`. See the `offered operators` block for why the resulting OPERATOR
    // LIST — not this declaration and not even the resolved mode — is the real assertion.
    expect(byKey.currencyIso.type).toBe('enum');
    expect(byKey.countryLabel.type).toBe('enum');
    expect(byKey.currentBalance.type).toBe('number');
  });

  // `required: true` is what drops "Is empty" / "Is not empty" from the operator list
  // (getOperatorsForColumn in AdvancedFilterBuilder): on an AD-mandatory column those two
  // could only ever match zero rows. IBAN is genuinely optional (cash and card accounts have
  // none) and `countryLabel` is deliberately not required despite Country being mandatory
  // since ETP-4896 — accounts created before it can still have none.
  it('marks only the AD-mandatory columns required', () => {
    const byKey = columnsByKey();
    expect(byKey.name.required).toBe(true);
    expect(byKey.type.required).toBe(true);
    expect(byKey.currencyIso.required).toBe(true);
    expect(byKey.currentBalance.required).toBe(true);
    expect(byKey.iban.required).toBeUndefined();
    expect(byKey.countryLabel.required).toBeUndefined();
  });

  it('resolves every label through the ui translator, never a literal', () => {
    const byKey = columnsByKey();
    expect(byKey.name.label).toBe('financeAccountsColAccount');
    expect(byKey.type.label).toBe('financeAccountsColType');
    expect(byKey.iban.label).toBe('financeAccountsColIban');
    expect(byKey.currencyIso.label).toBe('financeAccountsColCurrency');
    expect(byKey.countryLabel.label).toBe('financeAccountsColCountry');
    expect(byKey.currentBalance.label).toBe('financeAccountsColBalance');
  });

  it('resolves the type enum labels through the same translator', () => {
    const byKey = columnsByKey();
    expect(byKey.type.enumLabels).toEqual({
      B: 'financeAccountsTypeBank',
      C: 'financeAccountsTypeCash',
      CA: 'financeAccountsTypeCard',
    });
    expect(Object.keys(byKey.type.enumLabels)).toEqual(['B', 'C', 'CA']);
  });

  // Moneda and País declare no closed catalogue on purpose: their options come from the
  // loaded rows. `DistinctEnumPicker.inMemoryCodes` reads `row[col.key]` off the rows it is
  // seeded with, so a declared catalogue here could only offer a currency or a country no
  // account holds. Tipo is the sole exception: its three codes ARE a closed AD list, which
  // is why `hasDeclaredLabels` (and therefore the picker's merge policy) differs for it.
  it('declares no catalogue for the data-seeded columns — their options come from the rows', () => {
    const byKey = columnsByKey();
    for (const key of ['currencyIso', 'countryLabel']) {
      expect(byKey[key].type, key).toBe('enum');
      expect(byKey[key].enumLabels, key).toBeUndefined();
      expect('enumLabels' in byKey[key], `${key} must not declare enumLabels`).toBe(false);
      expect('enumKeys' in byKey[key], `${key} must not declare enumKeys`).toBe(false);
    }
    // Tipo is `enum` too, and the ONLY thing separating it from those two is the catalogue.
    expect(byKey.type.type).toBe('enum');
    expect(byKey.type.enumKeys ?? byKey.type.enumLabels).toBeTruthy();
  });

  it('omits enumLabels for every column but Tipo', () => {
    for (const col of buildAccountFilterColumns(ui)) {
      if (col.key === 'type') continue;
      expect('enumLabels' in col, `${col.key} must not declare enumLabels`).toBe(false);
    }
  });

  // Acceptance criterion, asserted as an absence so reintroducing the column fails here.
  it('does NOT offer "Por conciliar" (eTGOPendingCount)', () => {
    const keys = buildAccountFilterColumns(ui).map((c) => c.key);
    expect(keys).not.toContain('eTGOPendingCount');
    expect(keys).not.toContain('pendingCount');
    expect(ACCOUNT_FILTER_COLUMNS.eTGOPendingCount).toBeUndefined();
  });

  // The row property, not the decisions.json field name: the field is `iBAN` while the row
  // carries `iban`, and País has no flat property at all (hence `countryLabel`).
  it('keys the columns off the ROW properties, not the contract field names', () => {
    const keys = buildAccountFilterColumns(ui).map((c) => c.key);
    expect(keys).not.toContain('iBAN');
    expect(keys).not.toContain('country');
    expect(keys).not.toContain('currency');
  });
});

/**
 * The two operator tables the core AdvancedFilterBuilder decides the dropdown from. Neither
 * is exported, so they are mirrored here — `OPERATORS_BY_MODE` and `NULLISH_OPS` in
 * `@etendosoftware/app-shell-core/src/components/contract-ui/AdvancedFilterBuilder.jsx`.
 *
 * Mirroring is the point rather than a compromise: this file's job is to pin what the USER
 * sees in the "Moneda …" dropdown, and replaying the two functions that produce it turns a
 * spec edit into a diff on a concrete operator list. A change in the core table is supposed
 * to fail here loudly so the consequence for this window gets re-read.
 */
const OPERATORS_BY_MODE = {
  text:         ['iContains', 'iNotContains', 'iStartsWith', 'iEquals', 'iNotEqual', 'isNull', 'isNotNull'],
  identifier:   ['iContains', 'iNotContains', 'iStartsWith', 'equals', 'notEqual', 'isNull', 'isNotNull'],
  enumLabel:    ['equals', 'notEqual', 'isNull', 'isNotNull'],
  booleanLabel: ['equals'],
  numeric:      ['equals', 'notEqual', 'greaterThan', 'greaterOrEqual', 'lessThan', 'lessOrEqual', 'between', 'isNull', 'isNotNull'],
  date:         ['equals', 'lessThan', 'greaterThan', 'between', 'isNull', 'isNotNull'],
};
const NULLISH_OPS = new Set(['isNull', 'isNotNull']);

/** Mirrors `tableFor` in advancedFilterApply: only `date` and `numeric` branch away from the
 *  generic string table, so `text`, `enumLabel` and `identifier` all share `OPERATORS`. */
const TABLE_BY_MODE = {
  text: OPERATORS,
  identifier: OPERATORS,
  enumLabel: OPERATORS,
  booleanLabel: OPERATORS,
  numeric: NUMBER_OPERATORS,
  date: DATE_OPERATORS,
};

/** Replays `getOperatorsForColumn(col, resolveFilterMode(col))` — mode picks the base list,
 *  `required: true` drops the two nullish operators (they could only match zero rows). */
function offeredOperators(col) {
  const base = OPERATORS_BY_MODE[resolveFilterMode(col)] ?? OPERATORS_BY_MODE.text;
  return col?.required ? base.filter((op) => !NULLISH_OPS.has(op)) : base;
}

// THE PRIMARY GUARD, and the one that would actually have caught both bugs this filter
// shipped.
//
// A mode assertion is not enough. País as `string` → `text` mode was a WRONG MODE (text's
// only widget is a free-text box, so the country picker did not exist at all). But `selector`
// → `identifier` was a perfectly VALID mode with the WRONG OPERATOR SET, twice: on Moneda it
// offered "Contiene / No contiene / Empieza por" for a three-character ISO code, where
// "contiene EU" matching EUR is noise; and on País it offered the same three redundantly,
// since `DistinctEnumPicker` already has a search box inside the popover. Only the operator
// list distinguishes those cases, and the operator list is exactly what the user reads in the
// dropdown.
//
// So the whole spec is pinned here in one table. Editing a column's `type` or `required` now
// forces a diff on the operators that column offers. There are no `identifier` columns left
// in this spec — `TABLE_BY_MODE` and `OPERATORS_BY_MODE` still carry the mode because they
// mirror the generic core tables, not this window's spec.
describe('buildAccountFilterColumns — offered operators', () => {
  const EXPECTED = {
    // Free text: an account name is typed, and it is AD-mandatory, so no empty checks.
    name:           { mode: 'text',      operators: ['iContains', 'iNotContains', 'iStartsWith', 'iEquals', 'iNotEqual'] },
    // Closed AD catalogue of three codes, mandatory → "Es" / "No es" only.
    type:           { mode: 'enumLabel', operators: ['equals', 'notEqual'] },
    // Free text AND optional (cash/card accounts have no IBAN), so it keeps the empty checks.
    iban:           { mode: 'text',      operators: ['iContains', 'iNotContains', 'iStartsWith', 'iEquals', 'iNotEqual', 'isNull', 'isNotNull'] },
    // The user's call: a 3-char code is picked, never typed, and `DistinctEnumPicker` has its
    // own search box so a text operator buys nothing. Currency IS mandatory in AD, so the
    // empty checks could only ever match zero rows → `enum` + `required` = these two.
    currencyIso:    { mode: 'enumLabel', operators: ['equals', 'notEqual'] },
    // Same picker as Moneda — the popover's search box covers "esp", so País needs no text
    // operator either. But it is deliberately NOT `required`: see the block below for the
    // data behind that one-word difference.
    countryLabel:   { mode: 'enumLabel', operators: ['equals', 'notEqual', 'isNull', 'isNotNull'] },
    // Mandatory, so no empty checks; `between` and the four orderings are numeric-only.
    currentBalance: { mode: 'numeric',   operators: ['equals', 'notEqual', 'greaterThan', 'greaterOrEqual', 'lessThan', 'lessOrEqual', 'between'] },
  };

  it.each(Object.entries(EXPECTED))(
    '%s offers exactly the expected operators',
    (key, { mode, operators }) => {
      const col = columnsByKey()[key];
      expect(resolveFilterMode(col), `${key} mode`).toBe(mode);
      expect(offeredOperators(col), `${key} operators`).toEqual(operators);
    },
  );

  it('pins the operator list of every offered column, leaving none untested', () => {
    expect(Object.keys(EXPECTED)).toEqual(buildAccountFilterColumns(ui).map((c) => c.key));
  });

  // The user's actual complaint, spelled out as a negative on BOTH picker columns so
  // re-declaring either one `selector` (or `string`) fails here by operator NAME rather than
  // as an opaque array diff. `DistinctEnumPicker` already ships a search box inside the
  // popover, so a text operator adds no capability — only the "contiene EU matches EUR"
  // noise on Moneda, and a redundant second way to do the same thing on País.
  it.each(['currencyIso', 'countryLabel'])(
    'never offers the text operators for %s — the value is picked, not typed',
    (key) => {
      const operators = offeredOperators(columnsByKey()[key]);
      for (const op of ['iContains', 'iNotContains', 'iStartsWith', 'iEquals', 'iNotEqual']) {
        expect(operators, `${key} must not offer ${op}`).not.toContain(op);
      }
      expect(operators).toContain('equals');
      expect(operators).toContain('notEqual');
    },
  );

  // THE ASYMMETRY, and it is data, not an oversight.
  //
  // `required: true` drops "Está vacío" / "No está vacío". Currency is mandatory in AD, so
  // for Moneda those two could only ever match zero rows. País is NOT mandatory in the data
  // that exists: 248 of 448 active accounts instance-wide have `c_country_id IS NULL` (1 of
  // 26 in GOClient) because they predate ETP-4896 — so "Está vacío" is precisely how a user
  // finds the accounts that still need a country. Marking País `required` to make the two
  // columns look alike would both lie about the data and delete the most useful filter on
  // that column. Do not "tidy up" this inconsistency.
  //
  // The projected `countryLabel` collapses a missing country to '', which `isBlank` reads as
  // empty — so the operator genuinely works on the projection (asserted behaviourally in the
  // País block further down).
  it('keeps the empty checks on País and withholds them from Moneda', () => {
    expect(offeredOperators(columnsByKey().countryLabel)).toContain('isNull');
    expect(offeredOperators(columnsByKey().countryLabel)).toContain('isNotNull');
    expect(offeredOperators(columnsByKey().currencyIso)).not.toContain('isNull');
    expect(offeredOperators(columnsByKey().currencyIso)).not.toContain('isNotNull');
  });

  // The same rule, generalised: `required: true` is the only thing standing between an
  // AD-mandatory column and two operators that can only ever match zero rows.
  it('drops the empty checks from exactly the mandatory columns', () => {
    for (const col of buildAccountFilterColumns(ui)) {
      const operators = offeredOperators(col);
      const hasEmptyChecks = operators.includes('isNull') && operators.includes('isNotNull');
      expect(hasEmptyChecks, `${col.key} empty checks`).toBe(!col.required);
    }
  });

  // Moneda and País differ in EXACTLY one declared property. Pinned so the difference stays
  // legible as a single deliberate choice rather than two independently drifting columns.
  it('separates Moneda from País by `required` alone', () => {
    const { currencyIso, countryLabel } = columnsByKey();
    expect(currencyIso.type).toBe(countryLabel.type);
    expect(resolveFilterMode(currencyIso)).toBe(resolveFilterMode(countryLabel));
    expect(currencyIso.required).toBe(true);
    expect(countryLabel.required).toBeUndefined();
    // ...and that one property is the whole operator-list difference.
    expect(offeredOperators(countryLabel))
      .toEqual([...offeredOperators(currencyIso), 'isNull', 'isNotNull']);
  });

  // Every operator the dropdown offers must have a predicate in the table the column
  // dispatches to, or applying it silently degrades to `matchesCondition`'s "no handler →
  // match everything" fallback: the user picks an operator and the filter does nothing.
  it('is evaluable for every operator it offers, on every column', () => {
    for (const col of buildAccountFilterColumns(ui)) {
      const table = TABLE_BY_MODE[resolveFilterMode(col)];
      for (const op of offeredOperators(col)) {
        expect(typeof table[op], `${col.key}: ${op} must have a predicate`).toBe('function');
      }
    }
  });
});

// The mode is still worth pinning on its own: it is what `tableFor` in advancedFilterApply
// dispatches on, so it decides the EVALUATION as well as the dropdown. Two bugs live here —
// País in `text` mode had no picker at all, and a Saldo that drifted out of `numeric` would
// silently compare amounts as strings again.
describe('buildAccountFilterColumns — resolved filter mode', () => {
  const modeOf = (key) => resolveFilterMode(columnsByKey()[key]);

  // `enumLabel` is what gets a column `DistinctEnumPicker`: a checkbox list seeded from the
  // loaded rows, with its own search box. `text` mode has no picker at all — only a free-text
  // box, which is exactly the País bug.
  it.each(['currencyIso', 'countryLabel'])('resolves %s to enumLabel, so it gets a picker', (key) => {
    expect(modeOf(key)).toBe('enumLabel');
  });

  it('keeps Moneda and País out of text mode, whose only widget is a free-text box', () => {
    expect(modeOf('currencyIso')).not.toBe('text');
    expect(modeOf('countryLabel')).not.toBe('text');
  });

  // No column in this spec resolves to `identifier` any more. Asserted rather than assumed
  // because the projection guard further down is scoped by MODE: if a column silently moved
  // back to `identifier` the guard must still cover it, and if the guard were ever narrowed
  // back to identifier-only it would cover nothing at all.
  it('has no identifier columns left, so the projection guard must not be scoped to that mode', () => {
    const modes = buildAccountFilterColumns(ui).map((c) => resolveFilterMode(c));
    expect(modes).not.toContain('identifier');
    expect(modes.filter((m) => m === 'enumLabel')).toHaveLength(3);
  });

  // The contrast, pinned: the two genuinely free-text columns must stay free text, and Saldo
  // must stay numeric (that is what dispatches `equals` to NUMBER_OPERATORS.numEquals).
  it('leaves the genuinely free-text columns in text mode', () => {
    expect(modeOf('name')).toBe('text');
    expect(modeOf('iban')).toBe('text');
  });

  it('keeps Saldo numeric and Tipo on its declared enum catalogue', () => {
    expect(modeOf('currentBalance')).toBe('numeric');
    expect(modeOf('type')).toBe('enumLabel');
  });

  it('resolves the mode of every offered column, with no column falling through by accident', () => {
    const modes = Object.fromEntries(
      buildAccountFilterColumns(ui).map((c) => [c.key, resolveFilterMode(c)]),
    );
    expect(modes).toEqual({
      name: 'text',
      type: 'enumLabel',
      iban: 'text',
      currencyIso: 'enumLabel',
      countryLabel: 'enumLabel',
      currentBalance: 'numeric',
    });
  });

  // Tipo, Moneda and País share a mode; Tipo alone brings a catalogue. That is the whole
  // reason `enum` WITHOUT `enumKeys` is a legitimate declaration here rather than an
  // oversight — the mode decides the widget, the catalogue only decides its labels.
  it('puts all three enum columns on one mode, differing only in the catalogue', () => {
    const byKey = columnsByKey();
    expect(modeOf('currencyIso')).toBe(modeOf('type'));
    expect(modeOf('countryLabel')).toBe(modeOf('type'));
    expect(byKey.type.enumLabels).toBeTruthy();
    expect(byKey.currencyIso.enumLabels).toBeUndefined();
    expect(byKey.countryLabel.enumLabels).toBeUndefined();
  });
});

describe('ACCOUNT_FILTER_COLUMNS', () => {
  // This is the metadata `applyConditions` dispatches on, so it must stay label-free
  // (buildable without a translator) and carry exactly one `type` per offered column.
  it('exposes one type entry per offered column, and nothing else', () => {
    expect(ACCOUNT_FILTER_COLUMNS).toEqual({
      name: { type: 'string' },
      type: { type: 'enum' },
      iban: { type: 'string' },
      currencyIso: { type: 'enum' },
      countryLabel: { type: 'enum' },
      currentBalance: { type: 'number' },
    });
  });

  // The evaluator reads this map through the same `resolveFilterMode`, so the label-free
  // metadata must resolve to the identical modes the translated column list does — a drift
  // here would have the UI offer the picker while the evaluator ran the wrong table.
  it('resolves to the same filter modes as the translated column list', () => {
    for (const col of buildAccountFilterColumns(ui)) {
      expect(resolveFilterMode(ACCOUNT_FILTER_COLUMNS[col.key]), col.key)
        .toBe(resolveFilterMode(col));
    }
    expect(resolveFilterMode(ACCOUNT_FILTER_COLUMNS.currencyIso)).toBe('enumLabel');
    expect(resolveFilterMode(ACCOUNT_FILTER_COLUMNS.countryLabel)).toBe('enumLabel');
  });

  it('agrees with the translated column list on both keys and types', () => {
    for (const col of buildAccountFilterColumns(ui)) {
      expect(ACCOUNT_FILTER_COLUMNS[col.key], col.key).toEqual({ type: col.type });
    }
  });
});

describe('withDerivedFields', () => {
  it('projects countryLabel from countryName when the server enriched it', () => {
    expect(withDerivedFields(ACCOUNTS[0]).countryLabel).toBe('España');
  });

  it('falls back to the ISO code when countryName is absent', () => {
    expect(withDerivedFields(ACCOUNTS[1]).countryLabel).toBe('PT');
    expect(withDerivedFields({ countryName: '', countryIso: 'ES' }).countryLabel).toBe('ES');
    expect(withDerivedFields({ countryName: null, countryIso: 'ES' }).countryLabel).toBe('ES');
  });

  it('projects an empty string when the account has no country at all', () => {
    expect(withDerivedFields(ACCOUNTS[2]).countryLabel).toBe('');
    expect(withDerivedFields({}).countryLabel).toBe('');
    expect(withDerivedFields({ countryName: '', countryIso: '' }).countryLabel).toBe('');
  });

  it('keeps every original property and does not mutate the input row', () => {
    const row = { ...ACCOUNTS[0] };
    const projected = withDerivedFields(row);

    expect(projected).toMatchObject({ id: 'a1', name: 'Cuenta de Banco', currencyIso: 'EUR' });
    expect(projected).not.toBe(row);
    expect(row.countryLabel).toBeUndefined();
  });
});

// The general form of the País "zero options" bug (ETP-5113), pinned at the unit level so
// any FUTURE column with a data-seeded picker inherits the guard.
//
// Scoped by MODE, and deliberately covering BOTH modes that get a data-seeded picker:
//   - `enumLabel`  → `DistinctEnumPicker.inMemoryCodes`      (Tipo, Moneda, País today)
//   - `identifier` → `IdentifierMultiPicker.inMemoryOptions` (none today)
// The two extract identically — `row[col.key]`, skip null/undefined/'' — so they break
// identically on a DERIVED key that the seed rows lack.
//
// Scoping this guard to `identifier` alone would be a silent hole, and now a total one:
// España's column moved `string` → `selector` → `enum`, so as of this spec there are NO
// identifier columns at all and an identifier-only guard would protect NOTHING while still
// looking green. It would also have missed a future derived ENUM column — precisely the
// `statusFamily` shape the Movimientos tab already shipped and had to fix (see
// MovementsTab.filterSourceRows.vitest.jsx: `movements.map(withDerivedFields)`).
//
// Today `countryLabel` is the only key that NEEDS the projection; the rest are real row
// properties and pass trivially. That is the intended state — the guard exists for the next
// derived column as much as for this one.
describe('data-seeded picker columns vs. the derived projection', () => {
  const SEEDED_MODES = new Set(['identifier', 'enumLabel']);
  const seededKeys = () => buildAccountFilterColumns(ui)
    .filter((col) => SEEDED_MODES.has(resolveFilterMode(col)))
    .map((col) => col.key);

  it('has data-seeded columns to guard in the first place', () => {
    expect(seededKeys()).toEqual(['type', 'currencyIso', 'countryLabel']);
  });

  // The self-check on the scoping. País is the only column here that depends on the
  // projection, so if it ever falls out of `seededKeys()` this whole block goes vacuous.
  it('still covers País, the one column that actually depends on the projection', () => {
    expect(seededKeys()).toContain('countryLabel');
    expect(seededKeys().length).toBeGreaterThan(0);
  });

  // The load-bearing assertion. Passes for `type` / `currencyIso` (real row properties the
  // projection carries through untouched) AND for `countryLabel` (which the projection adds)
  // — and would fail for a new data-seeded column the projection forgot.
  it('exposes every data-seeded key on a projected row, so the picker can read it', () => {
    for (const key of seededKeys()) {
      for (const account of ACCOUNTS) {
        expect(
          Object.hasOwn(withDerivedFields(account), key),
          `${key} must exist on the projected row or its picker offers nothing`,
        ).toBe(true);
      }
    }
  });

  // `undefined` is the shape that produced zero options; `''` is the legitimate "this account
  // has no value", which the picker skips on purpose rather than showing a blank entry.
  it('never leaves a data-seeded key undefined after the projection', () => {
    for (const key of seededKeys()) {
      for (const account of ACCOUNTS) {
        expect(withDerivedFields(account)[key], `${key} on ${account.id}`).not.toBeUndefined();
      }
    }
  });

  it('yields at least one non-empty option per data-seeded column', () => {
    for (const key of seededKeys()) {
      const options = ACCOUNTS
        .map((account) => withDerivedFields(account)[key])
        .filter((value) => value != null && value !== '');
      expect(options.length, `${key} would open with an empty picker`).toBeGreaterThan(0);
    }
  });

  // Spelling out which half of the contract each key depends on, so the asymmetry the bug
  // came from is documented rather than incidental: Moneda and Tipo worked all along, and
  // Moneda still does now that it is back on the enum picker.
  it('records that only countryLabel actually needs the projection', () => {
    const rawKeys = new Set(ACCOUNTS.flatMap((account) => Object.keys(account)));
    expect(rawKeys.has('type')).toBe(true);
    expect(rawKeys.has('currencyIso')).toBe(true);
    expect(rawKeys.has('countryLabel')).toBe(false);
  });
});

describe('applyAccountAdvancedFilter — identity', () => {
  it('returns the input array itself for a null/empty filter', () => {
    expect(applyAccountAdvancedFilter(ACCOUNTS, null)).toBe(ACCOUNTS);
    expect(applyAccountAdvancedFilter(ACCOUNTS, undefined)).toBe(ACCOUNTS);
    expect(applyAccountAdvancedFilter(ACCOUNTS, filter([]))).toBe(ACCOUNTS);
  });

  it('returns the input array itself when no condition is complete yet', () => {
    expect(applyAccountAdvancedFilter(ACCOUNTS, filter([{ field: 'name' }]))).toBe(ACCOUNTS);
    expect(applyAccountAdvancedFilter(ACCOUNTS, filter([{ operator: 'iContains', value: 'x' }])))
      .toBe(ACCOUNTS);
  });

  it('never projects the derived field onto the returned rows', () => {
    const out = applyAccountAdvancedFilter(ACCOUNTS, filter([
      { field: 'type', operator: 'equals', value: 'B' },
    ]));

    expect(ids(out)).toEqual(['a1']);
    expect(out[0]).toBe(ACCOUNTS[0]);
    expect(out[0].countryLabel).toBeUndefined();
  });
});

// The regression the ACCOUNT_FILTER_COLUMNS argument fixes. Saldo is declared `number`, so
// `equals` must dispatch to NUMBER_OPERATORS.numEquals — which rounds BOTH sides to the
// precision the user typed (min. 2 decimals, the scale amounts are rendered at) — instead of
// OPERATORS.equals, which compares the two sides as strings.
describe('applyAccountAdvancedFilter — numeric equality on currentBalance', () => {
  const typedEquals = (value) => applyAccountAdvancedFilter(
    ACCOUNTS, filter([{ field: 'currentBalance', operator: 'equals', value }]),
  );

  it('matches a stored 1646.4867 against the displayed "1646.49"', () => {
    expect(ids(typedEquals('1646.49'))).toEqual(['a1']);
  });

  it('matches the same value typed with es-ES separators ("1.646,49")', () => {
    expect(ids(typedEquals('1.646,49'))).toEqual(['a1']);
  });

  // Same input through the pre-ETP-5113 call — no column metadata, so `equals` lands on the
  // string table and "1646.4867" !== "1646.49". This is the bug, spelled out.
  it('is exactly what the string-table path got wrong', () => {
    const conditions = filter([{ field: 'currentBalance', operator: 'equals', value: '1646.49' }]);

    expect(ids(applyConditions(ACCOUNTS, conditions, withDerivedFields))).toEqual([]);
    expect(ids(applyAccountAdvancedFilter(ACCOUNTS, conditions))).toEqual(['a1']);
  });

  it('honours a precision the user typed beyond two decimals', () => {
    expect(ids(typedEquals('1646.4867'))).toEqual(['a1']);
    // Four typed decimals compare at four decimals, so the rounded display value no longer matches.
    expect(ids(typedEquals('1646.4900'))).toEqual([]);
  });

  it('matches a numeric zero balance without treating it as empty', () => {
    expect(ids(typedEquals(0))).toEqual(['a3']);
    expect(ids(typedEquals('0'))).toEqual(['a3']);
  });

  it('inverts cleanly through notEqual', () => {
    const out = applyAccountAdvancedFilter(ACCOUNTS, filter([
      { field: 'currentBalance', operator: 'notEqual', value: '1646.49' },
    ]));
    expect(ids(out)).toEqual(['a2', 'a3']);
  });

  it('compares numerically for the ordering operators too', () => {
    expect(ids(applyAccountAdvancedFilter(ACCOUNTS, filter([
      { field: 'currentBalance', operator: 'greaterThan', value: 0 },
    ])))).toEqual(['a1']);
    expect(ids(applyAccountAdvancedFilter(ACCOUNTS, filter([
      { field: 'currentBalance', operator: 'lessThan', value: 0 },
    ])))).toEqual(['a2']);
    expect(ids(applyAccountAdvancedFilter(ACCOUNTS, filter([
      { field: 'currentBalance', operator: 'greaterOrEqual', value: 0 },
    ])))).toEqual(['a1', 'a3']);
  });

  it('supports a numeric between range', () => {
    const out = applyAccountAdvancedFilter(ACCOUNTS, filter([
      { field: 'currentBalance', operator: 'between', value: ['0', '2000'] },
    ]));
    expect(ids(out)).toEqual(['a1', 'a3']);
  });
});

describe('applyAccountAdvancedFilter — currency (Moneda)', () => {
  // Moneda is `enum` + `required`, so the funnel offers it exactly "Es" / "No es"; the two
  // value shapes below are both reachable and both must evaluate.
  //
  // A scalar is what an older single-code preset carries (and what the AccountsHeaderTable
  // stub emits); `DistinctEnumPicker` itself calls `onChange` with an ARRAY, since the
  // multi-select checkbox popover that replaced `inSet` means "Es" with several values IS
  // "is any of". (`getValueShape` still classifies enumLabel `equals` as 'scalar' — that
  // governs only whether the value survives an operator switch, not what the picker emits.)
  // The generic OPERATORS.equals accepts both, so neither shape regresses across the
  // enum → selector → enum round trip this column made.
  it('filters by a single ISO code', () => {
    expect(ids(applyAccountAdvancedFilter(ACCOUNTS, filter([
      { field: 'currencyIso', operator: 'equals', value: 'USD' },
    ])))).toEqual(['a3']);
  });

  it('filters by an array of ISO codes', () => {
    expect(ids(applyAccountAdvancedFilter(ACCOUNTS, filter([
      { field: 'currencyIso', operator: 'equals', value: ['EUR', 'USD'] },
    ])))).toEqual(['a1', 'a2', 'a3']);
    expect(ids(applyAccountAdvancedFilter(ACCOUNTS, filter([
      { field: 'currencyIso', operator: 'equals', value: ['USD'] },
    ])))).toEqual(['a3']);
  });

  it('is case-insensitive on the code', () => {
    expect(ids(applyAccountAdvancedFilter(ACCOUNTS, filter([
      { field: 'currencyIso', operator: 'equals', value: 'eur' },
    ])))).toEqual(['a1', 'a2']);
  });

  it('excludes the selected codes through notEqual', () => {
    expect(ids(applyAccountAdvancedFilter(ACCOUNTS, filter([
      { field: 'currencyIso', operator: 'notEqual', value: ['EUR'] },
    ])))).toEqual(['a3']);
    expect(ids(applyAccountAdvancedFilter(ACCOUNTS, filter([
      { field: 'currencyIso', operator: 'notEqual', value: ['EUR', 'USD'] },
    ])))).toEqual([]);
  });

  // The funnel no longer OFFERS the text operators for Moneda (see `offered operators`), but
  // a preset saved while it was briefly `selector` can still carry one, and
  // `getOperatorsForColumn` re-appends an unknown `currentOperator` so such a condition is
  // still editable. The evaluator must therefore keep answering it rather than falling
  // through to the "no handler → match everything" branch, which would silently widen a
  // saved filter to the whole list.
  it('still evaluates a stale text-operator condition from an older preset', () => {
    expect(ids(applyAccountAdvancedFilter(ACCOUNTS, filter([
      { field: 'currencyIso', operator: 'iContains', value: 'us' },
    ])))).toEqual(['a3']);
    expect(ids(applyAccountAdvancedFilter(ACCOUNTS, filter([
      { field: 'currencyIso', operator: 'iStartsWith', value: 'e' },
    ])))).toEqual(['a1', 'a2']);
    // Emphatically NOT every row, which is what a missing predicate would return.
    expect(ids(applyAccountAdvancedFilter(ACCOUNTS, filter([
      { field: 'currencyIso', operator: 'iContains', value: 'zzz' },
    ])))).toEqual([]);
  });
});

describe('applyAccountAdvancedFilter — iban', () => {
  it('matches a fragment case-insensitively', () => {
    expect(ids(applyAccountAdvancedFilter(ACCOUNTS, filter([
      { field: 'iban', operator: 'iContains', value: 'es12' },
    ])))).toEqual(['a1']);
    expect(ids(applyAccountAdvancedFilter(ACCOUNTS, filter([
      { field: 'iban', operator: 'iContains', value: '0532' },
    ])))).toEqual(['a3']);
  });

  it('never matches the account that has no IBAN', () => {
    expect(ids(applyAccountAdvancedFilter(ACCOUNTS, filter([
      { field: 'iban', operator: 'iContains', value: 'e' },
    ])))).not.toContain('a2');
  });

  it('finds the accounts with no IBAN through the empty check', () => {
    expect(ids(applyAccountAdvancedFilter(ACCOUNTS, filter([
      { field: 'iban', operator: 'isNull', value: null },
    ])))).toEqual(['a2']);
  });
});

describe('applyAccountAdvancedFilter — countryLabel (País)', () => {
  // País is `enum` and NOT `required`, so the funnel offers it exactly four operators:
  // equals / notEqual (the DistinctEnumPicker checkbox list, emitting an ARRAY of the country
  // names actually present) plus isNull / isNotNull. All four are exercised below.
  it('matches the enriched country name', () => {
    expect(ids(applyAccountAdvancedFilter(ACCOUNTS, filter([
      { field: 'countryLabel', operator: 'equals', value: ['España'] },
    ])))).toEqual(['a1']);
  });

  it('matches a country picked from the multi-picker (equals with an array)', () => {
    expect(ids(applyAccountAdvancedFilter(ACCOUNTS, filter([
      { field: 'countryLabel', operator: 'equals', value: ['España'] },
    ])))).toEqual(['a1']);
    expect(ids(applyAccountAdvancedFilter(ACCOUNTS, filter([
      { field: 'countryLabel', operator: 'equals', value: ['España', 'PT'] },
    ])))).toEqual(['a1', 'a2']);
    // The account with no country is never swept in by a picked value.
    expect(ids(applyAccountAdvancedFilter(ACCOUNTS, filter([
      { field: 'countryLabel', operator: 'equals', value: ['España', 'PT'] },
    ])))).not.toContain('a3');
  });

  it('excludes the picked countries through notEqual with an array', () => {
    expect(ids(applyAccountAdvancedFilter(ACCOUNTS, filter([
      { field: 'countryLabel', operator: 'notEqual', value: ['España'] },
    ])))).toEqual(['a2', 'a3']);
    expect(ids(applyAccountAdvancedFilter(ACCOUNTS, filter([
      { field: 'countryLabel', operator: 'notEqual', value: ['España', 'PT'] },
    ])))).toEqual(['a3']);
  });

  // The row that only carries the ISO code: filtering on `countryName` alone would disagree
  // with the text the grid shows for it. `equals` rather than `iEquals` because enumLabel
  // mode offers only the former, and its scalar form is the same case-insensitive comparison.
  it('matches the ISO-code fallback row', () => {
    expect(ids(applyAccountAdvancedFilter(ACCOUNTS, filter([
      { field: 'countryLabel', operator: 'equals', value: 'pt' },
    ])))).toEqual(['a2']);
    expect(ids(applyAccountAdvancedFilter(ACCOUNTS, filter([
      { field: 'countryLabel', operator: 'equals', value: ['pt'] },
    ])))).toEqual(['a2']);
  });

  // Same treatment Moneda gets: the funnel no longer offers País the text operators, but a
  // preset saved while it was `string` or `selector` can still carry one, and
  // `getOperatorsForColumn` re-appends an unknown `currentOperator` so the condition stays
  // editable. The evaluator must keep answering it rather than widening the filter to
  // everything through the missing-handler fallback.
  it('still evaluates a stale text-operator condition from an older preset', () => {
    expect(ids(applyAccountAdvancedFilter(ACCOUNTS, filter([
      { field: 'countryLabel', operator: 'iContains', value: 'esp' },
    ])))).toEqual(['a1']);
    expect(ids(applyAccountAdvancedFilter(ACCOUNTS, filter([
      { field: 'countryLabel', operator: 'iStartsWith', value: 'P' },
    ])))).toEqual(['a2']);
    expect(ids(applyAccountAdvancedFilter(ACCOUNTS, filter([
      { field: 'countryLabel', operator: 'iNotContains', value: 'esp' },
    ])))).toEqual(['a2', 'a3']);
  });

  // The reason País is NOT `required` even though Country is AD-mandatory since ETP-4896:
  // 248 of 448 active accounts instance-wide still have `c_country_id IS NULL`, so "Está
  // vacío" is how a user finds the accounts that need fixing. `withDerivedFields` collapses a
  // missing country to '', which `isBlank` reads as empty — so the operator works on the
  // projection, which is what this asserts. Marking the column `required` would delete both
  // operators and this test with them.
  it('finds the account with no country through the empty check', () => {
    expect(ids(applyAccountAdvancedFilter(ACCOUNTS, filter([
      { field: 'countryLabel', operator: 'isNull', value: null },
    ])))).toEqual(['a3']);
    expect(ids(applyAccountAdvancedFilter(ACCOUNTS, filter([
      { field: 'countryLabel', operator: 'isNotNull', value: null },
    ])))).toEqual(['a1', 'a2']);
  });

  // Without the projection the field simply does not exist on the row, so nothing matches.
  it('is invisible to the evaluator when the projection is skipped', () => {
    const conditions = filter([{ field: 'countryLabel', operator: 'equals', value: ['PT'] }]);

    expect(ids(applyConditions(ACCOUNTS, conditions, undefined, ACCOUNT_FILTER_COLUMNS)))
      .toEqual([]);
    expect(ids(applyAccountAdvancedFilter(ACCOUNTS, conditions))).toEqual(['a2']);
  });
});

describe('applyAccountAdvancedFilter — name and type', () => {
  it('filters by type (enum equals)', () => {
    expect(ids(applyAccountAdvancedFilter(ACCOUNTS, filter([
      { field: 'type', operator: 'equals', value: 'B' },
    ])))).toEqual(['a1']);
  });

  it('filters by name (case-insensitive contains)', () => {
    expect(ids(applyAccountAdvancedFilter(ACCOUNTS, filter([
      { field: 'name', operator: 'iContains', value: 'caja' },
    ])))).toEqual(['a2']);
  });

  it('filters by name prefix', () => {
    expect(ids(applyAccountAdvancedFilter(ACCOUNTS, filter([
      { field: 'name', operator: 'iStartsWith', value: 'tarjeta' },
    ])))).toEqual(['a3']);
  });
});

describe('applyAccountAdvancedFilter — row operators', () => {
  it('requires every condition to match under "and"', () => {
    expect(ids(applyAccountAdvancedFilter(ACCOUNTS, filter([
      { field: 'currencyIso', operator: 'equals', value: 'EUR' },
      { field: 'currentBalance', operator: 'greaterThan', value: 0 },
    ])))).toEqual(['a1']);
  });

  it('requires only one condition to match under "or"', () => {
    expect(ids(applyAccountAdvancedFilter(ACCOUNTS, filter([
      { field: 'type', operator: 'equals', value: 'C' },
      { field: 'currencyIso', operator: 'equals', value: 'USD' },
    ], 'or')))).toEqual(['a2', 'a3']);
  });

  // A picked country (array value, enum table) AND a typed amount (numeric table) in one
  // tree: the two conditions must dispatch to different operator tables in the same pass.
  it('mixes a derived column with a numeric one under "and"', () => {
    expect(ids(applyAccountAdvancedFilter(ACCOUNTS, filter([
      { field: 'countryLabel', operator: 'equals', value: ['España'] },
      { field: 'currentBalance', operator: 'equals', value: '1.646,49' },
    ])))).toEqual(['a1']);
  });

  // The empty check on País composed with another condition — the combination a user reaches
  // for when fixing the pre-ETP-4896 accounts of one particular type.
  it('composes the País empty check with a type condition', () => {
    expect(ids(applyAccountAdvancedFilter(ACCOUNTS, filter([
      { field: 'countryLabel', operator: 'isNull', value: null },
      { field: 'type', operator: 'equals', value: 'CA' },
    ])))).toEqual(['a3']);
    expect(ids(applyAccountAdvancedFilter(ACCOUNTS, filter([
      { field: 'countryLabel', operator: 'isNull', value: null },
      { field: 'type', operator: 'equals', value: 'B' },
    ])))).toEqual([]);
  });

  it('returns nothing when the conditions disagree', () => {
    expect(ids(applyAccountAdvancedFilter(ACCOUNTS, filter([
      { field: 'type', operator: 'equals', value: 'C' },
      { field: 'currencyIso', operator: 'equals', value: 'USD' },
    ])))).toEqual([]);
  });

  it('handles an empty rows array', () => {
    expect(applyAccountAdvancedFilter([], filter([
      { field: 'name', operator: 'iContains', value: 'caja' },
    ]))).toEqual([]);
  });
});
