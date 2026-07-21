import { ArrowLeftRight, Scale, FileText } from 'lucide-react';
import { useUI } from '@/i18n';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

/**
 * Tab strip for the financial account detail view.
 * TabsContent is rendered by the parent — this component only handles the triggers.
 *
 * @param {{
 *   value: string;
 *   onValueChange: (v: string) => void;
 *   movementsCount: number;
 *   reconciliationCount: number;
 * }} props
 */
export function DetailTabs({ value, onValueChange, movementsCount, reconciliationCount }) {
  const ui = useUI();

  return (
    <Tabs
      value={value}
      onValueChange={onValueChange}
      className="flex-row"
      data-testid="Tabs__a9be0b">
      <TabsList data-testid="TabsList__a9be0b">
        <TabsTrigger
          value="movements"
          icon={ArrowLeftRight}
          badge={movementsCount}
          data-testid="detail-tab-movements">
          {ui('financeAccountDetailTabMovements')}
        </TabsTrigger>
        <TabsTrigger
          value="reconciliation"
          icon={Scale}
          badge={reconciliationCount}
          data-testid="detail-tab-reconciliation">
          {ui('financeAccountDetailTabReconciliation')}
        </TabsTrigger>
        <TabsTrigger value="statements" icon={FileText} data-testid="detail-tab-statements">
          {ui('financeAccountDetailTabStatements')}
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
