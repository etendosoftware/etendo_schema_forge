import BankReconciliationPage from './BankReconciliationPage';

const windowMeta = { category: 'accounting', name: 'Bank Reconciliation' };

export default function App({ token, apiBaseUrl, window, windowName, recordId }) {
  return <BankReconciliationPage token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} windowName={windowName} recordId={recordId} />;
}
