import React, { useEffect } from 'react';
import { KPIHeader, DataTable } from '@/components/contract-ui';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { FileText, Receipt, Landmark, Scale } from 'lucide-react';
import { useUI } from '@/i18n';
import { track, trackKpiEvent } from '@/lib/observability.js';

import { kpisConfig, sections } from '@generated/accounting/generated/config';
import * as mockData from '@generated/accounting/generated/mockData';

// -- Derived data from contract files -----------------------------------------

const KPIS = kpisConfig.map(k => ({
  ...k,
  value: mockData.kpis[k.key],
}));

const SALES_INVOICES_COLUMNS = sections['salesInvoices'].columns;
const PURCHASE_INVOICES_COLUMNS = sections['purchaseInvoices'].columns;
const BANK_SUMMARY_COLUMNS = sections['bankSummary'].columns;
const TAX_SUMMARY_COLUMNS = sections['taxSummary'].columns;

const SALES_INVOICES_DATA = mockData.salesInvoices;
const PURCHASE_INVOICES_DATA = mockData.purchaseInvoices;
const BANK_SUMMARY_DATA = mockData.bankSummary;
const TAX_SUMMARY_DATA = mockData.taxSummary;

// -- Component -----------------------------------------------------------------

export default function AccountingPage() {
  const ui = useUI();

  useEffect(() => {
    Promise.resolve(trackKpiEvent(track, 'accounting_dashboard_viewed', {
      kpiId: 'kpi_adopt_accounting_board_weekly',
      module: 'accounting',
      source: 'accounting_dashboard',
      status: 'success',
    })).catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <KPIHeader kpis={KPIS} data-testid="KPIHeader__2f5a25" />
      {/* Row 1: Sales Invoices (2/3) + Purchase Invoices (1/3) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card data-testid="Card__2f5a25">
            <CardHeader data-testid="CardHeader__2f5a25">
              <CardTitle className="flex items-center gap-2" data-testid="CardTitle__2f5a25">
                <FileText className="h-5 w-5 text-muted-foreground" data-testid="FileText__2f5a25" />
                {ui('recentSalesInvoices')}
              </CardTitle>
            </CardHeader>
            <CardContent data-testid="CardContent__2f5a25">
              <DataTable
                columns={SALES_INVOICES_COLUMNS}
                data={SALES_INVOICES_DATA}
                data-testid="DataTable__2f5a25" />
            </CardContent>
          </Card>
        </div>

        <div>
          <Card data-testid="Card__2f5a25">
            <CardHeader data-testid="CardHeader__2f5a25">
              <CardTitle className="flex items-center gap-2" data-testid="CardTitle__2f5a25">
                <Receipt className="h-5 w-5 text-muted-foreground" data-testid="Receipt__2f5a25" />
                {ui('recentPurchaseInvoices')}
              </CardTitle>
            </CardHeader>
            <CardContent data-testid="CardContent__2f5a25">
              <DataTable
                columns={PURCHASE_INVOICES_COLUMNS}
                data={PURCHASE_INVOICES_DATA}
                data-testid="DataTable__2f5a25" />
            </CardContent>
          </Card>
        </div>
      </div>
      {/* Row 2: Bank Summary (2/3) + Tax Summary (1/3) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card data-testid="Card__2f5a25">
            <CardHeader data-testid="CardHeader__2f5a25">
              <CardTitle className="flex items-center gap-2" data-testid="CardTitle__2f5a25">
                <Landmark className="h-5 w-5 text-muted-foreground" data-testid="Landmark__2f5a25" />
                {ui('bankAccountsSummary')}
              </CardTitle>
            </CardHeader>
            <CardContent data-testid="CardContent__2f5a25">
              <DataTable
                columns={BANK_SUMMARY_COLUMNS}
                data={BANK_SUMMARY_DATA}
                data-testid="DataTable__2f5a25" />
            </CardContent>
          </Card>
        </div>

        <div>
          <Card data-testid="Card__2f5a25">
            <CardHeader data-testid="CardHeader__2f5a25">
              <CardTitle className="flex items-center gap-2" data-testid="CardTitle__2f5a25">
                <Scale className="h-5 w-5 text-muted-foreground" data-testid="Scale__2f5a25" />
                {ui('taxObligations')}
              </CardTitle>
            </CardHeader>
            <CardContent data-testid="CardContent__2f5a25">
              <DataTable
                columns={TAX_SUMMARY_COLUMNS}
                data={TAX_SUMMARY_DATA}
                data-testid="DataTable__2f5a25" />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
