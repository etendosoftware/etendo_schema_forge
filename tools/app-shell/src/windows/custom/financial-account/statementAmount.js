/**
 * Bank-statement amount parsing — now a thin re-export of the canonical, app-wide parser in
 * `lib/parseAmountInput.js`.
 *
 * The rule and its full rationale (why the digit count rather than the instance's configured
 * separator, what it fixes, where it diverges from Classic) live with the implementation there.
 * It was promoted out of this folder under ETP-5107's reopened round: the payment and
 * financial-movement helpers hit the identical ambiguity, and importing a window's custom module
 * from `components/` would have inverted the layering — so the parser moved up and this file kept
 * the statement-flavoured names its callers already use.
 *
 * Relative import, not the '@/' alias: keeps this module loadable by a plain `node --test` run.
 */
export {
  parseAmountInput as parseStatementAmount,
  parseAmountOrZero as parseAmount,
  isInvalidAmountInput as isInvalidStatementAmount,
} from '../../../lib/parseAmountInput.js';
