// Modelo 303 monthly AEAT deadline (ETP-5716: moved verbatim out of fiscalModelsUtils.js, where
// it was `getMonthly303Deadline`; bound to the model through `modelRegistry.js`). The full rule
// set, with its AEAT sources, is documented above `getDeadlineDate` in fiscalModelsUtils.js.
// Plain `.js`, no imports: `modelRegistry.js` loads it and is itself loaded by `node --test`.
//
// Day 30 of the following month, except January which extends to the last day of February.
// `new Date(year, 2, 0)` = "day 0 of March" = the last day of February, automatically leap-year
// aware. Also the fallback rule for any unknown model (`getModelOrDefault`).
export function monthlyDeadline303(year, month) {
  if (month === 1) return new Date(year, 2, 0);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return new Date(nextYear, nextMonth - 1, 30);
}
