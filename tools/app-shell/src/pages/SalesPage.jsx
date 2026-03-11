import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { KPIHeader, KanbanBoard } from '@/components/contract-ui';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { ShoppingCart, FileText, TrendingUp } from 'lucide-react';

import { sections } from '@generated/sales/generated/config';
import * as mockData from '@generated/sales/generated/mockData';

// -- Icon resolution (config stores string names) -----------------------------

const ICON_MAP = { ShoppingCart, FileText, TrendingUp };

// -- Derived data from contract -----------------------------------------------

const KPIS = sections.kpis.kpis.map((k) => ({
  ...k,
  value: mockData.kpis[k.key],
  trend: mockData.kpis.trends?.[k.key],
  icon: ICON_MAP[k.icon],
}));

const COLUMNS = sections.pipeline.columns;
const INITIAL_CARDS = mockData.pipeline;

const STATUS_LABEL = Object.fromEntries(COLUMNS.map((c) => [c.id, c.title]));

// UI-presentation mapping — kept inline because it's view logic, not data.
const STATUS_VARIANT = {
  draft: 'secondary',
  sent: 'default',
  negotiation: 'outline',
  won: 'default',
  lost: 'destructive',
};

function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

// -- Component -----------------------------------------------------------------

export default function SalesPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('kanban');
  const [cards, setCards] = useState(INITIAL_CARDS);

  const handleDragEnd = useCallback((cardId, _fromColumnId, toColumnId) => {
    setCards((prev) =>
      prev.map((c) => (c.id === cardId ? { ...c, columnId: toColumnId } : c))
    );
  }, []);

  const handleCardClick = useCallback(
    () => {
      navigate('/sales-quotation');
    },
    [navigate]
  );

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <KPIHeader kpis={KPIS} />

      {/* Tab switcher */}
      <div className="flex items-center gap-2">
        <Button
          variant={activeTab === 'kanban' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setActiveTab('kanban')}
        >
          Kanban
        </Button>
        <Button
          variant={activeTab === 'list' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setActiveTab('list')}
        >
          List
        </Button>
      </div>

      {/* Tab content */}
      {activeTab === 'kanban' && (
        <KanbanBoard
          columns={COLUMNS}
          cards={cards}
          onDragEnd={handleDragEnd}
          onCardClick={handleCardClick}
          emptyMessage="No quotations"
        />
      )}

      {activeTab === 'list' && (
        <Card>
          <CardHeader>
            <CardTitle>Quotations</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Document No</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Customer</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">Amount</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {cards.map((card) => (
                    <tr
                      key={card.id}
                      className="border-b last:border-0 hover:bg-muted/30 cursor-pointer transition-colors"
                      onClick={() => navigate('/sales-quotation')}
                    >
                      <td className="px-4 py-3 font-medium">{card.title}</td>
                      <td className="px-4 py-3 text-muted-foreground">{card.subtitle}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(card.value)}</td>
                      <td className="px-4 py-3">
                        <Badge variant={STATUS_VARIANT[card.columnId] || 'secondary'}>
                          {STATUS_LABEL[card.columnId] || card.columnId}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">2026-03-09</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
