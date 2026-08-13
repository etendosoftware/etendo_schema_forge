# 09 -- Production Reliability

Analysis of failure modes, resilience patterns, and recovery objectives for Schema Forge generated modules running on the Etendo platform.

---

## 1. Availability Model

| Metric | Value | Notes |
|--------|-------|-------|
| **Target uptime** | 99.5% | ~43 minutes unplanned downtime per week |
| **Current uptime** | Unknown | No monitoring in place |
| **Maintenance windows** | Required | Tomcat restart for Java module deployment, database migrations (when implemented) |
| **User impact profile** | High | ERP downtime = business operations stop (orders, invoices, inventory) |

99.5% is a reasonable target for an internal ERP system. It allows for weekly maintenance windows and the occasional unplanned restart without breaking trust. Achieving higher targets (99.9%+) would require redundant infrastructure (Tomcat clustering, PostgreSQL HA) that is not currently in scope.

---

## 2. Failure Categories

### 2.1 Infrastructure Failures

| Failure | Impact | Detection | Recovery |
|---------|--------|-----------|----------|
| **PostgreSQL crash/restart** | All API calls fail, all in-flight transactions roll back | Tomcat logs: `PSQLException: Connection refused` | PostgreSQL auto-restart (systemd) or manual restart. Tomcat reconnects via HikariCP pool refresh |
| **Tomcat OOM (OutOfMemoryError)** | Server crash, all users disconnected | `java.lang.OutOfMemoryError` in `catalina.out` | Restart Tomcat. Investigate heap dump (`-XX:+HeapDumpOnOutOfMemoryError`) |
| **Disk full** | DB writes fail, log rotation blocked, Tomcat may crash | `No space left on device` in logs or `pg_dump` failures | Free disk space (compress/rotate logs, remove old backups). Add monitoring alert at 85% threshold |
| **Network partition (Tomcat to PostgreSQL)** | All DB operations time out | `PSQLException: Connection timed out` | Restore network. HikariCP will recover connections automatically once connectivity returns |
| **SSL certificate expiration** | HTTPS fails, browsers refuse to connect | Browser shows certificate error, monitoring returns 0 | Renew certificate, reload nginx. Prevent with cert-manager or cron-based renewal alerts |

### 2.2 Application Failures

| Failure | Impact | Detection | Recovery |
|---------|--------|-----------|----------|
| **EventHandler exception** | Save operation fails, transaction rolls back cleanly | User sees error toast, `catalina.out` logs the stack trace | Designed behavior. User retries or reports the issue. Fix the EventHandler logic if the exception is a bug |
| **RequestHandler unhandled exception** | 500 error returned to the SPA | HTTP 500 in browser DevTools, stack trace in `catalina.out` | Fix the handler. Add defensive try/catch to return structured error JSON instead of raw stack traces |
| **DalProcess failure mid-execution** | Partial state if process is not properly transactional | Process shows error in UI, but some records may be committed | Audit the process code for proper transaction boundaries. OBDal operates in a single transaction by default, but manual `flush()` calls can break this |
| **Hibernate session leak** | Connection pool exhaustion over time (slow degradation) | HikariCP warns: `Connection is not available, request timed out` | Restart Tomcat (immediate). Find and fix the leak: ensure `OBDal.getInstance().commitAndClose()` is called in all code paths |
| **CDI container failure** | All EventHandlers stop firing | Saves succeed but derivations do not execute (wrong computed values) | Restart Tomcat. Check Weld (CDI) logs for initialization errors. Usually caused by classpath conflicts |

### 2.3 Data Failures

| Failure | Impact | Detection | Recovery |
|---------|--------|-----------|----------|
| **Corrupted AD records** | Window will not load in Etendo, or fields render incorrectly | Etendo Classic shows "Window not found" or missing tabs/fields | Restore AD records from pre-deployment `pg_dump` backup, or run Liquibase rollback (when DB migration strategy is implemented) |
| **FK constraint violation** | Save fails with cryptic database error | User sees `ERROR: insert or update on table ... violates foreign key constraint` | Fix the data or the EventHandler that produced the invalid reference. Improve error mapping to show a user-friendly message |
| **Concurrent update conflict** | Optimistic locking exception on save | User sees `OBStaleObjectStateException` or `StaleObjectStateException` | User refreshes and retries. This is expected behavior in multi-user ERP. Ensure the frontend shows a clear "record was modified by another user" message |
| **EventHandler derivation bug** | Wrong computed values stored permanently | Business users notice incorrect totals, taxes, or statuses | Fix the derivation logic. Run a data correction script. Consider adding behavioral tests for all derivation rules |

### 2.4 Frontend Failures

| Failure | Impact | Detection | Recovery |
|---------|--------|-----------|----------|
| **SPA crash (unhandled JS exception)** | White screen, user cannot proceed | Browser console shows unhandled error | Refresh the page. **Root cause:** no React ErrorBoundary in generated window code. This is the highest-priority frontend reliability gap |
| **API timeout** | Loading spinner shown indefinitely | Network tab shows pending request | Frontend should implement request timeouts (30s default) and show a retry prompt. Currently no timeout handling exists |
| **PWA cache corruption** | App loads stale version, features missing or broken | User sees old UI after deployment | Clear service worker cache (`navigator.serviceWorker.getRegistrations()` then `unregister()`). Prevent with cache-busting version in service worker |
| **Dynamic import failure** | Specific window will not load | Browser console: `Failed to fetch dynamically imported module` | Usually caused by cache serving old chunk references after deployment. Force refresh or clear PWA cache. Mitigate with proper cache-busting hashes in filenames |
| **Auth token expired** | Silent 401 errors, confusing UX | API calls return 401, no user-visible indication | Frontend should intercept 401 responses globally and redirect to login. Currently no centralized auth error handling |

### 2.5 Transactional Email Failures

| Failure | Impact | Detection | Recovery |
|---------|--------|-----------|----------|
| **Provider unavailable** | Email sends fail after local validation | `PROVIDER_FAILED` metrics/logs spike | Keep audit records, show retry/support state, and retry only through explicit contract policy |
| **Duplicate UI submission** | Multiple emails could be sent for one action | Idempotency duplicate count | Return `DUPLICATE` without a provider call |
| **Throttle misconfiguration** | Spam risk or legitimate sends blocked | Throttle metrics by contract/tenant | Adjust contract limits and keep audit trail of blocked sends |
| **Recipient suppression** | User expects an email that is not delivered | `SUPPRESSED` audit/metric | Explain safe UI state, resolve suppression only through support workflow |
| **Kill switch activation** | All or scoped email sends disabled | Kill switch metric/alert | Confirm scope, fix incident, smoke test, then re-enable |

---

## 3. Resilience Patterns

### 3.1 Current State vs. Recommended

| Pattern | Current State | Priority | Recommendation |
|---------|--------------|----------|----------------|
| **Health checks** | None | CRITICAL | Implement `GET /health` endpoint (see [10-observability.md](10-observability.md)) |
| **React ErrorBoundary** | None in generated code | CRITICAL | Add ErrorBoundary wrapper per window. Catch JS exceptions, show "something went wrong" with retry button instead of white screen |
| **Request timeout** | None in frontend | CRITICAL | Set 30-second timeout on all API calls. Show retry prompt on timeout |
| **Auth error handling** | None (silent 401s) | CRITICAL | Global HTTP interceptor: on 401, redirect to login with return URL |
| **Circuit breaker** | None | WARNING | Frontend: after 3 consecutive failures to same endpoint, stop retrying for 30 seconds, show "service unavailable" |
| **Retry with backoff** | None | WARNING | Frontend: retry transient failures (5xx, network error) up to 3 times with exponential backoff (1s, 2s, 4s) |
| **Graceful degradation** | None | WARNING | Show last-known cached data when API is unreachable (read-only mode) |
| **Connection pool monitoring** | Default HikariCP settings | WARNING | Expose pool metrics (active, idle, waiting). Alert when utilization exceeds 80% |
| **Rate limiting** | None | WARNING | Nginx `limit_req` zone or Tomcat valve. Prevent accidental DoS from misbehaving clients |
| **Email contract idempotency** | Required for new transactional email work | CRITICAL | Derive or require an idempotency key per contract so repeated sends do not call the provider twice |
| **Email kill switches** | Required for new transactional email work | CRITICAL | Support global, tenant, contract, provider, recipient, and domain disablement |
| **Backup automation** | Likely manual `pg_dump` | WARNING | Automated daily `pg_dump` with retention policy. Periodic restore test |

### 3.2 Implementation Priority

**Phase 1 (Week 1-2): Stop the bleeding**
- React ErrorBoundary per generated window
- Global 401 interceptor with login redirect
- Request timeout on all API calls (30s)
- `GET /health` endpoint checking DB connectivity

**Phase 2 (Week 3-4): Reduce blast radius**
- Retry with exponential backoff for transient failures
- Structured error responses from all RequestHandlers (no raw stack traces)
- HikariCP pool monitoring with alerting threshold
- Automated daily database backup with verification

**Phase 3 (Month 2+): Harden**
- Circuit breaker in frontend HTTP layer
- Rate limiting at nginx
- Graceful degradation for read-heavy windows
- Chaos engineering exercises (see section 5)

---

## 4. Recovery Time Objectives

Recovery time = Detection + Diagnosis + Fix + Verification.

| Failure Type | Detection | Diagnosis | Fix | Verify | Total RTO |
|-------------|-----------|-----------|-----|--------|-----------|
| **Tomcat crash** | 1-5 min (health check) | 5 min (check logs) | 2 min (restart) | 2 min (smoke test) | **10-15 min** |
| **PostgreSQL crash** | 1-5 min (health check) | 5 min (check pg logs) | 2-10 min (restart or failover) | 2 min | **10-20 min** |
| **Tomcat OOM** | 1-5 min | 15 min (heap dump analysis) | 2 min (restart with more heap) | 2 min | **20-25 min** (immediate restart: 5 min, root cause later) |
| **Corrupted AD records** | 10-60 min (user reports) | 15-30 min (identify bad records) | 10-30 min (restore from backup or run migration rollback) | 10 min | **45-130 min** |
| **Bad deployment (code bug)** | 5-30 min (user reports or error spike) | 15 min | 10 min (rollback to previous module) | 10 min | **40-65 min** |
| **Disk full** | 1-5 min (alert) | 2 min | 5-15 min (free space) | 2 min | **10-25 min** |
| **SSL cert expiration** | Immediate (users cannot connect) | 2 min | 5-15 min (renew + reload) | 2 min | **10-20 min** |

> **Note:** Without monitoring, detection times increase from minutes to hours (users call support). Health checks and alerting are the highest-leverage reliability investment.

---

## 5. Chaos Engineering (Future)

Controlled failure injection to verify that resilience patterns work as expected. Only run in staging environments.

| Experiment | How | Expected Behavior | Validates |
|-----------|-----|-------------------|-----------|
| **Kill PostgreSQL** | `systemctl stop postgresql` | API returns 503, frontend shows "service unavailable", no data corruption | Health check, error handling, graceful degradation |
| **Fill disk to 95%** | `dd if=/dev/zero of=/tmp/fill bs=1G count=N` | Alert fires at 90%, log rotation continues, DB rejects writes with clear error | Disk monitoring, log rotation, error messages |
| **Slow network** (Tomcat to DB) | `tc qdisc add dev eth0 root netem delay 500ms` | API response times increase, frontend shows loading state, no timeouts at 500ms delay | Timeout configuration, loading UX |
| **Restart Tomcat under load** | `shutdown.sh` while users are active | In-flight requests fail with connection reset, users retry and succeed after restart | Session recovery, frontend retry logic |
| **Expire all sessions** | `DELETE FROM ad_session` | Users redirected to login, no white screen, form data handling | Auth error handling, state preservation |
| **Return 500 from one endpoint** | Mock/interceptor on specific RequestHandler | Frontend shows error for that window, other windows unaffected | ErrorBoundary isolation, blast radius |

### Running Chaos Experiments

1. Ensure a staging environment exists that mirrors production
2. Establish baseline metrics (response times, error rates)
3. Run one experiment at a time
4. Document actual vs. expected behavior
5. Fix gaps before running the next experiment
6. Re-run failed experiments after fixes

---

## 6. Dependency on Monitoring

Most of the recovery times and resilience patterns described in this document depend on observability infrastructure that does not yet exist. Without monitoring:

- Detection times increase from minutes to hours
- Diagnosis requires SSH access and manual log searching
- Trends (slow memory leak, connection pool exhaustion) go unnoticed until they cause an outage
- There is no way to verify that resilience patterns are working

See [10-observability.md](10-observability.md) for the monitoring implementation plan.
