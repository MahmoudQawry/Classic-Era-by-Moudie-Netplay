// Usage: node extract_literals.cjs <dir-of-blobs> <out.json>
const fs = require("fs"), path = require("path");
const ts = require(process.env.TS_PATH || "typescript");
const [dir, out] = process.argv.slice(2);
const result = {};
for (const f of fs.readdirSync(dir)) {
  const src = fs.readFileSync(path.join(dir, f), "utf8");
  const sf = ts.createSourceFile(f, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const lits = new Set();
  const visit = (n) => {
    if (ts.isTypeNode(n) || ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) return;
    if (ts.isCallExpression(n) && n.expression.getText(sf) === "require") return;
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) lits.add(n.text);
    else if (ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) lits.add(n.text);
    else if (ts.isJsxText(n)) { const t = n.text.replace(/\s+/g, " ").trim(); if (t) lits.add(t); }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  result[f] = [...lits].filter((s) => s.length >= 5 && s.length <= 300);
}
fs.writeFileSync(out, JSON.stringify(result));
