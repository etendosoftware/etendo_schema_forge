# Organization

## Intent

Use this window (ETP-4749) to let a tenant review and adjust the organization data that appears on its own invoices, quotes, and fiscal documents — identity (name, trade name, logo, business type), fiscal identification (NIF, legal name, fiscal address, country, currency), and public contact details (email, phone, website). These fields are first captured during onboarding ("Primeros pasos") and this window is where they get corrected afterwards.

This is **not** the full Etendo Classic "Organization" window. It flattens a curated subset of two Classic AD tabs into one continuous, tabless screen — see "AD window mapping" below for exactly what is in and out of scope.

## What this window should allow

- Edit the organization's display name, trade/commercial name, and business type (Company / Freelancer / Advisory), with a logo upload (PNG/JPG/SVG, max 2 MB) that falls back to the organization's initials when no logo is set.
- Edit fiscal identification: NIF, legal name (razón social), and fiscal address (via an inline address editor — create or pick an existing address, no separate navigation).
- View (read-only) the organization's country and currency, both derived from existing AD_Org/AD_OrgInfo data — not editable from this screen.
- Edit public contact details (email, phone, website) — always editable, optional, and unrelated to any linked Business Partner.
- See a sticky "unsaved changes" banner (yellow dot, bold title, secondary hint) whenever any field differs from the last-loaded state, with Discard / Guardar cambios actions.

## AD window mapping

Backed by the real Etendo Classic AD_Window **`Organization`, ID `110`** — this is not a synthetic/custom AD entity. Two of its tabs are used; the rest are explicitly out of scope for ETP-4749:

| Tab ID | Tab name | Table | Used here? |
|---|---|---|---|
| `143` | Organization | `AD_Org` | **Yes** — header identity/fiscal fields |
| `170` | Information | `AD_OrgInfo` | **Yes** — fiscal address, logo, Business Partner link |
| `7580F9AE37704571BB0D3935252CAC5A` | General Ledgers | `AD_Org_AcctSchema` | No |
| `6BC4F7D2CBE94AEE939CCB5990B55FEA` | Period Control Old | `C_PeriodControl_V` | No |
| `885A6DB490044F3F8528373B60E3D9F5` | Period Control | `C_Period` | No |
| `4FB5884A443240EEB5504BBF7813870D` | Documents | `C_PeriodControl` | No |
| `73A63C7575984EDF80FF044A13E0ACBA` | Intrastat | `INTR_SETUP` | No |
| `E166858871CA4F74BBC0E1BBDC5C9887` | Data Sets | `AD_OrgModule_V` | No |
| `9F030341690C4BB3A3C15835AEC0FF39` | Warehouse | `AD_Org_Warehouse` | No |
| `910CA3AD36CA47F2B92B7AB9484EF47B` | Actividades del IAE | `EPIAE_OrgInfo_Epigraph` | No |
| `25301674D3CB4FCBBC285C5AAD232376` | Certificado Digital | `ETSG_Certificate` | No |
| `53EEA7ADEBA24190A340084CC9A4119C` | Representante Legal | `OREP_Representative_Info` | No |
| `A40755889D614B358959BBA14D9B669A` | Email Configuration | `C_POC_CONFIGURATION` | No |

The other 9 tabs (Period Control ×3, General Ledgers, Intrastat, Data Sets, Warehouse, IAE, Certificado Digital, Representante Legal, Email Configuration) are entirely out of scope for this ticket — none of their fields are extracted, curated, or exposed anywhere in this window.

## Interaction model

- Route: `/organization` (list-style single route; no `:recordId` — this is a per-organization settings screen, not a record-based CRUD window).
- Visibility: visible in the Settings menu as **Organization** (`windowId: 110` in `tools/app-shell/src/menu.json`).
- Implementation type: `layoutType: "custom"` — the AD window has 13 tabs and the ticket design shows the two in-scope tabs flattened into one continuous page with no visible tabs, which no declarative `layoutType` (default/kanban/calendar/list-modal) supports. Loaded from `customLoaders` in `tools/app-shell/src/windows/registry.js`.
- Entry point: `OrganizationPage.jsx` — hand-built page, no generated `DetailView`/`EntityForm` involved.

## Data model

Spec `organization`, two curated entities (the pipeline extracted all 11 non-view tabs of window 110 into `schema-raw.json`; `decisions.json` explicitly `"exclude": true`s the 9 out-of-scope ones — see "AD window mapping"):

| Entity | Table | Fields exposed |
|---|---|---|
| `organization` | `AD_Org` | `name`, `socialName`, `currency` (readOnly), `etgoBusinessType` (editable, enum) |
| `information` | `AD_OrgInfo` | `locationAddress` (editable, foreignKey), `taxID` (editable), `yourCompanyDocumentImage` (editable, logo), `etgoEmail` / `etgoPhone` / `etgoWeb` (editable, optional) |

Contact fields (email, phone, website) live directly on `AD_OrgInfo` as three dedicated columns — `EM_Etgo_Email`, `EM_Etgo_Phone`, `EM_Etgo_Web` (`VARCHAR(60)`, all optional). They were originally sourced from the linked Business Partner (`C_BPartner`, via `AD_OrgInfo.businessPartner`, fetched from the `contacts` spec's `businessPartner` entity); Ivan added the dedicated `AD_OrgInfo` columns instead so these fields have no Business Partner dependency at all — no "disabled without a linked BP" state, no separate fetch, no retry affordance. `AD_OrgInfo.businessPartner` itself is now `"visibility": "discarded"` in `decisions.json` and is no longer used by this window.

## Field mapping (Identidad / Datos fiscales / Datos de contacto)

| Screen field | Section | Source | Notes |
|---|---|---|---|
| Logo | Identidad | `AD_OrgInfo.yourCompanyDocumentImage` (AD_Image) | Upload PNG/JPG/SVG, max 2 MB; falls back to organization initials |
| Nombre de la organización | Identidad | `AD_Org.name` | Required |
| Tipo de negocio | Identidad | `AD_Org.em_etgo_business_type` | Cards, not a dropdown — see "Business type column" below |
| NIF | Datos fiscales | `AD_OrgInfo.taxID` | Required. Prefilled from the onboarding wizard's "Details to start invoicing" step (`fiscalIdValue`) — see "Onboarding Tax ID fix" below |
| Nombre comercial | Datos fiscales | `AD_Org.socialName` ("The legal name of the organization") | Required. Prefilled from the onboarding wizard's "Company Name" step (`clientName`) — or the person's Full Name for Freelancers, since that business type has no Company Name field. **Not** the same field as the removed `C_BPartner.name` one below — same visible label, different source; do not confuse the two |
| Dirección fiscal | Datos fiscales | `AD_OrgInfo.locationAddress` (`C_Location_ID`) | Inline create/edit via `LocationModalField` — see "Fiscal address workaround" below |
| País | Datos fiscales | Derived from the fiscal address identifier (read-only) | No dedicated country field on this window's contract yet — see "Known gaps" |
| Moneda | Datos fiscales | `AD_Org.currency` (`C_Currency_ID`) | Read-only |
| Email / Teléfono / Sitio web | Datos de contacto | `AD_OrgInfo.etgoEmail` / `etgoPhone` / `etgoWeb` | Optional. Always editable — no Business Partner dependency |

## Business type column (`em_etgo_business_type`)

Ticket ETP-4749 needs a 3-way "Empresa / Autónomo / Asesoría" classification that did not exist anywhere in AD_Org/AD_OrgInfo/C_BPartner (the closest existing field, `AD_Org.Organization Type`, is an unrelated accounting/hierarchy classification — Legal with accounting / Generic / etc.). A new column was added specifically for this ticket, following the existing `em_etgo_*` naming convention already used on `C_BPartner`:

- Column: `AD_Org.EM_Etgo_Business_Type`, `VARCHAR(60)`, nullable, List reference.
- List values: `CO` = Company (Empresa), `FL` = Freelancer (Autónomo), `AD` = Advisory (Asesoría).
- AD default value is `CO` — `BusinessTypeCards.jsx` does not force a client-side default; a record with no value shows no card selected.
- Rendered as selection cards (`BusinessTypeCards.jsx`), not a `<select>`, per the ticket design. Selected-state colors reference real CSS custom properties — `--eg-yellow`, `--eg-yellow-soft`, `--eg-yellow-line`, `--eg-yellow-dot-border`, `--eg-ink` — via `bg-[var(--eg-yellow)]` etc., not inline hex (`semanticThemeUsage.test.js` forbids raw palette literals in application UI).
  **Token location (QA review round 4):** these tokens are defined in `schema_forge_core/packages/app-shell-core/src/styles.css`, next to the existing `--status-*` tokens — the canonical cross-app design-token registry, not a per-window file. They are **not yet available from the published `@etendosoftware/app-shell-core` package** — only from the local core source. Running this repo with plain `make dev` (published package) will NOT show the yellow palette until a new app-shell-core version ships and this repo's dependency is bumped; use `make dev-local-core` (`LOCAL_CORE=1`) to see it today. Re-verify with a normal `make dev` once that release lands.

## Fiscal address workaround (intentional, not a placeholder)

The "Dirección fiscal" field uses the shared `LocationModalField` / `LocationEditorModal` (`saveMode="location"`) to create/edit the underlying `C_Location` record inline, instead of only picking from existing addresses. That inline editor needs a **tab-less `location` entity** registered in NEO Headless (plain `C_Location` CRUD + country/region selectors) — `C_Location` has no AD_Tab under window 110's Information tab, so there is nothing for generic tab-based CRUD to attach to.

That tab-less `location` entity already exists, but only under the **`warehouse`** spec (`WarehouseLocationHandler.java`, built for ETP-4526's Warehouse "Location / Address" field). It was never registered for `organization`. `WarehouseLocationHandler` is fully generic — plain DAL CRUD on `Location.class` using the request's own `OBContext`, with no warehouse-specific data or business rules.

`OrganizationPage.jsx` therefore points `LocationModalField`'s `apiBaseUrl` at the **`warehouse`** spec's base (`${neoBase(apiBaseUrl)}/warehouse`) instead of `organization`'s own. This is a deliberate, accepted reuse of a real, working, generic endpoint — not a mock, not fake data, and not a temporary hack pending a follow-up ticket. It works because the fetched/edited `C_Location` record is a real database row addressable from any spec; nothing about the handler is warehouse-scoped. Registering an equivalent `location` entity directly under `organization` (mirroring Warehouse's setup) would be the cleaner long-term architecture, but that is a `com.etendoerp.go` Java/AD change, out of scope for this ticket.

## Onboarding Tax ID fix (bug found and fixed as part of ETP-4749)

The NIF field surfaced a bug that predates this window: a Tax ID entered in the onboarding wizard's "Details to start invoicing" step never made it to `AD_OrgInfo.TaxID` — every onboarded tenant showed the literal string `"?"` (Etendo core's generated placeholder for an unset `NOT NULL` String column) regardless of what the user typed. The value was silently dropped at **two separate points**, in two different repos, before ever reaching the database:

1. **`schema_forge_core/packages/etendo-go-core`** (the wizard's own source, consumed as a published npm package): `src/onboarding/steps/SetupProgressStep.jsx` built the `formPayload` sent to provisioning without `fiscalIdValue`, even though the Company step (`CompanyStep.jsx`) already collected it correctly into `stepData.fiscalIdValue`. `src/onboarding/api.js`'s `runOnboardingStream()` (the actual `POST /sws/go/onboarding` call) also didn't include the key in the request body. `src/onboarding/state.js` had a comment explicitly documenting the old (now reversed) decision — updated, and its `buildOnboardingPayload()` allowlist helper (public API, not wired into the real flow but exported) extended to match.
2. **`com.etendoerp.go`**: `EtendoGoJwtServlet.java`'s `OnboardingRequestData` DTO had no field for it, so even if the frontend had sent it, `parseOnboardingRequest()` would never have read it and `wireOrgInfo()` would never have forwarded it. `OnboardingOrgInfoService.java`'s `ensureOrgInfo()`/`ensureOrgInfoLocation()` had no parameter to receive it, and never called `orgInfo.setTaxID(...)` under any code path.

Both sides needed to move together for the fix to have any effect end-to-end. The Tax ID stays optional throughout: a blank/missing value is a no-op everywhere (never forces or clears an existing value), matching the wizard's existing "Tax ID is optional" validation rule.

## Onboarding "Nombre comercial" (SocialName) fix (bug found and fixed as part of ETP-4749)

A second, related gap in the same onboarding flow: `AD_Org.SocialName` ("Nombre comercial" on this screen) was never set anywhere during onboarding — every onboarded tenant's "Nombre comercial" stayed blank regardless of what the user typed as their Company Name (or Full Name, for Freelancers). Unlike the Tax ID bug, this one lives entirely in `com.etendoerp.go` — the wizard's frontend was never the problem here:

- The onboarding request's `clientName` (the wizard's "Company Name" field, already resolved to the person's Full Name for Freelancers by `CompanyStep.jsx` — see "Field change" below) was only ever used to set `AD_Org.Name` and `AD_Org.SearchKey`, via `EtendoGoJwtServlet.createOrganization()` → `InitialOrgSetup.createOrganization()` (Etendo core, `org.openbravo.erpCommon.businessUtility.InitialOrgSetup`) → `InitialSetupUtility.insertOrganization()` (Etendo core). None of those core methods take a social-name parameter at all.
- `OnboardingOrgInfoService` (the class that already fixed the Tax ID) only touches `AD_ORGINFO` (location, Tax ID) — `SocialName` lives on `AD_ORG` itself and was out of that service's scope.

Fixed by adding `EtendoGoJwtServlet.applySocialName(clientId, clientName)`, called once from `createOrganization()` right after the organization is successfully created, reusing the exact same `clientName` already used for `Name`. Deliberately **not** added to `OnboardingOrgInfoService`'s reconcile chain (which re-runs on every resumed/retried onboarding call): organization creation itself only happens once (gated by `organizationExists()`), and re-running a SocialName overwrite on every retry would silently clobber a "Nombre comercial" the user had since edited by hand in this window. A missing/unresolvable organization at that point is logged and treated as non-fatal — the organization was already created successfully, so a SocialName write failure must not flip that success into an error.

## Field change: "Nombre comercial" moved from Business Partner to AD_Org

A later ETP-4749 review round removed the original "Nombre comercial" field (`C_BPartner.name`, via the linked Business Partner — disabled when no Business Partner was linked) entirely from this screen, and reused that same visible label ("Nombre comercial") for what used to be labeled "Razón social" (`AD_Org.socialName`). The two are unrelated fields on unrelated tables that happen to now share the same on-screen text — see the "Field mapping" table above and the code comment above the `org-legal-name` input in `OrganizationPage.jsx`. Removing the old field also removed its special BUG-1 validation rule ("Nombre comercial" was only required when a Business Partner was linked and loaded); `AD_Org.socialName` is unconditionally required, like the other fiscal fields.

## Field change: contact fields moved from Business Partner to dedicated AD_OrgInfo columns

A later round removed the Business-Partner-sourced contact fields (email/phone/website via `AD_OrgInfo.businessPartner` → `contacts` spec) and replaced them with three new, dedicated `AD_OrgInfo` columns (`EM_Etgo_Email`, `EM_Etgo_Phone`, `EM_Etgo_Web`), added in `com.etendoerp.go`. This removed the entire "is a Business Partner linked, and did it load" state machine: the "no BP linked" notice, the "BP linked but failed to load" notice + retry affordance, and the `disabled`/gray styling on those three inputs are all gone. The fields are now always editable, plain optional strings on the `information` entity, handled exactly like `taxID` or `locationAddress` in `useOrganizationData.js`'s `load`/`save`.

## Field change: SII/TicketBAI/Verifactu config flags exposed as `system` fields (ETP-4784)

Three `AD_OrgInfo` columns — `EM_Etsg_Has_Sii_Config`, `EM_Etsg_Has_Tbai_Config`,
`EM_Etsg_Has_Vfactu_Config` (server-maintained Y/N flags, one per fiscal system, on the
`information` entity) — were promoted from `visibility: "discarded"` to `visibility: "system"`
in `artifacts/organization/decisions.json`. `system` keeps them out of this window's
auto-generated form (they carry no UI here) while making them available on the backend
contract/API (`GET /sws/neo/organizaci-n/information/{orgId}`).

**Why:** the Contacts window's `FiscalDefaultsSection` needs to know, per contact
organization, whether SII and/or TicketBAI are actively configured, to gate its two
conditional sub-blocks. Previously it inferred this by fetching and filtering the
`sii-config`/`tbai-config` entity lists; these 3 flags are the authoritative,
already-computed answer, so exposing them collapsed that detection to a single `getById`
read. See `docs/generated-custom-windows/contacts.md` ("ETP-4784 part 4") for the consumer
side. `etsgHasVfactuConfig` is exposed for a future Verifactu use case — nothing consumes it
yet.

No frontend change was needed on this window itself — `system` fields are excluded from
`frontendContract`/the generated form by design, only added to `backendContract`. Verified via
`make regen ONLY=organization` (contract shows the 3 fields as `visibility: "system"` under
`backendContract.entities.information.fields`, absent from `frontendContract`) followed by
`make regen ONLY=organization PUSH_TO_NEO=1`.

## Known gaps

- **Country is derived, not a real field**: `deriveCountryFromIdentifier()` in `OrganizationPage.jsx` takes the last `" - "`-separated segment of the fiscal address's `$_identifier` string (e.g. `"... - España"`). There is no dedicated read-only country field on this window's contract. If one is added later, prefer it over this heuristic.
- **Country flag is a small hardcoded lookup**: `countryFlag.js` maps a handful of country names to flag emoji for the read-only País pill. Unknown country names render without a flag (no crash) — extend the map if a new country shows up.
- **No dedicated `organization` NEO entity for the fiscal address**: see "Fiscal address workaround" above — this is the accepted, permanent shape, not a pending fix.

## Automated evidence

- `artifacts/organization/decisions.json` — `layoutType: "custom"`, `organization` + `information` entities curated, the 9 out-of-scope tabs excluded.
- `cli/config/regen-windows.json` — `organization` registered (`windowId: "110"`).
- `tools/app-shell/src/menu.json` — `organization` entry under the Settings group.
- `tools/app-shell/src/windows/registry.js` — `organization` in `customLoaders`.
- `tools/app-shell/src/windows/custom/organization/index.jsx` — pipeline-generated scaffold, imports `OrganizationPage`.
- `tools/app-shell/src/windows/custom/organization/OrganizationPage.jsx` — the hand-built page: 3 sections, unsaved-changes banner, field mapping.
- `tools/app-shell/src/windows/custom/organization/useOrganizationData.js` — fetch/save hook (`organization` + `information`; `etgoEmail`/`etgoPhone`/`etgoWeb` are plain `information` fields, no Business Partner fetch).
- `tools/app-shell/src/windows/custom/organization/OrgLogoField.jsx` — logo upload with initials fallback; PNG/JPG/SVG, 2 MB cap.
- `tools/app-shell/src/windows/custom/organization/BusinessTypeCards.jsx` — Empresa/Autónomo/Asesoría selection cards.
- `tools/app-shell/src/windows/custom/organization/countryFlag.js` — country-name → flag-emoji lookup for the read-only País pill.
- `tools/app-shell/src/lib/imageUpload.js` — `sanitizeImageName()`, shared by this window's `OrgLogoField.jsx` and the generic `ImageField.jsx` (contract-ui): truncates upload filenames to AD_Image's 60-char `Name` limit.
- `tools/app-shell/src/windows/custom/organization/__tests__/useOrganizationData.vitest.js` — load/save behavior (including the direct AD_OrgInfo contact columns), error handling.
- `tools/app-shell/src/windows/custom/organization/__tests__/OrganizationPage.vitest.jsx` — field rendering, unsaved-changes banner, business-type card selection/colors, save flow, warehouse-spec address `apiBaseUrl` regression guard.
- `tools/app-shell/src/lib/__tests__/imageUpload.test.js` — `sanitizeImageName()` truncation/extension-preservation cases.

### Onboarding Tax ID fix — evidence in the other two repos

- `com.etendoerp.go/src/com/etendoerp/go/rest/EtendoGoJwtServlet.java` — `OnboardingRequestData.taxId` field, `parseOnboardingRequest()` reads `fiscalIdValue` from the request body, `wireOrgInfo()` forwards it to `ensureOrgInfo(...)`.
- `com.etendoerp.go/src/com/etendoerp/go/onboarding/OnboardingOrgInfoService.java` — `ensureOrgInfo()`/`ensureOrgInfoLocation()` take a `taxId` parameter; new `applyTaxId()` sets `orgInfo.setTaxID(...)` only when non-blank.
- `com.etendoerp.go/src-test/src/com/etendoerp/go/onboarding/OnboardingOrgInfoServiceTest.java` — `applyTaxId` coverage (sets trimmed value + saves when non-blank, no-op when blank/null, applied even when the org already has a location).
- `com.etendoerp.go/src-test/src/com/etendoerp/go/rest/EtendoGoJwtServletOnboardingDatasetTest.java` — `NoOpOrgInfoService` stub updated to the new `ensureOrgInfo` signature.
- `schema_forge_core/packages/etendo-go-core/src/onboarding/steps/SetupProgressStep.jsx` — `formPayload` now includes `fiscalIdValue`.
- `schema_forge_core/packages/etendo-go-core/src/onboarding/api.js` — `runOnboardingStream()`'s POST body includes `fiscalIdValue` when non-empty (same conditional-spread pattern as `address`/`fullName`).
- `schema_forge_core/packages/etendo-go-core/src/onboarding/state.js` — `isCompanyStepValid()` comment updated to no longer claim the field isn't sent; `buildOnboardingPayload()` extended to include it.
- `schema_forge_core/packages/etendo-go-core/test/onboardingOwnership.test.js` — updated the assertion that previously expected `fiscalIdValue` to be stripped; added a dedicated test asserting the real POST body includes it when provided and omits it when blank.

### Onboarding "Nombre comercial" (SocialName) fix — evidence

- `com.etendoerp.go/src/com/etendoerp/go/rest/EtendoGoJwtServlet.java` — new package-private `applySocialName(clientId, clientName)`, called from `createOrganization()` right after the organization is successfully created.
- `com.etendoerp.go/src-test/src/com/etendoerp/go/rest/EtendoGoJwtServletCoverageTest.java` — `applySocialName` coverage: sets `SocialName` + saves + flushes when the organization is found (including the Freelancer full-name case), returns `false` and never saves when it is not found.
- No frontend change needed: `schema_forge_core/packages/etendo-go-core/src/onboarding/steps/CompanyStep.jsx` already resolves `clientName` to the Freelancer's Full Name (line ~24, `isFreelancer ? stepData.fullName : stepData.clientName`) — the same value `applySocialName` persists, so the Java-side fix alone closes the gap end-to-end.

## Manual verification

1. Open `/organization` and confirm the page shows an intro title/description, then three sections (Identidad, Datos fiscales, Datos de contacto) each laid out as a left title/description column plus a right field column, with a divider between sections.
2. Confirm the logo shows the organization's initials when no logo is set, and that uploading a PNG/JPG/SVG under 2 MB succeeds (including a file with a long filename — should no longer 500 on the backend).
3. Pick a business-type card and confirm it gets the yellow-soft background/border and a filled yellow check-dot; confirm only one card is selected at a time.
4. Open the fiscal address field, confirm the modal opens pre-populated with the organization's existing saved address (not blank), and confirm the country dropdown inside the modal lists real countries (not "No se pudieron cargar los países").
5. Edit any field and confirm the sticky unsaved-changes banner appears with the yellow dot, bold "Tienes cambios sin guardar" title, secondary hint text, and Descartar/Guardar cambios buttons. Confirm Descartar restores the last-loaded values and the banner disappears.
6. Save changes and confirm a "Cambios guardados correctamente" toast appears and the banner disappears.
7. Edit the email, phone, and website fields and confirm they are always enabled (no gray/disabled state, no explanatory note, regardless of whether the organization has a linked Business Partner), and that saving persists the values to `AD_OrgInfo.EM_Etgo_Email/Phone/Web`.
8. Onboard a brand-new tenant through the wizard, filling in a Tax ID in the "Details to start invoicing" step (e.g. `1234`). Once onboarding finishes, open `/organization` for that tenant and confirm the NIF field shows the real value entered — not the literal `"?"` placeholder. Repeat with the Tax ID left blank and confirm it still shows `"?"` (unchanged legacy behavior for the optional-and-not-provided case).
9. Onboard a brand-new tenant as a Company, entering a Company Name (e.g. `Acme Corp`). Once onboarding finishes, open `/organization` for that tenant and confirm "Nombre comercial" shows `Acme Corp` (not blank). Repeat onboarding as a Freelancer (no Company Name field shown) with a Full Name (e.g. `Jane Freelancer`) in the profile step, and confirm "Nombre comercial" shows `Jane Freelancer` instead.
