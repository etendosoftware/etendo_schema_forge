# ETP-4298 — Generic Post/Unpost Capability (Plan 1 of 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a generic, reusable manual **Post** and **Unpost** (descontabilizar) action to Etendo GO document windows, wired through NEO Headless and the existing Etendo posting engine.

**Architecture:** A single shared `DocumentPostingService` (Java, in `com.etendoerp.go`) performs posting via `AcctServer` and unposting via `ResetAccounting`. NEO routes action endpoints (`POST /{spec}/{entity}/{id}/action/{post|unpost}`) by the entity's `Java_Qualifier`, so each in-scope entity's `NeoHandler.handle()` delegates the `post`/`unpost` action to that service (a one-line branch for the 6 windows that already have a handler; a shared `@Named("document-posting")` handler for the 1 that doesn't). The frontend gets a new declarative `menuAction` kind (`"action"`) plus a `useNeoAction` hook that calls the endpoint.

**Tech Stack:** Java 11 / CDI (Weld) / Openbravo DAL in `com.etendoerp.go`; Node.js generators (`cli/src/generate-frontend.js`); React 18 + Vite app-shell; Vitest; Playwright; JUnit 4 + Mockito.

## Global Constraints

- **Language:** ALL versioned content in English (code, comments, commits, tests, docs).
- **No window-specific logic in generic Java services** — custom behavior lives in `NeoHandler` beans / the shared service.
- **CDI:** `NeoHandler` beans annotated `@Named(...)` **only** — never `@ApplicationScoped`/normal scope (Weld proxy drops the non-`@Inherited` `@Named` → `lookupHandler()` skips it). `@Named`-only defaults to `@Dependent`.
- **Posting `force = false`** — never force-repost an already-posted document.
- **Roles ungated** this slice (GO has no role model); annotate intended gating as `TODO(roles): Post=financiero+admin; Unpost=admin` in code.
- **i18n:** every user-visible string added to BOTH `packages/app-shell-core/src/locales/en_US.json` and `es_ES.json`. No hardcoded UI strings.
- **Never edit generated files** (`artifacts/*/generated/`) — fix generators; regenerate via `make regen ONLY=<window>`.
- **Never edit `contract.json` directly** — edit `decisions.json`, then regenerate.
- **Commits:** `Feature ETP-4298: <desc>` (first line ≤ 80 chars, NO `Co-Authored-By`). All git/branch/PR ops delegated to Clerk.
- **After any `push-to-neo.js`:** run `./gradlew export.database` in Etendo root.
- **Etendo GO module path:** `/Users/gremiger/workspaces/etendogoclean/etendo/modules/com.etendoerp.go`.
- **Schema Forge path:** `/Users/gremiger/workspaces/etendogoclean/etendo/etendo_schema_forge`.

## Key Verbatim Interfaces (from source)

```java
// NeoHandler.java
public interface NeoHandler {
  NeoResponse handle(NeoContext context);
  default NeoResponse afterHandle(NeoContext context) { return null; }
  default NeoResponse afterCallout(NeoContext context) { return null; }
}

// NeoContext.java — relevant getters
public NeoEndpointType getEndpointType();   // CRUD, SELECTOR, ACTION, EVALUATE_DISPLAY, CALLOUT, DEFAULTS
public String getFieldName();                // carries the action name for ACTION endpoints ("post"/"unpost")
public String getRecordId();
public JSONObject getRequestBody();
public Map<String,String> getQueryParams();
public Tab getAdTab();                        // AD tab → getTable().getId() gives AD_Table_ID
public SFEntity getSfEntity();
public OBContext getObContext();

// NeoResponse.java — factories
public static NeoResponse ok(JSONObject data);
public static NeoResponse error(int status, String message);

// AcctServer (org.openbravo.erpCommon.ad_forms) — static factory + post
public static AcctServer get(String AD_Table_ID, String AD_Client_ID, String AD_Org_ID, ConnectionProvider conn);
public boolean post(String strClave, boolean force, VariablesSecureApp vars,
                    ConnectionProvider conn, Connection con) throws ServletException;
// public field: int errors;

// ResetAccounting (org.openbravo.financial)
public static HashMap<String,Integer> delete(String adClientId, String adOrgId,
    String adTableId, String recordId, String strdatefrom, String strdateto);
```

Real posting call pattern (verbatim from `PostDocumentTest.java`):
```java
ConnectionProvider conn = getConnectionProvider();
Connection con = conn.getTransactionConnection();
AcctServer acct = AcctServer.get(tableId, CLIENT_ID, orgId, conn);
if (acct == null) { conn.releaseRollbackConnection(con); return; }
if (!acct.post(keyId, false, new VariablesSecureApp(USER_ID, CLIENT_ID, orgId), conn, con) || acct.errors != 0) {
  conn.releaseRollbackConnection(con); return;
}
conn.releaseCommitConnection(con);
```

---

### Task 1: `DocumentPostingService` — `post()`

**Files:**
- Create: `modules/com.etendoerp.go/src/com/etendoerp/go/schemaforge/handlers/DocumentPostingService.java`
- Test: `modules/com.etendoerp.go/src-test/src/com/etendoerp/go/schemaforge/handlers/DocumentPostingServiceTest.java`

**Interfaces:**
- Produces: `PostResult post(String adTableId, String recordId)` returning `record PostResult(boolean ok, String message)`. Posts with `force=false`; commits on success, rolls back on failure or `acct.errors != 0`.

- [ ] **Step 1: Write the failing test** (`DocumentPostingServiceTest.java`)

```java
package com.etendoerp.go.schemaforge.handlers;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.when;

import java.sql.Connection;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.mockito.MockedStatic;
import org.mockito.junit.MockitoJUnitRunner;
import org.openbravo.dal.core.OBContext;
import org.openbravo.database.ConnectionProvider;
import org.openbravo.erpCommon.ad_forms.AcctServer;

@RunWith(MockitoJUnitRunner.Silent.class)
public class DocumentPostingServiceTest {

  @Test
  public void postReturnsOkWhenAcctServerSucceeds() throws Exception {
    DocumentPostingService svc = new DocumentPostingService();
    AcctServer acct = org.mockito.Mockito.mock(AcctServer.class);
    acct.errors = 0;
    when(acct.post(eq("rec-1"), eq(false), any(), any(), any())).thenReturn(true);

    try (MockedStatic<AcctServer> acctStatic = mockStatic(AcctServer.class)) {
      acctStatic.when(() -> AcctServer.get(eq("259"), anyString(), anyString(), any(ConnectionProvider.class)))
          .thenReturn(acct);
      DocumentPostingService.PostResult r = svc.post("259", "rec-1");
      assertTrue(r.ok());
    }
  }

  @Test
  public void postReturnsFailureWhenAcctServerReportsErrors() throws Exception {
    DocumentPostingService svc = new DocumentPostingService();
    AcctServer acct = org.mockito.Mockito.mock(AcctServer.class);
    acct.errors = 2;
    when(acct.post(eq("rec-1"), eq(false), any(), any(), any())).thenReturn(true);

    try (MockedStatic<AcctServer> acctStatic = mockStatic(AcctServer.class)) {
      acctStatic.when(() -> AcctServer.get(anyString(), anyString(), anyString(), any(ConnectionProvider.class)))
          .thenReturn(acct);
      DocumentPostingService.PostResult r = svc.post("259", "rec-1");
      assertFalse(r.ok());
    }
  }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run (from Etendo root): `./gradlew test --tests "com.etendoerp.go.schemaforge.handlers.DocumentPostingServiceTest"`
Expected: FAIL — `DocumentPostingService` does not exist / cannot compile.

- [ ] **Step 3: Write minimal implementation** (`DocumentPostingService.java`)

```java
package com.etendoerp.go.schemaforge.handlers;

import java.sql.Connection;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import org.openbravo.base.secureApp.VariablesSecureApp;
import org.openbravo.dal.core.OBContext;
import org.openbravo.database.ConnectionProvider;
import org.openbravo.erpCommon.ad_forms.AcctServer;
import org.openbravo.erpCommon.utility.SequenceIdData;
import org.openbravo.service.db.DalConnectionProvider;

/**
 * Shared post/unpost core for Etendo GO. NOT a NeoHandler — reused by every document-window
 * handler and by the Not Posted Documents bulk Post.
 *
 * TODO(roles): Post=financiero+admin; Unpost=admin — gate when GO gains a role model.
 */
public class DocumentPostingService {

  private static final Logger log = LogManager.getLogger(DocumentPostingService.class);

  /** Result of a post/unpost attempt. */
  public record PostResult(boolean ok, String message) { }

  /**
   * Post a single document with force=false (only posts not-yet-posted docs).
   * Manages its own transaction connection: commit on success, rollback on failure.
   */
  public PostResult post(String adTableId, String recordId) {
    OBContext ctx = OBContext.getOBContext();
    String clientId = ctx.getCurrentClient().getId();
    String orgId = ctx.getCurrentOrganization().getId();
    ConnectionProvider conn = new DalConnectionProvider(false);
    Connection con = null;
    try {
      con = conn.getTransactionConnection();
      AcctServer acct = AcctServer.get(adTableId, clientId, orgId, conn);
      if (acct == null) {
        conn.releaseRollbackConnection(con);
        return new PostResult(false, "No accounting engine for table " + adTableId);
      }
      VariablesSecureApp vars = new VariablesSecureApp(ctx.getUser().getId(), clientId, orgId);
      boolean posted = acct.post(recordId, false, vars, conn, con);
      if (!posted || acct.errors != 0) {
        conn.releaseRollbackConnection(con);
        return new PostResult(false, acct.errorMessage != null ? acct.errorMessage : "Posting failed");
      }
      conn.releaseCommitConnection(con);
      return new PostResult(true, "Document posted");
    } catch (Exception e) {
      try { if (con != null) conn.releaseRollbackConnection(con); } catch (Exception ignore) { }
      log.error("Post failed for table {} record {}", adTableId, recordId, e);
      return new PostResult(false, e.getMessage());
    }
  }
}
```

> Note for implementer: confirm the public error field name on `AcctServer` (`errorMessage` vs `message`); the test only asserts on `errors`/return — adjust the message source to the real field. `SequenceIdData` import is unused here — remove if your checkstyle rejects unused imports.

- [ ] **Step 4: Run test to verify it passes**

Run: `./gradlew test --tests "com.etendoerp.go.schemaforge.handlers.DocumentPostingServiceTest"`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

Delegate to Clerk: stage the two files, commit `Feature ETP-4298: Add DocumentPostingService.post core`.

---

### Task 2: `DocumentPostingService.unpost()` + `handleAction()` dispatch

**Files:**
- Modify: `modules/com.etendoerp.go/src/com/etendoerp/go/schemaforge/handlers/DocumentPostingService.java`
- Test: `modules/com.etendoerp.go/src-test/src/com/etendoerp/go/schemaforge/handlers/DocumentPostingServiceTest.java`

**Interfaces:**
- Consumes: `PostResult` (Task 1).
- Produces:
  - `PostResult unpost(String adTableId, String recordId)` → `ResetAccounting.delete(clientId, orgId, adTableId, recordId, "", "")`.
  - `NeoResponse handleAction(NeoContext context)` → returns a `NeoResponse` when `endpointType==ACTION` and `fieldName` is `post`/`unpost` (resolving `adTableId` from `context.getAdTab().getTable().getId()` and `recordId` from `context.getRecordId()`); returns `null` otherwise (caller falls through to default CRUD).

- [ ] **Step 1: Write the failing tests** (append to `DocumentPostingServiceTest.java`)

```java
  @Test
  public void unpostReturnsOkWhenResetAccountingRuns() {
    DocumentPostingService svc = new DocumentPostingService();
    java.util.HashMap<String, Integer> counts = new java.util.HashMap<>();
    counts.put("deleted", 3);
    counts.put("updated", 1);
    try (MockedStatic<org.openbravo.financial.ResetAccounting> ra =
             mockStatic(org.openbravo.financial.ResetAccounting.class);
         MockedStatic<OBContext> obc = mockStatic(OBContext.class)) {
      stubObContext(obc);
      ra.when(() -> org.openbravo.financial.ResetAccounting.delete(
              anyString(), anyString(), eq("259"), eq("rec-1"), eq(""), eq("")))
        .thenReturn(counts);
      DocumentPostingService.PostResult r = svc.unpost("259", "rec-1");
      assertTrue(r.ok());
    }
  }

  @Test
  public void handleActionReturnsNullForNonAction() {
    DocumentPostingService svc = new DocumentPostingService();
    com.etendoerp.go.schemaforge.NeoContext ctx =
        org.mockito.Mockito.mock(com.etendoerp.go.schemaforge.NeoContext.class);
    when(ctx.getEndpointType()).thenReturn(com.etendoerp.go.schemaforge.NeoEndpointType.CRUD);
    org.junit.Assert.assertNull(svc.handleAction(ctx));
  }
```

(Add a `stubObContext(MockedStatic<OBContext>)` helper that returns a mock OBContext whose `getCurrentClient()/getCurrentOrganization()/getUser()` return mocks with `getId()` set, mirroring the BankStatementsHandlerTest setup.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `./gradlew test --tests "com.etendoerp.go.schemaforge.handlers.DocumentPostingServiceTest"`
Expected: FAIL — `unpost`/`handleAction` not defined.

- [ ] **Step 3: Implement** (append methods to `DocumentPostingService.java`)

```java
  /** Unpost (descontabilizar): delete Fact_Acct rows and set Posted='N'. Validates open period. */
  public PostResult unpost(String adTableId, String recordId) {
    OBContext ctx = OBContext.getOBContext();
    String clientId = ctx.getCurrentClient().getId();
    String orgId = ctx.getCurrentOrganization().getId();
    try {
      java.util.HashMap<String, Integer> counts =
          org.openbravo.financial.ResetAccounting.delete(clientId, orgId, adTableId, recordId, "", "");
      int deleted = counts.getOrDefault("deleted", 0);
      return new PostResult(true, "Unposted (" + deleted + " entries removed)");
    } catch (Exception e) {
      log.error("Unpost failed for table {} record {}", adTableId, recordId, e);
      return new PostResult(false, e.getMessage());
    }
  }

  /**
   * Action-endpoint dispatch. Returns a response for post/unpost actions, or null to let the
   * caller fall through to default CRUD. Reused by every document-window handler.
   */
  public com.etendoerp.go.schemaforge.NeoResponse handleAction(
      com.etendoerp.go.schemaforge.NeoContext context) {
    if (context.getEndpointType() != com.etendoerp.go.schemaforge.NeoEndpointType.ACTION) {
      return null;
    }
    String action = context.getFieldName();
    if (!"post".equals(action) && !"unpost".equals(action)) {
      return null;
    }
    String adTableId = context.getAdTab().getTable().getId();
    String recordId = context.getRecordId();
    PostResult result = "post".equals(action) ? post(adTableId, recordId) : unpost(adTableId, recordId);
    try {
      org.codehaus.jettison.json.JSONObject body = new org.codehaus.jettison.json.JSONObject();
      body.put("success", result.ok());
      body.put("message", result.message());
      return result.ok()
          ? com.etendoerp.go.schemaforge.NeoResponse.ok(body)
          : com.etendoerp.go.schemaforge.NeoResponse.error(422, body.toString());
    } catch (Exception e) {
      return com.etendoerp.go.schemaforge.NeoResponse.error(500, "Posting action error");
    }
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `./gradlew test --tests "com.etendoerp.go.schemaforge.handlers.DocumentPostingServiceTest"`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

Delegate to Clerk: `Feature ETP-4298: Add unpost + action dispatch to DocumentPostingService`.

---

### Task 3: Shared `DocumentActionHandler` + wire goods-movements

**Files:**
- Create: `modules/com.etendoerp.go/src/com/etendoerp/go/schemaforge/handlers/DocumentActionHandler.java`
- Test: `modules/com.etendoerp.go/src-test/src/com/etendoerp/go/schemaforge/handlers/DocumentActionHandlerTest.java`
- Modify: `artifacts/goods-movements/decisions.json` (add `javaQualifier` to the header entity)

**Interfaces:**
- Consumes: `DocumentPostingService.handleAction(context)` (Task 2).
- Produces: `@Named("document-posting")` `NeoHandler` whose `handle()` delegates to `DocumentPostingService.handleAction`, returning `null` for non-post/unpost requests (default CRUD preserved).

- [ ] **Step 1: Write the failing test** (`DocumentActionHandlerTest.java`)

```java
package com.etendoerp.go.schemaforge.handlers;

import static org.junit.Assert.assertNull;
import static org.mockito.Mockito.when;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.mockito.junit.MockitoJUnitRunner;
import com.etendoerp.go.schemaforge.NeoContext;
import com.etendoerp.go.schemaforge.NeoEndpointType;

@RunWith(MockitoJUnitRunner.Silent.class)
public class DocumentActionHandlerTest {

  @Test
  public void handleFallsThroughForCrud() {
    DocumentActionHandler handler = new DocumentActionHandler();
    NeoContext ctx = org.mockito.Mockito.mock(NeoContext.class);
    when(ctx.getEndpointType()).thenReturn(NeoEndpointType.CRUD);
    assertNull(handler.handle(ctx)); // non-action → null → default CRUD
  }

  @Test
  public void handlerIsAnnotatedWithDocumentPostingQualifier() {
    javax.inject.Named named = DocumentActionHandler.class.getAnnotation(javax.inject.Named.class);
    org.junit.Assert.assertNotNull(named);
    org.junit.Assert.assertEquals("document-posting", named.value());
  }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./gradlew test --tests "com.etendoerp.go.schemaforge.handlers.DocumentActionHandlerTest"`
Expected: FAIL — class missing.

- [ ] **Step 3: Implement** (`DocumentActionHandler.java`)

```java
package com.etendoerp.go.schemaforge.handlers;

import javax.inject.Inject;
import javax.inject.Named;
import com.etendoerp.go.schemaforge.NeoContext;
import com.etendoerp.go.schemaforge.NeoHandler;
import com.etendoerp.go.schemaforge.NeoResponse;

/**
 * Generic post/unpost handler for document windows that have no other NeoHandler.
 * Assign ETGO_SF_ENTITY.Java_Qualifier = "document-posting" to route here.
 * @Named ONLY (defaults to @Dependent) — never a normal scope (Weld proxy would drop @Named).
 */
@Named("document-posting")
public class DocumentActionHandler implements NeoHandler {

  @Inject
  private DocumentPostingService postingService;

  @Override
  public NeoResponse handle(NeoContext context) {
    return postingService.handleAction(context); // null → default CRUD; response → short-circuit
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./gradlew test --tests "com.etendoerp.go.schemaforge.handlers.DocumentActionHandlerTest"`
Expected: PASS (2 tests).

- [ ] **Step 5: Wire goods-movements** — in `artifacts/goods-movements/decisions.json`, add to the header entity object:

```json
"javaQualifier": "document-posting",
```

(Place it as the first key inside the header entity, mirroring `"javaQualifier": "..."` in the other artifacts. Verify the header entity key name first — open the file and find `"entities": { "<header-key>": {`.)

- [ ] **Step 6: Push entity config + export** (requires DB)

Run: `make regen ONLY=goods-movements PUSH_TO_NEO=1`
Then in Etendo root: `./gradlew export.database`
Expected: `etgo_sf_entity.java_qualifier` for goods-movements header = `document-posting`.

- [ ] **Step 7: Commit**

Delegate to Clerk: `Feature ETP-4298: Add shared document-posting handler + wire goods-movements`.

---

### Task 4: Add post/unpost branch to the 6 existing entity handlers

**Files (Modify — add an injected `DocumentPostingService` and a one-line branch at the top of `handle()`):**
- `…/schemaforge/handlers/SalesInvoiceHeaderHandler.java` (qualifier `salesInvoiceHeaderHandler`)
- `…/PurchaseInvoiceHeaderHandler.java` (`purchaseInvoiceHeaderHandler`)
- `…/GlJournalHeaderHandler.java` (`glJournalHeaderHandler`)
- `…/AmortizationHeaderHandler.java` (`amortizationHeaderHandler`)
- `…/GoodsReceiptHeaderHandler.java` (`goodsReceiptHeaderHandler`)
- `…/GoodsShipmentHeaderHandler.java` (`goodsShipmentHeaderHandler`)
- Test: `…/handlers/SalesInvoiceHeaderHandlerPostingTest.java` (representative; the edit is identical across the 6)

> First locate each class: `grep -rl '@Named("salesInvoiceHeaderHandler")' modules/com.etendoerp.go/src`. The 6 classes exist because the qualifiers are already referenced in decisions.json.

**Interfaces:**
- Consumes: `DocumentPostingService.handleAction(context)`.
- Produces: each existing handler now short-circuits post/unpost actions before its own CRUD logic.

- [ ] **Step 1: Write the failing test** (`SalesInvoiceHeaderHandlerPostingTest.java`)

```java
package com.etendoerp.go.schemaforge.handlers;

import static org.mockito.Mockito.when;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.mockito.junit.MockitoJUnitRunner;
import com.etendoerp.go.schemaforge.NeoContext;
import com.etendoerp.go.schemaforge.NeoEndpointType;
import com.etendoerp.go.schemaforge.NeoResponse;

@RunWith(MockitoJUnitRunner.Silent.class)
public class SalesInvoiceHeaderHandlerPostingTest {

  @Test
  public void postActionDelegatesToPostingService() {
    SalesInvoiceHeaderHandler handler = new SalesInvoiceHeaderHandler();
    DocumentPostingService svc = org.mockito.Mockito.mock(DocumentPostingService.class);
    NeoContext ctx = org.mockito.Mockito.mock(NeoContext.class);
    NeoResponse expected = NeoResponse.error(200, "{}");
    when(ctx.getEndpointType()).thenReturn(NeoEndpointType.ACTION);
    when(svc.handleAction(ctx)).thenReturn(expected);
    // inject the mock (field is package-private/visible for test, or via reflection helper)
    handler.setPostingService(svc);
    org.junit.Assert.assertSame(expected, handler.handle(ctx));
  }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./gradlew test --tests "com.etendoerp.go.schemaforge.handlers.SalesInvoiceHeaderHandlerPostingTest"`
Expected: FAIL — `setPostingService`/branch not present.

- [ ] **Step 3: Implement** — in each of the 6 handlers, add the injected service and branch. Example for `SalesInvoiceHeaderHandler`:

```java
  @javax.inject.Inject
  private DocumentPostingService postingService;

  // test seam
  void setPostingService(DocumentPostingService s) { this.postingService = s; }

  @Override
  public NeoResponse handle(NeoContext context) {
    NeoResponse posting = postingService.handleAction(context);
    if (posting != null) {
      return posting;            // post/unpost action handled
    }
    // ... existing handler body unchanged ...
  }
```

Apply the identical 3-part change (inject field, test seam, branch as first statement of `handle()`) to all 6 classes. Do NOT change any other logic.

- [ ] **Step 4: Run tests to verify they pass**

Run: `./gradlew test --tests "com.etendoerp.go.schemaforge.handlers.*"`
Expected: PASS (all handler tests, including pre-existing ones, green).

- [ ] **Step 5: Commit**

Delegate to Clerk: `Feature ETP-4298: Delegate post/unpost action in document handlers`.

---

### Task 5: Generator extension — new `action` menuAction kind

**Files:**
- Modify: `cli/src/generate-frontend.js` (function `getMenuActionsProp`, ~lines 827–862)
- Test: `cli/test/generate-frontend.menuactions.test.js` (create)

**Interfaces:**
- Produces: a `menuAction` with `{ "action": "post" }` emits a menu entry carrying `neoAction: 'post'` (consumed by `useNeoAction` in Task 6). Precedence becomes: `documentAction` > `columnName` > `action` (neoAction) > empty `onClick`.

- [ ] **Step 1: Write the failing test** (`cli/test/generate-frontend.menuactions.test.js`)

```javascript
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { getMenuActionsProp } from '../src/generate-frontend.js';

describe('getMenuActionsProp — action kind', () => {
  it('emits neoAction for an { action } menuAction', () => {
    const out = getMenuActionsProp(
      [{ key: 'post', label: 'Post', labelKey: 'post', action: 'post', successKey: 'documentPosted' }],
      '({ data, status })',
    );
    assert.match(out, /key: 'post'/);
    assert.match(out, /neoAction: 'post'/);
  });
});
```

> If `getMenuActionsProp` is not currently exported, add it to the module's exports as part of this task (it must be importable for the test).

- [ ] **Step 2: Run test to verify it fails**

Run (from repo root): `node --test cli/test/generate-frontend.menuactions.test.js`
Expected: FAIL — `neoAction` not emitted (or function not exported).

- [ ] **Step 3: Implement** — in `getMenuActionsProp`, extend the handler-precedence block:

```javascript
      let handler;
      if (a.documentAction) {
        handler = `documentAction: '${a.documentAction}', `;
      } else if (a.columnName) {
        handler = `columnName: '${a.columnName}', `;
      } else if (a.action) {
        handler = `neoAction: '${a.action}', `;
      } else {
        handler = `onClick: () => {},`;
      }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test cli/test/generate-frontend.menuactions.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

Delegate to Clerk: `Feature ETP-4298: Add action menuAction kind to generator`.

---

### Task 6: `useNeoAction` hook + action wiring in the menu-action consumer

**Files:**
- Create: `tools/app-shell/src/hooks/useNeoAction.js`
- Modify: `tools/app-shell/src/components/contract-ui/RowQuickActions.jsx` (`handleMenuActionClick`) — add a `neoAction` branch.
- Test: `tools/app-shell/src/hooks/__tests__/useNeoAction.vitest.js`

**Interfaces:**
- Consumes: menu-action entries with `neoAction: 'post'|'unpost'` (Task 5).
- Produces: `useNeoAction({ specName, entityName, apiBaseUrl, token })` → `{ execute(recordId, actionName), loading }`, which `POST`s to `${apiBaseUrl}/${specName}/${entityName}/${recordId}/action/${actionName}` and returns the parsed `{ success, message }`.

- [ ] **Step 1: Write the failing test** (`useNeoAction.vitest.js`)

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useNeoAction } from '../useNeoAction.js';

beforeEach(() => { vi.restoreAllMocks(); });

describe('useNeoAction', () => {
  it('POSTs to the action endpoint and returns the parsed body', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ success: true, message: 'Document posted' }),
    }));
    const { result } = renderHook(() =>
      useNeoAction({ specName: 'sales-invoice', entityName: 'header', apiBaseUrl: '/api', token: 't' }));

    let res;
    await act(async () => { res = await result.current.execute('rec-1', 'post'); });

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/sales-invoice/header/rec-1/action/post',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(res.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `tools/app-shell`): `npx vitest run src/hooks/__tests__/useNeoAction.vitest.js`
Expected: FAIL — hook missing.

- [ ] **Step 3: Implement** (`useNeoAction.js`)

```javascript
import { useState, useCallback } from 'react';

/**
 * Calls a NEO action endpoint: POST /{spec}/{entity}/{id}/action/{name}.
 * Mirrors useDocumentAction but for custom (non-DocAction) server actions like post/unpost.
 */
export function useNeoAction({ specName, entityName, apiBaseUrl, token }) {
  const [loading, setLoading] = useState(false);

  const execute = useCallback(async (recordId, actionName) => {
    setLoading(true);
    try {
      const url = `${apiBaseUrl}/${specName}/${entityName}/${recordId}/action/${actionName}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: '{}',
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { success: false, message: body?.message || res.statusText };
      }
      return { success: body?.success ?? true, message: body?.message };
    } finally {
      setLoading(false);
    }
  }, [specName, entityName, apiBaseUrl, token]);

  return { execute, loading };
}
```

- [ ] **Step 4: Wire the consumer** — in `RowQuickActions.jsx` `handleMenuActionClick`, add before the `onClick` fallthrough:

```javascript
    if (action.neoAction) {
      const result = await neoAction.execute(row?.id, action.neoAction);
      onMenuActionExecuted?.(action, result);
      return;
    }
```

(Instantiate `const neoAction = useNeoAction({ specName: windowName, entityName: 'header', apiBaseUrl, token });` alongside the existing `docAction` hook in the component. Confirm the entity path used by the detail action endpoint — match what `useDocumentAction`/`ConfirmDocumentModal` use, i.e. the header entity name for the spec.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/hooks/__tests__/useNeoAction.vitest.js`
Expected: PASS. Also run the existing RowQuickActions tests to confirm no regression: `npx vitest run src/components/contract-ui`.

- [ ] **Step 6: Commit**

Delegate to Clerk: `Feature ETP-4298: Add useNeoAction hook + wire menu action`.

---

### Task 7: Declare Post/Unpost menuActions on the 7 windows + i18n + regenerate

**Files:**
- Modify: `artifacts/{sales-invoice,purchase-invoice,simple-g-l-journal,amortization,goods-movements,goods-receipt,goods-shipment}/decisions.json` — add `window.menuActions`.
- Modify: `packages/app-shell-core/src/locales/en_US.json` and `es_ES.json`.

**Interfaces:**
- Consumes: the generator `action` kind (Task 5) and `useNeoAction` wiring (Task 6).

- [ ] **Step 1: Add i18n keys** to BOTH locale files.

`en_US.json`:
```json
"post": "Post",
"unpost": "Unpost",
"documentPosted": "Document posted successfully",
"documentUnposted": "Document unposted successfully",
"postFailed": "Could not post the document",
"unpostFailed": "Could not unpost the document"
```
`es_ES.json`:
```json
"post": "Contabilizar",
"unpost": "Descontabilizar",
"documentPosted": "Documento contabilizado correctamente",
"documentUnposted": "Documento descontabilizado correctamente",
"postFailed": "No se pudo contabilizar el documento",
"unpostFailed": "No se pudo descontabilizar el documento"
```

- [ ] **Step 2: Add `menuActions`** to each window's `decisions.json` `window` object. Use the document's posted-flag and status to gate visibility (Post when not posted; Unpost when posted):

```json
"menuActions": [
  { "key": "post",   "label": "Post",   "labelKey": "post",   "action": "post",   "visibleWhenFieldFalse": "posted", "successKey": "documentPosted" },
  { "key": "unpost", "label": "Unpost", "labelKey": "unpost", "action": "unpost", "visibleWhenFieldTrue": "posted",  "successKey": "documentUnposted", "destructive": true }
]
```

> If a window's `decisions.json` already has a `window.menuActions` array, append these two entries rather than replacing. Verify each window exposes a `posted` field on the header (grep the artifact's `schema-raw.json` for `"posted"`); if a window uses a different posted-flag column name, set `visibleWhenFieldFalse`/`visibleWhenFieldTrue` to that column.

- [ ] **Step 3: Regenerate each window**

Run: `make regen ONLY=sales-invoice,purchase-invoice,simple-g-l-journal,amortization,goods-movements,goods-receipt,goods-shipment`
Expected: each window's generated `HeaderPage.jsx` shows the two menu actions with `neoAction: 'post'`/`'unpost'`.

- [ ] **Step 4: Verify generated output**

Run: `grep -rn "neoAction" artifacts/sales-invoice/generated/`
Expected: `neoAction: 'post'` and `neoAction: 'unpost'` present.

- [ ] **Step 5: Validate pipeline**

Run: `node cli/src/validate-pipeline.js --scope=sales-invoice,purchase-invoice,simple-g-l-journal,amortization,goods-movements,goods-receipt,goods-shipment`
Expected: 0 violations.

- [ ] **Step 6: Commit**

Delegate to Clerk: `Feature ETP-4298: Add Post/Unpost menu actions to 7 windows + i18n`.

---

### Task 8: Mocked E2E — Post action on a document window

**Files:**
- Create: `e2e/tests/flows/document-posting.mocked.spec.js`

**Interfaces:**
- Consumes: the full wired flow (menuAction → `useNeoAction` → `/action/post`).

- [ ] **Step 1: Write the spec** (mirrors `row-quick-actions.mocked.spec.js` conventions: `login()`, route mocks, `data-testid` selectors)

```javascript
import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

const SPEC = 'sales-invoice';
const ENTITY = 'header';

test.describe('Document posting — Post action (mocked)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);

    // List + detail rows: one completed, not-yet-posted invoice.
    const row = { id: 'inv-1', documentNo: 'INV-1', documentStatus: 'CO',
                  'documentStatus$_identifier': 'Completado', posted: 'N' };
    await page.route(`**/sws/neo/${SPEC}/${ENTITY}**`, async (route) => {
      const req = route.request();
      const url = req.url();
      if (req.method() === 'POST' && /\/action\/post(\b|\?|$)/.test(url)) {
        await route.fulfill({ status: 200, contentType: 'application/json',
          body: JSON.stringify({ success: true, message: 'Document posted' }) });
        return;
      }
      if (req.method() === 'GET' && /\/header\/[^/?]+/.test(url)) {
        await route.fulfill({ status: 200, contentType: 'application/json',
          body: JSON.stringify({ response: { data: [row] } }) });
        return;
      }
      if (req.method() === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json',
          body: JSON.stringify({ response: { data: [row], totalRows: 1 } }) });
        return;
      }
      route.fallback();
    });

    await page.goto(`/${SPEC}/inv-1`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  });

  test('Post menu action calls the action endpoint and shows success', async ({ page }) => {
    const detail = page.getByTestId('detail-view');
    await expect(detail).toBeVisible();

    // Open the "more" menu and click Post.
    await detail.getByTestId('action-more').click().catch(() => {});
    const postBtn = page.getByTestId('menu-action-post');
    await expect(postBtn).toBeVisible();

    const [req] = await Promise.all([
      page.waitForRequest(r => /\/action\/post/.test(r.url()) && r.method() === 'POST'),
      postBtn.click(),
    ]);
    expect(req).toBeTruthy();
  });
});
```

> Confirm the exact `data-testid` for the menu trigger and the rendered menu item against the generated DetailView (the generator may emit `menu-action-{key}`; if the testid differs, align the selector and, if missing, add a stable `data-testid` in the menu-action renderer as part of Task 6). Per docs/e2e-testing-guide.md, selectors must be `data-testid`-based, never text labels.

- [ ] **Step 2: Run the spec**

Run (from `e2e/`): `npx playwright test tests/flows/document-posting.mocked.spec.js`
Expected: PASS.

- [ ] **Step 3: Commit**

Delegate to Clerk: `Feature ETP-4298: Add mocked E2E for document posting action`.

---

## Self-Review

**Spec coverage (Plan 1 portion of the spec):**
- §2 Capability B (shared service + action interception) → Tasks 1–4. ✔
- §2 generator extension (`action` menuAction + `useNeoAction`) → Tasks 5–6. ✔
- §3 `DocumentPostingService`, shared handler, per-entity wiring, generator/hook files → Tasks 1–6. ✔
- §3 decisions.json menuActions on 7 windows → Task 7. ✔
- §5 roles ungated + `TODO(roles)` annotation → Task 1 (service Javadoc). ✔
- §6 error handling (per-doc result, rollback, period checks) → Tasks 1–2. ✔
- §8 testing (JUnit, vitest, E2E) → Tasks 1–6, 8. (Contract tests apply to Plan 2's new entity, not Plan 1.) ✔
- i18n both locales → Task 7. ✔
- **Deferred to Plan 2:** Not Posted Documents window, `NotPostedDocumentsHandler`, filter-options, bulk Post, contract test for the new entity, the window guide doc.

**Placeholder scan:** No `TBD`/`implement later`. The only `TODO(roles)` is the intentional, spec-mandated annotation. Each code step shows full code; verification steps for field/testid names are explicit checks with commands, not vague directives.

**Type consistency:** `PostResult(boolean ok, String message)` used identically in Tasks 1–2; `handleAction(NeoContext)→NeoResponse|null` consumed in Tasks 3–4; `neoAction: 'post'|'unpost'` produced in Task 5, consumed in Task 6; `useNeoAction({specName, entityName, apiBaseUrl, token}).execute(recordId, actionName)` consistent across Tasks 6 and the E2E URL in Task 8.

**Open verifications for the implementer (named explicitly in-task, not placeholders):** exact `AcctServer` error-field name (Task 1); each window's header-entity key name and posted-flag column (Tasks 3, 7); the 6 handler class file paths (Task 4, with grep); the menu-action `data-testid` (Tasks 6, 8).
