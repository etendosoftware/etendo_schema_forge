# Copilot Markdown Rendering

How the AI Copilot chat bubble turns an assistant message into DOM, and — the reason this document
exists — **what the renderer does with a link the model wrote**. The href in a Copilot message is
model-generated and therefore untrusted, so the link policy is a security boundary, not a styling
choice. Read this before touching `MarkdownContent.jsx` or `assertInternalPath()`.

| Concern | File |
|---|---|
| The renderer | `tools/app-shell/src/components/copilot/MarkdownContent.jsx` |
| The navigation/href guard | `tools/app-shell/src/components/copilot/windowRoutes.js` (`assertInternalPath`) |
| Behavior contract | `tools/app-shell/src/components/copilot/__tests__/MarkdownContent.vitest.jsx` |
| Consumer | `tools/app-shell/src/components/copilot/ChatView.jsx:134` |

## 1. What renders assistant messages

`<MarkdownContent>{message.text}</MarkdownContent>`, a **hand-rolled line-oriented renderer**.
There is deliberately no `react-markdown`, `marked` or `remark` in this project, and adding one to
"just support more markdown" is not a free change: a real markdown library brings a full HTML
passthrough surface and its own link handling, both of which would have to be re-locked down against
model-authored input. The renderer stays small on purpose — the whole supported grammar is five
regexes at the top of the file.

Mechanically: the message is split on `\n`, and each line is classified as a heading, a table start,
a list start, or paragraph text; inline formatting is then applied per line by a single alternation
regex (`INLINE_RE`). Nothing is ever inserted as HTML — every node is a React element, so anything
the renderer does not recognize is React-escaped text.

## 2. The supported subset

| Construct | Rendered as |
|---|---|
| `# h`, `## h`, `### h` | `<h3>` — **all three levels**, the bubble has one heading size |
| `- item` / `* item` | `<ul><li>` |
| `1. item` | `<ol><li>` |
| `**bold**` | `<strong>` |
| `*italic*` | `<em>` |
| `` `code` `` | `<code>` (inline only) |
| `[label](href)` | see §3 |
| GFM pipe table | `<table>` in an `overflow-x-auto` wrapper |
| consecutive prose lines | one `<p>`, joined with `<br>` |
| blank line | block separator |

Tables follow GFM closely: border pipes are optional, `:---` / `---:` / `:---:` set per-column
alignment, `\|` is a literal pipe inside a cell, and a header row only starts a table when the
**next** line is a separator row with the same cell count. Ragged model output is tolerated — short
rows are padded, overflowing cells are dropped.

### Deliberately NOT supported

This list exists so nobody has to rediscover it by reading the regexes. **Every one of these renders
as literal text in the bubble** — the user sees the raw markdown source, which is ugly but never
unsafe:

- **Autolinked bare URLs** — `https://example.com` on its own is plain text. Only `[label](href)`
  produces a link.
- **Angle autolinks** — `<https://example.com>`.
- **`mailto:` and `tel:`** — refused by the href policy (§3), so `[mail me](mailto:a@b.com)` stays
  literal.
- **Fenced code blocks** — ``` ``` ``` fences are not recognized; only inline `` `code` ``.
- **Blockquotes** (`>`), **horizontal rules** (a lone `---` is always paragraph text: a table needs
  a `|` in *both* the header and the separator line, so `---` on its own line can never be read as a
  separator either), **strikethrough** (`~~x~~`), **nested / indented lists** (indentation is
  trimmed, so a nested item becomes a sibling), **images** (`![alt](src)` renders as `!` followed by
  a link node), **`####` and deeper headings** (`HEADING_RE` is `#{1,3}`), **HTML tags**.

If the model needs one of these, the fix is prompt-side (ask it to use a supported construct), not a
new branch in the renderer.

## 3. The href policy

`renderLinkNode()` (`MarkdownContent.jsx:25`) sorts every `[label](href)` into exactly three classes.

| Href class | Rendered as | Why |
|---|---|---|
| `http://…` / `https://…` (case-insensitive) | `<a href target="_blank" rel="noopener noreferrer">` | Genuinely external, so it must leave the SPA. `rel="noopener noreferrer"` is mandatory: without `noopener` the opened page gets a live `window.opener` handle back into the app (reverse tabnabbing), and the model chose that destination, not the user. |
| A path accepted by `assertInternalPath()` | react-router `<Link to>` | An in-app destination must **not** be a full page load. A reload drops the SPA session and closes the chat the user is in the middle of — the answer they were reading disappears to reach the record it pointed at. |
| Everything else | the **literal markdown source text** (`[x](javascript:alert(1))`), no anchor at all | A rejected link must never become a live anchor. Degrading to the raw source rather than to the bare label is intentional: the user can see *what* the model tried to link, and support can read it back. |

That third row covers `javascript:`, `data:`, `vbscript:`, protocol-relative `//host`, `mailto:`,
`tel:`, any other scheme, and any relative path not starting with `/`. The rejections are not
paranoia about hypotheticals:

- **`javascript:` / `vbscript:`** — a click executes script in the app's origin with the user's
  session. The model is not a trusted author of executable URLs.
- **`data:`** — `data:text/html,…` opens attacker-controlled HTML that the user reads as having come
  from the Copilot.
- **`//host`** — looks relative, resolves off-origin. This is the class the guard in §4 is about.
- **`mailto:` / `tel:`** — refused not because they are dangerous but because the policy is an
  allowlist of two shapes. Widening it is a deliberate decision, not something that should happen by
  a regex loosening.

A refused link is inert **in place**: the safe links around it in the same paragraph or table cell
still render normally.

## 4. Why `assertInternalPath` normalizes before deciding

`assertInternalPath()` (`windowRoutes.js:197`) looks like it does redundant work — it strips
TAB/LF/CR, replaces `\` with `/`, and only then checks `startsWith('/') && !startsWith('//')`. That
appearance of redundancy is exactly how the bug below shipped. **A leading `/` is not by itself proof
the URL stays on this origin**, because the WHATWG URL parser reshapes the string *before* it decides
where the authority begins. So the decision has to be made on the same string the parser will see.

Two rewrites, both mandatory (resolved against a page on `http://app.example`):

| Input | Resolves to | Mechanism |
|---|---|---|
| `//evil.example` | `http://evil.example/` | plain protocol-relative |
| `/\evil.example` | `http://evil.example/` | under a **special scheme** the URL spec treats `\` as `/`, so this enters authority state exactly like `//evil.example` |
| `/<TAB>/evil.example` | `http://evil.example/` | TAB, LF and CR are **stripped from the input before parsing**, collapsing this to `//evil.example` |
| `/ /evil.example` | `http://app.example/%20/evil.example` | a plain **space is NOT stripped** — it stays on-origin and gets percent-encoded |

That last row is the one worth remembering: the normalization is **narrow and specific to what the
parser does**, not a general "strip whitespace". Adding or removing a character from
`URL_STRIPPED_RE` changes the security decision, so it tracks the spec, not intuition.

### The hole was live

The original guard rejected `//host` but accepted `/\host`, and produced a real
`<a href="/\evil.example">` in the bubble. A plain left click was intercepted by react-router and
went nowhere off-origin — which is precisely why it was easy to miss — but **Ctrl/Cmd-click,
middle-click and "open link in new tab" bypass the router entirely and follow the raw `href`**, to
`http://evil.example/`, in a `<Link>` that carries no `rel="noopener"`.

### The asymmetry that matters most

`assertInternalPath()` guards **two** consumers, and they do not expose the same inputs:

- **Markdown links** (`MarkdownContent.jsx:42`). `INLINE_RE`'s href group is `[^\s)]…`, so an href
  containing TAB, LF or CR **cannot reach the guard through markdown at all** — the regex will not
  match it. Only the `\` mechanism is reachable here.
- **The `navigate_to` / `open_form` Copilot tools** (`useAiCopilotChat.js:229` and `:235`, via
  `resolveWindowPath()` at `:19`, ETP-5064). Here the model supplies an **arbitrary string** with no
  regex in front of it, so TAB/LF/CR *are* reachable.

So neither branch of the normalization is redundant, but each is load-bearing for a different
caller. Deleting the TAB/LF/CR strip because "markdown can't produce it" would reopen the hole on the
tool path, where the input is least constrained.

Note also that `resolveWindowPath()` routes anything shaped like a path or a URL to the guard rather
than to the window-name index — a failed *name* lookup is recoverable by the model, a rejected *URL*
is a security refusal, and the two raise different errors on purpose (see the header comment in
`windowRoutes.js`).

## 5. Known limitations

Both are recorded in `docs/feedback.md` (search `ETP-5234`); summarized here so a reader of this doc
is not surprised by them.

- **An external href truncates at the first `)`.** `INLINE_RE`'s href group excludes `)`, so
  `[w](https://en.wikipedia.org/wiki/Foo_(bar))` renders a live but **truncated** anchor and lands
  the user on a 404. Pre-existing, not introduced by the table/link work; logged rather than fixed
  because the fix means balanced-paren matching inside the regex that governs *all* inline
  formatting. The security half is unaffected — a truncated `data:`/`javascript:` href is still
  refused outright.
- **A borderless table absorbs pipe-containing prose that follows it with no blank line.** For a
  table written without border pipes, any following line containing a `|` looks like a body row, so
  prose such as `usá el filtro estado | fecha` is eaten as a table row. GFM has the same ambiguity.
  **A blank line always terminates a table** — that is the reliable fix in the prompt or the message.
  Bordered tables (`| a | b |`) are not affected: a body row must match the border style the header
  established.

## 6. Changing the renderer

- The test file is the behavior contract and reads as a full inventory of what is supported —
  extend it in the same change.
- Loosening `EXTERNAL_HREF_RE`, `URL_STRIPPED_RE` or the `assertInternalPath()` condition is a
  **security change**. Each has a test asserting a specific attack string renders no anchor; if one
  of those starts failing, the guard regressed.
- `assertInternalPath()` is currently *identity-or-throw*: it returns the caller's original string,
  never the normalized one. Changing that would change what `navigate_to` navigates to and what
  `resolveWindowPath()` returns — see the second `feedback.md` entry, which is an open question, not
  a decided bug.
