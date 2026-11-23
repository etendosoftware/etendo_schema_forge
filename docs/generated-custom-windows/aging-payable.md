# Aging Report (Payables)

## Intent
Show treasury users how much the company owes each contact and how overdue it is, split into aging brackets at an "as of" date. Same report as `aging-receivable.md` on the payables side: parameters, columns, detail cards, drill-down, exports, the treasury category (since ETP-6389) and the legacy `category=finance` rewrite all work as described there. This guide only lists the differences.

## Differences from the receivables report
- Card **Antigüedad de Pagos** (es) / **Aging of Payables** (en), in **Tesorería › Informes**.
- Route: `/report-viewer?category=treasury&report=aging-payable`; breadcrumb `Tesorería / Informes / Antigüedad de Pagos`.
- Menu: hidden `menu.json` row in the Treasury group with `reportId: "aging-payable"` and `path: "report-viewer?category=treasury&report=aging-payable"`.
- Backend: `POST /sws/neo/aging-payable` with an empty body, served by `AgingPayableReportHandler` (`@Named("agingPayableReportHandler")`), which always returns payables and has no `recOrPay` parameter.
- Access: running it requires the OBUIAPP process grant of Payables Aging (`EB4C4053F3B94A17A08D1DD7E89CEB7E`). `ReportAccessCatalog` row `aging-payable`, category `Treasury`.

## Manual verification
1. As a role with the Payables Aging grant but not the Receivables one, open Tesorería › Informes: only **Antigüedad de Pagos** is listed, and the sidebar shows the Informes entry.
2. Run it and confirm the rows are vendors you owe, not customers.
3. Repeat steps 3–7 of `aging-receivable.md` with `aging-payable`.

## Automated evidence
- `artifacts/aging-payable/report-contract.json` and its templates, `helpers.js` and `mock-data.json`.
- The shared tests listed in `aging-receivable.md` → *Automated evidence* run against both reports.
