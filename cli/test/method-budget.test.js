import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { countMethods, stripCommentsAndLiterals, evaluate, resolveModuleRoot } from '../src/method-budget.js';

describe('stripCommentsAndLiterals', () => {
  it('removes line comments', () => {
    assert.equal(stripCommentsAndLiterals('int x = 1; // foo() {\n').includes('foo'), false);
  });
  it('removes block comments', () => {
    assert.equal(stripCommentsAndLiterals('/* void a() {} */ int b;').includes('void a'), false);
  });
  it('blanks out string and char literals', () => {
    assert.equal(stripCommentsAndLiterals('String s = "foo() {";').includes('foo'), false);
    assert.equal(stripCommentsAndLiterals("char c = '(';").includes('('), false);
  });
  it('does not break on escaped quotes inside strings', () => {
    const out = stripCommentsAndLiterals('String s = "a\\"b()"; int real(){}');
    assert.equal(out.includes('real'), true);
  });
});

describe('countMethods', () => {
  const cases = [
    ['constructor + public + static', 'class A { private A(){} public void foo(){} static int bar(int x){ if(x>0){return 1;} return 2;} }', 3],
    ['nested class methods counted', 'class A { void outer(){} static class B { void inner(){} int get(){return 1;} } }', 3],
    ['calls are not methods', 'class A { void f(){ doThing(); other(1); if(x){} while(y){} } }', 1],
    ['field initializer call not counted', 'class A { Foo x = new Foo(); int m(){ return bar(); } }', 1],
    ['abstract method', 'abstract class A { abstract void z(); }', 1],
    ['interface methods', 'interface I { int a(); String b(int x); }', 2],
    ['generics + throws', 'class A { public <T> List<T> q(T a) throws IOException { return null; } }', 1],
    ['method-name in comment ignored', 'class A { // ghost(){} \n int real(){return 1;} }', 1],
    ['method-name in string ignored', 'class A { String s = "fake(){"; int real(){return 1;} }', 1],
    ['empty class', 'class A {}', 0],
  ];
  for (const [label, src, expected] of cases) {
    it(label, () => assert.equal(countMethods(src), expected));
  }

  it('is monotonic: adding a method increases the count', () => {
    const before = countMethods('class A { void a(){} }');
    const after = countMethods('class A { void a(){} void b(){} }');
    assert.equal(after, before + 1);
  });
});

describe('evaluate (ratchet status)', () => {
  const fakeFile = new URL('./fixtures-method-budget-sample.java', import.meta.url).pathname;

  it('flags growth, improvement, and parity', async () => {
    const { writeFileSync, rmSync } = await import('node:fs');
    writeFileSync(fakeFile, 'class A { void a(){} void b(){} void c(){} }');
    try {
      const grew = evaluate({ classes: [{ file: fakeFile, baseline: 2, label: 'A' }] });
      assert.equal(grew[0].status, 'grew');
      assert.equal(grew[0].current, 3);

      const ok = evaluate({ classes: [{ file: fakeFile, baseline: 3, label: 'A' }] });
      assert.equal(ok[0].status, 'ok');

      const improved = evaluate({ classes: [{ file: fakeFile, baseline: 5, label: 'A' }] });
      assert.equal(improved[0].status, 'improved');
    } finally {
      rmSync(fakeFile, { force: true });
    }
  });

  it('reports missing files', () => {
    const res = evaluate({ classes: [{ file: '/no/such/file.java', baseline: 1, label: 'X' }] });
    assert.equal(res[0].status, 'missing');
    assert.equal(res[0].current, null);
  });

  it('resolves moduleFile against an explicit --module-root', async () => {
    const { writeFileSync, rmSync, mkdtempSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const root = mkdtempSync(join(tmpdir(), 'mb-'));
    const rel = 'src/Foo.java';
    const { mkdirSync } = await import('node:fs');
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, rel), 'class Foo { void a(){} void b(){} }');
    try {
      const res = evaluate(
        { classes: [{ moduleFile: rel, baseline: 2, label: 'Foo' }] },
        { moduleRoot: root },
      );
      assert.equal(res[0].status, 'ok');
      assert.equal(res[0].current, 2);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('resolveModuleRoot', () => {
  it('prefers the explicit option over env and default', () => {
    assert.equal(resolveModuleRoot({ moduleRoot: '/explicit' }), '/explicit');
  });
  it('falls back to the sibling default when nothing is set', () => {
    delete process.env.ETENDO_GO_ROOT;
    assert.ok(resolveModuleRoot().endsWith('com.etendoerp.go'));
  });
});
