import { buildJsreportHelpersString } from '../../../templates/reports/helpers/report-html-helpers.js';

// The Excel render path gets its helpers the way production does (report-api.js): the jsreport
// helper string built from the canonical set plus the report's own helpers.js, evaluated.
export function registerJsreportHelpers(hb, code) {
  const built = buildJsreportHelpersString(code);
  const names = [...built.matchAll(/^function\s+(\w+)\s*\(/gm)].map((m) => m[1]);
  // eslint-disable-next-line no-new-func
  const helpers = new Function(`${built}\nreturn { ${names.join(', ')} };`)();
  for (const [name, fn] of Object.entries(helpers)) hb.registerHelper(name, fn);
}
