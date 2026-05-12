export const DEFAULT_AUTH_RETURN_TO = '/dashboard';

export function buildOnboardingReturnTo(location) {
  const pathname = location?.pathname || '/';
  const search = location?.search || '';
  const hash = location?.hash || '';
  const params = new URLSearchParams({ returnTo: `${pathname}${search}${hash}` });
  return `/onboarding?${params.toString()}`;
}

export function getSafeReturnTo(search, fallback = DEFAULT_AUTH_RETURN_TO) {
  const params = new URLSearchParams(search || '');
  const returnTo = params.get('returnTo');
  return isSafeLocalReturnTo(returnTo) ? returnTo : fallback;
}

export function buildAppReturnToHref(target, currentPathname) {
  const safeTarget = isSafeLocalReturnTo(target) ? target : DEFAULT_AUTH_RETURN_TO;
  const basePath = getCurrentAppBasePath(currentPathname);
  return `${basePath}${safeTarget}`;
}

export function isSafeLocalReturnTo(value) {
  if (typeof value !== 'string') return false;
  const target = value.trim();
  return target.startsWith('/') &&
    !target.startsWith('//') &&
    !target.includes('\\') &&
    !/^\/(?:onboarding|login)(?:[/?#]|$)/.test(target);
}

function getCurrentAppBasePath(currentPathname) {
  const pathname = currentPathname || '';
  const onboardingIndex = pathname.lastIndexOf('/onboarding');
  return onboardingIndex === -1 ? '' : pathname.slice(0, onboardingIndex);
}
