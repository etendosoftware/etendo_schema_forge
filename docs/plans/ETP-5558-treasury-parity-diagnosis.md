# ETP-5558 — MCP treasury capability parity: diagnosis

Working diagnosis for ETP-5558. It is filled in as each capability is reproduced, first in the
UI and then through MCP, and it becomes the input of the implementation plan.

## Origin

Production MCP feedback of 2026-09-30 (`etgo_mcp_usage_id` `57127403D6CF40DF9F4052A5F97D332C`,
tenant *Agroquímicos SA*, `client_name` `agentic-game`, finance agent): since 2026-09-21 the agent
could not register the collection of a sales invoice nor reliably pay a purchase invoice. In
production it made 23 failing `neo_create` calls on `payment-in/finPayment` and **zero** calls to
`registerPayment`.

## Principle and constraint

- **Capability parity, not route parity.** MCP must let an agent do everything the UI does. The
  MCP route may differ from the UI's when that is better for an agent (fewer calls, discoverable,
  actionable errors), but business rules keep a single source (`PaymentRegistrationService` and
  related services).
- **REST and UI behaviour do not change.** Every change lives in the MCP layer. Any intentional
  route divergence is declared in `com.etendoerp.go/docs/neo-headless.md` §4.12.9.

- **The MCP surface equals the UI surface — both ways (product decision, 2026-09-30).** What the UI
  offers, MCP must allow. What the UI does not offer, MCP must **not** expose either, so that an
  agent is never drawn into an unvalidated route. BUG-1 is the proof of why: the hand-built
  payment-out route is not a UI route, nothing validates it, and it corrupted a processed
  collection.

## Decisions (2026-09-30)

| Topic | Decision |
|---|---|
| Row 4 — one payment across several invoices | Out of scope: a payment applies to exactly one invoice; an invoice may take several payments |
| Row 10 — advance payment without an invoice | Not in the UI → hidden from MCP |
| Row 13 — PIS | Excluded from MCP (PIS actions and `payment-out/bankPayments`); agents pay by manual transfer through `registerPayment` |
| BUG-4 — write-off limit | Enforced in `PaymentRegistrationService` (single source for SPA, REST and MCP). Accepted exception to the "no REST change": it only affects callers that bypass the SPA |
| Ticketing | Every payment fix lives in ETP-5558, BUG-1 included (done first inside the task) |

## Method

For every capability:

1. Reproduce it in the UI (Playwright against the local SPA) and record the backend calls.
2. Reproduce it through MCP the way an agent would: discover first (`neo_discover`,
   `neo_schema view:actions`), then act.
3. Record the result and every friction.

Environment: local Etendo + SPA (`localhost:3100`), fresh tenant *valentin mcp* (role
*valentin mcp Admin*). Base data created through MCP (it is not what is being measured):

| Record | Id |
|---|---|
| Financial account *Banco Paridad* (EUR, bank) | `E5CBEEA00A7C423582EEEDD2A3788EA0` |
| Business partner *Cliente Paridad* (customer + vendor) | `99A2AB25689346FF8A0B291248E75CB7` |
| Its address | `A67A4C8587AB461781C2BF21C64D20B1` |
| Product *Servicio Paridad* (service) | `4F6C20F68E3C4C6090CD678DE917470E` |
| Payment method *Transferencia bancaria* | `6975C748E18B4079812A5F2C0C782FDD` |

## Capability matrix

Legend: ✅ works · ⚠️ works with friction · ❌ not possible · ⏳ pending.

| # | Capability | UI | MCP | Notes |
|---|---|---|---|---|
| 1 | Collect a sales invoice in full, confirmed | ✅ | ⚠️ | UI: FV1000000, 121 € → payment 1000000. MCP: FV1000002, 60,50 € → payment 1000003 (row 3 flow) |
| 2 | Collect a sales invoice partially, confirmed | ✅ | ⚠️ | FV1000001, 100 of 242 € → payment 1000001 `RDNC` via hidden `registerPayment`; the UI shows it as *Parcial* |
| 3 | Save a collection as draft, confirm later | ✅ | ⚠️ | UI: re-sends `registerPayment` with `paymentId` + `process:"confirm"`. MCP: `registerPayment process:"draft"` then `confirmPayment {paymentId}` — both hidden |
| 4 | One payment across several invoices / schedules | ❌ | n/a | **Out of scope by product decision (2026-09-30): a payment applies to exactly one invoice; one invoice may receive several payments.** The UI matches it. `ApplyToInvoices.jsx` is dead code (see below) |
| 4b | Several payments on the same invoice | ✅ | ⚠️ | FV1000001: payment 1000001 (100 €, MCP) + payment 1000002 (142 €, UI) |
| 5 | Consume credit (credit notes, BP credit) | ✅ | ⚠️ | UI: FV1000004, 92 € + 29 € credit → payment 1000005. MCP: FV1000006, same → payment 1000007, invoice fully paid. Hidden |
| 6 | Overpayment left as credit | ✅ | ⚠️ | Payments 1000004 (UI) and 1000006 (MCP, default when `overpaymentAction` is absent) |
| 6b | Overpayment given back (*Dar vuelto*) | ✅ | ⚠️ | `overpaymentAction:"refund"`: UI 1000008 (150 €) + refund 1000009 (−29 €); MCP 1000010 + refund 1000011. Refund is not listed by `invoicePayments` (not linked to the invoice) |
| 7 | Foreign-currency payment | ✅ | ⚠️ | EUR invoice collected into a USD account. UI requires *Tasa de conversión* (blocks empty and 1) and sends `conversionRate:"1.1"` → payment 1000017. MCP: without the rate → `400 "A conversion rate is required when the invoice and account currencies differ"` (clear, backend-enforced); with it → payment 1000018. Hidden |
| 8 | Write off the difference | ✅ | ⚠️ ❗ | UI offers *Ajustar diferencia* when underpaying and blocks it above the account's `writeofflimit`; FV1000010, 118 of 121 € (limit 5 €) sends `writeoffDifference:true` → invoice fully paid. MCP: FV1000011, 100 of 121 € (21 € > limit) with `writeoffDifference:true` → **accepted**, payment 1000016, invoice fully paid (BUG-4) |
| 9 | Delete a draft payment | ✅ | ⚠️ | UI: invoice payments list → *Eliminar borrador* → `deletePayment {paymentId}` → 204 (draft 1000012). MCP: same action on draft 1000013 → answers `{}`; hidden |
| 9b | Reactivate a confirmed payment | ✅ | ✅ | UI: *Cobro* window → *Reactivar* → `etprReactivatePayment {"fieldValues":{}}` (payment 1000014). MCP: `neo_action(payment-in, finPayment, etprReactivatePayment)` on 1000003 → `RPAP`. Listed as invokable AD button |
| 10 | Advance payment without an invoice | ❌ | must be hidden | Not offered by the UI → by the surface rule MCP must not expose it (today `neo_create payment-in/finPayment` is advertised). **Unreachable in the UI today**: `NewPaymentModal` (invoice mode + *Crear anticipo* credit mode, `POST payment-in/finPayment`) is mounted through `onNew`, but `decisions.json → window.hideCreate: true` (since ETP-4332, 2026-07-02) hides the only trigger; the *Cobro* list has no create button and its ⋮ menu only offers favourites/help. Product decision pending: is it a wanted capability? |
| 11 | List an invoice's payments, valid accounts, methods and credit | ✅ | ⚠️ | `invoicePayments`, `invoiceAccounts`, `invoicePaymentMethods`, `invoiceCreditSources` all answer through `neo_action` with the same JSON as the SPA; all hidden. `invoiceAccounts` returns `defaultMethodId` = *Efectivo*, a method no account accepts (FR-5), and `defaultPaymentMethod:"Recibo"` while `defaultForMethodIds` names *Transferencia* |
| 12 | Pay a purchase invoice (payment-out) | ✅ | ⚠️ | Same modal and same `registerPayment` on `purchase-invoice/header`: UI FC1000000 → payment 1000000 `PWNC`; MCP FC1000001 → payment 1000001 `PWNC`. Hidden, like sales |
| 12b | Build a payment-out by hand (`neo_create` header + lines + process) | n/a | ❌ **data corruption** | Not a UI route. Header is created with `receipt: true`; `documentType` has no selector values; lines ignore `parentId` and attach to an **unrelated processed collection** (see BUG-1, BUG-2) |
| 13 | PIS (bank-initiated) payments | not testable locally | decision | payment-out only; the UI offers it when the account is PSD2-connected (`bankConnected`), the method is a transfer and the account currency is eligible (`pisEligible` in `NewPaymentEntryModal.jsx`). It ends in a bank authorization window where a **person** must approve (SCA) — an agent cannot complete it. Actions: `pisSupplierAccounts`, `pisTemplates`, `pisPaymentStatus`, `cancelPisPayment`, `retryPisPayment`. Product decision: exclude from MCP, or let the agent prepare it and hand the authorization link to the user |

## Evidence

### Row 1 — UI, full collection confirmed

Invoice panel → *Pendiente · Ver* → *Añadir cobro* → *Nuevo cobro* modal (amount, date, method,
account) → *Confirmar*.

On opening the modal the SPA calls, on `sales-invoice/header/{invoiceId}/action/…`:
`invoicePayments`, `invoiceAccounts`, `invoicePaymentMethods`, `invoiceCreditSources` (all 200).

*Confirmar* sends:

```
POST /sws/neo/sales-invoice/header/B333063FF835471398208C263C786695/action/registerPayment  → 201
{"scheduleId":"5A3B01E1C7404448AF2AABD92DF1CF1A","actual_payment":"121","payment_date":"2026-09-30",
 "fin_financial_account_id":"E5CBEEA00A7C423582EEEDD2A3788EA0",
 "fin_paymentmethod_id":"6975C748E18B4079812A5F2C0C782FDD","process":"confirm","creditSources":[]}
→ {"response":{"data":{"id":"5590679514484CD393DCBDA99681970D","documentNo":"1000000","amount":121,
   "status":"RDNC","processed":true}}}
```

Observed: the invoice's default method (*Efectivo*) is not linked to *Banco Paridad*, so the
account list is empty until the method is changed. `invoiceAccounts` returns each account with
its `paymentMethodIds`, and the modal filters with it.

### Row 2 — MCP, partial collection confirmed

1. `neo_schema(sales-invoice, header, view:"actions")` → 22 actions, `invokableCount: 2`
   (`documentAction`, `posted`). **`registerPayment` is not listed**; `aPRMAddpayment` shows as
   `discarded` with no pointer to an alternative.
2. `neo_action(registerPayment)` without `scheduleId` → `400 validation_error`,
   `"Missing required fields: scheduleId, actual_payment, payment_date, fin_financial_account_id"`
   although all but `scheduleId` were sent.
3. `neo_list(sales-invoice, paymentPlan, parentId)` → schedule `1BB6FE5E86C3435BA0496D22A856AE22`.
4. `neo_action(registerPayment)` with the same body shape as the UI plus `scheduleId` → success,
   payment 1000001 for 100 €, `RDNC`, processed.

### Row 3 — draft, then confirm

**UI** (FV1000001, remaining 142 €): *Añadir cobro* → *Guardar* sends `registerPayment` with
`process:"draft"` → `201`, payment 1000002 `RPAP`, `processed:false`; the payment list shows it as
*Borrador* with a delete icon. Clicking the row opens *Editar cobro*; *Confirmar* sends
**`registerPayment` again**, now with `paymentId` and `process:"confirm"`:

```
{"scheduleId":"1BB6FE5E86C3435BA0496D22A856AE22","actual_payment":"142","payment_date":"2026-09-30",
 "fin_financial_account_id":"E5CBEEA00A7C423582EEEDD2A3788EA0",
 "fin_paymentmethod_id":"6975C748E18B4079812A5F2C0C782FDD","process":"confirm","creditSources":[],
 "paymentId":"25C0C997EB2D4155BBBC8C493496E4A6"}
→ {"id":"25C0C997EB2D4155BBBC8C493496E4A6","documentNo":"1000002","amount":142,"status":"RDNC","processed":true}
```

The UI never calls `confirmPayment`: editing a draft and confirming it is one call.

**MCP** (FV1000002, 60,50 €): `registerPayment` with `process:"draft"` → payment 1000003 `RPAP`;
`confirmPayment {paymentId}` → `RDNC`, processed. Both work; neither is listed by
`view:actions`.

### Row 4 — several invoices in one payment

The invoice modal always works on one invoice (one `scheduleId`). The *payment-in* window has a
component meant for it, `artifacts/payment-in/custom/ApplyToInvoices.jsx` (pick pending invoices
of the partner, `applyToInvoices`, then `aPRMProcessPayment`), but it is **not wired** in
`decisions.json`, nothing imports it, and the backend actions it calls (`pendingInvoices`,
`applyToInvoices`) do not exist in `com.etendoerp.go`. It is dead code. Since the UI does not
offer the capability, MCP does not owe it; flag the dead component separately.

### Rows 5 and 6 — overpayment as credit, then consuming the credit

**UI.** FV1000003 (121 €), amount set to 150 €: the modal shows *Sobran 29,00 € — ¿qué hacer con el
resto?* with *Dejar a crédito* / *Dar vuelto*. Leave-credit sends
`registerPayment {…, "actual_payment":"150", "overpaymentAction":"leave-credit"}` → payment 1000004
`RDNC`. Then on FV1000004 (121 €) the modal lists *Saldo a favor y crédito disponible* from
`invoiceCreditSources`:

```
{"items":[{"id":"684CFA76C2FD47BAB284BD3B6563AC56","kind":"credit","paymentId":"684CFA76C2FD47BAB284BD3B6563AC56",
 "doc":"1000004","date":"2026-09-30","note":"Factura Nº : FV1000003\nCantidad a crédito: 29.00\n","avail":29}],"totalCount":1}
```

Ticking it drops the cash amount to 92 € and sends
`registerPayment {…, "actual_payment":"92", "creditSources":[{"kind":"credit","paymentId":"684CFA76…","use":29}]}` →
payment 1000005 `RDNC`.

**MCP.** FV1000005: `registerPayment` with 150 € and **no** `overpaymentAction` → payment 1000006
`RDNC`; the 29 € surplus is left as credit by default (visible through `invoiceCreditSources` on
another invoice of the partner). FV1000006: `registerPayment` with 92 € and the same
`creditSources` shape → payment 1000007, invoice `paymentComplete: true`, outstanding 0.

*Dar vuelto* is live: `PaymentRegistrationService` handles `overpaymentAction:"refund"` through
`FIN_AddPayment.createRefundPayment`, and `NewPaymentEntryModal.jsx` sends it. The
`docs/generated-custom-windows/sales-invoice.md` note saying `'refund'` was retired in ETP-4504 is
stale.

### Row 12 — purchase invoices (payment-out)

**Through the invoice (parity route).** The purchase invoice shows the same *Pagos de la factura* →
*Añadir pago* → *Nuevo pago* modal. It calls the same helpers and `registerPayment` on
`purchase-invoice/header` with the sales body shape → payment 1000000, `PWNC`. Through MCP the
same hidden action on FC1000001 → payment 1000001, `PWNC`. `neo_schema view:actions` on
`purchase-invoice/header` lists 22 actions, 2 invokable; `aPRMAddpayment` is `discarded` and its
description even says *"Botón para añadir un cobro"* on a purchase invoice.

**By hand (the route the production agent took).** Two vendors, one draft each, then a line:

1. `neo_schema(payment-out, header, view:"create")` → every field optional, `documentType`
   included; `neo_selectors(documentType)` → `items: []`; `neo_defaults` → note
   *"documentType: its default needs @Isreceipt@ from the parent record, but no parentId was
   given"*. A document type by name (`"Pago"`) is refused. Only a raw id read from the database
   (`AP Payment`, `9E6E19129903497F9DE58C768A1EF967`) gets through. `neo_defaults` also proposes
   *Efectivo* with *Banco Paridad*, a pair the account does not accept.
2. H1 (*Proveedor B*) → payment-out 1000002 and H2 (*Cliente Paridad*) → payment-out 1000003:
   **both created with `receipt: true`** (a collection flag on a payment-out), `amount: 0`.
3. `neo_create(payment-out, lines, parentId: H2, {invoicePaymentSchedule: <FC1000002 schedule>, amount: 121})`
   → `status: ok`, but the row's `paymentDetails` is `1281448140DD4D9EBEC2852943C045D2`, the
   payment detail of **payment-in 1000007** — the processed (`RDNC`, `isreceipt=Y`) customer
   collection of FV1000006 made earlier. H2 has no lines. Database check:

```
 documentno | isreceipt | status | amount | fin_payment_detail_id            | psd_amount | sched
 1000007    | Y         | RDNC   |     92 | 1281448140DD4D9EBEC2852943C045D2 |     121.00 | 1978346B… (FV1000006, original)
 1000007    | Y         | RDNC   |     92 | 1281448140DD4D9EBEC2852943C045D2 |        121 | 438A128A… (FC1000002, injected)
```

Tomcat log for the same call:

```
WARN McpParentScope - Parent scope unresolvable — cannot determine the parent of tab 'Lines': none of its
     parent-link fields [paymentDetails, invoicePaymentSchedule] points at the parent tab table 'FIN_Payment'.
     Set MCP_CONFIG parent.field to the correct one
WARN McpToolRouter - No parent field resolved for tab 'Lines' — parentId not applied (…)
INFO … event=backend_mcp_tool_call_completed properties={tool=neo_create, entity=payment-out/lines, status=ok, …}
```

## Bugs found

| Id | Severity | Bug | Evidence |
|---|---|---|---|
| BUG-1 | **Critical — data corruption** | `neo_create(payment-out, lines)` cannot map `parentId` (the lines tab `FIN_Payment_ScheduleDetail` hangs from `FIN_Payment_Detail`, not `FIN_Payment`), logs a WARN, **and writes anyway**: `paymentDetails` ends up pointing at an unrelated payment detail — here a processed customer collection. `resolveParentFK` documents that "the caller's gate is what refuses such an entity"; the gate did not refuse. The same entity shape exists on `payment-in/finPaymentScheduleDetail` | Row 12 above; matches the production report of 2026-09-23 |
| BUG-2 | High | `neo_create(payment-out, header)` stores `receipt: true` | Payments 1000002 and 1000003 |
| BUG-3 | High | `documentType` of `payment-out/header` (and `payment-in/finPayment`) cannot be resolved: selector empty, default needs `@Isreceipt@` from a parent a header does not have, name lookup refused | Row 12 step 1; matches the production report |
| BUG-4 | High — business rule bypass | The account's write-off limit (`FIN_Financial_Account.Writeofflimit`) is enforced **only in the SPA** (`writeoffMath.js → writeoffState`). `PaymentRegistrationService` only publishes it (`invoiceAccounts → writeoffLimit`) and applies `writeoffDifference` unconditionally, so any caller that is not the SPA — MCP or a direct REST call — can write off any amount. Fixing it in the service changes REST for non-SPA callers only (the SPA already never sends an over-limit write-off); needs an explicit decision against the "no REST change" constraint | Row 8: 21 € written off against a 5 € limit, payment 1000016 |

## Surface to hide from MCP (UI does not offer it)

Both payment windows declare `window.hideCreate: true`, and the UI creates and edits payments only
through the invoice actions (`registerPayment`, `confirmPayment`, `deletePayment`) and the payment
buttons (`etprReactivatePayment`). Yet every payment entity has every verb enabled in
`ETGO_SF_ENTITY`, so MCP advertises and executes them:

| Spec / entity | Table | `ISPOST/ISPUT/ISPATCH/ISDELETE` | UI route | MCP should |
|---|---|---|---|---|
| `payment-in/finPayment` | `FIN_Payment` | Y/Y/Y/Y | none for create (`hideCreate`) | hide create |
| `payment-in/finPaymentScheduleDetail` | `FIN_Payment_ScheduleDetail` | Y/Y/Y/Y | none | hide writes |
| `payment-out/header` | `FIN_Payment` | Y/Y/Y/Y | none for create (`hideCreate`) | hide create |
| `payment-out/lines` | `FIN_Payment_ScheduleDetail` | Y/Y/Y/Y | none | hide writes |
| `payment-out/bankPayments` | `PSD2_pis_payment` | Y/Y/Y/Y | PIS flow (row 13) | decide with row 13 |

Update/delete of the header — **checked against the UI (2026-09-30)**: a draft collection
(payment-in 1000014) and a draft payment (payment-out 1000004, created from FC1000002) both show
only *Eliminar* and *Confirmar*; *Guardar* is disabled and no header field is editable
(`hideFormCard`). A draft is edited from the invoice (`registerPayment` with `paymentId`).
Decision: **hide update** on both headers, **keep delete** (the UI offers it on a draft; a
processed payment hides it).

**Mechanism.** The method flags cannot be used: REST and the SPA read them too, so turning them off
would change UI behaviour, which this task must not do. `MCP_CONFIG` (§4.12.6 of
`neo-headless.md`) is the MCP-only channel, but its registered sections are `fields` and `parent` —
none gates a verb. Needed: a new MCP-only section (e.g. `verbs`, entity level, with a mandatory
`reason`, same REPLACE/validation rules as the others) honoured by the tool catalog
(`creatableWindowSpecs`/`updatableWindowSpecs`/`deletableWindowSpecs` in `ToolRegistry`), by
`neo_schema view:"create"` and by the write verbs, plus `neo_batch`'s runtime gate
(`BatchService#createRecord`). Hiding the hand-built payment-out route also removes the entry point
of BUG-1, BUG-2 and BUG-3 for agents. BUG-1 must still be fixed on its own: a write whose
`parentId` cannot be mapped must be refused (it lives in the MCP layer, `McpParentScope` /
`resolveParentFK`, and the same gap can hit any other entity whose parent link goes through an
intermediate table). Whether BUG-2/BUG-3 also affect REST is not verified yet.

UI-only observation (not MCP): with the limit set to 5 €, the blocked write-off hint reads *"La
diferencia supera el límite de ajuste configurado para esta cuenta (0,00 €)"* — the limit shown is
wrong even though the block itself is right.

## Frictions found

| Id | Where | Friction | Impact on an agent |
|---|---|---|---|
| FR-1 | `neo_schema view:actions`, `neo_discover` | Handler actions of the invoice header (`registerPayment`, `invoiceAccounts`, `invoicePaymentMethods`, `invoicePayments`, `invoiceCreditSources`, `confirmPayment`, `deletePayment`, …) are not listed | The capability exists but cannot be found; the production agent never tried it |
| FR-2 | `registerPayment` | `scheduleId` is mandatory; the UI resolves the first pending schedule client-side | Extra lookup the agent must know about (`paymentPlan`) |
| FR-3 | `registerPayment` error | The "missing fields" message is a fixed list, not the fields actually missing | Misleads the agent about what to send |
| FR-4 | `aPRMAddpayment` (discarded) | No hint towards the equivalent route | Dead end for an agent that knows Etendo Classic |
| FR-5 | Method ↔ account | The invoice's default method may not be enabled on the account; only `invoiceAccounts` tells, and it is hidden | Refusal or wrong pairing without a way to discover valid pairs |
| FR-6 | `financial-account/account` create (setup) | `country` advertised as `serverDefaulted` in `view:create` but the create answers `Country is required` | Minor; not treasury-specific |
| FR-7 | Country by name (setup) | `country: "España"` accepted by `financial-account`, refused by `contacts/locationAddress` (`Invalid country`) | Minor; inconsistent FK-by-name resolution |
| FR-9 | `registerPayment` overpayment | An amount above the outstanding is silently left as credit when `overpaymentAction` is absent; the UI always asks | An agent may create customer credit it never meant to (typo in the amount) with no warning in the response |
| FR-10 | `creditSources` | The item shape (`kind`, `paymentId`, `use`) is only learnable by reading the SPA; `invoiceCreditSources` returns `avail`, not `use` | Consuming credit requires knowledge no MCP surface publishes |
| FR-11 | Response shape | `registerPayment` answers `{id, documentNo, amount, status, processed}` — nothing about credit generated or consumed, nor the invoice's new outstanding | The agent needs extra reads to confirm the outcome |
| FR-12 | `deletePayment` response | Answers `{}` (HTTP 204 on REST) — no confirmation of what was deleted | The agent has to re-read `invoicePayments` to know it worked |
| FR-8 | Docs | `etendo-go-docs` `agentic/finance/treasury.md` documents `neo_create` on `payment-in/finPayment`, which cannot run (fields read-only, `documentType` unresolved) | Agents follow a documented route that fails |

## Open observations (to verify)

- ~~`neo_list(payment-in, finPayment)` answered `totalRows: 5` while the *Cobro* list in the UI
  shows 13.~~ **Resolved — not a bug.** Timing: the MCP call ran ~19:32 (5 payments existed), the
  UI was read ~20:00 (13 existed); payments kept being created during the session. Re-run now:
  `totalRows: 19`, same as the DB. Both channels apply the tab filter (`whereclause
  FIN_Payment.isReceipt='Y'`, `hqlwhereclause e.receipt='Y'`); `payment-out/header` mirrors it
  (`isReceipt='N'`, 2 = DB).
- Duplicate `documentNo` among collections: 1000002 and 1000003 appear twice each (e.g. 1000002
  as RDNC at 19:27 and as RPAP at 20:11). Sequence fault or draft number reuse — to verify.
- Sales invoice lines grid shows *Precio 0,00* for lines created with `unitPrice: 100`
  (`listPrice: 0`, `grossUnitPrice: 0`). Not treasury; check which column the grid reads.

## Production-reported items still to reproduce

- ~~`documentType` unresolved, selector 0 items~~ → reproduced as BUG-3.
- ~~`payment-out/lines` ignored `parentId`~~ → reproduced as BUG-1 (worse: it can land on a
  collection, not only on another vendor's payment).
- `payment-in/finPayment` `view:create` exposes only `description` while `payment-out/header`
  exposes every field — the two directions of the same table are curated inconsistently.
- `aPRMAddScheduledpayments` NullPointerException; `aPRMProcessPayment` "without line".
- `financial-account/transaction` advertised writable but `view:create` has no field;
  `aprmAddtransactionpd` discarded.

## Implementation plan

All work in ETP-5558 (`feature/ETP-5558` in `schema_forge` and `com.etendoerp.go`). Steps are
ordered; each one ships with its tests and its doc update. REST/SPA behaviour does not change,
except the accepted BUG-4 exception.

### Step 1 — BUG-1: refuse a child write whose `parentId` cannot be mapped (MCP layer)

- `McpToolRouter` create path (and `neo_update` / `neo_batch` where `parentId` applies): when
  `McpParentScope` cannot resolve the parent field, answer `422` (`parent_unresolvable`, naming the
  entity and the reason) instead of logging a WARN and writing. This is what `resolveParentFK`'s
  own Javadoc promises ("the caller's gate is what refuses such an entity").
- Sweep: list every included entity whose parent scope is unresolvable (same check, run over
  `ETGO_SF_ENTITY`), record them in this doc; each either gets an `MCP_CONFIG.parent` or stays
  refused.
- Tests: the payment-out lines case (parentId of a `FIN_Payment` on `FIN_Payment_ScheduleDetail`)
  must now fail with no row written; a resolvable child (e.g. sales-invoice lines) keeps working.

### Step 2 — MCP-only verb gate (`MCP_CONFIG.verbs`) and the payment surface

- New `MCP_CONFIG` section `verbs` (entity level, `REPLACE`, mandatory `reason`, validated like
  `fields`/`parent`): `{ "create": false, "update": false, "delete": false, "reason": "…" }`.
- Honoured by `ToolRegistry` (creatable/updatable/deletable enums), `neo_schema view:"create"`,
  the write verbs and `BatchService#createRecord`. REST and the SPA never read it.
- Apply it (via the module's dataset, then `export.database`):
  - `payment-in/finPayment`: create hidden (row 10; UI has `hideCreate`).
  - `payment-in/finPaymentScheduleDetail`, `payment-out/lines`: every write hidden.
  - `payment-out/header`: create hidden.
  - `payment-out/bankPayments`: every write hidden (PIS excluded).
  - Payment headers: update hidden, delete kept (UI check above).
- Doc: `neo-headless.md` §4.12.6 (new section) and §4.12.9 (declared divergence: the MCP hides
  verbs REST still serves).

### Step 3 — Discoverable payment actions on the invoice headers (FR-1, FR-10)

- Extend ETP-5468 handler-declared actions (`NeoHandler#actionContracts()`, `NeoActionContract`)
  to **window** entities: `neo_schema view:"actions"` **merges** declared contracts with the AD
  buttons (today a declaration replaces the whole schema — fine for report specs, wrong for
  `sales-invoice/header`); `view:"full"`/`"create"` unchanged; `neo_discover` lists the names;
  resolution also through `@NeoExtension`, and through the composite header handlers that delegate
  to `RegisterPaymentHandler` / `RegisterPaymentOutHandler`.
- Declare, in `PaymentActionHandlerSupport` (shared by in/out, it is the payments customization):
  `registerPayment` (all parameters seen in the matrix: `scheduleId`, `actual_payment`,
  `payment_date`, `fin_financial_account_id`, `fin_paymentmethod_id`, `process` enum
  `draft|confirm`, `paymentId`, `creditSources[{kind,paymentId,use}]`, `overpaymentAction` enum
  `leave-credit|refund`, `conversionRate`, `writeoffDifference`), `confirmPayment`,
  `deletePayment`, `invoicePayments`, `invoiceAccounts`, `invoicePaymentMethods`,
  `invoiceCreditSources`. PIS actions are **not** declared (excluded).
- `NeoActionContract.validate` runs before the handler, so FR-3 (misleading "missing fields")
  disappears on the MCP path.
- Redirect hint (FR-4): the discarded `aPRMAddpayment` entry points to `registerPayment`.

### Step 4 — Agent ergonomics on `registerPayment` (MCP layer only)

- `scheduleId` optional through MCP: when absent, resolve the first schedule with outstanding
  amount (what the SPA does client-side, FR-2).
- Overpayment without `overpaymentAction` (FR-9): refuse with the two allowed values instead of
  silently leaving credit.
- Method ↔ account (FR-5): refuse a pair the account does not accept with the valid methods.
- Richer answer (FR-11, FR-12): add the invoice's new outstanding amount and credit
  generated/used; `deletePayment` answers what was deleted.

### Step 5 — BUG-2, BUG-3, BUG-4

- BUG-4: enforce `Writeofflimit` in `PaymentRegistrationService` (same rule as `writeoffMath.js`:
  null/0 = no limit). Also fix the SPA hint that shows the limit as *0,00 €*.
- BUG-2 / BUG-3: with Step 2 the hand-built headers are no longer reachable from MCP; verify
  whether REST is affected (`receipt:true` on payment-out create, empty `documentType` selector)
  and fix in the payment customizations if it is, otherwise record it as REST-only follow-up.
- Duplicate payment `documentNo` (open observation): find whether it is a sequence fault or a
  draft number reuse; fix it if it is a defect, in the payment customizations.

### Step 6 — Docs and validation

- `etendo-go-docs` `agentic/finance/treasury.md`: rewrite around the invoice actions (FR-8).
- `docs/generated-custom-windows/sales-invoice.md` / `purchase-invoice.md`: action catalog now
  published to MCP; fix the stale "refund retired" note.
- One MCP test per matrix row (1–3, 4b, 5–9, 11, 12) plus the refusals (BUG-1, hidden verbs,
  write-off over limit, missing rate).
- Re-run the Agroquímicos finance agent (agentic-game) and measure with `make mcp-metrics`: zero
  `neo_create payment-in/finPayment`, `neo_action registerPayment` present with `ok`.

### Follow-ups outside ETP-5558

- `ApplyToInvoices.jsx` dead code (row 4).
- The invoice-lines grid showing *Precio 0,00* — open observation above.
