# Handoff — Document sequences at org `*` are not writable by Organization-level roles

**Date:** 2026-09-08
**Status:** investigation COMPLETE, empirically confirmed on `go.experimental.etendo.cloud`. No code changed yet.
**Purpose of this document:** self-contained brief for a fresh session to open the Jira task. Everything
needed is here — do not re-run the investigation.
**Reported by:** Agustin (functional), reproduced live on experimental with a freshly onboarded tenant.
**Severity:** STOPPER. Any invited user with a fixed GO role (Finance, Sales, …) cannot reconcile or
register a payment at all. Only the tenant owner can.

---

## 1. Symptom

A freshly onboarded tenant (`Empresa Fake`). The tenant OWNER can create bank statements, movements,
reconcile and register payments — everything works. An INVITED user given the **Finance** role can create
statements and movements, but **every payment and every reconciliation fails with HTTP 400**.

Three live reproductions, all on the same tenant/role:

**1) Reconcile a statement line against existing transactions**
```
POST https://go.experimental.etendo.cloud/etendo/sws/neo/bank-reconciliation?action=reconcileGroup
400 Bad Request
{"error":{"message":"Organization 0 of object (ADSequence(D6A6995B1B5E48BDBE76DA3FC95E262D) (name: Reconciliation)) is not present in OrganizationList [8CF2FCD6E86746918C5449635CBB030F]","status":400}}
```

**2) Reconcile a statement line against a sales invoice**
```
POST .../sws/neo/bank-reconciliation?action=reconcileGroup
400 Bad Request
{"error":{"message":"Organization 0 of object (ADSequence(FB367EB158F0457D92C6E0BFA88E3180) (name: AR Receipt)) is not present in OrganizationList [8CF2FCD6E86746918C5449635CBB030F]","status":400}}
```

**3) Add a payment from the sales invoice panel**
```
POST .../sws/neo/sales-invoice/header/3D07166E0CE9492CA8F8321C3355DD98/action/registerPayment
400 Bad Request
{"error":{"message":"Organization 0 of object (ADSequence(FB367EB158F0457D92C6E0BFA88E3180) (name: AR Receipt)) is not present in OrganizationList [8CF2FCD6E86746918C5449635CBB030F]","status":400}}
```

Note reproductions 2 and 3 name the **same** `AD_Sequence` record (`FB367EB158F0457D92C6E0BFA88E3180`)
— they share the same code line.

Relevant ids: org `8CF2FCD6E86746918C5449635CBB030F` = `Empresa Fake`.

### Known workaround (do NOT ship this)
Moving the `Reconciliation` sequence from org `*` down to `Empresa Fake` makes reconciliation work.
Rejected by the reporter and by this analysis: a document sequence at `*` is valid, standard configuration
(all 143 sequences in the onboarding dataset are at `*`), it does not scale to multi-org, and it would have
to be repeated for `AR Receipt` / `AP Payment` and every future sequence.

---

## 2. Root cause

Two facts combine. Neither is a bug on its own.

### Fact A — core strips org `*` from the writable-org list of any Organization-level role

`src/org/openbravo/dal/core/OBContext.java:607-625` (`setWritableOrganizations`):

```java
if (userLevel contains "S" || "C")  writableOrganizations.add("0");
… add every org from AD_Role_OrgAccess …
if (userLevel.equals("O"))          writableOrganizations.remove("0");   // line 622
writableOrganizations.addAll(additionalWritableOrganizations);           // line 624
```

Every fixed GO role — and every per-user personal composition role — is created with
`AD_Role.UserLevel = "  O"` (trimmed to `"O"`):

| Where | Line |
|---|---|
| `modules/com.etendoerp.go/src/com/etendoerp/go/roles/SystemRoleTemplates.java` | 56 (`FIXED_ROLE_USER_LEVEL = "  O"`) |
| `modules/com.etendoerp.go/src/com/etendoerp/go/roles/UserRoleCompositionService.java` | 885 (`role.setUserLevel(...)`) |
| `modules/com.etendoerp.go/src-util/modulescript/.../EnsureSystemRoleTemplatesScript.java` | 171 (`USER_LEVEL = "  O"`) |

The role DOES have org access to both the user org and `*`
(`PersonalRoleAccessProvisioningService#createOrgAccess` grants both) — the UI shows `*` correctly.
Core removes it silently when computing the session. That is why the error's org list is
`[8CF2FCD6E86746918C5449635CBB030F]`: exactly one org, `*` gone.

By contrast the tenant owner role ships with `UserLevel = " CO"`
(`modules/com.etendoerp.go/referencedata/sampledata/GOClient/AD_ROLE.xml:14`), so it keeps `0`
and can write records at `*`. **That is the whole difference between owner and invited user.**

### Fact B — the APRM document-number path writes the sequence through DAL, and the write is security-checked

There are TWO ways to get a document number in Etendo, and only one is checked:

| Path | Mechanism | Security |
|---|---|---|
| `Utility.getDocumentNo` → `DocumentNoData` → PL function `AD_SEQUENCE_DOC` (`src-db/database/model/functions/AD_SEQUENCE_DOC.xml`) | plain `UPDATE AD_Sequence` | **none** — no org check |
| `FIN_Utility.getDocumentNo` (APRM) → `Fin_UtilityLegacy.incrementSeqIfUpdateNext` (`modules_core/com.etendoerp.legacy.advpaymentmngt/.../Fin_UtilityLegacy.java:58`) | `seq.setNextAssignedNumber(...)` + `OBDal.save(seq)` | **checked at flush** |

On flush, `OBInterceptor.onFlushDirty` (`src/org/openbravo/dal/core/OBInterceptor.java:165`) →
`doEvent` → `SecurityChecker.checkWriteAccess` (`.../OBInterceptor.java:331`) →
`src/org/openbravo/dal/security/SecurityChecker.java:190` throws, because the record being written is
the sequence itself and its org is `0`.

This is exactly why bank statements and movements work: they number through the SQL path
(`NeoSequencePreviewHelper.java:80`), which never checks.

### Why admin mode does not save it

`OBContext.setAdminMode(boolean doOrgClientAccessCheck)` (`OBContext.java:213`). The argument means
*keep checking client/org access*:

- `setAdminMode(true)`  → org/client check **stays ON**
- `setAdminMode(false)` / `setAdminMode()` → org/client check OFF

`ReconciliationHandlerSupport.java:239` wraps every mutating reconciliation action in
`setAdminMode(true)`, and core's `APRM_MatchingUtility.addNewDraftReconciliation`
(`modules_core/org.openbravo.advpaymentmngt/.../APRM_MatchingUtility.java:665`) does the same. The check
(`SecurityChecker.java:158`) is `(!isInAdministratorMode() || doOrgClientAccessCheck())` → `(false || true)`
→ it runs.

**CRITICAL for whoever implements the fix:** wrapping the call in `setAdminMode(false)` from the OUTSIDE
does NOT work. `doOrgClientAccessCheck()` (`OBContext.java:1208`) reads `peek()` — the INNERMOST admin
frame — and core pushes its own `setAdminMode(true)` frame inside. The bypass must not be frame-based.

### Fact C — the onboarding dataset puts every sequence at `*`

`modules/com.etendoerp.go/referencedata/sampledata/GOClient/AD_SEQUENCE.xml`: **143 sequences, all with
`AD_ORG_ID = 0`.** The `REC` document type points at the `Reconciliation` one
(`C_DOCTYPE.xml:1532`, `DOCNOSEQUENCE_ID = 271AFD49E6FF463B9681F395C3B6E1C2`). `AR Receipt` / `AP Payment`
are the same shape. This is legitimate and matches standard Openbravo reference data (the `QA_Testing`
sample client also ships `Reconciliation` at `AD_ORG_ID=0`).

`AD_Sequence` has `AccessLevel = 7` (All) — `AD_TABLE_ID = 115` in `src-db/database/sourcedata/AD_TABLE.xml`
— so nothing else blocks the write. The writable-org list is the ONLY blocker, which is why granting `0`
is sufficient.

---

## 3. Affected call sites — 5, all in com.etendoerp.go

Every one funnels into the APRM DAL path. Paths relative to `modules/com.etendoerp.go/`.

| # | File:line | Flow | Sequence | Evidence |
|---|---|---|---|---|
| 1 | `src/com/etendoerp/go/schemaforge/ReconciliationHandler.java:1587` | reconcile (always creates a fresh draft via `ReconciliationFlowSupport.java:262`) | `Reconciliation` | reproduced live |
| 2 | `src/com/etendoerp/go/schemaforge/PaymentRegistrationService.java:856` | reconcile-with-invoice AND add-payment-from-invoice (`registerPayment`) | `AR Receipt` / `AP Payment` | reproduced live, twice |
| 3 | `src/com/etendoerp/go/schemaforge/AddPaymentService.java:131` | New Movement wizard, "Registrar pago" (`action=create-payment`) | `AR Receipt` / `AP Payment` | same path, not separately reproduced |
| 4 | `src/com/etendoerp/go/schemaforge/CashCloseHandler.java:230` | cash close | `Reconciliation` | same path, not separately reproduced |
| 5 | `src/com/etendoerp/go/schemaforge/AddPaymentService.java:179` | payment with overpayment → refund (`FIN_AddPayment.createRefundPayment`) | `AP Payment` | same path, not separately reproduced |

Call chain for site 2 (the most-hit one), for orientation:

```
reconcileGroup                       ReconciliationHandlerSupport.java:239  (setAdminMode(true))
 └─ payInvoices                      ReconciliationWriteoffSupport.java:56
     └─ createInvoicePayments        ReconciliationFlowSupport.java:92
         └─ settleInvoice            ReconciliationFlowSupport.java:194
             └─ registerReconciliationPayment   ReconciliationPaymentService.java:123
                 └─ createDraftPayment          PaymentRegistrationService.java:855
                     ├─ FIN_Utility.getDocumentNo(docType, "FIN_Payment")   line 856
                     └─ OBDal.flush()                                       line 868  ← throws

registerPayment (invoice panel)      NewPaymentEntryModal.jsx:1624
 └─ PaymentActionHandlerSupport.java:17  (ACTION_NAME = "registerPayment")
     └─ PaymentRegistrationService.doRegisterPayment:130 / doRegisterPaymentAdvanced:553
         └─ registerPaymentCore:183 / :680
             └─ createDraftPayment:855            ← same line 856
```

**Two sequences are hit in the reconcile-with-invoice flow, in this order: `AR Receipt` then
`Reconciliation`. Sites 1 and 2 MUST be fixed together** — fixing only one just changes which error
the user sees. This was observed live.

### Confirmed NOT affected
- **Completing an invoice.** GO only ever sends `docaction = "CO"`
  (`AbstractInvoiceHeaderHandler.java:868`, the module's only call site), and core numbers a payment only
  on `"RC"` = void (`ProcessInvoiceUtil.java:50`, `:140`, `:297`). Structurally unreachable, verified live
  (invoice `10000018` completed fine, no payment created).
- Bank statements, financial-account movements, and all NEO CRUD — SQL sequence path, never checked.

---

## 4. Recommended fix

**Do not touch `etendo_core`.** Explicit constraint from the reporter: a core change affects all of Etendo,
not just GO. Keep it inside `com.etendoerp.go`.

Use core's own idiom for exactly this problem — `InitialOrgSetup` faces the identical situation (writing to
an org the role does not own) and solves it by injecting the org into the session's writable list:

```java
// src/org/openbravo/erpCommon/businessUtility/InitialOrgSetup.java:352 (called from :185)
OBContext.getOBContext().getWritableOrganizations();
OBContext.getOBContext().addWritableOrganization(strOrgId);
OBContext.getOBContext().getWritableOrganizations();

// cleanup — src/org/openbravo/erpCommon/ad_forms/InitialOrgSetup.java:79-80 — BOTH calls are required
OBContext.getOBContext().removeWritableOrganization(orgId);
OBContext.getOBContext().removeFromWritableOrganization(orgId);
```

This is the right lever here specifically because it is **not frame-based**: it changes the writable-org
set itself, so it survives core pushing its own `setAdminMode(true)` frame (see the CRITICAL note in §2).

Proposed helper — new small class in `com.etendoerp.go.schemaforge` (name to be chosen by the implementer):

```java
static <T> T inStarOrgWriteScope(Supplier<T> work) {
  OBContext ctx = OBContext.getOBContext();
  // Guard: a client-admin role (" CO") legitimately has "0" already — never strip it in the finally.
  boolean granted = !ctx.getWritableOrganizations().contains("0");
  if (granted) {
    ctx.addWritableOrganization("0");
  }
  try {
    T result = work.get();
    OBDal.getInstance().flush();   // persist the counter bump INSIDE the scope
    return result;
  } finally {
    if (granted) {
      ctx.removeWritableOrganization("0");
      ctx.removeFromWritableOrganization("0");
    }
  }
}
```

Implementation notes:
- The `flush()` inside the scope is **essential** — the check fires on flush, not on save. Site 2 already
  flushes in the same method (`PaymentRegistrationService.java:868`), so the scope is naturally tight there.
  Site 1 needs the whole `APRM_MatchingUtility.addNewDraftReconciliation` call inside the scope, because
  core's flush is inside that method.
- Keep the scope **as narrow as the document-number generation**, never method-wide. This mirrors the
  policy already established and review-approved in this module for the same class of problem — see the
  class javadoc of `src/com/etendoerp/go/roles/RoleInheritanceReconciliationService.java` (implementation at
  `:231`, also `AbstractAccessOverlapCorruptionGuard.java:758` and `:973`): *"the SAME narrow,
  method-scoped bypass core's own copyRoleAccess/updateRoleAccess/deleteRoleAccess use for exactly this kind
  of write — never the outer, method-wide bypass"*.
- `addWritableOrganization` nullifies the org caches, so the next `getWritableOrganizations()` re-queries the
  org list. Negligible per call, worth knowing.

### Rejected alternatives, with reasons (put these in the ticket so they are not re-litigated)

| Option | Why rejected |
|---|---|
| Change the fixed roles' `UserLevel` from `"  O"` to `" CO"` | Grants those roles every access-level-6 (System/Client) entity — a very broad permission change to fix a counter. Safe w.r.t. `AD_ROLE_TRG` (it returns early for `IsManual='Y'`, `src-db/database/model/triggers/AD_ROLE_TRG.xml:49`, and all GO roles are manual), but still disproportionate. |
| Move the sequences down to the org (in the dataset + a data-fix) | The reporter's manual workaround. A sequence at `*` is valid standard config; does not scale to multi-org; would need repeating for every sequence. |
| Fix `Fin_UtilityLegacy.incrementSeqIfUpdateNext` / `APRM_MatchingUtility:665` in core | The cleanest fix technically (it would cover Classic and all ~15 APRM call sites at once) but **explicitly out of scope**: core changes affect all of Etendo. Record as a follow-up finding. |
| Impersonate the client-admin role (PSD2's approach, `ClientAdminContextResolver`, used from `GetBankStatementsAllClientsProcess.java:129-130`) | Correct for a background batch, wrong for a live user request: loses the real user's audit identity and runs the rest of the request as admin. |

---

## 5. Out of scope — record as follow-up findings, do not fix here

- **Voiding an invoice** numbers a dummy payment inside core (`ProcessInvoiceUtil.java:140`, `:297`,
  triggered only by `docaction = "RC"`). GO does not expose it today; if it ever does, that site is exposed.
- **Reversing/voiding a payment** numbers through `FIN_PaymentProcess.java:551` (`*R*` prefix), inside core.
- **Etendo Classic and the other ~15 APRM call sites** (`FIN_AddPayment.java:586`,
  `FIN_PaymentProposalProcess.java:142/191`, `ProcessInvoice.java:313`, `Reconciliation.java:477`,
  `AddPaymentActionHandler.java:444`, `DoubtFulDebtPickEditLines.java:144`, …) stay broken for any
  Organization-level role. Only a core fix closes these.

---

## 6. Acceptance criteria

1. With a role whose `AD_Role.UserLevel` is `"  O"`, on a tenant whose document sequences live at org `*`:
   - reconciling a statement line against existing transactions succeeds;
   - reconciling a statement line against a sales invoice succeeds (both sequences, in one request);
   - adding a payment from the sales-invoice panel (`action=registerPayment`) succeeds;
   - registering a payment from the New Movement wizard (`action=create-payment`) succeeds;
   - closing a cash drawer succeeds.
2. No document sequence has to be moved out of org `*`. The onboarding dataset is unchanged.
3. No role's `UserLevel`, org access, or window/process access is modified.
4. The tenant-owner role (`" CO"`) behaves exactly as before — in particular the helper must not remove
   `0` from its writable orgs on the way out.
5. The scope of the grant is limited to the document-number generation, not to a whole endpoint action.

## 7. Test plan

- **Unit (JUnit, `modules/com.etendoerp.go/src-test/`, Mockito-only per module convention — no OBBaseTest):**
  helper grants and then revokes; helper is a no-op for a context that already has `0`
  (client-admin case) and does NOT revoke it; the flush happens inside the scope; the scope is restored
  on an exception thrown by the wrapped work.
- **E2E / manual on a freshly onboarded tenant with an invited Finance-role user:** the five flows in
  acceptance criterion 1. This class of bug is only catchable against a freshly onboarded tenant — see the
  lesson recorded in `docs/feedback.md:1055` (ETP-4795, same endpoint, same "works on GOClient, fails on a
  new tenant" tell).
- Delegate all test authoring to the `test-generator` subagent (Tester) per repo policy.

## 8. Useful verification queries

```sql
-- the two roles side by side: the invited role's userlevel is the whole story
SELECT name, userlevel, ismanual, is_client_admin
  FROM ad_role WHERE ad_client_id = '<client>';

-- which org each document sequence lives in
SELECT d.docbasetype, s.name, s.ad_org_id
  FROM c_doctype d JOIN ad_sequence s ON s.ad_sequence_id = d.docnosequence_id
 WHERE d.ad_client_id = '<client>' AND d.docbasetype IN ('REC','ARR','APP');

-- the role's org access (shows * is granted, even though core strips it)
SELECT o.ad_org_id, o.name
  FROM ad_role_orgaccess roa JOIN ad_org o ON o.ad_org_id = roa.ad_org_id
 WHERE roa.ad_role_id = '<personal role id>';
```

---

## 9. Instructions for the Jira session

Create the task per the `/etendo-workflow-manager` skill and this repo's conventions
(`schema_forge/CLAUDE.md` → Commit Conventions; `.claude/agents/workflow.md` → `<pr_conventions>`).
Delegate branch/Jira/PR operations to **Clerk** (`subagent_type="general-purpose"` + Clerk's identity).

- **Suggested summary** (Git-Police-safe: no `"` `'` backtick `$` `\` `•` `°` `©` `®` `¿` `¡`, no tab/newline,
  fits the 80-char commit first line):
  `Fix sequence write blocked for Organization level roles in payments`
- **Issue type:** ask the human. It is a functional defect, but the repo's merge-block workflow targets
  `develop` via `feature/ETP-XXXX`, whereas a Jira `Bug` routes to the hotfix flow branching from `main`
  (`.claude/CLAUDE.md` → Task Source Detection). Do not pick this unilaterally.
- **Epic:** ask the human which epic is current.
- **Component/module:** `com.etendoerp.go` (runtime module). No `schema_forge` change is needed.
- **Body:** this document is the technical description. Include §1 (symptom + the three verbatim payloads),
  §2 (root cause), §3 (the 5 sites table), §4 (fix + rejected alternatives), §5 (out of scope), §6, §7.
- Attach or link the reporter's screenshots if available; they add nothing beyond the payloads already quoted.

## 10. Provenance

Investigated 2026-09-08 by reading the code in this workspace; every file:line above was opened and
verified, not inferred. Live confirmations (three HTTP 400 payloads plus the successful invoice completion)
were produced by the reporter on `go.experimental.etendo.cloud`. No code was modified during the
investigation.
