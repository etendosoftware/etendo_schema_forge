import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildMcpClients, deriveServerName } from '../mcpClients.js';

const MCP_URL = 'https://etendo.example.com/mcp';

describe('buildMcpClients', () => {
  it('returns the expected ordered client ids', () => {
    const clients = buildMcpClients(MCP_URL);
    assert.deepEqual(
      clients.map((c) => c.id),
      ['ClaudeDesktop', 'ClaudeCode', 'Cursor', 'VsCode', 'Codex', 'OpenCode', 'Antigravity', 'Other'],
    );
  });

  it('gives Claude Desktop a Personal and Org sub-tab, in that order', () => {
    const [claudeDesktop] = buildMcpClients(MCP_URL);
    assert.deepEqual(
      claudeDesktop.subTabs.map((st) => st.id),
      ['ClaudeDesktopPersonal', 'ClaudeDesktopOrg'],
    );
  });

  it('interpolates mcpUrl into the Claude Desktop Personal code snippet', () => {
    const [claudeDesktop] = buildMcpClients(MCP_URL);
    const [personal] = claudeDesktop.subTabs;
    const codeItem = personal.content.find((item) => item.code != null);
    assert.equal(codeItem.code, MCP_URL);
  });

  it('interpolates mcpUrl into the Claude Code install command', () => {
    const claudeCode = buildMcpClients(MCP_URL).find((c) => c.id === 'ClaudeCode');
    const codeItem = claudeCode.content.find((item) => item.code != null);
    assert.match(codeItem.code, /claude mcp add --scope user --transport http etendo-go/);
    assert.ok(codeItem.code.includes(MCP_URL));
  });

  it('gives the "Other" client client-agnostic guidance with the agent prompt block', () => {
    const other = buildMcpClients(MCP_URL).find((c) => c.id === 'Other');
    assert.equal(other.legacy, undefined);
    const stepKeys = other.content.filter((item) => item.step != null).map((item) => item.key);
    assert.deepEqual(stepKeys, [
      'oauthConnectOtherStep1',
      'oauthConnectOtherStep2',
      'oauthConnectOtherStep3',
    ]);
    assert.ok(other.content.some((item) => item.agentPrompt === true));
    assert.ok(other.content.some((item) => item.code === MCP_URL));
  });

  describe('Cursor deep-link install href', () => {
    it('builds a cursor:// URL whose base64 config decodes back to { url: mcpUrl }', () => {
      const cursor = buildMcpClients(MCP_URL).find((c) => c.id === 'Cursor');
      const installItem = cursor.content.find((item) => item.install);
      const href = installItem.install.href;

      assert.match(href, /^cursor:\/\/anysphere\.cursor-deeplink\/mcp\/install\?name=etendo-go&config=/);

      const configParam = new URL(href.replace('cursor://', 'https://placeholder/')).searchParams.get('config');
      const decoded = JSON.parse(atob(configParam));
      assert.deepEqual(decoded, { url: MCP_URL });
    });
  });

  describe('VS Code deep-link install href', () => {
    it('builds a vscode:mcp/install URL whose URL-encoded config decodes to the expected server entry', () => {
      const vscode = buildMcpClients(MCP_URL).find((c) => c.id === 'VsCode');
      const installItem = vscode.content.find((item) => item.install);
      const href = installItem.install.href;

      assert.match(href, /^vscode:mcp\/install\?/);

      const encoded = href.slice('vscode:mcp/install?'.length);
      const decoded = JSON.parse(decodeURIComponent(encoded));
      assert.deepEqual(decoded, { name: 'etendo-go', type: 'http', url: MCP_URL });
    });
  });
});

describe('deriveServerName', () => {
  it('derives etendo-go-local for a localhost URL', () => {
    assert.equal(deriveServerName('http://localhost:3100/mcp'), 'etendo-go-local');
  });

  it('derives etendo-go-local for a 127.0.0.1 URL', () => {
    assert.equal(deriveServerName('http://127.0.0.1:3100/mcp'), 'etendo-go-local');
  });

  it('derives etendo-go-staging for a staging URL', () => {
    assert.equal(deriveServerName('https://staging.etendo.example.com/mcp'), 'etendo-go-staging');
  });

  it('derives etendo-go-experimental for an experimental URL', () => {
    assert.equal(
      deriveServerName('https://experimental.etendo.example.com/mcp'),
      'etendo-go-experimental',
    );
  });

  it('derives etendo-go for a plain production URL', () => {
    assert.equal(deriveServerName('https://etendo.example.com/mcp'), 'etendo-go');
  });

  it('falls back to etendo-go for empty input', () => {
    assert.equal(deriveServerName(''), 'etendo-go');
  });

  it('falls back to etendo-go for undefined input (no crash)', () => {
    assert.equal(deriveServerName(undefined), 'etendo-go');
  });

  it('is case-insensitive (uppercase LOCALHOST -> etendo-go-local)', () => {
    assert.equal(deriveServerName('http://LOCALHOST:3100/mcp'), 'etendo-go-local');
  });
});

describe('buildMcpClients propagates the derived alias into config snippets', () => {
  const LOCAL_URL = 'http://localhost:3100/mcp';
  const LOCAL_NAME = 'etendo-go-local';

  it('injects the derived alias into the Claude Code install command', () => {
    const claudeCode = buildMcpClients(LOCAL_URL).find((c) => c.id === 'ClaudeCode');
    const codeItem = claudeCode.content.find((item) => item.code != null);
    assert.match(
      codeItem.code,
      /claude mcp add --scope user --transport http etendo-go-local/,
    );
    assert.ok(codeItem.code.includes(LOCAL_URL));
  });

  it('injects the derived alias into the Cursor deep-link href name param', () => {
    const cursor = buildMcpClients(LOCAL_URL).find((c) => c.id === 'Cursor');
    const href = cursor.content.find((item) => item.install).install.href;
    const name = new URL(href.replace('cursor://', 'https://placeholder/')).searchParams.get('name');
    assert.equal(name, LOCAL_NAME);
  });

  it('injects the derived alias into the VS Code deep-link decoded config name', () => {
    const vscode = buildMcpClients(LOCAL_URL).find((c) => c.id === 'VsCode');
    const href = vscode.content.find((item) => item.install).install.href;
    const encoded = href.slice('vscode:mcp/install?'.length);
    const decoded = JSON.parse(decodeURIComponent(encoded));
    assert.equal(decoded.name, LOCAL_NAME);
  });

  it('injects the derived alias into the Codex TOML section header and login command', () => {
    const codex = buildMcpClients(LOCAL_URL).find((c) => c.id === 'Codex');
    const codeSnippets = codex.content.filter((item) => item.code != null).map((item) => item.code);
    assert.ok(codeSnippets.some((code) => code.includes(`[mcp_servers.${LOCAL_NAME}]`)));
    assert.ok(codeSnippets.some((code) => code.includes(`codex mcp login ${LOCAL_NAME}`)));
  });

  it('injects the derived alias as the OpenCode mcp key', () => {
    const openCode = buildMcpClients(LOCAL_URL).find((c) => c.id === 'OpenCode');
    const codeItem = openCode.content.find((item) => item.code != null);
    const config = JSON.parse(codeItem.code);
    assert.ok(Object.prototype.hasOwnProperty.call(config.mcp, LOCAL_NAME));
    assert.deepEqual(config.mcp[LOCAL_NAME], { type: 'remote', url: LOCAL_URL, enabled: true });
  });

  it('injects the derived alias as the Antigravity mcpServers key', () => {
    const antigravity = buildMcpClients(LOCAL_URL).find((c) => c.id === 'Antigravity');
    const codeItem = antigravity.content.find((item) => item.code != null);
    const config = JSON.parse(codeItem.code);
    assert.ok(Object.prototype.hasOwnProperty.call(config.mcpServers, LOCAL_NAME));
    assert.deepEqual(config.mcpServers[LOCAL_NAME], { serverUrl: LOCAL_URL });
  });
});
