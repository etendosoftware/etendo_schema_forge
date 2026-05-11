# Send to SIF Button — Sales Invoice Window Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a unified "Enviar a SIF" topbar button to the Sales Invoice detail view that auto-detects the active fiscal system (SII, TBAI, or SII+TBAI) and sends the confirmed invoice to the correct endpoints via a blocking confirmation modal.

**Architecture:** New self-contained `SendToSifButton.jsx` component in the custom layer, integrated into `InvoiceTopbarExtra.jsx` with one import and one JSX line. Fiscal system detection reuses `useFiscalConfig()` from the existing fiscal-config window. API calls use direct fetch (same pattern as `PurchaseOrderActions.jsx`) for independent per-system Promise control.

**Tech Stack:** React (hooks), fetch API, `@/i18n` (`useUI`), existing `useFiscalConfig` hook, Node test runner + `assert` for source-inspection tests.

**Spec:** `docs/superpowers/specs/2026-05-07-send-to-sif-button-design.md`

---

## File Map

| File | Action |
|---|---|
| `artifacts/sales-invoice/custom/SendToSifButton.jsx` | **Create** — button + modal component |
| `artifacts/sales-invoice/custom/__tests__/SendToSifButton.test.js` | **Create** — source-inspection tests |
| `artifacts/sales-invoice/custom/InvoiceTopbarExtra.jsx` | **Modify** — import + 1 JSX line in main return |
| `artifacts/sales-invoice/custom/__tests__/InvoiceTopbarExtra.test.js` | **Modify** — add integration assertion |
| `tools/app-shell/src/locales/en_US.json` | **Modify** — 11 new keys after line 18136 |
| `tools/app-shell/src/locales/es_ES.json` | **Modify** — 11 new keys after line 18375 |

---

## Task 1: Add i18n keys

**Files:**
- Modify: `tools/app-shell/src/locales/en_US.json:18136`
- Modify: `tools/app-shell/src/locales/es_ES.json:18375`

- [ ] **Step 1: Add keys to en_US.json**

In `tools/app-shell/src/locales/en_US.json`, replace line 18136:
```json
    "fiscalMonitor.orgFallback": "Organization"
```
with:
```json
    "fiscalMonitor.orgFallback": "Organization",
    "sendToSif": "Send to SIF",
    "sendToSifTitle": "Send to Tax System",
    "sendToSifBodySii": "This invoice will be sent to SII.",
    "sendToSifBodyTbai": "This invoice will be sent to TBAI.",
    "sendToSifBodyBoth": "This invoice will be sent to SII and TBAI.",
    "sendToSifConfirm": "Send",
    "sendToSifSending": "Sending… this may take a few seconds.",
    "sendToSifSuccessSii": "Sent to SII successfully.",
    "sendToSifSuccessTbai": "Sent to TBAI successfully.",
    "sendToSifErrorSii": "Error sending to SII.",
    "sendToSifErrorTbai": "Error sending to TBAI."
```

- [ ] **Step 2: Add keys to es_ES.json**

In `tools/app-shell/src/locales/es_ES.json`, replace line 18375:
```json
    "fiscalMonitor.orgFallback": "Organización"
```
with:
```json
    "fiscalMonitor.orgFallback": "Organización",
    "sendToSif": "Enviar a SIF",
    "sendToSifTitle": "Enviar al sistema fiscal",
    "sendToSifBodySii": "Esta factura se enviará al SII.",
    "sendToSifBodyTbai": "Esta factura se enviará a TBAI.",
    "sendToSifBodyBoth": "Esta factura se enviará al SII y a TBAI.",
    "sendToSifConfirm": "Enviar",
    "sendToSifSending": "Enviando… esto puede tardar unos segundos.",
    "sendToSifSuccessSii": "Enviado al SII correctamente.",
    "sendToSifSuccessTbai": "Enviado a TBAI correctamente.",
    "sendToSifErrorSii": "Error al enviar al SII.",
    "sendToSifErrorTbai": "Error al enviar a TBAI."
```

- [ ] **Step 3: Verify JSON is valid**

```bash
node -e "JSON.parse(require('fs').readFileSync('tools/app-shell/src/locales/en_US.json','utf8')); console.log('en_US OK')"
node -e "JSON.parse(require('fs').readFileSync('tools/app-shell/src/locales/es_ES.json','utf8')); console.log('es_ES OK')"
```
Expected: `en_US OK` and `es_ES OK`

- [ ] **Step 4: Commit**

```bash
git add tools/app-shell/src/locales/en_US.json tools/app-shell/src/locales/es_ES.json
git commit -m "Feature ETP-3778: add sendToSif i18n keys to en_US and es_ES"
```

---

## Task 2: Create SendToSifButton component with tests

**Files:**
- Create: `artifacts/sales-invoice/custom/SendToSifButton.jsx`
- Create: `artifacts/sales-invoice/custom/__tests__/SendToSifButton.test.js`

- [ ] **Step 1: Write the failing test**

Create `artifacts/sales-invoice/custom/__tests__/SendToSifButton.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'SendToSifButton.jsx'), 'utf8');

describe('SendToSifButton', () => {

  it('exports a default function component named SendToSifButton', () => {
    assert.match(src, /export default function SendToSifButton/);
  });

  it('accepts data, recordId, token, apiBaseUrl, and status props', () => {
    assert.match(src, /\{\s*data.*recordId.*token.*apiBaseUrl.*status\s*\}/);
  });

  it('returns null when status is not CO', () => {
    assert.match(src, /status\s*!==\s*'CO'/);
  });

  it('uses useFiscalConfig hook', () => {
    assert.match(src, /useFiscalConfig/);
  });

  it('imports useFiscalConfig from fiscal-config path', () => {
    assert.match(src, /from\s+['"]@\/windows\/custom\/fiscal-config\/useFiscalConfig/);
  });

  it('defines VISIBLE_PROFILES set with sii, tbai, and sii+tbai profiles', () => {
    assert.match(src, /VISIBLE_PROFILES/);
    assert.match(src, /'sii'/);
    assert.match(src, /'tbai'/);
    assert.match(src, /'sii\+tbai'/);
  });

  it('returns null when profile is not in VISIBLE_PROFILES', () => {
    assert.match(src, /VISIBLE_PROFILES\.has\(profile\)/);
  });

  it('calls SII endpoint Em_aeatsii_send', () => {
    assert.match(src, /Em_aeatsii_send/);
  });

  it('calls TBAI endpoint Em_Tbai_Xmlgenerator', () => {
    assert.match(src, /Em_Tbai_Xmlgenerator/);
  });

  it('uses three modal phases: confirm, sending, results', () => {
    assert.match(src, /'confirm'/);
    assert.match(src, /'sending'/);
    assert.match(src, /'results'/);
  });

  it('sets phase to sending before fetch calls', () => {
    assert.match(src, /setPhase\('sending'\)/);
  });

  it('sets phase to results after fetch calls', () => {
    assert.match(src, /setPhase\('results'\)/);
  });

  it('handles SII and TBAI independently (separate try/catch)', () => {
    // Both catch blocks must exist, not one wrapping both
    const catchCount = (src.match(/\}\s*catch\s*\(/g) || []).length;
    assert.ok(catchCount >= 2, `Expected at least 2 catch blocks, found ${catchCount}`);
  });

  it('uses sendToSif i18n key for button label', () => {
    assert.match(src, /ui\(['"]sendToSif['"]\)/);
  });

  it('uses sendToSifTitle i18n key for modal title', () => {
    assert.match(src, /ui\(['"]sendToSifTitle['"]\)/);
  });

  it('uses sendToSifSending i18n key during send phase', () => {
    assert.match(src, /ui\(['"]sendToSifSending['"]\)/);
  });

  it('shows success and error result rows using i18n keys', () => {
    assert.match(src, /ui\(['"]sendToSifSuccessSii['"]\)/);
    assert.match(src, /ui\(['"]sendToSifSuccessTbai['"]\)/);
    assert.match(src, /ui\(['"]sendToSifErrorSii['"]\)/);
    assert.match(src, /ui\(['"]sendToSifErrorTbai['"]\)/);
  });

  it('derives orgId from data.organization', () => {
    assert.match(src, /data\?\.organization/);
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

```bash
cd /Users/gremiger/workspaces/etendogoclean/etendo/etendo_schema_forge
node --test artifacts/sales-invoice/custom/__tests__/SendToSifButton.test.js
```
Expected: Multiple `FAIL` lines (file does not exist yet).

- [ ] **Step 3: Create SendToSifButton.jsx**

Create `artifacts/sales-invoice/custom/SendToSifButton.jsx`:

```jsx
import { useState, useMemo } from 'react';
import { useUI } from '@/i18n';
import { useFiscalConfig } from '@/windows/custom/fiscal-config/useFiscalConfig.js';

const VISIBLE_PROFILES = new Set(['sii', 'sii-navarra', 'tbai', 'sii+tbai']);

export default function SendToSifButton({ data, recordId, token, apiBaseUrl, status }) {
  const ui = useUI();
  const [modalOpen, setModalOpen] = useState(false);
  const [phase, setPhase] = useState('confirm');
  const [results, setResults] = useState({});

  const orgId = data?.organization ?? null;
  const base = useMemo(() => (apiBaseUrl || '').replace(/\/[^/]+$/, ''), [apiBaseUrl]);
  const headers = useMemo(() => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }), [token]);

  const { profile } = useFiscalConfig(orgId, token, apiBaseUrl);

  if (status !== 'CO' || !VISIBLE_PROFILES.has(profile)) return null;

  const bodyKey = profile === 'sii+tbai' ? 'sendToSifBodyBoth'
    : profile === 'tbai' ? 'sendToSifBodyTbai'
    : 'sendToSifBodySii';

  async function callProcess(columnName) {
    const res = await fetch(
      `${base}/sales-invoice/header/${recordId}/action/${columnName}`,
      { method: 'POST', headers, body: '{}' },
    );
    if (!res.ok) {
      const json = await res.json().catch(() => null);
      throw new Error(json?.response?.message || json?.message || `HTTP ${res.status}`);
    }
  }

  async function handleSend() {
    setPhase('sending');
    const next = {};

    if (profile === 'sii' || profile === 'sii-navarra' || profile === 'sii+tbai') {
      try {
        await callProcess('Em_aeatsii_send');
        next.sii = { ok: true };
      } catch (err) {
        next.sii = { ok: false, error: err.message };
      }
    }

    if (profile === 'tbai' || profile === 'sii+tbai') {
      try {
        await callProcess('Em_Tbai_Xmlgenerator');
        next.tbai = { ok: true };
      } catch (err) {
        next.tbai = { ok: false, error: err.message };
      }
    }

    setResults(next);
    setPhase('results');
  }

  function handleClose() {
    setModalOpen(false);
    setPhase('confirm');
    setResults({});
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className="inline-flex items-center gap-1.5 text-[13px] font-medium hover:opacity-80 cursor-pointer h-9"
        style={{ padding: '0 12px', borderRadius: '8px', border: '1px solid #e2e8f0', color: '#374151', background: '#fff' }}
      >
        {ui('sendToSif')}
      </button>

      {modalOpen && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 50,
            background: 'rgba(0,0,0,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div style={{ background: '#fff', borderRadius: '12px', padding: '24px', minWidth: '320px', maxWidth: '480px', width: '100%' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>
              {ui('sendToSifTitle')}
            </h3>

            {phase === 'confirm' && (
              <>
                <p style={{ fontSize: '14px', color: '#374151', marginBottom: '20px' }}>
                  {ui(bodyKey)}
                </p>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={handleClose}
                    style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #e2e8f0', cursor: 'pointer', background: '#fff' }}
                  >
                    {ui('cancel')}
                  </button>
                  <button
                    type="button"
                    onClick={handleSend}
                    style={{ padding: '8px 16px', borderRadius: '8px', background: '#1d4ed8', color: '#fff', border: 'none', cursor: 'pointer' }}
                  >
                    {ui('sendToSifConfirm')}
                  </button>
                </div>
              </>
            )}

            {phase === 'sending' && (
              <p style={{ fontSize: '14px', color: '#6b7280' }}>
                {ui('sendToSifSending')}
              </p>
            )}

            {phase === 'results' && (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
                  {results.sii && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
                      <span style={{ color: results.sii.ok ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                        {results.sii.ok ? '✓' : '✗'}
                      </span>
                      <span>
                        {results.sii.ok ? ui('sendToSifSuccessSii') : (results.sii.error || ui('sendToSifErrorSii'))}
                      </span>
                    </div>
                  )}
                  {results.tbai && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
                      <span style={{ color: results.tbai.ok ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                        {results.tbai.ok ? '✓' : '✗'}
                      </span>
                      <span>
                        {results.tbai.ok ? ui('sendToSifSuccessTbai') : (results.tbai.error || ui('sendToSifErrorTbai'))}
                      </span>
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={handleClose}
                    style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #e2e8f0', cursor: 'pointer', background: '#fff' }}
                  >
                    {ui('close')}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 4: Run test — verify it passes**

```bash
node --test artifacts/sales-invoice/custom/__tests__/SendToSifButton.test.js
```
Expected: All tests `PASS`.

- [ ] **Step 5: Commit**

```bash
git add artifacts/sales-invoice/custom/SendToSifButton.jsx artifacts/sales-invoice/custom/__tests__/SendToSifButton.test.js
git commit -m "Feature ETP-3778: add SendToSifButton component with tests"
```

---

## Task 3: Integrate SendToSifButton into InvoiceTopbarExtra

**Files:**
- Modify: `artifacts/sales-invoice/custom/InvoiceTopbarExtra.jsx`
- Modify: `artifacts/sales-invoice/custom/__tests__/InvoiceTopbarExtra.test.js`

- [ ] **Step 1: Write the failing test**

In `artifacts/sales-invoice/custom/__tests__/InvoiceTopbarExtra.test.js`, add at the end (before the final `}`):

```js
  // ── SendToSifButton integration ────────────────────────────────────────────

  it('imports SendToSifButton from the custom directory', () => {
    assert.match(src, /import SendToSifButton from ['"]\.\/SendToSifButton['"]/);
  });

  it('renders SendToSifButton with data, recordId, token, apiBaseUrl, and status props', () => {
    assert.match(src, /<SendToSifButton/);
    assert.match(src, /recordId=\{recordId\}/);
    assert.match(src, /token=\{token\}/);
    assert.match(src, /apiBaseUrl=\{apiBaseUrl\}/);
  });
```

- [ ] **Step 2: Run the new tests — verify they fail**

```bash
node --test artifacts/sales-invoice/custom/__tests__/InvoiceTopbarExtra.test.js 2>&1 | grep -E "FAIL|PASS|imports SendToSif|renders SendToSif"
```
Expected: The two new tests show `FAIL`.

- [ ] **Step 3: Add import to InvoiceTopbarExtra.jsx**

In `artifacts/sales-invoice/custom/InvoiceTopbarExtra.jsx`, after the last existing import (line 6):
```js
import SendDocumentModal, { SendDocumentButton } from '@/components/contract-ui/SendDocumentModal';
```
Add:
```js
import SendToSifButton from './SendToSifButton';
```

- [ ] **Step 4: Add SendToSifButton to the main return block**

In `artifacts/sales-invoice/custom/InvoiceTopbarExtra.jsx`, locate the main return block (around line 243). Find this section:

```jsx
      <SendDocumentButton onClick={() => setShowSendModal(true)} />
```

Replace with:

```jsx
      <SendToSifButton
        data={data}
        recordId={recordId}
        token={token}
        apiBaseUrl={apiBaseUrl}
        status={data?.documentStatus}
      />

      <SendDocumentButton onClick={() => setShowSendModal(true)} />
```

- [ ] **Step 5: Run all tests — verify they pass**

```bash
node --test artifacts/sales-invoice/custom/__tests__/InvoiceTopbarExtra.test.js
node --test artifacts/sales-invoice/custom/__tests__/SendToSifButton.test.js
```
Expected: All tests `PASS`.

- [ ] **Step 6: Commit**

```bash
git add artifacts/sales-invoice/custom/InvoiceTopbarExtra.jsx artifacts/sales-invoice/custom/__tests__/InvoiceTopbarExtra.test.js
git commit -m "Feature ETP-3778: integrate SendToSifButton into InvoiceTopbarExtra"
```

---

## Task 4: Verify pipeline integrity

- [ ] **Step 1: Run make regen to verify no pipeline breakage**

```bash
make regen ONLY=sales-invoice SKIP_EXTRACT=1
```
Expected: Completes without errors. Custom files are not in `generated/` so they are not overwritten.

- [ ] **Step 2: Run all custom tests for sales-invoice**

```bash
node --test artifacts/sales-invoice/custom/__tests__/SendToSifButton.test.js
node --test artifacts/sales-invoice/custom/__tests__/InvoiceTopbarExtra.test.js
node --test artifacts/sales-invoice/custom/__tests__/InvoiceHeaderTable.test.js
node --test artifacts/sales-invoice/custom/__tests__/PaymentPlanBlock.test.js
```
Expected: All pass.

- [ ] **Step 3: Run pipeline validator**

```bash
node cli/src/validate-pipeline.js --scope=sales-invoice
```
Expected: `0 violations`.

- [ ] **Step 4: Commit if needed (should be clean)**

```bash
git status
```
Expected: Clean working tree (all changes committed in Tasks 1–3).
