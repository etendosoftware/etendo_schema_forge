# Parallel Localization Projects Guide

How to create independent repos (`localizacion-argentina`, `localizacion-españa`) that consume Schema Forge as a library — no code duplication.

---

## Target Architecture

```
etendo_schema_forge (this repo)
  └── packages/
        ├── @etendosoftware/schema-forge-core      ← already published ✅
        ├── @etendosoftware/app-shell-core          ← already published ✅
        └── @schema-forge/cli                       ← needs to be published ⚠️
  └── tools/
        └── app-shell/                              ← stays here, used as shell host
                                                       (or each localization ships its own)

localizacion-argentina/  (new repo)
  ├── .npmrc
  ├── package.json   ← devDep: @schema-forge/cli + @etendosoftware/app-shell-core
  ├── schema_forge.properties
  ├── Makefile
  ├── artifacts/     ← AR-specific windows (empty at start)
  └── tools/app-shell/  ← AR-specific shell (registry + menu only)

localizacion-españa/    (new repo, same structure)
  └── ...
```

Each localization owns:
- Its `artifacts/` (window contracts, decisions.json, generated files)
- Its app-shell window registry and menu config
- Its `schema_forge.properties` (pointing to its own Etendo instance)

Schema Forge owns the CLI tooling, generators, validators, and UI components.

---

## Phase 1 — Publish `@schema-forge/cli`

The CLI is currently `"private": true`. It needs to be published so localization repos can install it.

### Step 1A — Fix path resolution (3 files, ~5 lines total)

When installed in `node_modules/@schema-forge/cli/src/`, `__dirname` points inside node_modules — not the consumer project. The fix is to use `process.cwd()` as the consumer root.

**`cli/src/db.js` — `findGradleProperties()` and `DEFAULT_CACHE_PATH`:**

```js
// Before (line ~15):
export const DEFAULT_CACHE_PATH = join(__dirname, '..', 'cache', 'ad-snapshot.json');

// After:
export const DEFAULT_CACHE_PATH = join(process.cwd(), 'cache', 'ad-snapshot.json');
```

```js
// Before (lines ~279-282): walks up from __dirname (wrong in published package)
function findGradleProperties() {
  const candidate = join(__dirname, '..', '..', '..', 'gradle.properties');
  ...
}

// After: try cwd first (consumer project), then __dirname (monorepo fallback)
function findGradleProperties() {
  // Consumer project: gradle.properties lives at cwd/../gradle.properties
  const fromCwd = join(process.cwd(), '..', 'gradle.properties');
  try { readFileSync(fromCwd, 'utf-8'); return fromCwd; } catch {}

  // Monorepo fallback: schema_forge/../gradle.properties
  const fromSrc = join(__dirname, '..', '..', '..', 'gradle.properties');
  try { readFileSync(fromSrc, 'utf-8'); return fromSrc; } catch {}

  return null;
}
```

**`cli/src/extract-from-db.js` — `ROOT` constant:**

```js
// Before (line ~10):
const ROOT = join(__dirname, '..', '..');

// After:
const ROOT = process.env.SF_ROOT || process.cwd();
```

**`cli/src/resolve-curated.js` — `ROOT` constant (same pattern):**

```js
// Before (line ~21):
const ROOT = join(__dirname, '..', '..');

// After:
const ROOT = process.env.SF_ROOT || process.cwd();
```

> `pipeline.js` already uses relative paths like `artifacts/${name}/...` — these resolve against `process.cwd()` and work correctly without changes.

### Step 1B — Make the CLI publishable

**`cli/package.json`:** remove `"private": true`, add `publishConfig` and `files`:

```json
{
  "name": "@schema-forge/cli",
  "version": "0.1.0",
  "type": "module",
  "publishConfig": {
    "registry": "https://npm.pkg.github.com",
    "access": "restricted"
  },
  "files": [
    "src",
    "!src/**/__tests__/**"
  ],
  ...
}
```

### Step 1C — Add CLI to the publish workflow

In `.github/workflows/publish-private-packages.yml`, add steps for `@schema-forge/cli` (same pattern as the existing packages).

### Step 1D — Verify

```bash
npm pack --workspace=cli --dry-run
```

Check that the tarball does NOT include `cli/test/`, `cli/cache/`, or `cli/config/` (only `cli/src/`).

---

## Phase 2 — Create a Localization Repo

Use `localizacion-argentina` as the example.

### Directory structure

```
localizacion-argentina/
├── .npmrc                       ← GitHub Packages auth
├── package.json
├── package-lock.json
├── schema_forge.properties      ← points to AR Etendo instance
├── Makefile
├── artifacts/                   ← starts empty, populated by sf-extract-db
├── docs/
│   └── generated-custom-windows/
│       └── INDEX.md
└── tools/
    └── app-shell/               ← AR-specific shell
        ├── package.json
        ├── vite.config.js
        ├── tailwind.config.js
        ├── index.html
        └── src/
            ├── main.jsx
            ├── App.jsx
            ├── menu.json        ← AR menu config
            ├── windows/
            │   └── registry.js  ← AR window loaders (starts empty)
            └── styles.css
```

### `.npmrc`

```ini
@etendosoftware:registry=https://npm.pkg.github.com
@schema-forge:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

Never commit the token. Export `GITHUB_TOKEN` in your shell or CI secrets.

### Root `package.json`

```json
{
  "name": "localizacion-argentina",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22" },
  "workspaces": ["tools/*"],
  "scripts": {
    "test": "node --test 'tools/**/__tests__/*.test.js'"
  },
  "devDependencies": {
    "@schema-forge/cli": "^0.1.0"
  }
}
```

### `schema_forge.properties`

```properties
# Path to the Etendo AR module
module.path=/path/to/etendo_ar/modules/com.etendoerp.go
etendo.path=/path/to/etendo_ar
```

### `Makefile`

The Makefile delegates entirely to the CLI bins installed in `node_modules/.bin/`:

```makefile
.PHONY: extract regen push validate clean help

ONLY ?=
PUSH_TO_NEO ?=

extract: ## Extract raw schema from Etendo DB for a window
	sf-extract-db --menu-name "$(MENU_NAME)"

regen: ## Regenerate contract + frontend for a window (ONLY=window-name)
	@if [ -z "$(ONLY)" ]; then echo "Usage: make regen ONLY=window-name"; exit 1; fi
	sf-pipeline --menu-name "$(ONLY)" --skip-interactive --skip-to resolve-curated
	@if [ "$(PUSH_TO_NEO)" = "1" ]; then sf-push-neo $(ONLY); fi

validate: ## Run pipeline validator
	sf-validate

push: ## Push contract to NEO Headless (ONLY=window-name)
	sf-push-neo $(ONLY)

uuid: ## Generate a new Etendo UUID
	node -e "import('node:crypto').then(c => console.log(c.randomUUID().replace(/-/g,'').toUpperCase()))"

help:
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-20s %s\n", $$1, $$2}'
```

### App shell (`tools/app-shell/`)

The app-shell of the localization repo is a thin wrapper around `@etendosoftware/app-shell-core`. It only adds:
- `windows/registry.js` — AR window loaders
- `menu.json` — AR menu config

**`tools/app-shell/package.json`:**

```json
{
  "name": "@localizacion-argentina/app-shell",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build"
  },
  "dependencies": {
    "@etendosoftware/app-shell-core": "^0.1.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "react-router-dom": "^7.0.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.0",
    "vite": "^6.0.0",
    "tailwindcss": "^3.4.0",
    "postcss": "^8.4.0",
    "autoprefixer": "^10.4.0"
  }
}
```

**`tools/app-shell/tailwind.config.js`:**

```js
import appShellPreset from '@etendosoftware/app-shell-core/tailwind-preset';

export default {
  presets: [appShellPreset],
  content: ['./index.html', './src/**/*.{js,jsx}'],
};
```

**`tools/app-shell/src/windows/registry.js`** (starts empty):

```js
// AR-specific window loaders.
// Add entries here as windows are onboarded via make regen.
// Example:
// 'purchase-order-ar': () => import('@generated/purchase-order-ar/generated/web/purchase-order-ar/index.jsx'),

export const windowLoaders = {};
```

**`tools/app-shell/src/menu.json`** (minimal):

```json
{
  "menu": []
}
```

---

## Phase 3 — Onboard the First Window

Once the CLI is published and the localization repo exists:

```bash
# 1. Install dependencies
npm install

# 2. Extract raw schema from Etendo AR DB
MENU_NAME="Purchase Order" make extract

# 3. Run the interactive pipeline (decisions + contract + frontend)
make regen ONLY=purchase-order

# 4. Register the window in the AR shell
# Edit tools/app-shell/src/windows/registry.js:
# 'purchase-order': () => import('../../artifacts/purchase-order/generated/web/purchase-order/index.jsx'),

# 5. Push to NEO Headless
make push ONLY=purchase-order
```

---

## What Each Repo Owns

| Concern | Schema Forge | Localization Repo |
|---------|-------------|-------------------|
| CLI tooling (`sf-*`) | ✅ owns + publishes | installs as devDep |
| UI components (app-shell-core) | ✅ owns + publishes | installs as dep |
| Window contracts (`artifacts/`) | — | ✅ owns |
| Menu config | — | ✅ owns |
| Window registry | — | ✅ owns |
| `schema_forge.properties` | example only | ✅ owns |
| Etendo DB connection | via gradle.properties | via gradle.properties |
| CI/CD | pipeline-validate, sonar, etc. | can reuse same workflow files |

---

## Phase 1 Blocking Items Summary

Before any localization repo can use the CLI as a library, these changes are needed in this repo:

1. `cli/src/db.js`: fix `DEFAULT_CACHE_PATH` and `findGradleProperties()` (use `process.cwd()`)
2. `cli/src/extract-from-db.js`: fix `ROOT` constant (use `process.env.SF_ROOT || process.cwd()`)
3. `cli/src/resolve-curated.js`: fix `ROOT` constant (same pattern)
4. `cli/package.json`: remove `"private": true`, add `publishConfig` + `files`
5. `.github/workflows/publish-private-packages.yml`: add CLI publish steps

Estimated effort: ~30 min for the path fixes + publishing wiring.
