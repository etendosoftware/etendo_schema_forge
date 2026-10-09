// @covers tools/app-shell/src/locales/es_ES.json
import { describe, expect, it } from 'vitest';
import esES from '../es_ES.json';

/**
 * es_ES is the Spain Spanish locale: it addresses the user with "tú". Rioplatense voseo
 * ("querés", "ingresá", "intentalo") belongs in es_AR.json, which is deliberately NOT checked.
 * `generated/core.es_ES.json` is sliced from es_ES.json at build time, so guarding the source
 * covers both.
 *
 * Detection is a closed denylist of whole words, never a generic "ends in an accented vowel"
 * regex: Spain Spanish is full of legit -ás/-és/-ís/-á/-é endings (más, además, atrás, podrás,
 * inglés, interés, después, través, país, está, será, encontré). Every voseo form is derived
 * from an infinitive in VERBS, so a word is flagged only if it is exactly one of:
 *
 *   - vos present:       -ar → -ás (intentás), -er → -és (querés). The -ir present (-ís) is
 *                        NOT derived: it is identical to the vosotros form (elegís).
 *   - vos imperative:    infinitive minus "r", final vowel accented (ingresá, hacé, elegí).
 *   - imperative+clitic: infinitive minus "r" + lo/la/los/las, unaccented (intentalo,
 *                        activala, completalas). Tú writes these with a stem accent
 *                        (inténtalo), so they never collide. le/les/me/nos are NOT derived:
 *                        stem + "les" spells plural adjectives (inicia+les = iniciales).
 *
 * Verbs whose vos form equals a tú/Spain form are left out on purpose: estar (estás, está),
 * dar (das), ir (vas), ver (ves). The reflexive "te" clitic is listed explicitly
 * (REFLEXIVE_FORMS) instead of being derived, because stem + "te" spells English words
 * (activate, generate, validate) that may appear untranslated.
 * Known trade-off: an -ir imperative (elegí, añadí) is also the "yo" preterite; first-person
 * past tense does not occur in UI copy. If it ever does, narrow VERBS rather than drop the test.
 *
 * To extend: add the infinitive to VERBS (or an irregular form to EXTRA_FORMS).
 */
const VERBS = [
  // -ar
  'aceptar', 'activar', 'actualizar', 'agregar', 'ajustar', 'aplicar', 'aprobar', 'asegurar',
  'autorizar', 'borrar', 'buscar', 'cambiar', 'cancelar', 'cargar', 'cerrar', 'completar',
  'comprobar', 'conciliar', 'conectar', 'configurar', 'confirmar', 'consultar', 'contactar',
  'continuar', 'copiar', 'crear', 'dejar', 'desactivar', 'descargar', 'descartar', 'desear',
  'editar', 'ejecutar', 'eliminar', 'empezar', 'enviar', 'esperar', 'filtrar', 'finalizar',
  'formar', 'gestionar', 'guardar', 'importar', 'indicar', 'iniciar', 'ingresar', 'intentar',
  'marcar', 'mirar', 'modificar', 'necesitar', 'olvidar', 'pagar', 'pegar', 'presionar',
  'probar', 'quitar', 'reactivar', 'recargar', 'reconectar', 'recordar', 'registrar',
  'reiniciar', 'reintentar', 'revisar', 'seleccionar', 'solicitar', 'terminar', 'usar',
  'utilizar', 'validar', 'valorar', 'verificar',
  // -er
  'aprender', 'deber', 'deshacer', 'devolver', 'escoger', 'hacer', 'poder', 'poner', 'querer',
  'saber', 'tener', 'traer', 'volver',
  // -ir
  'abrir', 'añadir', 'compartir', 'corregir', 'decidir', 'definir', 'elegir', 'escribir',
  'introducir', 'pedir', 'permitir', 'seguir', 'subir',
];

const CLITICS = ['lo', 'la', 'los', 'las'];
const ACCENTED = { a: 'á', e: 'é', i: 'í' };
const PRESENT = { a: 'ás', e: 'és' };

const REFLEXIVE_FORMS = ['asegurate', 'fijate', 'registrate', 'conectate', 'acordate'];
const EXTRA_FORMS = ['vos', 'andá'];

function voseoFormsOf(infinitive) {
  const stem = infinitive.slice(0, -2);
  const vowel = infinitive.at(-2);
  const forms = [stem + ACCENTED[vowel], ...CLITICS.map((c) => stem + vowel + c)];
  if (PRESENT[vowel]) forms.push(stem + PRESENT[vowel]);
  return forms;
}

const VOSEO_WORDS = new Set([
  ...VERBS.flatMap(voseoFormsOf),
  ...REFLEXIVE_FORMS,
  ...EXTRA_FORMS,
]);

/** Whole-word, case-insensitive: returns the voseo words found in `text`. */
function findVoseo(text) {
  return text
    .normalize('NFC')
    .toLowerCase()
    .split(/[^\p{L}]+/u)
    .filter((word) => VOSEO_WORDS.has(word));
}

function collectVoseo(node, path, out) {
  if (typeof node === 'string') {
    const words = findVoseo(node);
    if (words.length) out.push(`${path} → [${words.join(', ')}] "${node}"`);
  } else if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      collectVoseo(value, path ? `${path}.${key}` : key, out);
    }
  }
  return out;
}

describe('es_ES locale — Spain Spanish register (no Rioplatense voseo)', () => {
  it('the detector flags voseo and ignores tú forms and legit accented Spain words', () => {
    const voseo = [
      '¿Seguro que querés eliminarlo?', 'No tenés permiso', 'Podés cerrar esta ventana.',
      'Ingresá un importe', 'Seleccioná una cuenta', 'Elegí una opción', 'Hacé clic aquí',
      'Revisá las cantidades', 'Completá los campos', 'Intentá de nuevo', 'Intentalo de nuevo.',
      'Activala para configurarla', 'Confirmalo o eliminalo', 'Re-autorizá el acceso',
      'Asegurate de guardar', 'Gracias a vos',
    ];
    const spain = [
      'más atrás, además', 'Podrás y deberás hacerlo después', 'inglés, francés, interés',
      'a través de', 'también en tu país', 'Lo encontré', 'Está guardado y será enviado',
      '¿Seguro que quieres eliminarlo?', 'Inténtalo de nuevo', 'Actívala', 'Introduce un importe',
      'Selecciona una cuenta', 'Elige una opción', 'Haz clic aquí', 'Revisa las cantidades',
      'activate generate validate', 'saldos iniciales',
    ];
    expect(voseo.filter((s) => findVoseo(s).length === 0), 'voseo samples missed').toEqual([]);
    expect(spain.filter((s) => findVoseo(s).length > 0), 'Spain samples flagged').toEqual([]);
  });

  it('no string value in es_ES.json uses voseo', () => {
    expect(collectVoseo(esES, '', [])).toEqual([]);
  });
});
