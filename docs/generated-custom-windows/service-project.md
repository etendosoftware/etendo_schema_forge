# Service Project

## Intent
Maintain a minimal Service Project master — a simplified view of the AD window "Service Project" (`C_Project`) reduced to identity fields only (Search Key, Name, Description, Active), with all planning/financial/process-button fields discarded for ETP-4892.

## What this window should allow
- Browse the service project list from the Finance menu.
- Search service projects by Search Key and Name.
- Create a service project with Search Key (required), Name (required), Description (optional), and Active (checkbox, defaults to `true`).
- Open an existing service project and update those same fields.
- Delete a service project through the standard generated entity flow.
- Deactivate a service project via the Active checkbox, shown as a Yes/No badge in the list.

## Interaction model
- Route: `/service-project` for the list and `/service-project/:recordId` for the detail form.
- Visibility: visible from the Finance menu as **Service Project** (window id `800001`).
- Implementation type: generated window route loaded from the app-shell window registry — no custom components.
- Window shape: single-entity window for `serviceProject` (table `C_Project`, tab id `800002`), no child/detail tabs (`projectLine`, `supplier`, `proposal`, `proposalLine`, `followup` are all excluded from the artifact).
- UI adjustments applied in `decisions.json`: `noHeaderBorder: true`, `hidePrint: true`, `hideLink: true`, and a `description` field rendered as a single-row (`rows: 1`) textarea spanning 2 columns.
- Label override: the AD `Isactive` label is overridden to "Activo" for both `es_ES` and `es_AR` locales.

## Reactive behavior and dependencies
- No cross-entity dependencies are exposed in the form — `Organization` and `Client` are system-derived from context (`fromConfig`) and never shown to the user.
- `Organization` carries the AD's own callout (`SL_Project_Type`) and validation rule from the raw schema, but since the field is `system`-only it is never triggered from the user-facing form.
- No callouts, validation rules, or display logic are exposed on the visible fields (`searchKey`, `name`, `description`, `active`).
- Active defaults to `true`; the raw extraction classified it as `system` (derivation `computed=Y`), but ETP-4892 explicitly overrides it to `editable` and visible with a Yes/No badge.

## Gap assessment
- The vast majority of the AD window's header columns (~65) are discarded as out of scope for ETP-4892, including: `summaryLevel`, `phase`/`projectPhase`/`standardPhase`, all planning dates (`startingDate`, `contractDate`, `endingDate`), all financial fields (`plannedAmount`, `plannedQuantity`, `plannedMargin`, `contractAmount`, `contractQuantity`, `serviceRevenue`, `plannedExpenses`, `serviceCost`, `reinvoicedExpenses`, `serviceMargin`, `expensesMargin`, `outsourcedCost`, `servicesProvidedCost`, `invoiceQuantity`, `invoiceAmount`, `projectBalance`, `plannedPoAmount`, `priceCeiling`), all BP/pricing context (`businessPartner`, `partnerAddress`, `userContact`, `orderReference`, `paymentMethod`, `paymentTerms`, `priceList`, `priceListVersion`, `createTemporaryPriceList`, `currency`, `warehouse`, `invoiceAddress`, `formOfPayment`, `accountNo`), and all classification fields (`initiativeType`, `workType`, `projectType`, `projectCategory`, `salesRepresentative`, `personInCharge`, `salesCampaign`).
- Process-button fields (`changeProjectStatus`, `copyFrom`, `generateOrder`, `generateTo`, `processNow`, `setProjectType`) are discarded — no process actions are exposed on this simplified window.
- Related child entities (`projectLine`, `supplier`, `proposal`, `proposalLine`, `followup`) are fully excluded — this is a header-only master, not the full Project workspace.
- If a future requirement needs the full Service Project workspace (planning, financials, related documents), this window's scope would need significant expansion.

## Manual verification
1. Open `/service-project` from the Finance menu and confirm the list loads through the generated window route.
2. Confirm the table shows Search Key, Name, and Active (as a Sí/No badge).
3. Search by Search Key and Name.
4. Create a service project and confirm Active defaults to checked (`true`).
5. Open an existing service project at `/service-project/:recordId` and confirm Search Key, Name, Description, and Active are all editable.
6. Confirm the detail form has no header border, and the Print and Link actions are hidden.
7. Uncheck Active on a service project, save, and confirm the badge updates to "No".

## Automated evidence
- `tools/app-shell/src/menu.json` exposes `service-project` in the Finance menu (windowId `800001`).
- `tools/app-shell/src/windows/registry.js` maps `service-project` to the generated window loader.
- `cli/config/regen-windows.json` registers `service-project` for the regen pipeline.
- `artifacts/service-project/schema-raw.json` shows the raw AD extraction: window id `800001`, tab id `800002`, table `C_Project`, primary entity `serviceProject`, plus the `projectLine`/`supplier`/`proposal`/`proposalLine`/`followup` child entities excluded via `decisions.json`.
- `artifacts/service-project/contract.json` defines one `serviceProject` entity with `searchKey`/`name`/`description`/`active` as the only `editable` fields (grid + form as applicable).
- `artifacts/service-project/decisions.json` classifies `searchKey`/`name`/`description`/`active` as `editable`, `organization`/`client`/`id`/audit fields as `system`, and discards all remaining header columns and process-button fields with an "Out of scope for ETP-4892 simplified window" rationale.

## Theme roles

The window uses only the generated `ListView`/`DetailView` shell — no custom components — so it inherits the shared semantic theme (background, card, foreground, muted, and border roles) with no local palette.
