// Advanced ("by conditions") filter for the Accounts list — same generic
// AdvancedFilterBuilder + client-side evaluator used by the Movements and
// Imported Statements tabs. The builder only emits the condition tree; it has
// no evaluator of its own.
//
// Filter object shape (emitted by AdvancedFilterBuilder):
//   { rowOperator: 'and' | 'or', conditions: [{ field, operator, value }] }
//
// The offered columns mirror the visible grid ONE-FOR-ONE with a single
// deliberate exception: "Por conciliar" (`eTGOPendingCount`) is NOT filterable
// (ETP-5113). It is a reconciliation backlog counter rendered as a pill, not a
// property of the account, so filtering by it was dropped from the spec.
//
// Note that `key` is the ROW property, not the `decisions.json` field name —
// the two diverge: the field is `iBAN` while the row carries `iban`, and País
// has no flat property at all (see `withDerivedFields`).

import { applyConditions } from '@/windows/custom/financial-account/advancedFilterApply';
import { ACCOUNT_TYPE } from './tokens';

/** i18n keys for the `type` enum options, by account-type code. */
const TYPE_LABEL_KEYS = {
  [ACCOUNT_TYPE.BANK]: 'financeAccountsTypeBank',
  [ACCOUNT_TYPE.CASH]: 'financeAccountsTypeCash',
  [ACCOUNT_TYPE.CARD]: 'financeAccountsTypeCard',
};

/**
 * Filterable column spec, WITHOUT the translated labels.
 *
 * Kept label-free so the type metadata can be derived without a `ui`
 * translator: the client-side evaluator dispatches operators by declared type
 * (`ACCOUNT_FILTER_COLUMNS` below) and must be callable from plain modules and
 * tests. `buildAccountFilterColumns` decorates this with `ui()` labels.
 *
 * `required: true` drops the "Is empty" / "Is not empty" operators (see
 * getOperatorsForColumn in AdvancedFilterBuilder) for the columns AD makes
 * mandatory — they could only ever match zero rows. `countryLabel` is
 * deliberately NOT required despite Country being mandatory since ETP-4896:
 * accounts created before it can still have none, which is exactly what those
 * two operators are useful for. `iban` is genuinely optional (cash and card
 * accounts have none).
 *
 * Moneda and País are both `enum` → `enumLabel` mode, whose operator set is
 * `equals / notEqual / isNull / isNotNull`. Values come from `DistinctEnumPicker`,
 * seeded from the rows handed to the builder; neither declares `enumKeys` /
 * `enumLabels`, because `fillFallbackCodes` injects declared codes only when the
 * data produced none, so a catalogue would offer currencies or countries no
 * account holds. Each value is its own label.
 *
 * **Why no text operators on either.** `selector` (→ `identifier` mode) would add
 * "Contiene" / "No contiene" / "Empieza por". Both pickers already have their own
 * search box, so a text operator buys nothing a user cannot do inside the popover —
 * and for a three-character ISO code it invites nonsense ("contiene EU" matching
 * EUR). Reserve text mode for genuinely free prose, like the account `name`, where
 * a picker would list one option per row.
 *
 * **Why Moneda is `required` and País is not.** The flag is not cosmetic: it drops
 * `isNull` / `isNotNull`, so Moneda lands on exactly "Es" / "No es" while País keeps
 * "Está vacío" / "No está vacío". Currency is mandatory in AD, so those operators
 * could only ever match zero rows there. Country is NOT: accounts predating
 * ETP-4896 carry none (248 of 448 active accounts instance-wide at the time of
 * writing), and "Está vacío" is precisely how a user finds them to fix them. Note
 * the derived `countryLabel` collapses a missing country to `''`, which `isBlank`
 * reads as empty, so that operator works on the projection.
 *
 * Three wrong turns are recorded here on purpose, because all three shipped and the
 * user caught each one. `string` for País gave text mode, whose only widget is a
 * free-text box — it asked the user to type a country name exactly right with no
 * hint of which ones exist. Then `selector` for BOTH was over-applied consistency,
 * handing Moneda three text operators meaningless for a 3-char code. Then keeping
 * `selector` for País alone still left it with those same redundant text operators.
 */
const COLUMN_SPEC = [
  { key: 'name',           labelKey: 'financeAccountsColAccount',  type: 'string', required: true },
  // The grid shows Tipo and IBAN in ONE cell under a two-segment "Tipo & IBAN"
  // header, so they are offered here as two independent fields — the same split
  // the multiField decorator already makes for sorting.
  { key: 'type',           labelKey: 'financeAccountsColType',     type: 'enum', enumKeys: Object.keys(TYPE_LABEL_KEYS), required: true },
  { key: 'iban',           labelKey: 'financeAccountsColIban',     type: 'string' },
  { key: 'currencyIso',    labelKey: 'financeAccountsColCurrency', type: 'enum', required: true },
  { key: 'countryLabel',   labelKey: 'financeAccountsColCountry',  type: 'enum' },
  { key: 'currentBalance', labelKey: 'financeAccountsColBalance',  type: 'number', required: true },
];

/**
 * Column metadata the client-side evaluator needs, keyed by field: the declared
 * type, so `tableFor` dispatches numeric comparisons to NUMBER_OPERATORS
 * instead of collapsing every column onto the string table. Label-independent,
 * hence safe to build once at module load.
 */
export const ACCOUNT_FILTER_COLUMNS = Object.fromEntries(
  COLUMN_SPEC.map(({ key, type }) => [key, { type }]),
);

/** Resolves an enum column's `{ code: label }` map through the `ui` translator.
 *  Only Tipo has a declared catalogue; Moneda and País resolve theirs from the data. */
function enumLabelsFor(col, ui) {
  if (!col.enumKeys) return undefined;
  return Object.fromEntries(col.enumKeys.map((code) => [code, ui(TYPE_LABEL_KEYS[code] ?? code)]));
}

/**
 * Builds the filterable column metadata for the AdvancedFilterBuilder on the
 * accounts list, with labels/enum labels resolved through `ui`. Reuses the same
 * i18n keys as the table headers.
 */
export function buildAccountFilterColumns(ui) {
  return COLUMN_SPEC.map((col) => {
    const enumLabels = enumLabelsFor(col, ui);
    return {
      key: col.key,
      label: ui(col.labelKey),
      type: col.type,
      ...(enumLabels ? { enumLabels } : {}),
      ...(col.required ? { required: true } : {}),
    };
  });
}

/**
 * Adds the derived `countryLabel` the País column filters over.
 *
 * País has no flat row property: `CountryCell` paints
 * `countryName || countryIso`, so filtering on either one alone would disagree
 * with what the grid shows for the accounts that only have the fallback.
 */
export function withDerivedFields(account) {
  return { ...account, countryLabel: account.countryName || account.countryIso || '' };
}

/**
 * Filters the accounts array against an advanced-filter value object.
 * Delegates evaluation to the shared {@link applyConditions}, projecting each
 * account through {@link withDerivedFields} so the País column works, and
 * passing the column types so Saldo compares numerically.
 */
export function applyAccountAdvancedFilter(accounts, filter) {
  return applyConditions(accounts, filter, withDerivedFields, ACCOUNT_FILTER_COLUMNS);
}
