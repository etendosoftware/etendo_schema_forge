import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'index.jsx'), 'utf8');

describe('SalesQuotationWindow custom wrapper', () => {
  it('exports a default function component', () => {
    assert.match(src, /export default function SalesQuotationWindow/);
  });

  it('delegates to GeneratedApp', () => {
    assert.match(src, /GeneratedApp/);
  });

  it('wraps the record view in CreateContactContext.Provider', () => {
    assert.match(src, /CreateContactContext\.Provider/);
    assert.match(src, /if \(recordId\)/);
  });

  it('manages cloneTargets state in the list view', () => {
    assert.match(src, /useState/);
    assert.match(src, /cloneTargets/);
  });

  it('forwards onCloneRow to GeneratedApp so it reaches the ListView', () => {
    assert.match(src, /onCloneRow/);
    assert.match(src, /setCloneTargets/);
  });

  it('normalizes a single row into an array before opening the modal', () => {
    assert.match(src, /Array\.isArray\(rowOrRows\)\s*\?\s*rowOrRows\s*:\s*\[rowOrRows\]/);
  });

  it('renders CloneOrderModal via portal when targets are selected', () => {
    assert.match(src, /CloneOrderModal/);
    assert.match(src, /createPortal/);
    assert.match(src, /document\.body/);
  });

  it('passes the sales-quotation route prefix so the modal can navigate to the clone', () => {
    assert.match(src, /routePrefix=["']\/sales-quotation\/["']/);
  });

  it('clears cloneTargets when the modal is closed', () => {
    assert.match(src, /setCloneTargets\(null\)/);
  });

  it('imports CloneOrderModal from contract-ui', () => {
    assert.match(src, /import\s+CloneOrderModal\s+from\s+['"]@\/components\/contract-ui\/CloneOrderModal['"]/);
  });

  describe('draftMode override for the Confirmar button', () => {
    it('defines a draftModeWithModal with enabled and the soConfirmBtn label', () => {
      assert.match(src, /draftModeWithModal\s*=\s*\{[^}]*enabled:\s*true/);
      assert.match(src, /label:\s*['"]soConfirmBtn['"]/);
    });

    it('routes onConfirm through a custom DOM event so QuotationTopbarActions can pick the right modal', () => {
      assert.match(
        src,
        /onConfirm:\s*\(\)\s*=>\s*window\.dispatchEvent\(\s*new\s+CustomEvent\(\s*['"]sales-quotation:open-confirm-modal['"]/,
      );
    });

    it('passes draftModeWithModal to GeneratedApp on the record view', () => {
      assert.match(src, /draftMode=\{draftModeWithModal\}/);
    });

    it('keeps Save/Confirm visible during UE by setting completedStatuses to the terminal statuses only', () => {
      assert.match(src, /completedStatuses:\s*\[[^\]]*['"]CA['"]/);
      assert.match(src, /completedStatuses:\s*\[[^\]]*['"]ETGO_CI['"]/);
      assert.match(src, /completedStatuses:\s*\[[^\]]*['"]CL['"]/);
      assert.match(src, /completedStatuses:\s*\[[^\]]*['"]VO['"]/);
      assert.match(src, /completedStatuses:\s*\[[^\]]*['"]CJ['"]/);
      assert.doesNotMatch(src, /completedStatuses:\s*\[[^\]]*['"]UE['"]/);
      assert.doesNotMatch(src, /completedStatuses:\s*\[[^\]]*['"]DR['"]/);
    });
  });

  describe('customMenuActions override (kebab reject)', () => {
    it('exports a customMenuActions function', () => {
      assert.match(src, /customMenuActions\s*=\s*\(\{\s*status\s*\}\)\s*=>/);
    });

    it('declares a reject entry visible only in UE', () => {
      assert.match(src, /key:\s*['"]reject['"]/);
      assert.match(src, /visible:\s*status\s*===\s*['"]UE['"]/);
    });

    it('does NOT mark the reject entry as destructive (regression: text was red, Figma uses neutral dark-gray)', () => {
      assert.doesNotMatch(src, /key:\s*['"]reject['"][\s\S]{0,200}destructive:\s*true/);
    });

    it('routes onClick through the open-reject-modal custom event', () => {
      assert.match(
        src,
        /onClick:\s*\(\)\s*=>\s*window\.dispatchEvent\(\s*new\s+CustomEvent\(\s*['"]sales-quotation:open-reject-modal['"]/,
      );
    });

    it('passes customMenuActions to GeneratedApp on the record view', () => {
      assert.match(src, /menuActions=\{customMenuActions\}/);
    });

    it('does not expose a cancel entry in the kebab anymore', () => {
      assert.doesNotMatch(src, /key:\s*['"]cancel['"]/);
    });

    it('renders the reject entry with the XCircle icon (Figma redesign)', () => {
      assert.match(src, /import\s*\{\s*XCircle\s*\}\s*from\s*['"]lucide-react['"]/);
      assert.match(src, /key:\s*['"]reject['"][\s\S]{0,200}icon:\s*XCircle/);
    });
  });

  describe('row quick actions — email visibility gate (ETP-4717)', () => {
    // This window builds rowQuickActions by hand (bypassing the generated
    // contract's rowQuickActions.actions.email.visibleWhen), so the gate must
    // be asserted here directly via source-regex. Regression: without it, the
    // Grid "Enviar" (email) quick action shows on every row regardless of
    // status. Quotation email is available from "Bajo evaluación" (UE)
    // onward, not while still Draft (DR). The literal DocStatus rule now
    // lives in the shared sendActionVisibility.js constant (dedup fix for a
    // SonarQube CPD finding); this test asserts both the indirection (the
    // import + the identifier used on the email action) and the constant's
    // real value, so it still proves the actual DocStatus rule, not just
    // that some constant is referenced.
    it('imports SEND_VISIBLE_WHEN_NOT_DRAFT from the shared sendActionVisibility module', () => {
      assert.match(
        src,
        /import\s*\{\s*SEND_VISIBLE_WHEN_NOT_DRAFT\s*\}\s*from\s*['"]\.\.\/shared\/sendActionVisibility\.js['"]/,
      );
    });

    it('sets visibleWhen on the email action to SEND_VISIBLE_WHEN_NOT_DRAFT to hide it while the quotation is still a Draft', () => {
      assert.match(
        src,
        /actions:\s*\{[\s\S]{0,700}email:\s*\{\s*visibleWhen:\s*SEND_VISIBLE_WHEN_NOT_DRAFT\s*\}/,
      );
    });

    it("SEND_VISIBLE_WHEN_NOT_DRAFT actually resolves to the DocStatus != Draft rule", () => {
      const sharedSrc = readFileSync(
        join(__dirname, '..', '..', 'shared', 'sendActionVisibility.js'),
        'utf8',
      );
      assert.match(
        sharedSrc,
        /export const SEND_VISIBLE_WHEN_NOT_DRAFT\s*=\s*["']@DocumentStatus@!='DR'["']/,
      );
    });
  });
  // ETP-5378 — row-hover "Confirmar": reuses the SAME two modals
  // QuotationTopbarActions dispatches to from the form, rather than inventing a
  // third flow (see the doc comment on openQuotationConfirm in index.jsx).
  describe('row-hover "Confirmar" (ETP-5378)', () => {
    it('imports the same two modals the form dispatches to', () => {
      assert.match(src, /import SendToEvaluationModal from '@generated\/sales-quotation\/custom\/SendToEvaluationModal';/);
      assert.match(src, /import QuotationConfirmModal from '@generated\/sales-quotation\/custom\/QuotationConfirmModal';/);
    });

    it('refetches the record through useApiFetch before opening either modal', () => {
      assert.match(src, /import \{ useApiFetch \} from '@\/auth\/useApiFetch\.js';/);
      assert.match(src, /apiFetch\(`\/quotation\/\$\{row\.id\}`\)/);
    });

    it('gates the row kebab Confirm entry to DR, CO and UE — the only statuses the form actually reacts to', () => {
      assert.match(src, /row\?\.documentStatus === 'DR' \|\| row\?\.documentStatus === 'CO' \|\| row\?\.documentStatus === 'UE'/);
    });

    it('composes with customMenuActions instead of replacing it, so Reject keeps rendering too', () => {
      assert.match(src, /rowMenuActions = useCallback\(\(\{ row, status \}\) => \[/);
      assert.match(src, /\.\.\.customMenuActions\(\{ status \}\)/);
    });

    it('wires rowMenuActions (not customMenuActions) into the row-hover rowQuickActions', () => {
      assert.match(src, /menuActions: rowMenuActions,/);
    });

    it('opens SendToEvaluationModal on a Draft record and QuotationConfirmModal otherwise', () => {
      assert.match(src, /confirmRow\.documentStatus === 'DR' \? \(/);
      assert.match(src, /<SendToEvaluationModal/);
      assert.match(src, /<QuotationConfirmModal/);
    });

    it('refreshes the LIST after QuotationConfirmModal creates an order/invoice, not the form', () => {
      assert.match(src, /onRefresh=\{\(\) => setRefreshKey\(k => k \+ 1\)\}/);
    });
  });
});
