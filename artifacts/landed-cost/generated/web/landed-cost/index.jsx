import LandedCostPage from './LandedCostPage';

const windowMeta = { category: 'procurement', name: 'Landed Cost' };

export default function App({ token, apiBaseUrl, window }) {
  return <LandedCostPage token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} />;
}
