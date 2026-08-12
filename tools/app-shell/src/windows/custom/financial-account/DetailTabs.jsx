import { ArrowLeftRight, Scale, FileText, History } from 'lucide-react';
import { useUI } from '@/i18n';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

/**
 * Declarative tab set of the financial account detail view (ETP-4795).
 *
 * Kept as data rather than literal JSX so the tab strip, the parent's content switch and the
 * parent's "active tab disappeared" guard all derive from ONE list — before this, hiding a tab
 * left the content area blank with no trigger highlighted, because nothing validated `activeTab`
 * against the tabs actually rendered.
 *
 * `visible` receives the account type as a THREE-state flag:
 *   `true`  → cash account
 *   `false` → bank / card account
 *   `undefined` → the account has not loaded yet
 * The type-dependent tabs test for an explicit `true`/`false`, so while the account is loading
 * NEITHER of them renders. That way a tab only ever appears — it never shows for a frame and then
 * vanishes once the real type arrives.
 *
 * ⚠ Naming: the new tab's key is `reconciliationList`, deliberately NOT `reconciliations`, so it is
 * not one character away from the existing `reconciliation` tab (the split panel / cash close).
 * Its i18n key does use the plural, because that is the label.
 */
const TAB_DEFS = [
  {
    key: 'movements',
    icon: ArrowLeftRight,
    labelKey: 'financeAccountDetailTabMovements',
    testId: 'detail-tab-movements',
    visible: () => true,
  },
  {
    key: 'reconciliation',
    icon: Scale,
    labelKey: 'financeAccountDetailTabReconciliation',
    testId: 'detail-tab-reconciliation',
    visible: () => true,
  },
  {
    // A cash drawer has no bank statements to import.
    key: 'statements',
    icon: FileText,
    labelKey: 'financeAccountDetailTabStatements',
    testId: 'detail-tab-statements',
    visible: (isCash) => isCash === false,
  },
  {
    // Read-only history of the FIN_Reconciliation documents the cash close produces.
    key: 'reconciliationList',
    icon: History,
    labelKey: 'financeAccountDetailTabReconciliations',
    testId: 'detail-tab-reconciliation-list',
    visible: (isCash) => isCash === true,
  },
];

/**
 * The tabs to render for an account.
 *
 * @param {boolean|undefined} isCash `true` cash, `false` bank/card, `undefined` still loading
 * @returns {Array<{key: string, icon: Function, labelKey: string, testId: string}>}
 */
export function getVisibleTabs(isCash) {
  return TAB_DEFS.filter((tab) => tab.visible(isCash));
}

/**
 * Tab strip for the financial account detail view.
 * TabsContent is rendered by the parent — this component only handles the triggers.
 *
 * @param {{
 *   value: string;
 *   onValueChange: (v: string) => void;
 *   isCash?: boolean;
 *   badges?: Record<string, number>;
 * }} props
 */
export function DetailTabs({ value, onValueChange, isCash, badges = {} }) {
  const ui = useUI();
  const tabs = getVisibleTabs(isCash);

  return (
    <Tabs
      value={value}
      onValueChange={onValueChange}
      className="flex-row"
      data-testid="Tabs__a9be0b">
      <TabsList data-testid="TabsList__a9be0b">
        {tabs.map((tab) => (
          <TabsTrigger
            key={tab.key}
            value={tab.key}
            icon={tab.icon}
            badge={badges[tab.key]}
            data-testid={tab.testId}>
            {ui(tab.labelKey)}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
