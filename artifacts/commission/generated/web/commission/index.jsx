import CommissionPage from './CommissionPage';

const windowMeta = { category: 'sales', name: 'Commission' };

export default function App({ token, apiBaseUrl, window, windowName, recordId }) {
  return <CommissionPage token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} windowName={windowName} recordId={recordId} />;
}
