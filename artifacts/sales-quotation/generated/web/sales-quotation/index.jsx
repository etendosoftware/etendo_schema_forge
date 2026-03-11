import QuotationPage from './QuotationPage';

const windowMeta = { category: 'sales', name: 'Sales Quotation' };

export default function App({ token, apiBaseUrl, window }) {
  return <QuotationPage token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} />;
}
