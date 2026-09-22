# ETP-5443 Subscription Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Feed the existing environment access policy from Stripe subscription events, and give the account owner a Subscription section that can reach the Stripe Customer Portal.

**Architecture:** Event interpretation lives in a pure class (`SubscriptionLifecycleApplier`) that maps a Stripe event to a status plus a due date and never touches the database — so the grace anchor and the null-due-date guard are unit-testable. The servlet does only correlation and persistence. Both new endpoints hang off `runWithPlatformAccount`, so no identifier is ever read from the request. Display detail is fetched live from Stripe; only the two fields the access policy needs are stored.

**Tech Stack:** Java 17 (Etendo/OBDal, JUnit 4, jettison JSON), React 18 + Vite (app-shell), Node test runner + Vitest, Playwright.

**Spec:** `docs/plans/2026-09-22-etp-5443-subscription-lifecycle-design.md`

## Global Constraints

- **Repos:** `com.etendoerp.go` at `etendo_core/modules/com.etendoerp.go` (Java); `etendo_schema_forge` at the repo root (React). Both are on branch `feature/ETP-5443`. Always target git with `git -C <absolute path>` — the repos are nested and share branch names.
- **Tests are delegated.** Per `CLAUDE.md`, every step that writes or fixes a test MUST be dispatched to the `test-generator` agent (Tester). Keep the TDD ordering below; delegate the test-writing step rather than doing it inline. Task 1 carries full test code as the worked exemplar — shape, imports, naming. The later test steps give Tester the exact inputs and assertions instead of the code, because Tester writes them and duplicating six files here would only go stale. If a test step's brief is not specific enough to write from, that is a plan defect: say so rather than inventing coverage.
- **Commit messages:** `Feature ETP-5443: <description>`, first line ≤ 80 chars, no `Co-Authored-By` (Git Police rejects it).
- **Never `--no-verify`** on commit or push.
- **Grace anchor:** the end of the paid period. `invoice.period_end`, falling back to `current_period_end`. Never the moment the charge failed.
- **Never write `PAST_DUE` without a due date.** `EnvironmentAccessPolicy.evaluate()` gives zero grace when `renewalDueAt` is null, so the customer is blocked instantly and silently.
- **Java:** builds need `JAVA_HOME=$(/usr/libexec/java_home -v 17)` (corretto-17). A different JDK produces classes Tomcat will not load, after reporting BUILD SUCCESSFUL.
- **React:** requests go through `useApiFetch` — a bare `fetch` fails `tools/app-shell/test/no-raw-fetch.test.js`. Amounts through `formatCurrency`, dates through `formatCalendarDate`. Every user-visible string needs a key in **both** `en_US.json` and `es_ES.json`. Every element a test queries needs a `data-testid`.

---

## File Structure

**`com.etendoerp.go`**

| File | Responsibility |
|---|---|
| `src/com/etendoerp/go/payment/SubscriptionEventOutcome.java` (new) | Value object: apply-or-ignore, target status, due date, reason |
| `src/com/etendoerp/go/payment/SubscriptionLifecycleApplier.java` (new) | Pure: Stripe event → outcome. No DB, no network |
| `src/com/etendoerp/go/rest/EtendoGoJwtServlet.java` (modify) | Dispatch, correlation, persistence, two endpoints |
| `src/com/etendoerp/go/payment/StripeCustomerPortalService.java` (modify) | Return URL points at `/account` |
| `src/com/etendoerp/go/payment/CheckoutRequestStore.java` (WIP, keep) | `findByStripeSubscription` / `findByStripeCustomer` |
| `src/com/etendoerp/go/payment/TenantEnvironmentLifecycleService.java` (WIP, keep) | Clears the due date when it is null |

**`etendo_schema_forge`**

| File | Responsibility |
|---|---|
| `tools/app-shell/src/lib/upgrade/api.js` (modify) | `getSubscription`, `createPortalSession` |
| `tools/app-shell/src/components/account/SubscriptionSection.jsx` (new) | The section UI |
| `tools/app-shell/src/pages/AccountSettingsPage.jsx` (modify) | Compose the section |
| `tools/app-shell/src/locales/{en_US,es_ES}.json` (modify) | Keys |

---

## Task 1: Pure lifecycle interpretation

**Files:**
- Create: `etendo_core/modules/com.etendoerp.go/src/com/etendoerp/go/payment/SubscriptionEventOutcome.java`
- Create: `etendo_core/modules/com.etendoerp.go/src/com/etendoerp/go/payment/SubscriptionLifecycleApplier.java`
- Test: `etendo_core/modules/com.etendoerp.go/src-test/src/com/etendoerp/go/payment/SubscriptionLifecycleApplierTest.java`

**Interfaces:**
- Consumes: `EnvironmentAccessPolicy.SubscriptionStatus` (existing enum: `NONE, CURRENT, PAST_DUE, EXPIRED, LEGACY_ENTITLEMENT`).
- Produces: `SubscriptionLifecycleApplier.evaluate(String type, JSONObject event) → SubscriptionEventOutcome`, with `outcome.isIgnored()`, `outcome.reason()`, `outcome.status()`, `outcome.dueAt()`. Task 2 depends on exactly these names.

- [ ] **Step 1: Write the failing tests** — delegate to `test-generator`

```java
package com.etendoerp.go.payment;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import java.time.Instant;

import org.codehaus.jettison.json.JSONObject;
import org.junit.Test;

public class SubscriptionLifecycleApplierTest {

  private final SubscriptionLifecycleApplier applier = new SubscriptionLifecycleApplier();

  private static JSONObject event(String json) throws Exception {
    return new JSONObject(json);
  }

  @Test
  public void invoicePaidClearsTheDueDate() throws Exception {
    SubscriptionEventOutcome outcome = applier.evaluate("invoice.paid",
        event("{\"data\":{\"object\":{\"subscription\":\"sub_1\"}}}"));
    assertTrue(outcome.isApplied());
    assertEquals(EnvironmentAccessPolicy.SubscriptionStatus.CURRENT, outcome.status());
    assertEquals(null, outcome.dueAt());
  }

  @Test
  public void paymentFailedAnchorsOnThePaidPeriodEnd() throws Exception {
    // period_end 2026-10-31T00:00:00Z = 1793750400
    SubscriptionEventOutcome outcome = applier.evaluate("invoice.payment_failed",
        event("{\"data\":{\"object\":{\"subscription\":\"sub_1\",\"period_end\":1793750400}}}"));
    assertTrue(outcome.isApplied());
    assertEquals(EnvironmentAccessPolicy.SubscriptionStatus.PAST_DUE, outcome.status());
    assertEquals(Instant.ofEpochSecond(1793750400L), outcome.dueAt());
  }

  @Test
  public void paymentFailedWithoutAPeriodEndIsIgnoredRatherThanBlocking() throws Exception {
    SubscriptionEventOutcome outcome = applier.evaluate("invoice.payment_failed",
        event("{\"data\":{\"object\":{\"subscription\":\"sub_1\"}}}"));
    assertTrue(outcome.isIgnored());
    assertEquals("missing period end", outcome.reason());
  }

  @Test
  public void cancelAtPeriodEndDoesNotChangeTheStatus() throws Exception {
    SubscriptionEventOutcome outcome = applier.evaluate("customer.subscription.updated",
        event("{\"data\":{\"object\":{\"id\":\"sub_1\",\"status\":\"active\","
            + "\"cancel_at_period_end\":true}}}"));
    assertTrue(outcome.isApplied());
    assertEquals(EnvironmentAccessPolicy.SubscriptionStatus.CURRENT, outcome.status());
  }

  @Test
  public void subscriptionDeletedExpires() throws Exception {
    SubscriptionEventOutcome outcome = applier.evaluate("customer.subscription.deleted",
        event("{\"data\":{\"object\":{\"id\":\"sub_1\"}}}"));
    assertTrue(outcome.isApplied());
    assertEquals(EnvironmentAccessPolicy.SubscriptionStatus.EXPIRED, outcome.status());
  }

  @Test
  public void anUnknownSubscriptionStatusIsIgnored() throws Exception {
    SubscriptionEventOutcome outcome = applier.evaluate("customer.subscription.updated",
        event("{\"data\":{\"object\":{\"id\":\"sub_1\",\"status\":\"incomplete\"}}}"));
    assertTrue(outcome.isIgnored());
  }
}
```

- [ ] **Step 2: Run the tests and confirm they fail**

```bash
cd /Users/sebastianbarrozo/Documents/work/epic/schema-forge/etendo_core
JAVA_HOME=$(/usr/libexec/java_home -v 17) ./gradlew test --tests "com.etendoerp.go.payment.SubscriptionLifecycleApplierTest"
```

Expected: compilation failure — `SubscriptionLifecycleApplier` does not exist.

- [ ] **Step 3: Write `SubscriptionEventOutcome`**

```java
/* Etendo License. */
package com.etendoerp.go.payment;

import java.time.Instant;

/**
 * The result of interpreting one Stripe lifecycle event, decided without touching the database.
 *
 * <p>An ignored outcome carries the reason verbatim into {@code ETGO_BILLING_EVENT}, so an event
 * that changed nothing is still findable afterwards.
 */
public final class SubscriptionEventOutcome {

  private final EnvironmentAccessPolicy.SubscriptionStatus status;
  private final Instant dueAt;
  private final String reason;

  private SubscriptionEventOutcome(EnvironmentAccessPolicy.SubscriptionStatus status,
      Instant dueAt, String reason) {
    this.status = status;
    this.dueAt = dueAt;
    this.reason = reason;
  }

  /** The event maps to a state transition. */
  public static SubscriptionEventOutcome apply(EnvironmentAccessPolicy.SubscriptionStatus status,
      Instant dueAt) {
    return new SubscriptionEventOutcome(status, dueAt, null);
  }

  /** The event is understood but changes nothing; {@code reason} is recorded for audit. */
  public static SubscriptionEventOutcome ignore(String reason) {
    return new SubscriptionEventOutcome(null, null, reason);
  }

  public boolean isApplied() {
    return status != null;
  }

  public boolean isIgnored() {
    return status == null;
  }

  public EnvironmentAccessPolicy.SubscriptionStatus status() {
    return status;
  }

  /** Grace anchor. Null means "clear the stored due date", never "block immediately". */
  public Instant dueAt() {
    return dueAt;
  }

  public String reason() {
    return reason;
  }
}
```

- [ ] **Step 4: Write `SubscriptionLifecycleApplier`**

```java
/* Etendo License. */
package com.etendoerp.go.payment;

import java.time.Instant;

import org.apache.commons.lang3.StringUtils;
import org.codehaus.jettison.json.JSONObject;

/**
 * Maps a Stripe subscription or invoice event to a target access state.
 *
 * <p>Deliberately pure: no database, no network, no clock. The grace anchor and the
 * never-block-without-a-due-date rule are the two decisions in this task that can lock a paying
 * customer out of their own data, so they live where a unit test can pin them.
 */
public class SubscriptionLifecycleApplier {

  static final String INVOICE_PAID = "invoice.paid";
  static final String INVOICE_PAYMENT_FAILED = "invoice.payment_failed";
  static final String SUBSCRIPTION_UPDATED = "customer.subscription.updated";
  static final String SUBSCRIPTION_DELETED = "customer.subscription.deleted";

  private static final String MISSING_PERIOD_END = "missing period end";

  /**
   * @param type Stripe event type
   * @param event the full event envelope
   * @return the transition to apply, or an ignore carrying the audit reason
   */
  public SubscriptionEventOutcome evaluate(String type, JSONObject event) {
    JSONObject data = event == null ? null : event.optJSONObject("data");
    JSONObject object = data == null ? null : data.optJSONObject("object");
    if (object == null) {
      return SubscriptionEventOutcome.ignore("missing event object");
    }
    switch (StringUtils.trimToEmpty(type)) {
      case INVOICE_PAID:
        return SubscriptionEventOutcome.apply(
            EnvironmentAccessPolicy.SubscriptionStatus.CURRENT, null);
      case INVOICE_PAYMENT_FAILED:
        return pastDue(object);
      case SUBSCRIPTION_DELETED:
        return SubscriptionEventOutcome.apply(
            EnvironmentAccessPolicy.SubscriptionStatus.EXPIRED, null);
      case SUBSCRIPTION_UPDATED:
        return fromSubscriptionStatus(object);
      default:
        return SubscriptionEventOutcome.ignore("unhandled event type");
    }
  }

  /**
   * Reads the subscription's own status.
   *
   * <p>{@code cancel_at_period_end} is deliberately not consulted: a scheduled cancellation keeps
   * the subscription active, and access must continue until Stripe sends the delete at the period
   * boundary. The flag is display-only and read live by the Subscription page.
   */
  private SubscriptionEventOutcome fromSubscriptionStatus(JSONObject object) {
    String status = StringUtils.trimToEmpty(object.optString("status", ""));
    switch (status) {
      case "active":
      case "trialing":
        return SubscriptionEventOutcome.apply(
            EnvironmentAccessPolicy.SubscriptionStatus.CURRENT, null);
      case "past_due":
      case "unpaid":
        return pastDue(object);
      case "canceled":
        return SubscriptionEventOutcome.apply(
            EnvironmentAccessPolicy.SubscriptionStatus.EXPIRED, null);
      default:
        return SubscriptionEventOutcome.ignore("unhandled subscription status");
    }
  }

  /**
   * Builds the overdue transition, anchored on the end of the period the customer already paid for.
   *
   * <p>Without that anchor the policy grants no grace at all, so an event that cannot supply one is
   * ignored rather than applied half-way.
   */
  private SubscriptionEventOutcome pastDue(JSONObject object) {
    Instant periodEnd = epochSeconds(object, "period_end");
    if (periodEnd == null) {
      periodEnd = epochSeconds(object, "current_period_end");
    }
    if (periodEnd == null) {
      return SubscriptionEventOutcome.ignore(MISSING_PERIOD_END);
    }
    return SubscriptionEventOutcome.apply(
        EnvironmentAccessPolicy.SubscriptionStatus.PAST_DUE, periodEnd);
  }

  private Instant epochSeconds(JSONObject object, String field) {
    long seconds = object.optLong(field, 0L);
    return seconds > 0L ? Instant.ofEpochSecond(seconds) : null;
  }
}
```

- [ ] **Step 5: Run the tests and confirm they pass**

```bash
cd /Users/sebastianbarrozo/Documents/work/epic/schema-forge/etendo_core
JAVA_HOME=$(/usr/libexec/java_home -v 17) ./gradlew test --tests "com.etendoerp.go.payment.SubscriptionLifecycleApplierTest"
```

Expected: 6 passing.

- [ ] **Step 6: Commit**

```bash
GO=/Users/sebastianbarrozo/Documents/work/epic/schema-forge/etendo_core/modules/com.etendoerp.go
git -C $GO add src/com/etendoerp/go/payment/SubscriptionEventOutcome.java \
  src/com/etendoerp/go/payment/SubscriptionLifecycleApplier.java \
  src-test/src/com/etendoerp/go/payment/SubscriptionLifecycleApplierTest.java
git -C $GO commit -m "Feature ETP-5443: Interpret the Stripe subscription lifecycle events"
```

---

## Task 2: Correlate the event to an environment and persist

**Files:**
- Modify: `etendo_core/modules/com.etendoerp.go/src/com/etendoerp/go/rest/EtendoGoJwtServlet.java` (`applyCheckoutEvent`, around line 700)
- Test: `etendo_core/modules/com.etendoerp.go/src-test/src/com/etendoerp/go/payment/SubscriptionLifecycleCorrelationTest.java`

**Interfaces:**
- Consumes: `SubscriptionLifecycleApplier.evaluate(...)` from Task 1; `CheckoutRequestStore.findByStripeSubscription(String)` and `findByStripeCustomer(String)` (already present, uncommitted); `TenantEnvironmentLifecycleService.updateSubscriptionStatus(String clientId, EnvironmentAccessPolicy.SubscriptionStatus, Instant)` returning `boolean`.
- Produces: nothing new consumed by later tasks.

- [ ] **Step 1: Write the failing tests** — delegate to `test-generator`

Cover, with the store and the lifecycle service stubbed:
1. `invoice.payment_failed` for a known subscription → `updateSubscriptionStatus(clientId, PAST_DUE, periodEnd)` called once, event marked applied.
2. Subscription unknown, customer known → resolved through the customer fallback.
3. Both unknown → `markIgnored(eventId, "unresolved subscription")`, and `updateSubscriptionStatus` never called.
4. A `CheckoutRequest` whose `createdClient` is null → ignored, not applied.
5. The applier returning ignore → `markIgnored` with that reason, no persistence.
6. **Replay:** the same `eventId` delivered twice applies exactly once. Replay protection already lives upstream — `checkoutWebhookProcessor.evaluate(...)` returns `DUPLICATE` and `handleCheckoutWebhook` returns before dispatch — so this test asserts the new path inherits it rather than adding its own. Drive it through `handleCheckoutWebhook`, not through `applySubscriptionLifecycle`, or it proves nothing.

- [ ] **Step 2: Run and confirm failure**

```bash
cd /Users/sebastianbarrozo/Documents/work/epic/schema-forge/etendo_core
JAVA_HOME=$(/usr/libexec/java_home -v 17) ./gradlew test --tests "com.etendoerp.go.payment.SubscriptionLifecycleCorrelationTest"
```

- [ ] **Step 3: Split the dispatch**

Replace the opening guard of `applyCheckoutEvent`:

```java
  private void applyCheckoutEvent(String eventId, String type, JSONObject event) {
    if (CHECKOUT_PAID_EVENT_TYPES.contains(type)) {
      applyCheckoutPaid(eventId, type, event);
      return;
    }
    if (SUBSCRIPTION_EVENT_TYPES.contains(type)) {
      applySubscriptionLifecycle(eventId, type, event);
      return;
    }
    billingEventStore.markIgnored(eventId, "unhandled event type");
  }
```

Move the existing body verbatim into a new `applyCheckoutPaid(String eventId, String type, JSONObject event)` — including its comments. Nothing in the payment path changes.

- [ ] **Step 4: Add the lifecycle path**

```java
  /**
   * Applies a subscription or invoice lifecycle event to the owned environment.
   *
   * <p>These events carry no {@code request_id}: that metadata travels only on the checkout
   * session. They arrive keyed by the subscription, which is why the correlation walks
   * subscription first and customer second.
   *
   * <p>An event that resolves to no environment is ignored, never blocking. A tenant with no
   * subscription row must stay reachable — that is what keeps grandfathered and free tenants safe.
   */
  private void applySubscriptionLifecycle(String eventId, String type, JSONObject event) {
    SubscriptionEventOutcome outcome = subscriptionLifecycleApplier.evaluate(type, event);
    if (outcome.isIgnored()) {
      billingEventStore.markIgnored(eventId, outcome.reason());
      return;
    }
    JSONObject data = event.optJSONObject("data");
    JSONObject object = data == null ? null : data.optJSONObject("object");
    String subscriptionId = type.startsWith("customer.subscription.")
        ? object.optString("id", "")
        : object.optString("subscription", "");
    CheckoutRequest purchase = checkoutRequestStore.findByStripeSubscription(subscriptionId);
    if (purchase == null) {
      purchase = checkoutRequestStore.findByStripeCustomer(object.optString("customer", ""));
    }
    if (purchase == null || purchase.getCreatedClient() == null) {
      billingEventStore.markIgnored(eventId, "unresolved subscription");
      return;
    }
    boolean stored = tenantEnvironmentLifecycleService.updateSubscriptionStatus(
        purchase.getCreatedClient().getId(), outcome.status(), outcome.dueAt());
    if (!stored) {
      billingEventStore.markFailed(eventId, "Could not store the subscription projection");
      return;
    }
    billingEventStore.markApplied(eventId);
    log.info("Subscription lifecycle event '{}' ({}) applied", eventId, type);
  }
```

Add the field next to the existing collaborators (around line 316):

```java
  SubscriptionLifecycleApplier subscriptionLifecycleApplier = new SubscriptionLifecycleApplier();
```

If `tenantEnvironmentLifecycleService` is not already a field on the servlet, add it the same way.

- [ ] **Step 5: Run the tests and confirm they pass**

- [ ] **Step 6: Commit**

```bash
git -C $GO add src/com/etendoerp/go/rest/EtendoGoJwtServlet.java \
  src/com/etendoerp/go/payment/CheckoutRequestStore.java \
  src/com/etendoerp/go/payment/TenantEnvironmentLifecycleService.java \
  src-test/src/com/etendoerp/go/payment/SubscriptionLifecycleCorrelationTest.java
git -C $GO commit -m "Feature ETP-5443: Route lifecycle webhooks to the owned environment"
```

---

## Task 3: Pin the grace boundary

**Files:**
- Test: `etendo_core/modules/com.etendoerp.go/src-test/src/com/etendoerp/go/payment/EnvironmentAccessPolicyTest.java` (extend)

No production change. This task exists because the boundary is the behaviour a regression would
break silently, and the existing policy has no test on either side of it.

- [ ] **Step 1: Add the boundary tests** — delegate to `test-generator`

Against `EnvironmentAccessPolicy.evaluate(...)` with a `PRODUCTIVE` environment, `activeMembership = true`, `PAST_DUE`, `renewalDueAt = T`, and a 15-day configuration:

1. `now = T + 14d 23h` → `ALLOWED`
2. `now = T + 15d` → `SUBSCRIPTION_REQUIRED`
3. `renewalDueAt = null` → `SUBSCRIPTION_REQUIRED` (documents the zero-grace behaviour the writer must never trigger)
4. `CURRENT` with a past `renewalDueAt` → `ALLOWED` (a stale due date must not block a paying customer)

- [ ] **Step 2: Run and confirm they pass against today's implementation**

```bash
cd /Users/sebastianbarrozo/Documents/work/epic/schema-forge/etendo_core
JAVA_HOME=$(/usr/libexec/java_home -v 17) ./gradlew test --tests "com.etendoerp.go.payment.EnvironmentAccessPolicyTest"
```

If any fails, stop: the policy does not behave as the spec assumes and the design needs revisiting.

- [ ] **Step 3: Commit**

```bash
git -C $GO add src-test/src/com/etendoerp/go/payment/EnvironmentAccessPolicyTest.java
git -C $GO commit -m "Feature ETP-5443: Pin both sides of the grace boundary"
```

---

## Task 4: The two endpoints

**Files:**
- Modify: `etendo_core/modules/com.etendoerp.go/src/com/etendoerp/go/rest/EtendoGoJwtServlet.java`
- Modify: `etendo_core/modules/com.etendoerp.go/src/com/etendoerp/go/payment/StripeCustomerPortalService.java`
- Test: `etendo_core/modules/com.etendoerp.go/src-test/src/com/etendoerp/go/payment/StripeCustomerPortalServiceTest.java`

**Interfaces:**
- Produces: `GET /sws/go/billing/subscription` → `{hasSubscription, plan, amountMinor, currency, status, renewalAt, cancelAtPeriodEnd, graceEndsAt, graceDaysRemaining}`. `POST /sws/go/billing/subscription/portal` → `{url}`. Task 5 consumes both shapes verbatim.

- [ ] **Step 1: Point the portal return URL at the section**

In `StripeCustomerPortalService.createSession`:

```java
    String form = buildForm(customerId, PublicUrlResolver.resolveConfiguredAppBaseUrl() + "/account");
```

- [ ] **Step 2: Write the failing tests** — delegate to `test-generator`

For `buildForm`: the return URL ends in `/account`, and both values are URL-encoded.
For the handlers, assert that neither reads any identifier from the request — the customer id
used is the one on the authenticated account's row, even when the body supplies a different one.

- [ ] **Step 3: Implement `handleBillingSubscription`**

Follow `handleBillingOverview` exactly — `runWithPlatformAccount`, system context, `writeResponse`/`writeError`, `JSONException` handling. Resolve the account's purchase via `checkoutRequestStore.findForAccount(...)`, take the one carrying a `stripeSubscription`, fetch the detail from Stripe, and merge the stored status, due date and remaining grace days from `tenantEnvironmentLifecycleService.resolve(clientId)` plus `configuration()`.

An account with no subscription returns `{"hasSubscription": false}` and HTTP 200 — never a 404. Free and grandfathered accounts must still render the page.

- [ ] **Step 4: Implement `handleBillingPortal`**

```java
  private void handleBillingPortal(HttpServletRequest request, HttpServletResponse response)
      throws IOException {
    runWithPlatformAccount(request, response, "billing-portal", account -> {
      // The customer id comes from the account's own row. Nothing is read from the request body:
      // that is what stops a browser from opening someone else's billing portal.
      CheckoutRequest purchase = checkoutRequestStore.findBillableForAccount(account.getId(),
          account.getEmail());
      if (purchase == null || StringUtils.isBlank(purchase.getStripeCustomer())) {
        writeError(response, HttpServletResponse.SC_NOT_FOUND, "NO_SUBSCRIPTION",
            "No subscription for this account", "No subscription for this account");
        return;
      }
      try {
        JSONObject session = stripeCustomerPortalService.createSession(purchase.getStripeCustomer());
        JSONObject result = new JSONObject();
        result.put("url", session.optString("url", ""));
        writeResponse(response, HttpServletResponse.SC_OK, result);
      } catch (IllegalStateException e) {
        writeError(response, HttpServletResponse.SC_SERVICE_UNAVAILABLE, CHECKOUT_NOT_CONFIGURED,
            CHECKOUT_NOT_CONFIGURED_MESSAGE, CHECKOUT_NOT_CONFIGURED_MESSAGE);
      } catch (IOException e) {
        log.error("Could not create a billing portal session", e);
        writeError(response, HttpServletResponse.SC_BAD_GATEWAY, "BILLING_PROVIDER_ERROR",
            "Unable to open the billing portal", "Unable to open the billing portal");
      }
    });
  }
```

Add `findBillableForAccount(String accountId, String email)` to `CheckoutRequestStore` — the account's most recent purchase with a non-null `stripeCustomer` — reusing the `findByProviderField` shape already there.

- [ ] **Step 5: Run the tests, then compile the module**

```bash
cd /Users/sebastianbarrozo/Documents/work/epic/schema-forge/etendo_core
JAVA_HOME=$(/usr/libexec/java_home -v 17) ./gradlew test --tests "com.etendoerp.go.payment.*"
```

- [ ] **Step 6: Commit**

```bash
git -C $GO add -A src/com/etendoerp/go src-test/src/com/etendoerp/go
git -C $GO commit -m "Feature ETP-5443: Serve the subscription detail and the portal session"
```

---

## Task 5: API clients

**Files:**
- Modify: `tools/app-shell/src/lib/upgrade/api.js`
- Test: `tools/app-shell/src/lib/__tests__/upgrade-api.test.js` (extend)

**Interfaces:**
- Produces: `getSubscription(fetchImpl, baseUrl, token)` and `createPortalSession(fetchImpl, baseUrl, token)`. Task 6 consumes both.

- [ ] **Step 1: Write the failing tests** — delegate to `test-generator`

Mirror the existing `getBillingOverview` tests: URL, `Authorization` header, and the non-2xx path.

- [ ] **Step 2: Implement, following `getBillingOverview` verbatim**

```js
export async function getSubscription(fetchImpl, baseUrl, token) {
  const response = await fetchImpl(`${baseUrl}/sws/go/billing/subscription`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('subscription-unavailable');
  return response.json();
}

export async function createPortalSession(fetchImpl, baseUrl, token) {
  const response = await fetchImpl(`${baseUrl}/sws/go/billing/subscription/portal`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('portal-unavailable');
  return response.json();
}
```

- [ ] **Step 3: Run the tests**

```bash
cd /Users/sebastianbarrozo/Documents/work/epic/schema-forge
node --test tools/app-shell/src/lib/__tests__/upgrade-api.test.js
```

- [ ] **Step 4: Commit**

```bash
SF=/Users/sebastianbarrozo/Documents/work/epic/schema-forge
git -C $SF add tools/app-shell/src/lib/upgrade/api.js tools/app-shell/src/lib/__tests__/upgrade-api.test.js
git -C $SF commit -m "Feature ETP-5443: Add the subscription API clients"
```

---

## Task 6: The Subscription section

**Files:**
- Create: `tools/app-shell/src/components/account/SubscriptionSection.jsx`
- Modify: `tools/app-shell/src/pages/AccountSettingsPage.jsx`
- Modify: `tools/app-shell/src/locales/en_US.json`, `tools/app-shell/src/locales/es_ES.json`
- Test: `tools/app-shell/src/components/account/__tests__/SubscriptionSection.vitest.jsx`

**Interfaces:**
- Consumes: `getSubscription` / `createPortalSession` from Task 5, and the response shape from Task 4.

- [ ] **Step 1: Add the i18n keys to BOTH locale files**

`subscriptionTitle`, `subscriptionPlan`, `subscriptionStatus`, `subscriptionRenewsOn`,
`subscriptionCancelsOn`, `subscriptionGraceRemaining`, `subscriptionManage`,
`subscriptionNone`, `subscriptionUnavailable`. A key present in only one file is a bug.

- [ ] **Step 2: Write the failing component tests** — delegate to `test-generator`

Query by `data-testid` only — never by text (repo convention). Cover: the no-subscription state,
the active state showing plan/amount/renewal, the past-due state showing remaining grace days, the
cancellation-scheduled state, and that clicking Manage navigates to the returned portal URL.

- [ ] **Step 3: Implement `SubscriptionSection.jsx`**

Follow `SecuritySection.jsx` for structure and props. Use `useUI()` for labels,
`formatCurrency(currency, amountMinor / 100)` for the amount and `formatCalendarDate` for the
dates. Put a `data-testid` on every element the tests query.

**Deliberate deviation from the Global Constraints' `useApiFetch` rule:** `SubscriptionSection`
calls `getSubscription`/`createPortalSession` with the global `fetch` and the account/platform
token (`getCheckoutToken()` from `tools/app-shell/src/lib/upgrade/api.js`), each call marked with
a `raw-fetch-ok` comment for `tools/app-shell/test/no-raw-fetch.test.js` — not `useApiFetch`. This
mirrors `UpgradePage.jsx`, which follows the same pattern for every billing call: billing is an
account-level operation and must work with the account/platform token even while the ERP session
is paywalled, whereas `useApiFetch` sends the environment/ERP session token. Reachability while
blocked (§3.2 of the design) depends on this, not on a special case in the component.

- [ ] **Step 4: Compose it into `AccountSettingsPage.jsx`**

```jsx
import { SubscriptionSection } from '@/components/account/SubscriptionSection.jsx';
```

and render it inside `loadedBody`, directly after `<SecuritySection … />`, with
`data-testid="SubscriptionSection__account"`.

- [ ] **Step 5: Run the tests**

```bash
cd /Users/sebastianbarrozo/Documents/work/epic/schema-forge
npx vitest run tools/app-shell/src/components/account/__tests__/SubscriptionSection.vitest.jsx
```

- [ ] **Step 6: Commit**

```bash
git -C $SF add tools/app-shell/src/components/account tools/app-shell/src/pages/AccountSettingsPage.jsx \
  tools/app-shell/src/locales/en_US.json tools/app-shell/src/locales/es_ES.json
git -C $SF commit -m "Feature ETP-5443: Add the Subscription section to account settings"
```

---

## Task 7: End-to-end flow and documentation

**Files:**
- Create: `e2e/tests/flows/subscription-lifecycle.mocked.spec.js`
- Modify: `docs/index.md`

- [ ] **Step 1: Read the E2E guide first**

`docs/e2e-testing-guide.md`, and the canonical mocked reference
`e2e/tests/flows/row-quick-actions.mocked.spec.js`. Mandatory before writing a spec.

- [ ] **Step 2: Write the mocked E2E spec** — delegate to `test-generator`

Owner opens `/account`, sees the active subscription, clicks Manage, and is sent to the mocked
portal URL. Then the past-due variant showing the remaining grace days.

- [ ] **Step 3: Run it**

```bash
cd /Users/sebastianbarrozo/Documents/work/epic/schema-forge
npx playwright test e2e/tests/flows/subscription-lifecycle.mocked.spec.js
```

Confirm the server on :3100 is serving **this** checkout — Playwright has no `webServer` block and
inherits whatever owns the port, so a stale server from another worktree silently passes the wrong
tree.

- [ ] **Step 4: Link the design doc from the docs index**

Add `docs/plans/2026-09-22-etp-5443-subscription-lifecycle-design.md` to `docs/index.md`.

- [ ] **Step 5: Commit**

```bash
git -C $SF add e2e/tests/flows/subscription-lifecycle.mocked.spec.js docs/index.md
git -C $SF commit -m "Feature ETP-5443: Cover the subscription flow end to end"
```

---

## Verification before handing to REVIEW

- [ ] `JAVA_HOME=$(/usr/libexec/java_home -v 17) ./gradlew test --tests "com.etendoerp.go.*"` from `etendo_core` — green
- [ ] `make test` in `schema_forge` — green
- [ ] `npx sf-validate-pipeline` — 0 violations
- [ ] Both locale files carry every new key
- [ ] `tools/app-shell/test/no-raw-fetch.test.js` and `auth-header-policy.test.js` — green
- [ ] A replayed lifecycle event applies exactly once
- [ ] `PAST_DUE` is never stored without a due date
