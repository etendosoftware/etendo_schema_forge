/**
 * Single source-of-truth catalog for the MCP client connection landing.
 *
 * Adding a new client = one entry here + its i18n keys (per the naming rule in
 * docs/plans/2026-07-02-mcp-client-setup-redesign.md):
 *   - tab label:  oauthConnectTab<Client>
 *   - steps:      oauthConnect<Client>Step<N>
 *   - extra copy: oauthConnect<Client><Suffix>
 *
 * `<Client>` is PascalCase and doubles as the telemetry `client` value.
 *
 * Content is a flat, ordered list of items. Item shapes:
 *   { step: N, key?: string }  numbered instruction (key defaults to derived)
 *   { code: string }           copyable snippet / command (mcpUrl pre-interpolated)
 *   { install: { labelKey, href } } deep-link install button (+ manual fallback below)
 *   { agentPrompt: true }      shared "let the agent do it" prompt block
 *   { note: key }              callout note above the steps
 *   { subheading: key }        section heading (e.g. "for each team member")
 *
 * Clients with genuinely different UI flows use `subTabs` (Claude Desktop only).
 */

const SERVER_NAME = 'etendo-go';

function json(obj) {
  return JSON.stringify(obj, null, 2);
}

function cursorInstallHref(mcpUrl) {
  const config = btoa(JSON.stringify({ url: mcpUrl }));
  return `cursor://anysphere.cursor-deeplink/mcp/install?name=${SERVER_NAME}&config=${config}`;
}

function vscodeInstallHref(mcpUrl) {
  const config = encodeURIComponent(JSON.stringify({ name: SERVER_NAME, type: 'http', url: mcpUrl }));
  return `vscode:mcp/install?${config}`;
}

/**
 * Builds the fully-resolved client catalog for the active environment.
 * @param {string} mcpUrl resolved MCP server URL (from detectMcpUrl()).
 */
export function buildMcpClients(mcpUrl) {
  return [
    {
      id: 'ClaudeDesktop',
      subTabs: [
        {
          id: 'ClaudeDesktopPersonal',
          content: [
            { step: 1 },
            { step: 2 },
            { step: 3 },
            { code: mcpUrl },
            { step: 4 },
            { step: 5 },
            { step: 6 },
            { step: 7 },
          ],
        },
        {
          id: 'ClaudeDesktopOrg',
          content: [
            { note: 'oauthConnectClaudeDesktopOrgOwnerNote' },
            { step: 1 },
            { step: 2 },
            { step: 3 },
            { code: mcpUrl },
            { step: 4 },
            { step: 5 },
            { subheading: 'oauthConnectClaudeDesktopOrgMemberHeading' },
            { step: 1, key: 'oauthConnectClaudeDesktopOrgMemberStep1' },
            { step: 2, key: 'oauthConnectClaudeDesktopOrgMemberStep2' },
            { step: 3, key: 'oauthConnectClaudeDesktopOrgMemberStep3' },
            { step: 4, key: 'oauthConnectClaudeDesktopOrgMemberStep4' },
          ],
        },
      ],
    },
    {
      id: 'ClaudeCode',
      content: [
        { step: 1 },
        { step: 2 },
        { code: `claude mcp add --scope user --transport http ${SERVER_NAME} ${mcpUrl}` },
        { step: 3 },
        { step: 4 },
        { agentPrompt: true },
      ],
    },
    {
      id: 'Cursor',
      content: [
        { install: { labelKey: 'oauthConnectCursorInstallButton', href: cursorInstallHref(mcpUrl) } },
        { step: 1 },
        { code: json({ mcpServers: { [SERVER_NAME]: { url: mcpUrl } } }) },
        { step: 2 },
        { step: 3 },
      ],
    },
    {
      id: 'VsCode',
      content: [
        { install: { labelKey: 'oauthConnectVsCodeInstallButton', href: vscodeInstallHref(mcpUrl) } },
        { step: 1 },
        { code: json({ servers: { [SERVER_NAME]: { type: 'http', url: mcpUrl } } }) },
        { step: 2 },
        { step: 3 },
      ],
    },
    {
      id: 'Codex',
      content: [
        { step: 1 },
        { code: `[mcp_servers.${SERVER_NAME}]\nurl = "${mcpUrl}"` },
        { step: 2 },
        { code: `codex mcp login ${SERVER_NAME}` },
        { step: 3 },
        { step: 4 },
        { agentPrompt: true },
      ],
    },
    {
      id: 'OpenCode',
      content: [
        { step: 1 },
        {
          code: json({
            $schema: 'https://opencode.ai/config.json',
            mcp: { [SERVER_NAME]: { type: 'remote', url: mcpUrl, enabled: true } },
          }),
        },
        { step: 2 },
        { step: 3 },
        { agentPrompt: true },
      ],
    },
    {
      id: 'Antigravity',
      content: [
        { step: 1 },
        { code: json({ mcpServers: { [SERVER_NAME]: { serverUrl: mcpUrl } } }) },
        { step: 2 },
        { step: 3 },
        { step: 4 },
      ],
    },
    {
      // "Otros" — keeps the legacy generic keys untouched (oauthStep1..4).
      id: 'Other',
      legacy: true,
      content: [
        { step: 1, key: 'oauthStep1' },
        { step: 2, key: 'oauthStep2' },
        { step: 3, key: 'oauthStep3' },
        { step: 4, key: 'oauthStep4' },
        { code: mcpUrl },
      ],
    },
  ];
}
