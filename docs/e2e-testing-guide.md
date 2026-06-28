# E2E Testing Guide

This guide explains how to write automated end-to-end tests for Schema Forge UI windows. There are three ways to create tests, from easiest to most hands-on:

1. **Record** — You record the flow in a browser, Claude turns it into a proper test
2. **Discover + Automate** — Explore with agent-browser, then write Playwright tests
3. **Manual** — Write tests from scratch using known selectors

## Prerequisites

```bash
make install-e2e    # Install Playwright + Chromium (one-time)
npm install -g agent-browser && agent-browser install   # Optional: install agent-browser
```

## Quick Reference

| Command | Purpose |
|---------|---------|
| `make dev` | Start dev server (http://localhost:3100) |
| `make test-e2e` | Run all E2E tests with visible browser |
| `make test-e2e-headless` | Run headless (CI mode) |
| `make test-e2e-debug` | Step-by-step debug mode |
| `make test-e2e-ui` | Interactive Playwright UI |
| `make test-e2e-report` | View last HTML test report |
| `make test-e2e-record` | Open recorder — you click, it generates code |

---

## Etendo GO Contextual Selector Smoke

`e2e/tests/flows/etendogo-contextual-selectors.integration.spec.js` validates the non-MCP Etendo GO integration risk for contextual FK selectors. It is skipped by default because it requires a live Etendo backend, a loaded F&B dataset, and a JWT-capable test user.

Run it explicitly against local Etendo:

```bash
cd e2e
ETENDO_URL=http://localhost:8080/etendo npm run test:etendogo-contextual-selectors
```

The smoke gets a read JWT through `scripts/neo-token-groupadmin.sh` unless `E2E_ETENDOGO_JWT` is already set. It verifies that generated selector identifiers work at runtime for the highest-risk document contexts:

- sales/purchase partner address from selected business partner;
- sales/purchase price list from `isSOTrx`;
- sales/purchase tax from transaction side plus date;
- goods receipt/shipment partner address from selected business partner.

If this smoke fails because generated field-name selector URLs return `404 Field not found or not included`, track it under [ETP-4058](https://etendoproject.atlassian.net/browse/ETP-4058). That bug is intentionally separate from the integration-test scope: the test detects the runtime/generator contract mismatch, but the fix belongs to the Etendo GO / Schema Forge selector URL compatibility task.

---

## Deployed MCP OAuth2 Smoke

`e2e/tests/flows/mcp-oauth-pkce.smoke.spec.js` validates the public MCP/OAuth integration after deploy. It models the browser flow started by `opencode mcp auth etendo`: clean session, OAuth authorize URL, login, requested permissions, explicit authorization, local callback, and PKCE token exchange. The UI preserves the original `/authorize?...` URL through onboarding with a local-only `returnTo` parameter, then resumes the authorization screen after environment login. It is skipped by default because it targets a deployed environment, uses real smoke credentials, can create an OAuth client through DCR, and binds a local callback server.

Run it explicitly:

```bash
cd e2e
npm run test:mcp-oauth-smoke
```

Before running, export or otherwise provide `E2E_MCP_OAUTH_SMOKE=1`, `E2E_MCP_SMOKE_USER`, `E2E_MCP_SMOKE_PASSWORD`, and `E2E_MCP_OAUTH_CLIENT_ID` in the shell or CI environment.

Use DCR instead of a pre-created client when the environment allows dynamic registration:

```bash
cd e2e
npm run test:mcp-oauth-smoke
```

For DCR, provide `E2E_MCP_OAUTH_SMOKE=1`, `E2E_MCP_SMOKE_USER`, `E2E_MCP_SMOKE_PASSWORD`, and `E2E_MCP_OAUTH_ENABLE_DCR=1` in the shell or CI environment.

If DCR creates the client but `/etendo/oauth2/authorize` returns `invalid_scope`, the environment is not granting the requested MCP scopes to dynamically registered clients. In that case, create a client from the OAuth2 Clients administration page with a System Administrator role, enable `neo:read`, `neo:write`, `neo:process`, `neo:report`, and `neo:*`, then pass its id through `E2E_MCP_OAUTH_CLIENT_ID`.

Configuration variables:

| Variable | Default | Purpose |
|----------|---------|---------|
| `E2E_MCP_PUBLIC_BASE_URL` | `https://go.experimental.etendo.cloud` | Public viewer origin used for discovery checks |
| `E2E_MCP_RESOURCE` | `${E2E_MCP_PUBLIC_BASE_URL}/mcp` | Expected protected resource value |
| `E2E_MCP_ENDPOINT` | `${E2E_MCP_PUBLIC_BASE_URL}/mcp` | MCP endpoint used for the WAF/method smoke |
| `E2E_MCP_OAUTH_AUTHORIZE_URL` | `${E2E_MCP_PUBLIC_BASE_URL}/etendo/oauth2/authorize` | Backend authorization endpoint |
| `E2E_MCP_OAUTH_TOKEN_URL` | `${E2E_MCP_PUBLIC_BASE_URL}/etendo/oauth2/token` | Token endpoint for the PKCE exchange |
| `E2E_MCP_OAUTH_REGISTRATION_URL` | `${E2E_MCP_PUBLIC_BASE_URL}/etendo/oauth2/register` | DCR endpoint |
| `E2E_MCP_OAUTH_SCOPES` | `neo:read neo:write neo:process neo:report neo:*` | Requested MCP scopes |
| `E2E_MCP_OAUTH_CLIENT_ID` | none | Existing OAuth client ID |
| `E2E_MCP_OAUTH_CLIENT_SECRET` | none | Optional client secret |
| `E2E_MCP_OAUTH_TOKEN_AUTH_METHOD` | `client_secret_post` | Use `client_secret_basic`, `client_secret_post`, or `none` |
| `E2E_MCP_OAUTH_ENABLE_DCR` | `0` | Set to `1` to create a client dynamically |
| `E2E_MCP_OAUTH_DCR_INITIAL_ACCESS_TOKEN` | none | Optional bearer token for protected DCR |
| `E2E_MCP_OAUTH_REDIRECT_URI` | local random port | Fixed callback URI when the client requires one; must use `127.0.0.1`, `localhost`, or `[::1]`, include an explicit port, and use the callback path registered for the client |

The smoke performs these checks:

1. `/.well-known/oauth-authorization-server` returns JSON with public HTTPS URLs.
2. `/.well-known/oauth-protected-resource` returns JSON with the expected MCP resource.
3. `POST /mcp` is not blocked by CloudFront/WAF as a method-level `403`.
4. An unauthenticated authorization request does not resolve to only the Vite/PWA shell.
5. The user reaches the standard login flow, logs in, returns to OAuth with the original parameters, sees the requested permissions prompt, explicitly authorizes access, receives `code` and `state`, and exchanges the code for an `access_token` with PKCE.

The app service worker must not serve `index.html` for backend or metadata navigations. `tools/app-shell/vite.config.js` keeps `/etendo/*`, `/mcp`, and `/.well-known/*` in the Workbox navigation fallback denylist while leaving `/authorize` as a SPA route.

After deploying a service worker or routing change, invalidate CloudFront for `/sw.js`, `/registerSW.js`, `/index.html`, and `/assets/*`. For one local browser session, close and reopen the browser or unregister the existing service worker before retrying MCP authorization.

---

## Method 1: Record a Flow (Recommended for new tests)

The fastest way to create a test. You interact with the app in a real browser, and Playwright records every action as code. Then Claude takes that recording and turns it into a proper test with assertions and validations.

### How it works

```
1. You: "I want a test for creating a goods receipt"
2. Claude: runs make test-e2e-record
3. You: interact with the browser (login, navigate, click, fill forms)
4. You: close the browser when done
5. Claude: reads the recorded code from e2e/recordings/
6. Claude: transforms it into a proper test with:
   - login() + switchContext() helpers
   - Role-based selectors (getByRole) instead of brittle CSS
   - Assertions and validations for each step
   - Error handling and proper structure
7. You: review and approve
```

### Step by step

**1. Start the dev server** (keep it running):
```bash
make dev
```

**2. Start the recorder:**
```bash
make test-e2e-record
```

This opens two windows:
- A **browser** where you perform actions normally
- A **Playwright Inspector** panel showing the generated code in real time

**3. Perform the flow:**
- Log in (admin/admin)
- Switch role/org if needed
- Navigate to the window
- Do what you want to test (create a record, search, edit, delete, etc.)
- Close the browser when done

**4. The recorded code** is saved to `e2e/recordings/recorded-flow.spec.js`. It looks something like this:

```js
// Raw recording — Claude will clean this up
import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  await page.goto('http://localhost:3100/');
  await page.getByRole('textbox', { name: 'Username' }).fill('admin');
  await page.getByRole('textbox', { name: 'Password' }).fill('admin');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.goto('http://localhost:3100/purchase-order');
  await page.getByRole('button', { name: 'New Order' }).click();
  // ... more actions
});
```

**5. Give it to Claude** — say something like:
> "Here's my recording for goods receipt creation. Turn it into a proper test that validates the form fields load, the save works, and check the record appears in the list."

Claude will:
- Replace hardcoded URLs with `navigateTo()`
- Add `login()` with proper role/org context
- Add `expect()` assertions for every important step
- Handle edge cases (waits, timeouts, disabled fields)
- Save it in the right location (`e2e/tests/flows/`)

### Tips for recording

- **Do the happy path first** — record the simplest successful flow, then Claude adds edge cases
- **Don't worry about being perfect** — the recording is a starting point, not the final test
- **Pause and think** — the recorder captures everything; if you make a mistake, just redo it (Claude will clean up duplicates)
- **Record one flow at a time** — it's easier to manage than one giant recording

---

## Method 2: Discover with agent-browser + Automate

## Test Structure

```
e2e/
├── playwright.config.js              # Config (visible browser by default)
├── tests/
│   ├── helpers/
│   │   ├── auth.js                   # login(), switchContext(), navigateTo()
│   │   └── selectors.js             # Shared UI selectors (discovered, not guessed)
│   ├── smoke.spec.js                 # Verify windows load without JS errors
│   └── flows/
│       ├── navigation.spec.js        # Dashboard, sidebar, routing
│       ├── sales-order-crud.spec.js  # Sales Order list + form
│       ├── purchase-order-create.spec.js  # Purchase Order with role/org context
│       ├── invoice-preview-modal.spec.js      # GenericPreviewModal lifecycle (mock mode)
│       └── invoice-preview-persistence.spec.js # File persistence: GET/POST/DELETE (mock mode)
```

### Discover with agent-browser

[agent-browser](https://agent-browser.dev/) is a Rust CLI for browser automation designed for AI agents. It outputs a compact accessibility tree where each element gets a unique ref (`@e1`, `@e2`). This output maps directly to Playwright's `getByRole()` selectors.

### Installation

```bash
npm install -g agent-browser
agent-browser install              # Downloads Chrome
```

### Discovery session walkthrough

The goal is to navigate the UI, find actual selectors, and understand the flow before writing any test code.

#### 1. Login

```bash
agent-browser open http://localhost:3100
agent-browser snapshot -i
# → textbox "Username" [ref=e2]
# → textbox "Password" [ref=e3]
# → button "Sign in" [ref=e4]

agent-browser fill @e2 "admin"
agent-browser fill @e3 "admin"
agent-browser click @e4
agent-browser wait 2000
```

#### 2. Switch role and organization

```bash
# The Etendo logo is always visible — clicking it opens the context popover
agent-browser snapshot -i
# → button "Etendo" [ref=e2] (or the logo button)

# Expand sidebar to see org name
agent-browser click @e3    # sidebar toggle
agent-browser wait 300
agent-browser snapshot -i
# → button "*" [ref=e2]  ← this shows current org name

# Click it to open context switcher
agent-browser click @e2
agent-browser wait 500
agent-browser snapshot -i
# → combobox [ref=e2]: System Administrator
#   - option "F&B International Group Admin" [ref=e35]
# → combobox [ref=e3]: *
#   - option "F&B España - Región Norte" [ref=e53]
# → button "Apply" [ref=e4]

agent-browser select @e2 "F&B International Group Admin"
agent-browser wait 300
agent-browser select @e3 "F&B España - Región Norte"
agent-browser wait 300
agent-browser click @e4    # Apply
agent-browser wait 1000
```

#### 3. Navigate to a window

```bash
agent-browser open http://localhost:3100/purchase-order
agent-browser wait 2000
agent-browser snapshot -i
# → heading "Orders" [level=1, ref=e24]
# → button "New Order" [ref=e37]
# → columnheader "Transaction Document" [ref=e566]
# → columnheader "Business Partner" [ref=e569]
# → cell "Bebidas Alegres, S.L." [ref=e44]
# → cell "España Región Norte" [ref=e45]
```

#### 4. Explore the form

```bash
agent-browser click @e37   # "New Order"
agent-browser wait 2000
agent-browser snapshot -i
# → heading "New Order" [level=1]
# → textbox "Transaction Document*" [required, ref=e40]
# → textbox "Business Partner*" [required, ref=e41]
# → combobox "Partner Address*" [disabled, ref=e35]
# → button "Save" [ref=e33]
# → button "Save draft" [ref=e32]
# → button "Cancel" [ref=e30]
# → button "Order Line 0" [ref=e36]
# → button "+ Add Order Line" [ref=e38]
```

#### 5. Take a screenshot

```bash
agent-browser screenshot artifacts/e2e-report/discovery-purchase-order.png
```

#### 6. Close

```bash
agent-browser close
```

### Key commands reference

| Command | Purpose |
|---------|---------|
| `agent-browser open <url>` | Navigate to URL |
| `agent-browser snapshot -i` | Accessibility tree with refs (**main discovery tool**) |
| `agent-browser screenshot <path>` | Visual screenshot |
| `agent-browser click @eN` | Click element by ref |
| `agent-browser fill @eN "text"` | Clear and fill input |
| `agent-browser type @eN "text"` | Type into element (append) |
| `agent-browser select @eN "value"` | Select dropdown option |
| `agent-browser press Enter` | Press a key |
| `agent-browser get url` | Get current URL |
| `agent-browser get text @eN` | Get text content |
| `agent-browser wait 2000` | Wait N milliseconds |
| `agent-browser eval "js"` | Run JavaScript in page |
| `agent-browser network requests` | See API calls |
| `agent-browser close` | Close browser |

### Discovery checklist

For each window, discover and document:

- [ ] **Navigation** — URL path, menu item location
- [ ] **List view** — heading text, column headers, row structure
- [ ] **Search/filter** — search input, filter buttons
- [ ] **New button** — button text ("New Order", "New Record", etc.)
- [ ] **Form fields** — all inputs with names, types (textbox/combobox/spinbutton), required flag
- [ ] **Field dependencies** — e.g., Partner Address disabled until Business Partner selected
- [ ] **Save/Cancel** — button texts and disambiguation (Save vs Save draft → use `exact: true`)
- [ ] **Tabs** — child entity tabs (e.g., "Order Line 0", "Others")
- [ ] **Child table** — column headers, "Add" button

### Write the Playwright test

### Translating agent-browser output to Playwright

The accessibility tree from `snapshot -i` maps directly to Playwright's role-based locators:

| agent-browser output | Playwright equivalent |
|---|---|
| `button "New Order" [ref=e37]` | `page.getByRole('button', { name: 'New Order' })` |
| `textbox "Business Partner*" [required]` | `page.getByRole('textbox', { name: /Business Partner/ })` |
| `combobox "Warehouse*" [expanded=false]` | `page.getByRole('combobox', { name: /Warehouse/ })` |
| `heading "Orders" [level=1]` | `page.getByRole('heading', { name: 'Orders', level: 1 })` |
| `columnheader "Product"` | `page.getByRole('columnheader', { name: 'Product' })` |
| `cell "Draft"` | `page.getByRole('cell', { name: 'Draft' })` |

### Handling ambiguous selectors

When `snapshot -i` shows two elements with similar names (e.g., "Save" and "Save draft"), use `exact: true`:

```js
// agent-browser shows:
//   button "Save draft" [ref=e32]
//   button "Save" [ref=e33]

// Wrong — matches both:
page.getByRole('button', { name: 'Save' })

// Correct — matches only "Save":
page.getByRole('button', { name: 'Save', exact: true })
```

### Test template

```js
import { test, expect } from '@playwright/test';
import { login, navigateTo } from '../helpers/auth.js';

test.describe('Window Name', () => {

  test.beforeEach(async ({ page }) => {
    // login() switches to Group Admin + España Norte by default
    await login(page);
    await navigateTo(page, 'window-slug');
  });

  test('list view loads with correct columns', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Window Title', level: 1 })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Column Name' })).toBeVisible();
  });

  test('can open new record form', async ({ page }) => {
    await page.getByRole('button', { name: 'New Record' }).click();
    await expect(page.getByRole('heading', { name: 'New Record' })).toBeVisible();
    // Check fields discovered via agent-browser
    await expect(page.getByRole('textbox', { name: /Field Name/ })).toBeVisible();
  });

  test('cancel returns to list', async ({ page }) => {
    await page.getByRole('button', { name: 'New Record' }).click();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('heading', { name: 'Window Title', level: 1 })).toBeVisible();
  });
});
```

### Update selectors.js

After discovering a new window, add its selectors to `e2e/tests/helpers/selectors.js`:

```js
export const myWindowList = {
  heading: { role: 'heading', name: 'Window Title', level: 1 },
  newButton: { role: 'button', name: 'New Record' },
  columns: {
    name: { role: 'columnheader', name: 'Name' },
    status: { role: 'columnheader', name: 'Status' },
  },
};
```

Then use the `byRole()` helper in tests:

```js
import { myWindowList, byRole } from '../helpers/selectors.js';

await expect(byRole(page, myWindowList.heading)).toBeVisible();
```

## Role and Organization Context

All tests run with **F&B International Group Admin** role and **F&B España - Región Norte** organization. This is configured in `e2e/tests/helpers/auth.js`:

```js
export const DEFAULT_ROLE = 'F&B International Group Admin';
export const DEFAULT_ORG = 'F&B España - Región Norte';
```

The `login()` function calls `switchContext()` automatically. To override for a specific test:

```js
await login(page, {
  role: 'F&B España, S.A - Sales',
  org: 'F&B España - Región Sur',
});
```

## Writing a New Test: Step by Step

1. **Start the dev server** — `make dev` (keep it running)
2. **Discover** — Use `agent-browser` to navigate, find selectors, understand the flow
3. **Create test file** — `e2e/tests/flows/{window-name}.spec.js`
4. **Update selectors** — Add discovered selectors to `selectors.js`
5. **Write tests** — Translate the agent-browser session into Playwright assertions
6. **Run** — `make test-e2e` (visible browser) or `make test-e2e-debug` (step by step)
7. **Fix failures** — Check screenshots in `e2e/test-results/`, re-discover if needed

## Alternative: Chrome DevTools MCP

If `agent-browser` is not available, Chrome DevTools MCP tools provide equivalent functionality:

| agent-browser | Chrome DevTools MCP |
|---|---|
| `agent-browser open <url>` | `navigate_page` |
| `agent-browser snapshot -i` | `take_snapshot` |
| `agent-browser screenshot <path>` | `take_screenshot` |
| `agent-browser click @eN` | `click` (with CSS selector) |
| `agent-browser fill @eN "text"` | `fill` (with CSS selector) |
| `agent-browser eval "js"` | `evaluate_script` |
| `agent-browser network requests` | `list_network_requests` |

**Prefer agent-browser** when available — it uses fewer tokens and provides direct element refs that map 1:1 to Playwright's `getByRole()`.

## Running Against Deployed Etendo

To test against a full Etendo instance instead of the dev server:

```bash
BASE_URL=http://localhost:8080/etendo/web/com.etendoerp.go make test-e2e
```

Set `ETENDO_USER` and `ETENDO_PASSWORD` env vars if credentials differ from `admin/admin`.

## Test Reports

Playwright generates HTML reports with screenshots on failure:

```bash
make test-e2e-report    # Opens the report in browser
```

Reports are saved to `artifacts/e2e-report/`. Screenshots from failed tests are in `e2e/test-results/`.

## `data-testid` Convention

Shared UI components (`EntityForm`, `DetailView`, `ListView`, `DataTable`) emit `data-testid` attributes automatically. Use `page.getByTestId()` in tests — it's language-independent and survives text changes.

| Pattern | Example | Component |
|---------|---------|-----------|
| `field-{fieldKey}` | `field-businessPartner`, `field-partnerAddress` | EntityForm (all input types) |
| `action-{name}` | `action-save`, `action-cancel`, `action-new`, `action-save-draft` | DetailView, ListView buttons |
| `detail-view` | — | DetailView container |
| `list-view` | — | ListView container |
| `tab-{key}` | `tab-lines`, `tab-custom:attachments` | DetailView tab strip buttons (main strip and customTabsAfterBottom strip) |
| `row-{id}` | `row-ABC123` | DataTable rows |
| `option-{id}` | `option-ABC123` | SearchInput suggestions |
| `option-{field}-{id}` | `option-warehouse-ABC123` | DependentSelect items |
| `inline-add-field-{field}` | `inline-add-field-tax` | InlineSearchCombo text input (inline add/edit rows) |
| `inline-add-option-{field}-{id}` | `inline-add-option-tax-tax-1` | InlineSearchCombo portal dropdown items |
| `attachments-tab-panel` | — | AttachmentsTab root container |
| `attachments-dropzone` | — | UploadDropzone drag-and-drop area |
| `attachments-file-input` | — | Hidden `<input type="file">` — use `setInputFiles()` |
| `attachments-table` | — | AttachmentsTable `<table>` element |
| `attachments-empty-state` | — | Empty state shown when no files exist |
| `attachments-download-all` | — | "Download All (ZIP)" header button |
| `attachments-delete-all` | — | "Delete All" header button |
| `attachment-row-{id}` | `attachment-row-att-001` | Individual attachment row |
| `attachment-name-{id}` | `attachment-name-att-001` | File name cell |
| `attachment-download-{id}` | `attachment-download-att-001` | Per-row download button (revealed on hover) |
| `attachment-delete-{id}` | `attachment-delete-att-001` | Per-row delete button (revealed on hover) |
| `confirm-delete-dialog` | — | ConfirmDeleteDialog content (also used for replace confirmation) |
| `confirm-delete-confirm` | — | Confirm button inside the dialog |
| `confirm-delete-cancel` | — | Cancel button inside the dialog |
| `row-quick-actions` | — | RowQuickActions overlay container (per row) |
| `row-quick-action-{key}` | `row-quick-action-edit`, `-clone`, `-email`, `-more`, `-delete` | Canonical row quick-action buttons |
| `row-quick-action-delete-confirm` | — | Destructive button inside the row delete confirm dialog |
| `generic-preview-modal` | — | `GenericPreviewModal` card (the right-anchored panel) |
| `preview-drop-zone` | — | Drop zone inside GenericPreviewModal managed left panel |
| `filter-{name}` | `filter-todos`, `filter-personas` | ListView subset filter buttons |
| `quick-filter-{name}` | `quick-filter-active` | ListView quick filter toggle buttons |
| `selection-count` | — | ListView selection bar (count of selected rows) |
| `list-progress-bar` | — | ListView loading progress indicator |
| `global-search-trigger` | — | CommandPalette trigger button |
| `global-search-input` | — | CommandPalette search input |
| `menu-item-{slug}` | `menu-item-sales-order` | SideMenu navigation items |
| `topbar-user-menu` | — | UserAvatarButton trigger |
| `topbar-notifications` | — | TopBar notification bell |
| `topbar-back` | — | TopBar back navigation button |
| `topbar-more-actions` | — | TopBar kebab / 3-dot menu |
| `user-menu-logout` | — | User menu logout button |
| `user-menu-language-{code}` | `user-menu-language-en_US` | User menu language option |
| `location-field-{name}` | `location-field-city`, `location-field-postalCode` | Location modal input fields |
| `location-country-picker` | — | Location modal country select |
| `location-save` | — | Location modal save button |
| `field-{type}-{name}` | `field-select-warehouse`, `field-number-qty` | Generic typed field inputs |

## Stable IDs — Public Contract

The following element `id` attributes are used by E2E tests and **must not change** without
updating the corresponding test files. They are a public API.

| ID | Screen | Usage |
|----|--------|-------|
| `#reg-name` | Register | Full name input |
| `#reg-email` | Register | Email input |
| `#reg-password` | Register | Password input |
| `#login-email` | Login | Email input |
| `#login-password` | Login | Password input |
| `#forgot-email` | Forgot Password | Email input |
| `#fullName` | Profile step | Full name input |
| `#countryCode` | Profile step | Country code selector |
| `#clientName` | Company step | Company name input |
| `#fiscalIdValue` | Company step | Fiscal ID input |
| `#onboarding-language` | Onboarding | Language selector |

## Component Testability Checklist (MANDATORY for new components)

Every new UI component MUST include:

- [ ] `data-testid` on interactive elements (buttons, inputs, selects, toggles)
- [ ] `data-testid` on container elements E2E tests need to locate (rows, cards, panels, modals)
- [ ] `data-testid` on action triggers (save, delete, cancel, confirm, submit)
- [ ] `aria-label` on icon-only buttons (buttons with only an SVG/icon and no visible text)
- [ ] `role` attributes on semantic containers that use `<div>` instead of native HTML
- [ ] No `data-testid` uses dynamic CSS classes or translated text

### Naming convention

`{context}-{element}` or `{context}-{element}-{identifier}`

Examples: `filter-todos`, `subtab-row-{id}`, `location-field-city`, `action-bulk-delete`

### Codemod

Run `npm run check:data-testid` to verify all React components have baseline `data-testid`.
Run `npm run apply:data-testid` to auto-add missing testids (generates `ComponentName__hash`).
Files can opt out with `// @data-testid-ignore`.

## Document status attributes

Document-aware components expose status via `data-*` attributes for test assertions:

| Attribute | Element | Values |
|-----------|---------|--------|
| `data-doc-status` | Detail view container (`data-testid="detail-view"`) | `DR` (draft), `CO` (completed), `VO` (voided), `CL` (closed) |
| `data-row-status` | List view rows (`data-testid="row-{id}"`) | Same as above |
| `data-status` | Status badge (`data-testid="document-status-pill"`) | Same as above |

## Toast selectors

Sonner v2 renders `data-type` on each toast element. Use these selectors in E2E tests:

| Selector | Matches |
|----------|---------|
| `[data-type="error"]` | Error toasts (`role="alert"`) |
| `[data-type="success"]` | Success toasts |
| `[data-type="warning"]` | Warning toasts |
| `[data-type="info"]` | Info toasts |

The global `<Toaster />` also adds CSS class hooks: `toast-error`, `toast-success`, `toast-warning`, `toast-info`.

## Writing a mocked list/detail spec

For features that live on the list grid (e.g. RowQuickActions) you can run specs against `make dev` without an Etendo backend. The `login()` helper in `tests/helpers/auth.js` seeds a fake token and a generic `**/sws/**` mock that returns empty lists. Install **more specific** routes after login to feed synthetic rows — Playwright matches routes in **reverse registration order**, so specific wins over generic.

### Minimal template

```js
import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

const ROWS = [
  { id: 'row-001', documentNo: 'DOC-001', documentStatus: 'DR' },
  { id: 'row-002', documentNo: 'DOC-002', documentStatus: 'CO' },
];

async function installListMock(page, spec) {
  await page.route(`**/sws/neo/${spec}/header**`, async (route) => {
    const req = route.request();
    const url = req.url();
    if (req.method() === 'GET' && !/\/header\/[^/?]+/.test(url)) {
      // List fetch
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ response: { data: ROWS, totalRows: ROWS.length } }),
      });
    }
    if (req.method() === 'GET') {
      // Detail fetch — match by id and return a single-element envelope
      const m = url.match(/\/header\/([^/?]+)/);
      const found = ROWS.find(r => r.id === m?.[1]) ?? ROWS[0];
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ response: { data: [found] } }),
      });
    }
    return route.fallback();
  });
}

test.describe('My feature — sales-order', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await installListMock(page, 'sales-order');
    await page.goto('/sales-order');
    await page.waitForLoadState('networkidle').catch(() => {});
  });

  test('hover reveals the overlay', async ({ page }) => {
    const row = page.locator('tbody tr').filter({ hasText: 'DOC-001' }).first();
    await row.hover();
    await expect(row.getByTestId('row-quick-actions')).toBeVisible();
    await expect(row.getByTestId('row-quick-action-edit')).toBeVisible();
  });
});
```

### Conventions for mocked specs

- **File name suffix `.mocked.spec.js`** — distinguishes from specs that need a real backend.
- **Identify rows by display text**, not by index — `tbody tr.filter({ hasText: 'DOC-001' })` survives reorderings.
- **Use `getByTestId()`** instead of `[data-testid="..."]` — built-in retry and cleaner traces.
- **Match list vs detail by regex on the URL** — `/\/header\/[^/?]+/.test(url)` is the detail GET.
- **Custom field keys** — some windows expose the document number under a different field (e.g. purchase-invoice uses `orderReference`, not `documentNo`). Mirror the value into both keys when mocking so a single locator works across windows.
- **Per-window expected buttons** — if your overlay/feature is gated by the custom window file (`onClone`, `onEmail`, `menuActions`, `documentPreview`), parametrize the asserts so each window verifies its own wiring (catches regressions where a custom window stops passing a handler).
- **Numeric field clearing normalises to `defaultValue`** — when a user clears a numeric inline-add or inline-edit field and moves focus away, `DataTable.jsx` and `InlineLinesPanel.jsx` automatically substitute the field's `defaultValue` (or `min` if `defaultValue` is absent) before the save payload is built. In tests, assert the intercepted POST/PATCH body contains the expected numeric value (e.g. `0` for discount, `1` for quantity), never `undefined` or `''`. Do not assert that the input displays empty after blur — it will display the normalised value. See `docs/feedback.md` (ETP-4277) for the full root-cause explanation.

### Canonical reference

`e2e/tests/flows/row-quick-actions.mocked.spec.js` covers the four pilot windows (sales-order, purchase-order, sales-invoice, purchase-invoice) and is the recommended starting point for any list-row UI test. It demonstrates: mocked list+detail endpoints, per-window expected-button matrix, hover→overlay assertion, edit-navigates-to-detail flow, and delete-opens-dialog flow.

## Mock-mode Tests (No Backend Required)

Some tests run entirely in mock mode — no `BASE_URL` and no live Etendo instance. They seed `localStorage` with a fake token via `login()` and intercept API calls with `page.route()` to serve synthetic data.

Key patterns used in `invoice-preview-modal.spec.js` and `invoice-preview-persistence.spec.js`:

```js
// Seed localStorage token + catch-all 200 for all /sws/** routes
await login(page);

// Register a specific route override AFTER login() — takes priority (LIFO)
await page.route('**/sws/neo/preview-file**', (route) => {
  if (route.request().method() === 'GET') {
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ fileName: 'receipt.pdf', mimeType: 'application/pdf', fileData: '<b64>' }) });
  } else {
    route.fallback(); // let POST/DELETE hit the catch-all
  }
});

// Assert a network request was made with specific params
const req = await page.waitForRequest(
  (r) => r.url().includes('/sws/neo/preview-file') && r.method() === 'GET'
);
const url = new URL(req.url(), 'http://localhost');
expect(url.searchParams.get('specName')).toBe('purchase-invoice');

// Simulate file upload via hidden input
const fileInput = page.locator('[data-testid="preview-drop-zone"] input[type="file"]');
await fileInput.setInputFiles({ name: 'receipt.pdf', mimeType: 'application/pdf',
  buffer: Buffer.from('%PDF-1.4...') });
```

The locale defaults to `es_ES` in mock mode (no real `LocaleProvider` data). Use regex selectors to handle both locales:
```js
page.getByRole('button', { name: /cerrar|close/i })
```

## Tips

- **Start with smoke tests** — just verify the window loads. Then add flow tests.
- **One flow per file** in `tests/flows/` — keeps tests focused and easy to run individually.
- **Use role-based selectors** — `getByRole('button', { name: 'Save' })` is more resilient than CSS selectors.
- **Re-discover after pipeline changes** — when `generate-frontend.js` regenerates a window, run `agent-browser snapshot -i` to verify selectors still match, then update `selectors.js`.
- **Run a single test** — `cd e2e && npx playwright test tests/flows/purchase-order-create.spec.js --headed`
- **Run a single suite** — `cd e2e && npx playwright test tests/flows/attachments.mocked.spec.js --headed --grep "Suite C"`
- **Debug mode** — `make test-e2e-debug` pauses on each step so you can inspect the browser.
