/**
 * Static mock data for the Unified Calendar proof of concept.
 *
 * Nothing here comes from the backend: the PoC deliberately has zero network
 * or database access. Dates are built relative to "today" so the demo never
 * looks empty, always as `yyyy-MM-dd` date-only strings built from LOCAL
 * calendar getters (never `toISOString()`, which is UTC-based).
 *
 * Real sources this would be replaced by:
 *  - purchase invoices -> `purchase-invoice` spec, `EM_ETGO_Due_Date`
 *  - holidays          -> `C_NonBusinessDay`
 *  - vacations         -> a future HR/CRM source
 */

function isoDate(year, monthIndex, day) {
  // Local-time constructor: rolls months/years over and ignores the host TZ offset.
  const d = new Date(year, monthIndex, day);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${dd}`;
}

/** Fake purchase invoices: [monthOffset, day, documentNo, vendor, amount]. */
const INVOICE_SEEDS = [
  [0, 3, 'FC-2026-0412', 'Suministros Iberia S.L.', 1250.4],
  [0, 8, 'FC-2026-0419', 'Papelería Martínez', 186.75],
  [0, 12, 'FC-2026-0427', 'Transportes Levante S.A.', 3420],
  [0, 18, 'FC-2026-0433', 'Energía Verde Comercializadora', 912.3],
  [0, 25, 'FC-2026-0440', 'Distribuciones Norte', 5780.9],
  [0, 28, 'FC-2026-0446', 'Talleres Ruiz e Hijos', 642],
  [1, 5, 'FC-2026-0451', 'Suministros Iberia S.L.', 2210.15],
  [1, 10, 'FC-2026-0458', 'Asesoría Fiscal Gómez', 450],
  [1, 15, 'FC-2026-0463', 'Telecomunicaciones del Sur', 129.99],
  [1, 22, 'FC-2026-0470', 'Distribuciones Norte', 8125.6],
];

/** Fake vacations: [monthOffset, startDay, lengthInDays, employee]. */
const VACATION_SEEDS = [
  [0, 4, 5, 'Laura Fernández'],
  [0, 14, 3, 'Carlos Navarro'],
  [0, 20, 7, 'Marta Ortega'],
  [1, 2, 10, 'Javier Molina'],
  [1, 17, 4, 'Lucía Romero'],
];

/** Spanish national holidays with a fixed date: [monthIndex, day, name]. */
const HOLIDAY_SEEDS = [
  [0, 1, 'Año Nuevo'],
  [0, 6, 'Epifanía del Señor'],
  [4, 1, 'Fiesta del Trabajo'],
  [7, 15, 'Asunción de la Virgen'],
  [9, 12, 'Fiesta Nacional de España'],
  [10, 1, 'Todos los Santos'],
  [11, 6, 'Día de la Constitución'],
  [11, 8, 'Inmaculada Concepción'],
  [11, 25, 'Navidad'],
];

export function buildMockInvoices(today = new Date()) {
  const y = today.getFullYear();
  const m = today.getMonth();
  return INVOICE_SEEDS.map(([offset, day, documentNo, vendor, amount]) => ({
    id: `invoice-${documentNo}`,
    sourceId: 'purchase-invoices',
    date: isoDate(y, m + offset, day),
    title: documentNo,
    subtitle: vendor,
    amount,
    currency: 'EUR',
  }));
}

export function buildMockVacations(today = new Date()) {
  const y = today.getFullYear();
  const m = today.getMonth();
  return VACATION_SEEDS.map(([offset, startDay, length, employee], idx) => ({
    id: `vacation-${idx}`,
    sourceId: 'vacations',
    date: isoDate(y, m + offset, startDay),
    endDate: isoDate(y, m + offset, startDay + length - 1),
    title: employee,
  }));
}

export function buildMockHolidays(today = new Date()) {
  const y = today.getFullYear();
  return HOLIDAY_SEEDS.map(([monthIndex, day, name]) => ({
    id: `holiday-${monthIndex}-${day}`,
    sourceId: 'holidays',
    date: isoDate(y, monthIndex, day),
    title: name,
  }));
}
