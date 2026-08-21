import { getStatusTone, getStatusBadgeProps, getStatusDotColor, getStatusPillClass, getStatusGridPillClass, statusLabel } from '../statusBadge';

describe('statusBadge', () => {
  describe('getStatusTone', () => {
    it.each([
      ['co', 'success'], ['CO', 'success'], ['completed', 'success'], ['y', 'success'], ['true', 'success'], ['pa', 'success'],
      ['ip', 'warning'], ['rpap', 'neutral'], ['in process', 'warning'],
      ['vo', 'destructive'], ['cj', 'destructive'], ['voided', 'destructive'], ['rejected', 'destructive'],
      ['dr', 'neutral'], ['unknown', 'neutral'], [null, 'neutral'], [undefined, 'neutral'],
    ])('maps %s → %s', (status, expected) => {
      expect(getStatusTone(status)).toBe(expected);
    });
  });

  describe('semantic status presentation', () => {
    it.each([
      ['CO', 'default', 'status-success'], ['CA', 'default', 'status-success'],
      ['CL', 'default', 'status-info'], ['PA', 'default', 'status-info'],
      ['IP', 'outline', 'status-warning'], ['UE', 'outline', 'status-warning'],
      ['RPAE', 'outline', 'status-warning'], ['RPAP', 'outline', 'muted'],
    ])('maps %s to semantic badge roles', (status, variant, role) => {
      const props = getStatusBadgeProps(status);
      expect(props.variant).toBe(variant);
      expect(props.className).toContain(role);
    });

    it('keeps draft neutral and voided destructive', () => {
      expect(getStatusBadgeProps('DR').variant).toBe('secondary');
      expect(getStatusBadgeProps('VO').variant).toBe('destructive');
    });

    it.each([
      ['CO', 'bg-status-success-foreground'], ['CL', 'bg-status-info-foreground'],
      ['IP', 'bg-status-warning-foreground'], ['VO', 'bg-destructive'],
      ['DR', 'bg-status-neutral-foreground'], ['?', 'bg-status-neutral-foreground'],
    ])('maps %s to semantic dot role %s', (status, expected) => {
      expect(getStatusDotColor(status)).toBe(expected);
    });

    it.each([
      ['CO', 'bg-status-success'], ['CL', 'bg-status-info'], ['IP', 'bg-status-warning'],
      ['VO', 'bg-destructive'], ['DR', 'bg-muted'], ['?', 'bg-muted'],
    ])('maps %s to semantic pill role %s', (status, expected) => {
      expect(getStatusPillClass(status)).toContain(expected);
    });

    it.each([
      ['CO', 'bg-status-success'], ['CL', 'bg-status-info'], ['IP', 'bg-status-warning'],
      ['VO', 'bg-destructive'], ['DR', 'border-border-control'], ['?', 'border-border-control'],
    ])('maps %s to semantic grid-pill role %s', (status, expected) => {
      expect(getStatusGridPillClass(status)).toContain(expected);
    });
  });

  describe('getStatusTone (extended)', () => {
    it.each([
      ['ca', 'success'], ['etgo_ci', 'success'], ['rppc', 'success'],
      ['pwnc', 'success'], ['rdnc', 'success'], ['confirmed', 'success'], ['booked', 'success'],
      ['paid', 'success'], ['processed', 'success'], ['yes', 'success'],
      ['rpae', 'success'], ['rpr', 'success'], ['ue', 'warning'], ['under evaluation', 'warning'],
      ['rpvoid', 'destructive'], ['rpvd', 'destructive'], ['cancelled', 'destructive'], ['void', 'destructive'],
    ])('maps %s to %s', (status, expected) => {
      expect(getStatusTone(status)).toBe(expected);
    });

    it('classifies ETGOERR as destructive and gives it a name, not the raw code', () => {
      // This module's own status for a bank transfer the bank refused after committing to it.
      // Core's dictionary has no entry for it, so without the MAP fallback every surface that does
      // not declare enumLabels printed the literal "ETGOERR" in neutral grey (ETP-4895).
      expect(getStatusTone('ETGOERR')).toBe('destructive');
      expect(getStatusGridPillClass('etgoerr')).toContain('bg-destructive');
      expect(getStatusPillClass('etgoerr')).toContain('text-destructive');
      expect(getStatusDotColor('etgoerr')).toBe('bg-destructive');
      expect(getStatusBadgeProps('etgoerr').variant).toBe('destructive');
      expect(statusLabel('ETGOERR', { genericLabels: { cpPaymentStateError: 'Pago con error' } }))
        .toBe('Pago con error');
    });

    it('classifies PPM (Payment Made) as warning, not success — confirmed but not withdrawn', () => {
      // PPM means the payment is confirmed but has NOT been withdrawn from its financial account,
      // so no bank transaction exists yet; Core moves it on to PWNC once the withdrawal is
      // recorded. For a Salt Edge transfer that is the wait between the bank authorizing and the
      // money moving, which every surface now labels "Pago en progreso" — a green tone here would
      // contradict that text (ETP-4895). See STATUS_PAYMENT_MADE in paymentStatuses.js.
      expect(getStatusTone('PPM')).toBe('warning');
      expect(getStatusTone('ppm')).toBe('warning');
      expect(getStatusPillClass('ppm')).toContain('bg-status-warning');
      expect(getStatusGridPillClass('ppm')).toContain('bg-status-warning');
      expect(getStatusDotColor('ppm')).toBe('bg-status-warning-foreground');
      expect(getStatusBadgeProps('ppm').className).toContain('status-warning');
    });

    it('classifies RPAE (Awaiting Execution) as success/deposited, matching PAID_STATUSES elsewhere (case-insensitive)', () => {
      // Regression guard: RPAE is treated as "deposited" (Cobro/Pago depositado)
      // by DEPOSITED_STATUSES in PaymentHeaderTableBase/PaymentConciliadoBadge
      // and by PAID_STATUSES in PaymentsCard/InvoicePaymentHistoryModal — the
      // tone here must agree, or the grid badge contradicts the "depositado" text.
      expect(getStatusTone('RPAE')).toBe('success');
      expect(getStatusTone('rpae')).toBe('success');
    });
  });

  describe('extended semantic status coverage', () => {
    it.each(['true', 'processed', 'ca', 'etgo_ci', 'rppc', 'pwnc', 'rdnc'])('maps %s to success roles', (status) => {
      expect(getStatusBadgeProps(status).className).toContain('status-success');
      expect(getStatusDotColor(status)).toBe('bg-status-success-foreground');
      expect(getStatusPillClass(status)).toContain('bg-status-success');
      expect(getStatusGridPillClass(status)).toContain('bg-status-success');
    });

    it.each(['false', 'not processed'])('keeps %s neutral', (status) => {
      expect(getStatusBadgeProps(status).variant).toBe('secondary');
      expect(getStatusDotColor(status)).toBe('bg-status-neutral-foreground');
    });

    it.each(['rpvoid', 'cj', 'rejected', 'cancelled'])('maps %s to destructive roles', (status) => {
      expect(getStatusBadgeProps(status).variant).toBe('destructive');
      expect(getStatusDotColor(status)).toBe('bg-destructive');
      expect(getStatusPillClass(status)).toContain('bg-destructive');
      expect(getStatusGridPillClass(status)).toContain('bg-destructive');
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
