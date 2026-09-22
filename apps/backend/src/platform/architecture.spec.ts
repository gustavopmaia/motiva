import { readdirSync, readFileSync } from "fs";
import { dirname, join, relative, resolve } from "path";
import ts from "typescript";
function files(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? files(join(root, entry.name)) : [join(root, entry.name)],
  );
}
it("keeps migrated domain policies independent of frameworks and database adapters", () => {
  const violations: string[] = [];
  const root = join(__dirname, "..", "modules");
  for (const path of files(root).filter(
    (p) => p.includes("/domain/") && p.endsWith(".ts") && !p.endsWith(".spec.ts"),
  )) {
    const source = ts.createSourceFile(
      path,
      readFileSync(path, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    source.forEachChild((node) => {
      if (!ts.isImportDeclaration(node)) return;
      const target = (node.moduleSpecifier as ts.StringLiteral).text;
      if (
        !target.startsWith(".") ||
        /infrastructure|application|platform|database|transport/.test(target)
      )
        violations.push(`${relative(root, path)} -> ${target}`);
    });
  }
  expect(violations).toEqual([]);
});

it("keeps application use cases independent of frameworks, persistence and transports", () => {
  const root = join(__dirname, "..", "modules");
  const violations: string[] = [];
  for (const path of files(root).filter(
    (p) => p.includes("/application/") && p.endsWith(".ts") && !p.endsWith(".spec.ts"),
  )) {
    const source = ts.createSourceFile(
      path,
      readFileSync(path, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    source.forEachChild((node) => {
      if (!ts.isImportDeclaration(node)) return;
      const target = (node.moduleSpecifier as ts.StringLiteral).text;
      if (!target.startsWith(".") || /infrastructure|database|platform|transport/.test(target))
        violations.push(`${relative(root, path)} -> ${target}`);
    });
  }
  expect(violations).toEqual([]);
});

it("uses public module APIs and keeps module dependencies acyclic", () => {
  const root = join(__dirname, "..", "modules");
  const violations: string[] = [];
  const edges = new Map<string, Set<string>>();
  for (const path of files(root).filter((p) => p.endsWith(".ts") && !p.endsWith(".spec.ts"))) {
    const owner = relative(root, path).split("/")[0];
    const source = ts.createSourceFile(
      path,
      readFileSync(path, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    source.forEachChild((node) => {
      if (!ts.isImportDeclaration(node)) return;
      const specifier = (node.moduleSpecifier as ts.StringLiteral).text;
      if (!specifier.startsWith(".")) return;
      const target = resolve(dirname(path), specifier);
      const targetRelative = relative(root, target);
      if (targetRelative.startsWith("..")) return;
      const dependency = targetRelative.split("/")[0];
      if (owner === dependency) return;
      // Foreign keys are composition of persistence definitions, not module API access.
      if (path.endsWith("/schema.ts") && target.endsWith("/schema")) return;
      if (!target.endsWith("/public")) violations.push(`${relative(root, path)} -> ${specifier}`);
      const deps = edges.get(owner) ?? new Set<string>();
      deps.add(dependency);
      edges.set(owner, deps);
    });
  }
  const visit = (owner: string, stack: string[]) => {
    if (stack.includes(owner)) {
      violations.push(`cycle: ${[...stack, owner].join(" -> ")}`);
      return;
    }
    for (const dependency of edges.get(owner) ?? []) visit(dependency, [...stack, owner]);
  };
  for (const owner of edges.keys()) visit(owner, []);
  expect(violations).toEqual([]);
});
