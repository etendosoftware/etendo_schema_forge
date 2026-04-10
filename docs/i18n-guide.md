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
| `windows` | Window display names | `"Sales Order": { "label": "Pedido de Venta" }` |
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

### Pure functions (non-React contexts)

For use outside React components (tests, utilities):

```js
import { resolveUI } from '@/i18n';
import { resolveLabel } from '@/i18n';

const label = resolveUI(dictionary, 'save');           // "Save" or "Guardar"
const field = resolveLabel(dictionary, 'C_BPartner_ID'); // "Business Partner"
```

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
