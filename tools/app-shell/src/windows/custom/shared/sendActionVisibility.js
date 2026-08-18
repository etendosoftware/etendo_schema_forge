/**
 * ETP-4717 — several custom windows (sales-order, purchase-order via
 * useOrderWindow, sales-invoice/purchase-invoice via useInvoiceWindow,
 * sales-quotation, goods-shipment) build their rowQuickActions by hand and
 * bypass the generated contract's rowQuickActions block entirely, so
 * decisions.json's `visibleWhen` never reaches RowQuickActions there.
 * These constants are the hand-wired equivalent, mirrored by hand to match
 * each window's Form-view topbar and preview-panel Send gate. Import the
 * one that matches the window's rule instead of retyping the DocStatus
 * expression — a single literal here means no risk of a typo drifting
 * between call sites.
 */
export const SEND_VISIBLE_WHEN_CONFIRMED = "@DocumentStatus@='CO'";
export const SEND_VISIBLE_WHEN_NOT_DRAFT = "@DocumentStatus@!='DR'";
