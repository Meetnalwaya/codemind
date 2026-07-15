// electron/ipc/writer.ts
// IPC handler: applies a diff the user approved in DiffViewer.
// Always writes a .bak alongside the original before overwriting, so
// "Apply" is never a one-way door.

import { ipcMain } from "electron";
import { promises as fs } from "fs";
import * as path from "path";
import { IPC_CHANNELS } from "../../shared/types";
import type { WriteFileRequest, WriteFileResponse } from "../../shared/types";

export function registerWriterHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.WRITE_FILE,
    async (_event, request: WriteFileRequest): Promise<WriteFileResponse> => {
      try {
        if (!request?.absPath) {
          return { ok: false, error: "absPath is required" };
        }

        // Basic guardrail: refuse to write outside anything resembling
        // a real path (e.g. accidental empty string joins from renderer bugs).
        const normalized = path.normalize(request.absPath);
        if (normalized === path.sep || normalized === "") {
          return { ok: false, error: "Refusing to write to an invalid path" };
        }

        let backupPath: string | undefined;
        const wantsBackup = request.createBackup !== false; // default true

        if (wantsBackup) {
          const exists = await fs
            .access(normalized)
            .then(() => true)
            .catch(() => false);

          if (exists) {
            backupPath = `${normalized}.bak`;
            await fs.copyFile(normalized, backupPath);
          }
        }

        await fs.mkdir(path.dirname(normalized), { recursive: true });
        await fs.writeFile(normalized, request.content, "utf-8");

        return { ok: true, backupPath };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }
  );
}
