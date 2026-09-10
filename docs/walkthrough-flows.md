# Guided Walkthroughs — Flow JSON Reference

A **walkthrough** is a guided tour of the real UI: it highlights an element,
explains it, waits for the user to do something, and moves on — navigating
between windows on its own when the next step lives somewhere else.

The **engine is generic and lives in the core package**
(`@etendosoftware/app-shell-core/walkthrough`, source in
`schema_forge_core/packages/app-shell-core/src/walkthrough/`). It knows nothing
about contacts, products or orders.

The **flows are data and live in this repo** — one JSON file per flow in
`tools/app-shell/src/walkthrough/flows/`, listed in that directory's
`index.js`.

> **Adding a flow, reordering its steps or repointing a step is a pure data
> change.** If a change you want to make requires touching the engine, either
> the schema is missing an option (add it in the core, document it here) or the
> flow is trying to do something a tour should not do.

---

## 1. Where everything lives

| Thing | Repo | Path |
|---|---|---|
| Engine, overlay, schema validation | `schema_forge_core` | `packages/app-shell-core/src/walkthrough/` |
| Launcher button (interim trigger) | `schema_forge_core` | `packages/app-shell-core/src/walkthrough/WalkthroughLauncher.jsx` |
| Progress store + the four statuses | `schema_forge_core` | `packages/app-shell-core/src/walkthrough/walkthroughProgress.js` |
| Flow JSON files | `etendo_schema_forge` | `tools/app-shell/src/walkthrough/flows/` |
| Flow registry (the launcher's order) | `etendo_schema_forge` | `tools/app-shell/src/walkthrough/flows/index.js` |
| Mixpanel event names | `etendo_schema_forge` | `tools/app-shell/src/lib/walkthrough/walkthrough-events.js` |
| Telemetry injection | `etendo_schema_forge` | `tools/app-shell/src/App.jsx` (`<ObservabilityProvider>`) |
| Provider mount point | `etendo_schema_forge` | `tools/app-shell/src/layout/AppLayout.jsx` |
| Locale keys | `etendo_schema_forge` | `tools/app-shell/src/locales/{en_US,es_ES,es_AR}.json` → `genericLabels` |

The dividing line: **the core decides WHAT happened, the host names it.** The
launcher and the progress store are window-agnostic, so they live with the
engine; the flow data and the analytics vocabulary are this app's, so they do
not.

The provider is mounted inside the router and the locale provider but **above
the routed `Outlet`**, so a flow that walks the user from one window to another
survives the route change.

---

## 2. Flow shape

```json
{
  "id": "create-contact",
  "schemaVersion": 1,
  "revision": 1,
  "titleKey": "walkthroughContactTitle",
  "descriptionKey": "walkthroughContactDescription",
  "icon": "UserPlus",
  "steps": [ /* … */ ]
}
```

| Field | Required | Meaning |
|---|---|---|
| `id` | yes | Unique across all flows. Used by `start(flowId)` and by the launcher's `data-testid`. |
| `schemaVersion` | no | Must be `1` if present. A flow declaring an unsupported version is dropped with an error. |
| `revision` | no | Positive integer, default `1`. Bump it when the flow changes enough to be worth re-offering: a user who completed revision 1 is shown an **Actualizado** badge when the flow reaches revision 2 (§11). `schemaVersion` is the engine↔flow contract; this is the flow↔user one. The engine never reads it. |
| `titleKey` | yes | `genericLabels` key for the flow name (launcher + step card eyebrow). |
| `descriptionKey` | no | `genericLabels` key for the one-line launcher subtitle. |
| `icon` | no | Free-form hint for the launcher (a lucide icon name). The engine never reads it; an unknown value falls back to a generic icon, so a new flow never needs a code change to be listed. |
| `navPathSpeedMs` | no | Default cursor travel time per `navPath` hop for every step in this flow, in ms (see §5). Clamped to `120…3000`; omit for the `500` default. |
| `steps` | yes | Non-empty array. Step `id`s must be unique within the flow. |

---

## 3. Step shape

```json
{
  "id": "legal-name",
  "route": "/contacts/new",
  "routeMatch": "/contacts/:recordId",
  "targetTestId": "field-name",
  "titleKey": "walkthroughContactStepNameTitle",
  "bodyKey": "walkthroughContactStepNameBody",
  "placement": "right",
  "advance": { "on": "targetValue" }
}
```

| Field | Required | Default | Meaning |
|---|---|---|---|
| `id` | yes | — | Unique within the flow. |
| `targetTestId` | yes¹ | — | Shorthand: normalized to `[data-testid="…"]`. Preferred — it is what the app's stable selectors are. A `field-*` id also matches `field-*-chip` (see below). |
| `target` | yes¹ | — | A raw CSS selector, for the rare target with no `data-testid`. |
| `bodyKey` | yes | — | `genericLabels` key for the step's explanation. |
| `titleKey` | no | `null` | `genericLabels` key for the step's heading. |
| `route` | no | `null` | The **concrete path to navigate to** when the step's target is not present on this step's route. Declare it whenever a selector can exist in another window (for example, `action-new`); field steps in an already-open form do not need it. |
| `routeMatch` | no | `route` | The **pattern that means "already here"**. Supports `:param` and a trailing `*`. Needed whenever the landing URL differs from `route` — e.g. `/sales-order/new` becomes `/sales-order/<id>` after a save, so later steps declare `routeMatch: "/sales-order/:recordId"` and do not bounce back to `/new`. Requires `route`. |
| `placement` | no | `"auto"` | `auto` \| `top` \| `bottom` \| `left` \| `right` \| `center`. `auto` picks the first side with room; every result is clamped inside the viewport. |
| `advance` | no | `{ "on": "manual" }` | See §4. |
| `optional` | no | `false` | If the target never appears, silently skip to the next step instead of showing the error card. Pair with a short `targetTimeoutMs`. |
| `blockOutside` | no | **`true`** | The dimming scrim swallows clicks outside the highlight: if it is dimmed, it is not touchable. Opt out with `false`. What it never blocks: the spotlighted target itself (there is no scrim over the hole, so the field stays clickable and typable), the step card, and `Escape`. It also only engages once the step is ACTIVE with a measured hole — during navigation there is no hole, and a full-screen block with no hole is just a frozen application. |
| `spotlightPadding` | no | `8` | Pixels of breathing room around the highlighted element. |
| `targetTimeoutMs` | no | `10000` | How long to wait for the target to mount before erroring (or skipping, when `optional`). |
| `navTimeoutMs` | no | `8000` | How long to wait for `routeMatch` to become true after navigating. |
| `navPath` | no | `[]` | The clicks the tutorial performs **itself** to reach this step's screen, instead of a bare route jump. See §5. Requires `route` (the fallback). |
| `navPathSpeedMs` | no | flow value, else `500` | Cursor travel time per `navPath` hop, in ms. Clamped to `120…3000`. |

¹ Exactly one of `targetTestId` / `target` is required. If both are given,
`target` wins.

A searchable FK field renders in **two shapes**: its search `<input>`
(`field-<key>`) while empty, and a chip button (`field-<key>-chip`) once a
record is picked. A field arriving with a default value (contacts' *Contact
Category* resolves one from `@SQL=…`) is already in the second shape when the
step is entered.

Flow authors do not have to care: **a `targetTestId` starting with `field-`
automatically matches the `-chip` variant too**, and an active step that sees its
element swapped out (the user picks a value, the input is replaced by the chip)
re-resolves and keeps its spotlight and its `requireValue` gate working. Writing
`"targetTestId": "field-businessPartnerCategory"` is enough. The alias is scoped
to the `field-` prefix so action/menu ids do not grow a meaningless alternative.

If you write a raw `target` instead, you own both shapes yourself:

```json
"target": "[data-testid=\"field-uOM\"], [data-testid=\"field-uOM-chip\"]"
```

`resolveTarget` returns the first **visible** match, so the order in the list is
a preference, not a requirement.

### Target first: the engine never opens a screen it is already on

Before anything else, the engine looks for the step's target in the DOM. **If it
is already there and the route belongs to that step, the step goes straight to
highlighting it** — no navigation and no `navPath`. A step with no `route` keeps
the same target-first behavior.

When a step declares `route`, route matching prevents shared selectors from
selecting the wrong window. For example, `action-new` exists in Contacts,
Products, and Sales Orders: starting the Product flow from Contacts still opens
the Product menu path instead of highlighting Contacts' New button.

Consequences for flow authors:

- Declare `route` **only** on a step that genuinely changes screen — the first
  step of a flow, or one that crosses into another window.
- A step whose target is missing is a *target* problem, not a navigation
  problem: it waits `targetTimeoutMs` and then shows the error card (§7). It no
  longer claims to be "opening the screen".
- `navPath` and the animated cursor are strictly the "the target is not here"
  fallback. They are never the first thing tried.

### Steps are not limited to input fields

A step may point at **any** element with a stable selector — that is the point.
The stable action selectors in this app are:

| Selector | What it is |
|---|---|
| `action-new` | The "New" button on a list view |
| `action-save` | Primary save (in a draft-mode window, this is Confirm/Complete) |
| `action-save-draft` | Secondary "save as draft" (only in draft-mode windows) |
| `action-complete` | Explicit complete action, where present |
| `action-cancel`, `action-delete` | Cancel / delete |
| `action-more` | The detail kebab menu |
| `action-add-line` | Add a line to a lines table |
| `inline-add-field-<key>` | A field in the inline add-line row |
| `field-<key>` | A form field (wrapper, input, or select trigger) |
| `row-<id>`, `cell-<id>` | A grid row / cell |
| `list-view`, `detail-view` | The whole list / detail region |

A flow that only teaches data entry, and never the document lifecycle (save →
confirm), is teaching the half the user already guessed. Point at the actions.

The spotlight is **not** always drawn around the element the selector matched.
`field-<key>` on a selector field lands on the bare `<input>` inside the
bordered wrapper, and the chevron button is a flex SIBLING of that input —
measured against the live stylesheet, its right edge sits 20px past the input's,
while the wrapper is 38px wider than the input but only 2px taller. A ring
around the raw match therefore cut straight through the chevron and the scrim
left it dimmed, so the control looked broken in half. `resolveHighlightBox`
climbs from the resolved element to the box that actually **paints** the field
(a visible border on all four sides, and no more than 16px taller than the
target), which is self-limiting: the next ancestor up is the label+control
stack, 28px taller, so it never qualifies. A plain `<Input>` paints its own
border and is returned untouched — nothing changes for a field that was already
highlighted correctly. Raising `spotlightPadding` is NOT the fix for this: it
fattens the ring on all four sides of every field to compensate for one
asymmetric case. The climb affects the HIGHLIGHT only — the click, the animated
cursor and the `targetValue` read all still point at the element the flow named.

---

## 4. `advance` — how a step finishes

```json
"advance": { "on": "manual", "requireValue": true }
```

| `on` | Behaviour |
|---|---|
| `"manual"` (default) | The user presses **Next** in the step card. |
| `"targetClick"` | Auto-advances when the target element is clicked. Use for buttons, tabs, kebab menus — the click itself changes the screen, so waiting for a Next press would be busywork. |
| `"targetValue"` | **Does not advance by itself.** It only *enables* the **Next** button once the target field holds a value; the user presses it. Implies `requireValue`. |
| `"route"` | Auto-advances when the location starts matching `advance.route` (required for this mode). Use when the user's action triggers a redirect. |

**Acting advances; typing does not.** That distinction is the whole rule.
`targetClick` fires on the user's action because the action already moved the
UI. A field step never advances on its own: a step that jumped forward on the
first typed character pulled the bubble away mid-word, so the user could not
finish typing, let alone read the hint.

**`targetClick` is safe on a conditionally-enabled button — the engine watches
the target's `disabled` state.** The gate is the click, so a disabled
`<button>` (which fires none) would trap the user between two dead controls.
Instead the engine polls `isTargetDisabled(target)` while a `targetClick` step
is active, and **hands "Next" back the moment the target cannot be clicked**.
The result is the behaviour a mandatory action needs, with no dead end:

- target enabled → **Next disabled**, the user really does have to click it;
- target disabled → **Next enabled**, because clicking is not an option.

Sales Order's `save-lines` is the worked example, and both halves were measured
in the running app. Confirm stays disabled until the order is saved, so saving
there is *mandatory* — but committing an inline line with Enter persists it
immediately, which can grey `action-save-draft` out (`disabled={… || !isDirty
|| …}`) before the step is even entered. Same step, both states, seconds apart.
Polling is what makes one declaration correct for both.

**The last step of a create flow uses `targetClick` on `action-save`.** The same
rule, applied at the end: pressing Save is the act that finishes the flow, so it
finishes the tour too and shows the completion card. With `manual` the user had
to press Save *and then* press **Finish** for one outcome, which reads as a
second, unexplained confirmation. On a last step the hint says "to finish", not
"to continue". The trade-off is deliberate: the tour closes on the click, not on
a confirmed save, so a save that fails validation still ends the tour — the user
is left on the form with the error, which is where they need to be anyway.

| Extra field | Meaning |
|---|---|
| `requireValue` | With `on: "manual"`, **Next stays disabled** until the target field has a value. This is the gate for "must not advance until the field is filled". Always implied by `targetValue`. |

### The step card always offers a way forward and a way out

Regardless of `advance.on`, the card renders **Next** — replaced by **Finish**
on the last step — plus **Exit** on the left. The gating condition *disables*
Next, it never removes it: a missing button reads as a dead end, a disabled one
reads as "do the highlighted thing first", which is the actual instruction.

There is exactly **one** early-exit control. An always-visible *Finish*
alongside *Exit* duplicated it, overflowed the card, and left the user asking
which of the two ended the tour. Both converge on the engine's single teardown
path anyway.

The footer sizes itself around the **translations**, not around the English.
Three buttons of a mid-flow Spanish step measure 325px (`Salir del tutorial`
113 + `Atras` 86 + `Siguiente` 110 + two 8px gaps); the card's original 340px
width left 306px inside the `p-4` padding, so `Siguiente` hung outside the
rounded border. Two things keep that from coming back: `CARD_WIDTH` is 380 (346
inside), which holds the common case on one line so the card stops resizing
between step 1 and step 2, and the footer is `flex-wrap` with the nav group on
`ml-auto` instead of `justify-between`. The wrap is the actual guarantee --
`justify-between` has no fallback, it simply lets the last button overflow --
and the auto margin keeps the group right-aligned on whichever line it lands
on. A locale with longer labels wraps and still looks deliberate. The same
shape is used by the error card (`Exit` + `Retry` + `Skip step`) and by the
completion card, whose second button embeds an arbitrary flow name.

### A step whose target opens a dialog

Clicking a step's target often opens a drawer, a modal or a dropdown. The
overlay sits at `z-index: 600`, above the app's own dialogs, so the scrim would
dim the very picker the step just told the user to use — it looks disabled. So
while a **foreign** dialog is open the scrim is suspended entirely (no panels,
no ring, no blocking) and the card is parked bottom-left, out of the dialog's
way. Detection is by `role="dialog"` / `role="alertdialog"` / Radix's popper
wrapper, so it needs no per-flow configuration.

"Foreign" excludes two things: the step card itself (a `role="dialog"` too —
counting it would suspend the scrim forever) and **a dialog that contains the
step's own target**. The latter is how a step can point INSIDE a modal and keep
its spotlight: sales-order's `confirm-submit` targets `sales-order-confirm-submit`
in the confirmation modal, and gets a normal highlight over it.

A dialog that sets no `role` (sales-order's confirmation modal is a plain
portalled `div`) is simply not detected — which happens to be right when the
step targets something inside it, and needs a `role` added when a step must
*type into* it. `LocationEditorModal` needed it in both directions and is the
worked example:

- **Its own root** carries `role="dialog" aria-modal="true"` because the
  `create-contact` tour fills in four of its fields. Without the role the scrim
  dimmed and blocked the whole modal. (Note the root is *not* suspended while
  those field steps run — it CONTAINS the target, so it is skipped by the rule
  above and the field keeps its spotlight. The role matters for the steps
  *before* the fields, and for any future step pointing behind it.)
- **Its nested country/region pickers** needed it too, and this is the failure
  worth remembering. Each picker is a second overlay (`z-160`) that does *not*
  contain the trigger it was opened from. Un-`role`d, the engine saw no dialog,
  kept the scrim up, and kept the spotlight hole punched over the trigger —
  which sits BEHIND the picker list. Result: the list rendered dimmed except for
  one bright horizontal band where the hidden trigger was. It reads as a
  rendering bug, not as a missing attribute.

The pattern: **a nested picker is a foreign dialog even when its parent is
not.** Whenever a step's target opens a surface that does not contain that
target, that surface needs a `role` or the spotlight will cut through it.
Adding the role is correct a11y for a focus-trapping overlay anyway, so this is
never a walkthrough-only concession.

**A step inside a dialog also needs that dialog to respect the elevation
scale.** A dialog drawn above the overlay covers the step card outright, and the
card is then simply invisible on that step. Two things were needed to make this
reliable:

- `ConfirmResultModal` was brought back from `zIndex: 9999` to the `50` modal
  tier. Nothing about a result notice justifies sitting above every global tool.
- The overlay itself moved from `z-70` to `OVERLAY_Z_INDEX = 600`
  (`WalkthroughOverlay.jsx`). The nominal tier for global tools is 70, but the
  app grew a set of ad-hoc elevations well above the `z-50` modal tier — 100
  (`.fm-modal-overlay`), 150/160 (`LocationEditorModal` and its country/region
  pickers), 200/201 (`ContactDetailModal`'s pickers), 500
  (`LifecycleConfirmModal`) — and those are load-bearing:
  `LocationEditorModal` is opened *from inside* `.fm-modal-overlay`, so it
  genuinely has to outrank it. Chasing each one down to 50 would break the
  nesting; raising the overlay once fixes every step.

  It is an **inline style, not a Tailwind utility**, and deliberately. A `z-*`
  key added to the shared preset only produces a rule if the consuming app's
  Tailwind `content` globs happen to scan the core file that uses it — a
  per-app, per-dev-profile accident (see the LOCAL_CORE note in
  `tools/app-shell/tailwind.config.js`). Tried first and confirmed live: the
  class emitted no rule at all and the overlay fell back to `z-index: auto`.
  This is the one layer that cannot afford an invisible card.

600 is a ceiling, not infinity. It stays **below** the `1000` used by the fixed
select panels (`CreatableSearchSelect`, `InlineSearchCombo`), and deliberately:
those are plain `div`s with no `role`, so `useForeignDialog` cannot detect them
and park the card out of the way. Leaving them on top means a step pointing at
a dropdown is never covered by the card explaining it.

If a tour's card is invisible on a step whose target you can see, check the
target's `z-index` chain first — it is almost always a surface above 600, not
the walkthrough.

### The completion card offers the next tour

When a flow completes, the card invites the user to continue with the **next
entry in `WALKTHROUGH_FLOWS`** (`engine.nextFlow`), naming it. The last flow in
the list has no next and the card shows only its close button.

The progression is the registry order — reorder `flows/index.js` and you reorder
both the launcher and the invitation. There is no separate "next flow" field to
keep in sync, and a flow does not have to know what follows it. Contact →
Product → Sales Order is deliberate: an order needs a customer and something to
sell, so a user following the list in order always has the data the next tour
asks for.

The invitation only renders when the next flow's `titleKey` resolves — an
unnamed "Continue" button would be a mystery box.

### A tour has to leave behind data the next tour can use

The progression above is only real if each flow finishes with a record the next
one can actually pick. Both earlier flows stopped one step short of that:

- A contact with no **address** cannot be used on an order at all — the ship-to
  and bill-to addresses come from `C_BPartner_Location`. So `create-contact`
  continues past its save into the Location tab and through
  `LocationEditorModal`. Its two address-type checkboxes default to checked, so
  a single address serves as both, and the closing step says so instead of
  adding two steps that change nothing.
- A product with no **price** cannot be sold — an order line resolves its price
  from the tariff. So `create-product` continues into the Price tab and adds one
  tariff row.

Both additions are pure flow JSON plus `data-testid`s on controls that had none;
neither needed an engine change. The rule of thumb when adding a flow: **run the
NEXT flow against the record this one produces.** If the next tour cannot find
it in a picker, this tour is not finished.

### Two shapes for one action, and controls that save themselves

Extending those flows surfaced two recurring shapes worth naming.

**A secondary tab's "add" control has two shapes.** With no rows the tab renders
the empty-state illustration and its own CTA; the add-line bar under the table
only exists once there IS a row. A first-run tour always meets the first shape,
but a flow re-run against an existing record meets the second, so the step
targets both:

```json
"target": "[data-testid=\"secondary-tab-empty-state-add\"], [data-testid=\"secondary-add-line-locationAddress\"]"
```

`secondary-tab-empty-state-add` (the empty state's CTA) and
`secondary-add-line-<tabKey>` (the per-tab wrapper around the shared
`AddLineButton`, which hardcodes a non-unique `action-add-line`) were added for
this. Only one tab panel is mounted at a time, so the un-keyed empty-state hook
is unambiguous.

**A control that saves on selection cannot be its own step.** In
`ProductPriceBar` the draft row's tariff selector calls `handleAdd` from
`onChange`: picking a value saves the row and unmounts the draft row with it. A
step pointing at that selector would lose its target mid-advance. So
`create-product`'s last step spotlights the whole **row**
(`price-add-tariff-row`) with `advance: { on: "manual" }` and the body explains
the order — prices first, tariff last, saved on pick. Before adding a step for a
control, check whether *using* it destroys the element the step is anchored to.
| `route` | Required by `on: "route"`; the pattern to watch for. |

### What counts as "has a value"

`readTargetValue` (core) handles the four shapes this app renders a field in:

1. a bare `<input>` / `<textarea>` / `<select>` — its `value` (checkboxes: checked);
2. a wrapper `div[data-testid="field-x"]` containing one — the control's value;
3. a **selector** field, whose input empties and is replaced by a
   `[data-testid$="-chip"]` on selection — the chip's text;
4. a **Radix select trigger** (a `<button>`) — empty exactly while it carries
   `data-placeholder`.

It deliberately does **not** fall back to a wrapper's raw `textContent`: an
empty field still renders its label and placeholder, which would read as
"filled" and enable **Next** before the user typed anything. Text is read only
from an element that IS the value display — `isValueDisplay(el)`: a `<button>`,
a `role="combobox"` / `role="listbox"`, anything with `aria-haspopup`, or a
`…-chip` testid. A plain wrapper `<div>` returns `''`.

> **Careful with pre-filled fields.** A field with a contract `defaultValue`
> (e.g. `product.productType` defaults to `"I"`) already "has a value", so a
> `requireValue` gate is satisfied the moment the step opens and **Next** is
> enabled from the start. `readTargetValue` answers "does it hold a value",
> **not** "did the user choose it" — there is no interaction tracking today. If
> a step must not proceed until the user actually *changed* a pre-filled value,
> that is a feature the engine does not yet have; say so in review rather than
> gating it on `requireValue`.

---

## 5. `navPath` — showing the user the real way there

A step in another window used to be reached with a silent programmatic route
jump: the screen simply changed. The user learned nothing about *how* to get
there, so they could not repeat it alone.

`navPath` replaces that jump with the real thing: an animated cursor travels to
each element **and genuinely clicks it**, so what the user watches is exactly
the path they can repeat by hand afterwards.

```json
{
  "id": "open-new",
  "route": "/product",
  "navPath": [
    { "targetTestId": "sidebar-expand", "optional": true, "timeoutMs": 800 },
    { "targetTestId": "menu-group-inventory", "skipIf": { "targetTestId": "menu-item-product" } },
    { "targetTestId": "menu-item-product" }
  ],
  "targetTestId": "action-new",
  "titleKey": "walkthroughProductStepNewTitle",
  "bodyKey": "walkthroughProductStepNewBody",
  "advance": { "on": "targetClick" }
}
```

### Hop shape

| Field | Required | Default | Meaning |
|---|---|---|---|
| `targetTestId` | yes¹ | — | Shorthand, normalized to `[data-testid="…"]`. |
| `target` | yes¹ | — | Raw CSS selector, for a hop with no `data-testid`. |
| `optional` | no | `false` | The hop's element may legitimately not exist. Skip it and carry on instead of aborting the path. This is what makes `sidebar-expand` safe: there is nothing to click when the menu is already open. |
| `skipIf` | no | `null` | `{ "targetTestId": … }` / `{ "target": … }`. **Do not click this hop if that element is already visible.** Menu group headers *toggle*, so clicking an already-open group would close it and hide the very entry the next hop needs. |
| `timeoutMs` | no | `4000` | How long to wait for this hop's element. Shorter than a step's own `targetTimeoutMs`: a menu entry either is there or the menu is not what the flow assumed, and the fallback is cheap. |
| `durationMs` | no | step/flow `navPathSpeedMs` | Cursor travel time for this one hop. Clamped to `120…2000`. |

¹ Exactly one of `targetTestId` / `target` per hop.

### Semantics, in order

0. **Target already on this step's route → nothing happens at all.** A route-less
   step only needs its target; a step with `route` also needs `routeMatch` to
   match (see §3, "Target first").
1. **Already on the right screen → nothing happens.** If `routeMatch` matches
   the current location the whole `navPath` is skipped: no menu opening, no
   cursor, no clicks. A tutorial never animates a trip to where you already are.
2. Otherwise the hops run **in order**: wait for the element, animate the cursor
   to it, click it for real, next hop.
3. After the last hop the engine waits for `routeMatch` (bounded by
   `navTimeoutMs`) before resolving the step's own target.
4. **Any hop that never appears → fall back to the plain `route` jump.** Same if
   the user takes over (see below). The tour continues at the step's own target
   either way; if even that is unreachable the user gets the existing error card
   (§7) — never a highlight over nothing.

### Two ways a hop's travel silently breaks

Both were live bugs, both look like "the cursor is broken" and neither is a
z-index or a geometry problem. Worth knowing before touching the runner.

**1. No paint between the seed and the target → no travel at all.** The cursor
is seeded at the user's real pointer position and only then transitioned to the
first hop. If the seed is not *painted* first, the browser coalesces both
transforms into one: the cursor materialises ON the target and sits there for
the whole duration, doing nothing. `setTimeout(0)` is not a paint — a macrotask
can run before the browser composites — and measured live the cursor spent its
entire first hop (3s) parked on the button it was supposed to be flying
towards. The fix is a **double `requestAnimationFrame`**: the first callback
runs before the commit that paints the seed, the second after it. The pending
frame is tracked in a ref so the single teardown can cancel it — an
uncancelled frame fires after teardown and resurrects a cursor that should be
gone.

**2. A hop element that goes stale between `waitForTarget` and the move.** A
detached element reports an all-zero rect, so `elementCenter` returns `(0, 0)`
and the cursor animates to the corner of the screen. Two causes, same
signature:

- **Replaced.** `sidebar-expand` and the expanded menu are different render
  branches. Clicking "expand" unmounts the collapsed group trigger and mounts
  the inline group header — *same selector, different element*. `waitForTarget`
  had already resolved the old one. This became reachable the moment
  `menu-group-*` started existing in both menu states (see §5's selector
  table); before that, the selector only matched the expanded branch and the
  wait implicitly waited for the right element.
- **Not laid out yet.** The side menu animates its width for 200ms, so an
  element can be mounted and still measure `0x0` for a few frames.

`settleTarget` answers both with the same question — "can I point at this yet?"
— by re-resolving the selector for up to 800ms. On timeout the element is still
**clicked** (a click needs no box); only the tween is skipped, so a hop never
flies to the corner. The zero-rect guard is disabled under jsdom via a
`hasLayout(doc)` probe on the root element, because jsdom reports every rect as
`0x0` and the guard would otherwise stall every hop of every unit test.

### Speed

`500ms` per hop by default, deliberately slow enough to read. Override per flow
(`navPathSpeedMs` at the top level) or per step, or per hop with `durationMs`.
Values are clamped to `120…2000`: a flow may not make the cursor instantaneous
(indistinguishable from the route jump it replaced) or glacial. The constant
lives in `flowSchema.js` as `DEFAULT_NAV_PATH_SPEED_MS`.

### Guarantees

| Guarantee | How |
|---|---|
| **Navigation only** — the tutorial never fills a field or presses Save for you | Structural, not conventional: the runner is reachable only from a step's *entry* phase and is not wired into `advance` at all. It has no way to type. |
| A real click by the user **aborts** the animated path | The runner watches for a *trusted* click (its own clicks are synthetic, so never confused). It then falls back to the programmatic `route` and the tour continues at the step's target. Mouse **movement** is deliberately ignored — a stray movement must not kill a tour. |
| `prefers-reduced-motion` is respected | Read live via `useReducedMotion()` (subscribed, not sampled once). When set, the cursor jumps straight to each hop with no tween; the clicks still happen, so the lesson survives and only the travel animation is dropped. |
| The fake cursor never interferes | `pointer-events: none` and `aria-hidden="true"`: it cannot eat a click and no screen reader announces a pointer that does not exist. |
| No frozen application | `blockOutside` only engages on an ACTIVE step with a measured hole, so the synthetic clicks a `navPath` dispatches are never blocked, and a failed step never leaves a full-screen block behind. |
| No stranded cursor or leaked overlay | The cursor renders as the last child of the overlay's own portal, and every exit — `Escape`, ✕, **Exit**, **Finish**, the error card, finishing the last step, unmount — goes through the engine's single `teardown()`. |

### Selectors the side menu guarantees

| Selector | What it is |
|---|---|
| `sidebar-expand` | Opens the collapsed side menu. Only present while collapsed → use `optional: true`. |
| `sidebar-collapse` | Collapses the open side menu. |
| `menu-group-<group>` | A section header. `<group>` is the menu group name, spaces → dashes, lowercased (`People` → `menu-group-people`). Toggles — pair with `skipIf`. Present in **both** menu states: expanded it is the inline group header, collapsed it is the icon button that opens the group as a hover popover. It used to exist only when expanded, which made a `menu-group-*` hop work purely by accident — the preceding `sidebar-expand` hop had already expanded the menu. |
| `menu-item-<slug>` | A window entry. `<slug>` is the item's slug, else its name with spaces → dashes, lowercased. |

Group names come from `tools/app-shell/src/menu.json`; check there rather than
guessing (`contacts` → `People`, `product` → `Inventory`, `sales-order` →
`Sales`).

---

## 6. i18n — every string is a key

The JSON stores **keys, never sentences**. Two rules:

1. Every `titleKey` / `bodyKey` / `descriptionKey` must exist in
   **`en_US.json`, `es_ES.json` and `es_AR.json`** under `genericLabels`.
   Spanish is the primary locale of real clients — an untranslated hint is a bug.
2. A missing key **never renders as a raw key**. `resolveStepText` does an
   explicit presence check and falls back to the generic
   `walkthroughMissingText` sentence (warning once per key in the console).
   `findMissingFlowLabelKeys(flows, dictionary)` is the pure counterpart a test
   uses to *fail* when a key is missing from a shipped locale.

Interpolation uses `useUI`'s `{name}` convention — e.g.
`walkthroughStepCounter` is `"Step {current} of {total}"`.

---

## 7. Failure behaviour (by design, not by accident)

| Situation | What the user sees |
|---|---|
| Target not present in the current window | The error card: a translated explanation plus **Try again**, **Skip this step** and **Exit tutorial**. Never a spotlight over nothing. |
| Navigation never lands (guard, missing route, intercepting dialog) | Same card, with the navigation-specific message, after `navTimeoutMs`. The timeout is armed in the navigation phase itself, so it cannot be destroyed by the state transition that starts the trip — an "Opening the screen for this step…" spinner that never resolves and never fails is a bug, not a state. |
| Target genuinely absent for this configuration | Mark the step `optional: true` (with a short `targetTimeoutMs`) and it is skipped silently. |
| A `navPath` hop is unreachable, or the user clicks something mid-path | The engine silently falls back to the plain programmatic `route` jump and the tour continues at the step's own target. Only if *that* fails does the error card appear. |
| User abandons the tour | `Escape`, the card's ✕, **Exit** or **Finish** end it: overlay and cursor unmount, nothing intercepts input, and focus returns to wherever it was when the tour started. All of them go through one `teardown()` in the engine. |
| Malformed flow JSON | The flow is dropped at normalization time and the reason is logged; the shell is unaffected. Validate with `validateFlow` / `normalizeFlows`. |

---

## 8. Adding a flow (checklist)

1. Write `tools/app-shell/src/walkthrough/flows/<my-flow>.json`.
2. **Verify every selector exists** — grep the window's components and the
   `e2e/` specs rather than guessing a `data-testid`. For a `navPath`, check
   the group name in `tools/app-shell/src/menu.json` too (§5).
3. **Check *when* each target exists, not only *whether*.** A selector that is
   present on the finished screen can be absent at the point your step reaches
   it. Sales Order's *Add line* is the worked example: `canShowAddLineArea`
   gates it on `requiredHeaderFields`, which includes the server-computed
   totals, so the button simply does not render until the header has been
   saved — hence the explicit `save-header` step before `add-line`. A step
   that waits for a target an earlier step was supposed to create fails as
   "target not found", which reads like a broken selector and is not.
4. Add the locale keys to `en_US.json`, `es_ES.json` **and** `es_AR.json`.
5. Register the flow in `flows/index.js`.
6. Pick an `icon` from the launcher's `DEFAULT_FLOW_ICONS` (core,
   `WalkthroughLauncher.jsx`) **only if** you want a specific one; otherwise
   omit `icon` and take the generic fallback. A host that needs a glyph the
   core does not carry passes an `icons` map to `<WalkthroughLauncher>` rather
   than editing the core.
7. If a step lives in another window, give it a `navPath` (§5) so the user is
   shown the route instead of being teleported.
8. Decide **where in `flows/index.js` it goes** — the position is the
   progression, not just the launcher order (see §4). A flow that needs data
   another flow creates belongs after it.
9. **Check the record it leaves behind is usable by the next flow** (see §4).
   Creating the entity is rarely the whole job — a contact needs an address, a
   product needs a price. If the next tour cannot find your record in a picker,
   this flow is not finished.
10. **Check whether using a target destroys it.** A control that saves on
    selection unmounts the row it lives in (see §4), so it cannot be its own
    step; spotlight the container instead.
11. Run the walkthrough in the browser end to end, including with
    `prefers-reduced-motion` on and with the side menu both open and collapsed.
12. **Editing an EXISTING flow: bump its `revision`** if the change alters what
    the tour teaches (steps added, reordered, or retargeted). Without the bump
    nobody who already completed it is ever told (§11).

No engine change. No new component. If you needed one, say so in review.

---

## 9. Current trigger is interim

The only entry point today is the **graduation-cap button in the top bar**, next
to the global search, with a flat list of the available flows. This is
deliberate and explicitly interim.

Out of scope for now, and **not** designed around:

- auto-triggering a walkthrough on first login;
- per-window contextual entry points ("show me how to fill this in");
- **resuming** a half-finished tour where it was left (which tutorials have
  been taken IS now tracked — see §11 — but a run always restarts at step 1).

None of them are foreclosed either: the launcher's whole job is to call
`start(flowId)`, so a contextual trigger is another caller of the same API, not
a redesign.

This system is **independent of the existing onboarding**
(`pages/FirstStepsPage.jsx`, `pages/onboarding/`). Chaining the two is a
separate task.

---

## 10. Core API surface

Imported from `@etendosoftware/app-shell-core/walkthrough`:

| Export | Use |
|---|---|
| `WalkthroughLauncher` | The topbar launcher: flow list, per-flow badge, unfinished-work dot. Optional `icons` prop merges into the built-in glyph map. Telemetry arrives through `<ObservabilityProvider>` (§11), never imported. |
| `FLOW_STATUS`, `getFlowStatus`, `countPendingFlows`, `markFlowStarted`, `markFlowCompleted`, `markFlowAbandoned`, `readFlowRecord`, `readProgress`, `resetProgress`, `isPendingStatus`, `WALKTHROUGH_PROGRESS_STORAGE_KEY` | The per-user progress store (§11). Pure, no React. |
| `recordFlowFinish`, `FINISH_STATUS` | Persists a run's outcome and returns a plain descriptor for the host to report. Feed it the engine's `onFinish` payload. |
| `WalkthroughProvider` | Mount once inside the router + locale provider. Props: `flows`, `onFlowsInvalid?`, `onFinish?`. `onFinish` receives `{flowId, completed, stepId, stepIndex, totalSteps}` — the step fields are the position the run ENDED on, which on an abandoned run is where the user walked away. |
| `useWalkthrough()` | `{ available, flows, isRunning, activeFlowId, start, stop }`. Returns an inert value outside the provider, so a launcher can render nothing instead of crashing. |
| `resolveStepText(dictionary, key, { warn })` | Locale resolution that never leaks a raw key. |
| `normalizeFlows`, `validateFlow`, `validateStep` | Pure schema validation. |
| `normalizeRevision`, `DEFAULT_FLOW_REVISION` | The `revision` default (§2), exported so the host resolves it the same way the engine does. |
| `collectFlowLabelKeys`, `findMissingFlowLabelKeys` | i18n coverage checks. |
| `matchRoutePattern` | The `:param` / `*` matcher used for `routeMatch`. |
| `readTargetValue`, `resolveTarget`, `waitForTarget`, `isTargetVisible`, `isValueDisplay` | DOM-side helpers. |
| `computeCardPosition`, `computeScrimPanels` | Pure overlay geometry. |
| `WALKTHROUGH_ERROR` | Error codes (`targetNotFound`, `navigationFailed`, `invalidSelector`). |
| `runNavPath`, `syntheticClick`, `elementCenter`, `NAV_PATH_ERROR` | The `navPath` runner and its helpers. Pure/DOM-only, directly testable against jsdom. |
| `WalkthroughCursor` | The animated pointer. Rendered by the overlay; not mounted by hosts. |
| `useReducedMotion`, `REDUCED_MOTION_QUERY` | Live `prefers-reduced-motion` state. |
| `DEFAULT_NAV_PATH_SPEED_MS`, `NAV_PATH_SPEED_MIN_MS`, `NAV_PATH_SPEED_MAX_MS`, `clampNavPathSpeed` | The cursor speed contract. |

---

## 11. Progress badges and telemetry (ETP-5144)

Which tutorials a user has taken is tracked so the launcher can say *"you never
did this one"*, and every start/finish is reported to Mixpanel. The work is
split so the core never learns an analytics vocabulary:

| File | Repo | Job |
|---|---|---|
| `walkthrough/walkthroughProgress.js` | core | Persistence, the four statuses, and `recordFlowFinish` — which persists a run's outcome AND describes it as plain data. |
| `walkthrough/WalkthroughLauncher.jsx` | core | The button, the dot and the badges. Reads telemetry callbacks off the observability context; never imports a tracker. |
| `lib/walkthrough/walkthrough-events.js` | functional | The ONLY place that names events. Maps the core's descriptors onto this app's catalog. |

**How the telemetry reaches the core.** `App.jsx` injects the three `track*`
functions through `<ObservabilityProvider value={{...}}>`, whose defaults in
`observability/ObservabilityContext.jsx` are no-ops — so the launcher works with
no provider at all, and a host with different (or no) analytics is unaffected.
`AppLayout.jsx` hands `handleWalkthroughFinish` to `<WalkthroughProvider
onFinish>`; that one is not injected because it must persist as well as report,
and the two have to agree on the same run.

**Why `recordFlowFinish` does both.** The start timestamp must be read BEFORE
completion rewrites the record, so a caller that reported first and persisted
second would measure the wrong duration, or none.

### The four statuses

`getFlowStatus(flowId, revision)` returns one of:

| Status | Condition | Launcher |
|---|---|---|
| `unseen` | no record | **Nuevo** badge |
| `in-progress` | started, never finished | *A medias* badge |
| `updated` | finished, but `completedRevision < revision` | **Actualizado** badge |
| `completed` | finished at the current revision | muted check |

**An unfinished run outranks a revision bump.** Someone who walked away at step
6 keeps `in-progress` even after the flow is revised — they never finished it,
and "half done" is the more useful of the two truths.

### What lights the dot on the button

**Anything unfinished** — `unseen`, `in-progress` and `updated` alike. Only
`completed` (at the flow's current revision) is done. So a tour left half-way
keeps the dot lit exactly like one never started.

**Opening the menu does NOT clear it.** An earlier design dismissed the dot once
the list had been seen, via an `acknowledgedRevision` per flow. It was dropped:
"you still have unfinished tutorials" does not stop being true because the user
glanced at the menu, and a dot that clears on the first open is a reminder that
reminds once. Completing a tutorial is the only thing that drops it from the
count. Opening the menu still *refreshes* the badges, because a run may have
finished while the menu was closed.

The dot is positioned `right-1 top-1`, an inset from the button's corner rather
than a negative offset. The button is 40px and the cap glyph only 20px, so a dot
pinned to the button's edge floats visibly away from the icon it belongs to —
measured against the live stylesheet, `-right-0.5 -top-0.5` put its centre
11.3px from the glyph's top-right corner versus 2.8px now.

### Storage

One key, `sf_walkthrough_v1`, namespaced by the `sf_auth_user` username (the
same key the observability and feature-flag bootstraps read). Every access is
wrapped, so a browser with storage disabled degrades to "nothing was ever
taken" instead of breaking the topbar. Shaped after
`src/lib/surveys/survey-state.js` — copy that molde for anything similar.

**KNOWN LIMIT:** `localStorage` is per-browser-origin, **not** per-account.
Moving to another machine makes every tutorial look new again. Namespacing by
username only stops two users of the *same* browser from inheriting each
other's badges. Carrying progress across devices needs a backend-held user
preference, with this module demoted to a cache — deliberately not built yet.

### Mixpanel events

Declared in `src/lib/observability/events.js`, emitted fire-and-forget (a failed
`track()` must never block the UI it was reporting on — the pattern comes from
`components/support/SupportChatContext.jsx`).

| Event | When | Properties |
|---|---|---|
| `walkthrough_menu_opened` | the graduation-cap button is clicked | `count` (unannounced tutorials, i.e. whether the dot was lit), `total` (tutorials on offer) |
| `walkthrough_started` | a tour begins | `flowId`, `status` (the status **before** this run — separates a first-timer from a repeater from someone returning to a revised tour), `total` (steps), `source` |
| `walkthrough_finished` | a tour ends, either way | `flowId`, `status` (`completed` / `abandoned`), `step` (index), `stepId`, `total`, `durationMs` |

Two deliberate choices:

- **No per-step event.** 15 steps × every user is noise, and
  `walkthrough_finished.stepId` already answers the only question worth asking
  of the data: *where does a tour lose people?*
- **One finish event with a `status`, not two events**, so the funnel stays a
  single step with a breakdown.

`status` on `walkthrough_started` must be read **before** `markFlowStarted`
touches the record, which is why the launcher reports first and marks second.

### The property-vocabulary trap

`src/lib/observability/payload.js` holds a global allowlist, and anything not on
it is dropped at sanitization **silently**. Worse, `step` is in
`NUMERIC_EVENT_PROPERTY_KEYS`: a step *id* string sent as `step` vanishes. Hence
the split — the index travels as `step`, the authored id as `stepId`, and both
`flowId` and `stepId` had to be added to `SAFE_EVENT_PROPERTY_KEYS`. Adding a
property to an event means checking that allowlist, not just `events.js`.
