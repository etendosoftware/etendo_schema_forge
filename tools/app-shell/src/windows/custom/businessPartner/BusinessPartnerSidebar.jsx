import { useState, useEffect } from 'react';
import { DollarSign, CreditCard } from 'lucide-react';
import { KPICard } from '@/components/contract-ui/KPIHeader';

function filterByMonth(records, dateField, year, month) {
  return records.filter(r => {
    const d = new Date(r[dateField]);
    return !isNaN(d) && d.getFullYear() === year && d.getMonth() + 1 === month;
  });
}

function sumField(records, field) {
  return records.reduce((s, r) => s + (Number(r[field]) || 0), 0);
}

function calcTrend(current, previous) {
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
}

export default function BusinessPartnerSidebar({ recordId, token, apiBaseUrl }) {
  const [salesInvoices, setSalesInvoices] = useState(null);
  const [purchaseInvoices, setPurchaseInvoices] = useState(null);

  useEffect(() => {
    if (!recordId || !token) return;
    const headers = { Authorization: `Bearer ${token}` };
    const neoBase = apiBaseUrl.replace(/\/[^/]+$/, '');

    setSalesInvoices(null);
    setPurchaseInvoices(null);

    fetch(
      `${neoBase}/sales-invoice/header?_startRow=0&_endRow=9999`,
      { headers }
    )
      .then(r => (r.ok ? r.json() : null))
      .then(data => setSalesInvoices(data?.response?.data ?? []))
      .catch(() => setSalesInvoices([]));

    fetch(
      `${neoBase}/purchase-invoice/header?_startRow=0&_endRow=9999`,
      { headers }
    )
      .then(r => (r.ok ? r.json() : null))
      .then(data => setPurchaseInvoices(data?.response?.data ?? []))
      .catch(() => setPurchaseInvoices([]));
  }, [recordId, token, apiBaseUrl]);

  const now = new Date();
  const curYear = now.getFullYear();
  const curMonth = now.getMonth() + 1;
  const prevYear = curMonth === 1 ? curYear - 1 : curYear;
  const prevMonth = curMonth === 1 ? 12 : curMonth - 1;

  // Filter to only invoices for this specific business partner
  const completedSales = (salesInvoices ?? []).filter(
    r => r.documentStatus === 'CO' && r.businessPartner === recordId
  );
  const completedPurchases = (purchaseInvoices ?? []).filter(
    r => r.documentStatus === 'CO' && r.businessPartner === recordId
  );

  const curSales = filterByMonth(completedSales, 'invoiceDate', curYear, curMonth);
  const prevSales = filterByMonth(completedSales, 'invoiceDate', prevYear, prevMonth);
  const curPurchases = filterByMonth(completedPurchases, 'invoiceDate', curYear, curMonth);
  const prevPurchases = filterByMonth(completedPurchases, 'invoiceDate', prevYear, prevMonth);

  const revenue = sumField(curSales, 'grandTotalAmount');
  const prevRevenue = sumField(prevSales, 'grandTotalAmount');
  const expenses = sumField(curPurchases, 'grandTotalAmount');
  const prevExpenses = sumField(prevPurchases, 'grandTotalAmount');

  const loading = salesInvoices === null || purchaseInvoices === null;

  if (loading) {
    return (
      <div className="flex flex-col gap-3 animate-pulse">
        <div className="h-24 rounded-xl bg-gray-100" />
        <div className="h-24 rounded-xl bg-gray-100" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <KPICard
        kpiKey="revenueThisMonth"
        label="Revenue this month"
        value={revenue}
        format="currency"
        trend={calcTrend(revenue, prevRevenue)}
        previousValue={prevRevenue || null}
        icon={DollarSign}
      />
      <KPICard
        kpiKey="expensesThisMonth"
        label="Expenses this month"
        value={expenses}
        format="currency"
        trend={calcTrend(expenses, prevExpenses)}
        previousValue={prevExpenses || null}
        icon={CreditCard}
      />
    </div>
  );
}
