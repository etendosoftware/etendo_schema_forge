import React from 'react';
import { useUI } from '@/i18n';
import { KPIHeader, DataTable } from '@/components/contract-ui';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Package, AlertTriangle, ArrowUp, ArrowDown, Search } from 'lucide-react';

import { kpisConfig, sections } from '@generated/inventory/generated/config';
import * as mockData from '@generated/inventory/generated/mockData';

// -- Icon map for resolving string names from config to React components ------

const ICON_MAP = { Package, AlertTriangle };

// -- Derived data from contract files -----------------------------------------

const KPIS = kpisConfig.map(k => ({
  ...k,
  value: mockData.kpis[k.key],
  icon: k.icon ? ICON_MAP[k.icon] : undefined,
}));

const COLUMNS = sections['stock-levels'].columns;
const FILTERS = sections['stock-levels'].filters;

const INVENTORY_DATA = mockData.stockLevels;
const LOW_STOCK_ALERTS = mockData.lowStock;
const RECENT_MOVEMENTS = mockData.recentMovements;

// -- Component -----------------------------------------------------------------

export default function InventoryPage() {
  const ui = useUI();
  return (
    <div className="space-y-6">
      {/* KPIs */}
      <KPIHeader kpis={KPIS} />

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: DataTable (2/3 width) */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="h-5 w-5 text-muted-foreground" />
                {ui('stockLevels')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <DataTable
                columns={COLUMNS}
                filters={FILTERS}
                data={INVENTORY_DATA}
              />
            </CardContent>
          </Card>
        </div>

        {/* Right column: Alerts + Recent Movements (1/3 width) */}
        <div className="space-y-6">
          {/* Low Stock Alerts */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                {ui('lowStockAlerts')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {LOW_STOCK_ALERTS.map((alert, idx) => (
                <div key={idx}>
                  {idx > 0 && <Separator className="mb-3" />}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{alert.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {alert.current} / {alert.minimum} {ui('minimum')}
                      </p>
                    </div>
                    <Badge
                      variant={alert.severity === 'red' ? 'destructive' : 'outline'}
                      className={
                        alert.severity === 'amber'
                          ? 'border-amber-300 bg-amber-50 text-amber-700'
                          : ''
                      }
                    >
                      {alert.severity === 'red' ? 'Critical' : 'Warning'}
                    </Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Recent Movements */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{ui('recentMovements')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {RECENT_MOVEMENTS.map((movement, idx) => (
                <div key={movement.id}>
                  {idx > 0 && <Separator className="mb-3" />}
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 rounded-full p-1 ${
                      movement.direction === 'in'
                        ? 'bg-emerald-100 text-emerald-600'
                        : 'bg-red-100 text-red-600'
                    }`}>
                      {movement.direction === 'in'
                        ? <ArrowUp className="h-3.5 w-3.5" />
                        : <ArrowDown className="h-3.5 w-3.5" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{movement.product}</p>
                      <p className="text-xs text-muted-foreground">
                        {movement.qty} {ui('units')} · {movement.warehouse}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {movement.time}
                    </span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
