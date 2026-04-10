// Auto-generated from aggregate-contract.json — DO NOT EDIT

export const kpis = {
  "revenueThisMonth": {
    "value": 48250,
    "trend": 12.5,
    "previousValue": 42889
  },
  "expensesThisMonth": {
    "value": 31800,
    "trend": 3.2,
    "previousValue": 30814
  },
  "netProfit": {
    "value": 16450,
    "trend": 28.7,
    "previousValue": 12782
  }
};

export const revenueTrend = {
  "labels": [
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
    "Jan",
    "Feb",
    "Mar"
  ],
  "values": [
    32000,
    35000,
    28000,
    41000,
    38000,
    45000,
    42000,
    39000,
    44000,
    47000,
    43000,
    48250
  ]
};

export const pendingTasks = [
  {
    "type": "warning",
    "text": "3 overdue invoices",
    "link": "/sales-invoice",
    "filter": {
      "documentStatus": "overdue"
    },
    "amount": "$12,400",
    "count": 3
  },
  {
    "type": "info",
    "text": "2 orders pending shipment",
    "link": "/goods-shipment",
    "filter": {
      "documentStatus": "pending"
    },
    "count": 2
  },
  {
    "type": "info",
    "text": "5 purchase orders to confirm",
    "link": "/purchase-order",
    "filter": {
      "documentStatus": "draft"
    },
    "count": 5
  },
  {
    "type": "warning",
    "text": "1 low stock alert",
    "link": "/physical-inventory",
    "detail": "Cerveza Ale 0.5L",
    "count": 1
  }
];

export const recentMessages = [
  {
    "id": "1",
    "author": "System",
    "text": "Invoice INV-2026-0142 was paid by Empresa ABC",
    "timestamp": "2026-03-09T08:30:00",
    "type": "system"
  },
  {
    "id": "2",
    "author": "Ana Garcia",
    "text": "New quotation QT-0089 created for $8,500",
    "timestamp": "2026-03-09T07:15:00",
    "type": "note"
  },
  {
    "id": "3",
    "author": "System",
    "text": "Purchase Order PO-0234 received (15 items)",
    "timestamp": "2026-03-08T16:45:00",
    "type": "system"
  },
  {
    "id": "4",
    "author": "Pedro Lopez",
    "text": "Stock adjustment completed for warehouse Madrid",
    "timestamp": "2026-03-08T14:20:00",
    "type": "note"
  }
];
