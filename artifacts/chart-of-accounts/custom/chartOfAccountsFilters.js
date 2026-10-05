import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ACCOUNT_TYPE_UI_KEYS } from './accountTypeLabels';

/**
 * Chart of Accounts list filters, kept in the URL (ETP-5593) so the toolbar's Share
 * link reproduces the view, Back restores it, and the toolbar slot and the tree —
 * siblings inside ListView — read the same value (precedent: the Users `role` param,
 * `RoleQuickFilterToolbarSlot.jsx`).
 *
 *   ?accountType=<A|E|L|M|O|R>   one C_ElementValue.AccountType code; absent = all
 *   ?q=<text>                    code / name search; absent = none
 */
export const ACCOUNT_TYPE_PARAM = 'accountType';
export const SEARCH_PARAM = 'q';

/** An unknown or missing code means "all types". */
export function parseAccountType(raw) {
  return raw && Object.hasOwn(ACCOUNT_TYPE_UI_KEYS, raw) ? raw : null;
}

export function useChartOfAccountsFilters() {
  const [searchParams, setSearchParams] = useSearchParams();
  const accountType = parseAccountType(searchParams.get(ACCOUNT_TYPE_PARAM));
  const query = searchParams.get(SEARCH_PARAM) ?? '';

  const setParam = useCallback((name, value) => {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      if (value) params.set(name, value);
      else params.delete(name);
      return params;
    }, { replace: true });
  }, [setSearchParams]);

  const setAccountType = useCallback((code) => setParam(ACCOUNT_TYPE_PARAM, code), [setParam]);
  const setQuery = useCallback((text) => setParam(SEARCH_PARAM, text), [setParam]);

  return useMemo(
    () => ({ accountType, query, setAccountType, setQuery }),
    [accountType, query, setAccountType, setQuery],
  );
}
