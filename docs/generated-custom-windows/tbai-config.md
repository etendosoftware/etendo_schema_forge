# TBAI Config

## Intent

Backend artifact window that stores the TBAI (TicketBAI) configuration record for an organization. End users interact with this data exclusively through the **Fiscal Config** window (`fiscal-config`); this artifact is not exposed as a standalone menu entry.

TBAI applies to organizations in the Basque Country fiscal territories (Álava, Bizkaia, Gipuzkoa) and may coexist with a national SII obligation when annual revenue exceeds €6M.

## What this window should allow

- Read and update the TBAI configuration record: territory, system activation date, environment, invoice description, product description source, auto-send flag, report template path, and invoice chain validation flag.
- Provide the `header` entity that `useFiscalConfig.js` fetches by `organization` filter and `TbaiSection.jsx` writes via PUT.

## Custom UI

This window has no standalone custom UI. All custom rendering, validation, and save logic lives in:

- `tools/app-shell/src/windows/custom/fiscal-config/TbaiSection.jsx`
- `tools/app-shell/src/windows/custom/fiscal-config/CertSection.jsx` (certificate upload for TBAI)

## Automatic chaining sequence assignment (ETP-4401)

Saving this window (create or update, i.e. a `POST`/`PUT` on the `header` entity from
`TbaiSection.jsx`) triggers `TbaiConfigSequenceHandler`
(`com.etendoerp.go.schemaforge.handlers`), wired via `entities.header.javaQualifier:
"tbai-config-sequence-handler"` in `decisions.json`. As a post-save side effect, the handler:

1. Resolves the client/organization the TBAI config record was actually saved for.
2. Finds every **active** `DocumentType` whose backing table is `C_Invoice`, in that
   organization's natural tree (ancestors + descendants) — plus organization `*` (id `0`), so
   Document Types defined at the top-level `*` org are included too, since they would
   otherwise be silently excluded (same precedent as `SelectorOrgFilter#buildOrganizationPredicate`).
   Filtering by table (rather than `documentCategory`) naturally covers sales invoices (`ARI`),
   purchase invoices (`API`), AND their credit notes (`ARC`/`APC`) — all four share the same
   `C_Invoice` table.
3. Ensures every Document Type in that scope shares **exactly one** chaining `Sequence`
   (prefix `TBAI-`): reuses one already assigned to any qualifying Document Type in scope, or
   creates a single new one only if none exists yet — never one independent sequence per
   Document Type.

This closes the gap where the TBAI chaining sequence could previously only be configured by
hand, per Document Type, in Etendo Classic's Document Type window. It also enforces the
fiscal-correctness rule that TicketBAI chains invoice numbers with a single scope-wide counter,
so independent per-Document-Type sequences could collide.

**Idempotent — safe to re-save.** A Document Type is only touched when it has no
`tbaiAdSequence` yet. If it already has one (whether assigned by this handler on a previous
save or configured manually beforehand), it is left untouched: never overwritten, never
duplicated.

**Failure mode:** this is a best-effort secondary side effect that runs after the config record
has already been saved. Any error while creating/assigning sequences is logged and swallowed —
it never fails or rolls back the parent save request.

## Key fields

| Field | Notes |
|-------|-------|
| `etsgSifTerritory` | Basque territory (`alava`, `bizkaia`, `gipuzkoa`) |
| `tbaisystemdate` | TBAI system activation date |
| `productionEnv` | Production vs test environment flag |
| `invoiceDescription` | Default invoice description |
| `uSEAsproductDesc` | Use product description as invoice description |
| `autoSendInvoices` | Auto-send invoices to the tax authority |
| `jasperreportPath` | Path to the Jasper report template |
| `validatePreviousInvoice` | Validate previous invoice chain |

## See also

- Primary entry point: `docs/generated-custom-windows/fiscal-config.md`
- Architecture: `docs/architecture-overview.md`

## Automated evidence

The `decisions.json` declares `attachments: false`, so the Attachments tab is explicitly disabled for this window.

`decisions.json → entities.header.javaQualifier: "tbai-config-sequence-handler"` wires
`TbaiConfigSequenceHandler`
(`{etendo_root}/modules/com.etendoerp.go/src/com/etendoerp/go/schemaforge/handlers/TbaiConfigSequenceHandler.java`)
into the `header` entity's post-save hook — see [neo-headless-extensibility.md](../neo-headless-extensibility.md)
for the general `NeoHandler` pattern this follows.
