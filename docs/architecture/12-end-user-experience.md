# 12 -- End User Experience

What end users see and experience when interacting with Schema Forge generated modules in production. This document covers user journeys, performance targets, error handling, offline behavior, accessibility, localization, and known UX failure points.

---

## 1. User Journey Map

```
┌──────────┐     ┌──────────────────────────────────────────────┐
│  Login   │────▶│  Dashboard (KPIs, alerts, recent activity)   │
└──────────┘     └──────────────────┬───────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
             ┌────────────┐  ┌──────────┐  ┌──────────────┐
             │  Navigate  │  │  Search  │  │  Command     │
             │  (sidebar) │  │  (global)│  │  Palette     │
             └─────┬──────┘  └────┬─────┘  └──────┬───────┘
                   └──────────────┼────────────────┘
                                  ▼
                    ┌─────────────────────────────┐
                    │  Window: List View           │
                    │  (DataTable: search, filter, │
                    │   sort, paginate)            │
                    └──────────────┬──────────────┘
                                   │ click record
                                   ▼
                    ┌─────────────────────────────┐
                    │  Window: Detail View         │
                    │  (EntityForm: edit fields,   │
                    │   view computed values, save)│
                    └──────────────┬──────────────┘
                          ┌────────┴────────┐
                          ▼                 ▼
                   ┌─────────────┐  ┌──────────────────┐
                   │  Save       │  │  Execute Process  │
                   │  (validate  │  │  (precondition    │
                   │   + submit) │  │   check → run →   │
                   └─────────────┘  │   feedback)       │
                                    └──────────────────┘
```

### Typical User Session

1. **Login:** User enters credentials. Etendo validates against `AD_User`, creates `AD_Session` record, returns session token
2. **Dashboard:** Landing page shows KPIs, recent records, pending alerts
3. **Navigate:** User clicks a window in the sidebar or uses the command palette
4. **List view:** DataTable loads with default filters. User can search, sort, filter, paginate
5. **Detail view:** User clicks a record. EntityForm shows editable and read-only fields. System fields are hidden
6. **Edit and save:** User modifies fields. On save, EventHandlers execute derivations (document number, computed totals), then the record is persisted
7. **Execute process:** User clicks a process button (e.g., "Complete Order"). Precondition validators check eligibility. Process executes. User sees success/failure feedback
8. **Notifications:** Toasts for success, field-level errors for validation failures, modal dialogs for critical confirmations

---

## 2. Performance Targets

From the user's perspective, responsiveness determines whether the system feels fast or sluggish.

| Action | Target | Perceived as | Notes |
|--------|--------|-------------|-------|
| Login to dashboard | < 2s | Instant | Includes auth + SPA load + dashboard data |
| Navigate to window | < 1s | Instant | Dynamic import + API call for initial data |
| Load list (50 records) | < 1s | Instant | Paginated, default sort |
| Load list (200 records) | < 2s | Fast | Maximum page size |
| Save record | < 500ms | Instant | Includes EventHandler derivations |
| Execute process | < 3s | Acceptable | Complex processes may take longer; show progress indicator |
| Search autocomplete | < 300ms | Real-time | FK selector dropdown population |
| Filter/sort list | < 500ms | Instant | Client-side if data is loaded; server-side for new query |

**Current state:** Most targets are unverified. Mock data in development shows ~500ms window navigation, but real API calls with production data volumes have not been measured.

**Measurement approach:** Use the observability metrics from [10-observability.md](10-observability.md) (specifically `sf_api_request_duration_seconds`) to track actual performance against these targets.

---

## 3. Error Experience

### 3.1 Error Types and User-Facing Behavior

| Error Type | What the User Sees | Current Behavior | Recommended Behavior |
|-----------|-------------------|-----------------|---------------------|
| **Validation error** | Field-level error messages (red text below the field) | Handled by EntityForm validation | Working as designed. Ensure messages are localized via i18n |
| **API error (4xx)** | Toast notification with error message | Partial: some errors show toast, others are silent | Consistent toast with user-friendly message. Record stays dirty (unsaved changes preserved) |
| **API error (5xx)** | Toast notification with generic error | Partial: raw Java exception may leak to user | Never show stack traces. Show "Something went wrong. Please try again." with a detail-expand option for support reference |
| **Process precondition failure** | Modal or toast explaining why the process cannot run | Handled by precondition validators | Working as designed. Ensure messages explain what the user should do to fix the condition |
| **Process execution failure** | Error message after process runs | Depends on process implementation | Show clear failure message. If transaction rolled back, indicate that no data was changed |
| **Network error** | No response from server | No handling (loading spinner forever) | Show "Connection lost" banner. Offer retry button. Preserve form state |
| **Session expired (401)** | Silent failures or confusing behavior | No centralized handling | Redirect to login page. Preserve the current URL as a return path. Show "Your session has expired" |
| **Window load failure** | White screen | No ErrorBoundary | Show error boundary with "This window could not be loaded. Try again." button |
| **Unhandled JS exception** | White screen (entire SPA crashes) | No top-level ErrorBoundary | Show app-level error boundary with "Something went wrong" and option to return to dashboard |

### 3.2 Transactional Email States

Email sending UI must call Etendo Go email contracts and map executor outcomes directly. The UI must never call the provider endpoint or send arbitrary provider payloads.

| Contract Result | What the User Sees | Required Behavior |
|-----------------|--------------------|-------------------|
| `SENT` | Success confirmation | Close or update the send modal and preserve request reference if shown |
| `DUPLICATE` | Already sent or recently sent | Treat as non-fatal and do not ask the user to retry immediately |
| `THROTTLED` | Too many attempts | Show wait/retry guidance without provider details |
| `UNAUTHORIZED` | Permission denied | Hide the action when possible and show a permission message if reached |
| `NO_RECIPIENT` | Missing recipient | Ask the user to fix the business contact data |
| `SUPPRESSED` | Delivery disabled | Explain that the recipient/domain cannot receive email and direct to support |
| `KILL_SWITCHED` | Email temporarily unavailable | Keep the document/action state unchanged and show a support-safe message |
| `PROVIDER_FAILED` | Send failed | Offer retry or support escalation with request reference |

### 3.3 Error Message Guidelines

- Use plain language, not technical jargon
- Tell the user what happened and what they can do about it
- Include a reference ID (requestId) for support escalation
- Never expose Java stack traces, SQL errors, or internal class names
- Localize all error messages via the i18n system

**Example:**

| Instead of | Show |
|-----------|------|
| `OBException: com.etendoerp.go.salesorder.event.SalesOrderEventHandler: NullPointerException` | "The order could not be saved. Please try again. If the problem persists, contact support. (Ref: req-a1b2c3d4)" |
| `PSQLException: ERROR: duplicate key value violates unique constraint` | "A record with this identifier already exists. Please use a different value." |
| `StaleObjectStateException` | "This record was modified by another user. Please refresh and try again." |

---

## 4. Offline Capability

### 4.1 Current State

| Capability | Status |
|-----------|--------|
| **App shell caching** | Yes (PWA service worker caches HTML, JS, CSS) |
| **Window component caching** | Yes (dynamic imports cached by service worker) |
| **API data caching** | No (all data requires network) |
| **Offline form submission** | No |
| **Offline indicator** | No |

The SPA can load from cache when offline, but all meaningful operations (list, save, process) require a network connection to the Etendo backend.

### 4.2 Offline User Experience (Current)

1. User opens the app while offline
2. App shell loads from service worker cache
3. User navigates to a window
4. Window component loads from cache
5. API call for data fails silently
6. User sees loading spinner indefinitely (no timeout, no error)

### 4.3 Recommended Offline Improvements

**Short-term (no backend changes):**

| Improvement | Description |
|------------|-------------|
| **Offline indicator** | Show a persistent banner: "You are offline. Some features are unavailable." |
| **API timeout + error** | After 10 seconds, show "Cannot reach server" instead of infinite spinner |
| **Last-viewed data** | Cache the last API response per window in IndexedDB. Show stale data with a "data may be outdated" warning |
| **Form state preservation** | Store unsaved form data in localStorage. Restore when user returns to the window |

**Long-term (requires backend support):**

| Improvement | Description |
|------------|-------------|
| **Offline queue** | Queue save operations in IndexedDB while offline. Sync when connectivity returns |
| **Conflict resolution** | When syncing queued saves, detect if the record was modified by another user. Show conflict resolution UI |
| **Selective sync** | Allow users to mark records for offline access. Sync those records proactively |

> **Pragmatic note:** Full offline ERP capability is complex and may not be worth the investment for a typical deployment where users are on a reliable corporate network. The short-term improvements (offline indicator, timeout handling, form state preservation) provide the most value for the least effort.

---

## 5. Accessibility

### 5.1 Current State

| Requirement | Status | Notes |
|------------|--------|-------|
| **Semantic HTML** | Partial | shadcn/ui components use proper ARIA attributes |
| **Keyboard navigation** | Partial | Tab order in forms works, but DataTable lacks keyboard navigation |
| **Screen reader support** | Partial | Field labels come from i18n files, but dynamic content (toasts, loading states) may not announce |
| **Color contrast** | Good (default) | Tailwind CSS defaults meet WCAG AA contrast ratios |
| **Focus management** | Partial | Focus is not always managed correctly after navigation or dialog open/close |
| **Skip navigation** | Missing | No "skip to content" link for keyboard users |
| **Dark mode** | Unknown | Tailwind supports it, but not confirmed as implemented |
| **Responsive layout** | Partial | Sidebar collapses, but forms may not reflow properly on small screens |
| **Touch targets** | Unknown | Buttons may be too small for mobile touch |

### 5.2 WCAG 2.1 AA Compliance Gaps

| Gap | Impact | Fix |
|-----|--------|-----|
| No skip-to-content link | Keyboard users must tab through entire sidebar to reach content | Add `<a href="#main-content" class="sr-only focus:not-sr-only">Skip to content</a>` |
| DataTable not keyboard-navigable | Users cannot browse table rows with arrow keys | Implement `role="grid"` with arrow key navigation |
| Toast notifications not announced | Screen readers miss success/error feedback | Add `role="alert"` and `aria-live="polite"` to toast container |
| Focus not trapped in modals | Tab key moves focus behind the modal | Use `<dialog>` element or implement focus trap |
| Loading states not announced | Screen readers do not know the page is loading | Add `aria-busy="true"` and `aria-live` region for loading status |
| Form errors not associated | Error messages not linked to their input field | Use `aria-describedby` pointing to the error message element |

### 5.3 Recommended Actions

1. Run an automated accessibility audit (axe-core or Lighthouse Accessibility)
2. Fix all automatically detectable issues (typically 40-60% of problems)
3. Manual keyboard-only testing: navigate the full user journey without a mouse
4. Screen reader testing (VoiceOver on macOS, NVDA on Windows) on key flows
5. Add accessibility checks to the build pipeline (axe-core in CI)

---

## 6. Localization

### 6.1 Current State

| Aspect | Status |
|--------|--------|
| **Supported locales** | en_US (English), es_ES (Spanish) |
| **Field labels** | 2884 labels populated from Etendo DB |
| **Locale switching** | In-app locale switcher component |
| **Label resolution** | Key-based lookup from `{locale}.json` files via `LocaleProvider` |
| **RTL support** | Not implemented |
| **Number formatting** | Unknown (may not be locale-aware) |
| **Date formatting** | Unknown (may not be locale-aware) |
| **Currency formatting** | Implemented — `formatCurrency(code, value)` in `@/lib/formatCurrency` + `useCurrency()` hook resolve org currency from session. See `docs/ui-design-guidelines.md`. |

### 6.2 Adding a New Locale

1. Create `public/locales/{locale_code}.json` (e.g., `fr_FR.json`)
2. Populate with translated labels (same keys as `en_US.json`)
3. Register the locale in `LocaleProvider` configuration
4. Add the locale to the locale switcher dropdown
5. Test: verify all 2884+ labels render correctly, no missing keys

### 6.3 Localization Gaps

| Gap | Impact | Priority |
|-----|--------|----------|
| **Missing number formatting** | Users see numbers in US format regardless of locale (1,000.00 vs 1.000,00) | CRITICAL for non-US deployments |
| **Missing date formatting** | Dates show as MM/DD/YYYY instead of locale-appropriate format | CRITICAL for non-US deployments |
| **Missing currency formatting** | ~~Currency symbols and positions not locale-aware~~ **Resolved in ETP-3855** — `formatCurrency` handles symbol placement per ISO 4217 code. | ~~CRITICAL~~ Done |
| **No RTL support** | Arabic, Hebrew users cannot use the application | WARNING (only if RTL locales are needed) |
| **Error messages not localized** | Backend error messages arrive in English regardless of user locale | WARNING |
| **Hardcoded strings in components** | Any string not going through i18n system won't translate | WARNING |

### 6.4 Formatting Utilities (implemented)

Currency formatting is now handled by canonical shared utilities. Do not use raw `Intl` calls for money in window components — always use the shared layer.

| Use case | Utility | Import |
|----------|---------|--------|
| Money in custom window components (sidebars, topbars, modals) | `formatCurrency(isoCode, value)` | `@/lib/formatCurrency` |
| Money in dashboard widgets receiving a label string from the API | `formatDashboardAmount(value, label, locale)` | `@/lib/dashboardNumberFormat` |

The org's ISO 4217 currency code is resolved by `useCurrency()` (hook, `@/hooks/useCurrency`) which reads from `/sws/neo/session`. Full usage guide and anti-patterns: `docs/ui-design-guidelines.md#monetary-amount-formatting`.

---

## 7. Feedback Loops

### 7.1 Current State

| Channel | Status |
|---------|--------|
| **Error reporting** | None. User calls support, describes the problem verbally |
| **Usage analytics** | None. No visibility into which features are used |
| **Feature requests** | Manual (email, meetings) |
| **Performance monitoring** | None (see [10-observability.md](10-observability.md)) |

### 7.2 Recommended Improvements

| Improvement | Description | Effort |
|------------|-------------|--------|
| **In-app feedback button** | Floating button that captures screenshot + browser info + current URL and sends to support queue | Medium |
| **Error auto-reporting** | When ErrorBoundary catches an exception, automatically send error details (stack trace, component tree, requestId) to a logging endpoint | Medium |
| **Usage analytics** | Track page views, button clicks, and process executions. Use to identify most/least used features and optimize accordingly | Medium |
| **Session recording (opt-in)** | Record user sessions for UX research (tools: FullStory, Hotjar). Only with explicit user consent | High |

---

## 8. Critical UX Failure Points

Ranked by severity and user impact.

### 8.1 CRITICAL (System-breaking for the user)

| Issue | Description | Impact | Fix |
|-------|------------|--------|-----|
| **White screen on unhandled error** | No React ErrorBoundary in generated window code. Any unhandled JS exception crashes the entire SPA | User loses all context, must refresh, may lose unsaved data | Add ErrorBoundary per window and at the app root level |
| **Lost form data on session timeout** | When AD_Session expires, the next API call silently fails. No state preservation | User loses potentially minutes of data entry | Intercept 401, save form state to localStorage, redirect to login, restore state after re-login |
| **Process succeeds but user sees error** | Transaction commits successfully, but error occurs during response serialization. User thinks it failed, may re-execute | Data duplication (duplicate orders, double payments) | Ensure response serialization is within the try/catch. Add idempotency keys for critical processes |

### 8.2 WARNING (Degraded experience)

| Issue | Description | Impact | Fix |
|-------|------------|--------|-----|
| **Slow DataTable on large datasets** | No virtual scrolling. Rendering 500+ rows causes browser jank | Sluggish scrolling, high memory, poor perceived performance | Implement virtual scrolling (render visible rows only) |
| **Confusing error messages** | Raw Java exceptions shown to user | User cannot understand or act on the error | Implement error mapping layer: Java exception class to user-friendly message |
| **No undo for accidental saves** | Etendo has no soft-delete by default. Once saved, the previous state is gone | User cannot recover from accidental changes | Implement audit trail (Etendo's `AD_Changelog`) and a "revert to previous version" feature |
| **PWA update confusion** | New version available but not applied. User on old version may see bugs that were already fixed | User reports "fixed" bugs, confusion about current version | Implement update prompt: "A new version is available. Click to update." Force refresh on critical updates |
| **Infinite loading spinner** | No API timeout. If the server is slow or unreachable, the spinner shows forever | User waits indefinitely, eventually force-refreshes | Add 30-second timeout on all API calls. Show "Taking longer than expected. Retry?" |

### 8.3 Improvement Roadmap

**Phase 1 (Week 1-2):** Fix CRITICAL items
- Add React ErrorBoundary (app-level + per-window)
- Add global 401 handler with login redirect and form state preservation
- Add API request timeouts (30 seconds)

**Phase 2 (Week 3-4):** Fix WARNING items
- Implement error message mapping (Java exception to user-friendly text)
- Add PWA update notification prompt
- Add virtual scrolling to DataTable

**Phase 3 (Month 2+):** Improve experience
- In-app feedback mechanism
- Locale-aware number/date/currency formatting
- Accessibility audit and fixes
- Process idempotency keys
