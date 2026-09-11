import { isProductMissingRequiredCost } from '../productCostRequirement.js';

/**
 * ETP-5245 — the pure predicate behind the Product window's cost banner and its save gate.
 *
 * Contract:
 *  - Only the `product` spec is ever affected; every other window is inert.
 *  - Only a SAVED record can block (the Cost tab needs an id to hang lines from, so blocking
 *    the first save would make a product impossible to create).
 *  - EVERY product blocks when it has no cost — see the "widened scope" block below.
 *  - A missing or null `etgoHasCost` NEVER blocks — a backend that does not emit the flag must
 *    not be able to make the window unsaveable.
 */
describe('isProductMissingRequiredCost', () => {
  /**
   * The minimal record that DOES block. Only `id` and `etgoHasCost` are read by the predicate;
   * `productType`, `stocked` and `bookUsingPurchaseOrderPrice` are deliberately absent from the
   * baseline because they no longer take part in the decision (see "widened scope").
   */
  const blocking = {
    id: 'prod-1',
    etgoHasCost: false,
  };

  it('blocks a saved product with no cost (baseline)', () => {
    expect(isProductMissingRequiredCost('product', blocking)).toBe(true);
  });

  describe('spec scoping', () => {
    for (const spec of ['sales-order', 'purchase-invoice', 'business-partner', '', 'Product']) {
      it(`is inert for the "${spec}" spec even with a blocking record`, () => {
        expect(isProductMissingRequiredCost(spec, blocking)).toBe(false);
      });
    }

    it('is inert for a null/undefined spec name', () => {
      expect(isProductMissingRequiredCost(null, blocking)).toBe(false);
      expect(isProductMissingRequiredCost(undefined, blocking)).toBe(false);
    });
  });

  describe('record presence', () => {
    it('does not block a null or undefined record', () => {
      expect(isProductMissingRequiredCost('product', null)).toBe(false);
      expect(isProductMissingRequiredCost('product', undefined)).toBe(false);
    });

    it('does not block an empty record', () => {
      expect(isProductMissingRequiredCost('product', {})).toBe(false);
    });
  });

  describe('unsaved records', () => {
    it('does not block a record with no id (creation form)', () => {
      const { id, ...withoutId } = blocking;
      expect(id).toBeTruthy();
      expect(isProductMissingRequiredCost('product', withoutId)).toBe(false);
    });

    it('does not block the sentinel id "new"', () => {
      expect(isProductMissingRequiredCost('product', { ...blocking, id: 'new' })).toBe(false);
    });

    it('does not block an empty-string id', () => {
      expect(isProductMissingRequiredCost('product', { ...blocking, id: '' })).toBe(false);
    });
  });

  /**
   * WIDENED SCOPE — the assertions below are INTENTIONALLY the opposite of what this suite
   * asserted when ETP-5245 first landed. Do not "restore" them.
   *
   * The rule originally covered only a stocked `Item` (`productType === 'I'`, `stocked` truthy)
   * that was not valued at its purchase order price — the shape the costing engine actually
   * values. A product decision widened it to EVERY product: services, expenses and resources now
   * block too, and so does a product flagged `bookUsingPurchaseOrderPrice`. The known consequence
   * (those types have no physical existence, so the costing engine never values them, yet they
   * still cannot be saved without an M_Costing line) was raised and accepted.
   *
   * The three fields are no longer read at all — the predicate's inputs are `specName`,
   * `record.id` and `record.etgoHasCost`. Each group below keeps its original field names so the
   * inversion stays visible to whoever reads this in six months.
   */
  describe('widened scope: every product type blocks (deliberate — see block comment)', () => {
    describe('product type', () => {
      for (const productType of ['S', 'E', 'R']) {
        it(`blocks product type "${productType}" (was exempt before the widening)`, () => {
          expect(isProductMissingRequiredCost('product', { ...blocking, productType })).toBe(true);
        });
      }

      it('blocks the stocked item type "I" that the rule originally targeted', () => {
        expect(isProductMissingRequiredCost('product', { ...blocking, productType: 'I' }))
          .toBe(true);
      });

      it('blocks when the product type is absent (the field is no longer consulted)', () => {
        expect(isProductMissingRequiredCost('product', blocking)).toBe(true);
        expect('productType' in blocking).toBe(false);
      });

      it('blocks a lowercase "i" (no AD code comparison is performed any more)', () => {
        expect(isProductMissingRequiredCost('product', { ...blocking, productType: 'i' }))
          .toBe(true);
      });
    });

    describe('stocked flag', () => {
      for (const stocked of [true, 'Y', 'true', 'yes', '1', 1]) {
        it(`blocks when stocked=${JSON.stringify(stocked)}`, () => {
          expect(isProductMissingRequiredCost('product', { ...blocking, stocked })).toBe(true);
        });
      }

      for (const stocked of [false, 'N', 'false', 'no', '0', 0, null, undefined, '', 'maybe']) {
        it(`still blocks when stocked=${JSON.stringify(stocked)} (was exempt before)`, () => {
          expect(isProductMissingRequiredCost('product', { ...blocking, stocked })).toBe(true);
        });
      }
    });

    describe('bookUsingPurchaseOrderPrice', () => {
      for (const flag of [true, 'Y', 'true', '1', 1]) {
        it(`still blocks when bookUsingPurchaseOrderPrice=${JSON.stringify(flag)} (was exempt before)`, () => {
          expect(isProductMissingRequiredCost(
            'product', { ...blocking, bookUsingPurchaseOrderPrice: flag })).toBe(true);
        });
      }

      for (const flag of [false, 'N', null, undefined, '']) {
        it(`blocks when bookUsingPurchaseOrderPrice=${JSON.stringify(flag)}`, () => {
          expect(isProductMissingRequiredCost(
            'product', { ...blocking, bookUsingPurchaseOrderPrice: flag })).toBe(true);
        });
      }
    });

    it('gives the same answer for every combination of the three retired fields', () => {
      const answers = new Set();
      for (const productType of ['I', 'S', 'E', 'R', undefined]) {
        for (const stocked of [true, false, undefined]) {
          for (const bookUsingPurchaseOrderPrice of [true, false, undefined]) {
            answers.add(isProductMissingRequiredCost(
              'product', { ...blocking, productType, stocked, bookUsingPurchaseOrderPrice }));
          }
        }
      }
      expect([...answers]).toEqual([true]);
    });
  });

  describe('etgoHasCost', () => {
    it('NEVER blocks when the flag is absent (a backend that does not emit it cannot lock the window)', () => {
      const { etgoHasCost, ...withoutFlag } = blocking;
      expect(etgoHasCost).toBe(false);
      expect(isProductMissingRequiredCost('product', withoutFlag)).toBe(false);
    });

    it('NEVER blocks when the flag is absent, whatever the product looks like otherwise', () => {
      const { etgoHasCost, ...withoutFlag } = blocking;
      expect(etgoHasCost).toBe(false);
      for (const productType of ['I', 'S', 'E', 'R']) {
        expect(isProductMissingRequiredCost('product', { ...withoutFlag, productType, stocked: true }))
          .toBe(false);
      }
    });

    it('NEVER blocks when the flag is explicitly null', () => {
      expect(isProductMissingRequiredCost('product', { ...blocking, etgoHasCost: null }))
        .toBe(false);
    });

    it('NEVER blocks when the flag is explicitly undefined', () => {
      expect(isProductMissingRequiredCost('product', { ...blocking, etgoHasCost: undefined }))
        .toBe(false);
    });

    for (const flag of [true, 'Y', 'true', 'yes', '1', 1]) {
      it(`does not block when etgoHasCost=${JSON.stringify(flag)}`, () => {
        expect(isProductMissingRequiredCost('product', { ...blocking, etgoHasCost: flag }))
          .toBe(false);
      });
    }

    for (const flag of [false, 'N', 'false', 'no', '0', 0]) {
      it(`blocks when etgoHasCost=${JSON.stringify(flag)}`, () => {
        expect(isProductMissingRequiredCost('product', { ...blocking, etgoHasCost: flag }))
          .toBe(true);
      });
    }

    // Present but unparseable: `parseBoolean` yields null, which is not `true`, so the record
    // blocks. Only a genuinely absent/null flag is the "backend did not tell us" escape hatch.
    for (const flag of ['maybe', '', 2, {}]) {
      it(`blocks when etgoHasCost=${JSON.stringify(flag)} (present but not parseable as true)`, () => {
        expect(isProductMissingRequiredCost('product', { ...blocking, etgoHasCost: flag }))
          .toBe(true);
      });
    }
  });

  it('leaves the record it is given untouched', () => {
    const record = { ...blocking };
    isProductMissingRequiredCost('product', record);
    expect(record).toEqual(blocking);
  });
});
