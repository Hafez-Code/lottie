import { onCleanup, onMount } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { useUI } from "@/context/ui";

/**
 * Bridges the Electron main process into the router:
 * - agents/CLI opening a scene ("desktop:open-scene")
 * - native menu commands ("desktop:menu")
 * No-ops in the plain browser build.
 */

interface DesktopBridge {
  isDesktop(): boolean;
  chooseWorkspace(): Promise<{ projectsDir: string } | null>;
  onOpenScene(callback: (payload: { project: string; scene: string }) => void): void;
  onMenu(callback: (payload: { action: string }) => void): void;
  /** Start/stop the local MCP + REST server hosted by the main process. */
  services?: {
    status(): Promise<ServiceStatus>;
    start(): Promise<ServiceStatus>;
    stop(): Promise<ServiceStatus>;
  };
}

export interface ServiceStatus {
  running: boolean;
  port: number;
  isDev: boolean;
  error?: string;
}

declare global {
  interface Window {
    // Must match contextBridge.exposeInMainWorld("diffusionDesktop", ...).
    diffusionDesktop?: DesktopBridge;
  }
}

export function isDesktop(): boolean {
  return typeof window !== "undefined" && !!window.diffusionDesktop;
}

export function DesktopBridgeListener() {
  const navigate = useNavigate();
  const { toggleControls } = useUI();

  onMount(() => {
    const bridge = window.diffusionDesktop;
    if (!bridge) return;
    bridge.onOpenScene(({ project, scene }) => navigate(`/${project}/${scene}`));
    bridge.onMenu(({ action }) => {
      if (action === "new-project") navigate("/");
      if (action === "toggle-controls") toggleControls();
    });
    onCleanup(() => {
      // ipcRenderer listeners live for the window lifetime; nothing to detach.
    });
  });

  return null;
}
