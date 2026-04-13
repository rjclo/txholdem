import { app, BrowserWindow, dialog } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { startServer } from "../server.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow = null;
let serverController = null;

async function createWindow() {
  process.env.TXHOLDEM_DATA_DIR = app.getPath("userData");

  serverController = await startServer(0);

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 980,
    minWidth: 1080,
    minHeight: 760,
    title: "TX Holdem",
    autoHideMenuBar: true,
    backgroundColor: "#0f1720",
    webPreferences: {
      contextIsolation: true,
      sandbox: true
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (input.type === "keyDown" && input.key === "Escape" && mainWindow?.isFullScreen()) {
      event.preventDefault();
      mainWindow.setFullScreen(false);
    }
  });

  await mainWindow.loadURL(`http://127.0.0.1:${serverController.port}`);
}

app.whenReady().then(createWindow).catch(async (error) => {
  await dialog.showMessageBox({
    type: "error",
    title: "TX Holdem failed to start",
    message: error.message
  });
  app.quit();
});

app.on("activate", async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    await createWindow();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", async (event) => {
  if (!serverController) {
    return;
  }

  event.preventDefault();
  const activeServer = serverController;
  serverController = null;

  try {
    await activeServer.stop();
  } finally {
    app.quit();
  }
});
