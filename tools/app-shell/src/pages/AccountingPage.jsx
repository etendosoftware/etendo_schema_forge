import React from 'react';
import { KPIHeader, DataTable } from '@/components/contract-ui';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { FileText, Receipt, Landmark, Scale } from 'lucide-react';

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
  return (
    <div className="space-y-6">
      {/* KPIs */}
      <KPIHeader kpis={KPIS} />

      {/* Row 1: Sales Invoices (2/3) + Purchase Invoices (1/3) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-muted-foreground" />
                Recent Sales Invoices
              </CardTitle>
            </CardHeader>
            <CardContent>
              <DataTable columns={SALES_INVOICES_COLUMNS} data={SALES_INVOICES_DATA} />
            </CardContent>
          </Card>
        </div>

        <div>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Receipt className="h-5 w-5 text-muted-foreground" />
                Recent Purchase Invoices
              </CardTitle>
            </CardHeader>
            <CardContent>
              <DataTable columns={PURCHASE_INVOICES_COLUMNS} data={PURCHASE_INVOICES_DATA} />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Row 2: Bank Summary (2/3) + Tax Summary (1/3) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Landmark className="h-5 w-5 text-muted-foreground" />
                Bank Accounts Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <DataTable columns={BANK_SUMMARY_COLUMNS} data={BANK_SUMMARY_DATA} />
            </CardContent>
          </Card>
        </div>

        <div>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Scale className="h-5 w-5 text-muted-foreground" />
                Tax Obligations
              </CardTitle>
            </CardHeader>
            <CardContent>
              <DataTable columns={TAX_SUMMARY_COLUMNS} data={TAX_SUMMARY_DATA} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
