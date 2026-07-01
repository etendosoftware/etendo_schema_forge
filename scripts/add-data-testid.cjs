/**
 * jscodeshift transformer to add data-testid attributes to React components.
 * Ported from com.etendorx.workspace-ui/scripts/add-data-testid.cjs
 *
 * Strategy:
 *   1. Finds JSX opening elements whose name starts with uppercase (React components)
 *   2. Skips if element already has data-testid
 *   3. If a `field` variable is in ancestor scope → data-testid="ComponentName__{field.id}"
 *   4. Otherwise → data-testid="ComponentName__<6-char-hash-of-filepath>"
 *
 * Opt-out: add `// @data-testid-ignore` anywhere in a file to skip it entirely.
 */
module.exports = function transformer(file, api) {
  const j = api.jscodeshift;
  const root = j(file.source);
  const filePath = file.path || file.pathname || "";
  if (!filePath) return file.source;

  // Opt-out marker
  if (/@data-testid-ignore\b/i.test(file.source)) {
    console.log(`Skipping by marker: ${filePath}`);
    return file.source;
  }

  // Skip excluded directories
  const excludedPaths = ["node_modules", "dist", "build", ".next", "coverage", ".git",
    ".storybook-static", "storybook-static", "__generated__"];
  if (excludedPaths.some(ex => filePath.includes(`/${ex}/`) || filePath.includes(`\\${ex}\\`))) {
    console.log(`Skipping excluded path: ${filePath}`);
    return file.source;
  }

  // Skip test/story/mock files
  const testPatterns = [/\.test\.(jsx?|tsx?)$/, /\.spec\.(jsx?|tsx?)$/, /__tests__/,
    /\.stories\.(jsx?|tsx?)$/, /\.mock\.(jsx?|tsx?)$/];
  if (testPatterns.some(p => p.test(filePath))) {
    console.log(`Skipping test file: ${filePath}`);
    return file.source;
  }

  // Deterministic hash (djb2) from file path → 6 hex chars
  function fileHash(s) {
    let hash = 5381;
    for (let i = 0; i < s.length; i++) hash = (hash * 33) ^ s.charCodeAt(i);
    return (hash >>> 0).toString(16).slice(0, 6);
  }
  const hash = fileHash(filePath);

  // Check if `field` variable is accessible in ancestor scope
  function hasFieldInScope(path) {
    let cur = path.parentPath;
    while (cur) {
      const node = cur.node;
      if (["FunctionDeclaration","FunctionExpression","ArrowFunctionExpression"].includes(node.type)) {
        for (const p of (node.params || [])) {
          if (!p) continue;
          if (p.type === "Identifier" && p.name === "field") return true;
          if (p.type === "ObjectPattern" && Array.isArray(p.properties)) {
            for (const prop of p.properties) {
              if (prop && prop.key && prop.key.name === "field") return true;
            }
          }
        }
      }
      if (node.type === "VariableDeclarator") {
        const id = node.id;
        if (id) {
          if (id.type === "Identifier" && id.name === "field") return true;
          if (id.type === "ObjectPattern" && Array.isArray(id.properties)) {
            for (const prop of id.properties) {
              if (prop && prop.key && prop.key.name === "field") return true;
            }
          }
        }
      }
      cur = cur.parentPath;
    }
    return false;
  }

  const elements = root.find(j.JSXOpeningElement).filter(path => {
    const n = path.node.name;
    return n && n.type === "JSXIdentifier" && /^[A-Z]/.test(n.name);
  });

  for (const path of elements.paths()) {
    const attrs = path.node.attributes || [];
    if (attrs.some(a => a && a.type === "JSXAttribute" && a.name && a.name.name === "data-testid"))
      continue;
    const compName = path.node.name.name;
    if (hasFieldInScope(path)) {
      const expr = j.binaryExpression("+",
        j.literal(`${compName}__`),
        j.memberExpression(j.identifier("field"), j.identifier("id")));
      attrs.push(j.jsxAttribute(j.jsxIdentifier("data-testid"), j.jsxExpressionContainer(expr)));
    } else {
      attrs.push(j.jsxAttribute(j.jsxIdentifier("data-testid"), j.literal(`${compName}__${hash}`)));
    }
    path.node.attributes = attrs;
  }

  return root.toSource({ quote: "double", reuseWhitespace: true });
};
