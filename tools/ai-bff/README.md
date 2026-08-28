# Local AI BFF

The BFF keeps the OpenCode Go credential server-side and forwards only the
current browser session Bearer token to Etendo Go's MCP endpoint. The existing
Copilot popup calls this BFF when the `webmcp-agent-chat` feature flag is on;
when it is off, the legacy Copilot API remains unchanged.

Copy `.env.example` to `.env` and set:

```env
OPENCODE_API_KEY=secret
OPENCODE_MODEL=opencode-go/<model-id>
OPENCODE_BASE_URL=https://opencode.ai/zen/go/v1
ETENDO_MCP_URL=http://localhost:8080/etendo/sws/mcp
BFF_PORT=3400
BFF_MAX_BODY_BYTES=1000000
```

`make dev` installs the BFF dependencies on first use and starts it together
with the app-shell. Never put `OPENCODE_API_KEY` in Vite variables or browser
code. In production, expose the same `/api/ai/chat` contract through the
server-side Cloud Function/BFF and keep the browser session token as the only
credential forwarded to the Etendo MCP endpoint.

When the feature flag is enabled, the BFF also advertises the browser-side
`inspect_page_dom` and `interact_with_page` tools. The browser returns visible
interactive elements as temporary IDs, and subsequent interactions must use an
ID from the latest inspection. The interaction surface is limited to click,
fill, type, and key press operations; it does not expose arbitrary selectors,
JavaScript execution, password values, or a second authorization mechanism.
The app-shell also provides a throttled floating page-help action that asks the
model to inspect the current page after navigation or meaningful UI interaction
and present a contextual suggestion in a floating callout. Clicking that callout
opens the existing Copilot conversation with the help context. It is advisory:
consequential operations remain explicit user actions.
