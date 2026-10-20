// @covers tools/app-shell/src/lib/myCompanies/telemetry.js
// @covers tools/app-shell/src/lib/observability/events.js

const trackMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/observability.js', () => ({
  track: trackMock,
}));

import {
  companyRelationship,
  trackMyCompaniesEnterClicked,
  trackMyCompaniesEnterFailed,
  trackMyCompaniesViewed,
} from '../telemetry.js';

const OWNED = { clientId: 'own-1', clientName: 'GOClient', relationship: 'OWNER' };
const INVITED = { clientId: 'inv-1', clientName: 'Distribuciones Norte', relationship: 'INVITED' };

beforeEach(() => {
  trackMock.mockReset();
  trackMock.mockResolvedValue(undefined);
});

describe('companyRelationship', () => {
  it('reports an owned company as owner and anything else as guest', () => {
    expect(companyRelationship(OWNED)).toBe('owner');
    expect(companyRelationship(INVITED)).toBe('guest');
    expect(companyRelationship(undefined)).toBe('guest');
  });
});

describe('my companies telemetry', () => {
  it('tracks the page view with the number of enterable companies', () => {
    trackMyCompaniesViewed(3);

    expect(trackMock).toHaveBeenCalledWith('my_companies_viewed', { count: 3 });
  });

  it('tracks an enter click with the relationship and never the company name or id', () => {
    trackMyCompaniesEnterClicked(INVITED);

    expect(trackMock).toHaveBeenCalledWith('my_companies_enter_clicked', { type: 'guest' });
  });

  it('tracks a failed enter with the relationship', () => {
    trackMyCompaniesEnterFailed(OWNED);

    expect(trackMock).toHaveBeenCalledWith('my_companies_enter_failed', { type: 'owner' });
  });

  it('drops a count outside the allowed range instead of sending it', () => {
    trackMyCompaniesViewed(-1);

    expect(trackMock).toHaveBeenCalledWith('my_companies_viewed', {});
  });

  it('does not throw when tracking rejects', async () => {
    trackMock.mockRejectedValue(new Error('offline'));

    expect(() => trackMyCompaniesEnterClicked(OWNED)).not.toThrow();
    await Promise.resolve();
  });
});
