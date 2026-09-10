# PSD2 API key provisioning — ETP-5061

## Status

Implementation started on `feature/ETP-5061`. The PSD2 extension contract, Go provider, private proxy
endpoint, and secret-free audit writer are implemented in the local Etendo module sources.

## Architecture

`com.etendoerp.psd2.bank.integration` owns the `Psd2ApiKeyProvider` contract and resolves an optional
implementation through Weld. `com.etendoerp.go` implements the provider. The dependency remains one
way: Go depends on PSD2, while PSD2 never depends on Go.

When a PSD2 operation requests a key, the provider reads the existing encrypted value first. If no
value exists, it opens an independent JDBC transaction, acquires a PostgreSQL advisory lock scoped to
the client, rechecks the value, calls the private proxy, encrypts the returned key, and commits it to
`AD_Client.EM_PSD2_API_KEY`. The business transaction that triggered the operation is never used for
remote provisioning or key persistence.

The proxy endpoint is `/internal/provision`. It requires a dedicated provisioning credential and an
allowlisted source IP/network. The client ID is the idempotency boundary. The proxy stores only the
SHA-256 hash of the API key and never logs the raw value.

## Audit

Provisioning events are written to `PSD2_API_KEY_AUDIT` in a separate transaction. The audit records
the client, event, status, correlation ID, HTTP status, error classification, duration, and source.
It never records API keys, bearer tokens, provisioning credentials, or raw proxy payloads.

## Verification

- Root Etendo compilation: `./gradlew :compileJava` — successful.
- Module compilation: PSD2 and Go `compileJava` tasks — successful.
- Proxy Python syntax compilation — successful.
- Proxy pytest suite is currently blocked by the pre-existing missing test fixture
  `tests/fixtures/saltedge_private_key.pem`.
