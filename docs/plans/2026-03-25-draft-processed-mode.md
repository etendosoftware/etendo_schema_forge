# Plan: Configurable Draft/Processed Mode

**Status:** Pending
**Date:** 2026-03-25
**Task:** ETP-3596

## Context

DetailView always shows "Save draft" and "Save" buttons, but both do the same thing (POST/PATCH). The user wants:
- **draftMode enabled**: "Save Draft" = save only, "Save" = save + execute docAction process (Complete)
- **draftMode disabled** (default): single "Save" button (plain POST/PATCH)

This is a configuration per entity, propagated through the pipeline: `decisions.json` → `resolve-curated` → `contract.json` → generated frontend.

---

## Implementation

### 1. `resolve-curated.js` (~line 441) — Propagate draftMode from decisions

After the `javaQualifier` propagation block, add draftMode propagation:

```javascript
if (entityDecision.draftMode) {
  entity.draftMode = {
    enabled: entityDecision.draftMode.enabled === true,
    processField: entityDecision.draftMode.processField || 'documentAction',
    processValue: entityDecision.draftMode.processValue || 'CO',
  };
}
```

### 2. `generate-contract.js` (~line 179) — Include draftMode in frontend contract

After `javaQualifier` propagation on feEntity:

```javascript
if (entity.draftMode?.enabled) feEntity.draftMode = entity.draftMode;
```

### 3. `generate-frontend.js` (~line 236) — Emit draftMode config in Page component

- Read draftMode from frontend contract entity
- Generate a `const draftMode = {...}` or `const draftMode = null` block (inside generated markers)
- Pass `draftMode={draftMode}` as prop to DetailView (line ~346)

### 4. `useEntity.js` — Add `handleSaveAndProcess`

New function that composes existing `handleSave` + process execution:

```javascript
const handleSaveAndProcess = useCallback(async (draftModeConfig) => {
  const saved = await handleSave();
  if (!saved?.id) return null;

  const { processField, processValue } = draftModeConfig;
  const url = `${apiBaseUrl}/${entity}/${saved.id}/action/${processField}`;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ fieldValues: { [processField]: processValue } }),
  });
  // handle errors, toast, refresh
  return saved;
}, [handleSave, apiBaseUrl, entity, token, refresh]);
```

Return it from the hook.

### 5. `DetailView.jsx` (~line 23, ~line 397) — Conditional button rendering

- Add `draftMode = null` prop
- Replace hardcoded dual-button with:
  - **draftMode enabled**: "Save draft" (calls `handleSave`) + "Save" (calls `handleSaveAndProcess(draftMode)`)
  - **draftMode disabled**: single "Save" (calls `handleSave`)

---

## Files to Modify

| File | Change |
|------|--------|
| `cli/src/resolve-curated.js` | Propagate `draftMode` from entityDecision |
| `cli/src/generate-contract.js` | Include `draftMode` in feEntity |
| `cli/src/generate-frontend.js` | Emit `draftMode` const + pass as prop |
| `tools/app-shell/src/hooks/useEntity.js` | Add `handleSaveAndProcess` |
| `tools/app-shell/src/components/contract-ui/DetailView.jsx` | Accept `draftMode` prop, conditional buttons |

## Configuration (decisions.json)

```json
{
  "entities": {
    "header": {
      "draftMode": { "enabled": true },
      "fields": { ... }
    }
  }
}
```

Defaults when only `enabled: true`: `processField = "documentAction"`, `processValue = "CO"`.

No `draftMode` key or `enabled: false` → single Save button (current behavior, backwards compatible).

## Verification

1. `make dev` — open a window with draftMode enabled → two buttons appear
2. Open a window without draftMode → single Save button
3. Click "Save draft" → record saved, status stays Draft
4. Click "Save" → record saved + processed (status changes to CO)
5. Existing generated files still work (backwards compatible via default prop)
