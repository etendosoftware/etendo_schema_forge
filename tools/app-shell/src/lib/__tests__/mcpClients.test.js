import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildMcpClients } from '../mcpClients.js';

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

  it('marks the "Other" client as legacy and reuses the generic oauthStep keys', () => {
    const other = buildMcpClients(MCP_URL).find((c) => c.id === 'Other');
    assert.equal(other.legacy, true);
    const stepKeys = other.content.filter((item) => item.step != null).map((item) => item.key);
    assert.deepEqual(stepKeys, ['oauthStep1', 'oauthStep2', 'oauthStep3', 'oauthStep4']);
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
