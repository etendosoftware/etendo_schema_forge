# ETP-5003 — Plan: one base template for every Etendo email

**Status:** proposal, pending the F0 spike below.
**Companion doc:** `docs/email-inventory.md` (what we send today and from where).
**Goal:** every Etendo email renders through a single layout owned by this repo. Only the content
block varies per email.

---

## 1. Where we are

- 20 emails, two stacks, no shared layout (`docs/email-inventory.md`).
- Nine GO emails plus the Core SMTP fallback already funnel through **one provider template**,
  `custom` — the provider's bring-your-own-content template, to which we hand a rendered
  `subject` + `body`.
- What we hand it is HTML concatenated by hand in Java. Verbatim, from
  `DefaultDocumentSendEmailContract#buildBody`:

  ```java
  return "<p>Le enviamos su " + documentTypeLabel() + " " + document.getDocumentNumber()
      + ".</p>" + downloadLinkParagraph(downloadLink);
  ```

- Three provider-side branded templates exist (`invoice`, `reset-password`, `login-alert`) whose
  design lives outside this repo. The provider allowlist is exactly
  `custom`, `reset-password`, `login-alert`, `invoice` — adding a new branded template is
  gateway-side work, not ours.

**The good news:** `custom` is already the funnel. We do not need a new integration — we need to
send it a properly rendered body instead of two bare `<p>` tags.

---

## 2. The architectural decision

| | Option A — layout in this repo | Option B — ask the gateway team for an `etendo-base` template |
|---|---|---|
| Who owns the design | us, versioned, reviewable in PRs | the gateway team, invisible from here |
| Rollout | ship with a normal release | cross-team, cross-repo, blocked on their allowlist |
| Testable | yes — snapshot tests on the HTML | no |
| i18n | ours, per AD language | theirs |
| Risk | double-shell (see F0) | coordination + we cannot fix a rendering bug ourselves |

**Recommendation: Option A.** Render the full HTML here, keep sending it through `custom`. It is the
only option where the design is versioned next to the code that produces it, and it needs nothing
from another team. Option B stays on the table for the branded templates we may keep (§6).

---

## 3. F0 — the spike that gates everything

**Question: what does the provider's `custom` template wrap around our `body`?**

If it injects its own header/footer/`<html>` shell, sending a full document produces a double shell
and the plan changes shape (we would send a fragment and negotiate the shell with the gateway
team instead).

How to answer it: send one `custom` email through
`POST /sws/neo/email-contracts/company-invitation/send` against staging with a body carrying a
recognizable marker, then read the delivered source. Half a day, and it decides §4.

Everything below assumes `custom` passes the body through essentially untouched.

---

## 4. The base layout

New renderer, e.g. `com.etendoerp.go.schemaforge.email.render.EmailLayout`, with a small block
vocabulary. Every contract composes blocks; no contract ever writes a tag.

```
EmailLayout.render(
    EmailContent.builder()
        .greeting(name)                       // "Hola, {name}:"
        .paragraph(...)                       // one or more, bold spans allowed
        .cta(label, url)                      // optional — the black button
        .fallbackLink(url)                    // "Si el botón no funciona…" — only with a cta
        .note(...)                            // fine print: expiry, "ignora este correo"
        .signature()                          // "Saludos, Equipo de Etendo Go"
        .build())
```

### Design tokens (from the Figma spec)

| Token | Value | Where |
|---|---|---|
| Page background | `#F5F7F9` | outer table |
| Card | `#FFFFFF`, `box-shadow 0 1px 2px rgba(18,18,23,.05)` | inner table |
| Divider | `1px solid #E8EAEF` | under the logo |
| Body text | `#555B6D`, Inter 500 | paragraphs and note |
| Paragraph | 12px / 20px | greeting + body copy |
| Fine print | 12px / 16px | note block |
| Button | bg `#121217`, radius 8px, padding 8×12, label `#FFFFFF` Inter 500 14/24 | CTA |
| Logo | isotype 40 × 40 + *Etendo* as text, Inter 600 | header |

**Two deliberate deviations from the Figma frame**, both standard email practice:

- **Card width 600px, not 541px.** 600 is the safe maximum across clients; 541 is the artboard, not
  a constraint. Content column becomes 600 − 2×56 padding ≈ 488px (Figma shows 429px inside 541 —
  the same ~56px gutter).
- **Everything is `<table>` + inline CSS.** The spec is written in flexbox and absolute positioning;
  neither survives Outlook. Fixed positioning cannot be used at all.

### Email-client constraints the renderer must respect

- Tables for layout, inline styles only, no `flex`/`grid`/`position`.
- Bulletproof button (VML fallback for Outlook desktop) — a styled `<a>` alone loses its background
  there.
- **Logo: reuse the onboarding page's lockup** — `<img src="{appBaseUrl}/favicon.png">` (the
  513×513 isotype, `tools/app-shell/public/favicon.png`) next to the word *Etendo* as **live text**,
  exactly as `https://go.etendo.cloud/onboarding` already renders it. Two wins: no wordmark asset to
  host, and when a client blocks images the brand still reads, because half of it is text. Build the
  The logo URL is **pinned to production**, `https://go.etendo.cloud/favicon.png` — verified
  `200 image/png`, 6349 bytes (byte-identical to the file in the repo), served from CDN with
  `cache-control: public, max-age=31536000, immutable`. Pinned rather than derived from
  `PublicUrlResolver.resolveConfiguredAppBaseUrl()` because an email is read long after it is sent:
  a staging-hosted logo breaks once that environment is gone. The **CTA link keeps following the
  environment** (`EtendoGoAuthLinkBuilder`) — only the asset is pinned.
  Accepted trade-off: this ties a long-lived asset to the app's public production domain, so a
  future domain change would break the logo in already-sent emails. Considered and rejected for now:
  a dedicated assets host, a `cid:` inline attachment, and a text-only header. Note the file is
  served by S3/CDN, not by the application server, so this adds no load to production. Moving to a
  dedicated assets host later is a one-constant change.
  Note `tools/app-shell/public/logo-etendo.png` (230×58) also exists if a single-image lockup is
  preferred, but it loses the image-blocked fallback.
- `max-width:600px`, mobile-first fluid table so it does not break under 480px.
- Keep the whole HTML under ~100KB or Gmail clips it.
- Provide a `text/plain` alternative — several of these are transactional and deliverability-relevant.

---

## 5. Rollout

| Phase | Scope | Why this order |
|---|---|---|
| **F0** | Spike: what `custom` wraps (§3) | Gates the rest |
| **F1** | Renderer + tokens + snapshot tests. Apply to **`company-invitation`** only | Its design is already specified — the screenshot in ETP-5003 *is* this email. One email through the whole pipe, validated in real clients (Gmail, Outlook desktop/web, Apple Mail, mobile) before touching anything else |
| **F2** | Remaining auth emails: `new-account`, `password-changed`, `environment-ready` | Same shape (greeting + copy + CTA + note), same `custom` template, no external dependency |
| **F3** | The 6 document emails via `DefaultDocumentSendEmailContract` | One change covers all six. **Also fixes today's visible defect:** a branded sales invoice drops to the bare `<p>` layout the moment an operator edits the message — after F3 both paths render the same |
| **F4** | Move the hardcoded ES/EN literals into AD_Message / i18n | Decoupled from layout; do it once the blocks are stable so the keys match the block vocabulary |
| **F5** | Core SMTP + modules: route `EmailInfo.setContent` through the same renderer | Portal `.ftl`s, alerts, TicketBAI, currency sync. Lower value, do last |
| **F6** | Decide the fate of the branded provider templates (§6) | Needs F1–F3 shipped to compare side by side |

---

## 6. What happens to `invoice`, `reset-password`, `login-alert`

Once F1–F3 land, our own layout covers those cases. Two options per template: keep the
provider-branded one (and accept that its design is unversioned and diverges), or point the contract
at `custom` and render it here. **Recommendation:** migrate all three, so there is exactly one
answer to "what does an Etendo email look like". Handle `login-alert` in the same pass — it has no
producer in either repo (`docs/email-inventory.md` §3), so decide whether to wire it or drop it.

---

## 7. Open questions

1. **`custom` shell** — F0. Blocks everything.
2. ~~**Logo hosting.**~~ **Resolved** — `https://go.etendo.cloud/favicon.png` (pinned to
   production) + *Etendo* as text, per §4.
3. **Per-tenant branding.** Document emails go to a tenant's *customers*. Does the card show the
   Etendo logo, or the tenant's? The Figma spec covers the Etendo-to-user case (invitation) but not
   the tenant-to-customer case (invoice). This one changes the block vocabulary — worth settling
   before F3.
4. **Dark mode.** Several clients auto-invert. A `#121217` button on `#FFFFFF` inverts badly; decide
   whether to pin colors (`color-scheme` / `prefers-color-scheme`) or accept the inversion.
5. **Language coverage.** Today it is ES/EN hardcoded. F4 should state which AD languages are in
   scope.

---

## 8. Testing

- **Snapshot test per contract** on the rendered HTML — catches accidental layout drift.
- **A guard test that no contract emits markup**: no `"<p>"` / `"<a href"` literals outside the
  renderer. This is the rule that keeps the unification from eroding.
- **Manual client matrix** at F1 and again at F3 (Gmail web/app, Outlook desktop/web, Apple Mail,
  iOS/Android), attached as delivery evidence.
