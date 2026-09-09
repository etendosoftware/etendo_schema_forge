import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ETP-5013 added `{{> document-branding}}` to template.hbs's .report-header —
// NOT a native Handlebars partial (see report-api.js's own comment on
// expandReportPartials), so it must be string-expanded before compiling or
// Handlebars throws "The partial document-branding could not be found".
// template-excel.hbs/template-csv.hbs never got the partial.
const BRANDING_PARTIAL = readFileSync(
  resolve(import.meta.dirname, '../../../templates/reports/document-branding.hbs'), 'utf8');

export function expandBrandingPartial(templateSrc) {
  return templateSrc.replace(/\{\{>\s*document-branding\s*\}\}/g, BRANDING_PARTIAL);
}
