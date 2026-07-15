// renderer/codemind-bridge.d.ts
// Ambient type for the API preload.ts exposes on window.codemind.
// Import-free so it's picked up automatically by tsc's global scope.

import type {
  ParseCodebaseRequest,
  ParseCodebaseResponse,
  WriteFileRequest,
  WriteFileResponse,
  ClaudeStreamRequest,
  ClaudeStreamChunk,
} from "../shared/types";

export {};

declare global {
  interface Window {
    codemind: {
      parseCodebase: (request: ParseCodebaseRequest) => Promise<ParseCodebaseResponse>;
      onParseProgress: (
        callback: (parsed: number, total: number) => void
      ) => () => void;
      writeFile: (request: WriteFileRequest) => Promise<WriteFileResponse>;
      startClaudeStream: (
        request: ClaudeStreamRequest
      ) => Promise<{ requestId: string }>;
      cancelClaudeStream: (requestId: string) => Promise<{ ok: boolean }>;
      onClaudeChunk: (callback: (chunk: ClaudeStreamChunk) => void) => () => void;
      setApiKey: (key: string) => Promise<{ ok: boolean; error?: string }>;
      hasApiKey: () => Promise<{ ok: boolean; hasKey: boolean }>;
    };
  }
}
