"use strict";

const { app, BrowserWindow, Menu, shell, nativeTheme } = require("electron");
const path = require("node:path");
const { createServerOnce } = require("./server.cjs");

const isDev = !!process.env.VITE_DEV_SERVER_URL || process.env.DIFFUSION_DEV === "1";
const appRoot = path.join(__dirname, "..");
const DEV_URL = process.env.VITE_DEV_SERVER_URL || "http://localhost:3030";

let mainWindow = null;

function createWindow(startUrl) {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    show: false,
    backgroundColor: "#171717",
    titleBarStyle: "hiddenInset", // native traffic lights over our own header
    trafficLightPosition: { x: 16, y: 16 },
    vibrancy: "under-window",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  nativeTheme.themeSource = "dark";

  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("closed", () => (mainWindow = null));

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  if (startUrl) void mainWindow.loadURL(startUrl).catch((error) => console.error("[diffusion-studio] failed to load renderer:", error));
  return mainWindow;
}

function buildAppMenu() {
  const template = [
    {
      label: "Diffusion Studio",
      submenu: [
        { role: "about", label: "About Diffusion Studio" },
        { type: "separator" },
        { role: "hide", label: "Hide Diffusion Studio" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit", label: "Quit Diffusion Studio" },
      ],
    },
    {
      label: "File",
      submenu: [
        {
          label: "New Project",
          accelerator: "CmdOrCtrl+N",
          click: () => mainWindow?.webContents.send("desktop:menu", { action: "new-project" }),
        },
        { type: "separator" },
        { role: "close" },
      ],
    },
    { label: "Edit", role: "editMenu" },
    {
      label: "View",
      submenu: [
        {
          label: "Toggle Controls",
          accelerator: "CmdOrCtrl+Shift+C",
          click: () => mainWindow?.webContents.send("desktop:menu", { action: "toggle-controls" }),
        },
        { type: "separator" },
        { role: "reload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    { label: "Window", role: "windowMenu" },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function main() {
  await app.whenReady();

  // Local services (MCP + REST + static renderer when packaged).
  const service = createServerOnce({ appRoot, isDev });
  const { port } = await service.listen();

  service.setOpenSceneHandler(({ project, scene }) => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.webContents.send("desktop:open-scene", { project, scene });
  });

  console.log(`[diffusion-studio] services on http://127.0.0.1:${port} (MCP: /mcp)`);

  buildAppMenu();

  if (isDev) {
    await createWindow(DEV_URL).loadURL(DEV_URL).catch((error) => console.error("[diffusion-studio] failed to load dev URL:", error));
  } else {
    // Packaged mode: the service server also serves the built renderer, so the
    // absolute "/scenes.json" and "/projects/..." URLs keep working under file://.
    await createWindow().loadURL(`http://127.0.0.1:${port}/`).catch((error) => console.error("[diffusion-studio] failed to load renderer:", error));
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(isDev ? DEV_URL : `http://127.0.0.1:${port}/`);
    }
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

void main();