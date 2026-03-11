import CostAdjustmentPage from './CostAdjustmentPage';

const windowMeta = { category: 'warehouse', name: 'Cost Adjustment' };

export default function App({ token, apiBaseUrl, window }) {
  return <CostAdjustmentPage token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} />;
}
