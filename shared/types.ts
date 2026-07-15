// shared/types.ts
// Single source of truth for graph + parse result shapes.
// Imported by both electron/ (main process) and renderer/ (React app).

export type NodeKind =
  | "route"
  | "controller"
  | "service"
  | "component"
  | "hook"
  | "util"
  | "config"
  | "type"
  | "unknown";

export interface GraphNode {
  id: string; // absolute or repo-relative file path, used as unique key
  path: string; // repo-relative path, e.g. "src/routes/login.ts"
  absPath: string; // absolute path on disk
  kind: NodeKind;
  exports: string[]; // exported symbol names
  functions: FunctionSignature[];
  size: number; // bytes
  content?: string; // full file text, lazily attached when needed
}

export interface FunctionSignature {
  name: string;
  params: string[];
  returnType: string;
  isAsync: boolean;
  isExported: boolean;
}

export interface GraphEdge {
  from: string; // GraphNode.id
  to: string; // GraphNode.id
  kind: "import" | "route-mount" | "hook-usage";
  importedNames: string[];
}

export interface ParseResult {
  nodes: Map<string, GraphNode> | GraphNodeRecord;
  edges: GraphEdge[];
  rootDir: string;
  parsedAt: number;
  fileCount: number;
  errors: ParseError[];
}

// Map doesn't survive structuredClone/IPC in some setups, so we also
// define a plain-object record shape for serialization across IPC.
export type GraphNodeRecord = Record<string, GraphNode>;

export interface ParseError {
  filePath: string;
  message: string;
}

// ---- IPC contract types ----

export interface ParseCodebaseRequest {
  rootDir: string;
  ignoreGlobs?: string[];
}

export interface ParseCodebaseResponse {
  ok: boolean;
  result?: SerializedParseResult;
  error?: string;
}

// Serialized form sent over IPC (Map -> plain object)
export interface SerializedParseResult {
  nodes: GraphNodeRecord;
  edges: GraphEdge[];
  rootDir: string;
  parsedAt: number;
  fileCount: number;
  errors: ParseError[];
}

export interface WriteFileRequest {
  absPath: string;
  content: string;
  createBackup?: boolean;
}

export interface WriteFileResponse {
  ok: boolean;
  backupPath?: string;
  error?: string;
}

export interface ClaudeStreamRequest {
  selectedNodeId: string;
  userPrompt: string; // e.g. "add google authentication"
  graph: SerializedParseResult;
  maxContextFiles?: number; // how many connected files to include, default 6
}

// Streamed back to renderer as incremental IPC events, channel: "claude:chunk"
export interface ClaudeStreamChunk {
  requestId: string;
  type: "text" | "done" | "error";
  textDelta?: string;
  error?: string;
  // Populated only on "done": the model's best-guess full file replacement,
  // extracted from its last fenced code block.
  proposedContent?: string;
}

export const IPC_CHANNELS = {
  PARSE_CODEBASE: "parser:parse-codebase",
  WRITE_FILE: "writer:write-file",
  CLAUDE_STREAM_START: "claude:stream-start",
  CLAUDE_STREAM_CHUNK: "claude:chunk",
  CLAUDE_STREAM_CANCEL: "claude:cancel",
} as const;
