#!/usr/bin/env node
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fakerES as faker } from '@faker-js/faker';

// Column headers match the FIRST alias declared for each target field in
// artifacts/contacts/decisions.json -> import.fields, so this file imports
// as-is through the "contacts" window's CSV import without any column mapping.
const HEADERS = [
  'nombre comercial',
  'nombre',
  'apellido',
  'email',
  'telefono',
  'email de contacto',
  'nombre de contacto',
  'apellido de contacto',
  'telefono de contacto',
  'cargo',
  'direccion',
  'ciudad',
  'codigo postal',
  'pais',
  'provincia',
];

// Countries/regions the "contacts-country"/"contacts-region" FK resolvers can match
// against real C_Country / C_Region records via similarity search.
const COUNTRIES = [
  { name: 'España', regions: ['Madrid', 'Barcelona', 'Valencia', 'Sevilla', 'Málaga', 'Zaragoza'] },
  { name: 'Argentina', regions: ['Buenos Aires', 'Córdoba', 'Santa Fe', 'Mendoza'] },
  { name: 'México', regions: ['Ciudad de México', 'Jalisco', 'Nuevo León'] },
  { name: 'Colombia', regions: [] },
  { name: 'Chile', regions: [] },
  { name: 'Perú', regions: [] },
  { name: 'Uruguay', regions: [] },
];

function parseArgs(argv) {
  const args = { count: 25, out: 'artifacts/contacts/sample-import.csv' };
  for (const arg of argv) {
    const [key, value] = arg.replace(/^--/, '').split('=');
    if (key === 'count') args.count = Number.parseInt(value, 10);
    if (key === 'out') args.out = value;
  }
  if (!Number.isInteger(args.count) || args.count < 1) {
    console.error('Usage: node scripts/generate-contacts-csv.js [--count=N] [--out=path/to/file.csv]');
    process.exit(1);
  }
  return args;
}

function csvEscape(value) {
  const str = String(value ?? '');
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function toCsvRow(values) {
  return values.map(csvEscape).join(',');
}

// index is folded into the email via plus-addressing so etgoEmail (the import's
// file-scoped dedupe key, per decisions.json -> import.dedupe) is always unique,
// regardless of how many rows faker's name pool happens to collide on.
function buildRow(index) {
  const companyFirstName = faker.person.firstName();
  const companyLastName = faker.person.lastName();
  const companyName = faker.company.name();
  const country = faker.helpers.arrayElement(COUNTRIES);
  const region = country.regions.length ? faker.helpers.arrayElement(country.regions) : '';
  const contactFirstName = faker.person.firstName();
  const contactLastName = faker.person.lastName();
  const companyEmail = faker.internet
    .email({ firstName: companyFirstName, lastName: companyLastName })
    .replace('@', `+c${index}@`);
  const contactEmail = faker.internet
    .email({ firstName: contactFirstName, lastName: contactLastName })
    .replace('@', `+p${index}@`);

  return [
    companyName,
    companyFirstName,
    companyLastName,
    companyEmail,
    faker.phone.number(),
    contactEmail,
    contactFirstName,
    contactLastName,
    faker.phone.number(),
    faker.person.jobTitle(),
    faker.location.streetAddress(),
    faker.location.city(),
    faker.location.zipCode(),
    country.name,
    region,
  ];
}

function main() {
  const { count, out } = parseArgs(process.argv.slice(2));
  const rows = [HEADERS, ...Array.from({ length: count }, (_, i) => buildRow(i + 1))];
  const csv = rows.map(toCsvRow).join('\n') + '\n';

  const dir = dirname(out);
  if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(out, csv, 'utf8');

  console.log(`Wrote ${count} contact rows to ${out}`);
}

main();
