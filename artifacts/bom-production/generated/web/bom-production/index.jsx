import ProductionPage from './ProductionPage';

const windowMeta = { category: 'warehouse', name: 'BOM Production' };

export default function App({ token, apiBaseUrl, window, windowName, recordId }) {
  return <ProductionPage token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} windowName={windowName} recordId={recordId} />;
}
