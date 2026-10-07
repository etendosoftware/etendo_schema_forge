import { useCallback } from 'react';
import NewAccountModal from './NewAccountModal';
import { notifySaved, useChartOfAccountsTree } from './chartOfAccountsTreeStore';

const selectSelectedRecord = (s) => s.selectedRecord;
const selectAccounts = (s) => s.accounts;

/**
 * NewSubAccountCreateModal — the list toolbar's "Nueva subcuenta" (decisions
 * `customComponents.newRecordComponent`, ETP-5593). The generated page mounts it with
 * `token` / `apiBaseUrl` / `windowName` / `onClose` only, so the selected tree row (the
 * default parent) and the already-loaded accounts come from `chartOfAccountsTreeStore`.
 * After a save it closes and tells the tree to re-fetch.
 */
export default function NewSubAccountCreateModal({ token, apiBaseUrl, onClose }) {
  const selectedRecord = useChartOfAccountsTree(selectSelectedRecord);
  const accounts = useChartOfAccountsTree(selectAccounts);

  const handleSaved = useCallback(() => {
    notifySaved();
    onClose?.();
  }, [onClose]);

  return (
    <NewAccountModal
      isOpen
      onClose={onClose}
      onSaved={handleSaved}
      currentRecord={selectedRecord}
      allAccounts={accounts}
      apiBaseUrl={apiBaseUrl}
      token={token}
      data-testid="NewAccountModal__coacreate" />
  );
}
