import BankReconciliationPage from './BankReconciliationPage';

const windowMeta = { category: 'accounting', name: 'Bank Reconciliation' };

export default function App({ token, apiBaseUrl, window }) {
  return <BankReconciliationPage token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} />;
}
