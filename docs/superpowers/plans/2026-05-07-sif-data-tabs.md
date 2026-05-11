# SIF Data Tabs — Sales Invoice Window Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add conditional SII/TBAI tabs inside `InvoiceBottomPanel` that show fiscal header fields (currently absent from the contract) based on the organization's fiscal profile.

**Architecture:** Reclassify 11 header fields in `decisions.json` with `form: false` (included in API response, excluded from main form) then run `make regen`. Create `SifDataTabs.jsx` that reads those fields from the `data` prop, renders tab navigation based on `useFiscalConfig`, and auto-saves editable SII fields via PATCH on blur. Import it at the top of `InvoiceBottomPanel.jsx`.

**Tech Stack:** React (hooks), fetch API, `sonner` toast, `useFiscalConfig` hook, Node test runner + `assert`.

**Spec:** `docs/superpowers/specs/2026-05-07-sif-data-tabs-design.md`

---

## Field Reference

### SII fields (all on C_Invoice header, entity `0` in schema-raw.json)

| API key | Label | Type | In SifDataTabs |
|---|---|---|---|
| `aeatsiiClaveTipo` | Invoice type key | enum [R, F1, F2, F4] | Editable `<select>` |
| `aeatsiiDescription` | SII description master | FK selector | Read-only display (`$_identifier`) |
| `aeatsiiDescripcionSii` | SII Description | text | Editable `<input>` |
| `aeatsiiCauseExemption` | SII - Cause Exemption | FK selector | Read-only display (`$_identifier`) |
| `aeatsiiIsauthorization` | Authorization | boolean | Editable `<checkbox>` |
| `aeatsiiFechaOperacion` | Fecha operación | date | Editable `<input type="date">` |
| `aeatsiiEjercicio` | SII exercise | integer | Read-only display |
| `aeatsiiPeriodo` | SII period | integer | Read-only display |

> FK fields (`aeatsiiDescription`, `aeatsiiCauseExemption`) are displayed as read-only text using the `$_identifier` key returned by NEO. Full selector editing is deferred.

### TBAI fields (all read-only)

| API key | Label | Type |
|---|---|---|
| `tbaiSequence` | Secuencia de encadenamiento | integer |
| `tbaiInvoicenum` | Serie Factura | string |
| `tbaiInvoiceseq` | Secuencia Factura | string |

---

## File Map

| File | Action |
|---|---|
| `artifacts/sales-invoice/decisions.json` | **Modify** — add 11 fields to `entities.header.fields` |
| `artifacts/sales-invoice/custom/SifDataTabs.jsx` | **Create** |
| `artifacts/sales-invoice/custom/__tests__/SifDataTabs.test.js` | **Create** |
| `artifacts/sales-invoice/custom/InvoiceBottomPanel.jsx` | **Modify** — import + 1 JSX line |
| `artifacts/sales-invoice/custom/__tests__/InvoiceBottomPanel.test.js` (if exists) | **Modify** — add assertions |

---

## Task 1: Reclassify fields in decisions.json and regenerate

**Files:**
- Modify: `artifacts/sales-invoice/decisions.json`

- [ ] **Step 1: Add the 11 fields to `entities.header.fields` in decisions.json**

Open `artifacts/sales-invoice/decisions.json`. Find the `entities.header.fields` object and add the following entries (they do not exist yet — add them alongside existing field overrides):

```json
"aeatsiiClaveTipo": { "visibility": "editable", "form": false },
"aeatsiiDescription": { "visibility": "editable", "form": false },
"aeatsiiDescripcionSii": { "visibility": "editable", "form": false },
"aeatsiiCauseExemption": { "visibility": "editable", "form": false },
"aeatsiiIsauthorization": { "visibility": "editable", "form": false },
"aeatsiiFechaOperacion": { "visibility": "editable", "form": false },
"aeatsiiEjercicio": { "visibility": "readOnly", "form": false },
"aeatsiiPeriodo": { "visibility": "readOnly", "form": false },
"tbaiSequence": { "visibility": "readOnly", "form": false },
"tbaiInvoicenum": { "visibility": "readOnly", "form": false },
"tbaiInvoiceseq": { "visibility": "readOnly", "form": false }
```

`form: false` means the pipeline includes these fields in the contract and API response but does NOT render them in the generated `HeaderForm.jsx`.

- [ ] **Step 2: Run make regen**

```bash
make regen ONLY=sales-invoice SKIP_EXTRACT=1
```

Expected output ends with: `✓ done` and `Passed: 1/1`

- [ ] **Step 3: Verify fields appear in contract.json**

```bash
node -e "
const c = JSON.parse(require('fs').readFileSync('artifacts/sales-invoice/contract.json','utf8'));
const h = c.frontendContract.entities.header;
const keys = ['aeatsiiClaveTipo','aeatsiiDescripcionSii','aeatsiiIsauthorization','aeatsiiEjercicio','tbaiSequence','tbaiInvoicenum'];
keys.forEach(k => {
  const f = h.fields.find(f => f.name === k);
  console.log(k, f ? 'visibility:' + f.visibility + ' form:' + f.form : 'NOT FOUND');
});
"
```

Expected: all 6 fields found, `aeatsiiClaveTipo` shows `visibility:editable form:false`, `aeatsiiEjercicio` shows `visibility:readOnly form:false`, `tbaiSequence` shows `visibility:readOnly form:false`.

- [ ] **Step 4: Verify HeaderForm.jsx does NOT contain the new fields**

```bash
grep -c "aeatsiiClaveTipo\|tbaiSequence" artifacts/sales-invoice/generated/web/sales-invoice/HeaderForm.jsx
```

Expected: `0` (fields are not rendered in the main form).

- [ ] **Step 5: Commit**

```bash
git add artifacts/sales-invoice/decisions.json artifacts/sales-invoice/contract.json artifacts/sales-invoice/generated/
git commit -m "Feature ETP-3778: reclassify SII/TBAI header fields for SifDataTabs"
```

---

## Task 2: Create SifDataTabs component with tests

**Files:**
- Create: `artifacts/sales-invoice/custom/SifDataTabs.jsx`
- Create: `artifacts/sales-invoice/custom/__tests__/SifDataTabs.test.js`

- [ ] **Step 1: Write the failing test**

Create `artifacts/sales-invoice/custom/__tests__/SifDataTabs.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'SifDataTabs.jsx'), 'utf8');

describe('SifDataTabs', () => {

  it('exports a default function component named SifDataTabs', () => {
    assert.match(src, /export default function SifDataTabs/);
  });

  it('accepts data, recordId, token, and apiBaseUrl props', () => {
    assert.match(src, /\{\s*data.*recordId.*token.*apiBaseUrl\s*\}/);
  });

  it('imports useFiscalConfig from fiscal-config path', () => {
    assert.match(src, /from\s+['"]@\/windows\/custom\/fiscal-config\/useFiscalConfig/);
  });

  it('defines SII_PROFILES set containing sii, sii-navarra, sii+tbai', () => {
    assert.match(src, /SII_PROFILES/);
    assert.match(src, /'sii-navarra'/);
    assert.match(src, /'sii\+tbai'/);
  });

  it('defines TBAI_PROFILES set containing tbai and sii+tbai', () => {
    assert.match(src, /TBAI_PROFILES/);
    assert.match(src, /'tbai'/);
  });

  it('returns null when neither showSii nor showTbai', () => {
    assert.match(src, /!showSii.*!showTbai.*return null|return null.*!showSii.*!showTbai/s);
  });

  it('renders SII tab button when showSii is true', () => {
    assert.match(src, /showSii.*SII|SII.*showSii/s);
  });

  it('renders TBAI tab button when showTbai is true', () => {
    assert.match(src, /showTbai.*TBAI|TBAI.*showTbai/s);
  });

  it('manages activeTab state with sii as possible value', () => {
    assert.match(src, /activeTab.*'sii'|'sii'.*activeTab/s);
  });

  it('calls useFiscalConfig with orgId from data.organization', () => {
    assert.match(src, /data\?\.organization/);
    assert.match(src, /useFiscalConfig\(orgId/);
  });

  it('uses PATCH method to save editable fields', () => {
    assert.match(src, /method:\s*'PATCH'/);
  });

  it('calls PATCH on the sales-invoice header endpoint', () => {
    assert.match(src, /sales-invoice\/header\/\$\{recordId\}/);
  });

  it('defines a patchField async function', () => {
    assert.match(src, /async function patchField/);
  });

  it('handles blur event for auto-save', () => {
    assert.match(src, /handleBlur|onBlur/);
  });

  it('shows aeatsiiClaveTipo as a select with enum options', () => {
    assert.match(src, /aeatsiiClaveTipo/);
    assert.match(src, /CLAVE_TIPO_OPTIONS/);
  });

  it('renders tbaiSequence, tbaiInvoicenum, and tbaiInvoiceseq read-only', () => {
    assert.match(src, /tbaiSequence/);
    assert.match(src, /tbaiInvoicenum/);
    assert.match(src, /tbaiInvoiceseq/);
  });

  it('shows SII exercise and SII period as read-only displays', () => {
    assert.match(src, /aeatsiiEjercicio/);
    assert.match(src, /aeatsiiPeriodo/);
  });

  it('uses toast.error on PATCH failure', () => {
    assert.match(src, /toast\.error/);
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

```bash
node --test artifacts/sales-invoice/custom/__tests__/SifDataTabs.test.js 2>&1 | tail -5
```

Expected: `# fail 1` (file not found error — all tests fail).

- [ ] **Step 3: Create SifDataTabs.jsx**

Create `artifacts/sales-invoice/custom/SifDataTabs.jsx`:

```jsx
import { useState, useMemo } from 'react';
import { toast } from 'sonner';
import { useFiscalConfig } from '@/windows/custom/fiscal-config/useFiscalConfig.js';

const SII_PROFILES = new Set(['sii', 'sii-navarra', 'sii+tbai']);
const TBAI_PROFILES = new Set(['tbai', 'sii+tbai']);

const CLAVE_TIPO_OPTIONS = [
  { value: 'R', label: 'Corrective invoice' },
  { value: 'F1', label: 'Invoice' },
  { value: 'F2', label: 'Simplified invoice' },
  { value: 'F4', label: 'Simplified invoices summary' },
];

function Field({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <label style={{ fontSize: '12px', color: '#6b7280' }}>{label}</label>
      {children}
    </div>
  );
}

function ReadValue({ value }) {
  return (
    <span style={{ padding: '6px 8px', fontSize: '13px', color: '#374151' }}>
      {value ?? '—'}
    </span>
  );
}

const INPUT_STYLE = { padding: '6px 8px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '13px' };

export default function SifDataTabs({ data, recordId, token, apiBaseUrl }) {
  const orgId = data?.organization ?? null;
  const base = useMemo(() => (apiBaseUrl || '').replace(/\/[^/]+$/, ''), [apiBaseUrl]);
  const headers = useMemo(() => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }), [token]);

  const { profile } = useFiscalConfig(orgId, token, apiBaseUrl);

  const showSii = SII_PROFILES.has(profile);
  const showTbai = TBAI_PROFILES.has(profile);

  const [activeTab, setActiveTab] = useState('sii');
  const [siiForm, setSiiForm] = useState({
    aeatsiiClaveTipo: data?.aeatsiiClaveTipo ?? '',
    aeatsiiDescripcionSii: data?.aeatsiiDescripcionSii ?? '',
    aeatsiiIsauthorization: data?.aeatsiiIsauthorization ?? false,
    aeatsiiFechaOperacion: data?.aeatsiiFechaOperacion?.slice(0, 10) ?? '',
  });

  if (!showSii && !showTbai) return null;

  const effectiveTab = (!showSii && activeTab === 'sii' && showTbai) ? 'tbai' : activeTab;

  async function patchField(fieldKey, value) {
    try {
      const res = await fetch(
        `${base}/sales-invoice/header/${recordId}`,
        { method: 'PATCH', headers, body: JSON.stringify({ [fieldKey]: value }) },
      );
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.response?.message || `HTTP ${res.status}`);
      }
    } catch (err) {
      toast.error(err.message);
      setSiiForm(prev => ({ ...prev, [fieldKey]: data?.[fieldKey] ?? '' }));
    }
  }

  function handleBlur(fieldKey, value) {
    const original = String(data?.[fieldKey] ?? '');
    if (String(value) === original) return;
    patchField(fieldKey, value);
  }

  return (
    <div style={{ borderTop: '1px solid #e2e8f0' }}>
      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0' }}>
        {showSii && (
          <button
            type="button"
            onClick={() => setActiveTab('sii')}
            style={{
              padding: '8px 16px', fontSize: '13px', background: 'transparent', border: 'none', cursor: 'pointer',
              fontWeight: effectiveTab === 'sii' ? 600 : 400,
              borderBottom: effectiveTab === 'sii' ? '2px solid #1d4ed8' : '2px solid transparent',
              color: effectiveTab === 'sii' ? '#1d4ed8' : '#6b7280',
            }}
          >
            SII
          </button>
        )}
        {showTbai && (
          <button
            type="button"
            onClick={() => setActiveTab('tbai')}
            style={{
              padding: '8px 16px', fontSize: '13px', background: 'transparent', border: 'none', cursor: 'pointer',
              fontWeight: effectiveTab === 'tbai' ? 600 : 400,
              borderBottom: effectiveTab === 'tbai' ? '2px solid #1d4ed8' : '2px solid transparent',
              color: effectiveTab === 'tbai' ? '#1d4ed8' : '#6b7280',
            }}
          >
            TBAI
          </button>
        )}
      </div>

      {/* SII panel */}
      {effectiveTab === 'sii' && showSii && (
        <div style={{ padding: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
          <Field label="Fecha operación">
            <input
              type="date"
              style={INPUT_STYLE}
              value={siiForm.aeatsiiFechaOperacion}
              onChange={e => setSiiForm(prev => ({ ...prev, aeatsiiFechaOperacion: e.target.value }))}
              onBlur={e => handleBlur('aeatsiiFechaOperacion', e.target.value)}
            />
          </Field>
          <Field label="Invoice type key">
            <select
              style={INPUT_STYLE}
              value={siiForm.aeatsiiClaveTipo}
              onChange={e => setSiiForm(prev => ({ ...prev, aeatsiiClaveTipo: e.target.value }))}
              onBlur={e => handleBlur('aeatsiiClaveTipo', e.target.value)}
            >
              <option value="" />
              {CLAVE_TIPO_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
          <Field label="SII description master">
            <ReadValue value={data?.['aeatsiiDescription$_identifier']} />
          </Field>
          <Field label="SII Description" style={{ gridColumn: 'span 2' }}>
            <input
              type="text"
              style={INPUT_STYLE}
              value={siiForm.aeatsiiDescripcionSii}
              onChange={e => setSiiForm(prev => ({ ...prev, aeatsiiDescripcionSii: e.target.value }))}
              onBlur={e => handleBlur('aeatsiiDescripcionSii', e.target.value)}
            />
          </Field>
          <Field label="SII exercise">
            <ReadValue value={data?.aeatsiiEjercicio} />
          </Field>
          <Field label="SII period">
            <ReadValue value={data?.aeatsiiPeriodo} />
          </Field>
          <Field label="SII - Cause Exemption">
            <ReadValue value={data?.['aeatsiiCauseExemption$_identifier']} />
          </Field>
          <Field label="Authorization">
            <input
              type="checkbox"
              style={{ width: '16px', height: '16px', marginTop: '6px' }}
              checked={!!siiForm.aeatsiiIsauthorization}
              onChange={e => {
                const val = e.target.checked;
                setSiiForm(prev => ({ ...prev, aeatsiiIsauthorization: val }));
                patchField('aeatsiiIsauthorization', val);
              }}
            />
          </Field>
        </div>
      )}

      {/* TBAI panel */}
      {effectiveTab === 'tbai' && showTbai && (
        <div style={{ padding: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
          <Field label="Secuencia de encadenamiento">
            <ReadValue value={data?.tbaiSequence} />
          </Field>
          <Field label="Serie Factura">
            <ReadValue value={data?.tbaiInvoicenum} />
          </Field>
          <Field label="Secuencia Factura">
            <ReadValue value={data?.tbaiInvoiceseq} />
          </Field>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test — verify it passes**

```bash
node --test artifacts/sales-invoice/custom/__tests__/SifDataTabs.test.js 2>&1 | tail -8
```

Expected: `# pass 18`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add artifacts/sales-invoice/custom/SifDataTabs.jsx artifacts/sales-invoice/custom/__tests__/SifDataTabs.test.js
git commit -m "Feature ETP-3778: add SifDataTabs component with tests"
```

---

## Task 3: Integrate SifDataTabs into InvoiceBottomPanel

**Files:**
- Modify: `artifacts/sales-invoice/custom/InvoiceBottomPanel.jsx`
- Modify: `artifacts/sales-invoice/custom/__tests__/InvoiceBottomPanel.test.js` (if it exists — check with `ls`)

- [ ] **Step 1: Check if InvoiceBottomPanel has a test file**

```bash
ls artifacts/sales-invoice/custom/__tests__/
```

If `InvoiceBottomPanel.test.js` exists, add assertions in Step 2. If not, skip to Step 3.

- [ ] **Step 2: Add failing tests to InvoiceBottomPanel.test.js (if file exists)**

Append inside the `describe` block before the closing `}`:

```js
  // ── SifDataTabs integration ────────────────────────────────────────────────

  it('imports SifDataTabs from the custom directory', () => {
    assert.match(src, /import SifDataTabs from ['"]\.\/SifDataTabs['"]/);
  });

  it('renders SifDataTabs with data, recordId, token, and apiBaseUrl props', () => {
    assert.match(src, /<SifDataTabs/);
    assert.match(src, /data=\{data\}/);
    assert.match(src, /recordId=\{recordId\}/);
    assert.match(src, /token=\{token\}/);
    assert.match(src, /apiBaseUrl=\{apiBaseUrl\}/);
  });
```

Run to verify they fail:

```bash
node --test artifacts/sales-invoice/custom/__tests__/InvoiceBottomPanel.test.js 2>&1 | grep -E "imports SifDataTabs|renders SifDataTabs|# fail"
```

Expected: `# fail 2` for the new tests.

- [ ] **Step 3: Add import to InvoiceBottomPanel.jsx**

In `artifacts/sales-invoice/custom/InvoiceBottomPanel.jsx`, after the last existing import line (currently line 7: `import DocumentTotalsPanel ...`), add:

```jsx
import SifDataTabs from './SifDataTabs';
```

- [ ] **Step 4: Add SifDataTabs to JSX return**

In `artifacts/sales-invoice/custom/InvoiceBottomPanel.jsx`, locate the main return block. It starts with:

```jsx
  return (
    <div className="flex flex-col">
      <div className="flex">
```

Replace with:

```jsx
  return (
    <div className="flex flex-col">
      <SifDataTabs data={data} recordId={recordId} token={token} apiBaseUrl={apiBaseUrl} />
      <div className="flex">
```

- [ ] **Step 5: Run all tests**

```bash
node --test artifacts/sales-invoice/custom/__tests__/SifDataTabs.test.js artifacts/sales-invoice/custom/__tests__/InvoiceBottomPanel.test.js 2>&1 | tail -8
```

Expected: all pass (0 failures).

- [ ] **Step 6: Run pipeline validator**

```bash
node cli/src/validate-pipeline.js --scope=sales-invoice
```

Expected: `0 violation(s)`.

- [ ] **Step 7: Commit**

```bash
git add artifacts/sales-invoice/custom/InvoiceBottomPanel.jsx
# Add test file only if it was modified
git add artifacts/sales-invoice/custom/__tests__/InvoiceBottomPanel.test.js 2>/dev/null || true
git commit -m "Feature ETP-3778: integrate SifDataTabs into InvoiceBottomPanel"
```
