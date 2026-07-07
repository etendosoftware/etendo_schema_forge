# ETP-4203 — Cross-Domain Plan

This branch (`feature/ETP-4203`) adds the in-app Support Chat feature, which is
global to the whole application rather than scoped to a single window. It
necessarily touches both platform wiring (the entry points every page shares)
and a new, previously-unclassified component tree. This plan documents that
crossing so the domain boundary gate can be approved with the
`cross-domain-approved` label.

## Domains

1. **`platform-change`** — entry points and shared infrastructure for the
   feature, not window-specific:
   - `tools/app-shell/src/layout/AppLayout.jsx` / `AppLayout.vitest.jsx`: mounts
     `SupportChatProvider` and renders `SupportChatWidget` as a portal-level
     overlay, alongside the existing `CopilotWidget`/`CommandPalette` pattern.
   - `tools/app-shell/src/components/layout/SideMenu/SideMenu.jsx`: adds the
     "Help" entry point (`onHelpClick`, `unreadCount` badge) pinned to the
     sidebar, per the feature spec's primary entry point.
   - `tools/app-shell/src/lib/observability/events.js`: registers
     `SUPPORT_CSAT_SUBMITTED` in the shared event registry (Mixpanel), same
     pattern as the pre-existing `SURVEY_*` events.
   - `tools/app-shell/src/locales/en_US.json` / `es_ES.json`: new i18n keys for
     the chat panel, help tab, and CSAT card (mandatory per this repo's i18n
     policy — every user-visible string must be translated).

2. **`unknown` → new `support` component tree** (not yet a declared scope):
   - `tools/app-shell/src/components/support/*` (`SupportChatWidget`,
     `SupportChatContext`, `ConversationView`, `TicketList`, `ChatView`,
     `SatisfactionRating`, `ValerIATile`, `helpDocs.js`, `support-chat.css`).
   - This is a new, self-contained feature area (chat panel, ticket list, CSAT
     survey, help tab) — not a `window:<name>` slice, not an existing
     `vertical:<name>`, and not generator/CLI code. It doesn't fit any scope
     documented in `docs/ops/domain-boundary-check.md` today because it's the
     first app-wide, non-window feature added to `tools/app-shell/src/components/`
     since that scope list was written.

Both groups are two faces of the same feature: the `support` tree is the
feature itself, and the `platform-change` files are the minimal wiring needed
to mount it globally (same pattern as `CopilotWidget`/`CopilotContext`, which
also live outside any single window and are wired from `AppLayout.jsx`).

## Tests

- `make test` (full suite): 28414/28418 passing, 4 skipped, 0 failures.
- Scoped `npx vitest run src/components/support src/components/layout/SideMenu`:
  11/11 passing.
- Manual: Help entry point opens/closes the panel from the sidebar; unread
  badge reflects `SupportChatContext` polling state; CSAT card fires
  `SUPPORT_CSAT_SUBMITTED` on submit.

## Rollback

Each domain reverts independently with no shared migration or generated-data
step: reverting the `support/` component tree alone leaves `AppLayout.jsx` with
a dead import (trivial one-line revert alongside it); reverting the
`platform-change` files alone just removes the entry points, leaving the
`support/` components unmounted and inert. No DB schema or NEO Headless
config is touched by this change.
