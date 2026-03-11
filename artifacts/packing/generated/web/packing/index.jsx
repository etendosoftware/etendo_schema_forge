import PackingPage from './PackingPage';

const windowMeta = { category: 'warehouse', name: 'Packing' };

export default function App({ token, apiBaseUrl, window }) {
  return <PackingPage token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} />;
}
