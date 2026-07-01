# Line HandleDefaults Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pre-fill a new detail line's editable fields from the backend line `/defaults` response (including macro-default fields like `@DESCRIPTION1@`), with a per-entity `handlesDefaults` opt-out and a per-field `skipDefault` opt-out.

**Architecture:** Add `fetchChildDefaults(parentId)` to `useEntity` (mirrors the existing `fetchChildren`), reusing the exported `normalizeDefaultValue`. `DetailView` drives the fetch for the primary hook and each secondary-tab hook using the existing `parentRecordId`, and passes each hook's `childDefaults` map to the corresponding add-row as a new `resolvedDefaults` prop. `DataTable.buildEmpty` fills empty, non-`skipDefault` editable fields from that map. Two declarative knobs flow `decisions.json → contract → frontend`.

**Tech Stack:** React (app-shell), Vitest + React Testing Library, Node test runner (`node:test`) for generators, Playwright (mocked) for E2E. Pipeline generators are plain ESM Node (`cli/src`).

## Global Constraints

- All versioned content (code, comments, tests, docs, commit messages) MUST be in English.
- Commit messages: `Feature ETP-4244: <desc>` — first line ≤ 80 chars; NO `Co-Authored-By`.
- Knobs emitted **only when non-default**: `handlesDefaults` emitted only when `false`; `skipDefault` emitted only when `true`. Frontend treats absence as the default (`handlesDefaults`→true, `skipDefault`→false). This keeps regen diffs of existing windows byte-empty.
- Seeding semantics: **fill empties only** — a resolved default is applied only to a field currently empty (`null`/`''`) and not flagged `skipDefault`; never overrides literal defaults, client `lineNo`, display `seedValues`, or user input.
- node:test files: `*.test.js`. Vitest files: `*.vitest.js` / `*.vitest.jsx`. Run vitest from `tools/app-shell` (its own `vitest.config.js`). Do NOT run vitest from repo root.
- Backend dependency: the line `/defaults?parentId=` endpoint already resolves line defaults (incl. auxiliary inputs) — shipped in `com.etendoerp.go`. No backend work here.
- Do NOT edit generated files under `artifacts/*/generated/` by hand — only via `make regen`.

---

## Task 0: Establish green baseline

**Files:** none (verification only).

- [ ] **Step 1: Run the app-shell unit suite**

Run: `cd tools/app-shell && npx vitest run`
Expected: all files pass (record the totals, e.g. "N passed"). If anything fails BEFORE changes, stop and report — do not start implementing on a red baseline.

- [ ] **Step 2: Run the generator/CLI unit tests**

Run (from repo root): `node --test cli/test/generate-contract.test.js cli/test/generate-frontend.test.js`
Expected: exit 0.

- [ ] **Step 3: Run the Playwright mocked E2E suite**

Run: `cd e2e && npx playwright test`
Expected: pass (record totals). If the environment can't run Playwright, note it explicitly in the task report rather than skipping silently.

- [ ] **Step 4: Record the baseline**

Write the three result lines into the task report (counts + exit codes). This is the reference the final task compares against.

---

## Task 1: `skipDefault` field knob through the pipeline

**Files:**
- Modify: `cli/src/resolve-curated.js` (add `'skipDefault'` to `FIELD_DECISION_COPY_PROPS`, near line 195)
- Modify: `cli/src/generate-contract.js:319-336` (emit `mapped.skipDefault` when truthy)
- Modify: `cli/src/generate-frontend.js:1518-1546` (`buildEntryFieldLine` — emit `skipDefault` in the add-row field literal)
- Test: `cli/test/generate-contract.test.js`, `cli/test/generate-frontend.test.js`

**Interfaces:**
- Produces: contract field property `skipDefault: true` (omitted when false); generated add-row entry literal contains `, skipDefault: true`. Consumed by Task 4 (`DataTable.buildEmpty`).

- [ ] **Step 1: Write the failing contract test**

In `cli/test/generate-contract.test.js`, add:

```js
describe('generateFrontendContract — skipDefault', () => {
  const schema = {
    version: '0.1.0',
    window: { id: '900', name: 'GL Journal', primaryEntity: 'journal', category: 'finance' },
    entities: [
      { name: 'journal', table: 'GL_Journal', level: 'header', fields: [
        { name: 'description', column: 'Description', type: 'string', visibility: 'editable', required: false, grid: false, form: true },
      ] },
      { name: 'journalLine', table: 'GL_JournalLine', level: 'line', fields: [
        { name: 'account', column: 'Account_ID', type: 'foreignKey', reference: 'Account', inputMode: 'selector', visibility: 'editable', required: true, grid: true, form: true },
        { name: 'note', column: 'Note', type: 'string', visibility: 'editable', required: false, grid: true, form: true, skipDefault: true },
      ] },
    ],
  };
  it('emits skipDefault on a field that declares it', () => {
    const fc = generateFrontendContract(schema);
    const note = fc.entities.journalLine.fields.find(f => f.name === 'note');
    assert.equal(note.skipDefault, true);
  });
  it('omits skipDefault when the field does not declare it', () => {
    const fc = generateFrontendContract(schema);
    const account = fc.entities.journalLine.fields.find(f => f.name === 'account');
    assert.equal(account.skipDefault, undefined);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test cli/test/generate-contract.test.js`
Expected: FAIL (`note.skipDefault` is `undefined`).

- [ ] **Step 3: Emit `skipDefault` in `generate-contract.js`**

In `generateFrontendContract`, in the field `.map(f => { … })` block (right after the `if (f.inline) mapped.inline = true;` line, ~line 336), add:

```js
      if (f.skipDefault) mapped.skipDefault = true;
```

- [ ] **Step 4: Run the contract test to verify it passes**

Run: `node --test cli/test/generate-contract.test.js`
Expected: PASS.

- [ ] **Step 5: Make `resolve-curated` carry `skipDefault`**

In `cli/src/resolve-curated.js`, add `'skipDefault'` to the `FIELD_DECISION_COPY_PROPS` array (alongside `'clearsField'`, ~line 168):

```js
  'clearsField',
  // Opt a field OUT of HandleDefaults: the add-row never applies a resolved
  // backend default to it (it keeps its literal seed / stays empty).
  'skipDefault',
```

- [ ] **Step 6: Write the failing generate-frontend test**

In `cli/test/generate-frontend.test.js`, add a `describe('buildEntryFieldLine — skipDefault')` that drives the exported `generatePageComponent` (helpers aren't exported; follow the existing `addLineFields`/`forceCalloutFields` test pattern in this file). Use a line entity with an editable field `{ name: 'note', column: 'Note', type: 'string', visibility: 'editable', form: true, skipDefault: true }` and assert the generated `addLineFields.entry` literal for `note` contains `skipDefault: true`:

```js
  it('emits skipDefault in the add-row entry literal', () => {
    const code = generatePageComponent('header', 'line', skipDefaultContract);
    const entryMatch = code.match(/entry: \[([\s\S]*?)\],/);
    assert.ok(entryMatch, 'addLineFields.entry present');
    assert.match(entryMatch[1], /key: 'note'[^}]*skipDefault: true/);
  });
```

Build `skipDefaultContract` as a `{ frontendContract: { window, entities: { header, line } }, backendContract: { processEndpoints: [] } }` literal mirroring the existing fixtures in that file, with the `note` line field carrying `skipDefault: true` and `form: true`.

- [ ] **Step 7: Run it to verify it fails**

Run: `node --test cli/test/generate-frontend.test.js`
Expected: FAIL (no `skipDefault` in the literal).

- [ ] **Step 8: Emit `skipDefault` in `buildEntryFieldLine`**

In `cli/src/generate-frontend.js`, inside `buildEntryFieldLine` (~line 1518), add a part next to `clearsFieldPart`:

```js
  const skipDefaultPart = f.skipDefault ? ', skipDefault: true' : '';
```

and append `${skipDefaultPart}` to the returned literal (line ~1546), e.g. right after `${clearsFieldPart}`:

```js
  return `    { key: '${f.name}', column: '${f.column}', type: '${type}'${requiredPart}${lookupPart}${labelPart}${labelsDictPart}${clearsFieldPart}${skipDefaultPart}${referencePart}${inputModePart}${dependsOnPart}${defaultValuePart}${forceCalloutFieldsPart}${lookupDrawerPart}${lookupTitlePart}${onSelectMappingsPart}${displayFromCatalogPart}${minEntryPart} },`;
```

- [ ] **Step 9: Run both generator suites to verify they pass**

Run: `node --test cli/test/generate-contract.test.js cli/test/generate-frontend.test.js`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add cli/src/resolve-curated.js cli/src/generate-contract.js cli/src/generate-frontend.js cli/test/generate-contract.test.js cli/test/generate-frontend.test.js
git commit -m "Feature ETP-4244: Add skipDefault field knob through the pipeline"
```

---

## Task 2: `handlesDefaults` entity knob through the pipeline

**Files:**
- Modify: `cli/src/resolve-curated.js:522-534` (`applyEntityDecisions` — pass `handlesDefaults` through)
- Modify: `cli/src/generate-contract.js:388-392` (emit `feEntity.handlesDefaults` when `false`)
- Test: `cli/test/generate-contract.test.js`

**Interfaces:**
- Produces: contract entity property `handlesDefaults: false` (omitted otherwise). Consumed by Task 5 (`DetailView`).

- [ ] **Step 1: Write the failing contract test**

In `cli/test/generate-contract.test.js`, add:

```js
describe('generateFrontendContract — handlesDefaults', () => {
  const make = (handlesDefaults) => ({
    version: '0.1.0',
    window: { id: '900', name: 'GL Journal', primaryEntity: 'journal', category: 'finance' },
    entities: [
      { name: 'journal', table: 'GL_Journal', level: 'header', fields: [
        { name: 'description', column: 'Description', type: 'string', visibility: 'editable', required: false, grid: false, form: true },
      ] },
      { name: 'journalLine', table: 'GL_JournalLine', level: 'line',
        ...(handlesDefaults === undefined ? {} : { handlesDefaults }),
        fields: [
          { name: 'account', column: 'Account_ID', type: 'foreignKey', reference: 'Account', inputMode: 'selector', visibility: 'editable', required: true, grid: true, form: true },
        ] },
    ],
  });
  it('emits handlesDefaults:false when the entity opts out', () => {
    const fc = generateFrontendContract(make(false));
    assert.equal(fc.entities.journalLine.handlesDefaults, false);
  });
  it('omits handlesDefaults when the entity does not set it (default on)', () => {
    const fc = generateFrontendContract(make(undefined));
    assert.equal(fc.entities.journalLine.handlesDefaults, undefined);
  });
  it('omits handlesDefaults when explicitly true', () => {
    const fc = generateFrontendContract(make(true));
    assert.equal(fc.entities.journalLine.handlesDefaults, undefined);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test cli/test/generate-contract.test.js`
Expected: FAIL (first case: `handlesDefaults` is `undefined`).

- [ ] **Step 3: Emit `handlesDefaults` in `generate-contract.js`**

In `generateFrontendContract`, where `feEntity` is finalized (right before `entities[entity.name] = feEntity;`, ~line 391), add:

```js
    if (entity.handlesDefaults === false) feEntity.handlesDefaults = false;
```

- [ ] **Step 4: Make `resolve-curated` carry `handlesDefaults`**

In `cli/src/resolve-curated.js`, in `applyEntityDecisions` (~line 522), add after the `formCols` block:

```js
  if (entityDecision.handlesDefaults === false) {
    entity.handlesDefaults = false;
  }
```

- [ ] **Step 5: Run the contract test to verify it passes**

Run: `node --test cli/test/generate-contract.test.js`
Expected: PASS (all three cases).

- [ ] **Step 6: Commit**

```bash
git add cli/src/resolve-curated.js cli/src/generate-contract.js cli/test/generate-contract.test.js
git commit -m "Feature ETP-4244: Add handlesDefaults entity knob through the pipeline"
```

---

## Task 3: `useEntity.fetchChildDefaults`

**Files:**
- Modify: `tools/app-shell/src/hooks/useEntity.js` (add state `childDefaults`, function `fetchChildDefaults`, export both)
- Test: `tools/app-shell/src/hooks/__tests__/useEntity.fetchChildDefaults.vitest.jsx` (new)

**Interfaces:**
- Consumes: exported `normalizeDefaultValue(val, normalized, key)` (already in `useEntity.js`).
- Produces:
  - Hook state `childDefaults: Record<string, unknown>` (default `{}`), in the hook's return object.
  - `fetchChildDefaults(parentId: string): Promise<Record<string, unknown>>` — fetches `GET {apiBaseUrl}/{childEntity}/defaults?parentId={parentId}`, normalizes via `normalizeDefaultValue`, stores in `childDefaults`, returns the map. Returns `{}` (and sets `childDefaults` to `{}`) when `childEntity`/`parentId` is missing or on fetch error. In the hook's return object.

- [ ] **Step 1: Write the failing test**

Create `tools/app-shell/src/hooks/__tests__/useEntity.fetchChildDefaults.vitest.jsx`. Mirror the mock/setup style of the existing `useEntity` vitest specs (e.g. `useEntity.helpers.vitest.jsx`). Render the hook with `renderHook` from `@testing-library/react`, stub `global.fetch`:

```js
import { renderHook, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { useEntity } from '../useEntity.js';

describe('useEntity.fetchChildDefaults', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  const opts = { token: 't', apiBaseUrl: 'http://x/neo' };

  it('fetches line defaults, normalizes, and caches in childDefaults', async () => {
    const fetchMock = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ defaults: { description: 'Header desc', accountingDate: '22-06-2026', id: 'ignored' } }),
    }));
    global.fetch = fetchMock;
    const { result } = renderHook(() => useEntity('journal', 'journalLine', opts));

    let returned;
    await waitFor(async () => { returned = await result.current.fetchChildDefaults('PARENT-1'); });

    // URL carries parentId
    expect(fetchMock).toHaveBeenCalledWith(
      'http://x/neo/journalLine/defaults?parentId=PARENT-1',
      expect.any(Object),
    );
    // normalized: date dd-MM-yyyy -> yyyy-MM-dd; id dropped
    expect(returned).toEqual({ description: 'Header desc', accountingDate: '2026-06-22' });
    await waitFor(() => expect(result.current.childDefaults).toEqual({ description: 'Header desc', accountingDate: '2026-06-22' }));
  });

  it('returns {} when parentId is missing (no fetch)', async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock;
    const { result } = renderHook(() => useEntity('journal', 'journalLine', opts));
    const returned = await result.current.fetchChildDefaults('');
    expect(returned).toEqual({});
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns {} on fetch error', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) }));
    const { result } = renderHook(() => useEntity('journal', 'journalLine', opts));
    const returned = await result.current.fetchChildDefaults('PARENT-1');
    expect(returned).toEqual({});
  });
});
```

> Note: if the existing `useEntity` specs already stub `fetch` via a shared helper or `apiBaseUrl` differently, match that pattern instead of `global.fetch`. Check a sibling spec first.

- [ ] **Step 2: Run it to verify it fails**

Run: `cd tools/app-shell && npx vitest run src/hooks/__tests__/useEntity.fetchChildDefaults.vitest.jsx`
Expected: FAIL (`result.current.fetchChildDefaults` is not a function).

- [ ] **Step 3: Add `childDefaults` state**

In `tools/app-shell/src/hooks/useEntity.js`, beside `const [children, setChildren] = useState([]);` (~line 502):

```js
    const [childDefaults, setChildDefaults] = useState({});
```

- [ ] **Step 4: Add `fetchChildDefaults` (after `fetchChildren`, ~line 650)**

```js
    // HandleDefaults: fetch backend-resolved defaults for a NEW child line under
    // the given parent and normalize them (dates, booleans, enum ints) exactly as
    // handleNew does for the header. Returns a {key: value} map (also stored in
    // childDefaults). Best-effort: {} when childEntity/parentId is missing or on error.
    const fetchChildDefaults = useCallback(async (parentId) => {
        if (!childEntity || !parentId) {
            setChildDefaults({});
            return {};
        }
        try {
            const res = await fetch(`${apiBaseUrl}/${childEntity}/defaults?parentId=${parentId}`, { headers });
            if (!res.ok) throw new Error(`${res.status}`);
            const data = await res.json();
            const { id: _discardId, ...rest } = data?.defaults ?? {};
            const normalized = { ...rest };
            for (const [key, val] of Object.entries(normalized)) {
                normalizeDefaultValue(val, normalized, key);
            }
            setChildDefaults(normalized);
            return normalized;
        } catch {
            setChildDefaults({});
            return {};
        }
    }, [apiBaseUrl, childEntity, token, headers]);
```

- [ ] **Step 5: Export both from the hook return**

In the `return { … }` (~line 1013), add `childDefaults` next to `children` and `fetchChildDefaults` next to `fetchChildren`:

```js
        items, selected, editing, children, childDefaults, childrenLoading, loading, /* … */
        /* … */ refresh, fetchById, fetchChildren, fetchChildDefaults, loadMore,
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd tools/app-shell && npx vitest run src/hooks/__tests__/useEntity.fetchChildDefaults.vitest.jsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add tools/app-shell/src/hooks/useEntity.js tools/app-shell/src/hooks/__tests__/useEntity.fetchChildDefaults.vitest.jsx
git commit -m "Feature ETP-4244: Add useEntity.fetchChildDefaults for line defaults"
```

---

## Task 4: `DataTable` seeds empties from `resolvedDefaults`

**Files:**
- Modify: `tools/app-shell/src/components/contract-ui/DataTable.jsx` (`InlineAddRow` props + `buildEmpty` ~439-474; pass-through in `DataTable` ~1888-1910)
- Test: `tools/app-shell/src/components/contract-ui/__tests__/DataTable.resolvedDefaults.vitest.jsx` (new)

**Interfaces:**
- Consumes: `skipDefault` field flag (Task 1) on entries in `fields`.
- Produces: `InlineAddRow`/`DataTable` accept `resolvedDefaults?: Record<string, unknown>` (default `{}`); the add-row's initial values fill empty, non-`skipDefault` editable fields from it. Consumed/driven by Task 5.

- [ ] **Step 1: Write the failing test**

Create `tools/app-shell/src/components/contract-ui/__tests__/DataTable.resolvedDefaults.vitest.jsx`, mirroring the render/mocks of `DataTable.inlineAdd.vitest.jsx` (mock `sonner`, render `DataTable` with an active `addRow`). Cover, by reading the rendered input values:

```js
// fields include an editable macro-default field (description) and a skipDefault field (note)
const fields = [
  { key: 'lineNo', column: 'Line', type: 'number' },
  { key: 'description', column: 'Description', type: 'text' },
  { key: 'quantity', column: 'Qty', type: 'number', defaultValue: 1 },
  { key: 'note', column: 'Note', type: 'text', skipDefault: true },
];
const resolvedDefaults = { description: 'Header desc', quantity: 99, note: 'should-not-apply', lineNo: 5 };
```

Assertions (render with `addRow={{ active: true, fields, resolvedDefaults, onAdd, ... }}`):
1. `description` input value === `'Header desc'` (empty editable field filled from resolvedDefaults).
2. `quantity` input value === `'1'` (literal default preserved; resolvedDefaults does NOT override a non-empty field).
3. `note` input value === `''` (skipDefault → never filled).
4. `lineNo` input value === `'10'` (client-computed defaultLineNo wins; set before resolvedDefaults).

Use `data-testid="field-<key>"` (the add-row input testids) to read values; check a sibling spec for the exact selector.

- [ ] **Step 2: Run it to verify it fails**

Run: `cd tools/app-shell && npx vitest run src/components/contract-ui/__tests__/DataTable.resolvedDefaults.vitest.jsx`
Expected: FAIL (`description` is empty — `resolvedDefaults` not honored).

- [ ] **Step 3: Add `resolvedDefaults` to `InlineAddRow` props**

In `InlineAddRow`'s destructured props (~line 439), add `resolvedDefaults = EMPTY_SEED` (reuse the frozen empty-object constant used by `seedValues`, or add an equivalent `const EMPTY_DEFAULTS = Object.freeze({})`).

- [ ] **Step 4: Apply resolved defaults in `buildEmpty`**

In `buildEmpty` (~line 455), after the existing `seedValues` loop and before `return empty;`, add:

```js
    // HandleDefaults: fill EMPTY editable fields from backend-resolved line defaults.
    // Fill-empties-only: never override a literal default, the client lineNo, a
    // display seed, or a field opted out via skipDefault.
    for (const [key, val] of Object.entries(resolvedDefaults)) {
      const f = fieldMap[key];
      if (!f || f.skipDefault) continue;
      const cur = empty[key];
      if ((cur == null || cur === '') && val != null && val !== '') {
        empty[key] = val;
      }
    }
```

Add `resolvedDefaults` to the `buildEmpty` `useCallback` dependency array (line ~473): `[fields, defaultLineNo, seedValues, fieldMap, resolvedDefaults]`.

- [ ] **Step 5: Pass `resolvedDefaults` through `DataTable` → `InlineAddRow`**

In `DataTable`'s `<InlineAddRow … />` (~line 1900, next to `seedValues={addRow.seedValues}`), add:

```jsx
                resolvedDefaults={addRow.resolvedDefaults}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd tools/app-shell && npx vitest run src/components/contract-ui/__tests__/DataTable.resolvedDefaults.vitest.jsx`
Expected: PASS (all four assertions).

- [ ] **Step 7: Commit**

```bash
git add tools/app-shell/src/components/contract-ui/DataTable.jsx tools/app-shell/src/components/contract-ui/__tests__/DataTable.resolvedDefaults.vitest.jsx
git commit -m "Feature ETP-4244: Seed add-row empties from resolvedDefaults in DataTable"
```

---

## Task 5: `DetailView` drives the fetch and passes `resolvedDefaults`

**Files:**
- Modify: `tools/app-shell/src/components/contract-ui/DetailView.jsx` (effect to call `fetchChildDefaults`; pass `resolvedDefaults` into the primary add-row at ~3096 and the secondary add-row via `SecondaryTableTab` ~633-642)
- Test: `tools/app-shell/src/components/contract-ui/__tests__/DetailView.handleDefaults.vitest.jsx` (new)

**Interfaces:**
- Consumes: `hook.fetchChildDefaults` + `hook.childDefaults` (Task 3); each `secondaryHookN.fetchChildDefaults`/`childDefaults`; the primary add-row + secondary add-row `resolvedDefaults` prop (Task 4); contract entity flag `handlesDefaults` (Task 2).
- Produces: nothing downstream (terminal wiring).

- [ ] **Step 1: Read the surrounding code**

Read `DetailView.jsx`:
- `parentRecordId` definition (~line 1577).
- The secondary hooks `secondaryHook0..3` (~1572-1575) and how `SecondaryTableTab` receives its add-row props (~596-645).
- How the contract/entity metadata is reached (the `api` prop / `props.st`). Determine where `handlesDefaults` for an entity is readable. If the contract entities are not already threaded to `DetailView`, read it from `api?.entities?.[entityKey]?.handlesDefaults`; default true when absent. **Do not invent a new generated prop unless the contract entity flag is genuinely unreachable** — prefer reading the existing contract.

- [ ] **Step 2: Write the failing test**

Create `tools/app-shell/src/components/contract-ui/__tests__/DetailView.handleDefaults.vitest.jsx`, mirroring `DetailView.saveButtons.vitest.jsx` mocks. Make the mocked `useEntity` expose `fetchChildDefaults: vi.fn(() => Promise.resolve({ description: 'Header desc' }))` and `childDefaults: {}`. Cases:

1. **Fetch fires when enabled + parent known:** render `DetailView` for a saved record (recordId set, `hook.selected = { id: '123' }`) with the detail entity's `handlesDefaults` unset (default on). Assert `mockHook.fetchChildDefaults` was called with `'123'`.
2. **No fetch when opted out:** same, but contract entity `handlesDefaults: false` → assert `fetchChildDefaults` NOT called.
3. **resolvedDefaults reaches the add-row:** set `mockHook.childDefaults = { description: 'Header desc' }`, open the add-row (`addingLine`/click add), and assert the rendered description add-row input shows `'Header desc'` (integration of Tasks 4+5). If wiring the live add-row render is too heavy in the mock, instead assert the add-row receives the prop by spying on the `DataTable` mock's received `addRow.resolvedDefaults`.

> Pick the lighter of the two assertion styles in case 3 based on how `DetailView.saveButtons.vitest.jsx` mocks `DataTable`. Keep it deterministic.

- [ ] **Step 3: Run it to verify it fails**

Run: `cd tools/app-shell && npx vitest run src/components/contract-ui/__tests__/DetailView.handleDefaults.vitest.jsx`
Expected: FAIL (fetch not called / prop absent).

- [ ] **Step 4: Add the fetch effect**

In `DetailView`, after `parentRecordId` is defined, add an effect that fetches line defaults for the primary entity when enabled:

```jsx
  // HandleDefaults: fetch backend-resolved defaults for new lines once the parent
  // record is known, unless the entity opts out (handlesDefaults === false).
  const primaryHandlesDefaults = (api?.entities?.[detailEntity]?.handlesDefaults) !== false;
  useEffect(() => {
    if (!primaryHandlesDefaults || !parentRecordId) return;
    hook.fetchChildDefaults?.(parentRecordId);
  }, [primaryHandlesDefaults, parentRecordId, hook.fetchChildDefaults]);
```

Add the analogous effect for each active secondary tab hook, gated on that tab's entity `handlesDefaults`. If the secondary tabs are iterated, drive `secondaryHookN.fetchChildDefaults(parentRecordId)` for each present tab (guard on the tab existing). Keep the existing `eslint` deps rule satisfied.

- [ ] **Step 5: Pass `resolvedDefaults` into the primary add-row**

In the primary `addRow={{ … }}` object (~line 3096), add:

```jsx
                                    resolvedDefaults: hook.childDefaults,
```

- [ ] **Step 6: Pass `resolvedDefaults` into the secondary add-row**

In `SecondaryTableTab`'s `addRow` (~line 633-642, beside `seedValues: props.secondaryAddRowSeed`), add `resolvedDefaults: props.secondaryChildDefaults` and thread `secondaryChildDefaults={secondaryHookN.childDefaults}` from the `SecondaryTableTab` call site for each tab. Match the existing prop-passing pattern for `secondaryAddRowSeed`.

- [ ] **Step 7: Run the test to verify it passes**

Run: `cd tools/app-shell && npx vitest run src/components/contract-ui/__tests__/DetailView.handleDefaults.vitest.jsx`
Expected: PASS.

- [ ] **Step 8: Run the full contract-ui + hooks vitest folder (no regressions)**

Run: `cd tools/app-shell && npx vitest run src/components/contract-ui/__tests__/ src/hooks/__tests__/`
Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add tools/app-shell/src/components/contract-ui/DetailView.jsx tools/app-shell/src/components/contract-ui/__tests__/DetailView.handleDefaults.vitest.jsx
git commit -m "Feature ETP-4244: Wire line HandleDefaults fetch in DetailView"
```

---

## Task 6: Regenerate Simple G/L Journal + verify the line description populates

**Files:**
- Modify: `artifacts/simple-g-l-journal/decisions.json` (only if a `skipDefault`/`handlesDefaults` change is desired; by default NO change — defaults-on needs no decision edit)
- Regenerate: `artifacts/simple-g-l-journal/generated/web/simple-g-l-journal/*` via `make regen`

**Interfaces:** none (integration/verification).

- [ ] **Step 1: Regenerate the journal (no decisions change needed — feature is on by default)**

Run: `make regen ONLY=simple-g-l-journal SKIP_EXTRACT=1`
Expected: `✓ done`, `Passed: 1/1`.

- [ ] **Step 2: Confirm the generated add-row is unchanged for the journal**

The journal declares no `skipDefault`/`handlesDefaults`, so the generated `addLineFields` should be byte-identical to before (the feature is runtime, driven by the new `resolvedDefaults` prop, not the generated literals). Run:

Run: `git diff --stat artifacts/simple-g-l-journal/generated/`
Expected: no changes (or only timestamp/version churn — if so, revert non-semantic churn as in prior sessions).

- [ ] **Step 3: Validate pipeline**

Run: `node cli/src/validate-pipeline.js --scope=simple-g-l-journal`
Expected: `0 violation(s)`.

- [ ] **Step 4: Update the window guide**

Edit `docs/generated-custom-windows/simple-g-l-journal.md`: in the line `description` row and the Gap assessment, change the "deferred / inline add-row UI does not yet fetch /defaults" wording to state the add-row now pre-fills the description from the parent via the line `/defaults` fetch (HandleDefaults). Keep it accurate to the shipped behavior.

- [ ] **Step 5: Commit**

```bash
git add artifacts/simple-g-l-journal/ docs/generated-custom-windows/simple-g-l-journal.md
git commit -m "Feature ETP-4244: Enable line default pre-fill for G/L journal"
```

---

## Task 7: Playwright mocked E2E — line description pre-fill

**Files:**
- Modify/Create: `e2e/tests/flows/simple-gl-journal.mocked.spec.js` (extend the existing mocked journal flow, or add a focused spec)
- Reference: `docs/e2e-testing-guide.md` and the canonical `e2e/tests/flows/row-quick-actions.mocked.spec.js`

**Interfaces:** none (E2E).

- [ ] **Step 1: Read the E2E guide + the existing journal mocked spec**

Read `docs/e2e-testing-guide.md` and `e2e/tests/flows/simple-gl-journal.mocked.spec.js`. Identify how routes are mocked and how the line `/defaults` endpoint can be stubbed.

- [ ] **Step 2: Write the failing E2E assertion**

Add a test that: mocks `GET **/journalLine/defaults?parentId=*` (or the actual line entity path) to return `{ defaults: { description: 'Mocked header desc' } }`, opens an existing journal, clicks add-line, and asserts the description add-row input (`data-testid="field-description"`) has value `Mocked header desc`. Use `t()`/testid conventions — no hardcoded UI labels.

- [ ] **Step 3: Run it to verify it fails (if running before Task 6 deploy) or passes**

Run: `cd e2e && npx playwright test simple-gl-journal`
Expected: the new assertion drives the behavior. If the mocked app build doesn't yet include the change, note it; otherwise PASS.

- [ ] **Step 4: Commit**

```bash
git add e2e/tests/flows/simple-gl-journal.mocked.spec.js
git commit -m "Feature ETP-4244: E2E mocked line default pre-fill for journal"
```

---

## Task 8: Document the knobs

**Files:**
- Modify: `docs/decisions-reference.md`

**Interfaces:** none.

- [ ] **Step 1: Document `handlesDefaults` (entity) and `skipDefault` (field)**

In `docs/decisions-reference.md`:
- Under the entity-level decisions table (near `draftMode`/`httpMethods`), add `handlesDefaults` (boolean, default `true`): "When `false`, the detail entity's add-row does not fetch `/defaults`; new lines keep literal-only seeding."
- Under the field properties tables, add `skipDefault` (boolean, default `false`): "Opt a field out of HandleDefaults — the add-row never applies a backend-resolved default to it."
- Add a short "Line HandleDefaults" note explaining the add-row fetches `/{detailEntity}/defaults?parentId=` on open (parent known) and fills empty editable fields, reusing the header-defaults normalization; backend resolves macros/auxiliary inputs.

- [ ] **Step 2: Commit**

```bash
git add docs/decisions-reference.md
git commit -m "Feature ETP-4244: Document handlesDefaults and skipDefault knobs"
```

---

## Task 9: Final verification — rerun the suites

**Files:** none (verification).

- [ ] **Step 1: Rerun app-shell unit suite**

Run: `cd tools/app-shell && npx vitest run`
Expected: all pass; count ≥ baseline + new tests (Tasks 3, 4, 5).

- [ ] **Step 2: Rerun generator/CLI tests**

Run (repo root): `node --test cli/test/generate-contract.test.js cli/test/generate-frontend.test.js`
Expected: exit 0.

- [ ] **Step 3: Rerun Playwright mocked suite**

Run: `cd e2e && npx playwright test`
Expected: pass (incl. the new journal pre-fill assertion).

- [ ] **Step 4: Validate pipeline (whole repo or journal scope)**

Run: `node cli/src/validate-pipeline.js --scope=simple-g-l-journal`
Expected: `0 violation(s)`.

- [ ] **Step 5: Report**

Compare against the Task 0 baseline: confirm no pre-existing test regressed and the new tests pass. Summarize results (counts + exit codes). Do NOT push — the user controls commits/push.

---

## Notes for the implementer

- **Do not push.** Commit locally; the user decides when to push (and the schema_forge pre-push hook runs domain-boundary + Sonar + regen-check, which is heavy).
- **Cross-domain:** this change is `platform-change` (app-shell) + `generator-change` (cli) + `window:simple-g-l-journal`. Before any push, the existing `docs/plans/ETP-4244-cross-domain.md` must cover it — append a "HandleDefaults" follow-up section (domains, tests, rollback) so the domain-boundary gate passes. (Push is out of scope for this plan.)
- **gradlew Java tests:** out of scope per the user.
- **Reuse, don't duplicate:** `fetchChildDefaults` deliberately mirrors `handleNew`'s normalization via the shared `normalizeDefaultValue` — do not reimplement date/boolean coercion.
