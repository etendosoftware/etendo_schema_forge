import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const contract = JSON.parse(
  readFileSync(join(__dirname, '..', 'contract.json'), 'utf8'),
);

const window = contract.frontendContract.window;
const quotation = contract.frontendContract.entities.quotation;

describe('sales-quotation contract integrity (ETP-3873 reject flow)', () => {
  describe('menuActions', () => {
    it('declares the reject action', () => {
      const reject = (window.menuActions || []).find((a) => a.key === 'reject');
      assert.ok(reject, 'menuActions must include a reject entry');
    });

    it('marks the reject action as destructive', () => {
      const reject = window.menuActions.find((a) => a.key === 'reject');
      assert.equal(reject.destructive, true);
    });

    it('limits reject visibility to UE (Under Evaluation)', () => {
      const reject = window.menuActions.find((a) => a.key === 'reject');
      assert.deepEqual(reject.visibleWhenStatus, ['UE']);
    });

    it('uses the rejectQuotation i18n key as label', () => {
      const reject = window.menuActions.find((a) => a.key === 'reject');
      assert.equal(reject.labelKey, 'rejectQuotation');
    });
  });

  describe('CJ closed-rejected status integration', () => {
    it('hides Save/Confirm in CJ via hideSaveStatuses', () => {
      assert.ok(
        Array.isArray(window.hideSaveStatuses) && window.hideSaveStatuses.includes('CJ'),
        'window.hideSaveStatuses must include CJ',
      );
    });

    it('marks CJ as completed in draftMode (locks the form)', () => {
      const completed = quotation.draftMode?.completedStatuses;
      assert.ok(Array.isArray(completed), 'draftMode.completedStatuses must be an array');
      assert.ok(completed.includes('CJ'), 'completedStatuses must include CJ');
    });

    it('keeps UE OUT of completedStatuses (Save/Confirm must remain visible during evaluation)', () => {
      const completed = quotation.draftMode.completedStatuses;
      assert.ok(
        !completed.includes('UE'),
        'completedStatuses must NOT include UE — Save/Confirm need to stay visible there',
      );
    });
  });

  describe('rejectReason field', () => {
    it('is present on the quotation entity', () => {
      const field = quotation.fields.find((f) => f.name === 'rejectReason');
      assert.ok(field, 'rejectReason field must be present in contract');
    });

    it('locks itself once the document is closed (CA, CJ, etc.)', () => {
      const field = quotation.fields.find((f) => f.name === 'rejectReason');
      assert.ok(field.readOnlyLogic, 'rejectReason must declare readOnlyLogic');
    });

    // ETP-3893 follow-up: surface the rejection reason on the form so the user
    // can see WHY a quotation was rejected.
    describe('visible on the form when rejected (ETP-3893)', () => {
      it('is readOnly in the contract (ETP-4006: prevent auto-pick)', () => {
        const field = quotation.fields.find((f) => f.name === 'rejectReason');
        assert.equal(field.visibility, 'readOnly');
      });

      it('renders on the form (form: true)', () => {
        const field = quotation.fields.find((f) => f.name === 'rejectReason');
        assert.equal(field.form, true, 'rejectReason must render on the form');
      });

      it('lives in the principal section so it sits with the other header fields', () => {
        const field = quotation.fields.find((f) => f.name === 'rejectReason');
        assert.equal(field.section, 'principal');
      });

      it('declares a displayLogic gated on documentStatus === CJ', () => {
        const field = quotation.fields.find((f) => f.name === 'rejectReason');
        assert.ok(field.displayLogic, 'rejectReason must declare displayLogic');
        assert.equal(field.displayLogic.evaluable, true,
          'displayLogic must be evaluable on the client');
        assert.match(field.displayLogic.js, /documentStatus.*['"]CJ['"]/,
          'displayLogic.js must check documentStatus === \'CJ\'');
      });

      it('readOnlyLogic translates to JS that locks on CJ and CA', () => {
        const field = quotation.fields.find((f) => f.name === 'rejectReason');
        assert.equal(field.readOnlyLogic.evaluable, true);
        assert.match(field.readOnlyLogic.js, /documentStatus.*['"]CJ['"]/);
        assert.match(field.readOnlyLogic.js, /documentStatus.*['"]CA['"]/);
      });

      it('window.labelOverrides translates the column in both locales', () => {
        const overrides = window.labelOverrides;
        assert.ok(overrides, 'labelOverrides must be present');
        assert.equal(overrides.es_ES?.C_Reject_Reason_ID, 'Razón de rechazo');
        assert.equal(overrides.en_US?.C_Reject_Reason_ID, 'Reject Reason');
      });
    });
  });
});
