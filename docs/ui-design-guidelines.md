# UI Design Guidelines — app-shell

Conventions for building UI components inside `tools/app-shell/src/`. These rules apply to all developers writing shared components, custom window components, and layout elements.

---

## Z-Index Elevation Scale

Use this scale for all z-index decisions. Do not use arbitrary values outside these tiers.

| Level | Value | Purpose | Examples |
|-------|-------|---------|---------|
| **Base** | `auto` | Normal document flow | Table rows, form fields, page sections |
| **Surface** | `z-10` | Sticky or relative-positioned overlays | Page-level loading overlays, image layering |
| **Floating** | `z-20` | Small local floating elements | `UserAvatarButton` dropdown, inline tooltips |
| **Sticky** | `z-30` | Sticky table headers, fixed section bars | Table headers in scroll containers |
| **Navigation** | `z-40` | App-level navigation chrome | **Sidebar**, bottom navigation bar |
| **Overlay** | `z-50` | Full-screen blocking overlays and modals | **Modals** (`NewPaymentModal`, `ReportViewerPage` modals), **Drawers** (`ProductSearchDrawer`, `ReportDrawer`) |
| **Dropdown-in-modal** | `z-60` | Dropdowns or menus that appear inside a modal | `Select`, `Combobox`, popovers rendered inside a `z-50` modal |
| **Global tools** | `z-70` | App-wide tools always accessible — one level above the max modal tier | `CommandPalette`, **Toasts (Sonner)**, `CopilotWidget` |

### Rules

1. **Sidebar is always below modals.** Sidebar = `z-40`. Full-screen overlay = `z-50`. This ensures the overlay covers the sidebar.
2. **Dropdowns inside modals must use `z-60`.** A `Select` or `Combobox` inside a modal at `z-50` will be clipped if its dropdown is also `z-50`. Always use `z-60` (or `z-[60]`) for list popups rendered inside an overlay.
3. **Do not use raw `zIndex` in inline styles** unless you are outside Tailwind's scale (e.g., `zIndex: 1000` in DataTable inline combo — must be refactored to `z-[1000]` and documented).
4. **Global tools must always float above everything.** Toasts, the command palette, and the Copilot widget must stay one level above the highest modal tier (`z-60` + 1 = `z-70`). Use `z-70`. Never use arbitrary large values like `9999`.
5. **Never use arbitrary z-index values (`9999`, `1000`, etc.).** Always pick the next step in the scale. If nothing needs to be above it, `z-50` is enough. If a dropdown needs to sit above a modal, use `z-60`. If a global tool needs to sit above everything, use `z-70`.
6. **Never reuse `z-50` for navigation.** Navigation elements that should be permanently visible must stay at `z-40` or below so they can be covered by blocking overlays.

---

## Scrim Opacity Scale

All full-screen blocking overlays darken the background with a `bg-black/XX` scrim. Only two values are allowed:

| Class | Alpha | Purpose | Examples |
|-------|-------|---------|----------|
| **`bg-black/30`** | 30% | Default scrim for drawers and modals | `DocumentPrintDrawer`, `ProductSearchDrawer`, `ReportDrawer`, `SendDocumentModal`, `NewPaymentModal`, shadcn `dialog`/`sheet` |
| **`bg-black/40`** | 40% | Destructive / critical confirmations only | Delete confirmation modals (`PriceListProductPrices`) |

Do not introduce new opacity values (`bg-black/20`, `/50`, `/60`, `/70`, `/80`). If you need more emphasis than `/30`, it is a destructive action — use `/40` and keep the panel copy explicit ("This action cannot be undone").

**Exception:** `bg-black/50` and `bg-black/70` are allowed **only** for button overlays rendered on top of an image (e.g., the close button on a thumbnail in `ImageField`). They are not scrims and are not subject to this rule.

---

## Overlay / Modal Pattern

All full-screen blocking overlays must follow this structure:

```jsx
{/* Scrim — covers the whole screen including sidebar */}
<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
  {/* Panel — stops click propagation so it doesn't close the modal */}
  <div className="bg-white rounded-xl shadow-lg ..." onClick={e => e.stopPropagation()}>
    {/* content */}
  </div>
</div>
```

- **`fixed inset-0`** — covers the entire viewport.
- **`bg-black/30`** — standard scrim opacity. Use `bg-black/40` for destructive confirmations (see Scrim Opacity Scale above).
- **`onClick={onClose}` on the scrim** — always allow click-outside-to-close.
- **`e.stopPropagation()` on the panel** — prevents the scrim click handler from firing.

---

## Drawer Pattern

Drawers use the same z-level as modals — scrim and panel both at `z-50`:

```jsx
{/* Scrim */}
<div className="fixed inset-0 z-50 bg-black/30" onClick={onClose} />
{/* Panel */}
<div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh]" onClick={onClose}>
  <div className="bg-white rounded-xl ..." onClick={e => e.stopPropagation()}>
    {/* content */}
  </div>
</div>
```

Both at `z-50` because the Sidebar is `z-40` and both scrim and panel need to cover it.

---

## Known Violations (to fix)

| File | Line | Issue |
|------|------|-------|
| `DataTable.jsx` | ~101, ~109 | Inline `zIndex: 1000` — should use `z-[1000]` Tailwind class or be refactored to `z-60` |
| `EntityForm.jsx` | ~218, ~233, ~238 | Dropdowns inside forms use `z-50` — fails if form is ever rendered inside a `z-50` modal |
| `ListView.jsx` | ~274 | Sort popover uses `z-50` — acceptable today (outside modal), keep under review |
| `DetailView.jsx` | ~867 | Kebab menu uses `z-50` — acceptable today |

---

## Monetary Amount Formatting

All monetary amounts displayed in the app must use the shared formatting utilities. Never use bare `toLocaleString()` for money, and never hardcode a currency code.

### Two utilities — different contexts

| Utility | Import path | When to use |
|---------|-------------|-------------|
| `formatCurrency(currencyCode, value)` | `@/lib/formatCurrency` | Custom window components (sidebars, bottom panels, topbar, modals). The org currency comes from `useCurrency()` or from the document record. |
| `formatDashboardAmount(value, currencyLabel, locale)` | `@/lib/dashboardNumberFormat` | Dashboard widgets (`KPIHeader`, `FinancialTrendChart`, `TopClientsList`, etc.) that receive a `currencyLabel` string from the widget endpoint response. |

These utilities are **not interchangeable**. Custom window components always know the org currency as an ISO 4217 code and must use `formatCurrency`. Dashboard components receive a free-form label from the backend and must use `formatDashboardAmount`.

### Standard pattern for custom window components

```jsx
import { useCurrency } from '@/hooks/useCurrency';
import { formatCurrency } from '@/lib/formatCurrency';

// Context: component without a document record (sidebar, KPI card, modal)
export default function MyComponent({ recordId, apiBaseUrl }) {
  const orgCurrency = useCurrency() ?? 'USD';

  return (
    <span>{formatCurrency(orgCurrency, someAmountValue)}</span>
  );
}
```

```jsx
// Context: component with a document record (topbar, bottom panel)
// The document's own currency takes precedence over the org default.
const currency = data['currency$_identifier'] || 'USD';

return (
  <span>{formatCurrency(currency, data.grandTotalAmount)}</span>
);
```

`useCurrency()` returns `null` while the session is being resolved on first load. Always coalesce with `?? 'USD'` so that `formatCurrency` always receives a valid string.

### Currency in the product selector (`ProductSearchDrawer`)

`ProductSearchDrawer` resolves currency through `selectorContext.currency`, which is injected by `DetailView` from the active document record (`currency$_identifier`). This means the product prices shown in the drawer always reflect the document's currency, not a hardcoded value.

**Cascade used by the drawer:**
1. `selectorContext.currency` — document currency, forwarded by `DetailView`
2. `useCurrency()` — org session currency (fallback when no document is loaded)
3. `.toFixed(2)` — raw number only if no currency is available at all

When triggering the drawer from a custom component (outside of DetailView), pass the document currency explicitly:
```jsx
<ProductSearchDrawer
  selectorContext={{ currency: documentCurrency, ...otherContext }}
  ...
/>
```

### `CurrencyProvider` placement

`CurrencyProvider` must wrap the app routes inside `<AuthProvider>`. It fetches the org currency once via the `/sws/neo/session` endpoint as soon as a token is available.

```jsx
<AuthProvider>
  <CurrencyProvider>
    <AppRoutes />
  </CurrencyProvider>
</AuthProvider>
```

Do not instantiate `CurrencyProvider` inside individual window components — one instance at the root is sufficient.

### What NOT to do

```jsx
// BAD: hardcoded currency code
value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

// BAD: bare toLocaleString without currency symbol
amount.toLocaleString();

// BAD: using formatDashboardAmount in a custom window component
// (it accepts a free-form label, not an ISO code, and has different formatting rules)
formatDashboardAmount(amount, 'USD', 'en-US');
```

### Symbol placement rules (handled automatically by `formatCurrency`)

`formatCurrency` follows standard symbol placement per currency:
- Symbol **before** the amount by default: `$1,234.50`, `$99.00`
- Symbol **after** the amount with a space for: EUR, SEK, NOK, DKK, CZK, HUF, PLN — e.g. `1,234.50 €`

Callers never need to know these rules — they just pass the ISO 4217 code.

---

## Typography

**The typeface is declared once and inherited. A component must not declare a `font-family` of its own.**

The design system names its family in exactly one place — the `body` rule in the core's
`packages/app-shell-core/src/styles.css`:

```css
body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
```

There is no `--font-sans` token and no `theme.fontFamily` in the core's `tailwind-preset.js`, so
**inheritance is the whole mechanism**. Nothing re-establishes Inter further down the tree.

### Rules

- **Declare no `font-family`.** Let the element inherit. This holds inside React portals too: every
  portal in the app mounts on `document.body`, so a portalled modal or drawer inherits normally.
- **Never lead a stack with a system family** (`system-ui`, `-apple-system`, `BlinkMacSystemFont`,
  `'Segoe UI'`, `ui-sans-serif`, `sans-serif`). Naming them as *fallbacks* after `'Inter'` is fine —
  that is the design system's own stack.
- **Avoid the `font-sans` Tailwind class.** The preset does not override `theme.fontFamily`, so
  `font-sans` resolves to Tailwind's default stack — i.e. it takes the element *off* Inter. It is
  currently unused in the app; keep it that way.
- **Align digits with `tabular-nums`, not a monospace font.** Same rule the reports follow
  (ETP-5013) — it keeps the typeface and only changes the numeric variant.
- Content that renders **outside** the app's `body` — a PDF stylesheet, a `window.open()`
  document — cannot inherit and must name its own stack, leading with `'Inter'`. See
  `windows/custom/shared/documentPdf.js` for the reference stack.

### Why it matters

A single inline `fontFamily` silently takes a whole subtree off the design system: no error, no
clue beyond slightly different letterforms. ETP-5108 was exactly that — both document-confirmation
modals declared `fontFamily: 'system-ui, -apple-system, sans-serif'` on their shell, so the title,
the generated-document card and the buttons all rendered in the visitor's OS sans. It was reported
as mixed typography inside the card, because the document number's digit widths are where a
non-Inter sans shows itself first.

`tools/app-shell/test/no-system-font-stack.test.js` enforces the second rule across
`tools/app-shell/src/` and `artifacts/*/custom/`, with a documented exception map for the
render-outside-body cases.

---

## Column Alignment in Tables

- **`type: 'amount'`** columns → `text-right` on cells and footer totals, `text-left` on headers.
- All other column types → `text-left` on both headers and cells.
- **Rule:** headers are always left-aligned. Only cell content or input alignment may follow the data type.

See `DataTable.jsx` for the reference implementation.

---

## References

- Component implementations: `tools/app-shell/src/components/contract-ui/`
- Layout: `tools/app-shell/src/layout/`
- Custom window components: `artifacts/{window}/custom/`
