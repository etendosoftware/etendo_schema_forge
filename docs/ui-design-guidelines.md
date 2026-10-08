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

## Unreachable Detail Records (ETP-5034)

A detail route (`/:windowName/:recordId`) whose record cannot be loaded MUST render
`RecordUnavailable`, never a form.

**Why this is a rule and not a nicety.** NEO answers `GET /{entity}/{id}` for an id that does not
exist, an id the current role/organization cannot see, AND a malformed id with the **same**
`HTTP 200` + `{"response":{"data":[],"status":0}}` — there is no 403 and no 404 anywhere in
`NeoCrudHandler`'s read path (the MCP layer synthesizes its own 404 from this very shape; see
`McpToolRouterSupport.buildNotFoundError`, IMP-5). So an empty answer is indistinguishable from a
"nothing to show" success, and code that treats it as a record silently renders a blank form that
reads as the creation form — the user believes they are editing a record while being one Save
away from creating a junk one, and a permissions problem looks like an empty record.

- The hook layer owns the detection: `useEntity.fetchById` sets `recordError`
  (`null` | `'notFound'` | `'error'`) and leaves `selected`/`editing` at `null`. Never resurrect the
  old `payload?.response?.data?.[0] ?? payload` shape — the `??` hands the envelope on as the record.
  **This applies to EVERY reader of that endpoint, not just `fetchById`**: `refreshHeaderTotals`,
  `discardChangesAndReload` and `refreshRecordVersion` all use `extractSingleRow` and treat an empty
  answer as "nothing to apply", because a record can stop being visible mid-session and reinjecting
  the envelope there is the same bug through a quieter door.
- `fetchById` is sequenced (`fetchByIdSeqRef`), and `handleSelect`/`handleNew` bump the same
  counter. Once an empty answer produces a VISIBLE error instead of just ending a spinner, a
  late response from an abandoned navigation would paint "record not available" over a record that
  is loading fine. Any future read that can render an error state needs the same guard.
- The copy says **record**, never "document": `DetailView` is shared with master-data windows
  (product, warehouse, tax, price-list, business-partner) where "document" is simply wrong.
- The view layer owns the guard: `isRecordUnavailableForRoute(hook, isNew, recordId)`
  (`detailViewHelpers.jsx`). It returns `false` for `isNew`, so the creation route is never diverted.
- `DetailView` applies both, so every generated window is covered. **A window that bypasses
  `DetailView` (currently only `financial-account`) must carry its own copy of the guard.**
- Only **two** variants exist — `notFound` and `error` — on purpose. Do not add a "no permissions"
  screen: the backend does not distinguish it, so that screen would be a guess presented as a fact.
  `recordNotFoundBody` states both possibilities in one sentence instead.

---

## Attachments Upload Dropzone (ETP-5526)

`components/attachments/UploadDropzone.jsx` is aligned to the Figma component **"Drag"**. Its
three states and the value each one reads:

| State | Border | Fill | Helper text |
|---|---|---|---|
| default | gray/200 `#D1D4DB` → `border-[hsl(var(--field-disabled-border))]` | none | gray/500 → `text-muted-foreground` |
| hover | gray/400 `#828FA3` → `hover:border-[#828FA3]` | black/50 @ 5% → `hover:bg-[rgba(18,18,23,0.05)]` | unchanged — gray/500 |
| disabled | `#D1D4DB` → `border-[hsl(var(--field-disabled-border))]` | `#F5F7F9` → `bg-[hsl(var(--field-hover))]` | gray/400 → `text-[#828FA3]` |

Transition between default and hover: `transition-colors duration-200 ease-in`. Border: 1px
dashed, radius 8px (`rounded-lg`). Container padding `py-5`, children `gap-2`.

Three things worth keeping in mind before touching another dropzone:

- **`border-border` is not gray/200.** The generic token resolves to `--border-subtle` `#E1E7EF`,
  noticeably lighter than the design. `#D1D4DB` lives in the palette exactly once, as
  `--field-disabled-border` (the design's `color/border/input/disabled`), and gray/200 is the same
  colour — read that token. Do **not** redefine `--border` to reach it: it paints the whole app.
- **`#F5F7F9` is `--field-hover`**, which `<Input>`, `<Select>` and `<DateField>` already reuse as
  their disabled fill. Both tokens adapt in dark mode; `#828FA3` and the 5% black have no token and
  stay literals, matching the core date/calendar chrome.
- **A disabled state is a fill plus a border, not `opacity-50` on the container.** The blanket
  opacity is what made the dropzone's helper text unreadable on completed documents.

Only this dropzone has been migrated. The other dashed dropzones (`ImageField`, `OcrSidePanel`,
`CertSection`, `ImportStatementModal`, …) still carry their own colours.

### The "browse" control is a deliberate divergence from the design

The helper sentence is `attachmentsOr` + a button labelled `attachmentsBrowse` + `attachmentsAllowedFormats`.
**The Figma component paints all three the same flat `color/gray/500` (#6C6C89), with no underline
and no link treatment.** We do not follow it: the button carries `text-primary underline
underline-offset-2` — the app's existing inline-text-link convention (`ApiKeysPage`,
`OAuth2ClientDialog`, `DocumentTotalsPanel`, `ReversedInvoicesPanel`), reusing the `--primary`
palette token rather than a literal.

This is an intentional product override, not drift. QA found the control invisible in practice: it
is the only clickable thing in the sentence and, at the design's value, it is indistinguishable
from the static text on either side. **Do not "restore" the flat grey** — if the override is ever
reversed, it is a product decision, not a design-fidelity fix.

When the zone is disabled the button drops both the accent colour and the underline and inherits
the sentence's gray/400, so a dead control never reads as an active link. It still gets no
`disabled:opacity-50`: the whole sentence is already uniformly dimmed, and a 50% veil on one word
would single the button out.

## References

- Component implementations: `tools/app-shell/src/components/contract-ui/`
- Layout: `tools/app-shell/src/layout/`
- Custom window components: `artifacts/{window}/custom/`
