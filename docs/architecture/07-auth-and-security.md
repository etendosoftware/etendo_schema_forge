# 07 -- Authentication and Security

Authentication, authorization, session management, and security hardening for the production application.

## Authentication Flow

### Current Implementation

```
User  -->  OnboardingPage.jsx  -->  POST /sws/go/onboarding  (new environment)
                                              |
                                              v
                                  Backend creates client/org, imports dataset,
                                  runs sequence generation with the new
                                  client's admin user/role context, and seeds
                                  a default customer before the first readiness
                                  checks run
                                  The curated onboarding dataset excludes business
                                  partner rows and locations; it only keeps shared
                                  setup catalogs such as BP groups and payment terms
                                              |
                                              v
                                  OnboardingPage.jsx  -->  GET /sws/go/login?userId=...
                                              |
                                              v
                                  NEO returns { token, roleList, ... }
                                              |
                                              v
                                  OnboardingPage stores token, role, and org in localStorage
                                  AuthContext restores token from localStorage
                                  Subsequent API calls include:
                                    Authorization: Bearer <token>
                                  401 response  -->  onUnauthorized() clears auth state and throws
                                                      Protected routes redirect to /onboarding on the next render
```

**Key files:**
- `src/auth/api.js` -- `createApiFetch()` with auto-401 handling, `buildHeaders()`
- `src/auth/AuthContext.jsx` -- React context providing `token`, `username`, `isAuthenticated`, `logout()`
- `src/pages/OnboardingPage.jsx` -- Onboarding and environment login UI
- `src/pages/onboarding/onboardingApi.js` -- API helpers for platform login, environment login, and onboarding stream
- `src/pages/onboarding/onboardingSso.js` -- Provider-agnostic SSO frontend adapter; Google Identity Services is the first provider implementation
- `com.etendoerp.go.onboarding.OnboardingSequenceGeneratorService` -- backend service that runs sequence generation during onboarding with explicit client admin context

### Base URL Detection

`api.js` auto-detects the API base URL from the current page path:
```js
const webIdx = path.indexOf('/web/');
if (webIdx !== -1) return path.substring(0, webIdx);
return import.meta.env.VITE_API_BASE || '';
```

When deployed under Etendo (e.g., `/etendo_sf/web/app-shell/`), the base URL is extracted as `/etendo_sf`. In standalone dev mode, `VITE_API_BASE` overrides it.

### Token Storage

| Storage | What | Lifetime | Risk |
|---------|------|----------|------|
| React state (`useState`) | `token`, `username` | Until page refresh or tab close | None (memory only) |
| `localStorage` | `sf_auth_token`, `sf_auth_user`, `sf_auth_rolelist`, `sf_auth_selected_role`, `sf_auth_selected_org`, `sf_platform_token` | Persistent across sessions | XSS can read it (see Security Considerations) |

On mount, `AuthContext` reads the Etendo auth token from localStorage to restore the protected session. On logout, it clears both the Etendo session keys and the onboarding platform token (`sf_platform_token`) so the user returns to a fully signed-out state.

### Auth Guard

`AuthGuard` wraps all protected routes. If `isAuthenticated` is false (no token), the user is redirected to `/onboarding`. The `/onboarding` route itself is public and always renders `OnboardingPage`, which can resume the onboarding/environment-selection flow based on the current platform session.

```
/onboarding  -->  OnboardingPage (public)
/*           -->  AuthGuard  -->  AppLayout  -->  Routes
```

### Onboarding UX States

`OnboardingPage.jsx` currently handles four public auth/onboarding states before the protected app loads:

1. **Register** -- create the platform account.
2. **Login** -- sign in with an existing platform account using local credentials or a configured SSO provider.
3. **Pre-create setup** -- a two-step onboarding wizard collects the user profile and initial company data before environment creation starts.
4. **Creation progress modal** -- while `/sws/go/onboarding` runs, the UI switches to a centered modal-style progress state (20% / 50% / 80% / 100%) over a blurred application background until the new environment is ready.

After a successful platform login or registration, `routeByEnvironments()` decides whether to:
- open the setup wizard when the account has no environments yet, or
- auto-login to the first available environment and redirect to `/dashboard`.

### Provider-Agnostic SSO

The app-shell keeps SSO provider-specific behavior outside the account flow:

- `loginWithSsoProvider(fetchImpl, baseUrl, provider, payload)` posts to `POST /sws/go/sso/{provider}`.
- Provider payloads are allowlisted per implementation. The Google Identity Services callback implementation sends only `credential`; browser code must not send account authority fields such as `email`, `name`, or `subject`.
- `onboardingSso.js` resolves configured providers and renders provider-specific buttons. Google uses Google Identity Services with FedCM enabled for the button flow.
- SSO success stores the same `sf_platform_token` used by local login and then routes through the existing environment-selection/onboarding logic.

Google requires a public Web OAuth client id in `VITE_GOOGLE_CLIENT_ID`. This is a client identifier, not a secret. Google client secrets, provider API keys, signing secrets, and backend SSO policy configuration must never be exposed in the frontend bundle.

### API Call Authentication

`createApiFetch()` wraps `fetch()` with:
1. Automatic `Authorization: Bearer <token>` header injection
2. Automatic 401 detection -- calls `onUnauthorized()` callback (typically triggers logout + redirect)

React components should access it through `useApiFetch(baseUrl)`, which reads the token from `AuthContext` and wires unauthorized responses to `logout()`. New or migrated custom components should not construct `Authorization` headers locally. Some generated contracts still forward `token` to legacy contract-ui and custom component surfaces for compatibility; remove those props only when the receiving component is migrated to `useApiFetch`.

### Session Defaults Endpoint

`GET /sws/neo/session` exposes lightweight session-scoped defaults that are not tied to a specific window record.

Current response fields:
- `currencyCode` -- ISO 4217 code resolved for the current organization.
- `yourCompanyDocumentImageId` -- `AD_Image_ID` from `AD_ClientInfo.Your_Company_Document_Image` for the current client.
- `organization` -- issuer identity used in printable documents (invoice templates, etc.):
  - `name` -- `AD_Org.Name`.
  - `taxId` -- `AD_OrgInfo.TaxID`.
  - `address1`, `address2` -- `C_Location.AddressLine1` / `AddressLine2` via `AD_OrgInfo.C_Location_ID`.
  - `cityLine` -- pre-formatted `<POSTAL> - <CITY> (<REGION>)`, matching Etendo Classic's `C_Location_Description` SQL function output.

Frontend consumers that need the binary logo must fetch `GET /sws/neo/image/{imageId}` with the same JWT token.

## Session Management

### AD_Session (Etendo Server-Side)

Etendo stores active sessions in the `AD_Session` table:

| Column | Purpose |
|--------|---------|
| `AD_Session_ID` | Primary key (VARCHAR, UUID format) |
| `AD_User_ID` | The authenticated user |
| `AD_Role_ID` | The active role for this session |
| `AD_Org_ID` | The active organization |
| `AD_Client_ID` | The active client (tenant) |
| `Creationdate` | When the session was created |
| `Session_Active` | Whether the session is still valid (`Y`/`N`) |
| `Login_Status` | Status of the login attempt |

### Session Lifecycle

| Event | What Happens |
|-------|-------------|
| **Login** | New `AD_Session` row created; token returned to client |
| **API request** | Token validated against `AD_Session`; session must be active |
| **Timeout** | Etendo marks session as inactive after configurable idle period |
| **Logout** | Client calls logout endpoint; `Session_Active` set to `N`; client clears localStorage |
| **Admin kill** | Admin marks session as inactive in Etendo Classic UI |
| **Multiple sessions** | Etendo allows multiple concurrent sessions per user (different browsers/devices) |

### Session Timeout

Configured in Etendo properties (`Openbravo.properties`). Default timeout is typically 30-60 minutes of inactivity. The SPA does not implement its own timeout -- it relies on the backend returning 401 when the session expires.

### Cache Clearing on Login

`OnboardingPage.jsx` clears all service worker caches on successful environment login. This prevents stale cached resources from persisting across user sessions, which is especially important after deployments.

## Authorization Model

### Role-Based Access Control (RBAC)

Etendo uses a multi-level authorization model:

```
AD_Role
  |-- AD_Window_Access    (which windows a role can see, read/write)
  |-- AD_Process_Access   (which processes a role can execute)
  |-- AD_Form_Access      (which forms a role can access)
  |-- AD_Field_Access     (field-level read/write per role)
```

### Window Access

Each role has explicit window access grants:

| AD_Window_Access Column | Purpose |
|------------------------|---------|
| `AD_Role_ID` | The role |
| `AD_Window_ID` | The window |
| `IsReadWrite` | `Y` = full access, `N` = read-only |
| `IsActive` | Whether this grant is active |

**Frontend enforcement**: The SPA should hide windows and action buttons that the user's role cannot access. This is a UX improvement, not a security boundary.

**Backend enforcement (mandatory)**: Every RequestHandler MUST validate that the current user's role has access to the requested window/entity before processing any CRUD operation. Frontend-only enforcement is trivially bypassed.

### Organization-Based Data Filtering

Etendo filters data by the user's active organization via `OBContext`:
- A user in organization "Spain" sees only Spain's data
- A user in organization "*" (asterisk) sees all data
- This filtering is applied at the OBDal query level in RequestHandlers

### Process Permissions

Process buttons (e.g., "Complete Order", "Void Invoice") are gated by `AD_Process_Access`:
- Backend: `PreconditionValidator` checks role access before enabling the button
- Backend: `DalProcess` verifies permission before execution
- Frontend: Button visibility driven by the precondition check response

### Field-Level Security

`AD_Field_Access` controls per-field visibility and editability per role:
- A field can be visible but read-only for one role, editable for another, and hidden for a third
- RequestHandlers should strip restricted fields from API responses
- The SPA should respect field-level access in form rendering

## Security Considerations

### CRITICAL

**XSS (Cross-Site Scripting)**
React escapes content by default in JSX expressions. The primary risk is:
- `dangerouslySetInnerHTML` usage anywhere in contract-ui or generated components
- User-supplied data rendered in attributes without escaping
- Third-party libraries that inject raw HTML

**Mitigation**: Audit all components for `dangerouslySetInnerHTML`. Use React's built-in escaping. Apply CSP headers (see below).

**CSRF (Cross-Site Request Forgery)**
The current auth model uses Bearer tokens in the `Authorization` header (not cookies), which provides inherent CSRF protection -- browsers do not automatically attach custom headers to cross-origin requests.

If the auth model changes to cookie-based sessions:
- Cookies must use `SameSite=Strict` or `SameSite=Lax`
- A CSRF token must be included in state-changing requests
- The backend must validate the CSRF token

**SQL/HQL Injection**
RequestHandlers receive filter parameters from the frontend. All query parameters MUST be parameterized:
```java
// CORRECT: Parameterized query
OBQuery<Order> q = OBDal.getInstance().createQuery(Order.class, "documentNo = :docNo");
q.setNamedParameter("docNo", filterValue);

// WRONG: String concatenation
OBQuery<Order> q = OBDal.getInstance().createQuery(Order.class, "documentNo = '" + filterValue + "'");
```

**Auth Bypass**
Every RequestHandler MUST validate the session before processing. A missing or expired token must result in a 401 response. No endpoint should be accessible without authentication (except `/sws/login`).

### WARNING

**CORS Misconfiguration**
If the SPA and API are on different origins, overly permissive CORS headers (`Access-Control-Allow-Origin: *`) combined with `Access-Control-Allow-Credentials: true` create a security vulnerability.
- **Mitigation**: Set `Access-Control-Allow-Origin` to the exact SPA origin. Never use `*` with credentials.

**Secrets in Frontend Bundle**
No API keys, database credentials, internal URLs, service tokens, Google client secrets, or provider signing secrets should appear in the JavaScript bundle. Acceptable frontend variables are `VITE_API_BASE` (a relative path), `VITE_MOCK` (a boolean flag), and public provider client identifiers such as `VITE_GOOGLE_CLIENT_ID`.
- **Mitigation**: Audit the build output (`dist/`) for sensitive strings. Vite only exposes variables prefixed with `VITE_`.

**Token in localStorage**
Storing the JWT in localStorage makes it accessible to any JavaScript running on the page. An XSS vulnerability would expose the token.
- **Mitigation**: Strict Content Security Policy. Consider migrating to `httpOnly` cookies for token storage (requires backend changes). Short-lived tokens with refresh rotation.

**Rate Limiting**
No built-in protection against brute force login attempts.
- **Mitigation**: Rate limiting at the reverse proxy level (nginx `limit_req`). Account lockout after N failed attempts (configurable in Etendo).

**Data Over-Exposure**
The API may return all fields visible to the role, even if the current UI view does not need them.
- **Mitigation**: Field-level projection in RequestHandlers. Only return fields that the DTO declares.

**Audit Logging**
Etendo has `AD_Audit_Trail` for tracking data changes. Ensure it is enabled for sensitive entities (user management, financial transactions, role changes).

**Transactional Email**
Transactional email must be protected as a server-side contract system:
- The frontend must never call the provider endpoint directly.
- Provider endpoint URLs, API keys, sender identities, and signing secrets must stay in server configuration only.
- No browser-visible endpoint may accept an arbitrary email payload such as `to`, `template`, and `data`.
- Each send must execute a versioned contract that defines authorization, recipient resolution, variables, throttle, idempotency, audit, suppression, and kill switch behavior.
- Recipients must be derived from trusted server records by default.
- Caller-provided recipients are allowed only for explicit admin/support contracts.
- Reply-To must be disabled by default or constrained to a documented allowlist policy.
- Controlled custom HTML email requires role checks, reason capture, sanitizer, strict throttle, and audit.

See [../transactional-email-framework.md](../transactional-email-framework.md), [../email-contracts.md](../email-contracts.md), and [../ops/transactional-email-security.md](../ops/transactional-email-security.md).

## HTTPS / TLS

### TLS Termination

| Configuration | Where TLS Terminates | Internal Traffic |
|---------------|---------------------|------------------|
| Load balancer (recommended) | nginx / ALB / Cloudflare | HTTP between LB and Tomcat (private network) |
| Tomcat direct | Tomcat's Connector with `SSLHostConfig` | N/A |
| Both | LB terminates public TLS; Tomcat has its own cert | HTTPS end-to-end |

**Recommended**: Terminate TLS at the load balancer/reverse proxy. Internal traffic between the LB and Tomcat runs over HTTP on a private network.

### Certificate Management

| Concern | Recommendation |
|---------|---------------|
| Certificate source | Let's Encrypt (free, automated) or commercial CA |
| Renewal | Automated via certbot or cloud provider auto-renewal |
| Expiry monitoring | Alert at least 14 days before expiry |
| HSTS | Enable `Strict-Transport-Security: max-age=31536000; includeSubDomains` |

### HTTP to HTTPS Redirect

The reverse proxy must redirect all HTTP (port 80) traffic to HTTPS (port 443):
```nginx
server {
    listen 80;
    return 301 https://$host$request_uri;
}
```

## Content Security Policy

Recommended CSP headers for the SPA:

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self' https://accounts.google.com;
  style-src 'self' 'unsafe-inline';
  img-src 'self' data:;
  font-src 'self';
  connect-src 'self' https://api.example.com https://accounts.google.com;
  frame-src https://accounts.google.com;
  frame-ancestors 'none';
  base-uri 'self';
  form-action 'self';
```

Notes:
- `'unsafe-inline'` for styles is required by TailwindCSS and Radix UI (inline style attributes)
- `frame-ancestors 'none'` prevents clickjacking
- `connect-src` must include the API origin if different from the SPA origin
- Google SSO requires `script-src`, `connect-src`, and `frame-src` entries for `https://accounts.google.com` so Google Identity Services and FedCM can render the button flow

## Dependency Security

### Frontend Dependencies

| Package | Role | Supply Chain Risk |
|---------|------|------------------|
| react, react-dom | Core framework | Low (Meta-maintained, widely audited) |
| react-router-dom | Client routing | Low (Remix/React team) |
| @radix-ui/* | Accessible UI primitives | Low (well-maintained, minimal deps) |
| lucide-react | Icons (SVG) | Low (open source, tree-shakeable) |
| sonner | Toast notifications | Medium (smaller maintainer base) |
| cmdk | Command palette | Medium (smaller maintainer base) |
| next-themes | Theme switching | Medium (used outside Next.js context) |
| vite-plugin-pwa | PWA generation | Medium (wraps Workbox) |

### Mitigation

- Run `npm audit` in CI and fail on critical/high vulnerabilities
- Pin exact versions in `package-lock.json` (already the default)
- Review dependency updates before merging (Dependabot or Renovate)
- Minimize dependencies: prefer built-in browser APIs over utility libraries

### Backend Dependencies

- Java dependency scanning with OWASP Dependency-Check or Snyk
- Etendo Core JARs are the primary dependency surface
- Generated code uses only Etendo-provided APIs (OBDal, CDI, RequestHandler)
