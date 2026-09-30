import { onCleanup, onMount } from "solid-js";
import { useNavigate } from "@solidjs/router";

/**
 * Bridges the Electron main process into the router:
 * - agents/CLI opening a scene ("desktop:open-scene")
 * - native menu commands ("desktop:menu")
 * No-ops in the plain browser build.
 */

interface DesktopBridge {
  isDesktop(): boolean;
  onOpenScene(callback: (payload: { project: string; scene: string }) => void): void;
  onMenu(callback: (payload: { action: string }) => void): void;
}

declare global {
  interface Window {
    DiffusionDesktop?: DesktopBridge;
  }
}

export function isDesktop(): boolean {
  return typeof window !== "undefined" && !!window.DiffusionDesktop;
}

export function DesktopBridgeListener() {
  const navigate = useNavigate();

  onMount(() => {
    const bridge = window.DiffusionDesktop;
    if (!bridge) return;
    bridge.onOpenScene(({ project, scene }) => navigate(`/${project}/${scene}`));
    onCleanup(() => {
      // ipcRenderer listeners live for the window lifetime; nothing to detach.
    });
  });

  return null;
}