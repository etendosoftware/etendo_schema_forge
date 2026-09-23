# Fiscal Config

## Intent

Use this window to configure the electronic invoicing system for an organization — selecting the correct regime (SII, TBAI, SII+TBAI, or Verifactu) based on the organization's fiscal territory, and then filling in the operational details required by the corresponding tax authority.

The window serves two distinct phases: onboarding (first-time setup via a guided wizard) and ongoing configuration maintenance (editing the records created during onboarding).

## Theme roles

The configuration forms, certificate workflow, expiry banner and onboarding
steps use the shared semantic theme. Structural UI resolves from shared surface
and control roles; certificate state and validation feedback use success,
warning, information, neutral and destructive roles.

## What this window should allow

- Guide new organizations through fiscal territory selection and system assignment via a 6-screen onboarding wizard.
- Detect which fiscal records already exist and render only the applicable section(s): SII, TBAI, SII+TBAI (combined), or Verifactu.
- Allow editing of operational fields for each system: fiscal year dates, TBAI certificate upload, and Verifactu editable fields only. (SII submission cadences — `plazoLmiteDeEnvoASII`, `cadenciaEnvoFacturasVentaASII`, `cadenciaEnvoFacturasCompraASII` — are stored in the DB but are no longer exposed in the SiiSection UI; they retain any value set outside the app.)
- SII's "Authorization registration number" field (`authorizationno`, `SiiSection.jsx`) has `autoComplete="off"` — without it the browser autofilled the field with the logged-in user's saved email — plus a client-side `maxLength={15}` and a `validate()` guard rejecting values over 15 characters, matching the `authorizationno VARCHAR(15)` DB column; the error surfaces via the `fiscal.sii.err.authRegNoTooLong` i18n key (`en_US.json`/`es_ES.json`).
- **Second occurrence of the same autofill bug class (ETP-5338 point 6).** After the fix above, a distinct trigger reappeared: uploading the digital certificate in `CertModal.jsx` and letting the browser save the certificate password caused it to pair `authorizationno` as the associated "username" for that saved credential — because `CertSection`/`CertModal` render inline (no portal) inside `SiiSection`'s DOM tree whenever the cert upload dialog is open, and the password `<input>` had no `name`/`id`/`autoComplete` at all. `autoComplete="off"` on `authorizationno` did not prevent this because modern Chromium/Firefox password-manager heuristics can deliberately ignore `autocomplete="off"` on a field they classify as password-related, and they pick the nearest visible text input as the "username" pairing when no explicit one exists near the password field. Fix applied in `CertModal.jsx`:
  - The passphrase input now has `id`/`name="cert-passphrase"` and `autoComplete="new-password"` (the modern idiom browsers respect more reliably than `off` for password fields), and `authorizationno` now also carries an explicit non-generic `name`/`id="sii-authorization-number"` so the heuristic has a clearer signal even if it ever looked past the modal.
  - The passphrase input is wrapped in its own `<form autoComplete="off" onSubmit={e => e.preventDefault()}>` (there is no other `<form>` anywhere in `fiscal-config`, so this does not nest inside an ancestor form) to further scope the browser's heuristic to just this field.
  - A hidden dummy `<input type="text" name="username" autoComplete="username" ... style={{ display: 'none' }} />` was added immediately before the passphrase input as defense-in-depth — a documented browser workaround that gives the password-manager heuristic an explicit, harmless "username" to pair with the password instead of it wandering the page. This input's value is always `""`, is `readOnly`, `aria-hidden`, `tabIndex={-1}`, and is never read or included in any submitted payload (the real upload uses `FormData` built manually in `performUpload()`), so it has no visible text and no i18n implication.
  - **Caveat:** this is fundamentally a browser-behavior bug. The attribute changes are structurally guaranteed and unit-testable (presence of `autoComplete`/`name`/`id`, presence and emptiness of the dummy field, that its value is never read), but whether a given browser version actually stops offering to save/autofill `authorizationno` after this fix depends on that browser's own heuristics and the user's saved-password history, and cannot be asserted by an automated test — **manual verification in an actual browser (upload a cert, accept a hypothetical save-password prompt, reload, and confirm `authorizationno` stays empty) is recommended before considering this closed.**
- Prompt certificate upload (`.p12`/`.pfx`) for systems that require it (TBAI, SII+TBAI, Verifactu) at the end of onboarding.
- Show a conflict warning when incompatible records coexist (e.g. Verifactu + SII).
- Persist Verifactu tax type using the AD enum codes (`01` IVA, `03` IGIC, `02` IPSI), while showing the human-readable labels in the custom UI.
- Normalize fiscal boolean fields from NEO (`true`/`false` or `Y`/`N`) so switches render correctly and writes persist the intended boolean state.

## Wizard screens

The onboarding wizard activates when the organization has no fiscal configuration records (`profile = unconfigured`). It walks through 6 logical screens:

| Screen | Key | When shown |
|--------|-----|------------|
| Territory selection | `territory` | Always first |
| Sub-question | `subquestion` | When territory has `askNational` or `askVolume` |
| Manual system selection | `manual` | When the user taps "Select manually"; if a territory was already chosen it stays preselected |
| Confirmation | `confirm` | After territory + sub-question resolved |
| Detail (operational fields) | `detail` | After confirmation creates DB records |
| Applied / success | `applied` | After a successful detail save |
| Skipped | `skipped` | When user explicitly skips |

Territory groups and their regimes:

| Regime | Territories | Sub-question asked |
|--------|-------------|-------------------|
| `sii_foral` | Navarra | None (always SII) |
| `tbai` | Álava, Bizkaia, Gipuzkoa | `askNational`: also SII national? |
| `siiver` | España/Baleares, Canarias, Ceuta/Melilla | `askVolume`: billing > or ≤ 6.010.121 € |

`resolveSystem({ regime, alsoNational, volume, lowChoice })` in `fiscalConfig.utils.js` is the pure function that maps those answers to a final system (`SII`, `TBAI`, `SII+TBAI`, or `VERIFACTU`).

The manual screen still enforces territory-driven compatibility, but it no longer requires a prior selection on the first screen. Users can open manual mode directly, pick a territory there, and then choose one of the compatible systems. If they had already chosen a territory on the first screen, that territory appears preselected in the manual screen.

Changing the territory in either the main wizard screen or the manual screen resets the auto-flow answers (`alsoNational`, billing volume, and low-volume choice) so stale answers from a previous territory cannot leak into the confirmation summary. When the user reaches confirmation from manual mode, the back button returns to the manual screen rather than to the automatic sub-question flow.

## Profile detection

`detectProfile(sii, tbai, verifactu)` in `fiscalConfig.utils.js` derives the active profile from the presence and flags of the 3 config records:

| Profile | Condition |
|---------|-----------|
| `unconfigured` | All 3 records null |
| `sii` | SII record present, no special flags |
| `sii-navarra` | SII record with `navarra=Y` |
| `sii+tbai` | Both SII and TBAI records exist; OR SII record with `guipuzcoa=Y` (legacy fallback for Gipuzkoa) |
| `tbai` | Only TBAI record present |
| `verifactu` | Only Verifactu record present |
| `conflict` | Verifactu + SII or Verifactu + TBAI both exist |

## Change SIF (switching the active fiscal system)

Once an organization has a live fiscal configuration, the window lets the user **change the active SIF** — for example to move from Verifactu to SII+TBAI, or simply to leave the organization with no active fiscal system. The change is intentionally destructive-looking but non-destructive: the outgoing configuration is **deactivated and kept as a trace, never deleted**.

### One active config per org (data model)

The three SIF modules originally enforced "one config per org" through a UNIQUE constraint. To allow an inactive trace row to coexist with a live one, that constraint was **relaxed to "one *active* config per org"**, enforced by a `BEFORE INSERT/UPDATE` trigger in each module:

| Module | Table | Trigger |
|--------|-------|---------|
| SII (`org.openbravo.module.sii`) | `AEATSII_CONFIG` | `AEATSII_ONE_ACTIVE_CONFIG_TRG` |
| TicketBAI (`com.smf.ticketbai`) | `TBAI_CONFIG` | `TBAI_ONE_ACTIVE_CONFIG_TRG` |
| Verifactu (`com.etendoerp.verifactu`) | `ETVFAC_VERIFACTU_CONFIG` | `ETVFAC_ONE_ACTIVE_CONFIG_TRG` |

The invariant is therefore: **at most one active config record per system per org at any time**, with any number of inactive trace rows alongside it. Exactly one active config across all three systems is the "configured" state; zero active rows is the "no active SIF" state.

### Button visibility

The **"Change SIF"** button (`fiscal.changeSif.action`, `data-testid="FiscalConfigPage__changeSif"`) is rendered in the org bar next to Save/Cancel, and only when `canChangeSif` is true:

```
canChangeSif = !mockOverride && orgId && CONFIGURED_PROFILES.includes(effectiveProfile)
```

`CONFIGURED_PROFILES = ['sii', 'sii-navarra', 'sii+tbai', 'tbai', 'verifactu']`. It is therefore hidden when the org is unconfigured (the wizard is shown instead), in a `conflict` state, or when the page is running under a mock/debug profile override (mock records cannot be deactivated on the server).

### Confirm dialog and deactivation

Clicking the button opens `ChangeSifDialog` (`data-testid="ChangeSifDialog__content"`). On **Confirm** (`fiscal.changeSif.confirm`, "Deactivate and change"), the dialog deactivates each config record the active profile spans, using the **same NEO save path the section forms use for edits** — a `PUT` to `/{spec}/{entity}/{recordId}` with body `{ active: false }` (NEO writes `isactive='N'`). The row is retained as a trace; nothing is deleted.

`getSystemsToDeactivate(profile)` in `fiscalConfig.utils.js` maps the profile to the systems that must be deactivated:

| Profile | Systems deactivated | PUT endpoints (spec / entity) |
|---------|---------------------|-------------------------------|
| `sii`, `sii-navarra` | `sii` | `sii-config` / `siiConfiguration` |
| `tbai` | `tbai` | `tbai-config` / `header` |
| `verifactu` | `verifactu` | `verifactu-config` / `cabeceraDeConfiguraciónVerifactu` |
| `sii+tbai` | `sii`, then `tbai` | both of the above, sequentially |

On success the dialog closes and calls `onChanged` → `refetch`; with no active row left, `detectProfile` resolves the org to `unconfigured` and the **existing onboarding wizard reappears automatically** (see "Wizard reappearance" below).

### sii+tbai — two-step deactivation and partial failure

A combined `sii+tbai` profile spans two rows, deactivated **sequentially**. By design there is **no rollback**: if the second PUT fails after the first succeeded, the first system stays deactivated (e.g. `sii+tbai` degrades to `tbai`-only). No data is corrupted — a row is only flagged inactive — and the state is fully recoverable. In that case the dialog shows `fiscal.changeSif.err.partial` (`data-testid="ChangeSifDialog__error"`), naming which system(s) were already deactivated and instructing the user to **re-open the dialog to finish deactivating the rest**. Rollback is intentionally out of scope because the partial state is rare and self-recoverable.

### Wizard reappearance

Leaving the wizard without choosing a system is a **valid "no active SIF" state** — an org may legitimately carry only inactive trace rows. Picking and configuring a SIF from the wizard creates a new active config (possibly from a different SIF family than the one deactivated). Because the trigger enforces one active row per org per system, the new active config coexists cleanly with the old trace rows.

### Informational notices — INFORM, never block

Before confirming, the dialog shows a per-SIF **permanence notice** (`fiscal.changeSif.notice.*`, `data-testid="ChangeSifDialog__notice"`), chosen by `getChangeSifNoticeKey(profile)`:

| Profile | Notice key | Gist |
|---------|-----------|------|
| `sii`, `sii-navarra` | `fiscal.changeSif.notice.sii` | Voluntary SII → one-natural-year permanence; renounce via form 036 in November of the prior year; mandatory SII cannot be renounced. |
| `verifactu` | `fiscal.changeSif.notice.verifactu` | Free to change during the test period; once mandatory, stay until 31 Dec of that year unless obligated to SII. |
| `tbai` | `fiscal.changeSif.notice.tbai` | No ordinary renunciation; may only leave when the foral obligation ceases; new software must still comply with TicketBAI. |
| `sii+tbai` | `fiscal.changeSif.notice.siiTbai` | Both SII permanence and TicketBAI foral obligations apply. |

These notices **inform only — they never block the change.** A generic soft warning (`fiscal.changeSif.softWarning`) is always shown, and the user **assumes legal responsibility on confirm**. The Verifactu `isReady` lock (which disables field *editing* in `VerifactuSection`) is respected but does **not** block the Change SIF flow — deactivating the config is always permitted.

### Active-config resolution (client-side)

NEO Headless reads fiscal-config records with `NO_ACTIVE_FILTER=true` (see `NeoCrudHelper#buildBaseParams`), so a deactivated trace row is still returned by the API. The client must therefore filter to the active row **before** resolving the profile. This relies on the DAL→JSON converter always serializing the `active` boolean (`NeoFieldFilter.java:139-144`). Two helpers in `fiscalConfig.utils.js` enforce this:

- `isActiveRecord(record)` — false only when the record is explicitly inactive; a missing `active` property is treated as active (never hide a record on an absent flag).
- `activeOrNull(record)` — returns the record only if active, else `null`.

`fetchRecord` in `useFiscalConfig.js` pulls a small page (`_limit=10`) and prefers the active row (`rows.find(isActiveRecord) ?? rows[0]`) so a leftover trace never masks a real active config; the results are then passed through `activeOrNull` before `detectProfile`. The fiscal-monitor hook (`fiscal-monitor/useFiscalMonitor.js`) applies the identical gate, so an inactive trace row never resolves the monitor to a configured state either.

### data-testids

| `data-testid` | Element |
|---------------|---------|
| `FiscalConfigPage__changeSif` | "Change SIF" button in the org bar |
| `ChangeSifDialog__content` | Dialog content container |
| `ChangeSifDialog__title` / `__description` | Dialog heading and body |
| `ChangeSifDialog__notice` / `__noticeIcon` | Per-SIF permanence notice card + icon |
| `ChangeSifDialog__softWarning` | Generic soft warning line |
| `ChangeSifDialog__error` | Error / partial-failure message |
| `ChangeSifDialog__cancel` / `__confirm` | Footer buttons |
| `ChangeSifDialog__spinner` | Spinner shown while deactivating |

## Interaction model

- Route: `/fiscal-config` (custom window, not generated).
- Visibility: visible in the Settings menu.
- Implementation type: `layoutType: "custom"` — loaded from `customLoaders` in `tools/app-shell/src/windows/registry.js`.
- Entry point: `FiscalConfigPage.jsx` — determines profile and delegates to wizard or section components.

## Window-access gate (ETP-5395 Fix 3)

`FiscalConfigPage.jsx` is a fully hand-written custom page, so — despite menu.json carrying this window's own real `AD_Window_ID` (`C1D3A2A017AC4B82B9FEE6F4D2A0C55A`) — it never automatically picked up the generic `useWindowAccess`/`WindowAccessGuard` gate `generate-frontend.js` wires into every generated window, the same class of gap ETP-4658 found and fixed for `financial-account`/`sales-invoice`/etc. Without it, a role with no grant on this window still fired the sii/tbai/verifactu-config fetches, got a correct backend 403 (`"Access denied to spec for current role"`), and `useFiscalConfig.js`'s `fetchAllRows()` HTTP-status-only error message rendered raw ("Failed to load {spec}: HTTP 403" + a Retry button that can never help). Fixed by adding the guard check after the last hook (`verifactuRef`), before the "Add complementary SIF" logic and the render branches. **Not yet applied to `fiscal-monitor`**, whose `useFiscalMonitor.js` reuses this same `fetchAllRows()` helper and has the identical gap (grepped: zero `WindowAccessGuard`/`useWindowAccess` references anywhere in that window's custom directory) — out of scope for this fix since it was not part of the reported symptom, flagged as a follow-up candidate.

## Data model

Three independent NEO Headless entities (one per system):

| System | Entity spec | Entity name |
|--------|------------|-------------|
| SII | `sii-config` | `siiConfiguration` |
| TBAI | `tbai-config` | `header` |
| Verifactu | `verifactu-config` | `cabeceraDeConfiguraciónVerifactu` |

Records are POST-created during wizard confirmation step and then edited in the detail step. `useFiscalConfig.js` parallelizes the 3 GET fetches and derives the profile client-side. Since the "Change SIF" feature (ETP-4785), each system can hold **at most one active row plus any number of inactive trace rows** per org; the client filters to the active row before resolving the profile (see "Change SIF" → "Active-config resolution").

## Certificate upload (CertModal + CertSection)

`CertSection.jsx` renders the certificate status widget inside SII, TBAI, and Verifactu section forms. On mount it calls `GET /sws/neo/certificate` (org inferred from the bearer token) to restore the cert status from `etsg_certificate`, so the "loaded" state persists across window refreshes. `CertModal.jsx` is the 3-step upload modal (pick → verify spinner → done/confirmNif).

### Backend endpoints (`NeoCertificateHelper`)

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/sws/neo/certificate` | Upload a PKCS#12 cert via `multipart/form-data` (fields: `certificate`, `orgId`, `password`, optional `setOrgNif`) |
| `GET`  | `/sws/neo/certificate` | Return `{exists, validTo}` for the active cert (org inferred from bearer token) |

The upload delegates to `AddCertificateToOrg` (existing SIF process) via reflection.

### NIF/CIF validation

Before storing the cert the backend parses the X.509 subject DN to extract the org NIF, using this priority order:

1. `organizationIdentifier` (OID 2.5.4.97) — FNMT RPJ certs; holds the company CIF.
2. `SERIALNUMBER` (OID 2.5.4.5) — personal/autónomo certs; holds the person's NIF.
3. `CN=… (R: NIF)` — fallback for older FNMT formats.

The extracted NIF is then compared (case-insensitive, hyphen-stripped) against `ad_orginfo.taxid`. Values `null`, empty, or `'?'` are treated as "org has no NIF configured". Three outcomes:

- **Match** — proceed to store.
- **No org NIF** — return `{pendingNifConfirmation: true, certNif}`. Frontend shows a confirmation step; if the user confirms, client re-posts with `setOrgNif=true` and the backend writes the NIF to `ad_orginfo.taxid`.
- **Mismatch** — return HTTP 422 with an explanatory error message.

`NeoCertificateHelperTest.java` (17 unit tests) covers `parseNifFromDn` and `normalizeNif` for all supported certificate formats.

## Certificate expiry banner (`CertExpiryBanner`)

`CertExpiryBanner.jsx` renders a warning notice when the organization's digital certificate is approaching expiry. It is shown in `FiscalConfigPage.jsx` with `variant="prominent"` (card style, after the page header). `useCertExpiry.js` fetches `GET /certificate` on mount (org inferred from bearer token) and computes the remaining days via the exported `daysUntil(dateStr)` pure helper.

| Days remaining | State | Appearance | Dismissible |
|----------------|-------|------------|-------------|
| > 60 | Hidden | — | — |
| 31 – 60 | Warning | Amber card with ⚠️ icon | Yes |
| 0 – 30 | Critical | Red card with 🔴 icon | No |

- `daysUntil(dateStr)` lives in `certExpiryUtils.js` (pure, no React deps). Both `todayUtc` and `expiryUtc` are built with `Date.UTC` from UTC date parts (`getUTCFullYear/Month/Date`), so the 60/30-day thresholds fire at UTC midnight regardless of the user's local timezone. Impossible dates (e.g. Feb 31) are rejected via a round-trip check before the diff is computed.
- When `isCritical` the dismiss button is not rendered; re-opening the page always shows the banner until the cert is renewed.
- The `dismissed` flag is local to the component instance (resets on page reload) — intentionally, to keep the warning visible to all users who open the page.

i18n keys used:
- `fiscal.cert.expiry.warn.title` — "Certificate expiring in {days} days"
- `fiscal.cert.expiry.critical.title` — "Certificate expires in {days} days"
- `fiscal.cert.expiry.body` — renewal call-to-action sentence
- `fiscal.cert.expiry.dismiss` — aria-label for the × button

Debug: the debug panel exposes a "Cert expiry" section with three toggle buttons (None / 45d warn / 20d crit) that inject a mock `daysLeft` value into the hook, bypassing the API entirely.

## Forced test mode lock (ETP-5272)

The window queries `GET /sws/neo/fiscal-test-mode` on mount (via `useFiscalTestMode.js`) to
read whether the AD_Preference *"Fuerza SII/TicketBAI/VeriFactu a modo prueba"* is effectively
active for the current client. The endpoint returns `{ "forceTestMode": true|false }`, is
authenticated (`Authorization: Bearer <token>`, 401 on missing/invalid token), and is served by
`com.etendoerp.go` (branch `feature/ETP-5272`, commit `87a9546e`).

When `forceTestMode` is `true` the window becomes **read-only**:

- The active section (`SiiSection`, `TbaiSection`, `VerifactuSection`) is rendered with a
  `locked` prop that gates its own `set()` state updater and disables its input controls
  (`Input`/`Switch`) — the SAME mechanism `VerifactuSection` already used for its `isReady`
  lock (ETP-4785), OR'd together: `isLocked = isEtendoTrue(record?.isReady) || !!locked`.
  `SiiSection` and `TbaiSection` gained the identical `locked` prop and guard so all three
  sections lock the same way.
- The page-level Save button is disabled (`disabled={saving || !orgId || forceTestMode}`).
- The "Add SII"/"Add TBAI" complementary action (`canAddComplementary`) is hidden — creating
  a new active fiscal system record is itself a kind of activation forced-test-mode must block.
- A warning banner (`data-testid="FiscalConfigPage__testModeBanner"`, same testid on
  `OnboardingWizard__testModeBanner` for the wizard) is shown above the section content.
  **Restyled (ETP-5272 follow-up)** from a hand-rolled bordered-card `<div>` + inline
  `AlertTriangle` (the pattern this section originally shared with the "Change SIF" permanence
  notice, `ChangeSifDialog__notice`) to the shared `InfoBanner` component
  (`@/components/InfoBanner.jsx`, `tone="warning"`, `icon={AlertTriangle}`) — a left-accented,
  tone-driven strip already used elsewhere in the app. **`ChangeSifDialog__notice` itself was
  NOT migrated** and still renders the original hand-rolled markup — the two banners have
  deliberately diverged in implementation (though not in visual weight/color) since this fix;
  do not assume `ChangeSifDialog.jsx` also uses `InfoBanner` when reading its source. Message
  key unchanged: `fiscal.testModeLock.warning` — "You can only activate a fiscal system in a
  production environment." / "Solo podrá activar un sistema fiscal en un entorno productivo."
- The certificate upload flow (`CertSection`/`CertModal`) and "Change SIF" (deactivation only,
  never an activation) are intentionally **not** locked — same precedent as the pre-existing
  `isReady` lock, which never blocked "Change SIF" either.
- **The onboarding/setup wizard (`unconfigured` profile) IS locked too** (`OnboardingWizard.jsx`,
  `forceTestMode` prop forwarded from `FiscalConfigPage`). This closed a scope gap in the initial
  ETP-5272 delivery: the wizard is the **only** path that performs a first-time fiscal-system
  **activation** (the `createRecords()` POST to `sii-config`/`tbai-config`/`verifactu-config` on
  the confirm step) — exactly the action the AD_Preference exists to block, with no carve-out for
  "first-time setup" in the requirement. Concretely:
  - The same `OnboardingWizard__testModeBanner` warning (`fiscal.testModeLock.warning`) is shown
    above every wizard step while `forceTestMode` is true. Territory/system browsing stays usable
    (nothing is written to the DB by picking options), but:
  - The confirm screen's activate button (`OnboardingWizard__confirmActivateButton`) is disabled,
    and `createRecords()` itself also short-circuits on `forceTestMode` (belt-and-suspenders next
    to the network call, not just in the button's `disabled` prop) — so the wizard can never reach
    the `detail`/`applied` steps while locked.
  - The `detail` step's own Save button (`OnboardingWizard__detailSaveButton`) and its
    `SiiSection`/`TbaiSection`/`VerifactuSection` instances also receive `locked={forceTestMode}`,
    covering the edge case where the preference flips on mid-session after records already exist.
  - `conflict` is **not** reached through this wizard at all and needed no locking decision here:
    `detectProfile()` only resolves to `'unconfigured'` (which renders the wizard) when NONE of
    the SII/TBAI/Verifactu records exist; `conflict` requires a Verifactu record **plus** a
    SII-or-TBAI record to already be present (`verifactu && (sii || tbai)`), which is a
    data-integrity anomaly between two already-created configs, not an activation step. Confirmed
    separately: the `conflict` branch in `FiscalConfigPage.jsx` renders only a static warning card
    (`fiscal.conflict.title`/`fiscal.conflict.body`) — no `SiiSection`/`TbaiSection`/
    `VerifactuSection`, no Save action, nothing to lock — so its exemption from this check remains
    correct and is unrelated to the wizard fix.

**Fail-open on fetch error:** any network/HTTP/parse failure from `/fiscal-test-mode` leaves
`forceTestMode` at `false` — the window stays fully usable — but the failure is always
surfaced via `console.warn` (never a silent catch). See `useFiscalTestMode.js`.

See items 13–14 of "Manual verification" below for the full checklist.

## Territory→system restriction — SII does not support IPSI (ETP-5272 point 4)

SII (`AEATSII_CONFIG.taxtype`) only accepts an `IVA`/`IGIC` taxpayer — confirmed against
the live `AD_Ref_List` for that column (`ad_reference_id = AC024BD7E7B64B5BAC925EB7F0B4B16F`):
only the values `IVA` and `IGIC` exist, there is no `IPSI` entry. Ceuta/Melilla taxpayers
use **IPSI** (Impuesto sobre la Producción, los Servicios y la Importación), the local tax
scheme of the two Autonomous Cities, which SII has no way to represent at all. Confirming
SII for that territory previously reached the confirm/detail step and then failed
server-side on `createRecords()`'s POST to `sii-config`, with the error quoted in the ticket.

VERI*FACTU's own tax-type reference list (`AD_Ref_List` for
`ETVFAC_VERIFACTU_CONFIG.TAX_Type`, `ad_reference_id = 3782E9C02E674127A50DA5441DF28C90`)
defines all three (`01` IVA, `02` IPSI, `03` IGIC), so VERI*FACTU is unaffected and is the
only valid system for Ceuta/Melilla.

**Canarias (IGIC) is not affected** — IGIC is one of SII's two valid `taxtype` values, so
Canarias keeps offering both SII and VERI*FACTU exactly as before; only Ceuta/Melilla (IPSI)
is restricted.

**TicketBAI was checked too, and needed no change.** TBAI's own territory reference list
(`ETSG_SIF_Territory` — `AD_Ref_List` for `ad_reference_id = 93621A4C820041CEACB5AFF87FD0AC31`)
enumerates `ARABA`, `BIZKAIA`, `GIPUZKOA`, `NAVARRA`, `AEAT`, `IGIC` — there is no
Ceuta/Melilla value, and TicketBAI has always been offered only for the Basque territories
(`alava`/`bizkaia`/`gipuzkoa`) in this wizard. TBAI was therefore never reachable for
Ceuta/Melilla in the first place, unlike SII.

### Fix — data/config-level, not a one-off `if`

`getAllowedSystemsForTerritory(territory)` in `fiscalConfig.utils.js` is now backed by a
single declarative table, `TERRITORY_ALLOWED_SYSTEMS`, instead of a switch that grouped
`baleares`/`canarias`/`ceuta` together:

| Territory | Allowed systems |
|-----------|-----------------|
| `navarra` | `['SII']` |
| `alava` / `bizkaia` / `gipuzkoa` | `['TBAI', 'SII+TBAI']` |
| `baleares` / `canarias` | `['SII', 'VERIFACTU']` |
| `ceuta` | `['VERIFACTU']` |

This table is consumed in three places, so the restriction can never be bypassed through
an alternate path:

1. **Manual system selection screen** (`ManualScreen` → `getAllowedSystemsForTerritory`) —
   picking "Ceuta / Melilla" now renders only the VERI*FACTU card, not SII.
2. **Automatic territory→system resolution** (`resolveSystem` in `fiscalConfig.utils.js`) —
   now takes an optional `territory` argument; for the `siiver` regime, when
   `getAllowedSystemsForTerritory(territory)` excludes `'SII'`, it returns `'VERIFACTU'`
   unconditionally, regardless of the billing-volume sub-question answers. Backward
   compatible: omitting `territory` preserves the old regime-only behavior.
3. **The billing-volume sub-question itself is skipped for Ceuta/Melilla** —
   `TERRITORY_META.ceuta.askVolume` is now `false` (was `true`). Since SII cannot apply to
   this territory at all, asking "¿Cuál es su volumen de facturación anual?" would be moot
   (the answer never changes the outcome), and the previous copy for the "high volume" path
   explicitly said *"Gran Empresa · SII obligatorio... no aplica VERI*FACTU"* — legally wrong
   for an IPSI taxpayer. The territory screen now routes Ceuta/Melilla straight from
   territory selection to the confirm screen, same as `navarra`.

**Belt-and-suspenders guards** against the same invalid combination reaching the backend
through a different path: `buildOnboardingPayloads('SII', 'ceuta')` and
`getTerritoryDefaults('ceuta', true)` (used by wizard confirmation and by the
not-yet-wired "Add SII" complementary-action default builder, respectively) both now return
`sii: null` instead of a `{ taxtype: 'IPSI', ... }` payload — those branches should be
unreachable given the fixes above, but are guarded so a future regression fails safe
instead of building a payload the server rejects.

**Territory card badge**: the Ceuta/Melilla card in `TerritoryScreen`/`ManualTerrCard` used
the shared `siiver`-regime badge text ("SII / VERI*FACTU"), which was also misleading. It
now uses a dedicated `fiscal.territory.system.verifactu` i18n key ("VERI*FACTU") instead of
sharing `fiscal.territory.system.siiver` with `baleares`/`canarias`.

**Not changed / accepted as-is:** the `siiver` territory GROUP header shared by
`baleares`/`canarias`/`ceuta` ("SII / VERI*FACTU" / *"Se preguntará según tu volumen de
facturación"*) still describes the group as a whole rather than per-territory — restructuring
the group itself (splitting Ceuta/Melilla into its own group row) is a larger structural/visual
change than this fix warrants and was left out of scope; only the per-territory badge on the
individual card was corrected.

### Error-message bug — investigated, NOT fixed here (out of scope)

The `CachedSet@6c917e9a` leak in the reported server error comes from
`org.openbravo.base.model.domaintype.BaseEnumerateDomainType.checkIsValidValue()`
(`etendo_core/src/org/openbravo/base/model/domaintype/BaseEnumerateDomainType.java:63-69`):
it builds the `ValidationException` message with
`"... it should be one of the following values: " + getEnumerateValues() + ...`, and
`getEnumerateValues()` returns a `com.etendoerp.redis.interfaces.CachedSet`
(`etendo_core/src/com/etendoerp/redis/interfaces/CachedSet.java`) that implements `Set<E>`
but never overrides `toString()`, so string concatenation falls back to the default
`Object.toString()` (`ClassName@hexHash`) instead of listing the enum values.

**This is out of scope for a narrow fix and was deliberately left untouched**, per the
task's own guidance: `BaseEnumerateDomainType` is core Openbravo domain-type validation
machinery (`etendo_core/src/org/openbravo/base/model/domaintype/`), used for **every**
enumerate/list-typed `AD_Column` validation across the entire application — not something
owned by, or scoped to, `com.etendoerp.go` or this window. A fix at either candidate site
(the message-building code in `BaseEnumerateDomainType`, or adding a `toString()` override
to `CachedSet`) changes behavior platform-wide and belongs to a separate ticket/owner, not
this Schema Forge window fix. Flagging it here for the human to decide whether to escalate
it as its own core-platform ticket.

## `onGoHome` prop

`OnboardingWizard` accepts an optional `onGoHome` prop. If provided, "Ir al inicio" (applied screen) and "Ir al inicio" (skipped screen) will call it instead of `onComplete`. This allows the host application to navigate to a dashboard or first-steps screen rather than staying in the fiscal-config window. When omitted, both buttons fall back to `onComplete`.

## Wizard applied step — cert auto-check

When the wizard reaches the `applied` step, a `useEffect` fires to fetch the current cert status from `GET /certificate` (org inferred from bearer token). If the cert already exists (i.e. the user uploaded it during the `detail` step via `CertSection`), `setCert()` is called immediately — this prevents the "Upload digital certificate [PENDING]" next-step item from remaining shown after a successful upload.

Without this fetch the wizard's top-level `cert` state would only update when the cert is uploaded through `CertModal` on the applied step itself, not through `CertSection` inside the detail step. The two components have independent state; the API call bridges them.

## Wizard applied step — environment row (ETP-5027)

The "Entorno" row of the applied summary used to be hardcoded to the sandbox label, so an organization configured for production was still told it was in "Sandbox · pruebas". It now derives the value from the config records created during the wizard, via `isProductionEnvironment(system, createdRecords)` in `fiscalConfig.utils.js`.

Each fiscal system stores the environment in its own column, and VERI*FACTU stores it **inverted**:

| System | Field (API key) | AD column | Meaning of `Y` |
|--------|-----------------|-----------|----------------|
| SII | `entornoDeProduccin` | `ENTORNO_DE_PRODUCCIN` | production |
| TicketBAI | `productionEnv` | `Production_Env` | production |
| VERI*FACTU | `isDevEnv` | `IS_Dev_Env` | developer/**test** environment |

`isDevEnv` is curated as a `system` field in `artifacts/verifactu-config/decisions.json`, which maps to `ISINCLUDED=Y` / `ISREADONLY=Y` — it is returned by NEO GET responses but cannot be written from the frontend, which is exactly what this read-only display needs.

For `sii+tbai` both records must report production for the row to read "Producción". Any missing or unknown flag falls back to the sandbox label and the `text-status-warning-foreground` token; production uses `text-status-success-foreground`. Labelling a test setup as production is the more dangerous error, so the fallback is deliberately never "Producción".

## Manual verification

1. Delete any existing SII/TBAI/Verifactu records for the test org, open `/fiscal-config`, and confirm the wizard territory screen appears.
2. Select "España/Baleares", confirm the volume sub-question appears, choose "≤ 6M€", choose "Verifactu", advance to confirm, and verify the summary shows Verifactu before pressing "Confirmar".
3. After confirmation, verify the detail screen shows the Verifactu form. Press "Guardar y aplicar" and confirm the applied screen appears with the success card.
4. Select "Álava" and choose "SII + TicketBAI", advance to confirm. After confirmation, verify both SiiSection and TbaiSection appear in the detail screen.
5. Upload a `.p12` certificate in the CertModal; confirm the stepper advances through pick → verify → done (or through the confirmNif step if the org has no taxid). Close and reopen the window — the "Certificado cargado" state should still show (persisted via GET endpoint).
5a. In the wizard, upload the certificate during the `detail` step (via `CertSection`), then advance to the `applied` step — confirm the "Upload digital certificate" item shows as completed (not PENDING).
5b. In the debug panel, enable "45d warn" — confirm the amber expiry banner appears in the page header. Enable "20d crit" — confirm it turns red and the dismiss button disappears.
6. Open `/fiscal-config` with an org that already has an SII record and confirm the wizard is NOT shown — only SiiSection renders.
7. Open `/fiscal-config` with an org that has both SII and Verifactu records and confirm the conflict warning renders.
8. Press "Omitir por ahora" on the territory screen and confirm the skipped screen shows with a "← Volver al asistente" button that returns to territory selection.
9. Open `/fiscal-config` with an org that has a single active SII (or Verifactu/TBAI) config. Confirm the **"Change SIF"** button appears in the org bar. Press it, confirm the dialog shows the matching permanence notice, press "Deactivate and change", and verify the onboarding wizard reappears (org resolved to `unconfigured`). Query the DB and confirm the old config row still exists with `isactive='N'`.
10. Repeat with a `sii+tbai` org and confirm **both** the SII and TBAI rows are deactivated (two-step) and the wizard reappears.
11. Open `/fiscal-config` with an org that has NO config, or one in a `conflict` state — confirm the "Change SIF" button is NOT shown.
12. (Verifactu, `isReady=true`) Confirm the Verifactu section fields are locked for editing but the "Change SIF" button still works — the lock does not block the change.
13. (ETP-5272) With the AD_Preference "Fuerza SII/TicketBAI/VeriFactu a modo prueba" active, open `/fiscal-config` for a configured org and confirm: the `FiscalConfigPage__testModeBanner` warning appears, all section inputs are disabled, the page Save button is disabled, and "Add SII"/"Add TBAI" is absent from the kebab menu — while "Change SIF" (if present) and certificate upload remain usable. Deactivate the preference and confirm the window returns to its normal editable state.
14. (ETP-5272) Simulate a `/sws/neo/fiscal-test-mode` fetch failure (network block or 500 in devtools) and confirm the window stays fully editable — fail-open — while a `console.warn` is logged.
15. (ETP-5272 follow-up — wizard lock) With the AD_Preference active, open `/fiscal-config` for a brand-new org (no SII/TBAI/Verifactu records) and confirm the onboarding wizard shows the `OnboardingWizard__testModeBanner` warning on every step. Pick a territory and reach the confirm screen — the activate button (`OnboardingWizard__confirmActivateButton`) must be disabled, and clicking it must not create any config record (check the DB / network tab). Deactivate the preference and confirm the same wizard flow now creates the record and reaches the detail/applied steps normally.

## Automated evidence

- `artifacts/fiscal-config/decisions.json` — `layoutType: "custom"`, window registered.
- `tools/app-shell/src/windows/registry.js` — `fiscal-config` in `customLoaders`; data-only fiscal specs are not registered as navigable windows.
- `tools/app-shell/src/menu.json` — `fiscal-config` entry under Settings group.
- `tools/app-shell/src/windows/custom/fiscal-config/FiscalConfigPage.jsx` — profile-routing orchestrator.
- `tools/app-shell/src/windows/custom/fiscal-config/OnboardingWizard.jsx` — 6-screen wizard with territory groups, sub-questions, confirm, detail, applied, and skipped screens.
- `tools/app-shell/src/windows/custom/fiscal-config/CertSection.jsx` — cert status widget with on-mount GET fetch to restore state after refresh.
- `tools/app-shell/src/windows/custom/fiscal-config/CertModal.jsx` — PKCS#12 upload modal (pick → verify → confirmNif? → done).
- `tools/app-shell/src/windows/custom/fiscal-config/fiscalConfig.utils.js` — `detectProfile`, `resolveSystem`, `getTerritoryDefaults`, `getCertificateContext`, `parseApiError` (async helper that reads the error body from a failed NEO response and extracts a human-readable message), plus the Change SIF helpers `isActiveRecord`, `activeOrNull`, `getChangeSifNoticeKey`, `getSystemsToDeactivate`, `getFiscalRecordId`. `buildOnboardingPayloads` creates the POST body for wizard confirmation; `acogidaAlSII` defaults to `'N'` so the SII enrollment flag is not prematurely activated during onboarding. `mapSiiRecordToForm` no longer maps `plazoLmiteDeEnvoASII`, `cadenciaEnvoFacturasVentaASII`, or `cadenciaEnvoFacturasCompraASII` — those fields are retained in the DB but excluded from the form state.
- `tools/app-shell/src/windows/custom/fiscal-config/ChangeSifDialog.jsx` — "Change SIF" confirm dialog: per-profile permanence notice, sequential deactivation via `PUT {active:false}`, partial-failure handling for `sii+tbai`.
- `tools/app-shell/src/windows/custom/fiscal-config/__tests__/ChangeSifDialog.vitest.jsx` — dialog tests: notice selection per profile, deactivation PUT path, sii+tbai two-step, partial-failure message, INFORM-not-block posture.
- `tools/app-shell/src/windows/custom/fiscal-config/__tests__/FiscalConfigPage.vitest.jsx` — page tests including `canChangeSif` visibility gating (`CONFIGURED_PROFILES`, no mock override) and dialog wiring, plus (ETP-5395 Fix 3) a "no access" describe block asserting `WindowAccessGuard` renders instead of the raw error box for a `'none'` access tier.
- `tools/app-shell/src/windows/custom/fiscal-config/__tests__/useFiscalConfig.activeRow.vitest.js` — active-row resolution: inactive trace rows dropped before `detectProfile`, `rows.find(isActiveRecord) ?? rows[0]` preference.
- `tools/app-shell/src/windows/custom/fiscal-config/useFiscalTestMode.js` — ETP-5272: fetches `GET /sws/neo/fiscal-test-mode` via `useApiFetch`; fails open (`forceTestMode: false`) with a `console.warn` on any network/HTTP/parse error; never silently swallows a failure.
- `tools/app-shell/src/windows/custom/fiscal-config/__tests__/useFiscalTestMode.test.js` / `useFiscalTestMode.vitest.js` — source-guard + behavioral tests: endpoint call, strict `=== true` check, AbortController cleanup, and every fail-open path (non-ok, rejected fetch, malformed json) resolving to `false` with a `console.warn`.
- `tools/app-shell/src/windows/custom/fiscal-config/FiscalConfigPage.jsx` — ETP-5272: wires `useFiscalTestMode`, renders the `FiscalConfigPage__testModeBanner` warning card, disables the page Save button, hides "Add complementary", and passes `locked={forceTestMode}` to `SiiSection`/`TbaiSection`/`VerifactuSection`.
- `tools/app-shell/src/windows/custom/fiscal-config/SiiSection.jsx` / `TbaiSection.jsx` / `VerifactuSection.jsx` — ETP-5272: all three now accept a `locked` prop that gates their `set()` updater and disables their input controls; `VerifactuSection` ORs it into its existing `isReady`-derived `isLocked` (same mechanism, not a parallel one).
- `tools/app-shell/src/windows/custom/fiscal-config/OnboardingWizard.jsx` — ETP-5272 follow-up: accepts a `forceTestMode` prop (default `false`); renders `OnboardingWizard__testModeBanner` above every step; `ConfirmScreen`'s activate button (`OnboardingWizard__confirmActivateButton`) and `createRecords()` itself are gated on it (no first-time record creation while locked); `DetailScreen`'s Save button (`OnboardingWizard__detailSaveButton`) and its `SiiSection`/`TbaiSection`/`VerifactuSection` also receive `locked={forceTestMode}` as defense-in-depth for the case where the preference flips on after the records already exist.
- `tools/app-shell/src/windows/custom/fiscal-config/FiscalConfigPage.jsx` — ETP-5272 follow-up: forwards `forceTestMode` to `OnboardingWizard` (the `'unconfigured'`-profile early return renders the wizard before the page's own banner/lock branch, so the wizard owns its own equivalent banner/lock rather than inheriting the page's).
- `tools/app-shell/src/windows/custom/fiscal-config/__tests__/OnboardingWizard.vitest.jsx` — ETP-5272 follow-up: banner shown/hidden by `forceTestMode`; territory→confirm navigation unaffected (browsing is not blocked); confirm/activate button disabled when locked and enabled when not; `createRecords()` never calls the API when locked; default (`forceTestMode` omitted) behaves as unlocked.
- `tools/app-shell/src/windows/custom/fiscal-config/__tests__/FiscalConfigPage.vitest.jsx` — ETP-5272 follow-up: `forceTestMode` is forwarded to `OnboardingWizard` as a prop (both `true` and `false`); the page's own `FiscalConfigPage__testModeBanner` correctly does NOT render in the `'unconfigured'` branch (that banner belongs to the configured-profile branch — the wizard renders its own).
- DB triggers (com.etendoerp.go SIF modules) — `AEATSII_ONE_ACTIVE_CONFIG_TRG`, `TBAI_ONE_ACTIVE_CONFIG_TRG`, `ETVFAC_ONE_ACTIVE_CONFIG_TRG` enforce one *active* config per org (relaxed from one config per org).
- `cli/test/fiscal-config.utils.test.js` — 92 regression tests covering profile detection, onboarding payloads, contract-specific ids, Verifactu save guards, SII field mapping, CertModal upload flow, and confirmNif flow (all passing).
- `tools/app-shell/src/windows/custom/fiscal-config/useFiscalConfig.js` — parallel fetcher hook for the 3 config records; filters inactive trace rows (`activeOrNull`) before `detectProfile` so a "Change SIF" leftover never masks the live config. `fetchAllRows` and `earliestCutoverDate` (previously private) are now **exported** so other fiscal windows reuse the same "all config rows, earliest-ever cutover" mechanism instead of duplicating it — first reused by `fiscal-monitor/useFiscalMonitor.js` for the TBAI monitor's earliest-cutover gate (ETP-5229, item #13; see `fiscal-monitor.md`).
- `cli/test/useFiscalConfig.test.js` — 16 tests covering source guards (named export, Promise.all, entity constants, detectProfile wiring), `fetchRecord` URL construction via `useApiFetch` (no manual Authorization header), response parsing (empty/missing data), and error handling.
- `tools/app-shell/src/windows/custom/fiscal-config/__tests__/SiiSection.test.js` — 17 component source-guard tests: forwardRef/`useImperativeHandle`, navarra badge, form fields, PUT endpoint contract, hideSave/hideCert.
- `tools/app-shell/src/windows/custom/fiscal-config/__tests__/TbaiSection.test.js` — 17 component source-guard tests: enroll date + invoice description validation, PUT endpoint, boolean serialization. Note: `TbaiSection` deliberately excludes `productionEnv`, `uSEAsproductDesc`, and `validatePreviousInvoice` from the PUT body — overriding those fields would silently revert any change the operator made in Etendo Classic (e.g. `productionEnv='N'` for testing). Only the fields owned by the Etendo GO form (enroll date and invoice description) are sent.
- `tools/app-shell/src/windows/custom/fiscal-config/__tests__/VerifactuSection.test.js` — 18 component source-guard tests: `isLocked` derived from `isReady` (no status badge — removed, lock behavior unaffected), disabled controls when locked, tax type select, absence of the removed `inVfactuSystem` field/enrollment date, PUT payload contract.
- `tools/app-shell/src/windows/custom/fiscal-config/__tests__/OnboardingWizard.test.js` — 36 component source-guard tests: all 7 territories, wizard steps, system resolution, record creation via POST, cert modal, navigation callbacks, cert auto-check on applied step, removed placeholder NextItems.
- `tools/app-shell/src/windows/custom/fiscal-config/certExpiryUtils.js` — pure `daysUntil` helper (no React deps); validates month (1–12) and day (1–31); round-trips the constructed `Date.UTC` value through `getUTCFullYear/Month/Date` to reject impossible dates (e.g. `2026-02-31` → March); builds `todayUtc` from `getUTCFullYear/Month/Date` so the boundary is UTC midnight in every timezone; imported by `useCertExpiry.js` and directly importable in Node.js tests.
- `tools/app-shell/src/windows/custom/fiscal-config/__tests__/certExpiryUtils.test.js` — 21 tests: exports guard (named function, `Date.UTC`, `getUTCFullYear` usage, round-trip check), null/falsy inputs, future dates (1/30/60 days, today=0), past dates, non-ISO inputs (bare string, slash-delimited), out-of-range components (month 0, month 13, day 0, day 32, impossible Feb 31, impossible Apr 31 → all `null`).
- `tools/app-shell/src/windows/custom/fiscal-config/__tests__/useCertExpiry.test.js` — 11 source-guard tests: re-exports `daysUntil`, exports `useCertExpiry`, `mockDaysLeft` bypass, `return { daysLeft }`, `/certificate` endpoint (no `?orgId` — backend infers org from token), `useApiFetch` usage (no manual `Authorization` header), null-reset before each fetch and in the else branch when cert is absent, `AbortController` usage (`new AbortController`, `controller.abort()` cleanup, `signal.aborted` check before `setDaysLeft`).
- `tools/app-shell/src/windows/custom/fiscal-config/__tests__/CertExpiryBanner.test.js` — 17 component source-guard tests: visibility thresholds (WARN_DAYS=60, CRITICAL_DAYS=30), dismiss behaviour, variant rendering, i18n keys, color scheme.
- `e2e/tests/flows/fiscal-config.mocked.spec.js` — 12 Playwright mocked E2E tests: no-org, wizard, SII/TBAI/Verifactu/conflict profiles, wizard flow (territory → confirm → back), cert modal opening; all assertions use `t()` i18n helper.
- `modules/com.etendoerp.go/.../NeoCertificateHelper.java` — certificate upload + GET endpoints; NIF extraction from X.509 DN; SAVEPOINT-protected org NIF lookup; confirmNif flow.
- `modules/com.etendoerp.go/.../NeoCertificateHelperTest.java` — 17 unit tests for NIF parsing and normalization.
- i18n: 250+ `fiscal.*` keys in `en_US.json` / `es_ES.json`; territory names, group hints, system descriptions, and all CertModal strings go through `useUI()`. E2E tests resolved via `e2e/tests/helpers/i18n.js` (locale-switchable).
