# Proposal: Let Organization-Level Roles Bump Document Sequences Owned by Org `*`, at the Core Level

**Status:** discussion document, not implemented. Written 2026-09-08 during ETP-5230 as a
byproduct of building an external workaround for this bug — see that ticket and
`docs/plans/2026-09-08-star-org-sequence-write-blocked-for-org-level-roles.md` for the full
investigation. **Etendo GO is NOT waiting on this proposal** — the module-level fix in
`com.etendoerp.go` (`StarOrgWriteScope`, five call sites) is the accepted path for ETP-5230
(human decision: "tocar `etendo_core` es la última de las opciones porque eso no sería solo para
GO sino que para todo Etendo"). This document exists so the idea can be discussed with the wider
team, separate from and not blocking ETP-5230's delivery.

Every claim marked **[confirmed]** was verified by directly reading the cited core source
file/line in this checkout. Claims marked **[proposed]** are a suggested direction, not
implemented or tested code — validate before committing to it.

## The bug, in one sentence

A role whose `AD_Role.UserLevel` is exactly Organization cannot increment a document-number
sequence that lives in organization `*`, because the APRM numbering path writes the sequence row
through the DAL — so a standard, valid configuration (document sequences at `*`, the shape all
reference data ships) makes every payment and every reconciliation impossible for that role.

## Confirmed root cause, with exact source locations

**[confirmed] Core strips `*` from the writable-org set of an Organization-level role.**
`OBContext#setWritableOrganizations`, `src/org/openbravo/dal/core/OBContext.java:608-625`:

```java
if (localUserLevel.contains("S") || localUserLevel.contains("C")) {
  writableOrganizations.add("0");
}
… add every org from AD_Role_OrgAccess …
if (localUserLevel.equals("O")) { // remove *
  writableOrganizations.remove("0");                              // 622
}
writableOrganizations.addAll(additionalWritableOrganizations);     // 624
```

`setUserLevel` trims (`OBContext.java:583`), so `"  O"` becomes `"O"`. The strip happens even when
the role explicitly holds `AD_Role_OrgAccess` to `*` — the UI shows the access, the session does
not have it. There is no diagnostic anywhere.

**[confirmed] The APRM numbering path writes the sequence through the DAL.**
`Fin_UtilityLegacy#incrementSeqIfUpdateNext`,
`modules_core/com.etendoerp.legacy.advpaymentmngt/src/com/etendoerp/legacy/advancedpaymentmngt/Fin_UtilityLegacy.java:58-63`:

```java
public void incrementSeqIfUpdateNext(final boolean updateNext, final Sequence seq) {
  if (updateNext) {
    seq.setNextAssignedNumber(seq.getNextAssignedNumber() + seq.getIncrementBy());
    OBDal.getInstance().save(seq);
  }
}
```

On flush, `OBInterceptor#onFlushDirty` (`src/org/openbravo/dal/core/OBInterceptor.java:165`) →
`doEvent` → `SecurityChecker#checkWriteAccess` (`OBInterceptor.java:331`) throws at
`src/org/openbravo/dal/security/SecurityChecker.java:190`, because the record being written is the
`AD_Sequence` row itself and its organization is `0`.

**[confirmed] The SQL numbering path does not check anything.** `Utility#getDocumentNo` →
`DocumentNoData` → the PL function `AD_SEQUENCE_DOC`
(`src-db/database/model/functions/AD_SEQUENCE_DOC.xml`) performs a plain
`UPDATE AD_Sequence SET CurrentNext = CurrentNext + IncrementNo`. So the two numbering paths in
core disagree about whether bumping a counter is a security-relevant write. This asymmetry is the
heart of the proposal: everything numbered the SQL way (orders, invoices, bank statements,
financial-account movements) works fine for the very same role.

**[confirmed] Admin mode does not help, and the reason is subtle.**
`OBContext#setAdminMode(boolean doOrgClientAccessCheck)` (`OBContext.java:213`) — the argument
means *keep* checking client/org access. `APRM_MatchingUtility#addNewDraftReconciliation`
(`modules_core/org.openbravo.advpaymentmngt/…/APRM_MatchingUtility.java:665`) passes `true`, and
`doOrgClientAccessCheck()` (`OBContext.java:1208`) reads `peek()` — the *innermost* frame. So a
caller who wraps the whole thing in `setAdminMode(false)` gets no effect whatsoever, silently.

**[confirmed] `AD_Sequence` itself is not the obstacle.** Its `AccessLevel` is `7` (All) —
`AD_TABLE_ID = 115` in `src-db/database/sourcedata/AD_TABLE.xml` — and
`EntityAccessChecker#hasCorrectAccessLevel` (`src/org/openbravo/dal/security/EntityAccessChecker.java:404-422`)
admits level 7 for an `"O"` role. The writable-organization set is the only blocker, which is why
granting `"0"` is sufficient and nothing else has to change.

**[confirmed] Affected core call sites.** `FIN_Utility#getDocumentNo` is reached from at least
these, all of which are broken today for an Organization-level role — including Etendo Classic's
own UI:

| Call site | Flow |
|---|---|
| `APRM_MatchingUtility.java:676` | bank reconciliation (Classic and GO) |
| `advpaymentmngt/ad_actionbutton/Reconciliation.java:477` | Classic manual reconciliation |
| `process/FIN_AddPayment.java:586` | refund payment |
| `process/FIN_PaymentProcess.java:551` | reversed payment (`*R*` prefix) |
| `process/FIN_AddPaymentFromJournalLine.java:115` | payment from a journal line |
| `process/FIN_PaymentProposalProcess.java:142`, `:191` | payment proposal |
| `ad_actionbutton/ProcessInvoice.java:313`, `ProcessInvoiceUtil.java:140`, `:297` | invoice completion / voiding |
| `actionHandler/AddPaymentActionHandler.java:444` | Classic Add Payment |
| `actionHandler/DoubtFulDebtPickEditLines.java:144` | doubtful debt |

## Proposed fixes, in increasing scope

### Tier 1 — Make the sequence bump organization-agnostic (small, surgical, high confidence)

**[proposed]** In `Fin_UtilityLegacy#incrementSeqIfUpdateNext`, wrap the save **and a flush** in
`OBContext.setAdminMode(false)` / `restorePreviousMode()`. The flush must be inside: the check
fires on flush, not on save, and the caller's own flush may happen under a `setAdminMode(true)`
frame. The method already holds a pessimistic lock on the row (`lockSequence`, a
`LockOptions.UPGRADE` query), so flushing there is safe and arguably overdue.

Rationale: incrementing a document counter is internal bookkeeping, not a write of user data, and
core's own SQL path already treats it that way. This aligns the two paths instead of leaving them
in disagreement. Closes every row of the table above at once, Classic included.

Risk: `setAdminMode(false)` also suppresses the entity-access check for the duration. Scoped to
two statements over a single `AD_Sequence` row, that is a narrow surface — but it is a real
widening and deserves review by someone who owns APRM.

### Tier 2 — Fix the asymmetry at its source instead (medium)

**[proposed]** Have `Fin_UtilityLegacy` delegate the increment to the same PL function the other
path uses (`AD_SEQUENCE_DOC`, or a sibling keyed by `AD_Sequence_ID` rather than by name), so
there is exactly one mechanism for bumping a counter in the product. More invasive than Tier 1 and
it changes locking semantics — the DAL path's `select for update` and the PL function's plain
`UPDATE` do not serialize the same way — so it needs a concurrency review, not just a code review.

### Tier 3 — Question the `UserLevel == "O"` strip itself (larger, probably not worth it)

**[proposed]** `OBContext.java:622` removes `"0"` from the writable set even when the role was
explicitly granted `AD_Role_OrgAccess` to `*`. One could argue an explicit grant should win over
the level-derived default, or at least that the discrepancy should be logged. This is decades-old
behaviour that a great deal of code depends on; raising it here for completeness, not
recommending it.

## Why Etendo GO isn't waiting on this

The module-level fix (`com.etendoerp.go/src/com/etendoerp/go/schemaforge/StarOrgWriteScope.java`)
uses core's own idiom for exactly this situation — `InitialOrgSetup` injects an org into the
session's writable set when it has to write to one the role does not own
(`src/org/openbravo/erpCommon/businessUtility/InitialOrgSetup.java:352`, cleanup at
`src/org/openbravo/erpCommon/ad_forms/InitialOrgSetup.java:79-80`). It grants org `*` for the
duration of one document-number expression, flushes inside the grant, and restores the lists in a
`finally`. Five GO call sites use it.

What that leaves open, and what only a core fix closes:

- **Etendo Classic** is untouched. Every Classic flow in the table above still fails for an
  Organization-level role.
- **Voiding an invoice** and **reversing a payment** number inside core
  (`ProcessInvoiceUtil.java:140`/`:297`, `FIN_PaymentProcess.java:551`). GO does not expose either
  today — it only ever sends `docaction = "CO"` — so they are unreachable rather than fixed.
- Any future GO flow that numbers a document has to remember to use the scope. The helper's
  javadoc and `com.etendoerp.go/docs/neo-headless.md` §7 both say so, but that is a convention,
  not an enforcement.

There is also a second, entirely different way to close this that is being analysed separately by
the roles owner: change the fixed GO roles' `UserLevel` from `"  O"` to `" CO"`. **[confirmed]**
that would fix it (line 624 runs after 622, and `"CO"` contains `"C"` so `"0"` is added back), and
it would fix Classic too — but it is atomic across the templates and every personal role, because
`RoleInheritanceEventHandler#isSameUserLevel`
(`src/org/openbravo/role/inheritance/RoleInheritanceEventHandler.java:116`) compares the two
levels with exact string equality and throws `DifferentUserLevelRoleInheritance` on a mismatch. A
half-migrated fleet does not break immediately; it breaks on the next invitation. It also widens
those roles to every access-level-6 (System/Client) table their windows reach —
`EntityAccessChecker#hasCorrectAccessLevel` — which includes `AD_Role`, `AD_Window_Access` and
`AD_User_Roles`. If that decision lands, ETP-5230's module fix becomes redundant and should be
reverted rather than kept.
