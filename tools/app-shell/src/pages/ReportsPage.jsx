import React, { useState } from 'react';
import { useUI } from '@/i18n';
import { DataTable } from '@/components/contract-ui';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

import { sections } from '@generated/reports/generated/config';
import * as mockData from '@generated/reports/generated/mockData';

// -- Tab definitions ----------------------------------------------------------

// -- Component ----------------------------------------------------------------

export default function ReportsPage() {
  const ui = useUI();
  const TABS = [
    { id: 'balanceSheet', label: ui('balanceSheet'), title: ui('balanceSheet') },
    { id: 'profitLoss', label: ui('profitLoss'), title: ui('profitLossTitle') },
    { id: 'agingReceivable', label: ui('agingReceivable'), title: ui('agingReceivableTitle') },
    { id: 'agingPayable', label: ui('agingPayable'), title: ui('agingPayableTitle') },
  ];
  const [activeTab, setActiveTab] = useState('balanceSheet');

  const currentTab = TABS.find((t) => t.id === activeTab);
  const currentColumns = sections[activeTab]?.columns ?? [];
  const currentData = mockData[activeTab] ?? [];

  return (
    <div className="space-y-6">
      {/* Tab switcher */}
      <div className="flex items-center gap-2">
        {TABS.map((tab) => (
          <Button
            key={tab.id}
            variant={activeTab === tab.id ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      {/* Active report table */}
      <Card>
        <CardHeader>
          <CardTitle>{currentTab?.title}</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable columns={currentColumns} data={currentData} />
        </CardContent>
      </Card>
    </div>
  );
}
