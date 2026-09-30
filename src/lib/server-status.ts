import { createSignal } from "solid-js";
import { isDesktop } from "@/lib/desktop";

/** Live local-service status (port + MCP URL) when the desktop app is running. */
export function useServerStatus() {
  const [status, setStatus] = createSignal<{
    port: number;
    mcp: string;
    dev: boolean;
    dev_port?: number;
  } | null>(null);

  if (!isDesktop()) return { status };

  void fetch("/api/status")
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => setStatus(data))
    .catch(() => setStatus(null));

  return { status };
}