// Frontend password strength policy. This mirrors the backend PasswordPolicy
// (com.etendoerp.go.rest.PasswordPolicy) for immediate UX feedback only — the
// backend remains the security boundary.

export const MIN_PASSWORD_LENGTH = 8;

// Rule keys, in display order. Each maps to an i18n label
// `onboardingPasswordReq<Capitalized>` in the app-shell-core locales.
export const PASSWORD_RULES = ['minLength', 'uppercase', 'lowercase', 'number', 'special'];

/**
 * Evaluate each password rule independently.
 * @param {string} password
 * @returns {{minLength: boolean, uppercase: boolean, lowercase: boolean, number: boolean, special: boolean}}
 */
export function getPasswordChecks(password) {
  const value = password || '';
  return {
    minLength: value.length >= MIN_PASSWORD_LENGTH,
    uppercase: /[A-Z]/.test(value),
    lowercase: /[a-z]/.test(value),
    number: /\d/.test(value),
    // Any non-alphanumeric, non-whitespace character (matches the backend rule).
    special: /[^A-Za-z0-9\s]/.test(value),
  };
}

/**
 * @param {string} password
 * @returns {boolean} whether the password satisfies every rule.
 */
export function isStrongPassword(password) {
  return Object.values(getPasswordChecks(password)).every(Boolean);
}
