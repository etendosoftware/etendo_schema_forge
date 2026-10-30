# Unsaved-changes guard

**One source of truth for "this form is dirty", consumed by everything that could throw the
changes away.** Introduced by ETP-5022 (page-level) and completed by ETP-5073 (in-app navigation
and document actions).

Before it existed, each surface decided on its own whether pending edits mattered — which is
exactly why the Clone button was reachable over a dirty form and why moving to another window lost
an in-progress edit with no prompt.

## The model

The registry is a plain module-level singleton, `tools/app-shell/src/lib/unsavedChanges.js`. Not
context, deliberately: the side menu and the top bar are far from the form, and nothing should have
to thread a prop through the whole tree to ask one question.

Entries are keyed per form instance, so a record and a modal can both be mounted and each clears
only its own. Each entry optionally carries a **saver**, which is what lets a prompt offer *Save*
instead of only *Discard*.

## Registering a form

```js
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard.js';

useUnsavedChangesGuard(isDirty, () => hook.handleSave({ silent: true }));
```

The saver is optional but strongly preferred — without it the navigation prompt can only offer
*Discard*. It must resolve **falsy when the save is refused** (`handleSave` answers `null` on a
validation failure); that is what stops a navigation from proceeding past a form the user still has
to fix.

`useId` keys the entry, and the cleanup removes it on unmount. A form that unmounts while dirty
must never leave the app permanently "dirty".

### What counts as dirty on a NEW record (ETP-5888)

`DetailView` registers `computeIsDirtyForGuard(...)`, not the `isDirty` that drives its Save
button. The difference is the header of a new record: `/defaults` and the callouts that run when
the form opens fill fields before the user touches anything, so `isDirtyHeader` is true from the
first render. Registering it made every way out of an untouched new record prompt — and made the
company switcher look broken (below).

The guard reads `useEntity`'s `hasUserHeaderEdits` instead. For a new record it is true only when
a key the **user** authored exists (`isUserAuthoredKey`: in `userChangedKeysRef`, not in
`calloutAppliedKeysRef`) — including a defaulted field the user emptied, which `isDirtyHeader`'s
"has a value" rule misses. For a saved record it equals `isDirtyHeader`. Line edits, open add-rows
and `additionalDirtyState` count exactly as in `computeIsDirty`.

This only holds if every **programmatic** write says so. A value the server or the form computed
goes through `handleChange(key, value, { origin: 'callout' })` — callout fields, callout combos,
their `$_identifier` labels, and the labels `DetailView` resolves for defaulted FKs. A write
without the flag reads as a user edit and brings the false prompt back.

## The seven consumers

| Surface | Mechanism | Ticket |
|---|---|---|
| F5 / tab close | `installUnloadGuard` → `beforeunload` (the browser's own prompt) | ETP-5022 |
| Language change | `guardedSetLocale` in `App.jsx` → `LocaleChangeConfirmDialog` | ETP-5022 |
| In-app navigation | the navigation gate → `UnsavedChangesNavigationDialog` | ETP-5073 |
| Clone | `CloneOrderModal` disables its action and explains why | ETP-5073 |
| Confirm / document actions | `maybeSaveBeforeConfirm` in `saveActions.jsx` | ETP-4940 |
| Opening line-creation UI (add-line button, secondary-tab inline add, secondary-tab custom modal) on an already-saved record | `maybeSaveBeforeAddLine` in `detailViewHelpers.jsx`, via `runPrimaryAddLineFlow` / `runSecondaryAddLineFlow` | ETP-5147 |
| Company switcher | `switchTo` in `useEnvironmentSwitch.js` → the navigation gate, before the session rotates | ETP-5888 |

### The company switcher asks BEFORE the session rotates

Switching tenants rotates the session cookie (`POST /sws/go/session/environment`) and then reloads.
It used to do both and leave the only warning to `beforeunload`; cancelling the browser's prompt
kept the page on the old tenant against a session already on the new one, and `switching` stayed
set, so every later pick did nothing — no request, no message. `switchTo` now goes through
`requestTransition` first: the user gets *Save* / *Discard* / *Cancel*, a cancel changes nothing,
and once they confirm the reload calls `suppressNextUnloadPrompt()` so the browser cannot veto it.

## Guarding a navigation

Use `GuardedNavLink` instead of `NavLink`, and `useGuardedNavigate()` instead of `useNavigate()`,
for anything that can be clicked while a form is being edited.

```jsx
import { GuardedNavLink } from '@/components/GuardedNavLink.jsx';
import { useGuardedNavigate } from '@/hooks/useGuardedNavigate.js';
```

Navigations that **cannot** happen over a dirty form — inside a wizard that owns its own guard, or
right after a successful save — may keep using `useNavigate` directly. Guarding those would prompt
about changes that no longer exist.

### Why not react-router's `useBlocker`

v7 serves `useBlocker` only from a **data router** (`createBrowserRouter` + `RouterProvider`), and
this app mounts a declarative `<BrowserRouter>` in `AppShellRuntime` (app-shell-core). Migrating
the core's routing would touch every route of every app that consumes it, so the interception
happens at the navigation **sources** instead, all funnelled through one gate.

If the core ever moves to a data router, this gate is the thing to replace — the registry and its
other four consumers are unaffected.

### The gate fails open

With no dialog host mounted, `requestNavigation` navigates immediately rather than swallowing the
navigation. An app that cannot navigate is a far worse bug than the one this guards against. The
host (`UnsavedChangesNavigationDialog`) is mounted **once**, in `App.jsx`; a second one would fight
the first for the same pending navigation.

### New-tab gestures are not guarded

cmd/ctrl/shift/alt-click and middle-click open a second tab and leave the current form exactly
where it is. There is nothing to lose, so `GuardedNavLink` lets the browser handle them natively.

## Scoped transitions — when dirtiness is not global

Leaving the page endangers **every** dirty form, so `requestNavigation` asks
`hasUnsavedChanges()`. Some transitions endanger only part of the state, and gating those on the
global answer produces false prompts — which is worse than no prompt, because it trains users to
click through the dialog without reading it.

`requestTransition(perform, { isDirty, save })` is the general form:

```js
// Switching to another line endangers the line being edited, NOT a dirty header.
requestTransition(openLine, { isDirty: () => lineEdits != null, save: handleSaveLine });
```

**`save` is not optional in practice — pass it whenever `isDirty` is scoped.** It looks like a
nicety (the prompt gains a *Save* button) but omitting it is a data-loss bug, because the fallback
is not "no Save button": `savePendingNavigation` falls back to the GLOBAL saver, which saves every
registered dirty form. The line switch shipped without it and behaved like this:

| State | What the prompt did |
|---|---|
| Line dirty, header clean | Correct — no form registered a saver, so no *Save* button |
| Line dirty, **header also dirty** | Offered *Save*, saved the **header**, reported success and switched line — **the line edit was silently discarded** |

A button labelled *Save* that throws the user's work away is worse than the silent loss this guard
exists to prevent. Whatever `isDirty` is scoped to, `save` must persist that same thing.

A caller that must know the transition did **not** happen passes `onCancel`. It fires when the user
cancels, when the save is refused, and when a newer transition replaces the held one — never when
the transition runs. The company switcher needs it to release its spinner and resolve its promise.

The saver must answer falsy when the write was refused: `savePendingNavigation` stops there and
leaves the user on the form, which is what keeps a validation error or a concurrency conflict from
navigating away from unsaved work. `handleSaveLine` returns `false` on every refusal for exactly
this reason.

## Gating an action instead of a navigation

Read `hasUnsavedChanges()` directly (see `CloneOrderModal`). Two rules:

1. **Explain the refusal.** A disabled control with no reason reads as a bug — show the message
   instead of the usual informational one, so the single actionable line is not buried.
2. **Snapshot at open, not per render.** While a modal is up the form behind it cannot be edited,
   so the answer cannot legitimately change, and re-reading a module singleton on every unrelated
   re-render makes banners flicker.

Acceptance criterion 3 of ETP-5073 accepts *either* disabling the action *or* forcing the save
first — pick whichever is honest for the action.

## Tests

| File | Covers |
|---|---|
| `lib/__tests__/unsavedChanges.vitest.js` | the registry and the unload guard |
| `lib/__tests__/unsavedChanges.navigation.vitest.js` | the gate: hold, save, discard, cancel, fail-open, stop-at-refusal, `onCancel` |
| `hooks/__tests__/useEnvironmentSwitch.vitest.jsx` | the company switcher behind the gate (ETP-5888) |
| `hooks/__tests__/useEntity.defaultsRace.vitest.jsx` | `hasUserHeaderEdits` on a new record (ETP-5888) |
| `components/contract-ui/__tests__/DetailView.helpers.vitest.jsx` | `computeIsDirtyForGuard` |
| `components/__tests__/GuardedNavLink.vitest.jsx` | click routing and the unguarded gestures |
| `components/contract-ui/__tests__/CloneOrderModal.unsavedChanges.vitest.jsx` | DOC-09 / DOC-10 |
| `components/contract-ui/__tests__/detailViewHelpers.lineSwitchGuard.vitest.js` | the "another row" case |

The registry is imported for real in all of them. Mocking it would test the mock instead of the
wiring, and the wiring is the whole point.

## Related

- `docs/request-policy.md` — the optimistic-locking token, the server-side half of the same
  ticket: what happens when two people save the same record.
