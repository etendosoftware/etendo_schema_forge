import { useFeatureFlag, MY_COMPANIES_PAGE } from '@/lib/flags';

export const ACCOUNT_PATH = '/account';
export const MY_COMPANIES_PATH = '/companies';
/** Query parameter that unfolds one owned company's subscription on "Mis empresas". */
export const SUBSCRIPTION_QUERY_PARAM = 'subscription';
/** Query parameter naming the CTA that opened "Mis empresas", for `my_companies_viewed.source`. */
export const FROM_QUERY_PARAM = 'from';

/**
 * ETP-6060 — where "see / manage the subscription" leads. With the `my-companies-page` flag on,
 * each owned company's subscription lives on "Mis empresas", so the link opens that page with the
 * company's row unfolded; off, it is the Subscription section of `/account`, as before. `from`
 * names the CTA (a `MY_COMPANIES_SOURCES` value) so the visit is attributed to it.
 */
export function subscriptionPathFor(myCompaniesEnabled, clientId, from = null) {
  if (!myCompaniesEnabled) return ACCOUNT_PATH;
  const query = new URLSearchParams();
  if (clientId) query.set(SUBSCRIPTION_QUERY_PARAM, clientId);
  if (from) query.set(FROM_QUERY_PARAM, from);
  const search = query.toString();
  return search ? `${MY_COMPANIES_PATH}?${search}` : MY_COMPANIES_PATH;
}

/**
 * The page a billing banner must not show on: the one its own CTA leads to, where the subscription
 * is already on screen, so the banner would only repeat it and link to itself.
 */
export function subscriptionPagePath(myCompaniesEnabled) {
  return myCompaniesEnabled ? MY_COMPANIES_PATH : ACCOUNT_PATH;
}

export function useSubscriptionPath(clientId, from = null) {
  return subscriptionPathFor(useFeatureFlag(MY_COMPANIES_PAGE), clientId, from);
}

export function useSubscriptionPagePath() {
  return subscriptionPagePath(useFeatureFlag(MY_COMPANIES_PAGE));
}
