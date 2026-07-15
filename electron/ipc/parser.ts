// electron/ipc/parser.ts
// IPC handler: renderer asks "parse this folder", main process walks +
// ASTs + builds the graph, and returns a serialized ParseResult.

import { ipcMain, BrowserWindow } from "electron";
import { buildGraph, serializeParseResult } from "../parser/graph";
import { IPC_CHANNELS } from "../../shared/types";
import type {
  ParseCodebaseRequest,
  ParseCodebaseResponse,
} from "../../shared/types";

let lastParse: ReturnType<typeof serializeParseResult> | null = null;

export function getLastParseResult() {
  return lastParse;
}

export function registerParserHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.PARSE_CODEBASE,
    async (event, request: ParseCodebaseRequest): Promise<ParseCodebaseResponse> => {
      const window = BrowserWindow.fromWebContents(event.sender);

      try {
        if (!request?.rootDir) {
          return { ok: false, error: "rootDir is required" };
        }

        const result = await buildGraph({
          rootDir: request.rootDir,
          ignoreGlobs: request.ignoreGlobs,
          onProgress: (parsed, total) => {
            // Fire-and-forget progress events for a loading bar in the UI.
            window?.webContents.send("parser:progress", { parsed, total });
          },
        });

        const serialized = serializeParseResult(result);
        lastParse = serialized;

        return { ok: true, result: serialized };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }
  );
}
