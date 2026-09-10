import { describe, expect, it } from 'vitest';
import esAR from '../es_AR.json';
import esES from '../es_ES.json';

/**
 * ETP-4943 — the product form's stock-management checkbox is labeled "Almacenado"
 * ("Stored", a state), when the functionally correct term is "Almacenable"
 * ("Storable", a capability/property of the product, independent of whether it
 * currently has stock). `productStocked` backs that checkbox via useUI() in
 * ProductAdditionalInfoPanel.jsx.
 */
describe('ETP-4943 — product "Almacenable" (storable) checkbox label', () => {
  it('es_ES.genericLabels.productStocked reads "Almacenable", not "Almacenado"', () => {
    expect(esES.genericLabels.productStocked).toBe('Almacenable');
  });

  it('es_AR.genericLabels.productStocked reads "Almacenable", not "Almacenado"', () => {
    expect(esAR.genericLabels.productStocked).toBe('Almacenable');
  });
});
