// electron/parser/stylesampler.ts
// Picks a small, representative slice of the codebase (one route, one
// service, one util, by default) and formats it as a labeled text block
// Claude can pattern-match against. This is what makes generated code
// "look like it belongs" instead of like generic boilerplate.

import { promises as fs } from "fs";
import type { GraphNode, NodeKind } from "../../shared/types";

const PREFERRED_KIND_ORDER: NodeKind[] = [
  "route",
  "service",
  "component",
  "util",
  "hook",
  "controller",
];

const MAX_SAMPLE_CHARS_PER_FILE = 4000; // keep prompt tokens bounded

export interface StyleSample {
  node: GraphNode;
  content: string;
}

/**
 * Picks up to `count` files, preferring variety across kinds
 * (one route, one service, one util, ...) over picking several of
 * the same kind. Falls back to largest-by-size within a kind as a
 * simple proxy for "representative" (bigger files tend to show more
 * conventions: error handling, naming, comment style).
 */
export function pickRepresentativeSamples(
  nodes: GraphNode[],
  count = 3
): GraphNode[] {
  const byKind = new Map<NodeKind, GraphNode[]>();
  for (const node of nodes) {
    const list = byKind.get(node.kind) ?? [];
    list.push(node);
    byKind.set(node.kind, list);
  }
  for (const list of byKind.values()) {
    list.sort((a, b) => b.size - a.size);
  }

  const picked: GraphNode[] = [];
  for (const kind of PREFERRED_KIND_ORDER) {
    if (picked.length >= count) break;
    const candidates = byKind.get(kind);
    if (candidates && candidates.length > 0) {
      picked.push(candidates[0]);
    }
  }

  // Not enough variety in the repo (e.g. everything is "unknown") —
  // top up with the largest remaining files regardless of kind.
  if (picked.length < count) {
    const pickedIds = new Set(picked.map((n) => n.id));
    const remaining = nodes
      .filter((n) => !pickedIds.has(n.id))
      .sort((a, b) => b.size - a.size);
    for (const node of remaining) {
      if (picked.length >= count) break;
      picked.push(node);
    }
  }

  return picked;
}

async function readTruncated(absPath: string): Promise<string> {
  const content = await fs.readFile(absPath, "utf-8");
  if (content.length <= MAX_SAMPLE_CHARS_PER_FILE) return content;
  return (
    content.slice(0, MAX_SAMPLE_CHARS_PER_FILE) +
    "\n// ...(truncated for brevity, pattern is established above)"
  );
}

/**
 * Reads representative files off disk and formats them as a single
 * text block ready to drop into the Claude system prompt.
 */
export async function sampleCodeStyle(
  nodes: GraphNode[],
  count = 3
): Promise<string> {
  const samples = pickRepresentativeSamples(nodes, count);

  const blocks = await Promise.all(
    samples.map(async (node) => {
      const content = await readTruncated(node.absPath);
      return `// FILE: ${node.path} (${node.kind})\n${content}`;
    })
  );

  return blocks.join("\n\n---\n\n");
}
