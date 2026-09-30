"use strict";

const { contextBridge, ipcRenderer } = require("electron");

/**
 * Renderer bridge. Kept intentionally tiny: the UI is a normal web app, and
 * only these two capabilities are exposed.
 *   diffusionDesktop.isDesktop()              -> true when inside Electron
 *   diffusionDesktop.onOpenScene(callback)    -> agent/CLI opens a scene
 *   diffusionDesktop.onMenu(callback)         -> native menu commands
 */
contextBridge.exposeInMainWorld("diffusionDesktop", {
  isDesktop: () => true,
  onOpenScene: (callback) => {
    ipcRenderer.on("desktop:open-scene", (_event, payload) => callback(payload));
  },
  onMenu: (callback) => {
    ipcRenderer.on("desktop:menu", (_event, payload) => callback(payload));
  },
});