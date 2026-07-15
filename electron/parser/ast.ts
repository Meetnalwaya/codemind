// electron/parser/ast.ts
// Wraps ts-morph so the rest of the app never touches the TS compiler API
// directly. One Project instance is reused across a whole parse pass for speed.

import { Project, SyntaxKind, SourceFile } from "ts-morph";
import * as path from "path";
import type { FunctionSignature, GraphNode, NodeKind } from "../../shared/types";
import type { WalkedFile } from "./walker";

export interface FileImport {
  moduleSpecifier: string; // "./services/auth" or "react"
  namedImports: string[];
  isRelative: boolean;
}

export interface ExtractedFile {
  node: GraphNode;
  imports: FileImport[];
}

let sharedProject: Project | null = null;

function getProject(): Project {
  if (!sharedProject) {
    sharedProject = new Project({
      useInMemoryFileSystem: false,
      skipAddingFilesFromTsConfig: true,
      compilerOptions: {
        allowJs: true,
        jsx: 2 /* React */ as any,
      },
    });
  }
  return sharedProject;
}

/** Reset the shared ts-morph project — call between full repo re-parses
 *  to avoid unbounded memory growth on large codebases. */
export function resetProject(): void {
  sharedProject = null;
}

function inferKind(relPath: string): NodeKind {
  const lower = relPath.toLowerCase();
  if (lower.includes("/routes/") || lower.includes("/pages/") || lower.includes("/app/"))
    return "route";
  if (lower.includes("/controllers/")) return "controller";
  if (lower.includes("/services/")) return "service";
  if (lower.includes("/components/")) return "component";
  if (lower.includes("/hooks/") || /use[A-Z]/.test(path.basename(relPath))) return "hook";
  if (lower.includes("/utils/") || lower.includes("/lib/")) return "util";
  if (lower.includes("config")) return "config";
  if (lower.includes("/types/") || lower.endsWith(".d.ts")) return "type";
  return "unknown";
}

function extractFunctions(sourceFile: SourceFile): FunctionSignature[] {
  const sigs: FunctionSignature[] = [];

  for (const fn of sourceFile.getFunctions()) {
    sigs.push({
      name: fn.getName() ?? "(anonymous)",
      params: fn.getParameters().map((p) => p.getName()),
      returnType: fn.getReturnTypeNode()?.getText() ?? "inferred",
      isAsync: fn.isAsync(),
      isExported: fn.isExported(),
    });
  }

  // Arrow functions assigned to exported consts, e.g. `export const login = async () => {}`
  for (const varStatement of sourceFile.getVariableStatements()) {
    const isExported = varStatement.isExported();
    for (const decl of varStatement.getDeclarations()) {
      const initializer = decl.getInitializer();
      if (initializer && initializer.getKind() === SyntaxKind.ArrowFunction) {
        const arrow = initializer.asKindOrThrow(SyntaxKind.ArrowFunction);
        sigs.push({
          name: decl.getName(),
          params: arrow.getParameters().map((p) => p.getName()),
          returnType: arrow.getReturnTypeNode()?.getText() ?? "inferred",
          isAsync: arrow.isAsync(),
          isExported,
        });
      }
    }
  }

  return sigs;
}

function extractImports(sourceFile: SourceFile): FileImport[] {
  return sourceFile.getImportDeclarations().map((imp) => {
    const moduleSpecifier = imp.getModuleSpecifierValue();
    const namedImports = [
      ...imp.getNamedImports().map((n) => n.getName()),
      ...(imp.getDefaultImport() ? [imp.getDefaultImport()!.getText()] : []),
    ];
    return {
      moduleSpecifier,
      namedImports,
      isRelative: moduleSpecifier.startsWith("."),
    };
  });
}

export function extractFile(
  file: WalkedFile,
  content: string
): ExtractedFile {
  const project = getProject();

  // Guard against re-adding the same path across repeated parses.
  const existing = project.getSourceFile(file.absPath);
  const sourceFile = existing
    ? (existing.replaceWithText(content), existing)
    : project.createSourceFile(file.absPath, content, { overwrite: true });

  const exportedNames: string[] = [];
  for (const [name] of sourceFile.getExportedDeclarations()) {
    exportedNames.push(name);
  }

  const node: GraphNode = {
    id: file.relPath,
    path: file.relPath,
    absPath: file.absPath,
    kind: inferKind(file.relPath),
    exports: exportedNames,
    functions: extractFunctions(sourceFile),
    size: file.size,
  };

  return { node, imports: extractImports(sourceFile) };
}
