import ts from "typescript";

export const generateTypedAliasDeclaration = (
  name: string,
  type: ts.TypeNode
) => {
  return ts.factory.createTypeAliasDeclaration(
    undefined,
    [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
    ts.factory.createIdentifier(name),
    undefined,
    type
  );
};
