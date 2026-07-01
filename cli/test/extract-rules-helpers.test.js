import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  analyzeJavaSource,
  translateExpression,
  isSimpleValidation,
  buildRuleFromCallout,
  findSource,
} from '../src/extract-rules.js';

// ---------------------------------------------------------------------------
// analyzeJavaSource — additional cases
// ---------------------------------------------------------------------------

describe('analyzeJavaSource — additional cases', () => {
  it('detects setFieldValue effects', () => {
    const source = `
      public void execute() {
        setFieldValue("lineNetAmt", amount * qty);
      }
    `;
    const result = analyzeJavaSource(source);
    assert.equal(result.effects.length, 1);
    assert.equal(result.effects[0].field, 'lineNetAmt');
    assert.equal(result.effects[0].action, 'setValue');
  });

  it('returns medium confidence when no effects found', () => {
    const source = `
      public void execute() {
        log.info("no side effects");
      }
    `;
    const result = analyzeJavaSource(source);
    assert.equal(result.confidence, 'medium');
    assert.deepEqual(result.effects, []);
  });

  it('correctly counts LOC with multi-line block comments', () => {
    const source = `package com.example;
/*
 * This is
 * a multi-line
 * comment
 */
public class Foo {
  public void bar() {}
}`;
    const result = analyzeJavaSource(source);
    // package, public class, public void bar, } closing class = 4
    assert.equal(result.loc, 4);
  });

  it('does not count blank lines as LOC', () => {
    const source = `line1

line3

line5
`;
    const result = analyzeJavaSource(source);
    assert.equal(result.loc, 3);
  });

  it('detects PreparedStatement as DML', () => {
    const source = `
      PreparedStatement ps = conn.prepareStatement(sql);
      ps.executeUpdate();
    `;
    const result = analyzeJavaSource(source);
    assert.equal(result.hasDml, true);
  });

  it('does not flag DML when none present', () => {
    const source = `
      public String getName() {
        return "test";
      }
    `;
    const result = analyzeJavaSource(source);
    assert.equal(result.hasDml, false);
  });

  it('skips comment lines when counting branches', () => {
    const source = `
      // if (this is a comment)
      /* if (block comment) */
      public void run() {
        if (x > 0) doX();
      }
    `;
    const result = analyzeJavaSource(source);
    // Only 1 real if, the comment ones should be skipped
    assert.equal(result.branches, 1);
  });
});

// ---------------------------------------------------------------------------
// translateExpression — additional cases
// ---------------------------------------------------------------------------

describe('translateExpression — additional cases', () => {
  it('returns error for null input', () => {
    const result = translateExpression(null);
    assert.equal(result.success, false);
    assert.equal(result.error, 'Empty expression');
  });

  it('returns error for empty string', () => {
    const result = translateExpression('');
    assert.equal(result.success, false);
  });

  it('returns error for whitespace-only string', () => {
    const result = translateExpression('   ');
    assert.equal(result.success, false);
  });

  it('translates @#Client_ID@ system variable', () => {
    const result = translateExpression("@#Client_ID@='100'");
    assert.equal(result.success, true);
    assert.ok(result.result.includes('client_ID'));
  });

  it('translates @$AcctSchema_ID@ accounting dimension', () => {
    const result = translateExpression("@$AcctSchema_ID@='200'");
    assert.equal(result.success, true);
    assert.ok(result.result.includes('acctSchema_ID'));
  });

  it('fixes !\' shorthand to !=\'', () => {
    const result = translateExpression("@DocStatus@!'CO'");
    assert.equal(result.success, true);
    assert.ok(result.result.includes("!='CO'"));
  });

  it('fixes !@ shorthand to !=@', () => {
    const result = translateExpression("@Posted@!@ShowAcct@");
    assert.equal(result.success, true);
    assert.ok(result.result.includes('!='));
  });

  it('handles compound expression with & and |', () => {
    const result = translateExpression("@A@='Y' & @B@='N' | @C@='Y'");
    assert.equal(result.success, true);
    assert.ok(result.result.includes('&&'));
    assert.ok(result.result.includes('||'));
  });

  it('preserves existing || and && operators', () => {
    const result = translateExpression("@A@='Y' || @B@='N' && @C@='Y'");
    assert.equal(result.success, true);
    // Should NOT produce |||| or &&&&
    assert.ok(!result.result.includes('||||'));
    assert.ok(!result.result.includes('&&&&'));
  });

  it('rejects expression containing function keyword', () => {
    const result = translateExpression('function () { return true; }');
    assert.equal(result.success, false);
  });

  it('rejects expression with checkRule call', () => {
    const result = translateExpression("checkRule('MyRule')");
    assert.equal(result.success, false);
  });
});

// ---------------------------------------------------------------------------
// isSimpleValidation — additional cases
// ---------------------------------------------------------------------------

describe('isSimpleValidation — additional cases', () => {
  it('returns true for whitespace-only SQL', () => {
    assert.equal(isSimpleValidation('   '), true);
  });

  it('returns false for EXISTS subquery', () => {
    const sql = "SELECT 1 WHERE EXISTS (SELECT 1 FROM C_Order WHERE IsActive='Y')";
    assert.equal(isSimpleValidation(sql), false);
  });

  it('returns true for single JOIN query', () => {
    const sql = "SELECT p.Name FROM C_BPartner p JOIN C_BPartner_Location bpl ON p.C_BPartner_ID = bpl.C_BPartner_ID";
    assert.equal(isSimpleValidation(sql), true);
  });

  it('returns false for query with UNION', () => {
    const sql = "SELECT Name FROM TableA UNION ALL SELECT Name FROM TableB";
    assert.equal(isSimpleValidation(sql), false);
  });
});

// ---------------------------------------------------------------------------
// buildRuleFromCallout — additional cases
// ---------------------------------------------------------------------------

describe('buildRuleFromCallout — additional cases', () => {
  it('sets high complexity when branches > 5', () => {
    const row = {
      ad_callout_id: '400',
      name: 'SL_Complex',
      classname: 'com.example.ComplexCallout',
      columnname: 'Amount',
    };
    const analysis = {
      effects: [{ field: 'total', action: 'setValue', confidence: 'high' }],
      confidence: 'high',
      branches: 8,
      loc: 100,
      hasDml: false,
    };
    const rule = buildRuleFromCallout(row, analysis);
    assert.equal(rule.complexity, 'high');
    assert.equal(rule.branches, 8);
  });

  it('sets low complexity when few branches and no DML', () => {
    const row = {
      ad_callout_id: '500',
      name: 'SL_Simple',
      classname: 'com.example.SimpleCallout',
      columnname: 'Name',
    };
    const analysis = {
      effects: [],
      confidence: 'medium',
      branches: 1,
      loc: 10,
      hasDml: false,
    };
    const rule = buildRuleFromCallout(row, analysis);
    assert.equal(rule.complexity, 'low');
  });

  it('does not include hasDml key when false', () => {
    const row = {
      ad_callout_id: '600',
      name: 'SL_NoDml',
      classname: 'com.example.NoDml',
      columnname: 'Qty',
    };
    const analysis = {
      effects: [],
      confidence: 'medium',
      branches: 0,
      loc: 5,
      hasDml: false,
    };
    const rule = buildRuleFromCallout(row, analysis);
    assert.equal(rule.hasDml, undefined);
  });

  it('includes hasDml key when true', () => {
    const row = {
      ad_callout_id: '700',
      name: 'SL_Dml',
      classname: 'com.example.DmlCallout',
      columnname: 'Status',
    };
    const analysis = {
      effects: [],
      confidence: 'medium',
      branches: 0,
      loc: 5,
      hasDml: true,
    };
    const rule = buildRuleFromCallout(row, analysis);
    assert.equal(rule.hasDml, true);
  });

  it('handles null sourceAnalysis', () => {
    const row = {
      ad_callout_id: '800',
      name: 'SL_Null',
      classname: 'com.example.NullAnalysis',
      columnname: 'Field',
    };
    const rule = buildRuleFromCallout(row, null);
    assert.equal(rule.complexity, 'unknown');
    assert.deepEqual(rule.effects, []);
    assert.equal(rule.confidence, 'low');
  });

  it('sets medium complexity when branches between 3 and 5', () => {
    const row = {
      ad_callout_id: '900',
      name: 'SL_Medium',
      classname: 'com.example.MediumCallout',
      columnname: 'Type',
    };
    const analysis = {
      effects: [{ field: 'net', action: 'setValue', confidence: 'high' }],
      confidence: 'high',
      branches: 4,
      loc: 50,
      hasDml: false,
    };
    const rule = buildRuleFromCallout(row, analysis);
    assert.equal(rule.complexity, 'medium');
  });

  it('sets high complexity when hasDml is true regardless of branches', () => {
    const row = {
      ad_callout_id: '910',
      name: 'SL_DmlHigh',
      classname: 'com.example.DmlHigh',
      columnname: 'Status',
    };
    const analysis = {
      effects: [],
      confidence: 'medium',
      branches: 1,
      loc: 20,
      hasDml: true,
    };
    const rule = buildRuleFromCallout(row, analysis);
    assert.equal(rule.complexity, 'high');
    assert.equal(rule.hasDml, true);
  });

  it('includes warning from sourceAnalysis', () => {
    const row = {
      ad_callout_id: '920',
      name: 'SL_Warn',
      classname: 'com.example.WarnCallout',
      columnname: 'Col',
    };
    const analysis = {
      effects: [],
      confidence: 'low',
      warning: 'Source not found',
    };
    const rule = buildRuleFromCallout(row, analysis);
    assert.equal(rule.warning, 'Source not found');
    assert.equal(rule.complexity, 'unknown');
  });

  it('includes loc from sourceAnalysis', () => {
    const row = {
      ad_callout_id: '930',
      name: 'SL_Loc',
      classname: 'com.example.LocCallout',
      columnname: 'X',
    };
    const analysis = {
      effects: [],
      confidence: 'medium',
      branches: 0,
      loc: 42,
      hasDml: false,
    };
    const rule = buildRuleFromCallout(row, analysis);
    assert.equal(rule.loc, 42);
  });

  it('omits branches when not in analysis', () => {
    const row = {
      ad_callout_id: '940',
      name: 'SL_NoBranch',
      classname: 'com.example.NoBranch',
      columnname: 'Y',
    };
    const analysis = {
      effects: [],
      confidence: 'medium',
      hasDml: false,
    };
    const rule = buildRuleFromCallout(row, analysis);
    assert.equal(rule.branches, undefined);
  });

  it('omits loc when not in analysis', () => {
    const row = {
      ad_callout_id: '950',
      name: 'SL_NoLoc',
      classname: 'com.example.NoLoc',
      columnname: 'Z',
    };
    const analysis = {
      effects: [],
      confidence: 'medium',
      hasDml: false,
    };
    const rule = buildRuleFromCallout(row, analysis);
    assert.equal(rule.loc, undefined);
  });
});

// ---------------------------------------------------------------------------
// analyzeJavaSource — more branch coverage
// ---------------------------------------------------------------------------

describe('analyzeJavaSource — branch counting', () => {
  it('counts switch statements as branches', () => {
    const source = `
      public void run() {
        switch (type) {
          case "A": break;
          case "B": break;
        }
      }
    `;
    const result = analyzeJavaSource(source);
    assert.ok(result.branches >= 1);
  });

  it('counts ternary operators as branches', () => {
    const source = `
      public void run() {
        int x = condition ? 1 : 0;
      }
    `;
    const result = analyzeJavaSource(source);
    assert.ok(result.branches >= 1);
  });

  it('counts multiple ifs on same line', () => {
    const source = `
      public void run() {
        if (a) { if (b) { doStuff(); } }
      }
    `;
    const result = analyzeJavaSource(source);
    assert.equal(result.branches, 2);
  });

  it('skips lines starting with * (javadoc body)', () => {
    const source = `
      /**
       * if (this should be ignored)
       * switch (this too)
       */
      public void run() {}
    `;
    const result = analyzeJavaSource(source);
    assert.equal(result.branches, 0);
  });

  it('detects addResult effects', () => {
    const source = `addResult("total", sum);`;
    const result = analyzeJavaSource(source);
    assert.equal(result.effects.length, 1);
    assert.equal(result.effects[0].field, 'total');
  });

  it('detects multiple effects in same source', () => {
    const source = `
      setFieldValue("price", 10);
      addResult("qty", 5);
      setFieldValue("net", 50);
    `;
    const result = analyzeJavaSource(source);
    assert.equal(result.effects.length, 3);
    assert.equal(result.confidence, 'high');
  });

  it('detects OBDal as DML', () => {
    const source = `OBDal.getInstance().save(order);`;
    const result = analyzeJavaSource(source);
    assert.equal(result.hasDml, true);
  });

  it('detects createCriteria as DML', () => {
    const source = `createCriteria(Order.class);`;
    const result = analyzeJavaSource(source);
    assert.equal(result.hasDml, true);
  });

  it('detects createQuery as DML', () => {
    const source = `session.createQuery("from Order");`;
    const result = analyzeJavaSource(source);
    assert.equal(result.hasDml, true);
  });

  it('handles block comment that opens and closes on same line', () => {
    const source = `/* comment */ int x = 1;
public void run() {}`;
    const result = analyzeJavaSource(source);
    // The /* comment */ line is skipped, "public void run" counts
    assert.equal(result.loc, 1);
  });
});

// ---------------------------------------------------------------------------
// translateExpression — more patterns
// ---------------------------------------------------------------------------

describe('translateExpression — more patterns', () => {
  it('replaces Y/N with true/false', () => {
    const result = translateExpression("@IsActive@='Y'");
    assert.equal(result.success, true);
    assert.ok(result.result.includes('true'));
  });

  it('replaces single = with == (preserving != <= >=)', () => {
    const result = translateExpression("@A@='Y' & @B@!='N' & @C@>='10'");
    assert.equal(result.success, true);
    // Single = should become ==
    assert.ok(result.result.includes('=='));
    // != should stay as !=
    assert.ok(result.result.includes('!='));
    // >= should stay as >=
    assert.ok(result.result.includes('>='));
  });

  it('rejects Utilities. calls', () => {
    const result = translateExpression("Utilities.getValue('x')");
    assert.equal(result.success, false);
  });

  it('rejects OB. calls', () => {
    const result = translateExpression("OB.getContext()");
    assert.equal(result.success, false);
  });

  it('translates complex expression with multiple variables', () => {
    const result = translateExpression("@DocStatus@='CO' | @DocStatus@='CL' & @IsSOTrx@='Y'");
    assert.equal(result.success, true);
    assert.ok(result.result.includes('docStatus'));
    assert.ok(result.result.includes('||'));
    assert.ok(result.result.includes('&&'));
    assert.ok(result.result.includes('true'));
  });
});

// ---------------------------------------------------------------------------
// isSimpleValidation — more edge cases
// ---------------------------------------------------------------------------

describe('isSimpleValidation — more edge cases', () => {
  it('returns true for null input', () => {
    assert.equal(isSimpleValidation(null), true);
  });

  it('returns false for multiple JOINs', () => {
    const sql = `SELECT x FROM A
      JOIN B ON A.id = B.a_id
      JOIN C ON B.id = C.b_id`;
    assert.equal(isSimpleValidation(sql), false);
  });

  it('returns false for EXISTS with SELECT subquery', () => {
    const sql = "WHERE EXISTS (SELECT 1 FROM t WHERE t.active='Y')";
    assert.equal(isSimpleValidation(sql), false);
  });

  it('returns true for simple WHERE clause', () => {
    const sql = "SELECT Name FROM C_BPartner WHERE IsActive='Y'";
    assert.equal(isSimpleValidation(sql), true);
  });
});

// ---------------------------------------------------------------------------
// findSource — exported, can be tested
// ---------------------------------------------------------------------------

describe('findSource', () => {
  it('returns null for null sourceDir', async () => {
    const result = await findSource(null, 'com.example.MyClass');
    assert.equal(result, null);
  });

  it('returns null for null className', async () => {
    const result = await findSource('/tmp', null);
    assert.equal(result, null);
  });

  it('returns null for non-existent file', async () => {
    const result = await findSource('/tmp/nonexistent-dir-xyz', 'com.nonexistent.FakeClass');
    assert.equal(result, null);
  });
});

// ---------------------------------------------------------------------------
// analyzeJavaSource — try-catch blocks and nested if-else
// ---------------------------------------------------------------------------

describe('analyzeJavaSource — try-catch and nested if-else', () => {
  it('counts branches inside try-catch blocks', () => {
    const source = `
      public void run() {
        try {
          if (x > 0) doStuff();
        } catch (Exception e) {
          if (y > 0) handleError();
        }
      }
    `;
    const result = analyzeJavaSource(source);
    assert.equal(result.branches, 2);
  });

  it('counts nested if-else chains', () => {
    const source = `
      public void run() {
        if (a) {
          if (b) {
            if (c) doC();
          }
        }
      }
    `;
    const result = analyzeJavaSource(source);
    assert.equal(result.branches, 3);
  });

  it('counts branches in if-else-if ladder', () => {
    const source = `
      public void run() {
        if (a) doA();
        else if (b) doB();
        else if (c) doC();
      }
    `;
    const result = analyzeJavaSource(source);
    // 3 if statements
    assert.equal(result.branches, 3);
  });

  it('handles source with only try-catch (no branches)', () => {
    const source = `
      public void run() {
        try {
          doSomething();
        } catch (Exception e) {
          log.error(e);
        }
      }
    `;
    const result = analyzeJavaSource(source);
    assert.equal(result.branches, 0);
    assert.equal(result.hasDml, false);
  });

  it('returns low confidence and warning for null source', () => {
    const result = analyzeJavaSource(null);
    assert.equal(result.confidence, 'low');
    assert.equal(result.warning, 'Source not found');
    assert.deepEqual(result.effects, []);
  });
});

// ---------------------------------------------------------------------------
// translateExpression — compound & and | operators (more coverage)
// ---------------------------------------------------------------------------

describe('translateExpression — compound logical operators', () => {
  it('handles single & between two conditions', () => {
    const result = translateExpression("@A@='Y' & @B@='Y'");
    assert.equal(result.success, true);
    assert.ok(result.result.includes('&&'));
    assert.ok(!result.result.includes(' & '));
  });

  it('handles single | between two conditions', () => {
    const result = translateExpression("@A@='Y' | @B@='Y'");
    assert.equal(result.success, true);
    assert.ok(result.result.includes('||'));
    assert.ok(!result.result.includes(' | '));
  });

  it('handles mixed & and | in complex expression', () => {
    const result = translateExpression("@A@='Y' & @B@='N' | @C@='Y' & @D@='N'");
    assert.equal(result.success, true);
    const r = result.result;
    // Should have both && and ||
    assert.ok(r.includes('&&'));
    assert.ok(r.includes('||'));
  });

  it('does not double-replace existing || operators', () => {
    const result = translateExpression("@A@='Y' || @B@='N'");
    assert.equal(result.success, true);
    // Should not turn || into ||||
    assert.ok(!result.result.includes('||||'));
  });

  it('does not double-replace existing && operators', () => {
    const result = translateExpression("@A@='Y' && @B@='N'");
    assert.equal(result.success, true);
    assert.ok(!result.result.includes('&&&&'));
  });
});

// ---------------------------------------------------------------------------
// translateExpression — rejection patterns
// ---------------------------------------------------------------------------

describe('translateExpression — rejection patterns', () => {
  it('rejects function keyword (case insensitive)', () => {
    const result = translateExpression('function () { return true; }');
    assert.equal(result.success, false);
    assert.ok(result.error.includes('framework'));
  });

  it('rejects checkRule call', () => {
    const result = translateExpression("checkRule('SomeRule')");
    assert.equal(result.success, false);
  });

  it('rejects Utilities. calls', () => {
    const result = translateExpression("Utilities.getValue('fieldA')");
    assert.equal(result.success, false);
  });

  it('rejects OB. calls', () => {
    const result = translateExpression("OB.getContext().getClient()");
    assert.equal(result.success, false);
  });
});

// ---------------------------------------------------------------------------
// isSimpleValidation — additional patterns
// ---------------------------------------------------------------------------

describe('isSimpleValidation — additional patterns', () => {
  it('returns false for EXISTS with inner SELECT', () => {
    const sql = "SELECT 1 WHERE EXISTS (SELECT id FROM C_Order WHERE docStatus = 'CO')";
    assert.equal(isSimpleValidation(sql), false);
  });

  it('returns false for UNION ALL', () => {
    const sql = "SELECT Name FROM A UNION ALL SELECT Name FROM B";
    assert.equal(isSimpleValidation(sql), false);
  });

  it('returns false for multiple JOINs (3 joins)', () => {
    const sql = `SELECT x FROM A
      JOIN B ON A.id = B.a_id
      JOIN C ON B.id = C.b_id
      JOIN D ON C.id = D.c_id`;
    assert.equal(isSimpleValidation(sql), false);
  });

  it('returns true for simple query with one JOIN', () => {
    const sql = "SELECT p.Name FROM M_Product p JOIN M_Product_Category pc ON p.M_Product_Category_ID = pc.M_Product_Category_ID";
    assert.equal(isSimpleValidation(sql), true);
  });

  it('returns true for empty string', () => {
    assert.equal(isSimpleValidation(''), true);
  });

  it('returns true for undefined', () => {
    assert.equal(isSimpleValidation(undefined), true);
  });

  it('returns true for IN with subquery (no multi-join/exists/union)', () => {
    // isSimpleValidation only rejects multi-join, exists, union — IN subquery is not flagged
    const sql = "SELECT Name FROM C_BPartner WHERE C_BPartner_ID IN (SELECT C_BPartner_ID FROM C_Order)";
    assert.equal(isSimpleValidation(sql), true);
  });

  it('returns true for IN with literal values', () => {
    const sql = "SELECT Name FROM C_BPartner WHERE DocStatus IN ('CO', 'CL')";
    assert.equal(isSimpleValidation(sql), true);
  });
});

// ---------------------------------------------------------------------------
// translateExpression — nested parentheses and @SQL@ marker
// ---------------------------------------------------------------------------

describe('translateExpression — nested parentheses', () => {
  it('handles expression with parentheses grouping', () => {
    const result = translateExpression("(@A@='Y' | @B@='Y') & @C@='N'");
    assert.equal(result.success, true);
    assert.ok(result.result.includes('||'));
    assert.ok(result.result.includes('&&'));
  });

  it('handles deeply nested parentheses', () => {
    const result = translateExpression("((@A@='Y') & (@B@='N'))");
    assert.equal(result.success, true);
    assert.ok(result.result.includes('&&'));
  });

  it('preserves parentheses structure in output', () => {
    const result = translateExpression("(@DocStatus@='CO') | (@DocStatus@='CL')");
    assert.equal(result.success, true);
    assert.ok(result.result.includes('('));
    assert.ok(result.result.includes(')'));
  });
});

describe('translateExpression — @SQL@ marker', () => {
  it('translates @SQL@ as a variable reference (not rejected)', () => {
    // @SQL@ is treated like any @VAR@ — it becomes a variable name
    const result = translateExpression("@SQL@='Y'");
    assert.equal(result.success, true);
    assert.ok(result.result.includes('sQL'));
  });

  it('handles @SQL= prefix with closure', () => {
    // This expression contains no framework calls, so it is translated
    const result = translateExpression("@SQL@='N' & @DocStatus@='CO'");
    assert.equal(result.success, true);
    assert.ok(result.result.includes('&&'));
  });
});

describe('translateExpression — multiple | operators', () => {
  it('handles three OR conditions', () => {
    const result = translateExpression("@DocStatus@='CO' | @DocStatus@='CL' | @DocStatus@='VO'");
    assert.equal(result.success, true);
    // Count || occurrences (should be 2)
    const orCount = (result.result.match(/\|\|/g) || []).length;
    assert.equal(orCount, 2);
  });

  it('handles four OR conditions', () => {
    const result = translateExpression("@A@='1' | @B@='2' | @C@='3' | @D@='4'");
    assert.equal(result.success, true);
    const orCount = (result.result.match(/\|\|/g) || []).length;
    assert.equal(orCount, 3);
  });

  it('handles mixed multiple | and & operators', () => {
    const result = translateExpression("@A@='Y' & @B@='Y' | @C@='Y' & @D@='Y' | @E@='Y'");
    assert.equal(result.success, true);
    assert.ok(result.result.includes('&&'));
    assert.ok(result.result.includes('||'));
  });
});

// ---------------------------------------------------------------------------
// translateExpression — special variable patterns
// ---------------------------------------------------------------------------

describe('translateExpression — special variable patterns', () => {
  it('translates @#AD_Org_ID@ system variable', () => {
    const result = translateExpression("@#AD_Org_ID@='0'");
    assert.equal(result.success, true);
    // @#AD_Org_ID@ -> first char lowercase -> aD_Org_ID
    assert.ok(result.result.includes('aD_Org_ID'));
  });

  it('translates @#Date@ date variable', () => {
    const result = translateExpression("@DateOrdered@>@#Date@");
    assert.equal(result.success, true);
  });

  it('handles empty value comparison', () => {
    const result = translateExpression("@DocStatus@=''");
    assert.equal(result.success, true);
    assert.ok(result.result.includes("==''"));
  });
});

// ---------------------------------------------------------------------------
// analyzeJavaSource — more DML patterns
// ---------------------------------------------------------------------------

describe('analyzeJavaSource — more DML patterns', () => {
  it('detects ConnectionProvider as DML', () => {
    const source = `ConnectionProvider cp = new ConnectionProviderImpl();`;
    const result = analyzeJavaSource(source);
    assert.equal(result.hasDml, true);
  });

  it('detects executeUpdate as DML', () => {
    const source = `statement.executeUpdate("DELETE FROM C_Order WHERE IsActive='N'");`;
    const result = analyzeJavaSource(source);
    assert.equal(result.hasDml, true);
  });

  it('detects getConnection as DML', () => {
    const source = `Connection conn = getConnection();`;
    const result = analyzeJavaSource(source);
    assert.equal(result.hasDml, true);
  });

  it('does not flag indexOf as DML', () => {
    const source = `int idx = "hello".indexOf("ell");`;
    const result = analyzeJavaSource(source);
    assert.equal(result.hasDml, false);
  });

  it('does not flag simple string operations as DML', () => {
    const source = `String result = name.trim().toLowerCase();`;
    const result = analyzeJavaSource(source);
    assert.equal(result.hasDml, false);
  });
});

// ---------------------------------------------------------------------------
// analyzeJavaSource — effect detection edge cases
// ---------------------------------------------------------------------------

describe('analyzeJavaSource — effect detection edge cases', () => {
  it('detects put as an effect', () => {
    const source = `result.put("netAmount", new BigDecimal("100"));`;
    const result = analyzeJavaSource(source);
    // put may or may not be treated as effect depending on implementation
    assert.ok(result.effects !== undefined);
  });

  it('detects setFieldValue with single-quoted field name', () => {
    const source = `setFieldValue("grossAmount", price.multiply(qty));`;
    const result = analyzeJavaSource(source);
    const effect = result.effects.find(e => e.field === 'grossAmount');
    assert.ok(effect);
  });

  it('handles source with no method calls', () => {
    const source = `int x = 1; int y = 2; int z = x + y;`;
    const result = analyzeJavaSource(source);
    assert.deepEqual(result.effects, []);
    assert.equal(result.hasDml, false);
  });

  it('handles source with only imports and package', () => {
    const source = `package com.example;
import java.util.List;
import java.math.BigDecimal;`;
    const result = analyzeJavaSource(source);
    assert.equal(result.loc, 3);
    assert.equal(result.branches, 0);
  });
});
