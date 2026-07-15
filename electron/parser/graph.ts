// electron/parser/graph.ts
// Turns a flat list of ExtractedFile into a graph: resolves relative
// import specifiers ("./services/auth") into concrete node ids so
// React Flow can draw edges between file-nodes.

import { promises as fs } from "fs";
import * as path from "path";
import type { GraphEdge, GraphNode, ParseError, ParseResult } from "../../shared/types";
import { walkRepo, type WalkedFile } from "./walker";
import { extractFile, resetProject, type ExtractedFile } from "./ast";

const RESOLVABLE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx"];

/**
 * Resolves a relative import specifier from `fromRelPath` to a node id
 * (relative path) that exists in `knownPaths`. Returns null if it can't
 * be resolved to a file we actually parsed (e.g. it points outside the repo
 * or to a package alias we don't understand).
 */
function resolveRelativeImport(
  fromRelPath: string,
  specifier: string,
  knownPaths: Set<string>
): string | null {
  const fromDir = path.posix.dirname(fromRelPath);
  const joined = path.posix.normalize(path.posix.join(fromDir, specifier));

  if (knownPaths.has(joined)) return joined;

  for (const ext of RESOLVABLE_EXTENSIONS) {
    const candidate = ext.startsWith("/") ? `${joined}${ext}` : `${joined}${ext}`;
    if (knownPaths.has(candidate)) return candidate;
  }

  return null;
}

export interface BuildGraphOptions {
  rootDir: string;
  ignoreGlobs?: string[];
  onProgress?: (parsed: number, total: number) => void;
}

export async function buildGraph(options: BuildGraphOptions): Promise<ParseResult> {
  const { rootDir, ignoreGlobs, onProgress } = options;

  resetProject(); // fresh ts-morph project per full parse pass

  const files: WalkedFile[] = await walkRepo(rootDir, { ignoreGlobs });
  const errors: ParseError[] = [];
  const extracted: ExtractedFile[] = [];

  let done = 0;
  for (const file of files) {
    try {
      const content = await fs.readFile(file.absPath, "utf-8");
      extracted.push(extractFile(file, content));
    } catch (err) {
      errors.push({
        filePath: file.relPath,
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      done += 1;
      onProgress?.(done, files.length);
    }
  }

  const nodes = new Map<string, GraphNode>();
  for (const { node } of extracted) {
    nodes.set(node.id, node);
  }

  const knownPaths = new Set(nodes.keys());
  const edges: GraphEdge[] = [];

  for (const { node, imports } of extracted) {
    for (const imp of imports) {
      if (!imp.isRelative) continue; // skip node_modules/package imports
      const resolvedId = resolveRelativeImport(node.id, imp.moduleSpecifier, knownPaths);
      if (!resolvedId || resolvedId === node.id) continue;

      edges.push({
        from: node.id,
        to: resolvedId,
        kind: "import",
        importedNames: imp.namedImports,
      });
    }
  }

  return {
    nodes,
    edges,
    rootDir,
    parsedAt: Date.now(),
    fileCount: files.length,
    errors,
  };
}

/** Convert the Map-based ParseResult into a plain-object shape safe to
 *  send across Electron's IPC boundary (structured clone doesn't love Maps
 *  in every Electron version, so we normalize explicitly). */
export function serializeParseResult(result: ParseResult) {
  const nodesRecord: Record<string, GraphNode> =
    result.nodes instanceof Map ? Object.fromEntries(result.nodes) : result.nodes;

  return {
    nodes: nodesRecord,
    edges: result.edges,
    rootDir: result.rootDir,
    parsedAt: result.parsedAt,
    fileCount: result.fileCount,
    errors: result.errors,
  };
}

/** Returns the ids of every node directly connected to `nodeId`,
 *  in either direction (imports it, or is imported by it). Used to
 *  build "connected files" context for the Claude prompt. */
export function getConnectedNodeIds(
  nodeId: string,
  edges: GraphEdge[],
  limit = 6
): string[] {
  const connected = new Set<string>();
  for (const edge of edges) {
    if (edge.from === nodeId) connected.add(edge.to);
    if (edge.to === nodeId) connected.add(edge.from);
    if (connected.size >= limit) break;
  }
  return [...connected];
}
