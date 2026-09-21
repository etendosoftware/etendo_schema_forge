# i18n Guide — Internationalization in Etendo Go Frontend

**Status:** Active
**Applies to:** All React components in `tools/app-shell/src/` and `artifacts/*/custom/`

## Why This Matters

The app will be used primarily in Spanish by real clients. Every user-visible string MUST be translated. Hardcoded English strings are treated as bugs.

## Architecture

```
tools/app-shell/src/
  locales/
    en_US.json          ← English dictionary
    es_ES.json          ← Spanish dictionary (MUST mirror en_US structure)
  i18n/
    LocaleProvider.jsx  ← React context provider
    useUI.js            ← Hook for generic UI labels
    useLabel.js         ← Hook for AD field labels (column-based)
    useMenuLabel.js     ← Hook for menu/tab/window names
    resolveLabel.js     ← Pure function for field labels (no React)
    resolveUI.js        ← Pure function for UI labels (no React)
```

## Locale JSON Structure

Each locale file has these top-level sections:

| Section | Purpose | Example key |
|---------|---------|-------------|
| `fields` | AD column labels (auto-extracted from Etendo) | `"C_BPartner_ID": { "label": "Business Partner", "description": "..." }` |
| `windows` | Window display names and button labels | `"Sales Order": { "label": "Pedido de Venta", "newLabel": "Nuevo pedido" }` |
| `tabs` | Tab display names | `"Order Line": { "label": "Línea de pedido" }` |
| `menus` | Menu group labels | `"Currency": { "label": "Moneda" }` |
| `ui` | UI element labels (structured) | `"Absences": { "label": "Ausencias" }` |
| `genericLabels` | Flat key-value for all custom UI strings | `"save": "Guardar"` |
| `statuses` | Document status translations | `"CO": { "label": "Completed" }` |

## Hooks — When to Use Each

### `useUI()` — Generic UI strings (most common)

For any user-visible string in custom components: buttons, labels, messages, tooltips, placeholders, table headers, toast messages.

```jsx
import { useUI } from '@/i18n';

function MyComponent() {
  const ui = useUI();

  return (
    <div>
      <button>{ui('save')}</button>
      <span>{ui('loading')}</span>
      <p>{ui('noResults')}</p>
    </div>
  );
}
```

**With interpolation** (use `{paramName}` in the translation string):

```jsx
// en_US.json: "linkedToInvoice": "Linked to Invoice #{number}"
// es_ES.json: "linkedToInvoice": "Vinculado a la factura #{number}"
ui('linkedToInvoice', { number: invoice.documentNo })
```

### `useLabel()` — AD field labels

For column/field labels that come from the Etendo Application Dictionary. Supports per-window label overrides from `decisions.json`.

```jsx
import { useLabel } from '@/i18n';

function MyForm({ spec }) {
  const t = useLabel(spec?.window?.labelOverrides);

  return <label>{t('C_BPartner_ID') || 'Business Partner'}</label>;
  //              ↑ returns null if not found, so provide fallback
}
```

### `useMenuLabel()` — Menu, tab, and window names

For translating names of menus, tabs, windows, and process buttons. Searches across multiple dictionary sections: `ui → menus → windows → tabs → genericLabels → raw key`.

```jsx
import { useMenuLabel } from '@/i18n';

function MyTabs({ tabs }) {
  const tMenu = useMenuLabel();

  return tabs.map(tab => (
    <span key={tab.key}>{tMenu(tab.label)}</span>
  ));
}
```

#### `{ field }` option — read a specific field from `windows[key]`

Pass `{ field }` to read any field other than `label` directly from the `windows` section, bypassing the cascade. Returns `null` (not the raw key) when the entry or field is missing.

```jsx
const tMenu = useMenuLabel();

// Resolves windows['Sales Order'].newLabel → "Nuevo pedido" (es_ES)
// Falls back to null if 'newLabel' is not defined for that window
const buttonLabel = tMenu(entityLabel, { field: 'newLabel' }) ?? ui('newRecord');
```

**`newLabel`** is the supported field for the contextual "New" button label in `ListView`. Add it to the `windows` section of both locale files for each window that needs a specific label:

```json
// es_ES.json → windows
"Sales Order": { "label": "Pedido de venta", "newLabel": "Nuevo pedido" },
"Sales Invoice": { "label": "Factura (Cliente)", "newLabel": "Nueva factura" }

// en_US.json → windows
"Sales Order": { "label": "Sales Order", "newLabel": "New order" },
"Sales Invoice": { "label": "Sales Invoice", "newLabel": "New invoice" }
```

Windows without a `newLabel` entry fall back to the generic `ui('newRecord')` key (`"Nuevo"` / `"New"`).

### Pure functions (non-React contexts)

For use outside React components (tests, utilities):

```js
import { resolveUI } from '@/i18n';
import { resolveLabel } from '@/i18n';

const label = resolveUI(dictionary, 'save');           // "Save" or "Guardar"
const field = resolveLabel(dictionary, 'C_BPartner_ID'); // "Business Partner"
```

### Errors thrown from a plain module (carry the key, translate at the boundary)

A module with no dictionary in scope — a parser, a validator, anything in
`app-shell-core/lib/` — must NOT swallow the problem into an English sentence and call it
done. Attach the locale key and its params to the error and let the component that owns
`translate` resolve it; keep the English text on `message` so existing callers, tests and a
missing locale entry all still read something sensible instead of a raw key.

```js
// thrower (plain module)
throw new ImportParseError(`Duplicate column header: "${header}"`, {
  messageKey: 'importErrorDuplicateHeader',
  params: { header },
});

// boundary (the component that holds `translate`)
const localize = (key, fallback, params) => {
  if (typeof translate !== 'function') return fallback;
  const translated = translate(key, params);
  return translated && translated !== key ? translated : fallback;   // ui() echoes unknown keys
};
const message = error.messageKey
  ? localize(error.messageKey, error.message, error.params)
  : error.message;
```

Reference implementation: `parseDelimited.js` / `parseXlsx.js` → `ImportDialog.jsx` (ETP-5223).
The same posture, without the error object, is what `validateRows.js` and `importEngine.js`
already use for their row-level messages.

**A user-visible string that is built from a count or a value is not exempt.** The two
end-of-import toasts (`"N records imported successfully"`) survived four i18n passes purely
because they were template literals rather than a `DEFAULT_LABELS` entry — a template literal
is invisible to every "find the hardcoded label" review. Grep for `` toast.success(` `` and
`` toast.info(` `` before calling a flow translated.

## Rules for Adding New Translations

### 1. NEVER hardcode user-visible strings

```jsx
// ❌ WRONG
<button>Save</button>
<th>Invoice #</th>
<span>Loading...</span>
toast.error('Select at least one invoice');

// ✅ CORRECT
<button>{ui('save')}</button>
<th>{ui('invoiceNumber')}</th>
<span>{ui('loading')}</span>
toast.error(ui('selectAtLeastOneInvoice'));
```

### 2. ALWAYS add keys to BOTH locale files

When adding a new key to `genericLabels` in `en_US.json`, you MUST also add the Spanish translation to `es_ES.json` at the same position.

```json
// en_US.json → genericLabels
"myNewLabel": "My new label",

// es_ES.json → genericLabels
"myNewLabel": "Mi nueva etiqueta",
```

### 3. Use camelCase for genericLabels keys

```json
// ❌ WRONG
"my-new-label": "..."
"My New Label": "..."
"MY_NEW_LABEL": "..."

// ✅ CORRECT
"myNewLabel": "..."
"selectBusinessPartner": "..."
"noResultsFound": "..."
```

### 4. Keep keys semantic, not positional

```json
// ❌ WRONG — tied to where it appears
"headerButton1": "Save"
"modalTitle": "Confirm"

// ✅ CORRECT — describes what it says
"save": "Save"
"confirmAction": "Confirm"
```

### 5. Reuse existing keys before creating new ones

Before adding a new key, check if an equivalent already exists in `genericLabels`. Common keys already available:

- `save`, `cancel`, `delete`, `edit`, `refresh`, `loading`, `noResults`
- `process`, `print`, `preview`, `send`, `clear`, `add`
- `description`, `amount`, `date`, `account`, `method`
- `subtotal`, `tax`, `total`, `discount`
- `documentStatus`, `notes`, `docs`

### 6. Module-level constants that contain labels must move inside the component

If field definitions or tab configs contain user-visible labels and are declared at module scope, move them inside the component body so they have access to `ui()`:

```jsx
// ❌ WRONG — module scope, no access to ui()
const TABS = [
  { key: 'tax', label: 'Tax' },
];

// ✅ CORRECT — inside component, uses ui()
function MyPage() {
  const ui = useUI();
  const tabs = [
    { key: 'tax', label: ui('tax') },
  ];
}
```

### 7. Interpolation over concatenation

```jsx
// ❌ WRONG
ui('order') + ' #' + order.documentNo

// ✅ CORRECT
ui('orderDoc', { number: order.documentNo })
// en_US: "orderDoc": "Order #{number}"
// es_ES: "orderDoc": "Pedido #{number}"
```

## What Goes Where (Decision Tree)

```
Is it an AD column label (C_BPartner_ID, DocumentNo, etc.)?
  → YES: It's already in `fields` section. Use useLabel().
  → NO: ↓

Is it a menu name, tab name, or window title?
  → YES: Use useMenuLabel() — it searches menus/windows/tabs/ui sections.
  → NO: ↓

Is it a custom UI string (button, message, placeholder, etc.)?
  → YES: Add to `genericLabels` in BOTH locale files. Use useUI().
```

## Backend Error Translation (`backendErrors.js`)

Some validation errors are raised server-side (Etendo Java handlers, `AD_MESSAGE` catalog) and only
exist in English — there is no `AD_MESSAGE_TRL` for `com.etendoerp.go` (not a translation-pack
module). `tools/app-shell/src/lib/backendErrors.js` translates these raw backend strings into the
active locale before they reach a `toast.error(...)`. It exposes a single entry point:

```js
import { translateBackendError } from '@/lib/backendErrors.js';

toast.error(translateBackendError(result.message, ui) || ui('actionFailed'));
```

`t` is normally `useUI()`'s `ui` function — the resulting keys live as flat `backendError.*` entries
inside `genericLabels` (e.g. `"backendError.countryIban"`), following the same "add to BOTH locale
files" rule as any other `genericLabels` key.

Three matching mechanisms coexist — know all three before adding a new backend-error translation:

1. **Exact-match (`BACKEND_ERROR_MAP`)** — the default and simplest case. A dictionary keyed by the
   literal backend string (trimmed), mapping to a `backendError.*` i18n key. Use this whenever the
   backend message is a fixed string with no embedded dynamic value (e.g. `MatchRuleHandler`,
   `PriceListHeaderHandler` validation messages).
2. **Parameterized matchers (ETP-4706, ETP-4831)** — for backend messages that embed a dynamic value
   (e.g. a Business Partner name, a document number) inside an otherwise-fixed skeleton, so they
   can't be looked up by exact string. Plain string slicing (`startsWith`/`endsWith`/`indexOf`/`slice`
   around fixed delimiters) extracts the dynamic parts — deliberately **not** a regex, since the
   captured values are user-influenced data and a backtracking-prone pattern over them is a SonarQube
   ReDoS/DoS hotspot (`javascript:S5852`); linear-time slicing has no backtracking surface at all.
   `t(key, { param: captured })` then re-interpolates the extracted parts through the frontend's own
   i18n, the same way `ui('linkedToInvoice', { number })` would. See `matchAccountNotFound` (ETP-4706,
   Account-not-found enrichment), `matchInvoiceLineAlreadyInvoiced` (ETP-4831,
   `ETGO_InvoiceLineAlreadyInvoiced`), and `matchFieldTooLong` (ETP-4984, the Hibernate
   `StringPropertyValidator` "Value too long" message → `backendError.fieldTooLong`) in
   `backendErrors.js` for the pattern: order matters — try the more specific matcher before the more
   general one, and add a code comment linking the matcher back to the server-side `AD_MESSAGE` entry
   (or, for `matchFieldTooLong`, the core validator) it mirrors. Note `matchFieldTooLong` is
   deliberately repo-wide — it fires for this backend message on any entity/field, not just the window
   that first added the field-level `maxLength` prevention (see `docs/generated-custom-windows/assets.md`
   § ETP-4984 for the paired client-side cap).

3. **Message-key matching (`BACKEND_ERROR_KEY_MAP`, ETP-5316)** — for a message that cannot be
   matched by its text *by construction*, because the backend assembled it from AD_MESSAGE tokens
   plus run-time data. A core document-action failure is the reference case: `M_INOUT_POST` raises
   `'@Inline@ '||v_Message_Qty||' @ProductNotNullAndMovementQtyZero@'`, which reaches the browser
   as *"En la línea 10, 20, 30, 40, Cuando el producto no esta vacío entonces la cantidad movida no
   debe ser cero."* — a different string for every document, and the numbers in it are **AD line
   numbers** (`C_OrderLine.line`, numbered in tens), not the row positions the user sees, so they
   locate nothing. Neither an exact entry nor a matcher can help.

   `NeoProcessService.translatePInstanceResult` therefore also returns `messageKeys`: the AD_MESSAGE
   search keys it extracted from the raw message **before** `safeParseTranslation` replaced them
   with prose (`["Inline", "ProductNotNullAndMovementQtyZero"]`). The SPA maps a key to a
   `backendError.*` entry and authors the whole sentence itself — dropping the line reference
   entirely, which is what product decided for ETP-5316. Keys are matched in order and the first
   recognised one wins, so structural tokens like `@Inline@`/`@Inlines@` are simply skipped.

   Plumbing: `extractBackendMessageKeys(payload)` (same module) is the only place that knows the
   wire shape; `useDocumentAction` exposes the result as `err.messageKeys`, `useNeoAction` as
   `result.messageKeys`, and the caller passes it on as the third argument:

   ```js
   toast.error(translateBackendError(result.message, ui, { messageKeys: result.messageKeys })
     || ui('actionFailed'));
   ```

   **Degradation is the point, not a shim.** `com.etendoerp.go` and this repo deploy separately, so
   a frontend running against a backend that predates the field is the normal steady state for a
   while. No keys → `translateBackendError` skips this mechanism entirely and behaves exactly as it
   did before, showing the backend's own sentence.

   Add a key here only when it identifies a failure the user can act on. Use the AD_MESSAGE search
   key **verbatim** — several are lowercase-initial in the catalog (`lockedProduct`,
   `productWithoutAttributeSet`) and "normalizing" them silently breaks the match. One key can cover
   several windows for free: `productWithoutAttributeSet` is raised under the same name by
   `M_INOUT_POST`, `M_MOVEMENT_POST`, `M_INVENTORY_POST` and `M_INTERNAL_CONSUMPTION_POST1`, so the
   locale string must be worded generically ("hay líneas…"), not per document type.

`translateBackendError` tries the message keys first (they are a stable identity; the text is not),
then the exact-match map, then the parameterized matchers, and returns the original (untranslated)
message if none matches — never throws and never silently swallows an unrecognized backend error.

**Multi-line messages (ETP-5109).** Some backends accumulate several result messages into one
newline-joined buffer before returning it — `SaltEdgeAccountLinkHelper.fetchAccountTransactions`
appends its max-fetch-interval warning immediately before the connection-inactive one, so two
individually translatable messages arrive as a single string that matches no skeleton as a whole.
When the message as a whole resolves to nothing and contains a newline, `translateBackendError`
retries **line by line**: every line that matches is translated, every line that does not is kept
verbatim, and if no line resolves the original message is returned untouched. A new matcher gets
this for free — it needs no awareness of the multi-line case.

**Two traps when writing the locale string:**

1. **`useUI` interpolation is not global.** It is `text.replace(`{${p}}`, params[p])`
   (`app-shell-core/src/i18n/useUI.js`), and `String.replace` with a *string* pattern substitutes
   only the FIRST occurrence. A literal that mentions the same placeholder twice renders the second
   one as raw `{param}` in the UI. Reword so each placeholder appears once
   (see `backendError.psd2ImportDateBeyondMaxInterval`, whose English original repeats its `%0`).
2. **A backend template written with `%s` never interpolates.** `OBMessageUtils.getI18NMessage`
   substitutes `%0` only, so an `AD_MESSAGE` authored with `%s` reaches the user with the literal
   `%s` in it. That makes the string constant, i.e. an exact-match entry rather than a matcher —
   `PSD2_NoActiveConnectionForAccount` is the live example.

**When NOT to use `backendErrors.js`: prefer a structured code (ETP-5179).** This module exists to
rescue messages that already arrive as English text and that we cannot change — Core validators, the
`AD_MESSAGE` catalog of a third-party module. It is a *recovery* mechanism, not the pattern to reach
for in new code. When the backend is ours (the Etendo GO bridge handlers), have it return a
**machine-readable code** and let the SPA own the wording: the `GET accounts` action of
`FinancialAccountBankConnectionHandler` answers HTTP 200 with `{accounts: [], emptyReason:
'currencyMismatch', accountCurrency: 'USD'}`, and `useBankConnectionFlow` maps the code to
`financeAccountsBankConnectionNoAccountsCurrency` with `{ currency }`. Nothing passes through
`translateBackendError`, because nothing English ever crosses the wire. Both traps above disappear
with it — the SPA authors the placeholder, so there is no `%s` that never interpolates and no
duplicated `{param}` inherited from a Core string — and the code is stable under rewording, unlike
an English literal that silently un-translates its own toast the day someone edits it. Rule of
thumb: **new** Etendo GO endpoint → return a code; message you inherited as English prose →
`backendErrors.js`; message raised by **core** where Etendo GO is only the courier → have the
courier forward the AD_MESSAGE key (mechanism 3 above) and treat that key as the code. The last one
is the same principle, not an exception to it: the identity crosses the wire, the wording does not.

## Shared RelatedDocuments Components

The `tools/app-shell/src/components/related-documents/` library provides i18n-ready building blocks:

```jsx
import { DocChip, RelatedDocumentsShell, STATUS_KEYS, CHIP_COLORS, formatAmount, fetchByCriteria } from '@/components/related-documents';
```

- `DocChip` — renders a document chip with translated status via `statusLabel` prop
- `RelatedDocumentsShell` — handles loading state with translated "Loading..." text
- `STATUS_KEYS` — maps status codes to genericLabels keys for translation
- Use `ui(STATUS_KEYS[statusCode])` to get translated status labels

## Testing

i18n contract tests exist at `tools/app-shell/src/i18n/__tests__/`:
- `es_ES-contract.test.js` — verifies es_ES mirrors en_US structure
- `es_ES-structure.test.js` — structural validation
- `useLabel.test.js`, `useMenuLabel.test.js` — hook behavior tests

Run with `make test`.
