# Spec: Selector values in GO language

**Epic:** ETP-3504 (localization)
**Status:** Draft — for path validation before Jira/branch creation
**Repos:** `schema-forge` (frontend) + `com.etendoerp.go` (NEO Headless backend)
**Date:** 2026-06-23

---

## 1. Problem

When GO is configured in Spanish but the underlying Etendo Classic user logs in
in English, **selector values come back in English** even though the field label
is correctly shown in Spanish.

### Example — Product window, UoM (Unit of Measure) field

| Layer | GO = Español, Classic = English (current) | Expected |
|-------|-------------------------------------------|----------|
| Field label | `Unidad` ✅ (front i18n) | `Unidad` |
| Selector values | `Centimeter`, `Cubic Meter` ❌ | `Centímetro`, `Centímetro Cúbico` |

The label is already correct because it is resolved by the **frontend** locale
dictionary. The **values** are wrong because they are resolved by the
**backend**, which uses the Classic session language.

---

## 2. Root cause

In Etendo, the displayed value of a selector is resolved server-side using
`OBContext.getOBContext().getLanguage()`. That language is set from the **login
language of the Classic user** (`AD_User` default / client), **not** from the
locale configured in GO.

So when `NeoSelectorService` builds the selector response, it runs inside an
`OBContext` whose language is the Classic user's (English) and every translatable
value is resolved to English — independently of what GO is showing.

### How Etendo Classic resolves selector language (background)

Two distinct selector types, both keyed by `OBContext` language:

1. **List references (`AD_Ref_List`)** — fixed-value dropdowns (e.g. document
   status). Translations in `AD_Ref_List_Trl` (`ad_ref_list_id + ad_language`).
   Classic shows `COALESCE(trl.name, base.name)` filtered by session language.

2. **Table / search selectors (`C_UOM`, Business Partner, Product…)** — this is
   the UoM case. The visible value is the record **identifier** (for UoM, the
   `Name` column of `C_UOM`). `C_UOM` is a *translatable table*, so Spanish names
   live in `C_UOM_Trl` (`ad_language = 'es_ES'`). The identifier is resolved
   using the session language.

Both paths read the language from `OBContext` → fixing the context language fixes
both.

---

## 3. Design decisions (confirmed)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Source of language | **Frontend sends the GO locale** as a request param | The `LocaleProvider` locale is the source of truth for GO; decouples from the Classic user |
| Application mechanism | **`OBContext.setLanguage(requestedLang)`** before resolving identifiers, restored in `finally` | Reuses Etendo's identifier machinery → covers any translatable table without custom SQL; no global contamination |

This is the same pattern already used in ETP-3647 phases 3a/3b for field labels
(`ElementTrl`) and process parameters (`ProcessParameterTrl`). It closes the
pending task **3c — Fix `NeoSelectorService`**.

---

## 4. Scope

### In scope
- Frontend: selector request carries the active GO locale.
- Backend (`NeoSelectorService`): read the requested language, apply it via
  `OBContext.setLanguage` with a guarded `try/finally` restore, covering both
  table identifiers (UoM, etc.) and `AD_Ref_List` values.
- Tests verifying translated values with `es_ES` and English fallback when no
  translation row exists.

### Out of scope
- Field labels, UI chrome, breadcrumbs, statuses — already done in ETP-3647 phases 1–2.
- Process parameter names — done in ETP-3647 phase 3b.
- Any change to `decisions.json` schema or the generator.

---

## 5. Implementation outline

### 5.1 Frontend (`schema-forge`)
- Locate the selector data client (the call that NEO serves for table/search and
  list references).
- Append the active locale from `LocaleProvider` (e.g. `lang=es_ES`) to the
  selector request. Default to the GO locale if absent.

### 5.2 Backend (`com.etendoerp.go` → `NeoSelectorService`)
- Read the requested language from the request (param), validate it exists and is
  a system language in `AD_Language`; otherwise fall back to the current context
  language.
- Wrap identifier/value resolution:

```java
String prev = OBContext.getOBContext().getLanguage().getLanguage();
try {
    OBContext.setAdminMode(true);          // if needed for AD_Language read
    OBContext.getOBContext().setLanguage(resolvedLang);
    // ... build selector values (identifiers + AD_Ref_List) ...
} finally {
    OBContext.getOBContext().setLanguage(prevLang); // restore
    OBContext.restorePreviousMode();
}
```

> Exact API for setting the context language to confirm against the GO codebase
> when implementing — `setLanguage` may take a `Language` entity, not a string.

- Ensure both code paths inside the service (table identifiers and `AD_Ref_List`)
  run under the adjusted context.

---

## 6. Test plan
- **Backend unit/contract:** with `lang=es_ES`, UoM selector returns
  `Centímetro` / `Centímetro Cúbico`; with `lang=en_US`, returns
  `Centimeter` / `Cubic Meter`.
- **Fallback:** a record with no `_Trl` row for the requested language returns the
  base-language value (no empty value, no error).
- **Context isolation:** after the call, the surrounding `OBContext` language is
  unchanged (no leak to other requests).
- **AD_Ref_List path:** a list-type selector returns translated values too.

---

## 7. Risks / open points
- The Java source of `com.etendoerp.go` is **not checked out** in this working
  tree (only `web/`). Implementation needs that repo available.
- Confirm whether NEO sets `OBContext` per-request or reuses a pooled context —
  if pooled, the `finally` restore is mandatory to avoid cross-request leaks.
- Confirm the requested language is an **active system language**
  (`AD_Language.issystemlanguage = 'Y'`); otherwise `_Trl` rows won't exist and
  everything falls back to base.
- The DB instance currently has empty `_Trl` tables for non-base languages
  (per `docs/etendo-ad/localization.md`); validation needs an instance with
  `es_ES` activated and translated UoM data.
