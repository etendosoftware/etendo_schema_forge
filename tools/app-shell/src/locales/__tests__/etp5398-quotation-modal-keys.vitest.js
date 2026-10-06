import { describe, expect, it } from 'vitest';
import enUS from '../en_US.json';
import esAR from '../es_AR.json';
import esES from '../es_ES.json';

/**
 * ETP-5398 — copy of the Sales Quotation action modals, aligned with the Figma frame
 * "PopUps". A missing or drifted entry is SILENT (the translator echoes the key or falls back
 * to English), so every key is asserted in the three locales, and the two copy corrections
 * agreed for this ticket are pinned explicitly:
 *  - the confirm title says "presupuesto", not the "pedido" Figma shows by mistake;
 *  - the first option description starts with "Ideal" (Figma drops the leading "I").
 * `locales/generated/core.*.json` is gitignored build output and is deliberately NOT asserted.
 */

const LOCALES = { en_US: enUS, es_ES: esES, es_AR: esAR };
const SPANISH_LOCALES = { es_ES: esES, es_AR: esAR };

const SPANISH = {
  lines: 'Líneas',
  sqConfirmQuotationTitle: 'Confirmar presupuesto de venta',
  sqWhatToDo: '¿Cómo quieres procesar la venta?',
  sqCreateOrderDesc: 'Ideal para productos con stock, entregas o pedidos con múltiples envíos.',
  sqInvoiceDirectlyDesc: 'Ideal para servicios o ventas que no requieren una entrega física. No se genera albarán.',
  sqSendToEvalTitle: 'Enviar a evaluación',
  sqSendToEvalDesc: 'La cotización quedará lista para crear un pedido o una factura.',
  rejectQuotationDesc: 'Selecciona el motivo del rechazo. Esta acción cambiará el estado del presupuesto a rechazado.',
};

// Generic keys the modals reuse for the summary table and the buttons.
const REUSED_KEYS = ['quotation', 'contact', 'subtotal', 'total', 'cancel', 'continue', 'close'];

const labelsOf = (dictionary) => dictionary.genericLabels ?? {};

describe('ETP-5398 — Sales Quotation action modal keys', () => {
  it.each(Object.entries(SPANISH_LOCALES))('%s declares the Figma copy', (_, dictionary) => {
    for (const [key, text] of Object.entries(SPANISH)) {
      expect(labelsOf(dictionary)[key]).toBe(text);
    }
  });

  it('en_US declares every key with a non-empty English text', () => {
    for (const key of Object.keys(SPANISH)) {
      expect(labelsOf(enUS)[key]).toEqual(expect.any(String));
      expect(labelsOf(enUS)[key]).not.toBe('');
      expect(labelsOf(enUS)[key]).not.toBe(SPANISH[key]);
    }
  });

  it.each(Object.entries(LOCALES))('%s declares the reused generic keys', (_, dictionary) => {
    for (const key of REUSED_KEYS) {
      expect(labelsOf(dictionary)[key]).toEqual(expect.any(String));
    }
  });

  it.each(Object.entries(SPANISH_LOCALES))('%s confirm title uses "presupuesto", never "pedido"', (_, dictionary) => {
    const title = labelsOf(dictionary).sqConfirmQuotationTitle;
    expect(title).toMatch(/presupuesto/i);
    expect(title).not.toMatch(/pedido/i);
  });

  it.each(Object.entries(LOCALES))('%s option descriptions start with "Ideal"', (_, dictionary) => {
    expect(labelsOf(dictionary).sqCreateOrderDesc).toMatch(/^Ideal /);
    expect(labelsOf(dictionary).sqInvoiceDirectlyDesc).toMatch(/^Ideal /);
  });
});
