// Auto-generated from aggregate-contract.json — DO NOT EDIT

export const meta = {
  "module": "dashboard",
  "label": "Dashboard",
  "icon": "LayoutDashboard",
  "route": "/dashboard"
};

export const kpisConfig = [
  {
    "key": "revenueThisMonth",
    "label": "Revenue this month",
    "format": "currency",
    "icon": "DollarSign"
  },
  {
    "key": "expensesThisMonth",
    "label": "Expenses this month",
    "format": "currency",
    "icon": "CreditCard"
  },
  {
    "key": "netProfit",
    "label": "Net Profit",
    "format": "currency",
    "icon": "TrendingUp"
  },
  {
    "key": "pendingInvoices",
    "label": "Pending Invoices",
    "format": "number",
    "icon": "Clock"
  }
];

export const sections = {
  "kpi-revenue": {
    "type": "kpi-single",
    "key": "revenueThisMonth",
    "label": "Revenue this month",
    "format": "currency",
    "icon": "DollarSign"
  },
  "kpi-expenses": {
    "type": "kpi-single",
    "key": "expensesThisMonth",
    "label": "Expenses this month",
    "format": "currency",
    "icon": "CreditCard"
  },
  "kpi-profit": {
    "type": "kpi-single",
    "key": "netProfit",
    "label": "Net Profit",
    "format": "currency",
    "icon": "TrendingUp"
  },
  "kpi-pending": {
    "type": "kpi-single",
    "key": "pendingInvoices",
    "label": "Pending Invoices",
    "format": "number",
    "icon": "Clock"
  },
  "revenue-trend": {
    "type": "chart",
    "chartType": "line",
    "xAxis": "Month",
    "yAxis": "Revenue ($)"
  },
  "quick-actions": {
    "type": "quick-actions"
  },
  "pending-tasks": {
    "type": "activity-feed",
    "fields": {
      "label": "text",
      "detail": "amount",
      "link": "link",
      "type": "type"
    }
  },
  "recent-messages": {
    "type": "chatter"
  }
};

export const layout = [
  {
    "section": "kpi-revenue",
    "span": "1/4"
  },
  {
    "section": "kpi-expenses",
    "span": "1/4"
  },
  {
    "section": "kpi-profit",
    "span": "1/4"
  },
  {
    "section": "kpi-pending",
    "span": "1/4"
  },
  {
    "section": "revenue-trend",
    "span": "2/3"
  },
  {
    "section": "quick-actions",
    "span": "2/3"
  },
  {
    "section": "pending-tasks",
    "span": "1/3"
  },
  {
    "section": "recent-messages",
    "span": "1/3"
  }
];

export const actions = [
  {
    "label": "+ Invoice",
    "route": "/sales-invoice",
    "icon": "FileText"
  },
  {
    "label": "+ Order",
    "route": "/sales-order",
    "icon": "ShoppingCart"
  },
  {
    "label": "+ Contact",
    "route": "/contacts",
    "icon": "Users"
  }
];
