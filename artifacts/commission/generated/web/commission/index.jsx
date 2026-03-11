import CommissionPage from './CommissionPage';

const windowMeta = { category: 'sales', name: 'Commission' };

export default function App({ token, apiBaseUrl, window }) {
  return <CommissionPage token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} />;
}
