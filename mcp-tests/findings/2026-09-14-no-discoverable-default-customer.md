# There is no way to ask the server who the "default customer" is

**Found:** 2026-09-14 · **Source:** `neo_feedback` session `1901b25c-418a-41cc-b420-984d211162af`
(17:44:11), corroborated by every run of `create-empty-default-customer` · **Target:** `etendo-go-local`
**Severity (proposed, not authoritative):** medium — forces guessing on a very common instruction

## What happened

Asked to create an order "for the default customer", the agent had no way to find out who that is:

> *"Could not find a 'default customer' via businessPartner selector search using queries
> 'default'/'por defecto'; had to infer it from the most recent similar order."*
> — cost: 2 wasted selector calls and a list call to inspect recent orders

Its own suggestion:

> *"Provide a standard way to identify the 'default customer' (preference/flag) so it can be selected
> without inference from recent documents."*

## Why it matters

"The usual customer", "the default one", "same as last time" is how people actually talk, and an
agent sitting in front of a user will receive that phrasing constantly. Inferring it from the most
recent document is a guess that will be silently wrong the first time the last order was an
exception — and the agent has no way to know it guessed.

In an earlier run the same ambiguity was reported explicitly by the agent as *"some ambiguity about
what constitutes the true default customer"*. It knew it was guessing and said so; it had no better
option.

## The UI test (D22) — this one is genuinely borderline

**Unclear, and stated as unclear rather than forced.** If Etendo carries a default business partner
for the user/role (a preference, a default on the window), then a person effectively *does* get one
in the UI — the field arrives pre-filled — and the MCP not exposing it is a gap. If no such default
exists anywhere, then the probe is asking for something nobody can do and the finding is a broken
probe, not a defect.

**This is the one thing to check first**, and it decides whether this file becomes an IMP or gets
closed as a false alarm.

## Not verified

- Whether a default business partner exists at all in this tenant, as a preference, a window default
  or a user setting.
- Whether `neo_defaults` already returns one for `businessPartner` on some other spec, which would
  make this an inconsistency rather than an absence.
