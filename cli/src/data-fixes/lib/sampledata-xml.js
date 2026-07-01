/*
 * Shared reader for the Etendo GO onboarding sampledata XML
 * (`modules/com.etendoerp.go/referencedata/sampledata/GOClient/*.xml`).
 *
 * These files are the source of truth for both onboarding-gap fronts:
 *   - preventive: trimming dead data out of the dataset that onboarding imports
 *   - corrective: generating frozen `.sql` data-fixes from the same records
 *
 * The format is Openbravo sourcedata: a single <data> root holding repeated
 * <TABLE_NAME> records, each child element wrapping its value in CDATA.
 * We parse it with deliberately simple, dependency-free string scanning so the
 * tooling has no runtime deps and the corrective SQL it emits is reproducible.
 */

'use strict';

import fs from 'fs';
import path from 'path';

/** Absolute path to the GOClient sampledata directory, relative to the etendo root. */
export function goClientSampledataDir(etendoRoot) {
  return path.join(
    etendoRoot,
    'modules',
    'com.etendoerp.go',
    'referencedata',
    'sampledata',
    'GOClient'
  );
}

/**
 * Parse a sourcedata XML file into an array of records.
 * Each record is `{ __raw: '<TABLE>...</TABLE>', FIELD: value, ... }` where
 * FIELD values are the decoded CDATA contents (or '' for empty elements).
 *
 * @param {string} filePath absolute path to the XML file
 * @param {string} tag the record tag (defaults to the file name without extension)
 * @returns {{ tag: string, records: object[] }}
 */
export function parseSourcedata(filePath, tag) {
  const xml = fs.readFileSync(filePath, 'utf8');
  const recordTag = tag || path.basename(filePath, '.xml');
  const open = `<${recordTag}>`;
  const close = `</${recordTag}>`;
  const records = [];

  let cursor = 0;
  for (;;) {
    const start = xml.indexOf(open, cursor);
    if (start === -1) break;
    const end = xml.indexOf(close, start);
    if (end === -1) break;
    const raw = xml.slice(start, end + close.length);
    records.push({ __raw: raw, ...parseFields(raw) });
    cursor = end + close.length;
  }

  return { tag: recordTag, records };
}

/** Extract `<FIELD><![CDATA[value]]></FIELD>` and `<FIELD/>` pairs from one record. */
function parseFields(raw) {
  const fields = {};
  // <FIELD><![CDATA[ ... ]]></FIELD>
  const cdata = /<([A-Z0-9_]+)><!\[CDATA\[([\s\S]*?)\]\]><\/\1>/g;
  let m;
  while ((m = cdata.exec(raw)) !== null) {
    fields[m[1]] = m[2];
  }
  // <FIELD></FIELD> or <FIELD/> (empty)
  const empty = /<([A-Z0-9_]+)\s*\/>|<([A-Z0-9_]+)><\/\2>/g;
  while ((m = empty.exec(raw)) !== null) {
    const name = m[1] || m[2];
    if (!(name in fields)) fields[name] = '';
  }
  return fields;
}

/**
 * Rebuild a sourcedata XML document from a list of raw record strings,
 * preserving the original `<data>` envelope and record formatting.
 *
 * @param {string[]} rawRecords record strings (each already `<TAG>...</TAG>`)
 * @returns {string} the full XML document
 */
export function buildSourcedata(rawRecords) {
  return `<?xml version='1.0' encoding='UTF-8'?>\n<data>\n${rawRecords.join('\n\n')}\n</data>\n`;
}
