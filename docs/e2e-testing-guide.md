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
│       └── purchase-order-create.spec.js  # Purchase Order with role/org context
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
| `row-{id}` | `row-ABC123` | DataTable rows |
| `option-{id}` | `option-ABC123` | SearchInput suggestions |
| `option-{field}-{id}` | `option-warehouse-ABC123` | SelectorInput / DependentSelect items |

## Tips

- **Start with smoke tests** — just verify the window loads. Then add flow tests.
- **One flow per file** in `tests/flows/` — keeps tests focused and easy to run individually.
- **Use role-based selectors** — `getByRole('button', { name: 'Save' })` is more resilient than CSS selectors.
- **Re-discover after pipeline changes** — when `generate-frontend.js` regenerates a window, run `agent-browser snapshot -i` to verify selectors still match, then update `selectors.js`.
- **Run a single test** — `cd e2e && npx playwright test tests/flows/purchase-order-create.spec.js --headed`
- **Debug mode** — `make test-e2e-debug` pauses on each step so you can inspect the browser.
