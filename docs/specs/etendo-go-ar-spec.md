# Spec: tools/etendo-go-ar — Argentina Localization Workspace

**Epic:** [ETP-4343](https://etendoproject.atlassian.net/browse/ETP-4343) — Argentina Localization — tools/etendo-go-ar workspace

| Part | Jira | Title |
|------|------|-------|
| Part 1 | [ETP-4344](https://etendoproject.atlassian.net/browse/ETP-4344) | Fix CLI ROOT path resolution for multi-workspace support |
| Part 2 + 3 | [ETP-4345](https://etendoproject.atlassian.net/browse/ETP-4345) | Create tools/etendo-go-ar workspace structure |
| Part 4 | [ETP-4346](https://etendoproject.atlassian.net/browse/ETP-4346) | Onboard first AR window (smoke test) |
| Deferred | [ETP-4347](https://etendoproject.atlassian.net/browse/ETP-4347) | Publish @schema-forge/cli to GitHub Packages |

**Goal:** Create `tools/etendo-go-ar/` inside the schema-forge monorepo as a self-contained workspace for the Argentina localization. It consumes `@schema-forge/cli` via npm workspace link (no publishing yet). When the CLI runs from within this directory, artifacts land in `tools/etendo-go-ar/artifacts/` — not in `cli/artifacts/`.

---

## Part 1 — Fix CLI path resolution (2 files) `ETP-4344`

These two files hardcode `ROOT = join(__dirname, '..', '..')` which points to the `cli/` directory when installed as a workspace dep. The fix is to use `process.cwd()` as the project root instead.

### 1A — `cli/src/extract-from-db.js`

**Find** (lines 8–10, after the import block):
```js
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..', '..');
```

**Replace with:**
```js
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = process.env.SF_ROOT || process.cwd();
```

No other changes in this file.

### 1B — `cli/src/resolve-curated.js`

**Find** (lines 18–21, after the import block):
```js
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..', '..');
```

**Replace with:**
```js
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = process.env.SF_ROOT || process.cwd();
```

No other changes in this file.

### 1C — Verify the fix doesn't break existing tests

Run from monorepo root:
```bash
npm test --workspace=cli
```

All existing tests must pass. The `ROOT` change is safe because:
- Tests run with `process.cwd()` = monorepo root → `artifacts/` resolves to the same place as before.
- `SF_ROOT` env var is not set in CI → behavior is identical to before.

---

## Part 2 — Create `tools/etendo-go-ar/` `ETP-4345`

All paths below are relative to the monorepo root (`schema-forge/`).

### 2A — `tools/etendo-go-ar/package.json`

```json
{
  "name": "@schema-forge/etendo-go-ar",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22" },
  "devDependencies": {
    "@schema-forge/cli": "*"
  }
}
```

> The `"*"` resolves to the local `cli/` workspace — no publishing needed.

### 2B — `tools/etendo-go-ar/.env.example`

```env
# Copy to .env.local and fill in your values.
# The Makefile sources .env.local automatically.

# Full path to the AR Etendo installation's gradle.properties
# (used by sf-extract-db to read DB credentials)
ETENDO_GRADLE_PROPERTIES=/path/to/etendo_ar/gradle.properties

# Optional: override DB credentials directly (takes precedence over gradle.properties)
# ETENDO_DB_HOST=localhost
# ETENDO_DB_PORT=5432
# ETENDO_DB_USER=tad
# ETENDO_DB_PASSWORD=tad
# ETENDO_DB_NAME=etendo_ar
```

### 2C — `tools/etendo-go-ar/Makefile`

```makefile
.PHONY: extract regen push validate uuid help

# Load .env.local if it exists (DB credentials, ETENDO_GRADLE_PROPERTIES)
-include .env.local
export

# SF_ROOT tells the CLI that THIS directory is the project root,
# so artifacts/ writes go to tools/etendo-go-ar/artifacts/ not cli/artifacts/
export SF_ROOT := $(CURDIR)

ONLY ?=
PUSH_TO_NEO ?= 0

extract: ## Extract raw schema from Etendo AR DB. Usage: make extract MENU_NAME="Purchase Order"
	@[ -n "$(MENU_NAME)" ] || (echo "Error: MENU_NAME is required. Usage: make extract MENU_NAME=\"Purchase Order\""; exit 1)
	sf-extract-db --menu-name "$(MENU_NAME)"

regen: ## Regenerate contract + frontend. Usage: make regen ONLY=purchase-order
	@[ -n "$(ONLY)" ] || (echo "Error: ONLY is required. Usage: make regen ONLY=window-name"; exit 1)
	sf-pipeline --menu-name "$(ONLY)" --skip-interactive --skip-to resolve-curated
	@[ "$(PUSH_TO_NEO)" = "1" ] && sf-push-neo $(ONLY) || true

push: ## Push contract to NEO Headless. Usage: make push ONLY=purchase-order
	@[ -n "$(ONLY)" ] || (echo "Error: ONLY is required."; exit 1)
	sf-push-neo $(ONLY)

validate: ## Run pipeline validator across all AR artifacts
	sf-validate

uuid: ## Generate a new Etendo UUID (32-char uppercase hex)
	node -e "import('node:crypto').then(c => console.log(c.randomUUID().replace(/-/g,'').toUpperCase()))"

help: ## Show available targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-20s %s\n", $$1, $$2}'
```

### 2D — `tools/etendo-go-ar/artifacts/.gitkeep`

Empty file — keeps the `artifacts/` directory tracked in git.

```
(empty file)
```

### 2E — `tools/etendo-go-ar/docs/generated-custom-windows/INDEX.md`

```markdown
# AR Window Index

| Window | Status | Notes |
|--------|--------|-------|
| (none yet) | — | Add entries as windows are onboarded |
```

---

## Part 3 — AR App Shell `ETP-4345`

A minimal standalone Vite app that hosts AR windows. It is **not** an npm workspace (npm doesn't support nested workspaces). It is installed and run independently.

### 3A — `tools/etendo-go-ar/app-shell/package.json`

```json
{
  "name": "@schema-forge/etendo-go-ar-shell",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@etendosoftware/app-shell-core": "*",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "react-router-dom": "^7.0.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.4.0",
    "vite": "^6.0.0"
  }
}
```

> `@etendosoftware/app-shell-core: "*"` resolves via the monorepo root's node_modules (hoisted). If it doesn't resolve, change `"*"` to `"../../node_modules/@etendosoftware/app-shell-core"` in the interim.

### 3B — `tools/etendo-go-ar/app-shell/vite.config.js`

```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // @generated/purchase-order/... → artifacts/purchase-order/...
      '@generated': resolve(__dirname, '../artifacts'),
    },
  },
  server: {
    port: 5200,
    proxy: {
      '/api': 'http://localhost:4200',
    },
  },
  build: { outDir: 'dist' },
});
```

### 3C — `tools/etendo-go-ar/app-shell/tailwind.config.js`

```js
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: { extend: {} },
  plugins: [],
};
```

> When `@etendosoftware/app-shell-core` exposes its `tailwind-preset`, replace this with:
> ```js
> import preset from '@etendosoftware/app-shell-core/tailwind-preset';
> export default { presets: [preset], content: [...] };
> ```

### 3D — `tools/etendo-go-ar/app-shell/postcss.config.js`

```js
export default {
  plugins: { tailwindcss: {}, autoprefixer: {} },
};
```

### 3E — `tools/etendo-go-ar/app-shell/index.html`

```html
<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Etendo GO — Argentina</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

### 3F — `tools/etendo-go-ar/app-shell/src/main.jsx`

```jsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(<App />);
```

### 3G — `tools/etendo-go-ar/app-shell/src/styles.css`

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

### 3H — `tools/etendo-go-ar/app-shell/src/App.jsx`

Minimal placeholder — replace with real shell once windows are onboarded.

```jsx
import React from 'react';

export default function App() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>Etendo GO — Argentina</h1>
      <p>No hay ventanas registradas aún. Ejecutá <code>make extract</code> para comenzar.</p>
    </div>
  );
}
```

### 3I — `tools/etendo-go-ar/app-shell/src/windows/registry.js`

```js
// AR window loaders — add one entry per onboarded window.
//
// Example (after running make regen ONLY=purchase-order):
//   'purchase-order': () => import('@generated/purchase-order/generated/web/purchase-order/index.jsx'),

export const windowLoaders = {};
```

### 3J — `tools/etendo-go-ar/app-shell/src/menu.json`

```json
{
  "menu": []
}
```

---

## Part 4 — Verification `ETP-4346`

Run all steps from the **monorepo root** unless otherwise noted.

### Step 1 — Install workspace

```bash
npm install
```

Verify that `tools/etendo-go-ar/node_modules/@schema-forge/cli` is a symlink to `cli/`:
```bash
ls -la tools/etendo-go-ar/node_modules/@schema-forge/cli
# Should print: ... -> ../../../../cli
```

### Step 2 — Check that `sf-*` bins are available

```bash
cd tools/etendo-go-ar
npx sf-pipeline --help
```

Should print the pipeline usage without errors.

### Step 3 — Check that SF_ROOT is respected

```bash
cd tools/etendo-go-ar
SF_ROOT=$(pwd) node -e "
  const { join } = await import('node:path');
  const ROOT = process.env.SF_ROOT || process.cwd();
  console.log('ROOT:', ROOT);
  // Should print: ROOT: /...absolute.../tools/etendo-go-ar
"
```

### Step 4 — Smoke-test extract (requires AR DB access)

```bash
cd tools/etendo-go-ar
cp .env.example .env.local
# Edit .env.local with actual ETENDO_GRADLE_PROPERTIES path
make extract MENU_NAME="Purchase Order"
```

Expected: `artifacts/purchase-order/schema-raw.json` and `artifacts/purchase-order/rules-raw.json` are created **inside `tools/etendo-go-ar/`**.

### Step 5 — Existing tests still pass

```bash
# From monorepo root
npm test --workspace=cli
```

All tests must pass (the ROOT change is backward-compatible: `process.cwd()` = monorepo root when run from there).

---

## What Is NOT in This Spec (see ETP-4347 for publishing)

- Publishing `@schema-forge/cli` to GitHub Packages (deferred — workspace link is sufficient for now)
- Isolating the Spain localization into its own `tools/etendo-go-es/` (follow-up task)
- The AR BFF server (needed once the app-shell loads real windows — follow-up)
- CI workflows for the AR localization (follow-up)
- Registering windows from AR in the main `tools/app-shell` (not needed — AR has its own shell)

---

## Commit Convention

Two logical commits:
1. `Feature ETP-4344: Fix CLI ROOT path resolution for multi-workspace support` — only the 2 file changes in `cli/src/`
2. `Feature ETP-4345: Add tools/etendo-go-ar localization workspace` — all new files under `tools/etendo-go-ar/`
