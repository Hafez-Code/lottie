#!/usr/bin/env node
/**
 * Studio ProMax CLI — gives agents and terminal users access to a running
 * Studio ProMax app over its local service server (see electron/server.cjs).
 *
 *   diffusion-studio connect [--agent id ...] [--all] [--remove]
 *   diffusion-studio status
 *   diffusion-studio projects list
 *   diffusion-studio projects create <name>
 *   diffusion-studio projects delete <slug>
 *   diffusion-studio scenes get <project> <scene> [-o out.json]
 *   diffusion-studio scenes open <project> <scene>
 *   diffusion-studio slots list <project> <scene>
 *   diffusion-studio slots set <project> <scene> <sid> [--text s | --number n | --color #rrggbb | --vec2 x,y]
 *
 * If the app isn't running, the CLI exits with a friendly hint.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { AGENTS } = require("../shared/agents.cjs");

const args = process.argv.slice(2);

/* ------------------------------------------------------------------ utils */

function die(message, hint) {
  console.error(`✗ ${message}`);
  if (hint) console.error(`  ${hint}`);
  process.exit(1);
}

/** Discover the running app: /api/status on the port range the server scans. */
async function findServer() {
  const explicit = process.env.DIFFUSION_PORT;
  const ports = explicit
    ? [Number(explicit)]
    : Array.from({ length: 24 }, (_, i) => 3274 + i);

  for (const port of ports) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/status`, { signal: AbortSignal.timeout(400) });
      if (!res.ok) continue;
      const status = await res.json();
      if (status?.app === "diffusion-studio") return { port, status };
    } catch {
      // not listening — keep scanning
    }
  }
  return null;
}

async function api(server, method, route, body) {
  const res = await fetch(`http://127.0.0.1:${server.port}${route}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status} on ${route}`);
  return data;
}

const value = (flag) => {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
};

/* ------------------------------------------------- agent config writers */

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function writeJsonConfig(file, mutator) {
  const config = readJson(file) ?? {};
  mutator(config);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(config, null, 2) + "\n");
}

function mcpEntry(url) {
  return { type: "http", url };
}

/** Apply one agent's config change. Returns a human description. */
function writeAgentConfig(agent, url, remove) {
  const file = agent.configPath;

  switch (agent.format) {
    case "claude-json": {
      // ~/.claude.json nests projects; add the server at the top level.
      writeJsonConfig(file, (config) => {
        config.mcpServers ??= {};
        if (remove) {
          delete config.mcpServers["diffusion-studio"];
        } else {
          config.mcpServers["diffusion-studio"] = mcpEntry(url);
        }
      });
      return file;
    }
    case "mcp-servers": {
      writeJsonConfig(file, (config) => {
        config.mcpServers ??= {};
        if (remove) {
          delete config.mcpServers["diffusion-studio"];
        } else {
          config.mcpServers["diffusion-studio"] = mcpEntry(url);
        }
      });
      return file;
    }
    case "vscode-servers": {
      writeJsonConfig(file, (config) => {
        config.servers ??= {};
        if (remove) {
          delete config.servers["diffusion-studio"];
        } else {
          config.servers["diffusion-studio"] = { type: "http", url };
        }
      });
      return file;
    }
    case "opencode": {
      writeJsonConfig(file, (config) => {
        config.mcp ??= {};
        if (remove) {
          delete config.mcp["diffusion-studio"];
        } else {
          config.mcp["diffusion-studio"] = { type: "remote", url };
        }
      });
      return file;
    }
    case "toml": {
      // Minimal [mcp_servers.diffusion-studio] block for ~/.codex/config.toml.
      fs.mkdirSync(path.dirname(file), { recursive: true });
      let toml = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
      const header = "[mcp_servers.diffusion-studio]";
      const block = `${header}\nurl = "${url}"\n`;
      if (remove) {
        toml = toml.replace(new RegExp(`${header.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?(?=\\n\\[|$)`, "m"), "");
      } else if (!toml.includes(header)) {
        toml = toml.trimEnd() + "\n" + block;
      } else {
        toml = toml.replace(new RegExp(`${header.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?(?=\\n\\[|$)`, "m"), block);
      }
      fs.writeFileSync(file, toml);
      return file;
    }
    default:
      throw new Error(`Unknown config format: ${agent.format}`);
  }
}

/* -------------------------------------------------------------- commands */

async function cmdConnect() {
  const server = await findServer();
  if (!server) die("Studio ProMax is not running.", "Start the desktop app first, then retry.");

  const remove = args.includes("--remove");
  const all = args.includes("--all");
  const agentFlags = args.flatMap((arg, index) => {
    if (arg !== "--agent" && arg !== "-a") return [];
    return [args[index + 1]];
  }).filter(Boolean);

  const detected = server.status.agentsInstalled ?? {};
  const enabledIds = Object.entries(server.status.agents ?? {})
    .filter(([, enabled]) => enabled)
    .map(([id]) => id);

  // Only touch agents actually installed on this machine, unless the caller
  // explicitly asks for `--all` or names agents with `--agent`.
  const notDetected = enabledIds.filter((id) => detected[id] === false);
  const installedEnabled = enabledIds.filter((id) => detected[id] !== false);

  const selected = all
    ? AGENTS.map((a) => a.id)
    : agentFlags.length > 0
      ? agentFlags
      : installedEnabled;

  const url = server.status.mcp;
  console.log(`Server: ${url}\n`);
  if (!all && agentFlags.length === 0 && notDetected.length > 0) {
    console.log(
      `Skipping ${notDetected.length} agent${notDetected.length === 1 ? "" : "s"} not detected on this machine: ${notDetected.join(", ")}\n`,
    );
  }

  let connected = 0;
  for (const agent of AGENTS) {
    if (!selected.includes(agent.id)) continue;
    try {
      const file = writeAgentConfig(agent, url, remove);
      console.log(`✓ ${agent.label.padEnd(20)} ${remove ? "removed from" : "→"} ${file}`);
      connected += 1;
    } catch (error) {
      console.warn(`✗ ${agent.label.padEnd(20)} ${error instanceof Error ? error.message : error}`);
    }
  }

  console.log(`\n${connected} agent config${connected === 1 ? "" : "s"} ${remove ? "cleaned" : "updated"}.`);
  if (selected.length === 0 && !all && agentFlags.length === 0) {
    console.log("\nNo detected agents are enabled in the app's Settings → MCP & CLI.");
    console.log("Tip: `diffusion-studio connect --all` writes every agent's config, or enable the ones you want in the app.");
  }
}

async function cmdStatus() {
  const server = await findServer();
  if (!server) die("Studio ProMax is not running.", "Start the desktop app first, then retry.");
  const s = server.status;
  console.log(`Studio ProMax ${s.version} (dev: ${s.dev ? "yes" : "no"})`);
  console.log(`Port:        ${s.port}`);
  console.log(`MCP:         ${s.mcp}`);
  console.log(`Projects:    ${s.projectsDir}`);
  console.log(`Running since ${s.startedAt}`);
  const enabled = Object.entries(s.agents).filter(([, v]) => v).map(([k]) => k);
  console.log(`Agents on:   ${enabled.length ? enabled.join(", ") : "none"}`);
  const detected = Object.entries(s.agentsInstalled ?? {}).filter(([, v]) => v).map(([k]) => k);
  console.log(`Detected:    ${detected.length ? detected.join(", ") : "none"}`);
}

async function cmdProjects(action) {
  const server = await findServer();
  if (!server) die("Studio ProMax is not running.", "Start the desktop app first, then retry.");

  if (action === "list" || !action) {
    const tree = await api(server, "GET", "/api/projects");
    for (const project of tree.projects) {
      console.log(`• ${project.slug}  (${project.scenes.length} scene${project.scenes.length === 1 ? "" : "s"})`);
      for (const scene of project.scenes) console.log(`    ${scene.slug}`);
    }
    if (tree.projects.length === 0) console.log("No projects yet.");
    return;
  }

  if (action === "create") {
    const name = args[args.indexOf("create") + 1] ?? "Untitled project";
    const created = await api(server, "POST", "/api/projects", { name });
    console.log(`✓ created ${created.project} (scene: ${created.scene})`);
    return;
  }

  if (action === "delete") {
    const slug = args[args.indexOf("delete") + 1];
    if (!slug) die("Usage: diffusion-studio projects delete <slug>");
    await api(server, "DELETE", "/api/projects", { project: slug });
    console.log(`✓ deleted ${slug}`);
    return;
  }

  die(`Unknown action: ${action}`);
}

async function cmdScenes(action) {
  const server = await findServer();
  if (!server) die("Studio ProMax is not running.", "Start the desktop app first, then retry.");

  const rest = args.slice(args.indexOf(action ?? "") + 1).filter(Boolean);

  if (action === "get") {
    const [project, scene] = rest;
    if (!project || !scene) die("Usage: diffusion-studio scenes get <project> <scene> [-o out.json]");
    const data = await api(server, "GET", `/api/scenes/${encodeURIComponent(project)}/${encodeURIComponent(scene)}`);
    const output = value("-o");
    if (output) {
      fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
      fs.writeFileSync(output, JSON.stringify(data, null, 2) + "\n");
      console.log(`✓ wrote ${output}`);
    } else {
      console.log(JSON.stringify(data, null, 2));
    }
    return;
  }

  if (action === "open") {
    const [project, scene] = rest;
    if (!project || !scene) die("Usage: diffusion-studio scenes open <project> <scene>");
    await api(server, "POST", "/api/open", { project, scene });
    console.log(`✓ opened ${project}/${scene}`);
    return;
  }

  die(`Unknown action: ${action}`);
}

async function cmdSlots(action) {
  const server = await findServer();
  if (!server) die("Studio ProMax is not running.", "Start the desktop app first, then retry.");
  const rest = args.slice(args.indexOf("list") >= 0 ? args.indexOf("list") : args.indexOf("set") + 1).filter(Boolean);

  if (action === "list") {
    const [project, scene] = args.slice(args.indexOf("list") + 1);
    if (!project || !scene) die("Usage: diffusion-studio slots list <project> <scene>");
    const { slots } = await api(server, "GET", `/api/slots?project=${encodeURIComponent(project)}&scene=${encodeURIComponent(scene)}`);
    if (!slots?.length) {
      console.log("No slots (or no controls.json) for this scene.");
      return;
    }
    for (const slot of slots) {
      const preview = typeof slot.value === "string" ? slot.value : JSON.stringify(slot.value);
      console.log(`• ${slot.sid}${slot.label ? `  (${slot.label})` : ""}  =  ${preview}`);
    }
    return;
  }

  if (action === "set") {
    const [project, scene, sid] = args.slice(args.indexOf("set") + 1, args.indexOf("set") + 4);
    if (!project || !scene || !sid) die("Usage: diffusion-studio slots set <project> <scene> <sid> [--text s | --number n | --color #rrggbb | --vec2 x,y]");
    const slotValue =
      value("--text") ?? value("--string") ??
      (value("--number") !== undefined ? Number(value("--number")) : undefined) ??
      value("--color") ??
      (value("--vec2") !== undefined ? value("--vec2").split(",").map(Number) : undefined);
    if (slotValue === undefined) die("Provide one of --text/--number/--color/--vec2");
    await api(server, "POST", "/api/slots", { project, scene, sid, value: slotValue });
    console.log(`✓ ${sid} updated`);
    return;
  }

  die(`Unknown action: ${action}`);
}

async function cmdInspect(action) {
  const [project, scene] = args.slice(args.indexOf(action) + 1);
  if (!project || !scene) die(`Usage: diffusion-studio scenes ${action} <project> <scene>`);
  const server = await findServer();
  if (!server) die("Studio ProMax is not running.", "Start the desktop app first, then retry.");
  const result = await api(server, "POST", "/mcp", {
    jsonrpc: "2.0", id: 1, method: "tools/call", params: {
      name: action === "capture" ? "capture_scene_frames" : "check_scene",
      arguments: { project, scene, ...(value("--frames") !== undefined ? { frames: value("--frames").split(",").map(Number) } : {}) },
    },
  });
  if (result.error || result.result?.isError) throw new Error(result.error?.message ?? result.result.content?.[0]?.text ?? "Tool failed");
  console.log(JSON.stringify(result.result.structuredContent, null, 2));
  if (action === "check" && result.result.structuredContent.issues?.some((issue) => issue.severity === "error")) process.exitCode = 1;
}

const USAGE = `
diffusion-studio — control a running Studio ProMax app from the terminal

  diffusion-studio connect [--all] [--agent <id>...] [--remove]
      Write the MCP server entry into each agent's config file. Defaults to the
      agents enabled in Settings → MCP & CLI that are detected as installed here.

  diffusion-studio status
  diffusion-studio projects list | create <name> | delete <slug>
  diffusion-studio scenes get <project> <scene> [-o out.json] | open <project> <scene>
  diffusion-studio scenes capture <project> <scene> [--frames 0,30,59]
  diffusion-studio scenes check <project> <scene>
  diffusion-studio slots list <project> <scene>
  diffusion-studio slots set <project> <scene> <sid> [--text s | --number n | --color #rrggbb | --vec2 x,y]

Agent ids: ${AGENTS.map((a) => a.id).join(", ")}
`.trim();

/* ------------------------------------------------------------------ main */

const [command, ...commandArgs] = args;

try {
  switch (command) {
    case "connect": void cmdConnect(); break;
    case "status": void cmdStatus(); break;
    case "projects": void cmdProjects(commandArgs[0]); break;
    case "scenes": if (["capture", "check"].includes(commandArgs[0])) await cmdInspect(commandArgs[0]); else await cmdScenes(commandArgs[0]); break;
    case "slots": void cmdSlots(commandArgs[0]); break;
    case "help":
    case "--help":
    case "-h":
    case undefined:
      console.log(USAGE);
      break;
    default:
      die(`Unknown command: ${command}`, "Run `diffusion-studio help`.");
  }
} catch (error) {
  die(error instanceof Error ? error.message : String(error));
}
