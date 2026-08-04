import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve, extname } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';

/**
 * ETP-4656 — unit tests for `extractErrorMessage`'s FK-constraint-violation
 * detection (the `normalizeServerError` branch that maps DB foreign-key/
 * RESTRICT delete failures to the `deleteBlockedByReferences` i18n key,
 * in both English and Spanish Postgres wording).
 *
 * `extractErrorMessage` is exported directly from useEntity.js, so — same as
 * useEntity-helpers.test.js — it is imported and exercised for real (no
 * mirror/re-implementation). See that file's header comment for why the
 * module-customization-hooks dance below is needed (Vite `@/` alias + JSX).
 */
const SRC_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPO_ROOT_URL = pathToFileURL(resolve(SRC_DIR, '..', '..', '..') + '/').href;
const APP_SHELL_CORE_URL = pathToFileURL(
  resolve(SRC_DIR, '..', '..', '..', 'node_modules', '@etendosoftware', 'app-shell-core') + '/'
).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@/')) {
      let target = resolve(SRC_DIR, specifier.slice(2));
      if (!extname(target) && existsSync(`${target}/index.js`)) {
        target = `${target}/index.js`;
      }
      return nextResolve(pathToFileURL(target).href, context);
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    const isWorkspace = url.startsWith(REPO_ROOT_URL) && !url.includes('/node_modules/');
    const isAppShellCore = url.startsWith(APP_SHELL_CORE_URL);
    if (url.endsWith('.jsx') || ((isWorkspace || isAppShellCore) && url.endsWith('.js'))) {
      const source = readFileSync(fileURLToPath(url), 'utf8');
      // Only pay for the esbuild transform when the module actually needs it:
      // JSX syntax, or the Vite-only `import.meta.env` / `import.meta.glob`.
      // A plain ESM `.js` module is handed to node verbatim (just tagged as a
      // module, which is the other reason this hook exists). Transforming it
      // anyway would strip its comments, and the resulting line shift makes
      // V8 emit a SECOND coverage record for the same file path whose 0-hit
      // function ranges bleed onto unrelated lines of the real file — which
      // silently deflates that file's reported line coverage (gridQuery.js
      // lost 125 lines this way).
      const needsTransform = url.endsWith('.jsx') || /import\.meta\.(env|glob)/.test(source);
      if (!needsTransform) {
        return { format: 'module', shortCircuit: true, source };
      }
      const { code } = transformSync(source, {
        loader: url.endsWith('.jsx') ? 'jsx' : 'js',
        format: 'esm',
        sourcefile: url,
        define: {
          'import.meta.env': '{}',
          'import.meta.glob': '__viteGlobStub__',
        },
      });
      return { format: 'module', shortCircuit: true, source: code };
    }
    return nextLoad(url, context);
  },
});

globalThis.__viteGlobStub__ = () => ({});

if (typeof globalThis.window === 'undefined') {
  globalThis.window = {
    location: { pathname: '/', origin: 'http://localhost', href: 'http://localhost/' },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    addEventListener: () => {},
    removeEventListener: () => {},
  };
}
if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = globalThis.window.localStorage;
}
if (typeof globalThis.document === 'undefined') {
  const noopEl = {
    setAttribute: () => {},
    appendChild: () => {},
    insertBefore: () => {},
    style: {},
    classList: { add: () => {}, remove: () => {}, toggle: () => {} },
  };
  globalThis.document = {
    documentElement: { lang: 'en', style: {} },
    head: noopEl,
    body: noopEl,
    addEventListener: () => {},
    removeEventListener: () => {},
    createElement: () => ({ ...noopEl }),
    createTextNode: () => ({}),
    getElementsByTagName: () => [noopEl],
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
  };
}

const { extractErrorMessage } = await import('../useEntity.js');

// Fake NEO Headless error response — `extractErrorMessage` reads
// `data.error.message` first (see useEntity.js's `neoError` branch).
function fakeRes(message, status = 500) {
  return { status, json: async () => ({ error: { message } }) };
}

// Same param-interpolation convention used across the suite (e.g.
// useEntity.helpers.vitest.jsx) — mirrors the real useUI() hook so
// translate()'s `{field}`/`{count}` substitutions can be asserted.
function interpolatingUi(dictionary) {
  return (key, params) => {
    let text = dictionary[key] ?? key;
    if (params) {
      Object.keys(params).forEach((p) => { text = text.replace(`{${p}}`, params[p]); });
    }
    return text;
  };
}

describe('extractErrorMessage — FK-constraint-violation detection (ETP-4656)', () => {
  describe('English Postgres wording', () => {
    it('maps the full two-line RESTRICT error (message + DETAIL)', async () => {
      // Real Postgres wording always glues the primary "violates foreign key
      // constraint" line to a "Detail: ... is still referenced from table ..."
      // line — the bare first line alone is intentionally NOT enough to match
      // (see the dedicated non-match tests below): it is identical wording to
      // the insert/update-side FK error.
      const ui = interpolatingUi({ deleteBlockedByReferences: 'Cannot delete: referenced elsewhere.' });
      const msg = await extractErrorMessage(
        fakeRes(
          'update or delete on table "product" violates foreign key constraint "fk_orderline_product" on table "order_line"\n'
          + '  Detail: Key (id)=(5) is still referenced from table "order_line".'
        ),
        ui,
      );
      assert.equal(msg, 'Cannot delete: referenced elsewhere.');
    });

    it('maps a "is still referenced from table" DETAIL message', async () => {
      const ui = interpolatingUi({ deleteBlockedByReferences: 'Cannot delete: referenced elsewhere.' });
      const msg = await extractErrorMessage(
        fakeRes('Key (c_bpartner_id)=(123) is still referenced from table "c_order".'),
        ui,
      );
      assert.equal(msg, 'Cannot delete: referenced elsewhere.');
    });

    it('falls back to the hardcoded English default when ui() has no translation', async () => {
      const ui = (key) => key; // translated === key -> falls back
      const msg = await extractErrorMessage(
        fakeRes('violates foreign key constraint "fk_x" on table "y". Detail: Key (id)=(1) is still referenced from table "y".'),
        ui,
      );
      assert.equal(msg, 'This record cannot be deleted because it has associated records.');
    });

    it('falls back to the same default when no ui function is provided at all', async () => {
      const msg = await extractErrorMessage(
        fakeRes('violates foreign key constraint "fk_x" on table "y". Detail: Key (id)=(1) is still referenced from table "y".'),
        undefined,
      );
      assert.equal(msg, 'This record cannot be deleted because it has associated records.');
    });

    it('is case-insensitive', async () => {
      const ui = interpolatingUi({ deleteBlockedByReferences: 'Blocked.' });
      const msg = await extractErrorMessage(
        fakeRes('VIOLATES FOREIGN KEY CONSTRAINT "fk_x". DETAIL: KEY (ID)=(1) IS STILL REFERENCED FROM TABLE "Y".'),
        ui,
      );
      assert.equal(msg, 'Blocked.');
    });

    it('decodes HTML entities before matching (&quot; around identifiers)', async () => {
      const ui = interpolatingUi({ deleteBlockedByReferences: 'Blocked.' });
      const msg = await extractErrorMessage(
        fakeRes(
          'update or delete on table &quot;product&quot; violates foreign key constraint &quot;fk_x&quot;. '
          + 'Detail: Key (id)=(1) is still referenced from table &quot;order_line&quot;.'
        ),
        ui,
      );
      assert.equal(msg, 'Blocked.');
    });

    it('does NOT map an insert/update-side FK violation (invalid reference, not a delete) to deleteBlockedByReferences', async () => {
      // Same "violates foreign key constraint" wording as the delete-blocked
      // case above, but the DETAIL is "is not present in table" (a bad
      // reference on insert/update), not "is still referenced from table" (a
      // dependent row blocking a delete). This is the exact bug Alex's review
      // caught: this message must NOT be mislabeled as a delete failure.
      const ui = interpolatingUi({ deleteBlockedByReferences: 'SHOULD_NOT_BE_USED' });
      const raw = 'insert or update on table "order_line" violates foreign key constraint '
        + '"fk_orderline_product" on table "m_product". Detail: Key (product_id)=(999) is not present in table "m_product".';
      const msg = await extractErrorMessage(fakeRes(raw), ui);
      assert.notEqual(msg, 'SHOULD_NOT_BE_USED');
      assert.equal(msg, raw.replace(/\s+/g, ' ').trim());
    });
  });

  describe('Spanish Postgres wording', () => {
    it('maps the full two-line RESTRICT error (accented "foránea" + DETAIL)', async () => {
      const ui = interpolatingUi({ deleteBlockedByReferences: 'No se puede eliminar: referenciado.' });
      const msg = await extractErrorMessage(
        fakeRes(
          'update o delete en la tabla «productos» viola la llave foránea «productos_categoria_fkey» en la tabla «categorias». '
          + 'Detail: Aún se hace referencia a la llave (id)=(3) desde la tabla «categorias».'
        ),
        ui,
      );
      assert.equal(msg, 'No se puede eliminar: referenciado.');
    });

    it('maps the full two-line RESTRICT error (unaccented "foranea" + DETAIL)', async () => {
      const ui = interpolatingUi({ deleteBlockedByReferences: 'No se puede eliminar: referenciado.' });
      const msg = await extractErrorMessage(
        fakeRes(
          'viola la clave foranea "fk_x" en la tabla "categorias". '
          + 'Detail: se hace referencia a la clave (id)=(3) desde la tabla «categorias».'
        ),
        ui,
      );
      assert.equal(msg, 'No se puede eliminar: referenciado.');
    });

    it('does NOT map an insert/update-side FK violation (invalid reference, not a delete) to deleteBlockedByReferences', async () => {
      // ES equivalent of the EN non-match test above: same "viola la llave
      // foránea" wording, but the DETAIL says the referenced row does not
      // exist ("no está presente en la tabla"), not that it is still
      // referenced — this is an insert/update failure, not a delete failure.
      const ui = interpolatingUi({ deleteBlockedByReferences: 'SHOULD_NOT_BE_USED' });
      const raw = 'insert o update en la tabla «pedido_linea» viola la llave foránea «fk_producto» en la tabla «producto». '
        + 'Detail: La llave (product_id)=(999) no está presente en la tabla «producto».';
      const msg = await extractErrorMessage(fakeRes(raw), ui);
      assert.notEqual(msg, 'SHOULD_NOT_BE_USED');
      assert.equal(msg, raw.replace(/\s+/g, ' ').trim());
    });

    it('maps the "aún se hace referencia a la llave" DETAIL message', async () => {
      const ui = interpolatingUi({ deleteBlockedByReferences: 'No se puede eliminar: referenciado.' });
      const msg = await extractErrorMessage(
        fakeRes('Aún se hace referencia a la llave (id)=(3) desde la tabla «pedidos».'),
        ui,
      );
      assert.equal(msg, 'No se puede eliminar: referenciado.');
    });

    it('maps "se hace referencia a la clave" without the leading "aún"', async () => {
      const ui = interpolatingUi({ deleteBlockedByReferences: 'No se puede eliminar: referenciado.' });
      const msg = await extractErrorMessage(
        fakeRes('se hace referencia a la clave (id)=(3) desde la tabla «pedidos».'),
        ui,
      );
      assert.equal(msg, 'No se puede eliminar: referenciado.');
    });

    it('falls back to the hardcoded Spanish-agnostic default when unmocked', async () => {
      const msg = await extractErrorMessage(
        fakeRes('viola la llave foránea "fk_x" en la tabla "y". Detail: se hace referencia a la llave (id)=(1) desde la tabla "y".'),
        (key) => key,
      );
      assert.equal(msg, 'This record cannot be deleted because it has associated records.');
    });
  });

  describe('classic Etendo AD_Message "ForeignKeyViolation" (ETP-4656 follow-up — real path for Contacts/AD-managed entities)', () => {
    // OBDal's ErrorTextParser (org.openbravo.erpCommon.utility) recognizes the raw
    // Postgres FK constraint text via the DB catalog and replaces it with this
    // already-translated, generic AD_Message BEFORE it ever reaches the frontend —
    // so for most AD-managed entities (e.g. Contacts/BusinessPartner) this is the
    // wording actually seen, not the raw Postgres text covered above.
    it('maps the English original ("Please see Linked Items")', async () => {
      const ui = interpolatingUi({ deleteBlockedByReferences: 'Blocked.' });
      const msg = await extractErrorMessage(
        fakeRes('This record cannot be deleted because it is associated with other existing elements. Please see Linked Items'),
        ui,
      );
      assert.equal(msg, 'Blocked.');
    });

    it('maps Spanish translation variant 1 ("no puede ser eliminado ya que está relacionado...")', async () => {
      const ui = interpolatingUi({ deleteBlockedByReferences: 'Blocked.' });
      const msg = await extractErrorMessage(
        fakeRes('Este registro no puede ser eliminado ya que está relacionado con otros elementos existentes. Por favor, consulte Referencia'),
        ui,
      );
      assert.equal(msg, 'Blocked.');
    });

    it('maps Spanish translation variant 2 ("no se puede eliminar este registro porque está relacionado...")', async () => {
      const ui = interpolatingUi({ deleteBlockedByReferences: 'Blocked.' });
      const msg = await extractErrorMessage(
        fakeRes('No se puede eliminar este registro porque está relacionado con otros elementos. Por favor consulte Referencia'),
        ui,
      );
      assert.equal(msg, 'Blocked.');
    });

    it('falls back to the hardcoded default when unmocked (English)', async () => {
      const msg = await extractErrorMessage(
        fakeRes('This record cannot be deleted because it is associated with other existing elements. Please see Linked Items'),
        (key) => key,
      );
      assert.equal(msg, 'This record cannot be deleted because it has associated records.');
    });

    it('is resilient to minor wording drift around the core phrase', async () => {
      // Loosely matched (per review request) — a hypothetical re-translation that
      // keeps the distinctive "relacionado con otros elementos" core should still map.
      const ui = interpolatingUi({ deleteBlockedByReferences: 'Blocked.' });
      const msg = await extractErrorMessage(
        fakeRes('El registro no se puede eliminar porque está relacionado con otros elementos. Consulte los registros vinculados.'),
        ui,
      );
      assert.equal(msg, 'Blocked.');
    });

    // QA gap: the block above covers the two matching wordings but not the
    // false-positive side — a message that merely contains "elementos" without
    // the distinctive "relacionado/a con otros" phrase must fall through
    // untouched, same guarantee as the raw-Postgres non-match tests above.
    it('does NOT match an unrelated Spanish message that merely mentions "elementos" without the "relacionado/a con otros" phrase', async () => {
      const ui = interpolatingUi({ deleteBlockedByReferences: 'SHOULD_NOT_BE_USED' });
      const raw = 'La lista contiene elementos existentes que no son válidos.';
      const msg = await extractErrorMessage(fakeRes(raw), ui);
      assert.notEqual(msg, 'SHOULD_NOT_BE_USED');
      assert.equal(msg, raw);
    });
  });

  describe('regression — non-FK errors are unaffected', () => {
    it('still maps a not-null constraint violation to validationRequiredGeneric', async () => {
      const ui = interpolatingUi({ validationRequiredGeneric: 'A required field is missing.' });
      const msg = await extractErrorMessage(
        fakeRes('null value in column "name" violates not-null constraint'),
        ui,
      );
      assert.equal(msg, 'A required field is missing.');
    });

    it('still maps a required-column NOT NULL message to validationRequiredField with the field label', async () => {
      const ui = interpolatingUi({
        validationFieldSearchKey: 'Search Key',
        validationRequiredField: 'The field "{field}" is required.',
      });
      const msg = await extractErrorMessage(
        fakeRes('null value in column "value" of relation "c_bpartner" violates not-null constraint'),
        ui,
      );
      assert.equal(msg, 'The field "Search Key" is required.');
    });

    it('still maps a duplicate-key violation to validationDuplicateRecord', async () => {
      const ui = interpolatingUi({ validationDuplicateRecord: 'A record with the same value already exists.' });
      const msg = await extractErrorMessage(
        fakeRes('duplicate key value violates unique constraint "c_bpartner_value_key"'),
        ui,
      );
      assert.equal(msg, 'A record with the same value already exists.');
    });

    it('passes through an unrecognized raw message untouched', async () => {
      const ui = (key) => key;
      const msg = await extractErrorMessage(fakeRes('Some completely unrelated backend error.'), ui);
      assert.equal(msg, 'Some completely unrelated backend error.');
    });

    it('does NOT trigger the FK branch on the word "constraint" alone (duplicate-key case)', async () => {
      const ui = interpolatingUi({
        deleteBlockedByReferences: 'SHOULD_NOT_BE_USED',
        validationDuplicateRecord: 'Duplicate.',
      });
      const msg = await extractErrorMessage(
        fakeRes('duplicate key value violates unique constraint "some_constraint"'),
        ui,
      );
      assert.equal(msg, 'Duplicate.');
    });
  });
});
