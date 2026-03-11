import React, { useState } from 'react';
import { DataTable } from '@/components/contract-ui';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

import { sections } from '@generated/reports/generated/config';
import * as mockData from '@generated/reports/generated/mockData';

// -- Tab definitions ----------------------------------------------------------

const TABS = [
  { id: 'balanceSheet', label: 'Balance Sheet', title: 'Balance Sheet' },
  { id: 'profitLoss', label: 'P&L', title: 'Profit & Loss' },
  { id: 'agingReceivable', label: 'Aging Receivable', title: 'Aging of Receivables' },
  { id: 'agingPayable', label: 'Aging Payable', title: 'Aging of Payables' },
];

// -- Component ----------------------------------------------------------------

export default function ReportsPage() {
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
