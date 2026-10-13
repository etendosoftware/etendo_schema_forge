# `@SQL=` column defaults without an `AD_Client_ID` filter

Some core `AD_Column.DefaultValue` expressions query a **client-scoped** table but never filter by
`AD_Client_ID`. In Classic the combo's client-access filter hides the problem. A headless consumer
that evaluates the SQL as-is (NEO, MCP) can resolve **another tenant's row**.

## Case that triggered it (ETP-5682)

`GL_Journal.C_DocType_ID`:

```sql
@SQL=SELECT C_DocType_ID from C_DocType
     WHERE C_DocType.DocBaseType='GLJ'
       AND AD_ISORGINCLUDED(@AD_Org_ID@, C_DocType.AD_Org_ID, @#AD_Client_ID@) <> '-1'
     ORDER BY C_DocType.isdefault DESC
```

- Every tenant keeps its GLJ document type in org `0`, and `AD_ISORGINCLUDED(<any org>, '0', …)` is
  never `-1`, so the query matches the GLJ document type of **every client**. The order has no
  deterministic tie-break, so which tenant's row comes first is arbitrary.
- A journal stored with a foreign document type is numbered by `DocumentNoHandlerLegacy` from the
  **foreign** tenant's sequence (`Utility.getDocumentNo(..., docTypeId, ..., updateNext=true)`).
  Mostly untouched, so it returns `1000000`, which collides with `gl_journal_docno`
  (`UNIQUE (ad_org_id, c_period_id, documentno)`) once the tenant already has a `1000000` in that
  period. The sequence bump runs in the INSERT's transaction and rolls back with it, so every retry
  computes the same number.
- Collateral: the foreign `C_DocType_ID` is carried into `Fact_Acct` when the journal is posted,
  and foreign tenants' sequences get gaps.

## Same shape elsewhere

- `FIN_Payment.C_DocType_ID` — equally unscoped. Latent: the payment flows set the document type
  explicitly.
- `ETGO_SF_FIELD` default of `returnToVendorShipment.documentType` (`DocBaseType='MMR'`, Etendo GO's
  own override) — no client filter either.
- Not affected: `C_BP_Group_ID`, `M_Product_Category_ID` (filter by `AD_Client_ID`),
  `M_InventoryLine.M_Locator_ID` (scoped by `M_Warehouse_ID`).

## How Etendo GO handles it

- **Generic:** `com.etendoerp.go` `NeoDefaultTenantGuard` — an `@SQL=` default of a foreign-key
  column to a client-enabled table keeps the first row owned by the context client or by client `0`.
  See `{etendo_root}/modules/com.etendoerp.go/docs/neo-headless.md` §4.3.6.
- **Per window:** override the default with a client-scoped `defaultExpr` in `decisions.json` when
  the order matters (`simple-g-l-journal` → `header.fields.documentType`).

When writing a new `@SQL=` default for a client-scoped table, always add
`AND <table>.AD_Client_ID = @#AD_Client_ID@`.
