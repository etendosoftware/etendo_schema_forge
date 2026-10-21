// Modelo 390 AEAT deadline (ETP-5716), bound to the model through `modelRegistry.js`.
// Plain `.js`, no imports: `modelRegistry.js` loads it and is itself loaded by `node --test`.
//
// The annual VAT summary of exercise N is filed from January 1 to January 30 of N+1 (AEAT,
// "Instrucciones del modelo 390", plazo de presentación). Built with the local-time constructor,
// like every other deadline of the window, so the calendar day never shifts with the timezone.
export function annualDeadline390(year) {
  return new Date(Number(year) + 1, 0, 30);
}
