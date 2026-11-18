import { Link, useInRouterContext } from 'react-router-dom';

/** Route of the purchase invoice window (same prefix the related-documents chips navigate to). */
export const PURCHASE_INVOICE_ROUTE = '/purchase-invoice';

/** Path of one purchase invoice in the SPA. */
export function purchaseInvoicePath(invoiceId) {
  return `${PURCHASE_INVOICE_ROUTE}/${encodeURIComponent(invoiceId)}`;
}

/**
 * ETP-6051 — link to the purchase invoice a CONFIRMED document created, used in the list row and in
 * the review panel. Inside the app's router it is a client-side `Link` (the router's basename is
 * applied); rendered on its own (a unit test, a story) it is a plain anchor. Clicks do not bubble:
 * the link sits inside a row that opens the review panel on click.
 *
 * @param {{invoiceId: string|null, className?: string, testId?: string, children: import('react').ReactNode}} props
 *   without an `invoiceId` the children render as plain text (no link to build)
 */
export default function InvoiceInboxInvoiceLink({ invoiceId, className, testId, children }) {
  const inRouter = useInRouterContext();
  if (!invoiceId) return <span className={className} data-testid={testId}>{children}</span>;
  const path = purchaseInvoicePath(invoiceId);
  const stop = (event) => event.stopPropagation();
  if (inRouter) {
    return (
      <Link to={path} className={className} onClick={stop} data-testid={testId}>
        {children}
      </Link>
    );
  }
  return (
    <a href={path} className={className} onClick={stop} data-testid={testId}>
      {children}
    </a>
  );
}
