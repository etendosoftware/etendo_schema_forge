# ETP-5396 local lifecycle test tool

The development lifecycle tool makes the demo trial and renewal boundaries testable without
waiting for real time. It is deliberately available only from a Vite development build and from a
backend configured as a local runtime.

## Enable it locally

Add these properties to the untracked local `etendo_core/config/Openbravo.properties`:

```properties
etendo.go.runtime.environment=local
etendo.go.dev.lifecycle.tool.enabled=true
```

Restart the backend after changing them. The frontend route is:

```text
http://localhost:3100/dev/lifecycle
```

The route is compiled only when `import.meta.env.DEV` is true. The backend endpoint is
`/sws/go/dev/lifecycle`; it answers the normal 404 unless both the runtime environment is exactly
`local` and the explicit tool flag is enabled. The default for both controls is disabled.

## What it changes

- `Demo trial days` and `Renewal grace days` override the current backend process only. They are
  useful for short boundary tests and reset when the backend restarts.
- An owned environment can receive a test `trialStartedAt` timestamp.
- An owned environment can receive a test subscription status and renewal due timestamp.
- The tool lists only environments owned by the authenticated account. Invited environments cannot
  be modified through this surface.

The saved lifecycle timestamps use UTC ISO-8601 values. The account and environment APIs remain the
source of truth for the resulting `trialExpiresAt`, `trialDaysRemaining`, and `accessState`.

## Suggested checks

1. Set `Demo trial days` to `1`, select a demo, and set its start to the current time. Confirm the
   environment API reports an active trial and one remaining day.
2. Set the same demo start to a timestamp in the past. Confirm the owner and every tenant role are
   blocked while account billing remains available.
3. Select a productive environment, set `PAST_DUE`, set a due timestamp, and use a short grace
   period. Confirm access during grace and suspension after the deadline.
4. Restart the backend and confirm the temporary day overrides are gone while persisted timestamps
   remain.
5. Remove either local property and confirm `/sws/go/dev/lifecycle` returns 404. Build the frontend
   with `vite build` and confirm `/dev/lifecycle` is absent from the production route bundle.

The tool is a QA aid, not a production administration surface. Production configuration must keep
`etendo.go.runtime.environment` different from `local` and leave
`etendo.go.dev.lifecycle.tool.enabled` unset or false.
