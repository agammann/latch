import ts from 'typescript';
import { sources, read } from './files.js';
export interface Candidate {
  file: string;
  line: number;
  name: string;
  kind: string;
  evidence: string;
  inputs: string[];
  unresolved: string[];
  adapterRequirements: string[];
}
export function inspect(root: string): Candidate[] {
  const found: Candidate[] = [];
  for (const file of sources(root)) {
    const source = ts.createSourceFile(
      file,
      read(root, file),
      ts.ScriptTarget.Latest,
      true,
      file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const visit = (node: ts.Node) => {
      if (
        (ts.isFunctionDeclaration(node) && node.name) ||
        (ts.isVariableDeclaration(node) &&
          ts.isIdentifier(node.name) &&
          node.initializer &&
          (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer)))
      ) {
        const name = (node as ts.FunctionDeclaration | ts.VariableDeclaration).name!.getText(
          source,
        );
        const fn = ts.isFunctionDeclaration(node)
          ? node
          : ((node as ts.VariableDeclaration).initializer as ts.ArrowFunction);
        const statement = ts.isFunctionDeclaration(node) ? node : node.parent.parent;
        const exported =
          ts.canHaveModifiers(statement) &&
          ts.getModifiers(statement)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
        const top = statement.parent === source;
        found.push({
          file,
          line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1,
          name,
          kind: exported && top ? 'exported-function' : 'react-or-local-callback',
          evidence: `${exported ? 'export ' : ''}${ts.isFunctionDeclaration(node) ? 'function' : 'callback'} ${name}`,
          inputs: fn.parameters.map(
            (p) => `${p.name.getText(source)}: ${p.type?.getText(source) ?? 'unresolved'}`,
          ),
          unresolved: [
            'Side effects and authorization require developer review',
            'Asynchronous commit and result semantics are not inferred',
          ],
          adapterRequirements:
            exported && top
              ? ['Map exported function explicitly']
              : ['Pass existing callback through a React binding; not a module export'],
        });
      }
      if (
        ts.isJsxAttribute(node) &&
        [
          'onSubmit',
          'onClick',
          'onChange',
          'required',
          'min',
          'max',
          'maxLength',
          'pattern',
        ].includes(node.name.getText(source))
      )
        found.push({
          file,
          line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1,
          name: node.name.getText(source),
          kind: 'form-or-handler-reference',
          evidence: node.name.getText(source),
          inputs: node.initializer ? [node.initializer.getText(source).slice(0, 160)] : [],
          unresolved: ['UI constraints do not establish a complete contract or safety'],
          adapterRequirements: ['Explicit handler mapping and input schema required'],
        });
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return found;
}
