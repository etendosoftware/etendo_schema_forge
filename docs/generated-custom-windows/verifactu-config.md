# Verifactu Config

## Intent

Backend artifact window that stores the Verifactu configuration record for an organization. End users interact with this data exclusively through the **Fiscal Config** window (`fiscal-config`); this artifact is not exposed as a standalone menu entry.

Verifactu applies to organizations in mainland Spain/Baleares, Canarias, Ceuta, and Melilla whose annual revenue is at or below the SII threshold (≤ €6.010.121).

## What this window should allow

- Read and update the Verifactu configuration record: applicable tax type, default QR flag, and read-only system metadata.
- Enforce the lock: once `isReady` is set to `Y` (activated), the `tAXType` and `defaultQR` fields become immutable — the custom UI enforces this client-side and the backend enforces it server-side.
- Auto-fill the Verifactu submission gate on save: `VerifactuConfigReadyHandler` (`@Named("verifactu-config-ready-handler")`, in `com.etendoerp.go`) is wired as this entity's `javaQualifier` in `decisions.json` and runs on `afterHandle()` for POST/PUT/PATCH. It sets `is_ready='Y'` and `in_vfactu_system=now()` via native SQL unless both are already set (idempotent; also backfills the date on legacy records that have `is_ready='Y'` but a still-NULL date). This closes a gap where classic Etendo's "Marcar como listo" process never ran from Etendo Go, so invoices were never queued for Verifactu submission — `InvoiceSendingListener.getAllIssuersWithVfactuConfig()` requires exactly these two fields to queue an org. Because the field is now purely backend-managed and set automatically on save, there is nothing left for a user to see or edit, which is why `inVfactuSystem` is `discarded` below instead of `readOnly`.
- Provide the `cabeceraDeConfiguraciónVerifactu` entity that `useFiscalConfig.js` fetches by `organization` filter and `VerifactuSection.jsx` writes via PUT.

## Custom UI

This window has no standalone custom UI. All custom rendering, validation, and save logic lives in:

- `tools/app-shell/src/windows/custom/fiscal-config/VerifactuSection.jsx` — no longer shows the "Fecha de Acogida" (`inVfactuSystem`) field or an "Activo" status badge; both were removed since the value is now fully backend-managed (see `VerifactuConfigReadyHandler` above) and the underlying lock behavior does not depend on displaying either.
- `tools/app-shell/src/windows/custom/fiscal-config/CertSection.jsx` (certificate upload for Verifactu)

## Key fields

| Field | Notes |
|-------|-------|
| `tAXType` | Applicable tax regime: `01` (IVA), `02` (IPSI — Ceuta/Melilla), `03` (IGIC — Canarias). Required before activation. |
| `defaultQR` | Include QR code on invoices by default |
| `isReady` | Lock flag — once `Y`, configuration is immutable |
| `issuerNIF` | NIF of the issuing organization (read-only, set by backend) |
| `systemStartat` | System activation timestamp (read-only) |
| `systemStopat` | System deactivation timestamp (read-only) |
| `incidentReport` | Incident report reference (read-only) |

## Tax type codes

| Code | Tax | Territory |
|------|-----|-----------|
| `01` | IVA | España / Baleares |
| `02` | IPSI | Ceuta / Melilla |
| `03` | IGIC | Canarias |

## See also

- Primary entry point: `docs/generated-custom-windows/fiscal-config.md`
- Architecture: `docs/architecture-overview.md`

## Automated evidence

The `decisions.json` declares `attachments: false`, so the Attachments tab is explicitly disabled for this window.

- `modules/com.etendoerp.go/src/com/etendoerp/go/schemaforge/VerifactuConfigReadyHandler.java` — `afterHandle()` hook that auto-fills `is_ready`/`in_vfactu_system` on save.
- `modules/com.etendoerp.go/src-test/.../VerifactuConfigReadyHandlerTest.java` — 16 JUnit tests covering the idempotent set, legacy-record date backfill, and no-op cases.
