// electron/parser/walker.ts
// Recursively scans a repo root and returns every file worth parsing.
// Keeps its own default ignore list so a fresh repo "just works" with
// zero config; ignoreGlobs from the request are merged on top.

import { promises as fs, type Dirent } from "fs";
import * as path from "path";

const DEFAULT_IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "out",
  ".next",
  ".turbo",
  "coverage",
  ".cache",
  ".vscode",
  ".idea",
]);

const PARSEABLE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mts",
  ".cts",
]);

const MAX_FILE_SIZE_BYTES = 1_000_000; // skip anything over ~1MB, likely generated/bundled

export interface WalkedFile {
  absPath: string;
  relPath: string;
  size: number;
}

export interface WalkOptions {
  ignoreGlobs?: string[];
}

/**
 * Simple glob-ish matcher supporting "*" wildcards, enough for
 * user-supplied ignore patterns like "**\/*.test.ts" or "src/generated/*".
 */
function matchesGlob(relPath: string, glob: string): boolean {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "§§DOUBLESTAR§§")
    .replace(/\*/g, "[^/]*")
    .replace(/§§DOUBLESTAR§§/g, ".*");
  const re = new RegExp(`^${escaped}$`);
  return re.test(relPath);
}

export async function walkRepo(
  rootDir: string,
  options: WalkOptions = {}
): Promise<WalkedFile[]> {
  const ignoreGlobs = options.ignoreGlobs ?? [];
  const results: WalkedFile[] = [];

  async function walk(dir: string): Promise<void> {
    let entries: Dirent[];
    try {
      entries = (await fs.readdir(dir, { withFileTypes: true })) as Dirent[];
    } catch {
      // Directory vanished or unreadable (permissions) — skip silently.
      return;
    }

    for (const entry of entries) {
      const absPath = path.join(dir, entry.name);
      const relPath = path.relative(rootDir, absPath).split(path.sep).join("/");

      if (entry.isDirectory()) {
        if (DEFAULT_IGNORE_DIRS.has(entry.name)) continue;
        if (entry.name.startsWith(".")) continue;
        if (ignoreGlobs.some((g) => matchesGlob(relPath, g))) continue;
        await walk(absPath);
        continue;
      }

      if (!entry.isFile()) continue;

      const ext = path.extname(entry.name);
      if (!PARSEABLE_EXTENSIONS.has(ext)) continue;
      if (ignoreGlobs.some((g) => matchesGlob(relPath, g))) continue;

      let stat;
      try {
        stat = await fs.stat(absPath);
      } catch {
        continue;
      }
      if (stat.size > MAX_FILE_SIZE_BYTES) continue;

      results.push({ absPath, relPath, size: stat.size });
    }
  }

  await walk(rootDir);
  return results;
}