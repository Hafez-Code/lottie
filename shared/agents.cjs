"use strict";

/**
 * Registry of the agent integrations shown in Settings → MCP & CLI.
 * Shared between the Electron app (status endpoint) and the CLI
 * (so `diffusion-studio connect` writes exactly the enabled ones).
 *
 * Each entry needs the streamable-HTTP MCP URL written into the agent's
 * config file. Config formats that use JSON merge the `mcpServers` object;
 * Codex uses TOML, so it has a custom `toml` writer (see the CLI).
 */

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const HOME = os.homedir();

const AGENTS = [
  {
    id: "claude-code",
    label: "Claude Code",
    configPath: path.join(HOME, ".claude.json"),
    format: "claude-json", // top-level mcpServers in ~/.claude.json
  },
  {
    id: "claude-desktop",
    label: "Claude Desktop",
    configPath: path.join(HOME, "Library", "Application Support", "Claude", "claude_desktop_config.json"),
    format: "mcp-servers",
  },
  {
    id: "cursor",
    label: "Cursor",
    configPath: path.join(HOME, ".cursor", "mcp.json"),
    format: "mcp-servers",
  },
  {
    id: "vscode-copilot",
    label: "VS Code (Copilot)",
    // Workspace-level config the CLI runs inside is preferred when present;
    // fall back to the user-level profile directory.
    configPath: process.env.DIFFUSION_VSCODE_MCP || path.join(HOME, ".vscode", "mcp.json"),
    format: "vscode-servers",
  },
  {
    id: "codex",
    label: "Codex",
    configPath: path.join(HOME, ".codex", "config.toml"),
    format: "toml",
  },
  {
    id: "antigravity",
    label: "Antigravity",
    configPath: path.join(HOME, ".gemini", "settings.json"),
    format: "mcp-servers",
  },
  {
    id: "gemini-cli",
    label: "Gemini CLI",
    configPath: path.join(HOME, ".gemini", "settings.json"),
    format: "mcp-servers",
  },
  {
    id: "devin-windsurf",
    label: "Devin (Windsurf)",
    configPath: path.join(HOME, ".codeium", "windsurf", "mcp_config.json"),
    format: "mcp-servers",
  },
  {
    id: "opencode",
    label: "OpenCode",
    configPath: path.join(HOME, ".config", "opencode", "opencode.json"),
    format: "opencode",
  },
];

/**
 * PATH binaries and filesystem markers used to auto-detect whether an agent is
 * actually installed on this machine. `paths` are relative to HOME.
 */
const DETECT = {
  "claude-code": { bins: ["claude"], paths: [".claude.json", ".claude"] },
  "claude-desktop": { bins: [], paths: ["Library/Application Support/Claude"] },
  cursor: { bins: ["cursor"], paths: [".cursor"] },
  "vscode-copilot": { bins: ["code"], paths: [".vscode"] },
  codex: { bins: ["codex"], paths: [".codex"] },
  antigravity: { bins: [], paths: [".gemini"] },
  "gemini-cli": { bins: ["gemini"], paths: [".gemini"] },
  "devin-windsurf": { bins: [], paths: [".codeium/windsurf"] },
  opencode: { bins: ["opencode"], paths: [".config/opencode"] },
};

/** True when one of `names` resolves to an executable on PATH. */
function findExecutable(names) {
  const dirs = [...new Set([
    ...(process.env.PATH ?? "").split(path.delimiter).filter(Boolean),
    path.join(HOME, ".local", "bin"), path.join(HOME, ".opencode", "bin"),
    "/opt/homebrew/bin", "/usr/local/bin",
  ])];
  const candidates =
    process.platform === "win32"
      ? names.flatMap((name) => [`${name}.cmd`, `${name}.exe`, name])
      : names;
  for (const bin of candidates) {
    for (const dir of dirs) {
      try {
        const file = path.join(dir, bin);
        fs.accessSync(file, fs.constants.X_OK);
        if (fs.statSync(file).isFile()) return file;
      } catch {
        // Try the next installation location.
      }
    }
  }
  return null;
}

/**
 * Auto-detect the agents installed on this machine: an agent counts as
 * installed when its config file exists, a marker path under HOME is present,
 * or its CLI binary is on PATH.
 *
 * The app never runs a model itself — it talks to whichever agent is already
 * installed over MCP — so this is the only signal the UI needs.
 *
 * Returns { [agentId]: boolean }.
 */
function detectInstalledAgents() {
  return Object.fromEntries(
    AGENTS.map((agent) => {
      const hint = DETECT[agent.id] ?? { bins: [], paths: [] };
      const candidates = [agent.configPath, ...hint.paths.map((p) => path.join(HOME, p))];
      const installed =
        candidates.some((file) => fs.existsSync(file)) || !!findExecutable(hint.bins);
      return [agent.id, installed];
    }),
  );
}

const RUNNABLE_AGENTS = [
  { id: "codex", label: "Codex", bin: "codex" },
  { id: "claude-code", label: "Claude Code", bin: "claude" },
  { id: "opencode", label: "OpenCode", bin: "opencode" },
];

function discoverRunners() {
  const detected = detectInstalledAgents();
  return RUNNABLE_AGENTS.map(({ id, label, bin }) => ({
    id, label, detected: !!detected[id], executable: !!findExecutable([bin]),
    status: findExecutable([bin]) ? "available" : detected[id] ? "configuration-only" : "not-installed",
  }));
}

module.exports = { AGENTS, detectInstalledAgents, findExecutable, discoverRunners, RUNNABLE_AGENTS };
