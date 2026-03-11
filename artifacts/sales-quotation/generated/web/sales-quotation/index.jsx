import QuotationPage from './QuotationPage';

const windowMeta = { category: 'sales', name: 'Sales Quotation' };

export default function App({ token, apiBaseUrl, window, windowName, recordId }) {
  return <QuotationPage token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} windowName={windowName} recordId={recordId} />;
}
