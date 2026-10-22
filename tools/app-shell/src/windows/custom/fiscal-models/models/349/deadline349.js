// Modelo 349 monthly AEAT deadline (ETP-5716: moved verbatim out of fiscalModelsUtils.js, where
// it was `getMonthly349Deadline`; bound to the model through `modelRegistry.js`). The full rule
// set, with its AEAT sources, is documented above `getDeadlineDate` in fiscalModelsUtils.js.
// Plain `.js`, no imports: `modelRegistry.js` loads it and is itself loaded by `node --test`.
//
// July's 349 is consolidated with August → deadline is Sept 20, not Aug 20. Every other month →
// day 20 of the following month.
export function monthlyDeadline349(year, month) {
  if (month === 7) return new Date(year, 8, 20);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return new Date(nextYear, nextMonth - 1, 20);
}
