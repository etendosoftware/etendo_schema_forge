# Plan: Fix UI Translations — ETP-3647

**Epic:** ETP-3504  
**Branch:** `feature/ETP-3647` (both repos)  
**Goal:** When the user switches to `es_ES`, 100% of the UI must render in Spanish. No English strings should leak through.

---

## Root Causes

| # | Cause | Scope |
|---|-------|-------|
| RC-1 | Hardcoded English strings in frontend components | Buttons, statuses, dashboard, breadcrumbs |
| RC-2 | Missing keys in `es_ES.json` dictionary | Fields, tabs, windows not covered |
| RC-3 | NEO Headless API ignores user locale | Discovery endpoint returns English-only labels |
| RC-4 | Document statuses never extracted from `AD_Ref_List_Trl` | All status badges always English |

## Solution Architecture

```
label final = decisions.labelOverrides[lang][column]   // (1) override per-window
            ?? locale_dictionary[column]                // (2) Etendo AD translation
            ?? rawLabel                                 // (3) fallback English
```

`decisions.json` remains source of truth. Etendo `_trl` tables provide base translations. Overrides allow renaming in the simplified interface.

---

## Tasks & Progress

### Phase 1: Frontend hardcoded strings + dictionary completeness (RC-1 + RC-2) ✅ DONE

- [x] Investigation & root cause analysis
- [x] **1a.** Migrate "New" button to i18n (`ListView.jsx`)
- [x] **1b.** Migrate status badges to i18n (`statusBadge.js`) — `statusLabel()` now accepts `dictionary` param
- [x] **1c.** Migrate dashboard widget labels to i18n (`DashboardPage.jsx`) — `WIDGET_REGISTRY` uses `labelKey` → `ui()`
- [x] **1d.** Migrate breadcrumbs to i18n — breadcrumbs already use `tMenu()` dynamically (no change needed)
- [x] **1e.** Migrate action buttons (Save, Delete, etc.) to i18n (`DetailView.jsx`, `DataTable.jsx`, `DocumentStatusPill.jsx`)
- [x] **1f.** Add `genericLabels` section with 86 keys to both `en_US.json` and `es_ES.json`; created `useUI()` hook + `resolveUI()` pure function
- [x] **1g.** Build verified — `npx vite build` passes clean
- [x] **1h.** Additional components: `CommandPalette.jsx`, `CopilotWidget.jsx`, `ReportViewerPage.jsx`, `SmartScanPage.jsx`
- [x] **1i.** Renamed `chrome` → `genericLabels` in locale JSON + hooks (clearer naming)
- [x] **1j.** Fixed `extract-labels.js` to merge with existing JSON instead of overwriting (preserves `genericLabels`, `ui` sections)
- [x] **1k.** Localized dashboard fallback task text, quick actions, and page title to prevent English leaks in Spanish mode
- [x] **1m.** Localized dashboard KPI labels and Copilot widget copy/aria labels to prevent remaining English leaks in Spanish mode
- [x] **1n.** Localized Smart Scan window title, upload area, table labels, activity feed, and sidebar menu label
- [x] **1k.** Translated `Sidebar.jsx` and `menu.json` sections (added missing groups and options to `ui` dictionary, used `tMenu` hook)
- [x] **1l.** Re-translated Dashboard Widgets data payload texts dynamically using `ui` hook inside `useDashboardData.js`

### Phase 2: `labelOverrides` in decisions.json (RC-1 partial) ✅ DONE

- [x] **2a.** Design `labelOverrides` schema in decisions.json
- [x] **2b.** Update `resolve-curated.js` to pass overrides through to `schema.window.labelOverrides`
- [x] **2c.** Update frontend `useLabel(labelOverrides?)` to check `labelOverrides[locale][column]` before dictionary
- [x] **2d.** Document in `docs/decisions-reference.md` (new section with schema, examples, resolution chain)

### Phase 3: NEO Headless translated labels (RC-3) ✅ DONE (partial)

- [x] **3a.** Fix `NeoDiscoveryHelper.buildFieldsArray()` — added `getTranslatedColumnLabel()` using `ElementTrl` + `OBContext` language
- [x] **3b.** Fix `NeoProcessService.buildParameterArray()` — added `getTranslatedParamName()` using `ProcessParameterTrl` + `OBContext` language
- [ ] **3c.** Fix `NeoSelectorService` — translated selector metadata (column labels served via frontend i18n, not priority)
- [ ] **3d.** Unit tests for translated label resolution

### Phase 4: Document status translations (RC-4) ✅ DONE

- [x] **4a.** Add `AD_Ref_List_Trl` query to `extract-labels.js` — new `statuses` section with DISTINCT ON query
- [x] **4b.** Re-extract `es_ES.json` with status translations — 15 statuses extracted (DB has no es_ES `AD_Ref_List_Trl` entries, so English fallback applies; `genericLabels` provides Spanish)
- [x] **4c.** `statusBadge.js` updated: now checks `dictionary.statuses[status]?.label` first, then `genericLabels` fallback

---

## Files Changed (Phase 1)

| File | Change |
|------|--------|
| `tools/app-shell/src/i18n/useUI.js` | **NEW** — React hook for generic UI labels |
| `tools/app-shell/src/i18n/resolveUI.js` | **NEW** — Pure function for non-React contexts |
| `tools/app-shell/src/i18n/index.js` | Export `useUI` and `resolveUI` |
| `tools/app-shell/src/locales/en_US.json` | Added `genericLabels` section (86 keys) |
| `tools/app-shell/src/locales/es_ES.json` | Added `genericLabels` section (86 keys, Spanish) |
| `tools/app-shell/src/lib/statusBadge.js` | `statusLabel()` accepts `dictionary` param |
| `tools/app-shell/src/components/contract-ui/ListView.jsx` | All strings → `ui()` |
| `tools/app-shell/src/components/contract-ui/DetailView.jsx` | All strings → `ui()`, `statusLabel` with dict |
| `tools/app-shell/src/components/contract-ui/DataTable.jsx` | All strings → `ui()`, `statusLabel` with dict |
| `tools/app-shell/src/components/contract-ui/DocumentStatusPill.jsx` | Status labels → `statusLabel` with dict |
| `tools/app-shell/src/pages/DashboardPage.jsx` | Widget labels → `labelKey` + `ui()` |
| `tools/app-shell/src/pages/ReportViewerPage.jsx` | All strings → `ui()` |
| `tools/app-shell/src/pages/SmartScanPage.jsx` | "New Scan" → `ui()` |
| `tools/app-shell/src/components/CommandPalette.jsx` | Placeholder + empty → `ui()` |
| `tools/app-shell/src/components/CopilotWidget.jsx` | Placeholder → `ui()` |

## Files Pending (Phases 2-4)

| File | Change |
|------|--------|
| `cli/src/resolve-curated.js` | Merge labelOverrides (Phase 2) |
| `NeoDiscoveryHelper.java` (etendo go) | Translated labels (Phase 3) |
| `cli/src/extract-labels.js` | Merge-safe write (done) + AD_Ref_List_Trl extraction (Phase 4) |
