// electron/preload.ts
// The ONLY bridge between renderer (untrusted-ish React UI) and main
// process (has fs/node access). contextIsolation is on and
// nodeIntegration is off in main.ts, so this is the sole surface
// exposed to `window.codemind` in the renderer.

import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS } from "../shared/types";
import type {
  ParseCodebaseRequest,
  ParseCodebaseResponse,
  WriteFileRequest,
  WriteFileResponse,
  ClaudeStreamRequest,
  ClaudeStreamChunk,
} from "../shared/types";

contextBridge.exposeInMainWorld("codemind", {
  parseCodebase: (request: ParseCodebaseRequest): Promise<ParseCodebaseResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.PARSE_CODEBASE, request),

  onParseProgress: (callback: (parsed: number, total: number) => void) => {
    const listener = (_event: unknown, data: { parsed: number; total: number }) =>
      callback(data.parsed, data.total);
    ipcRenderer.on("parser:progress", listener);
    return () => ipcRenderer.removeListener("parser:progress", listener);
  },

  writeFile: (request: WriteFileRequest): Promise<WriteFileResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.WRITE_FILE, request),

  startClaudeStream: (request: ClaudeStreamRequest): Promise<{ requestId: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_STREAM_START, request),

  cancelClaudeStream: (requestId: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_STREAM_CANCEL, requestId),

  onClaudeChunk: (callback: (chunk: ClaudeStreamChunk) => void) => {
    const listener = (_event: unknown, chunk: ClaudeStreamChunk) => callback(chunk);
    ipcRenderer.on(IPC_CHANNELS.CLAUDE_STREAM_CHUNK, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.CLAUDE_STREAM_CHUNK, listener);
  },

  setApiKey: (key: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke("settings:set-api-key", key),

  hasApiKey: (): Promise<{ ok: boolean; hasKey: boolean }> =>
    ipcRenderer.invoke("settings:has-api-key"),
});
