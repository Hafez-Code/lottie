"use strict";

const { contextBridge, ipcRenderer } = require("electron");

/**
 * Renderer bridge. Kept intentionally tiny: the UI is a normal web app, and
 * only these capabilities are exposed.
 *   diffusionDesktop.isDesktop()              -> true when inside Electron
 *   diffusionDesktop.onOpenScene(callback)    -> agent/CLI opens a scene
 *   diffusionDesktop.onMenu(callback)         -> native menu commands
 *   diffusionDesktop.services                 -> start/stop the local MCP server
 */
contextBridge.exposeInMainWorld("diffusionDesktop", {
  isDesktop: () => true,
  chooseWorkspace: () => ipcRenderer.invoke("desktop:workspace:choose"),
  onOpenScene: (callback) => {
    ipcRenderer.on("desktop:open-scene", (_event, payload) => callback(payload));
  },
  onMenu: (callback) => {
    ipcRenderer.on("desktop:menu", (_event, payload) => callback(payload));
  },
  services: {
    status: () => ipcRenderer.invoke("desktop:services:status"),
    start: () => ipcRenderer.invoke("desktop:services:start"),
    stop: () => ipcRenderer.invoke("desktop:services:stop"),
  },
});
