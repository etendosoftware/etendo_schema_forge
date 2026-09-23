import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'index.jsx'), 'utf8');
const registrySrc = readFileSync(join(__dirname, '..', '..', '..', 'registry.js'), 'utf8');

function bulkDocumentActionBlocks() {
  return src.match(/<BulkDocumentAction[\s\S]*?\/>/g) ?? [];
}

describe('InternalConsumptionWindow custom wrapper (ETP-5445)', () => {
  it('exports a default function component', () => {
    assert.match(src, /export default function InternalConsumptionWindow\s*\(props\)/);
  });

  it('imports GeneratedApp from the internal-consumption generated artifact', () => {
    assert.match(
      src,
      /import GeneratedApp from '@generated\/internal-consumption\/generated\/web\/internal-consumption\/index\.jsx'/,
    );
  });

  it('imports BulkDocumentAction with the Post and Unpost builders and row filters', () => {
    assert.match(src, /import BulkDocumentAction,\s*\{[^}]*\bbuildPostActions\b[^}]*\}\s*from '@\/components\/contract-ui\/BulkDocumentAction'/);
    assert.match(src, /\bpostRowFilter\b/);
    assert.match(src, /\bbuildUnpostActions\b/);
    assert.match(src, /\bunpostRowFilter\b/);
  });

  it('imports the shared row quick-actions Post menu builder', () => {
    assert.match(
      src,
      /import \{ buildDocumentRowQuickActionsPostMenu \} from '\.\.\/shared\/buildDocumentRowQuickActions\.js'/,
    );
  });

  it('uses the i18n hook instead of hardcoded labels', () => {
    assert.match(src, /import \{ useUI \} from '@\/i18n'/);
    assert.match(src, /const ui = useUI\(\)/);
  });

  describe('bulk actions', () => {
    const blocks = bulkDocumentActionBlocks();

    it('renders exactly two BulkDocumentAction instances', () => {
      assert.equal(blocks.length, 2);
    });

    it('both bulk actions target the internalConsumption entity via neoAction mode', () => {
      for (const block of blocks) {
        assert.match(block, /entity="internalConsumption"/);
        assert.match(block, /actionMode="neoAction"/);
        assert.match(block, /\{\.\.\.props\}/);
      }
    });

    it('the Post bulk action wires buildPostActions, postRowFilter and the post label', () => {
      const post = blocks.find((b) => /labelKey="post"/.test(b));
      assert.ok(post, 'Post BulkDocumentAction not found');
      assert.match(post, /buildActions=\{buildPostActions\}/);
      assert.match(post, /rowFilter=\{postRowFilter\}/);
      assert.match(post, /data-testid="BulkDocumentActionPost__[0-9a-f]+"/);
    });

    it('the Unpost bulk action wires buildUnpostActions, unpostRowFilter and the unpost label', () => {
      const unpost = blocks.find((b) => /labelKey="unpost"/.test(b));
      assert.ok(unpost, 'Unpost BulkDocumentAction not found');
      assert.match(unpost, /buildActions=\{buildUnpostActions\}/);
      assert.match(unpost, /rowFilter=\{unpostRowFilter\}/);
      assert.match(unpost, /data-testid="BulkDocumentActionUnpost__[0-9a-f]+"/);
    });

    it('does not reuse another window entity (copy-paste guard)', () => {
      assert.doesNotMatch(src, /entity="inventory"/);
    });
  });

  describe('row quick actions', () => {
    it('enables row quick actions and spreads the shared Post menu builder', () => {
      assert.match(src, /enabled:\s*true,\s*\.\.\.buildDocumentRowQuickActionsPostMenu\(/s);
    });

    it('opts into the Unpost kebab entry', () => {
      assert.match(src, /buildDocumentRowQuickActionsPostMenu\(\{[\s\S]*?includeUnpost:\s*true[\s\S]*?\}\)/);
    });

    it('passes ui and a refresh callback that bumps the refresh key', () => {
      assert.match(src, /buildDocumentRowQuickActionsPostMenu\(\{[\s\S]*?\bui\b[\s\S]*?\}\)/);
      assert.match(src, /onRefresh:\s*\(\)\s*=>\s*setRefreshKey\(k\s*=>\s*k\s*\+\s*1\)/);
    });

    it('memoizes the quick actions on ui', () => {
      assert.match(src, /useMemo\(\(\)\s*=>\s*\(\{[\s\S]*?\}\),\s*\[ui\]\)/);
    });
  });

  describe('GeneratedApp props', () => {
    const appMatch = src.match(/<GeneratedApp[\s\S]*?\/>/);

    it('renders GeneratedApp', () => {
      assert.ok(appMatch, 'GeneratedApp element not found');
    });

    it('passes all incoming props through first', () => {
      assert.match(appMatch[0], /<GeneratedApp\s+\{\.\.\.props\}/);
    });

    it('passes bulkActions, rowQuickActions and refreshTrigger', () => {
      assert.match(appMatch[0], /bulkActions=\{InternalConsumptionBulkActions\}/);
      assert.match(appMatch[0], /rowQuickActions=\{rowQuickActions\}/);
      assert.match(appMatch[0], /refreshTrigger=\{refreshKey\}/);
    });

    it('does not override the generated more-menu (Void customMenuContent stays generated)', () => {
      assert.doesNotMatch(appMatch[0], /customMenuContent=/);
      assert.doesNotMatch(appMatch[0], /hideMoreMenu=/);
    });
  });

  describe('registry wiring', () => {
    it('registers internal-consumption in customLoaders pointing at this wrapper', () => {
      const loaders = registrySrc.match(/const customLoaders = \{[\s\S]*?\n\};/);
      assert.ok(loaders, 'customLoaders block not found in registry.js');
      assert.match(
        loaders[0],
        /'internal-consumption':\s*\(\)\s*=>\s*import\('\.\/custom\/internal-consumption\/index\.jsx'\)/,
      );
    });
  });
});
