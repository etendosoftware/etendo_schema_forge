# Email Inventory: every email Etendo sends

> **Scope:** both delivery stacks — the Etendo GO transactional-email contracts
> (Etendo Go SaaS) and the classic Etendo Core SMTP path (backoffice + modules).
> **Task:** ETP-5003 — inventory the system emails and apply a unified template.
> This document is the inventory half; the unified template is the follow-up work.
> **Sources read:** `modules/com.etendoerp.go/src/com/etendoerp/go/schemaforge/email/**`,
> `modules/com.etendoerp.go/src/com/etendoerp/go/rest/**`, `src/org/openbravo/email/**`,
> `src/org/openbravo/portal/**`, `src/org/openbravo/erpCommon/**`, `src/com/etendoerp/email/spi/**`,
> `modules/com.smf.*`, `tools/app-shell/src/components/contract-ui/**`.

---

## 1. Map — who renders through the shared layout

✅ = renders through `EmailLayout`, the shared template (ETP-5003).
⬜ = still builds its own body.

```mermaid
graph LR
  subgraph GO["Etendo GO — email contracts"]
    subgraph ACCOUNT["Account / auth"]
      A1["✅ company-invitation"]
      A2["✅ new-account"]
      A3["✅ environment-ready"]
      A4["✅ reset-password"]
      A5["✅ password-changed"]
      A6["✅ login-alert<br/><i>no producer</i>"]
    end
    subgraph DOCS["Documents — F3 pending"]
      D1["⬜ sales-invoice-send"]
      D2["⬜ sales-order-send"]
      D3["⬜ sales-quotation-send"]
      D4["⬜ goods-shipment-send"]
      D5["⬜ purchase-order-send"]
      D6["⬜ return-to-vendor-send"]
    end
  end

  subgraph CORE["Etendo Core — SMTP"]
    C1["⬜ Print &amp; Send"]
    C2["⬜ portal: new user<br/><i>F5 pending</i>"]
    C3["⬜ portal: account cancelled<br/><i>F5 pending</i>"]
    C4["⬜ alert rules"]
  end

  subgraph MODULES["Modules — out of scope"]
    M1["⬜ TicketBAI error"]
    M2["⬜ currency sync failure"]
    M3["⬜ SII report"]
    M4["⬜ scheduled reports"]
  end

  LAYOUT["EmailLayout<br/>shared template"]
  PROVIDER["API Gateway<br/>provider"]
  SMTP["SMTP"]

  A1 --> LAYOUT
  A2 --> LAYOUT
  A3 --> LAYOUT
  A4 --> LAYOUT
  A5 --> LAYOUT
  A6 --> LAYOUT
  LAYOUT --> PROVIDER

  D1 --> PROVIDER
  D2 --> PROVIDER
  D3 --> PROVIDER
  D4 --> PROVIDER
  D5 --> PROVIDER
  D6 --> PROVIDER

  C1 --> SMTP
  C2 --> SMTP
  C3 --> SMTP
  C4 --> SMTP
  M1 --> SMTP
  M2 --> SMTP
  M3 --> SMTP
  M4 --> SMTP

  SMTP -. "no SMTP configured:<br/>GoProviderEmailSender" .-> PROVIDER

  classDef done fill:#dcfce7,stroke:#16a34a,color:#14532d
  classDef todo fill:#f1f5f9,stroke:#94a3b8,color:#334155
  classDef hub fill:#fef9c3,stroke:#ca8a04,color:#713f12
  class A1,A2,A3,A4,A5,A6 done
  class D1,D2,D3,D4,D5,D6,C1,C2,C3,C4,M1,M2,M3,M4 todo
  class LAYOUT,PROVIDER,SMTP hub
```

**6 of 20 today.** F3 adds the six document emails and F5 the two portal ones, for 14 — the agreed
scope. The four module emails and the alert rules stay on their own bodies by decision, not by
omission.

## 2. The two delivery stacks

| | Stack A — GO email contracts | Stack B — Core SMTP |
|---|---|---|
| Who uses it | Etendo Go (SaaS app + React shell) | Classic backoffice, portal, fiscal/utility modules |
| Entry point | `POST /sws/neo/email-contracts/{contract}/send` | `EmailManager.sendEmail(...)` → `EmailSenderDispatcher` |
| Who renders the HTML | **External API Gateway email service** (template id + JSON data) | Rendered in Java/FreeMarker, sent as a MIME message |
| Transport | HTTPS POST to the provider | SMTP (`javax.mail`) |
| Config | `etendo.go.email.provider.baseUrl` / `.apiKey` / `.enabled` / `.timeoutMs` (or `ETGO_EMAIL_PROVIDER_*` env) | AD SMTP config (client/org cascade, `SmtpCascadeResolver`) |
| Safety net | throttling, idempotency, kill switch, audit (`EmailSafetyStore`, `EmailDeliveryPolicy`) | none beyond the AD config |

**Bridge between the two:** `GoProviderEmailSender` implements the Core SPI
`com.etendoerp.email.spi.EmailSender`. When an environment has **no SMTP configured**, any Core-stack
email falls back to the GO provider (rendered with the provider's `custom` bring-your-own-content
template). It is a *fallback, not an override* — SMTP, when configured, still wins.

---

## 3. Master table — every email

### 2.A — Etendo GO: document emails ("send this invoice to the customer")

All of them share one implementation, `DefaultDocumentSendEmailContract`, and are triggered from the
React shell (`SendDocumentModal` → `documentEmailSend.js`). Contract name convention:
`` `${windowName}-send` `` (`resolveDocumentEmailContract`).

| # | Email | Contract name | Trigger | Provider template | Key files |
|---|---|---|---|---|---|
| 1 | Sales invoice to customer | `sales-invoice-send` | Send button / kebab in the Sales Invoice window | `invoice` (branded); `custom` if the operator edits subject/message | `contracts/SalesInvoiceSendEmailContract.java`, `contracts/SalesDocumentEmailContractProvider.java`, `contracts/DalInvoiceEmailDocumentResolver.java` |
| 2 | Sales order to customer | `sales-order-send` | Sales Order window | `custom` | `contracts/SalesOrderSendEmailContract.java`, `contracts/DalOrderEmailDocumentResolver.java` |
| 3 | Sales quotation to customer | `sales-quotation-send` | Sales Quotation window | `custom` | `contracts/SalesQuotationSendEmailContract.java` |
| 4 | Goods shipment / delivery note | `goods-shipment-send` | Goods Shipment window | `custom` | `contracts/GoodsShipmentSendEmailContract.java`, `contracts/DalShipmentEmailDocumentResolver.java`, `contracts/ShipmentDocumentEmailContractProvider.java` |
| 5 | Purchase order to vendor | `purchase-order-send` | Purchase Order window | `custom` | `contracts/PurchaseOrderSendEmailContract.java`, `contracts/DalPurchaseOrderEmailDocumentResolver.java`, `contracts/PurchaseDocumentEmailContractProvider.java` |
| 6 | Return to vendor | `return-to-vendor-send` | Return to Vendor window | `custom` | `contracts/ReturnToVendorSendEmailContract.java` |

Shared plumbing for 1–6:
`DefaultDocumentSendEmailContract.java`, `TransactionalEmailService.java`,
`NeoBuiltInEndpointHandler.java` (routes `email-contracts/{name}/send`),
`DocumentDownloadTokenService.java` (signed download link), `EmailMessageEdits.java` /
`EmailRecipientEdits.java` (operator overrides), `SalesDocumentEmailRecipientResolver.java`.
Frontend: `tools/app-shell/src/components/contract-ui/SendDocumentModal.jsx`,
`documentEmailSend.js`, `windows/custom/shared/useRowEmailModal.jsx`,
`windows/custom/shared/PreviewActionButtons.jsx`.

### 2.B — Etendo GO: account / auth emails

| # | Email | Contract name | Trigger (caller) | Provider template | Key files |
|---|---|---|---|---|---|
| 7 | New account / welcome | `new-account` | signup — `EtendoGoJwtServlet:619` → `sendNewAccount` | `custom` (subject+body built in Java, ES/EN) | `contracts/AccountLinkEmailContract.java`, `contracts/CoreEmailContractProvider.java` (`newAccountContent`), `rest/TransactionalAuthEmailSender.java` |
| 8 | Password reset link | `reset-password` | forgot-password — `EtendoGoJwtServlet:2336` → `sendPasswordReset` | `reset-password` (branded, provider-owned copy) | same as above + `rest/EtendoGoAuthLinkBuilder.java` |
| 9 | Password changed notice | `password-changed` | after a password change — `EtendoGoJwtServlet:970` | `custom` (`passwordChangedContent`) | `contracts/AccountNoticeEmailContract.java`, `CoreEmailContractProvider.java` |
| 10 | Environment ready | `environment-ready` | tenant provisioning finished — `EtendoGoJwtServlet:1461` | `custom` (`environmentReadyContent`), links to `/dashboard` | `contracts/AccountLinkEmailContract.java`, `rest/EtendoGoAccountProvisioning.java` |
| 11 | Company invitation | `company-invitation` | invite a user to a company — `CompanyInvitationService.java:200` | `custom` (subject/body in Java, ES/EN) | `contracts/CompanyInvitationEmailContract.java`, `rest/CompanyInvitationService.java`, `rest/CompanyInvitationDalHelper.java` |
| 12 | Login alert (new IP/device) | `login-alert` | **no in-repo caller found** — contract is registered and reachable over the endpoint only | `login-alert` (branded) | `contracts/LoginAlertEmailContract.java` |

### 2.C — Etendo Core (classic SMTP)

| # | Email | Trigger | Template / format | Key files |
|---|---|---|---|---|
| 13 | Print & Send a document (invoice, order, …) from the backoffice | "Send by email" in the print flow | **AD template**: `TemplateInfo.EmailDefinition` (subject + body per document template/language) + PDF and record attachments | `src/org/openbravo/erpCommon/utility/reporting/printing/EmailUtilities.java`, `PrintController.java`, `TabAttachments.java` |
| 14 | New portal user (credentials / access granted) | `GrantPortalAccessProcess` → `EmailEventManager` | **FreeMarker**: `src/org/openbravo/portal/templates/email-new-user.ftl`; subject from AD_Message via `OBMessageUtils` | `src/org/openbravo/portal/NewUserEmailGenerator.java`, `PortalEmailBody.java` |
| 15 | Portal account cancelled | `AccountChangeObserver` → `EmailEventManager` | **FreeMarker**: `email-account-cancelled.ftl`; subject `Portal_AccountCancelledSubject` | `src/org/openbravo/portal/AccountCancelledEmailGenerator.java` |
| 16 | Alert rule notification (`[OB Alert] …`) | `AlertProcess` background job | **plain text hardcoded in Java**, header from AD_Message `AlertMailHead` | `src/org/openbravo/erpCommon/ad_process/AlertProcess.java:451-470` |

Shared plumbing for 13–16: `src/org/openbravo/email/EmailEventManager.java`,
`EmailEventContentGenerator.java`, `SmtpCascadeResolver.java`,
`src/org/openbravo/erpCommon/utility/poc/EmailManager.java` / `EmailInfo.java`,
`src/com/etendoerp/email/spi/{EmailSender,EmailSendContext,DefaultSmtpEmailSender}.java`,
`src/org/openbravo/email/actionhandler/TestSmtpConnectionActionHandler.java` (test-connection button).

### 2.D — Module-specific emails

| # | Email | Trigger | Template / format | Key files |
|---|---|---|---|---|
| 17 | TicketBAI submission error | TicketBAI send failure | HTML string built in Java, texts from AD_Message | `modules/com.smf.ticketbai/src/com/smf/ticketbai/email/ErrorEmailSender.java`, `TbaiEmailSender.java` |
| 18 | Currency conversion-rate sync failure | scheduled rate sync fails | HTML from two AD_Message keys (`String.format`) | `modules/com.smf.currency.conversionrate/src/com/smf/currency/conversionrate/SyncFailureEmailSender.java` |
| 19 | SII multi-report result | `ProcesoInformeMultiple` | plain Java-built message | `modules/org.openbravo.module.sii/src/org/openbravo/module/sii/reports/ProcesoInformeMultiple.java` |
| 20 | Scheduled/AD report delivery | report scheduled with email delivery | AD report definition + attachment | `modules_core/org.openbravo.client.application/src/org/openbravo/client/application/report/BaseReportActionHandler.java` |

**Not an Etendo email:** Stripe Checkout receipts. `HostedCheckoutService` only passes
`customer_email` to Stripe; the receipt is sent by Stripe, not by us.

---

## 4. Where does the format live? (the question behind the question)

| Format source | Which emails | What it means for changing the copy |
|---|---|---|
| **External provider template** (`invoice`, `reset-password`, `login-alert`) | #1 (untouched sends), #8, #12 | Copy and branding live **outside this repo**, in the API Gateway email service. Java only supplies JSON variables (`name`, `document_number`, `amount`, `download_link`, `link`, `ip`, `date`). Changing the look = changing the provider template. |
| **Provider `custom` template + subject/body built in Java** | #2–#6, #7, #9, #10, #11, and #1 when the operator edits the message | The provider renders a generic shell; the actual subject/body strings are **hardcoded Java literals** with an `es_ES` / fallback-English branch. No template file. |
| **FreeMarker `.ftl` in the repo** | #14, #15 | `src/org/openbravo/portal/templates/*.ftl` — the only real, editable email template files in the codebase. |
| **AD data (Application Dictionary)** | #13 (`EmailDefinition` per document template + language), and subject strings of #14–#18 (AD_Message) | Editable by config/translation, no code change needed. |
| **Plain string in Java** | #16, #17, #18, #19 | Hardcoded; needs a code change (or an AD_Message edit where it uses `OBMessageUtils`). |

### Notable gaps found while mapping (to confirm)

- **No email template files exist in `com.etendoerp.go`** — `find` for `*.hbs|*.html|*.ftl|*.vm` returns nothing. Every GO email is either provider-rendered or a Java string literal.
- **Copy is duplicated ES/EN inside Java** (`CoreEmailContractProvider`, `CompanyInvitationEmailContract`) instead of going through i18n. Two locales only; any other language falls back to English.
- **`login-alert` (#12) has no producer** in either repo — registered contract, never called.
- **Known divergence documented in code** (`DefaultDocumentSendEmailContract`): the send modal derives the document-type label from the UI locale while `documentTypeLabel()` is a fixed Spanish string → subject differs between modal preview and delivered email under `en_US`.

---

## 5. Related existing docs

- `modules/com.etendoerp.go/docs/transactional-email-contracts.md`
- `modules/com.etendoerp.go/docs/document-email-contract-implementation.md`
- `docs/email-contracts.md`, `docs/transactional-email-framework.md`
- `modules/com.etendoerp.go/docs/plans/2026-08-10-go-provider-email-sender-design.md`
