import CommissionRunPage from './CommissionRunPage';

const windowMeta = { category: 'sales', name: 'Commission Payment' };

export default function App({ token, apiBaseUrl, window, windowName, recordId }) {
  return <CommissionRunPage token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} windowName={windowName} recordId={recordId} />;
}
