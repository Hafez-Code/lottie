"use strict";

const { app, BrowserWindow, Menu, ipcMain, shell, nativeTheme, dialog, safeStorage } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { createServerOnce } = require("./server.cjs");

const isDev = !!process.env.VITE_DEV_SERVER_URL || process.env.DIFFUSION_DEV === "1";
const appRoot = path.join(__dirname, "..");
const DEV_URL = process.env.VITE_DEV_SERVER_URL || "http://localhost:3030";

let mainWindow = null;

// Local services (MCP + REST) are opt-in in dev and mandatory when packaged,
// where they also serve the renderer.
let service = null;
let servicePort = 0;
let workspaceDir;
let startingServices = null;

function createWindow(startUrl) {
  mainWindow = new BrowserWindow({
    title: "Studio ProMax",
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
      label: "Studio ProMax",
      submenu: [
        { role: "about", label: "About Studio ProMax" },
        { type: "separator" },
        { role: "hide", label: "Hide Studio ProMax" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit", label: "Quit Studio ProMax" },
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
    {
      label: "Local Services",
      submenu: [
        {
          label: service ? `Stop  ·  port ${servicePort}` : "Start",
          // A packaged build serves the renderer from this server, so there it
          // can only ever be running.
          enabled: isDev || !service,
          click: () => void toggleServices(),
        },
        { type: "separator" },
        {
          label: service ? `MCP  http://127.0.0.1:${servicePort}/mcp` : "MCP  —  not running",
          enabled: false,
        },
      ],
    },
    { label: "Window", role: "windowMenu" },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/** Snapshot of the local service server, mirrored to the renderer bridge. */
function serviceStatus() {
  return { running: !!service, port: servicePort, isDev };
}

/** Bind the service server on the first free port in its scan range. */
function startServices() {
  if (startingServices) return startingServices;
  if (service && servicePort) return Promise.resolve(serviceStatus());
  startingServices = startServicesNow().finally(() => { startingServices = null; });
  return startingServices;
}

async function startServicesNow() {
  if (service) return serviceStatus();
  const dataDir = app.getPath("userData");
  fs.mkdirSync(dataDir, { recursive: true });
  if (!workspaceDir) {
    const configFile = path.join(dataDir, "workspace.json");
    try { workspaceDir = JSON.parse(fs.readFileSync(configFile, "utf8")).projectsDir; } catch { /* First launch. */ }
    if (!workspaceDir || !fs.existsSync(workspaceDir)) {
      workspaceDir = isDev ? path.join(appRoot, "public", "projects") : path.join(dataDir, "projects");
      if (!fs.existsSync(workspaceDir)) {
        const seed = path.join(process.resourcesPath, "public", "projects");
        if (fs.existsSync(seed)) fs.cpSync(seed, workspaceDir, { recursive: true });
        else fs.mkdirSync(workspaceDir, { recursive: true });
      }
    }
  }
  let provider = null;
  const providerFile = path.join(dataDir, "provider.enc");
  if (safeStorage.isEncryptionAvailable()) {
    try { provider = JSON.parse(safeStorage.decryptString(fs.readFileSync(providerFile))); } catch { /* No saved key. */ }
  }
  const instance = createServerOnce({ appRoot, isDev, dataDir, workspaceDir, rendererOrigin: isDev ? new URL(DEV_URL).origin : undefined,
    getProvider: () => provider,
    setProvider: (next) => {
      if (!safeStorage.isEncryptionAvailable()) throw new Error("Secure credential storage is unavailable on this computer.");
      fs.writeFileSync(providerFile, safeStorage.encryptString(JSON.stringify(next)), { mode: 0o600 });
      provider = next;
    },
  });
  service = instance;
  try {
    servicePort = (await instance.listen()).port;
  } catch (error) {
    service = null;
    servicePort = 0;
    throw error;
  }

  instance.setOpenSceneHandler(({ project, scene }) => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.webContents.send("desktop:open-scene", { project, scene });
  });

  console.log(`[diffusion-studio] services on http://127.0.0.1:${servicePort} (MCP: /mcp)`);
  buildAppMenu();
  return serviceStatus();
}

/** Stop listening so the port is free for another instance or the CLI. */
async function stopServices() {
  if (startingServices) await startingServices;
  if (!service) return serviceStatus();
  const instance = service;
  service = null;
  servicePort = 0;
  await instance.close();
  console.log("[diffusion-studio] local services stopped");
  buildAppMenu();
  return serviceStatus();
}

async function toggleServices() {
  return service ? stopServices() : startServices();
}

async function main() {
  await app.whenReady();

  ipcMain.handle("desktop:services:status", () => serviceStatus());
  ipcMain.handle("desktop:services:start", async () => {
    try {
      return await startServices();
    } catch (error) {
      return { ...serviceStatus(), error: error instanceof Error ? error.message : String(error) };
    }
  });
  ipcMain.handle("desktop:services:stop", () => stopServices());
  ipcMain.handle("desktop:workspace:choose", async () => {
    const result = await dialog.showOpenDialog(mainWindow, { title: "Choose projects folder", properties: ["openDirectory", "createDirectory"] });
    if (result.canceled || !result.filePaths[0]) return null;
    await startServices();
    const state = service.setWorkspace(result.filePaths[0]);
    workspaceDir = state.projectsDir;
    fs.writeFileSync(path.join(app.getPath("userData"), "workspace.json"), JSON.stringify(state));
    return state;
  });

  buildAppMenu();

  if (isDev) {
    // Dev: Vite hosts the renderer, so services stay off until asked for — the
    // Local Services menu, the Settings toggle, or DIFFUSION_SERVICES=1.
    if (process.env.DIFFUSION_SERVICES === "1") await startServices();
    await createWindow(DEV_URL).loadURL(DEV_URL).catch((error) => console.error("[diffusion-studio] failed to load dev URL:", error));
  } else {
    // Packaged mode: the service server also serves the built renderer, so the
    // absolute "/scenes.json" and "/projects/..." URLs keep working under file://.
    await startServices();
    await createWindow().loadURL(`http://127.0.0.1:${servicePort}/`).catch((error) => console.error("[diffusion-studio] failed to load renderer:", error));
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(isDev ? DEV_URL : `http://127.0.0.1:${servicePort}/`);
    }
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

void main();
