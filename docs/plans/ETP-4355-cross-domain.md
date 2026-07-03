# ETP-4355 Cross-Domain Plan

## Domains changed

| Domain | Files | Reason |
|--------|-------|--------|
| `window:not-posted-documents` | `NotPostedDocumentsPage.jsx`, `not-posted-documents.css`, `docs/generated-custom-windows/not-posted-documents.md` | New custom window: Not Posted Documents |
| `app-shell-core` | `en_US.json`, `es_ES.json` | i18n keys for the new window UI |
| `generator-change` | `cli/src/push-to-neo.js` | Set `isget='Y'`, `ispost='Y'` on entity update so the NEO endpoint registers both HTTP methods |

## Tests

- Manual: search grid returns only postable document types; APRM payments excluded
- Manual: bulk-post and single-post show correct success/error toasts
- Manual: document type dropdown populated dynamically from `c_acctschema_table`
- i18n: all new keys present in both `en_US.json` and `es_ES.json`

## Rollback

Revert `feature/ETP-4355` in both repos. No DB schema changes — only `ETGO_SF_SPEC`/`ETGO_SF_ENTITY` rows which are managed by `push-to-neo.js` and can be re-applied or removed via the same script.
