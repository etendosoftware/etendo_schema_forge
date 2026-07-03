# 02 -- Build Pipeline

Everything between "code has been generated" and "artifacts are ready to deploy." Covers backend compilation, frontend bundling, and the gates that must pass before deployment.

## Overview

Two independent build processes produce two types of artifacts:

```
Generated Code
     │
     ├──▶ gradlew smartbuild ──▶ Java .class files  (Backend)
     │
     └──▶ npm run build      ──▶ JS/CSS bundles      (Frontend)
```

> **Note:** Database migrations (AD record registration) are a planned third artifact. The team is evaluating Liquibase as the migration strategy, but no implementation exists yet. See [Database Migrations (Pending)](#database-migrations-pending) below.

Currently, these are run as separate CLI commands. There is no single orchestration script that runs both.

---

## Backend Build

### What `gradlew smartbuild` Does

1. Resolves the Etendo Core classpath (platform JARs from `etendo_core/lib/` and cached module JARs)
2. Compiles the generated module's Java sources against that classpath
3. Outputs `.class` files into the Etendo webapp's `WEB-INF/classes/` directory
4. Performs incremental compilation when possible (Gradle's built-in up-to-date checks)

### Prerequisites

| Requirement | Details |
|-------------|---------|
| JDK 17 | Must be on `PATH` or set via `JAVA_HOME` |
| Etendo Core | Fully compiled (`etendo_core/` with `build/` directory populated) |
| `com.etendoerp.go` module | Must be present in `etendo_core/modules/com.etendoerp.go/` with compiled classes |
| Gradle wrapper | `gradlew` in `etendo_core/` (no global Gradle install needed) |
| Network (first run) | Gradle downloads dependencies on first build; subsequent builds use cache |

### Build Command

```bash
cd etendo_core
./gradlew smartbuild
```

Typical duration: 30-90 seconds for incremental builds, 2-5 minutes for clean builds.

### Classpath Resolution

The generated module's `build.gradle` declares compile-time dependencies:

```groovy
plugins {
    id 'java'
}

dependencies {
    compileOnly('com.etendoerp:openapi:[2.5.0,)')
    compileOnly 'io.swagger.core.v3:swagger-models:2.1.13'
    compileOnly 'org.apache.commons:commons-lang3:3.12.0'
}
```

At compile time, the module also has implicit access to:
- All Etendo Core classes (OBDal, OBCriteria, OBContext, etc.)
- CDI/Weld annotations (`@Observes`, `@Inject`)
- Hibernate APIs
- Other installed modules (including `com.etendoerp.go` which provides the `RequestHandler` interface)

### Compilation Order

Gradle resolves the dependency graph and compiles in order:
1. Etendo Core (if not already compiled)
2. Dependency modules (`com.etendoerp.go`, `com.etendoerp.openapi`)
3. Generated module

### Artifact Output

Compiled classes land in:
```
etendo_core/build/classes/java/main/
  └── com/etendoerp/schemaforge/{window}/
        ├── event/          # EventHandler classes
        ├── api/v{n}/       # RequestHandler classes
        ├── dto/v{n}/       # DTO classes
        ├── mapper/v{n}/    # Mapper classes
        ├── process/        # DalProcess classes
        ├── validation/     # PreconditionValidator classes
        └── callout/        # Callout classes
```

After `smartbuild`, these are also copied to:
```
etendo_core/WebContent/WEB-INF/classes/
```

### Build Caching

- **Gradle cache**: `~/.gradle/caches/` stores downloaded dependencies and task outputs
- **Incremental compilation**: Only recompiles changed `.java` files and their dependents
- **Clean build**: `./gradlew clean smartbuild` forces full recompilation (useful when incremental build is stale)

---

## Frontend Build

### What `npm run build` Does

1. Invokes Vite 6 to bundle the React SPA
2. Resolves the `@generated` alias to `../../artifacts/` (generated window components)
3. Code-splits each window into a separate chunk via dynamic imports in `registry.js`
4. Generates the PWA service worker and manifest
5. Outputs production-ready files to `tools/app-shell/dist/`

### Prerequisites

| Requirement | Details |
|-------------|---------|
| Node.js 22.x | Required for ESM support and modern APIs |
| npm 10.x | For dependency installation |
| `node_modules/` | Run `npm install` in `tools/app-shell/` first |
| Generated window code | `artifacts/{window}/generated/web/{window}/index.jsx` for each registered window |

### Build Command

```bash
cd tools/app-shell
npm install       # if not already done
npm run build     # runs: vite build
```

Typical duration: 10-30 seconds.

### Vite Configuration

Key settings from `vite.config.js`:

```javascript
export default defineConfig({
  base: './',                    // Relative paths (deployable to any subdirectory)
  plugins: [
    react(),                     // React JSX transform
    schemaApiPlugin(),           // Custom plugin for schema API generation
    VitePWA({
      registerType: 'prompt',    // User chooses when to update
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': './src',
      '@generated': '../../artifacts',    // Maps to generated window code
    },
  },
});
```

### Bundle Strategy

- **Code splitting**: Each window is a separate async chunk. The `registry.js` file maps 35+ window slugs to dynamic imports:
  ```javascript
  'sales-order': () => import('@generated/sales-order/generated/web/sales-order/index.jsx')
  ```
- **Shared chunks**: React, React DOM, Radix UI, and other shared dependencies are split into common chunks by Vite's automatic chunking
- **Fallback**: Windows not in `windowLoaders` map fall back to `PlaceholderWindow.jsx`

### Asset Optimization

- **Minification**: Vite uses esbuild for JS minification (production mode)
- **Tree-shaking**: Unused exports are eliminated via ESM static analysis
- **CSS**: Tailwind CSS purges unused utilities; PostCSS + Autoprefixer for vendor prefixes
- **Chunk naming**: Content-hashed filenames (`index-BeTaPoxF.js`) for long-term caching

### Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `VITE_MOCK` | (unset) | When truthy, SPA uses `mockFetch` instead of real API calls |
| `VITE_API_BASE` | (auto-detected) | Base URL for API requests; auto-detected from `window.location.pathname` |

### Source Maps

Vite generates source maps in development mode. For production builds, source maps are not included by default. To enable them for debugging production issues, add to `vite.config.js`:

```javascript
build: {
  sourcemap: true,   // or 'hidden' for error tracking services
}
```

### Output Structure

```
tools/app-shell/dist/
├── index.html              # Entry point (must not be cached aggressively)
├── favicon.png             # App icon
├── preview.html            # Standalone preview page
├── contract.json           # Window contract metadata
├── manifest.webmanifest    # PWA manifest
├── sw.js                   # Service worker (Workbox)
└── assets/
    ├── index-BeTaPoxF.js   # App shell main bundle
    ├── index-*.js          # Per-window chunks (35+ files)
    ├── mockData-*.js       # Mock data chunks (for development/preview)
    ├── MasterDetailPage-*.js
    ├── SingleEntityPage-*.js
    ├── useEntity-*.js      # Shared hook chunk
    └── PlaceholderWindow-*.js
```

---

## Database Migrations (Pending)

### Current State

Schema Forge does **not** currently generate or deploy database migrations. The generated module produces Java backend code and a React frontend, but **no mechanism exists yet** for registering AD records (Window, Tab, Field, Process definitions) in the Etendo Application Dictionary.

Without AD record registration, the backend code exists but Etendo does not know about the module's UI and business logic structure.

### Migration Strategy Under Evaluation

The team is evaluating **Liquibase** as the database migration strategy. Key considerations:

- **AD records needed**: `AD_Window`, `AD_Tab`, `AD_Field`, `AD_Column`, `AD_Process`, `AD_Menu`, `AD_Reference`
- **UUID stability**: A `uuid-manifest.json` file will ensure the same AD record gets the same UUID across regenerations (Etendo uses UUIDs as primary keys)
- **Idempotency**: Migrations must be safe to re-run (INSERT or UPDATE semantics)
- **Referential integrity**: All foreign key references between AD records must be valid
- **Rollback support**: Liquibase changesets can include rollback instructions

### What This Means for Deployment

Until the migration strategy is implemented:
- Generated modules can be compiled and the frontend can be built
- AD records must be registered manually or through Etendo's existing mechanisms
- The deployment pipeline has two artifacts (Java module + Frontend SPA) instead of three

### When This Will Be Implemented

Database migration strategy (Liquibase) is under evaluation. Not yet implemented. This section will be updated when a decision is made and the tooling is built.

---

## Build Orchestration

### Current State

There is no single build script. Each step is run manually:

```bash
# 1. Backend
cd etendo_core
./gradlew smartbuild

# 2. Frontend
cd tools/app-shell
npm install
npm run build
```

### Target State

A single orchestration command that:
1. Compiles the Java module (`gradlew smartbuild`)
2. Builds the frontend (`npm run build`)
3. Runs database migrations (when Liquibase strategy is implemented)
4. Runs contract tests to verify generated code matches the contract
5. Reports a unified pass/fail result

### Build Matrix

Tested combinations for CI:

| Java | Etendo Core | Node.js | PostgreSQL | Status |
|------|-------------|---------|------------|--------|
| 17 | 26.x | 22.x | 14+ | Primary target |
| 17 | 26.x | 20.x | 14+ | Should work (Node only for build) |
| 21 | 26.x | 22.x | 14+ | Untested (future Etendo versions) |

---

## Critical Failure Points

### CRITICAL: `com.etendoerp.go` base module missing from classpath

| Aspect | Detail |
|--------|--------|
| **Symptom** | `error: package com.etendoerp.go does not exist` during `smartbuild` |
| **Root cause** | The `com.etendoerp.go` module is not installed in `etendo_core/modules/` or its classes are not compiled |
| **Detection** | Compilation fails immediately with import errors |
| **Mitigation** | Install the module: clone into `etendo_core/modules/com.etendoerp.go/` and run `./gradlew smartbuild` |
| **Prevention** | Include `com.etendoerp.go` in the module dependency declaration; verify its presence in CI setup scripts |

### CRITICAL: Etendo version mismatch

| Aspect | Detail |
|--------|--------|
| **Symptom** | `error: cannot find symbol` for Etendo Core APIs, or runtime `NoSuchMethodError` |
| **Root cause** | Generated module uses APIs from Etendo 26.2 but deployed on Etendo 26.0 (or vice versa) |
| **Detection** | Compilation errors for missing methods/classes; runtime exceptions in production |
| **Mitigation** | Align the Etendo Core version in `build.gradle` with the target deployment version |
| **Prevention** | Pin the exact Etendo Core version in CI; run integration tests against the target version |

### CRITICAL: Frontend build fails silently

| Aspect | Detail |
|--------|--------|
| **Symptom** | `npm run build` exits with error; or produces a bundle but windows show blank/error |
| **Root cause** | Missing `@generated` alias target (generated window files not present in `artifacts/`), or import path mismatch in `registry.js` |
| **Detection** | Vite reports unresolved imports during build; missing chunks in `dist/assets/` |
| **Mitigation** | Verify all windows listed in `registry.js` have corresponding files in `artifacts/{window}/generated/web/{window}/index.jsx` |
| **Prevention** | Run the build in CI after code generation; validate that all registry entries resolve |

### WARNING: Incremental build stale

| Aspect | Detail |
|--------|--------|
| **Symptom** | Code changes do not take effect after `smartbuild`; old behavior persists |
| **Root cause** | Gradle's incremental compilation did not detect the change (renamed class, moved package) |
| **Detection** | Difficult to detect automatically; suspected when behavior does not match code |
| **Mitigation** | Run `./gradlew clean smartbuild` to force full recompilation |
| **Prevention** | Use clean builds in CI; only use incremental builds in local development |

### WARNING: AD Record UUID conflict (when DB migrations are implemented)

| Aspect | Detail |
|--------|--------|
| **Symptom** | Migration fails with unique constraint violation, or two modules overwrite each other's AD records |
| **Root cause** | Two modules register AD records with the same UUID (e.g., both define the same `AD_Window_ID`) |
| **Detection** | Database constraint error during migration; or unexpected behavior when both modules are installed |
| **Mitigation** | Regenerate UUIDs for the conflicting module; update `uuid-manifest.json` |
| **Prevention** | Use the UUID manifest to ensure stability; validate uniqueness across all installed modules before migration |

### WARNING: Node.js version mismatch

| Aspect | Detail |
|--------|--------|
| **Symptom** | Frontend build fails with syntax errors or unsupported feature warnings |
| **Root cause** | Built with Node.js 22 (ESM `import ... with { type: 'json' }` syntax in `registry.js`), but CI or deployment environment has Node.js 20 or older |
| **Detection** | Build error mentioning unexpected token or unsupported import attributes |
| **Mitigation** | Install Node.js 22.x on the build machine |
| **Prevention** | Pin Node.js version in CI via `.nvmrc` or `engines` field in `package.json`; use `nvm` or `volta` for version management |

---

## CD Gates

These gates must ALL pass before build artifacts are considered deployable. Failure of any gate blocks deployment.

### Gate 1: Java Compilation

```bash
./gradlew smartbuild
# Exit code must be 0
# Zero compilation errors
# Zero compilation warnings for generated code (warnings in Etendo Core are acceptable)
```

**Validates**: All generated Java classes compile against the target Etendo Core classpath. All imports resolve. All method signatures match.

### Gate 2: Frontend Build

```bash
cd tools/app-shell && npm run build
# Exit code must be 0
# All @generated imports resolve
# Bundle size within budget (no single chunk > 500 KB gzipped)
```

**Validates**: All generated React components can be bundled. Dynamic imports in `registry.js` resolve to real files. No circular dependency issues.

### Gate 3: Database Migration Validation (Pending)

```bash
# Database migration strategy (Liquibase) is under evaluation. Not yet implemented.
# When implemented: validate migration changesets, UUID uniqueness, and referential integrity.
```

**Will validate**: All AD record UUIDs are unique. All foreign key references are valid. No orphan records. Migration changesets are well-formed and idempotent.

### Gate 4: Contract Tests

```bash
node --test 'cli/test/*.test.js'
# All tests pass (234 tests, 0 failures across 38 suites)
```

**Validates**: Generated code structure matches the contract (field presence, types, visibility, searchable filters, interface compliance). These are fast Node.js tests that do not require a running backend.

### Gate Summary

| Gate | Tool | Duration | Blocks |
|------|------|----------|--------|
| Java compilation | `gradlew smartbuild` | 30s-5min | Cannot deploy backend |
| Frontend build | `npm run build` | 10-30s | Cannot deploy frontend |
| DB migration validation | TBD (pending Liquibase) | TBD | Cannot register module in AD |
| Contract tests | `node --test` | <10s | Structural integrity not verified |
