// @covers tools/app-shell/src/lib/myCompanies/subscriptionPath.js

import { subscriptionPagePath, subscriptionPathFor } from '../subscriptionPath.js';

// ETP-6060 — where "see / manage the subscription" leads, with and without "Mis empresas".
describe('subscriptionPathFor', () => {
  it('keeps /account while the my-companies-page flag is off', () => {
    expect(subscriptionPathFor(false, 'CLIENT-1')).toBe('/account');
    expect(subscriptionPathFor(false, null)).toBe('/account');
  });

  it("opens the company's row on My companies while the flag is on", () => {
    expect(subscriptionPathFor(true, 'CLIENT 1')).toBe('/companies?subscription=CLIENT+1');
  });

  it('names the CTA that opened the page, for the visit attribution', () => {
    expect(subscriptionPathFor(true, 'C1', 'billing_banner'))
      .toBe('/companies?subscription=C1&from=billing_banner');
    expect(subscriptionPathFor(false, 'C1', 'billing_banner')).toBe('/account');
  });

  it('opens My companies folded when no company is known', () => {
    expect(subscriptionPathFor(true, null)).toBe('/companies');
  });
});

describe('subscriptionPagePath', () => {
  it('is the page the subscription lives on', () => {
    expect(subscriptionPagePath(false)).toBe('/account');
    expect(subscriptionPagePath(true)).toBe('/companies');
  });
});
