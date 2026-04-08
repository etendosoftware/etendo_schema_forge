# Feedback Log

Append-only log of errors, bugs, and improvement opportunities discovered during development.
Each entry should include: date, context, what happened, and suggested fix or status.

---

## 2026-03-13 — push-to-neo entity matching fails for curated names

**Context:** Pushing Sales Order to NEO Headless via `push-to-neo.js`.
**Problem:** Step 3 (field visibility update) failed for all 63 fields with "no entity" error. The contract uses curated entity names (`order`, `orderLine`) but `PopulateSpec` creates entities with AD tab names (`Header`, `Lines`). The matching logic only tried `tabId` (null in contract) and `entityName` (no match).
**Fix:** Added tableName-based fallback in `push-to-neo.js`. Three-level matching: tabId -> name -> tableName. Commit `1343db6`.
**Status:** Fixed.

## [2026-03-18] NEO Headless: List reference columns return raw code without $identifier

**Issue:** Columns with AD_Reference type "List" (e.g., DeliveryViaRule, DeliveryRule, PriorityRule, DocStatus) are returned by the NEO API as raw list codes (e.g., `"P"`, `"A"`, `"5"`, `"CO"`) without a corresponding `$_identifier` field. FK columns (TableDir/Table/Search) correctly return `fieldName$_identifier`.

**Impact:** In the UI, these fields display the internal code instead of the user-facing label ("P" instead of "Pickup Delivery", "CO" instead of "Complete", etc.).

**Expected:** NEO Headless should look up `AD_Ref_List.Name` for List-type columns and include it as `fieldName$_identifier` in the API response, consistent with FK field behavior.

**Workaround:** Mark `documentStatus` as `form: false` so it doesn't appear in the form (the status badge uses it from API data directly). Other list fields (deliveryMethod, deliveryTerms, priority) remain visible but show raw codes pending backend fix.
