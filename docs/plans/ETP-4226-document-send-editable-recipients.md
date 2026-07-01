# Document Send Editable Email Recipients (To/CC) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Jira:** ETP-4226 — branch `feature/ETP-4226` (shared name across both repos per `docs/branch-workflow.md`)
**Spec:** `docs/proposals/document-send-editable-email-recipients.md` (revision 5 — read it before executing; sections referenced below)

**Goal:** Editable To/CC recipients become the DEFAULT for every document-send modal; the backend accepts an optional allowlisted `recipientEdits` command field in the document-send contract family (v1, in place) and stays authoritative over the final recipient set.

**Architecture:** Five PRs, one domain each (proposal §5.2): (1) com.etendoerp.go framework primitives — multi-channel recipient model, `NO_RECIPIENT`, per-address/domain suppression, multi-recipient audit, server-derived idempotency; (2) com.etendoerp.go `recipientEdits` acceptance in `DefaultDocumentSendEmailContract` with disable/tune hook; (3) schema-forge generator support for the `window.sendDocument` override; (4) app-shell chip editor enabled by default + command-builder options + i18n (the single activation switch); (5) docs + mocked e2e in the same PR set as 4. Each PR is inert until PR 4.

**Tech Stack:** Java CDI (Weld) + JUnit4/Mockito in `com.etendoerp.go`; React + Vitest + node:test in `tools/app-shell`; Playwright mocked e2e in `e2e/`.

**Conventions that apply to every commit:**
- Commit format `Feature ETP-4226: <description>` (≤80 chars, English, NO `Co-Authored-By`).
- Backend compiles/tests are run by the user (do NOT run gradle yourself — hand off with the exact command).
- Frontend tests: `cd tools/app-shell && npx vitest run <file>` (Vitest) or `node --test <file>` (node:test).
- All test writing is delegated to the `test-generator` subagent per CLAUDE.md.
- Code change + doc update = one atomic unit (Documentation Freshness policy).

---

## File Map

### PR 1 — `com.etendoerp.go` framework primitives (`{etendo_root}/modules/com.etendoerp.go`)
Base: `src/com/etendoerp/go/schemaforge/email/`

- Create: `EmailRecipientSet.java` — immutable per-channel recipient model (`to[]`, `cc[]`), normalization, dedup, hash.
- Modify: `EmailRecipientResolution.java` — carry an `EmailRecipientSet`; keep single-recipient factory as compatibility wrapper.
- Modify: `EmailProviderRequest.java` — `to[]`/`cc[]`; payload emits JSON arrays; single-recipient compat constructor.
- Modify: `EmailProviderAdapter.java` + `ApiGatewayEmailProviderAdapter.java` — `supportsMultipleRecipients()` / `supportsCc()` capability flags.
- Modify: `TransactionalEmailService.java` — `STATUS_NO_RECIPIENT`, suppression check over all channels, capability check, audit threading.
- Modify: `EmailSafetyStore.java`, `DalEmailSafetyStore.java`, `InMemoryEmailSafetyStore.java` — per-address/per-domain suppression list.
- Modify: `EmailAuditRecord.java` — per-channel hash lists (base/added/removed/final), final domains.
- Modify: `EmailDeliveryPolicy.java` — `serverDerivedIdempotency` flag (caller key ignored).
- Tests: `src-test/.../email/` mirroring existing test layout (find with `ls src-test` in the module — pin location before writing).

### PR 2 — `com.etendoerp.go` document-send contract family

- Create: `EmailRecipientEdits.java` — typed DTO parsed from the command body (`to.add/remove`, `cc.add`).
- Modify: `DefaultDocumentSendEmailContract.java` — accept `recipientEdits` by default, generic resolution algorithm (§4), hooks `isRecipientEditingEnabled()` / `maxRecipientsTotal()`, server-derived idempotency with `recipientSetHash`, `perUser` throttle.
- Modify: `EmailContractCommandSupport.java` — `FIELD_RECIPIENT_EDITS` constant and `rejectRecipientEditsIfPresent()` helper for non-document contracts (the set hash lives on `EmailRecipientSet.recipientSetHash()`).
- Modify: `AccountLinkEmailContract.java`, `AccountNoticeEmailContract.java`, `LoginAlertEmailContract.java` — reject commands containing `recipientEdits` with `VALIDATION_FAILED`.
- Tests: contract-family tests next to `InitialEmailContractsTest` covering proposal §9 edge cases 1–15.

### PR 3 — schema_forge generator (`generator-change`)

- Modify: `cli/src/generate-frontend.js` — emit `window.sendDocument` override (`editableRecipients`, `cc`, `maxRecipients`) into the generated spec/props, following the existing `window.*` option emission pattern (e.g. `hideDeleteWhenComplete`).
- Modify: `docs/decisions-reference.md` — document the override.
- Tests: `cli/test/` (follow existing generator test files).

### PR 4 — app-shell (`platform-change`) — ACTIVATION

- Create: `tools/app-shell/src/components/contract-ui/recipientEdits.js` — pure helpers.
- Create: `tools/app-shell/src/components/contract-ui/RecipientChipEditor.jsx` — chip editor (To/CC).
- Modify: `tools/app-shell/src/components/contract-ui/documentEmailSend.js` — options arg, omit client key when edits present.
- Modify: `tools/app-shell/src/components/contract-ui/SendDocumentModal.jsx` — chip editor default, CC row, send-disable rules, `sendPolicy` prop.
- Modify: `packages/app-shell-core/src/locales/en_US.json` + `es_ES.json` — new keys.
- Tests: `tools/app-shell/src/components/contract-ui/__tests__/recipientEdits.test.js` (new, node:test), `documentEmailSend.test.js`, `documentEmailSend.vitest.js`, `SendDocumentModal.vitest.jsx`, `SendDocumentModal.test.js`.

### PR 5 — docs + e2e (same PR set as 4)

- Modify: `docs/transactional-email-framework.md` (rule 6 amendment), `docs/email-contracts.md` (recipientEdits schema + versioning waiver), `docs/document-email-contract-implementation.md` (editable-by-default), `docs/ops/transactional-email-security.md` (named audit redaction/storage policy), `docs/generated-custom-windows/{sales-invoice,sales-order,purchase-order,sales-quotation,goods-shipment,goods-receipt}.md`.
- Create: `e2e/tests/flows/send-recipient-chips.mocked.spec.js` (modeled on `row-quick-actions.mocked.spec.js`; read `docs/e2e-testing-guide.md` first).
- If the domain-boundary gate flags PR 4+5 together: attach `docs/plans/ETP-4226-cross-domain.md` (precedent: ETP-4030).

---

# PR 1 — Framework primitives (com.etendoerp.go)

All paths below are relative to `{etendo_root}/modules/com.etendoerp.go`. Before Task 1, run `ls src-test/com/etendoerp/go/schemaforge/email/ 2>/dev/null || find . -name "*EmailSafetyStore*Test*"` to pin the exact test directory; use it wherever `src-test/...` appears.

### Task 1: `EmailRecipientSet` — immutable multi-channel recipient model

**Files:**
- Create: `src/com/etendoerp/go/schemaforge/email/EmailRecipientSet.java`
- Test: `src-test/.../email/EmailRecipientSetTest.java`

- [ ] **Step 1: Write the failing test** (delegate to test-generator)

```java
public class EmailRecipientSetTest {

  @Test
  public void normalizesAndDeduplicatesWithinChannel() {
    EmailRecipientSet set = EmailRecipientSet.of(
        Arrays.asList(" Ana@Acme.COM ", "ana@acme.com"), Collections.emptyList());
    assertEquals(Collections.singletonList("Ana@acme.com"), set.getTo());
  }

  @Test
  public void crossChannelDedupPrefersTo() {
    EmailRecipientSet set = EmailRecipientSet.of(
        Collections.singletonList("ap@acme.com"),
        Arrays.asList("ap@acme.com", "pm@acme.com"));
    assertEquals(Collections.singletonList("pm@acme.com"), set.getCc());
  }

  @Test
  public void totalCountSpansChannels() {
    EmailRecipientSet set = EmailRecipientSet.of(
        Arrays.asList("a@x.com", "b@x.com"), Collections.singletonList("c@x.com"));
    assertEquals(3, set.totalCount());
  }

  @Test
  public void hashIsStableAcrossOrderingAndChannelAware() {
    EmailRecipientSet a = EmailRecipientSet.of(
        Arrays.asList("a@x.com", "b@x.com"), Collections.emptyList());
    EmailRecipientSet b = EmailRecipientSet.of(
        Arrays.asList("b@x.com", "a@x.com"), Collections.emptyList());
    EmailRecipientSet c = EmailRecipientSet.of(
        Collections.singletonList("a@x.com"), Collections.singletonList("b@x.com"));
    assertEquals(a.recipientSetHash(), b.recipientSetHash());
    assertNotEquals(a.recipientSetHash(), c.recipientSetHash());
  }

  @Test
  public void emptyToIsReportedEvenWithCc() {
    EmailRecipientSet set = EmailRecipientSet.of(
        Collections.emptyList(), Collections.singletonList("c@x.com"));
    assertTrue(set.isToEmpty());
  }
}
```

- [ ] **Step 2: Hand the test run to the user** — `./gradlew test --tests "*EmailRecipientSetTest"` from etendo root. Expected: compile failure (class missing).

- [ ] **Step 3: Implement**

```java
package com.etendoerp.go.schemaforge.email;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.TreeSet;

import org.apache.commons.lang3.StringUtils;
import org.openbravo.base.exception.OBException;

/**
 * Immutable per-channel recipient set (to/cc) with normalization, cross-channel
 * dedup (to wins over cc) and a stable channel-aware SHA-256 hash.
 */
public final class EmailRecipientSet {

  public static final String CHANNEL_TO = "to";
  public static final String CHANNEL_CC = "cc";

  private final List<String> to;
  private final List<String> cc;

  private EmailRecipientSet(List<String> to, List<String> cc) {
    this.to = Collections.unmodifiableList(to);
    this.cc = Collections.unmodifiableList(cc);
  }

  public static EmailRecipientSet of(List<String> to, List<String> cc) {
    List<String> normalizedTo = normalizeChannel(to);
    List<String> normalizedCc = normalizeChannel(cc);
    Set<String> toKeys = comparableKeys(normalizedTo);
    List<String> dedupedCc = new ArrayList<>();
    for (String address : normalizedCc) {
      if (!toKeys.contains(comparableKey(address))) {
        dedupedCc.add(address);
      }
    }
    return new EmailRecipientSet(normalizedTo, dedupedCc);
  }

  public static EmailRecipientSet singleTo(String recipient) {
    return of(Collections.singletonList(recipient), Collections.emptyList());
  }

  public List<String> getTo() {
    return to;
  }

  public List<String> getCc() {
    return cc;
  }

  public int totalCount() {
    return to.size() + cc.size();
  }

  public boolean isToEmpty() {
    return to.isEmpty();
  }

  /** Stable SHA-256 hex hash over sorted, normalized {@code channel:address} tuples. */
  public String recipientSetHash() {
    Set<String> tuples = new TreeSet<>();
    for (String address : to) {
      tuples.add(CHANNEL_TO + ":" + comparableKey(address));
    }
    for (String address : cc) {
      tuples.add(CHANNEL_CC + ":" + comparableKey(address));
    }
    return sha256(String.join("|", tuples));
  }

  /** Normalization: trim, lower-case domain, drop blanks, dedup within channel. */
  private static List<String> normalizeChannel(List<String> values) {
    Set<String> seen = new LinkedHashSet<>();
    List<String> result = new ArrayList<>();
    if (values == null) {
      return result;
    }
    for (String value : values) {
      String normalized = normalizeAddress(value);
      if (normalized != null && seen.add(comparableKey(normalized))) {
        result.add(normalized);
      }
    }
    return result;
  }

  /** Trims and lower-cases the domain part; local part case is preserved. */
  public static String normalizeAddress(String value) {
    String trimmed = StringUtils.trimToNull(value);
    if (trimmed == null) {
      return null;
    }
    int at = trimmed.lastIndexOf('@');
    if (at < 0) {
      return trimmed;
    }
    return trimmed.substring(0, at) + "@"
        + trimmed.substring(at + 1).toLowerCase(Locale.ROOT);
  }

  private static String comparableKey(String address) {
    return address.toLowerCase(Locale.ROOT);
  }

  private static Set<String> comparableKeys(List<String> addresses) {
    Set<String> keys = new LinkedHashSet<>();
    for (String address : addresses) {
      keys.add(comparableKey(address));
    }
    return keys;
  }

  static String sha256(String value) {
    try {
      MessageDigest digest = MessageDigest.getInstance("SHA-256");
      byte[] hash = digest.digest(value.getBytes(StandardCharsets.UTF_8));
      StringBuilder hex = new StringBuilder(hash.length * 2);
      for (byte b : hash) {
        hex.append(String.format("%02x", b));
      }
      return hex.toString();
    } catch (NoSuchAlgorithmException e) {
      throw new OBException("SHA-256 unavailable", e);
    }
  }
}
```

Note the standard Etendo license header is required at the top (copy from `EmailRecipientResolution.java`).

- [ ] **Step 4: User runs the test** — expected PASS.
- [ ] **Step 5: Commit** — `Feature ETP-4226: Add multi-channel EmailRecipientSet model`

### Task 2: Multi-channel `EmailRecipientResolution` + `EmailProviderRequest` (compat preserved)

**Files:**
- Modify: `src/.../email/EmailRecipientResolution.java`
- Modify: `src/.../email/EmailProviderRequest.java`
- Test: `src-test/.../email/EmailProviderRequestTest.java` (extend existing if present)

- [ ] **Step 1: Failing tests** — assert: (a) `EmailRecipientResolution.serverResolved("a@x.com")` still works and `getRecipientSet().getTo()` returns `["a@x.com"]`; (b) new factory `serverResolved(EmailRecipientSet)`; (c) `EmailProviderRequest` built from a set with cc produces payload `{"to": ["a@x.com"], "cc": ["c@x.com"], ...}` (JSON arrays); (d) the single-recipient constructor still emits `"to"` as a one-element array (verify the API Gateway accepts arrays — if it requires a string for single recipients, keep emitting a string when `to.size()==1 && cc.isEmpty()` and assert that instead; check `ApiGatewayEmailProviderAdapter` before deciding).

- [ ] **Step 2: Implement.** In `EmailRecipientResolution`: add a `private final EmailRecipientSet recipientSet;` field; the existing `serverResolved(String)`/`callerProvided(String)` factories build `EmailRecipientSet.singleTo(recipient)`; add

```java
public static EmailRecipientResolution serverResolved(EmailRecipientSet recipients) {
  if (recipients == null || recipients.isToEmpty()) {
    throw new OBException("Recipient set must contain at least one to recipient");
  }
  return new EmailRecipientResolution(true, recipients.getTo().get(0), SOURCE_SERVER, 200,
      null, recipients);
}

public EmailRecipientSet getRecipientSet() {
  return recipientSet;
}
```

(`getRecipient()` keeps returning the first `to` address so existing single-recipient code paths compile unchanged.)

In `EmailProviderRequest`: replace `private final String recipient` with `private final EmailRecipientSet recipients`; keep the old constructor delegating to a new `EmailProviderRequest(EmailRecipientSet, String template, JSONObject data, String replyTo)`; `getRecipient()` returns first `to`; add `getRecipients()`; `toProviderPayload()` emits `to` (and `cc` when non-empty) per the Step 1 decision on array-vs-string.

- [ ] **Step 3: User runs full email test suite** — `./gradlew test --tests "*schemaforge.email*"`. Expected: all green (compat factories keep existing contracts passing).
- [ ] **Step 4: Commit** — `Feature ETP-4226: Thread multi-channel recipients through resolution and provider request`

### Task 3: Provider adapter capability flags

**Files:**
- Modify: `src/.../email/EmailProviderAdapter.java` (interface) — add default methods:

```java
default boolean supportsMultipleRecipients() {
  return false;
}

default boolean supportsCcChannel() {
  return false;
}
```

- Modify: `src/.../email/ApiGatewayEmailProviderAdapter.java` — override both. **Read the adapter and the gateway API contract first**; only return `true` for what the gateway actually delivers. If the gateway cannot fan out, returning `false` is correct — the service-level check (Task 5) turns that into `VALIDATION_FAILED` (edge case 14), never silent truncation.
- Test: extend the adapter test with capability assertions; add a `FakeProviderAdapter` variant with capabilities off for service tests.

- [ ] Steps: failing test → implement → user runs suite → commit `Feature ETP-4226: Add provider multi-recipient capability flags`

### Task 4: Per-address/per-domain suppression list

**Files:**
- Modify: `src/.../email/EmailSafetyStore.java` — add:

```java
/** Checks whether a specific address or its domain is suppressed for the tenant. */
boolean isRecipientSuppressed(String tenantId, String emailAddress);
```

- Modify: `src/.../email/DalEmailSafetyStore.java` — implement against the existing safety/kill-switch storage (read the class first; follow the same persistence pattern the kill switches use, adding `ADDRESS` and `DOMAIN` scopes keyed by SHA-256 address hash and plaintext lower-cased domain respectively — raw addresses are never stored, per the redaction policy).
- Modify: `src/.../email/InMemoryEmailSafetyStore.java` — in-memory sets `suppressedAddressHashes` / `suppressedDomains` with test helpers `suppressAddress(String)` / `suppressDomain(String)`.
- Test: suppression by exact address; by domain; case-insensitive domain match; unsuppressed address passes.

- [ ] Steps: failing tests → implement → user runs suite → commit `Feature ETP-4226: Add per-address and per-domain suppression list`

### Task 5: `NO_RECIPIENT` status + service-level multi-channel checks

**Files:**
- Modify: `src/.../email/TransactionalEmailService.java`

Read the service first (`STATUS_*` constants near the top, the send orchestration method). Changes:

1. Add `public static final String STATUS_NO_RECIPIENT = "NO_RECIPIENT";`.
2. Where an unresolved/empty recipient currently collapses into `VALIDATION_FAILED`, branch: empty final `to` set → respond `NO_RECIPIENT` (HTTP 422, message via existing message pattern). Contracts signal it by returning `EmailRecipientResolution.rejected(422, ...)` — add a dedicated factory `EmailRecipientResolution.noRecipient(String message)` carrying a `noRecipient` flag the service maps to `STATUS_NO_RECIPIENT`.
3. Suppression: before delivery, iterate `recipientSet.getTo()` + `getCc()` and call `safetyStore.isRecipientSuppressed(tenantId, address)`; any hit → existing `SUPPRESSED` path (edge case 9).
4. Capability check: if `recipientSet.totalCount() > 1 && !adapter.supportsMultipleRecipients()` or `!recipientSet.getCc().isEmpty() && !adapter.supportsCcChannel()` → `VALIDATION_FAILED` (edge case 14).
5. Throttle: apply per-recipient/per-domain rules across all addresses in both channels (today they run against the single recipient — locate that loop and iterate the set).

- Test: service tests with `InMemoryEmailSafetyStore` + `FakeProviderAdapter` covering: empty-to → `NO_RECIPIENT`; suppressed cc address → `SUPPRESSED`; multi-recipient with incapable adapter → `VALIDATION_FAILED`; capable adapter sends and provider receives full set; provider failure → `PROVIDER_FAILED` with audit preserved (edge case 15).

- [ ] Steps: failing tests → implement → user runs suite → commit `Feature ETP-4226: Add NO_RECIPIENT status and multi-channel safety checks`

### Task 6: Multi-recipient audit + server-derived idempotency support

**Files:**
- Modify: `src/.../email/EmailAuditRecord.java` — add fields (all hash lists, never raw addresses): `baseRecipientHashes`, `addedRecipientHashesByChannel`, `removedRecipientHashes`, `finalRecipientHashesByChannel`, `finalRecipientDomains` (plaintext domains only, matching the existing `recipientDomain` precedent). Keep the existing single `recipientHash` populated with the first `to` hash for backward compatibility of existing dashboards.
- Modify: `src/.../email/EmailDeliveryPolicy.java` — add a `serverDerivedIdempotency` boolean (builder/factory flag). When `true`, `TransactionalEmailService` ignores any caller-supplied `idempotencyKey` in the command and uses only the policy key.
- Modify: `src/.../email/TransactionalEmailService.java` — honor the flag; populate the new audit fields from the resolution.
- Test: audit record contains hash lists and no raw address; caller key ignored when flag set; observability sink labels never include raw addresses (extend `LogEmailObservabilitySink` test if present).

- [ ] Steps: failing tests → implement → user runs suite → commit `Feature ETP-4226: Add multi-recipient audit and server-derived idempotency`

**PR 1 gate:** user runs the full module test suite; create PR via Clerk: title `Feature ETP-4226: Email framework multi-channel recipient primitives`, base = current epic/feature integration branch of com.etendoerp.go (confirm with Clerk — never `main`).

---

# PR 2 — `recipientEdits` in the document-send family (com.etendoerp.go)

### Task 7: `EmailRecipientEdits` DTO + command parsing

**Files:**
- Create: `src/.../email/EmailRecipientEdits.java`
- Modify: `src/.../email/EmailContractCommandSupport.java`
- Test: `src-test/.../email/EmailRecipientEditsTest.java`

- [ ] **Step 1: Failing tests** — parse from JSON body; absent field → `Optional.empty()`; invalid email in any list → parse-level rejection; structure:

```java
@Test
public void parsesChannelsFromCommandBody() throws Exception {
  JSONObject body = new JSONObject(
      "{\"recipientEdits\":{\"to\":{\"add\":[\"ap@x.com\"],\"remove\":[\"old@x.com\"]},"
      + "\"cc\":{\"add\":[\"pm@x.com\"]}}}");
  EmailRecipientEdits edits = EmailRecipientEdits.fromBody(body).get();
  assertEquals(Collections.singletonList("ap@x.com"), edits.getToAdd());
  assertEquals(Collections.singletonList("old@x.com"), edits.getToRemove());
  assertEquals(Collections.singletonList("pm@x.com"), edits.getCcAdd());
}

@Test
public void rejectsInvalidEmailInAnyChannel() throws Exception {
  JSONObject body = new JSONObject(
      "{\"recipientEdits\":{\"cc\":{\"add\":[\"not-an-email\"]}}}");
  try {
    EmailRecipientEdits.fromBody(body);
    fail("expected rejection");
  } catch (EmailRecipientEdits.InvalidRecipientEditsException expected) {
    // VALIDATION_FAILED at contract level
  }
}
```

- [ ] **Step 2: Implement.** `fromBody(JSONObject)` returns `Optional<EmailRecipientEdits>`; normalizes each list via `EmailRecipientSet.normalizeAddress`, validates with `EmailContractCommandSupport.isValidEmail`, rejects empty strings, unknown channels (`bcc` etc.), and non-object shapes with `InvalidRecipientEditsException` (checked, carries a client-safe message). Add to `EmailContractCommandSupport`:

```java
public static final String FIELD_RECIPIENT_EDITS = "recipientEdits";

/** Rejection used by contracts outside the document-send family. */
public static EmailAuthorizationResult rejectRecipientEditsIfPresent(
    EmailContractCommand command) {
  JSONObject body = command == null ? null : command.getBody();
  if (body != null && body.has(FIELD_RECIPIENT_EDITS)) {
    return EmailAuthorizationResult.rejected(400,
        "recipientEdits is not accepted by this contract");
  }
  return EmailAuthorizationResult.allowed();
}
```

- [ ] **Step 3: User runs tests → Step 4: Commit** — `Feature ETP-4226: Add recipientEdits DTO and command parsing`

### Task 8: Default acceptance + resolution algorithm in `DefaultDocumentSendEmailContract`

**Files:**
- Modify: `src/.../email/DefaultDocumentSendEmailContract.java`
- Test: contract-family test class (e.g. `DocumentSendRecipientEditsTest.java` next to `InitialEmailContractsTest`)

- [ ] **Step 1: Failing tests** — using the existing fixture pattern (Mockito resolver returning an `EmailDocumentRecord` with `recipientEmail = "contact@x.com"`), cover proposal §9 cases 3–8, 12, 13b: no-edits command resolves exactly `["contact@x.com"]` (pin byte-compat behavior); add to/cc; remove base; remove-all-without-replacement → `noRecipient`; cc-only → `noRecipient`; base contact without email + valid additions → resolves additions; cross-channel dedup; >10 total → rejected 400; editing disabled via hook → command with `recipientEdits` rejected 400.

- [ ] **Step 2: Implement.** Add hooks and rework `resolveRecipient`:

```java
/** Per-contract hook: document-send family accepts recipient edits by default. */
protected boolean isRecipientEditingEnabled() {
  return true;
}

/** Per-contract hook: maximum recipients across to and cc. */
protected int maxRecipientsTotal() {
  return 10;
}

@Override
public EmailRecipientResolution resolveRecipient(EmailContractCommand command) {
  Optional<EmailDocumentRecord> document = resolveDocument(command);
  if (!document.isPresent()) {
    return EmailRecipientResolution.rejected(404, DOCUMENT_RECORD_NOT_FOUND);
  }
  Optional<EmailRecipientEdits> edits;
  try {
    edits = EmailRecipientEdits.fromBody(command.getBody());
  } catch (EmailRecipientEdits.InvalidRecipientEditsException e) {
    return EmailRecipientResolution.rejected(400, e.getMessage());
  }
  if (edits.isPresent() && !isRecipientEditingEnabled()) {
    return EmailRecipientResolution.rejected(400,
        "recipientEdits is not accepted by this contract");
  }
  List<String> baseTo = new ArrayList<>();
  String baseEmail = document.get().getRecipientEmail();
  if (EmailContractCommandSupport.isValidEmail(baseEmail)) {
    baseTo.add(baseEmail);
  }
  if (!edits.isPresent()) {
    // Exactly today's behavior: trusted base recipient or invalid-recipient rejection.
    if (baseTo.isEmpty()) {
      return EmailRecipientResolution.noRecipient("Document has no recipient email");
    }
    return EmailRecipientResolution.serverResolved(baseTo.get(0));
  }
  EmailRecipientSet finalSet = edits.get().applyTo(baseTo);
  if (finalSet.isToEmpty()) {
    return EmailRecipientResolution.noRecipient("Final recipient list is empty");
  }
  if (finalSet.totalCount() > maxRecipientsTotal()) {
    return EmailRecipientResolution.rejected(400,
        "Recipient count exceeds the maximum of " + maxRecipientsTotal());
  }
  return EmailRecipientResolution.serverResolved(finalSet);
}
```

with `EmailRecipientEdits.applyTo(List<String> baseTo)` implementing §4 steps 4–6 (remove against base by comparable key, then add to/cc, then `EmailRecipientSet.of` for cross-channel dedup). **Behavior note pinned by test:** no-edits + no base email used to return `invalidRecipient()` (VALIDATION_FAILED); it now returns `NO_RECIPIENT` — this is edge case 4, an intentional change; update the existing assertion rather than preserving it.

- [ ] **Step 3: User runs tests → Step 4: Commit** — `Feature ETP-4226: Accept recipientEdits by default in document-send contracts`

### Task 9: Server-derived idempotency + `perUser` throttle in `deliveryPolicy`

**Files:**
- Modify: `src/.../email/DefaultDocumentSendEmailContract.java` (`deliveryPolicy`, `resolveSendIdempotencyKey`)
- Test: same contract-family test class

- [ ] **Step 1: Failing tests** — caller-supplied `idempotencyKey` is ignored (two commands differing only in caller key → `DUPLICATE` on second); same record + different final recipient set → different key (case 11); same final set → `DUPLICATE` (case 10); `perUser` throttle applied.

- [ ] **Step 2: Implement.** Replace `resolveSendIdempotencyKey` body:

```java
/** Server-derived key: {contract}:{tenant}:{record}:send:v1:{recipientSetHash}. Caller key ignored. */
private String resolveSendIdempotencyKey(String tenantId, String recordId,
    EmailRecipientSet finalRecipients) {
  String normalizedTenant = StringUtils.defaultIfBlank(tenantId, "global");
  return name + ":" + normalizedTenant + ":" + recordId + ":send:"
      + EmailContractCommandSupport.VERSION + ":" + finalRecipients.recipientSetHash();
}
```

Thread the resolved `EmailRecipientSet` from the `recipient` parameter of `deliveryPolicy(...)` (it is already passed in — use `recipient.getRecipientSet()`); mark the policy `serverDerivedIdempotency(true)`; add `EmailThrottleRule.perUser(...)` to the rule list (pick limits consistent with the existing per-recipient rule, e.g. `perUser(50, 3600)` — confirm against `EmailThrottleRule` defaults). **Watch out:** `resolveDownloadLink` also calls the old key method — the download-link token key must stay stable per record (it cannot depend on the recipient hash, or re-sends with edits would mint new tokens needlessly; keep using `EmailContractCommandSupport.idempotencyKey(name, tenantId, recordId)` there and add a test pinning that).

- [ ] **Step 3: User runs tests → Step 4: Commit** — `Feature ETP-4226: Server-derived recipient-set idempotency and perUser throttle`

### Task 10: Non-document contracts reject `recipientEdits`

**Files:**
- Modify: `src/.../email/contracts/AccountLinkEmailContract.java`, `AccountNoticeEmailContract.java`, `LoginAlertEmailContract.java` — first line of `authorize()`:

```java
EmailAuthorizationResult editsRejection =
    EmailContractCommandSupport.rejectRecipientEditsIfPresent(command);
if (!editsRejection.isAllowed()) {
  return editsRejection;
}
```

- Test: each contract rejects a command containing `recipientEdits` with 400/`VALIDATION_FAILED` (edge case 13).
- [ ] Steps: failing tests → implement → user runs full module suite (regression gate: existing `InitialEmailContractsTest` must stay green) → commit `Feature ETP-4226: Reject recipientEdits outside the document-send family`

**PR 2 gate:** all §9 edge cases 1–15 have a test (1, 2 already exist — verify; 9, 14, 15 live in the PR 1 service tests). Create PR via Clerk.

---

# PR 3 — Generator support for `window.sendDocument` override (schema_forge)

### Task 11: Emit the override from `decisions.json`

**Files:**
- Modify: `cli/src/generate-frontend.js`
- Modify: `docs/decisions-reference.md`
- Test: `cli/test/` (follow the existing generator test naming; run `make test`)

Override schema in `decisions.json`:

```json
{
  "window": {
    "sendDocument": {
      "editableRecipients": false,
      "cc": false,
      "maxRecipients": 5
    }
  }
}
```

- [ ] **Step 1:** Read how an existing `window.*` boolean (e.g. `hideDeleteWhenComplete`) flows from decisions → generated spec/props in `generate-frontend.js`, and check whether `ListView.jsx` already reads a `sendDocument` spec object (the proposal says the generic fallback keys off `sendDocument.enabled` — extend that object rather than inventing a new one).
- [ ] **Step 2:** Failing generator test: a fixture decisions.json with the override produces generated output containing a `sendPolicy` (or extended `sendDocument`) object with exactly the three keys; a decisions.json without it emits nothing extra (default applies, output unchanged — byte-compare against current fixture output).
- [ ] **Step 3:** Implement the emission following the established pattern. No new pipeline-validator rule is needed unless the override can contradict another decision; if you add one it becomes F11 and requires fixture + test + `docs/pipeline-validator-reference.md` row.
- [ ] **Step 4:** `make test` green; `node cli/src/validate-pipeline.js` clean on touched fixtures.
- [ ] **Step 5:** Update `docs/decisions-reference.md` (same commit) with the override table: `editableRecipients` (default `true`), `cc` (default `true`), `maxRecipients` (default `10`).
- [ ] **Step 6: Commit** — `Feature ETP-4226: Generator support for window.sendDocument override`

**PR 3 gate:** no window declares the override at launch — the PR ships generator capability only. Create PR via Clerk.

---

# PR 4 — App-shell chip editor + command builder (ACTIVATION)

### Task 12: Pure recipient helpers

**Files:**
- Create: `tools/app-shell/src/components/contract-ui/recipientEdits.js`
- Test: `tools/app-shell/src/components/contract-ui/__tests__/recipientEdits.test.js` (node:test, mirroring `documentEmailSend.test.js` style)

- [ ] **Step 1: Failing tests** (delegate to test-generator)

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeEmailAddress,
  isValidEmailAddress,
  normalizeRecipientList,
  buildRecipientEdits,
} from '../recipientEdits.js';

test('normalizeEmailAddress trims and lower-cases the domain', () => {
  assert.equal(normalizeEmailAddress(' Ana@Acme.COM '), 'Ana@acme.com');
});

test('isValidEmailAddress accepts valid and rejects invalid', () => {
  assert.equal(isValidEmailAddress('a@x.com'), true);
  assert.equal(isValidEmailAddress('not-an-email'), false);
  assert.equal(isValidEmailAddress(''), false);
});

test('normalizeRecipientList dedups case-insensitively and drops blanks', () => {
  assert.deepEqual(
    normalizeRecipientList([' a@x.com', 'A@X.com', '', 'b@x.com']),
    ['a@x.com', 'b@x.com'],
  );
});

test('buildRecipientEdits returns null when nothing changed', () => {
  assert.equal(
    buildRecipientEdits(['contact@x.com'], { to: ['contact@x.com'], cc: [] }),
    null,
  );
});

test('buildRecipientEdits diffs base vs final per channel', () => {
  assert.deepEqual(
    buildRecipientEdits(['contact@x.com'], {
      to: ['ap@x.com'],
      cc: ['pm@x.com'],
    }),
    {
      to: { add: ['ap@x.com'], remove: ['contact@x.com'] },
      cc: { add: ['pm@x.com'] },
    },
  );
});

test('buildRecipientEdits omits empty channels', () => {
  assert.deepEqual(
    buildRecipientEdits(['contact@x.com'], {
      to: ['contact@x.com'],
      cc: ['pm@x.com'],
    }),
    { cc: { add: ['pm@x.com'] } },
  );
});
```

- [ ] **Step 2:** `cd tools/app-shell && node --test src/components/contract-ui/__tests__/recipientEdits.test.js` — FAIL (module missing).
- [ ] **Step 3: Implement**

```js
const EMAIL_PATTERN = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;

export function normalizeEmailAddress(value) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return '';
  const at = trimmed.lastIndexOf('@');
  if (at < 0) return trimmed;
  return trimmed.slice(0, at) + '@' + trimmed.slice(at + 1).toLowerCase();
}

export function isValidEmailAddress(value) {
  const normalized = normalizeEmailAddress(value);
  return normalized !== '' && EMAIL_PATTERN.test(normalized);
}

export function normalizeRecipientList(values) {
  const seen = new Set();
  const result = [];
  for (const value of values ?? []) {
    const normalized = normalizeEmailAddress(value);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

/**
 * Diffs the trusted base To list against the user's final channel lists.
 * Returns null when nothing changed so untouched sends stay byte-identical.
 */
export function buildRecipientEdits(baseRecipients, finalRecipientsByChannel) {
  const base = normalizeRecipientList(baseRecipients);
  const finalTo = normalizeRecipientList(finalRecipientsByChannel?.to);
  const finalCc = normalizeRecipientList(finalRecipientsByChannel?.cc);
  const baseKeys = new Set(base.map(a => a.toLowerCase()));
  const finalToKeys = new Set(finalTo.map(a => a.toLowerCase()));

  const toAdd = finalTo.filter(a => !baseKeys.has(a.toLowerCase()));
  const toRemove = base.filter(a => !finalToKeys.has(a.toLowerCase()));

  const edits = {};
  if (toAdd.length || toRemove.length) {
    edits.to = {};
    if (toAdd.length) edits.to.add = toAdd;
    if (toRemove.length) edits.to.remove = toRemove;
  }
  if (finalCc.length) {
    edits.cc = { add: finalCc };
  }
  return Object.keys(edits).length ? edits : null;
}
```

(Adjust the `buildRecipientEdits` no-change test if you keep `to: { add: [...] }` shape strict — the test above expects empty sub-keys omitted.)

- [ ] **Step 4:** Tests PASS. **Step 5: Commit** — `Feature ETP-4226: Add recipient edit helpers`

### Task 13: Command builder options

**Files:**
- Modify: `tools/app-shell/src/components/contract-ui/documentEmailSend.js:9-16` (`buildEmailContractCommand`) and `:120-148` (`sendDocumentEmail`)
- Test: `__tests__/documentEmailSend.test.js` (node:test, source-shape — the builder signature changes) and `__tests__/documentEmailSend.vitest.js`

- [ ] **Step 1: Failing tests** — three assertions:
  1. `buildEmailContractCommand('sales-invoice-send', 'ID1')` returns **exactly** `{ version: 'v1', recordId: 'ID1', intent: 'send-document', idempotencyKey: 'sales-invoice-send:ID1:send:v1' }` (deepEqual — byte-compat pin).
  2. With edits: `buildEmailContractCommand('sales-invoice-send', 'ID1', { recipientEdits: { cc: { add: ['a@x.com'] } } })` returns `{ version, recordId, intent, recipientEdits }` and has **no** `idempotencyKey` key.
  3. Provider fields are never forwarded: `buildEmailContractCommand('x-send', 'ID1', { recipientEdits: null, to: 'a@x.com', subject: 'hi' })` equals the no-edit command (unknown options ignored).

- [ ] **Step 2: Implement**

```js
export function buildEmailContractCommand(contractName, documentId, options = {}) {
  const command = {
    version: 'v1',
    recordId: documentId,
    intent: 'send-document',
  };
  if (options.recipientEdits) {
    // Server derives the idempotency key from the final recipient set.
    command.recipientEdits = options.recipientEdits;
    return command;
  }
  command.idempotencyKey = `${contractName}:${documentId}:send:v1`;
  return command;
}
```

and thread `recipientEdits` through `sendDocumentEmail({ ..., recipientEdits })` into the builder call at `documentEmailSend.js:145`.

- [ ] **Step 3:** `node --test src/components/contract-ui/__tests__/documentEmailSend.test.js && npx vitest run src/components/contract-ui/__tests__/documentEmailSend.vitest.js` — PASS.
- [ ] **Step 4: Commit** — `Feature ETP-4226: Add recipientEdits option to email command builder`

### Task 14: i18n keys

**Files:**
- Modify: `packages/app-shell-core/src/locales/en_US.json` and `es_ES.json` (BOTH, same commit)

- [ ] Add keys (next to the existing `sendModal*` block):

```json
"sendModalRecipientPlaceholder": "Add recipient and press Enter",
"sendModalRemoveRecipient": "Remove {email}",
"sendModalInvalidEmail": "Enter a valid email address",
"sendModalAddCc": "Add CC",
"sendModalCc": "CC",
"sendModalMaxRecipients": "Maximum {max} recipients across To and CC",
"sendModalNoToRecipient": "Add at least one To recipient"
```

```json
"sendModalRecipientPlaceholder": "Añade un destinatario y pulsa Enter",
"sendModalRemoveRecipient": "Quitar {email}",
"sendModalInvalidEmail": "Introduce un email válido",
"sendModalAddCc": "Añadir CC",
"sendModalCc": "CC",
"sendModalMaxRecipients": "Máximo {max} destinatarios entre Para y CC",
"sendModalNoToRecipient": "Añade al menos un destinatario en Para"
```

(Match the exact interpolation syntax used by `useUI()` in the existing keys — check `sendModalThrottled` which uses `{seconds}`.)

- [ ] Test: extend the i18n parity test if one exists (search `__tests__` for a locale-keys test); otherwise the SendDocumentModal vitest (Task 16) asserts the keys resolve.
- [ ] **Commit** — `Feature ETP-4226: Add recipient editor i18n keys`

### Task 15: `RecipientChipEditor` component

**Files:**
- Create: `tools/app-shell/src/components/contract-ui/RecipientChipEditor.jsx`
- Test: `tools/app-shell/src/components/contract-ui/__tests__/RecipientChipEditor.vitest.jsx`

Behavior contract (proposal §6.2):
- Props: `{ recipients, onChange, label, disabled, testIdPrefix }`.
- Renders one chip per address with a remove button (`aria-label` = `sendModalRemoveRecipient`).
- Text input adds on Enter, comma, or blur; valid input → appended via `normalizeRecipientList([...recipients, value])` then `onChange`; invalid non-empty input → stays in the input with inline `sendModalInvalidEmail` error and exposes validity upward via `onValidityChange(boolean)`.
- Duplicates (case-insensitive) are merged silently.
- `data-testid`: `{testIdPrefix}-input`, `{testIdPrefix}-chip-{email}`, `{testIdPrefix}-remove-{email}` (follow `docs/e2e-testing-guide.md` conventions).
- Styling: match the inline-style idiom of `SendDocumentModal.jsx` (plain `style` objects, 13px font, `#d1d5db` borders) — no new CSS files.

- [ ] **Step 1:** Failing vitest: renders initial chips; remove fires `onChange` without the address; Enter adds valid email; invalid email shows error and does not call `onChange`; comma-separated paste adds all valid entries.
- [ ] **Step 2:** Implement (controlled input + local `draft` state; ~120 lines).
- [ ] **Step 3:** `npx vitest run src/components/contract-ui/__tests__/RecipientChipEditor.vitest.jsx` — PASS.
- [ ] **Step 4: Commit** — `Feature ETP-4226: Add recipient chip editor component`

### Task 16: Wire the modal (default-on chip editor, CC row, send rules, `sendPolicy`)

**Files:**
- Modify: `tools/app-shell/src/components/contract-ui/SendDocumentModal.jsx` (`EmailFormPanel` at `:104`, state at `:236-264`, `handleSend` at `:306`, `sendDisabled` at `:337`)
- Test: `__tests__/SendDocumentModal.vitest.jsx`, `__tests__/SendDocumentModal.test.js`

Changes:
1. New prop `sendPolicy = {}` with defaults `{ editableRecipients: true, cc: true, maxRecipients: 10 }` (merge, don't replace).
2. Replace single `to` string state with `toRecipients` (array) + `ccRecipients` (array) + `hasInvalidDraft` (boolean from the editors). `loadBusinessPartnerEmail` seeds `toRecipients` with the resolved contact email; keep a `baseRecipients` ref of the server-proposed list for diffing.
3. `EmailFormPanel` renders `RecipientChipEditor` for To when `sendPolicy.editableRecipients !== false`, else the current read-only input (existing code path — keep it, this is the opt-out). CC row collapsed behind an "Add CC" link (`sendModalAddCc`), rendered only when `sendPolicy.cc !== false`.
4. Send disabled when (existing conditions) OR `hasInvalidDraft` OR `toRecipients.length === 0` OR `toRecipients.length + ccRecipients.length > sendPolicy.maxRecipients`; over-limit shows `sendModalMaxRecipients`; empty To shows `sendModalNoToRecipient`.
5. `handleSend` computes `recipientEdits = buildRecipientEdits(baseRecipients, { to: toRecipients, cc: ccRecipients })` and passes it through `sendDocumentFromModal` → `sendDocumentEmail` (add the parameter to both, `SendDocumentModal.jsx:45-67`).
6. Cross-channel mirror of backend precedence: adding an address to CC that exists in To merges into To (use the same case-insensitive key comparison as `recipientEdits.js`).

- [ ] **Step 1:** Failing vitests (delegate to test-generator) — the §11 frontend assertions 1–7 and 10: contact email appears as an editable chip by default; removable; add To/CC; invalid entry disables Send with message; empty To disables Send even with CC; over-max disables Send; fetch body contains `recipientEdits` only after edits and omits `idempotencyKey` then; `sendPolicy={{ editableRecipients: false }}` renders the read-only input; an untouched send POSTs a body deep-equal to the pre-change command (regression pin).
- [ ] **Step 2:** Implement. **Step 3:** `npx vitest run src/components/contract-ui/__tests__/SendDocumentModal.vitest.jsx && node --test src/components/contract-ui/__tests__/SendDocumentModal.test.js` — PASS, plus the full app-shell suite (`npx vitest run`) for mount-point regressions (`InvoicePreviewModal.vitest.jsx`, `artifacts/sales-invoice/custom/__tests__/InvoiceTopbarExtra.test.js`, `src/lib/__tests__/mockFetch.test.js`).
- [ ] **Step 4: Commit** — `Feature ETP-4226: Enable editable To/CC recipients by default in send modal`

### Task 17: Thread the PR 3 override into the modal mount points

Only needed for the generic `ListView.jsx` fallback (custom mount points inherit the default and pass nothing). 

- [ ] Read `tools/app-shell/src/components/contract-ui/ListView.jsx` where `sendDocument.enabled` is consumed; pass the spec's `sendDocument` object as `sendPolicy` to `SendDocumentModal` (one opaque prop — design rule §5.1.3).
- [ ] Vitest: a spec with `sendDocument: { editableRecipients: false }` reaching ListView renders the read-only input.
- [ ] **Commit** — `Feature ETP-4226: Forward sendDocument override from ListView to send modal`

**PR 4 gate:** §11 assertion 9 — run every flow's existing test suite and confirm untouched sends are byte-identical. `node cli/src/validate-pipeline.js` clean. Create PR via Clerk (expect the domain-boundary gate to require the cross-domain plan if PR 5 docs ride along).

---

# PR 5 — Docs + mocked e2e (same PR set as 4)

### Task 18: Policy amendments (proposal §10 — exact list)

- [ ] `docs/transactional-email-framework.md` — amend rule 6: document-send contracts accept recipient edits via the allowlisted `recipientEdits` field **by default**; backend authoritative; **reason capture waived** for document sends (stakeholder decision 2026-06-11); caller-provided recipients outside the family remain admin/support-only. Keep the generic-relay ban verbatim.
- [ ] `docs/email-contracts.md` — document the `recipientEdits` schema (use the §3 command example); record the versioning waiver: in-place v1 change allowed because the only client is the bundled app-shell deployed atomically; once external clients exist, request-shape changes require a new version + coexistence infrastructure first.
- [ ] `docs/document-email-contract-implementation.md` — replace "recipient fields are read-only" (body AND PR checklist) with editable-by-default semantics; add a multi-channel resolution tutorial section (extend Step 5).
- [ ] `docs/ops/transactional-email-security.md` — add a formally named **"Email Audit Redaction & Storage Policy"** section (hash-only persistence, plaintext domains allowed, no raw addresses in metrics labels) and the suppression/incident-review behavior for edited recipients.
- [ ] Commit — `Feature ETP-4226: Amend email framework policies for editable recipients`

### Task 19: Window guides

- [ ] Update `docs/generated-custom-windows/{sales-invoice,sales-order,purchase-order,sales-quotation,goods-shipment,goods-receipt}.md`: the send modal proposes contacts as editable To chips; users may remove/add To and add CC; validation and limits. Check `docs/generated-custom-windows/INDEX.md` for any other send-capable window added since the proposal.
- [ ] Commit — `Feature ETP-4226: Update send-capable window guides for editable recipients`

### Task 20: Mocked e2e

**Files:**
- Create: `e2e/tests/flows/send-recipient-chips.mocked.spec.js`

- [ ] **Step 1:** Read `docs/e2e-testing-guide.md` and `e2e/tests/flows/row-quick-actions.mocked.spec.js` (canonical reference) — then delegate the spec to test-generator.
- [ ] **Step 2:** Scenarios: open send modal from the sales-invoice row quick-action; default chip present; remove + add To + add CC; intercepted POST body contains `recipientEdits` and no `idempotencyKey`; invalid email disables Send; untouched send POSTs the legacy body. Also extend `e2e/tests/flows/i18n-etp4003.mocked.spec.js` with the new keys if that spec asserts the send modal strings.
- [ ] **Step 3:** Run per the e2e guide; PASS. **Step 4:** Commit — `Feature ETP-4226: Add mocked e2e for recipient chip editor`

---

## Execution order & gates

1. PR 1 → PR 2 (backend, sequential — PR 2 builds on PR 1 primitives). Inert: frontend never sends `recipientEdits` yet.
2. PR 3 (generator) — independent of 1–2, can run in parallel.
3. PR 4 + PR 5 land together (Documentation Freshness) and only after 1–3 are merged. PR 4 is the activation switch; its merge gate is the no-edit byte-compat regression suite (§11 assertion 9) across all flows in §2.2 of the proposal.
4. All branch/PR/Jira operations go through Clerk. Backend PRs and schema-forge PRs share the branch name `feature/ETP-4226`.
5. Post-merge monitoring (proposal §12.6): audit events for invalid edits, suppression, throttling, duplicates, provider failures.

## Spec coverage check

- §3 command shape → Tasks 7, 13. §4 algorithm → Tasks 1, 8. §5 overrides → Tasks 11, 16, 17. §6 UI → Tasks 12–16. §7.1 primitives → Tasks 1–6. §7.2 → Tasks 8–10. §9 edge cases: 1–2 existing (verify in Task 8 suite), 3–8/12–13 Task 8, 10–11 Task 9, 9/14–15 Task 5, 13a Task 10. §10 docs → Tasks 18–19. §11 frontend assertions 1–10 → Tasks 13, 16, 17; assertion 11 → Task 14. §11 backend 1–14 → Tasks 5–10. No BCC, no reason capture, single max limit, any-valid-email — encoded in Tasks 7, 8, 12.
