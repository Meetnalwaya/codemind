// electron/main.ts
// App entry point. Creates the window, registers all IPC handlers,
// and loads/persists the encrypted Claude API key via electron-store
// (or a plain JSON file fallback — see loadPersistedKey below).

import { app, BrowserWindow, ipcMain, safeStorage } from "electron";
import * as path from "path";
import { promises as fs } from "fs";
import { registerParserHandlers } from "./ipc/parser";
import { registerWriterHandlers } from "./ipc/writer";
import { registerClaudeHandlers, setApiKey, loadApiKey } from "./ipc/claude";

const isDev = process.env.NODE_ENV === "development";
const KEY_STORAGE_PATH = path.join(app.getPath("userData"), "apikey.enc");

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    title: "CodeMind",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    // __dirname here is <project root>/dist-electron/electron, so we need
    // to climb back up to the project root before descending into renderer/dist.
    mainWindow.loadFile(path.join(__dirname, "../../renderer/dist/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

async function loadPersistedKey(): Promise<void> {
  try {
    const encrypted = await fs.readFile(KEY_STORAGE_PATH);
    loadApiKey(encrypted);
  } catch {
    // No key saved yet — user will be prompted via the onboarding flow.
  }
}

function registerSettingsHandlers(): void {
  ipcMain.handle("settings:set-api-key", async (_event, plainTextKey: string) => {
    if (!safeStorage.isEncryptionAvailable()) {
      return { ok: false, error: "OS-level encryption is not available on this machine" };
    }
    const encrypted = setApiKey(plainTextKey);
    await fs.writeFile(KEY_STORAGE_PATH, encrypted);
    return { ok: true };
  });

  ipcMain.handle("settings:has-api-key", async () => {
    try {
      await fs.access(KEY_STORAGE_PATH);
      return { ok: true, hasKey: true };
    } catch {
      return { ok: true, hasKey: false };
    }
  });
}

app.whenReady().then(async () => {
  await loadPersistedKey();

  registerParserHandlers();
  registerWriterHandlers();
  registerClaudeHandlers();
  registerSettingsHandlers();

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
