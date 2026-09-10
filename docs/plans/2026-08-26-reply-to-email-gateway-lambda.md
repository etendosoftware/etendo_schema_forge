# Reply-To on document emails — the gateway Lambda mapping

**Status:** Done and verified in a real inbox on 2026-08-26. The Etendo side landed first; the
gateway Lambda turned out to live in `etendosoftware/etendo-go-infraestructure`
(`lambda/ses-email-sender/`, Python, not JavaScript as first assumed) and the mapping was added
there, merged, and published. Pressing Reply on a document email now addresses the operator who
sent it.

**Raised:** 2026-08-26, during ETP-5003.

## The problem

Every email leaves through a verified `noreply@etendo.cloud` sender, because SES requires the `From`
domain to be verified and it cannot be a per-tenant address. A customer receiving an invoice
therefore has no way to answer the operator who sent it.

`Reply-To` has no such constraint in SES — it accepts any address, verified or not — so the
operator's own address can travel there while `From` stays as it is.

## What is already done (Etendo side)

| Piece | Where |
|---|---|
| Resolve the operator's address from the session | `EmailSenderIdentity.resolveReplyTo()` |
| Pass it into the provider request | `DefaultDocumentSendEmailContract.resolve()` |
| Emit it in the gateway payload | `EmailProviderRequest.toProviderPayload()` (pre-existing) |
| Warn when no address resolves | `EmailSenderIdentity`, WARN level |
| Tests | `EmailSenderIdentityTest`, plus two cases in `DefaultDocumentSendEmailContractTest` |

The address is derived server-side and never accepted from the browser: `replyTo` stays in
`TransactionalEmailService.FORBIDDEN_COMMAND_FIELDS`. It reads `AD_User.EMAIL` and falls back to
`USERNAME` when that is an address — necessary, not cosmetic, because Etendo GO signs users up by
email and every account that has actually sent a document email on the local instance has a null
`EMAIL`.

## What was missing

The payload reaches the API Gateway with `replyTo` and the Lambda behind it does not map it onto
SES's `ReplyToAddresses`. The field is received and dropped in translation.

```
Etendo  ──{to, template, data, replyTo}──▶  Lambda  ──{Source, Destination, Message}──▶  SES
                                              ▲                                    ▲
                                     receives replyTo                    never sees ReplyToAddresses
```

### Evidence this is not our side

A POST straight to the gateway, with **no Etendo in the path**, carrying an explicit `replyTo`:

```
POST https://7s6vd40j6i.execute-api.eu-west-3.amazonaws.com/prod/send-email
{"to": "...", "template": "custom", "replyTo": "<an address>", "data": {"subject": "...", "body": "..."}}
```

Answered `200 {"message": "Email sent"}` and the mail arrived **without** a `Reply-To` header —
pressing Reply in Gmail addresses `noreply@etendo.cloud`. With no Java involved, the drop can only
be downstream of the request.

### The change made

`lambda/ses-email-sender/index.py` normalizes `replyTo` (accepting a string or a list) and passes it
to SES as `ReplyToAddresses`, omitting the key entirely when no address is supplied — SES rejects an
empty list. Backwards compatible: a request without `replyTo` sends exactly as before, and no domain
verification is needed, unlike `Source`.

The same pass fixed a second, unrelated drop found in the handler: `EmailProviderRequest` emits `cc`
whenever the operator adds one in the send modal, and the Lambda only ever read `to`, so every CC was
silently discarded. It now maps to SES `CcAddresses`.

**Where:** `etendosoftware/etendo-go-infraestructure`, PR #1, branch `feature/ETP-5003`. The function
is `ses-email-sender` in AWS account `278186107973` (`eu-west-3`), behind API Gateway `7s6vd40j6i`;
the repo's workflow publishes it on merge to `main`.

## If a Reply-To ever goes missing again

The Java is not the first place to look. Check which Lambda version API Gateway `7s6vd40j6i` has
published, then POST straight to the gateway with an explicit `replyTo` and no Java in the path —
that single request is what isolated the fault the first time. `EmailSenderIdentity` logs a WARN when
it resolves no address at all, which separates "we never sent one" from "the provider dropped it".

## Open question, unrelated to the Lambda

Reply-To is set to the **sending operator**. Decided 2026-08-26: if that person leaves the company,
their mailbox stays with the company and is handed to a manager, so orphaned replies are not a
concern. Revisit only if that changes.

## Related

- `.claude/skills/emails/SKILL.md`
- `docs/plans/2026-08-25-etp-5003-unified-email-template.md`
- `docs/email-inventory.md`
