// electron/preload.ts
// The ONLY bridge between renderer (untrusted-ish React UI) and main
// process (has fs/node access). contextIsolation is on and
// nodeIntegration is off in main.ts, so this is the sole surface
// exposed to `window.codemind` in the renderer.

import { contextBridge, ipcRenderer } from "electron";
import type {
  ParseCodebaseRequest,
  ParseCodebaseResponse,
  WriteFileRequest,
  WriteFileResponse,
  ClaudeStreamRequest,
  ClaudeStreamChunk,
} from "../shared/types";

// Electron's sandboxed preload loader (webPreferences.sandbox: true in
// main.ts) only supports requiring built-in modules ("electron", "events",
// etc.) — it cannot resolve local files like "../shared/types". A real
// (value) import of IPC_CHANNELS from there compiles to a runtime
// require() call and fails with "module not found" at launch. Type-only
// imports above are erased entirely at compile time so they're safe;
// these constants are duplicated here so preload.ts is fully self-contained.
const CHANNELS = {
  PARSE_CODEBASE: "parser:parse-codebase",
  WRITE_FILE: "writer:write-file",
  CLAUDE_STREAM_START: "claude:stream-start",
  CLAUDE_STREAM_CHUNK: "claude:chunk",
  CLAUDE_STREAM_CANCEL: "claude:cancel",
} as const;

contextBridge.exposeInMainWorld("codemind", {
  parseCodebase: (request: ParseCodebaseRequest): Promise<ParseCodebaseResponse> =>
    ipcRenderer.invoke(CHANNELS.PARSE_CODEBASE, request),

  onParseProgress: (callback: (parsed: number, total: number) => void) => {
    const listener = (_event: unknown, data: { parsed: number; total: number }) =>
      callback(data.parsed, data.total);
    ipcRenderer.on("parser:progress", listener);
    return () => ipcRenderer.removeListener("parser:progress", listener);
  },

  writeFile: (request: WriteFileRequest): Promise<WriteFileResponse> =>
    ipcRenderer.invoke(CHANNELS.WRITE_FILE, request),

  startClaudeStream: (request: ClaudeStreamRequest): Promise<{ requestId: string }> =>
    ipcRenderer.invoke(CHANNELS.CLAUDE_STREAM_START, request),

  cancelClaudeStream: (requestId: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke(CHANNELS.CLAUDE_STREAM_CANCEL, requestId),

  onClaudeChunk: (callback: (chunk: ClaudeStreamChunk) => void) => {
    const listener = (_event: unknown, chunk: ClaudeStreamChunk) => callback(chunk);
    ipcRenderer.on(CHANNELS.CLAUDE_STREAM_CHUNK, listener);
    return () => ipcRenderer.removeListener(CHANNELS.CLAUDE_STREAM_CHUNK, listener);
  },

  setApiKey: (key: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke("settings:set-api-key", key),

  hasApiKey: (): Promise<{ ok: boolean; hasKey: boolean }> =>
    ipcRenderer.invoke("settings:has-api-key"),
});