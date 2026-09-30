import { createSignal, Show, onMount, type Component, For } from "solid-js";
import { Copy, Terminal } from "lucide-solid";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { useAccount } from "@/context/account";

const AGENTS: { id: string; label: string }[] = [
  { id: "claude-code", label: "Claude Code" },
  { id: "claude-desktop", label: "Claude Desktop" },
  { id: "cursor", label: "Cursor" },
  { id: "vscode-copilot", label: "VS Code (Copilot)" },
  { id: "codex", label: "Codex" },
  { id: "antigravity", label: "Antigravity" },
  { id: "gemini-cli", label: "Gemini CLI" },
  { id: "devin-windsurf", label: "Devin (Windsurf)" },
  { id: "opencode", label: "OpenCode" },
];

const CLI_COMMANDS = [
  "npx diffusion-studio connect --all",
  "npx diffusion-studio status",
  "npx diffusion-studio projects list",
  "npx diffusion-studio scenes open main-project scene-1",
];

interface ServerStatus {
  port: number;
  mcp: string;
  dev: boolean;
  /** Which agents were auto-detected as installed on this machine. */
  agentsInstalled?: Record<string, boolean>;
}

export const McpPage: Component = () => {
  const account = useAccount();
  const { toast } = useToast();

  // Live status when the desktop app hosts the page; the plain dev-server
  // build falls back to the default port the desktop app uses.
  const [status, setStatus] = createSignal<ServerStatus | null>(null);
  onMount(async () => {
    try {
      const res = await fetch("/api/status");
      if (res.ok) setStatus((await res.json()) as ServerStatus);
    } catch {
      // no local services (plain `vite` without Electron) — keep the fallback
    }
  });

  const mcpUrl = () => status()?.mcp ?? "http://127.0.0.1:3274/mcp";
  const serverLive = () => status() != null;
  // Detection is done by the service server; the app itself never runs a model —
  // it just exposes MCP to whichever agent is already installed.
  const isDetected = (id: string) => status()?.agentsInstalled?.[id] === true;
  const detectedCount = () => AGENTS.filter((a) => isDetected(a.id)).length;

  const enabledCount = () => AGENTS.filter((a) => account.state().agents[a.id]).length;
  const allEnabled = () => enabledCount() === AGENTS.length;

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(`${label} copied to clipboard.`);
    } catch {
      toast("Could not access the clipboard.");
    }
  };

  // Persist the toggles so the CLI's `connect` reads exactly these agents
  // from /api/status.
  const syncAgentsToServer = (next: Record<string, boolean>) => {
    if (!serverLive()) return;
    void fetch("/api/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agents: next }),
    }).catch(() => void 0);
  };

  const setAgent = (id: string, checked: boolean) => {
    account.setAgent(id, checked);
    syncAgentsToServer({ ...account.state().agents, [id]: checked });
  };

  const setAllAgents = (checked: boolean) => {
    account.enableAllAgents(checked);
    syncAgentsToServer(Object.fromEntries(AGENTS.map((a) => [a.id, checked])));
    toast(checked ? "All agents enabled." : "All agents disabled.");
  };

  return (
    <div class="mx-auto w-full max-w-3xl px-10 py-10">
      {/* Agents */}
      <div class="mb-1 flex items-baseline justify-between">
        <h2 class="text-foreground text-sm font-strong">Agents</h2>
        <button
          type="button"
          class="text-muted-foreground hover:text-foreground text-xxs"
          onClick={() => setAllAgents(!allEnabled())}
        >
          {allEnabled() ? "Disable all" : "Enable all"}
        </button>
      </div>
      <p class="text-muted-foreground mb-4 text-xxs">
        Diffusion Studio connects straight to your coding agent over MCP — no model to pick, the agent
        brings its own. Agents installed on this machine are detected automatically.
        <Show when={serverLive()}>
          {" "}Running on port {status()!.port} · {detectedCount()} of {AGENTS.length} detected.
        </Show>
      </p>

      <div class="divide-border bg-card ring-foreground/5 mb-10 flex flex-col divide-y rounded-xl ring-1">
        <For each={AGENTS}>
          {(agent) => (
            <div class="flex items-center gap-3 px-4 py-2.5">
              <span class="bg-secondary/70 flex size-7 items-center justify-center rounded-md text-xxs font-strong">
                {agent.label.slice(0, 2).toUpperCase()}
              </span>
              <span class="text-foreground flex-1 text-xxs">{agent.label}</span>
              <Show when={isDetected(agent.id)}>
                <span
                  class="bg-success-accent text-success-accent-foreground rounded-full px-2 py-0.5 text-xxs font-strong"
                  title="Installed on this machine"
                >
                  Detected
                </span>
              </Show>
              <Switch
                checked={account.state().agents[agent.id]}
                onChange={(checked: boolean) => setAgent(agent.id, checked)}
                aria-label={`Enable ${agent.label}`}
              />
            </div>
          )}
        </For>
      </div>

      {/* MCP server */}
      <h2 class="text-foreground mb-4 text-sm font-strong">MCP Server</h2>
      <div class="bg-card ring-foreground/5 mb-2 flex items-center gap-3 rounded-xl px-4 py-3 ring-1">
        <span class="bg-muted flex size-8 items-center justify-center rounded-md text-xxs">⚡</span>
        <div class="flex flex-1 flex-col">
          <span class="text-foreground text-xxs font-strong">Diffusion Studio MCP</span>
          <span class="text-muted-foreground text-xxs">
            Connect any other agent that supports MCP over Streamable HTTP.
          </span>
        </div>
        <span
          class="size-2 rounded-full bg-success-accent"
          classList={{ "bg-muted-foreground/40": !serverLive() }}
          title={serverLive() ? "Server running" : "Start the desktop app to enable this"}
        />
        <code class="bg-muted text-muted-foreground rounded-md px-2 py-1 text-xxs">{mcpUrl()}</code>
        <Button variant="outline" size="sm" onClick={() => copy(mcpUrl(), "MCP URL")}>
          <Copy /> Copy URL
        </Button>
      </div>
      <p class="text-muted-foreground mb-10 text-xxs">
        Available locally while Diffusion Studio is running. <span class="text-primary underline">What is MCP?</span>
      </p>

      {/* CLI */}
      <h2 class="text-foreground mb-4 text-sm font-strong">CLI</h2>
      <p class="text-muted-foreground mb-3 text-xxs">
        Give agents access to Diffusion Studio through terminal commands.
      </p>
      <div class="divide-border bg-card ring-foreground/5 mb-3 flex flex-col divide-y rounded-xl ring-1">
        <For each={CLI_COMMANDS}>
          {(command) => (
            <div class="flex items-center gap-3 px-4 py-2.5">
              <Terminal class="text-muted-foreground size-4 shrink-0" />
              <code class="text-foreground flex-1 text-xxs">{command}</code>
              <Button variant="outline" size="sm" onClick={() => copy(command, "Command")}>
                <Copy /> Copy
              </Button>
            </div>
          )}
        </For>
      </div>
      <p class="text-muted-foreground text-xxs">
        Run these from the repo root (the <code>diffusion-studio</code> bin lives there), or run{" "}
        <code>npm link</code> once to make it global.
      </p>
    </div>
  );
};