import { getStatusTone, getStatusBadgeProps, getStatusDotColor, getStatusPillClass, getStatusGridPillClass, statusLabel } from '../statusBadge';

describe('statusBadge', () => {
  describe('getStatusTone', () => {
    it.each([
      ['co', 'success'], ['CO', 'success'], ['completed', 'success'], ['y', 'success'], ['true', 'success'], ['pa', 'success'],
      ['ip', 'warning'], ['rpap', 'warning'], ['in process', 'warning'],
      ['vo', 'destructive'], ['cj', 'destructive'], ['voided', 'destructive'], ['rejected', 'destructive'],
      ['dr', 'neutral'], ['unknown', 'neutral'], [null, 'neutral'], [undefined, 'neutral'],
    ])('maps %s → %s', (status, expected) => {
      expect(getStatusTone(status)).toBe(expected);
    });
  });

  describe('getStatusBadgeProps', () => {
    it('returns emerald for completed statuses', () => {
      const props = getStatusBadgeProps('CO');
      expect(props.className).toContain('emerald');
    });

    it('returns secondary for draft', () => {
      expect(getStatusBadgeProps('DR').variant).toBe('secondary');
    });

    it('returns destructive for voided', () => {
      expect(getStatusBadgeProps('VO').variant).toBe('destructive');
    });

    it('returns outline for in process', () => {
      expect(getStatusBadgeProps('IP').variant).toBe('outline');
      expect(getStatusBadgeProps('IP').className).toContain('amber');
    });

    it('returns outline for under evaluation', () => {
      expect(getStatusBadgeProps('UE').className).toContain('purple');
    });

    it('returns blue for closed/paid', () => {
      expect(getStatusBadgeProps('CL').className).toContain('blue');
    });

    it('returns outline for unknown', () => {
      expect(getStatusBadgeProps('XYZ').variant).toBe('outline');
    });
  });

  describe('getStatusDotColor', () => {
    it('returns emerald for completed', () => { expect(getStatusDotColor('CO')).toContain('emerald'); });
    it('returns red for voided', () => { expect(getStatusDotColor('VO')).toContain('red'); });
    it('returns amber for in process', () => { expect(getStatusDotColor('IP')).toContain('amber'); });
    it('returns gray for unknown', () => { expect(getStatusDotColor('?')).toContain('gray'); });
    it('returns blue for closed', () => { expect(getStatusDotColor('CL')).toContain('blue'); });
  });

  describe('getStatusPillClass', () => {
    it('returns emerald for completed', () => { expect(getStatusPillClass('CO')).toContain('emerald'); });
    it('returns red for voided', () => { expect(getStatusPillClass('VO')).toContain('red'); });
    it('returns gray for draft', () => { expect(getStatusPillClass('DR')).toContain('gray'); });
  });

  describe('getStatusGridPillClass', () => {
    it('returns emerald+white for completed', () => {
      const cls = getStatusGridPillClass('CO');
      expect(cls).toContain('emerald');
      expect(cls).toContain('white');
    });
    it('returns border for draft', () => { expect(getStatusGridPillClass('DR')).toContain('border'); });
  });

  describe('getStatusTone (extended)', () => {
    it.each([
      ['ca', 'success'], ['etgo_ci', 'success'], ['rppc', 'success'], ['ppm', 'success'],
      ['pwnc', 'success'], ['rdnc', 'success'], ['confirmed', 'success'], ['booked', 'success'],
      ['paid', 'success'], ['processed', 'success'], ['yes', 'success'],
      ['rpae', 'warning'], ['rpr', 'warning'], ['ue', 'warning'], ['under evaluation', 'warning'],
      ['rpvoid', 'destructive'], ['rpvd', 'destructive'], ['cancelled', 'destructive'], ['void', 'destructive'],
    ])('maps %s to %s', (status, expected) => {
      expect(getStatusTone(status)).toBe(expected);
    });
  });

  describe('getStatusBadgeProps (extended)', () => {
    it('returns emerald for true/processed', () => {
      expect(getStatusBadgeProps('true').className).toContain('emerald');
      expect(getStatusBadgeProps('processed').className).toContain('emerald');
    });

    it('returns secondary for false/not processed', () => {
      expect(getStatusBadgeProps('false').variant).toBe('secondary');
      expect(getStatusBadgeProps('not processed').variant).toBe('secondary');
    });

    it('returns emerald for ca/etgo_ci/rppc/ppm/pwnc/rdnc', () => {
      for (const code of ['ca', 'etgo_ci', 'rppc', 'ppm', 'pwnc', 'rdnc']) {
        expect(getStatusBadgeProps(code).className).toContain('emerald');
      }
    });

    it('returns blue for pa/paid', () => {
      expect(getStatusBadgeProps('PA').className).toContain('blue');
      expect(getStatusBadgeProps('paid').className).toContain('blue');
    });

    it('returns destructive for rpvoid/rejected', () => {
      expect(getStatusBadgeProps('rpvoid').variant).toBe('destructive');
      expect(getStatusBadgeProps('rejected').variant).toBe('destructive');
    });

    it('returns amber for rpap/rpae/rpr', () => {
      for (const code of ['RPAP', 'RPAE', 'RPR']) {
        expect(getStatusBadgeProps(code).className).toContain('amber');
      }
    });
  });

  describe('getStatusDotColor (extended)', () => {
    it.each([
      ['true', 'emerald'], ['processed', 'emerald'],
      ['false', 'gray'], ['not processed', 'gray'],
      ['ca', 'emerald'], ['etgo_ci', 'emerald'], ['rppc', 'emerald'],
      ['ppm', 'emerald'], ['pwnc', 'emerald'], ['rdnc', 'emerald'],
      ['pa', 'blue'], ['paid', 'blue'],
      ['rpvoid', 'red'], ['cj', 'red'], ['rejected', 'red'], ['cancelled', 'red'],
      ['rpae', 'amber'], ['rpap', 'amber'], ['rpr', 'amber'],
      ['ue', 'purple'],
    ])('maps %s to contain %s', (status, expected) => {
      expect(getStatusDotColor(status)).toContain(expected);
    });
  });

  describe('getStatusPillClass (extended)', () => {
    it.each([
      ['true', 'emerald'], ['processed', 'emerald'],
      ['false', 'gray'], ['not processed', 'gray'],
      ['confirmed', 'emerald'], ['ca', 'emerald'],
      ['pa', 'blue'], ['cl', 'blue'],
      ['rpvoid', 'red'], ['cancelled', 'red'],
      ['rpae', 'amber'], ['rpap', 'amber'], ['rpr', 'amber'],
      ['ue', 'purple'],
    ])('maps %s to contain %s', (status, expected) => {
      expect(getStatusPillClass(status)).toContain(expected);
    });

    it('returns gray fallback for unknown code', () => {
      expect(getStatusPillClass('XYZ')).toContain('gray');
    });
  });

  describe('getStatusGridPillClass (extended)', () => {
    it.each([
      ['true', 'emerald'], ['processed', 'emerald'],
      ['false', 'gray'], ['not processed', 'gray'],
      ['confirmed', 'emerald'], ['booked', 'emerald'],
      ['ca', 'emerald'], ['etgo_ci', 'emerald'],
      ['cl', 'slate'], ['pa', 'slate'],
      ['rpvoid', 'red'], ['cj', 'red'], ['rejected', 'red'],
      ['rpae', 'amber'], ['rpap', 'amber'], ['rpr', 'amber'],
      ['ue', 'purple'],
    ])('maps %s to contain %s', (status, expected) => {
      expect(getStatusGridPillClass(status)).toContain(expected);
    });

    it('returns border for unknown code', () => {
      expect(getStatusGridPillClass('XYZ')).toContain('border');
    });
  });

  describe('statusLabel', () => {
    it('returns DB-sourced label when available', () => {
      const dict = { statuses: { CO: { label: 'Completado' } } };
      expect(statusLabel('CO', dict)).toBe('Completado');
    });

    it('falls back to genericLabels', () => {
      const dict = { genericLabels: { statusComplete: 'Complete' } };
      expect(statusLabel('CO', dict)).toBe('Complete');
    });

    it('uses translate function as third fallback', () => {
      const translate = (key) => key === 'statusComplete' ? 'Completed' : key;
      expect(statusLabel('CO', {}, translate)).toBe('Completed');
    });

    it('humanizes key name as last resort', () => {
      expect(statusLabel('CO', {})).toBe('Complete');
    });

    it('returns raw status for unmapped codes', () => {
      expect(statusLabel('UNKNOWN', {})).toBe('UNKNOWN');
    });

    it('handles null dictionary', () => {
      expect(statusLabel('DR', null)).toBe('Draft');
    });

    it('returns translate result when it differs from key', () => {
      const translate = (key) => key === 'statusDraft' ? 'Borrador' : key;
      expect(statusLabel('DR', {}, translate)).toBe('Borrador');
    });

    it('falls through translate when result equals key', () => {
      const translate = (key) => key; // returns the key unchanged
      expect(statusLabel('DR', {}, translate)).toBe('Draft'); // humanize fallback
    });

    it('maps boolean-like statuses', () => {
      expect(statusLabel('true', {})).toBe('Processed');
      // 'false' maps to literal string 'Not Processed'; humanize adds space before 'P'
      expect(statusLabel('false', {})).toBe('Not  Processed');
    });

    it('maps Y/N statuses', () => {
      const dict = { genericLabels: { statusProcessed: 'Procesado' } };
      expect(statusLabel('Y', dict)).toBe('Procesado');
    });

    it('maps payment status codes', () => {
      expect(statusLabel('RPR', {})).toContain('Payment');
      expect(statusLabel('RPAE', {})).toContain('Awaiting');
      expect(statusLabel('RPPC', {})).toContain('Payment');
      expect(statusLabel('PPM', {})).toContain('Payment');
    });

    it('maps RPVOID to Void', () => {
      expect(statusLabel('RPVOID', {})).toBe('Void');
    });

    it('maps CA to Order Created', () => {
      expect(statusLabel('CA', {})).toContain('Order');
    });

    it('maps ETGO_CI to Invoice Created', () => {
      expect(statusLabel('ETGO_CI', {})).toContain('Invoice');
    });

    it('maps PWNC and RDNC statuses', () => {
      expect(statusLabel('PWNC', {})).toBeTruthy();
      expect(statusLabel('RDNC', {})).toBeTruthy();
    });
  });

  describe('statusLabel — enumLabels param', () => {
    const enumLabels = { true: 'statusProcessed', false: 'statusDraft' };

    it('resolves boolean true via enumLabels → genericLabels', () => {
      const dict = { genericLabels: { statusProcessed: 'Procesado', statusDraft: 'Borrador' } };
      expect(statusLabel(true, dict, undefined, enumLabels)).toBe('Procesado');
    });

    it('resolves boolean false via enumLabels → genericLabels', () => {
      const dict = { genericLabels: { statusProcessed: 'Procesado', statusDraft: 'Borrador' } };
      expect(statusLabel(false, dict, undefined, enumLabels)).toBe('Borrador');
    });

    it('resolves enumLabels value via translate() when genericLabels is missing', () => {
      const translate = (key) => (key === 'statusProcessed' ? 'Processed' : key === 'statusDraft' ? 'Draft' : key);
      expect(statusLabel(true, {}, translate, enumLabels)).toBe('Processed');
      expect(statusLabel(false, {}, translate, enumLabels)).toBe('Draft');
    });

    it('falls through (ignores literal enumLabels) when neither genericLabels nor translate resolve it', () => {
      // translate returns the key unchanged → the literal does NOT resolve as an
      // i18n key, so the enumLabels branch falls through. With an unknown raw code
      // that has no dict/MAP entry, statusLabel returns the raw code itself.
      const translate = (key) => key;
      expect(statusLabel('UNKNOWN_CODE', {}, translate, { UNKNOWN_CODE: 'MyLiteralLabel' })).toBe('UNKNOWN_CODE');
    });

    it('falls through (ignores literal enumLabels) when translate is absent', () => {
      // No translate, no genericLabels → the literal label does not resolve as a
      // key, so the branch falls through to the dictionary/MAP/humanize path. For
      // an unknown raw code with no MAP entry, the raw code is returned.
      expect(statusLabel('UNKNOWN_CODE', {}, undefined, { UNKNOWN_CODE: 'LiteralLabel' })).toBe('UNKNOWN_CODE');
    });

    it('falls through to MAP result when literal enumLabels does not resolve as a key', () => {
      // 'DR' has a MAP entry (statusDraft → humanized 'Draft'). A literal
      // enumLabels value that is not an i18n key must NOT override that path.
      expect(statusLabel('DR', {}, undefined, { DR: 'SomethingLiteral' })).toBe('Draft');
    });

    it('enumLabels literal does not override a code resolvable via dictionary.statuses', () => {
      // Regression guard: windows with literal enumLabels (e.g. internal-consumption,
      // sales-invoice) must keep the localized dictionary.statuses label. The literal
      // 'Draft' must NOT win over the DB-sourced 'Borrador'.
      const dict = { statuses: { DR: { label: 'Borrador' } } };
      expect(statusLabel('DR', dict, undefined, { DR: 'Draft' })).toBe('Borrador');
    });

    it('enumLabels takes precedence over dictionary.statuses for the same key', () => {
      const dict = {
        statuses: { true: { label: 'OldLabel' } },
        genericLabels: { statusProcessed: 'NewLabel' },
      };
      expect(statusLabel(true, dict, undefined, { true: 'statusProcessed' })).toBe('NewLabel');
    });

    it('falls back to normal behavior when enumLabels is undefined', () => {
      // Without enumLabels, boolean 'true' (string) resolves via MAP
      expect(statusLabel('true', {})).toBe('Processed');
      expect(statusLabel('false', {})).toBe('Not  Processed');
    });

    it('falls back to normal behavior when enumLabels is null', () => {
      expect(statusLabel('DR', {}, undefined, null)).toBe('Draft');
    });

    it('falls back to normal behavior when the key is not present in enumLabels', () => {
      // enumLabels only maps 'true'; 'CO' should use normal MAP path
      const dict = { genericLabels: { statusComplete: 'Complete' } };
      expect(statusLabel('CO', dict, undefined, { true: 'statusProcessed' })).toBe('Complete');
    });
  });
});
