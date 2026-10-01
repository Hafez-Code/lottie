"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { spawn } = require("node:child_process");
const { findExecutable, discoverRunners, RUNNABLE_AGENTS } = require("../../shared/agents.cjs");
const { runApi } = require("./api-provider.cjs");
const { writeSceneBrief } = require("./scenes-lib.cjs");

const OUTPUT_LIMIT = 120_000;

function eventText(agent, event) {
  if (agent === "codex") {
    if (event.type === "item.completed" && event.item?.type === "agent_message") return event.item.text;
    if (event.type === "error" || event.type === "turn.failed") throw new Error(event.message ?? event.error?.message ?? "Codex run failed");
  }
  if (agent === "claude-code") {
    if (event.type === "assistant") return (event.message?.content ?? []).filter((c) => c.type === "text").map((c) => c.text).join("\n");
    if (event.type === "result") {
      if (event.is_error) throw new Error(event.result || (event.errors ?? []).join("\n") || "Claude run failed");
      return event.result;
    }
  }
  if (agent === "opencode") {
    if (event.type === "text") return event.part?.text;
    if (event.type === "error") throw new Error(event.error?.data?.message ?? event.error?.message ?? "OpenCode run failed");
  }
  return null;
}

function runnerArgs(id, prompt, images = [], baseUrl = "") {
  if (id === "codex") return ["exec", "--json", "--skip-git-repo-check", "--sandbox", "workspace-write", ...(baseUrl ? ["-c", `mcp_servers.diffusion-studio.url=${JSON.stringify(baseUrl + "/mcp")}`] : []), ...images.flatMap((file) => ["--image", file]), "-"];
  if (id === "claude-code") return ["-p", "--output-format", "stream-json", "--verbose", "--allowedTools", "Read,Edit,Write,Glob,Grep,mcp__diffusion-studio__capture_scene,mcp__diffusion-studio__capture_scene_frames,mcp__diffusion-studio__check_scene", ...(baseUrl ? ["--mcp-config", JSON.stringify({ mcpServers: { "diffusion-studio": { type: "http", url: baseUrl + "/mcp" } } })] : []), prompt];
  if (id === "opencode") return ["run", "--format", "json", prompt];
  throw new Error("Unsupported agent");
}

function createChatService({ projectsDir, spawnProcess = spawn, discover = discoverRunners, resolveExecutable = findExecutable, getBaseUrl = () => "", allowedOrigin, getProvider = () => null, setProvider = () => { throw new Error("API configuration is unavailable"); }, runApiImpl = runApi }) {
  const running = new Map();
  const sessions = new Map();
  const captures = new Map();

  function requestCapture(project, scene, frame = 0, frames) {
    sceneDir(project, scene);
    if (!Number.isFinite(frame) || frame < 0) throw new Error("Invalid preview frame");
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { captures.delete(id); reject(new Error("Open this scene in the app to render a preview.")); }, 20000);
      captures.set(id, { id, project, scene, frame, frames, resolve, reject, timer });
    });
  }

  function requestFilmstrip(project, scene, frames) {
    const doc = JSON.parse(fs.readFileSync(path.join(sceneDir(project, scene), "lottie.json"), "utf8"));
    const count = Math.ceil(doc.op - doc.ip);
    if (!Number.isFinite(count) || count < 1) throw new Error("Invalid scene duration");
    const positions = frames ?? [...new Set([0, Math.floor((count - 1) / 2), count - 1])];
    if (!Array.isArray(positions) || positions.length < 1 || positions.length > 12 || positions.some((f) => !Number.isInteger(f) || f < 0 || f >= count)) throw new Error("Expected 1–12 integer frames within the scene duration (relative to the first frame)");
    return requestCapture(project, scene, positions[0], positions);
  }

  function pendingCaptures(project, scene) {
    return [...captures.values()].filter((job) => job.project === project && job.scene === scene).map(({ id, frame, frames }) => ({ id, frame, ...(frames ? { frames } : {}) }));
  }

  function finishCapture({ id, project, scene, dataUrl, error }) {
    const job = captures.get(id);
    if (!job || job.project !== project || job.scene !== scene) throw new Error("Preview request expired");
    try {
      if (error) {
        job.reject(new Error(String(error)));
      } else {
        preview(project, scene, dataUrl);
        const dir = path.join(sceneDir(project, scene), ".studio", "captures");
        fs.mkdirSync(dir, { recursive: true });
        const file = path.join(dir, `${id}.png`);
        fs.writeFileSync(file, Buffer.from(dataUrl.split(",")[1], "base64"));
        job.resolve({ project, scene, frame: job.frame, ...(job.frames ? { frames: job.frames } : {}), path: file, dataUrl });
      }
    } catch (failure) {
      job.reject(failure);
      throw failure;
    } finally {
      captures.delete(id);
      clearTimeout(job.timer);
    }
    return { ok: true };
  }

  function sceneDir(project, scene) {
    if (![project, scene].every((s) => typeof s === "string" && /^[\w-]+$/.test(s))) throw new Error("Invalid project or scene");
    let root, dir;
    try {
      root = fs.realpathSync(projectsDir);
      dir = fs.realpathSync(path.join(root, project, scene));
    } catch {
      throw new Error("Scene not found");
    }
    if (!dir.startsWith(root + path.sep) || !fs.existsSync(path.join(dir, "lottie.json"))) throw new Error("Scene not found");
    return dir;
  }

  function load(project, scene) {
    const dir = sceneDir(project, scene);
    if (sessions.has(dir)) return sessions.get(dir);
    let data = { messages: [], run: null };
    const file = path.join(dir, ".studio", "chat.json");
    if (fs.existsSync(file)) {
      data = JSON.parse(fs.readFileSync(file, "utf8"));
      if (data.run?.status === "running") data.run = { ...data.run, status: "interrupted", error: "Application closed before the run finished." };
    } else if (fs.existsSync(path.join(dir, "brief.json"))) {
      const brief = JSON.parse(fs.readFileSync(path.join(dir, "brief.json"), "utf8"));
      data.messages.push({ id: randomUUID(), role: "user", text: brief.description, references: brief.images ?? [], createdAt: brief.createdAt });
    }
    sessions.set(dir, data);
    return data;
  }

  function save(dir, data) {
    const folder = path.join(dir, ".studio");
    fs.mkdirSync(folder, { recursive: true });
    const file = path.join(folder, "chat.json");
    fs.writeFileSync(file + ".tmp", JSON.stringify(data, null, 2));
    fs.renameSync(file + ".tmp", file);
  }

  function start({ project, scene, agent, text, images = [], useBrief = false, context = null }) {
    const dir = sceneDir(project, scene);
    if (running.has(dir)) throw new Error("An agent is already working on this scene");
    const runner = RUNNABLE_AGENTS.find((r) => r.id === agent);
    const executable = runner && resolveExecutable([runner.bin]);
    const provider = agent === "openai-api" ? getProvider() : null;
    if (!executable && !provider?.apiKey) throw new Error("Install and sign in to the selected agent CLI, or configure an API key.");
    const data = load(project, scene);
    if (useBrief && data.run?.status === "completed") throw new Error("This brief has already been submitted. Send a follow-up message instead.");
    if (!useBrief) {
      if (typeof text !== "string" || (!text.trim() && images.length === 0) || text.length > 20_000) throw new Error("Enter a message of up to 20,000 characters or attach a reference");
      if (!Array.isArray(images) || images.length > 16) throw new Error("Too many reference files");
      const id = randomUUID();
      const refs = images.length ? writeSceneBrief(path.join(dir, ".studio", id), { description: text, images }).images.map((name) => `.studio/${id}/${name}`) : [];
      data.messages.push({ id, role: "user", text: text.trim(), references: refs, context, createdAt: new Date().toISOString() });
    }
    if (!data.messages.some((m) => m.role === "user")) throw new Error("No brief to execute");
    const instruction = [
      "You are editing a Lottie animation in Studio ProMax. Work only in this scene directory.",
      "Read lottie.json, controls.json if present, and brief.json plus its reference files. Preserve unrelated work.",
      "Use CanvasKit/Skottie compatible Lottie. Save the animation to lottie.json. Put assets next to it.",
      "Controls use { controls: [{ sid, label, min, max, step }] }; animated slot values belong in the Lottie JSON slots object.",
      `Scene directory: ${dir}`,
      `Preview URL: ${getBaseUrl()}/${project}/${scene}`,
      `To inspect the newly edited animation, POST application/json {"project":"${project}","scene":"${scene}"} to ${getBaseUrl()}/api/chat/capture-frames (omit frame to sample beginning, middle and end). The app renders the current source and returns a local PNG path. Read that image. Inspect a few frames before declaring completion. This needs the scene open in the app.`,
      "If .studio/preview.png exists, inspect it as the user's current rendered frame. A saved JSON alone is not visual verification.",
      "Report what changed and honestly state whether you visually verified the result. Do not claim verification without viewing it.",
      "Conversation (user instructions below):",
      ...data.messages.slice(-20).map((m) => `${m.role}: ${m.text}${m.references?.length ? "\nReference files: " + m.references.join(", ") : ""}${m.context ? "\nScene context: " + JSON.stringify(m.context) : ""}`),
    ].join("\n\n");
    const imagePaths = data.messages.filter((m) => m.role === "user").slice(-1).flatMap((m) => m.references ?? []).filter((name) => /\.(png|jpg|webp)$/.test(name)).map((name) => path.join(dir, name));
    if (fs.existsSync(path.join(dir, ".studio", "preview.png"))) imagePaths.push(path.join(dir, ".studio", "preview.png"));
    const reply = { id: randomUUID(), role: "assistant", text: "", createdAt: new Date().toISOString() };
    data.messages.push(reply);
    data.run = { id: randomUUID(), agent, status: "running", startedAt: new Date().toISOString() };
    save(dir, data);
    if (provider) {
      const abort = new AbortController();
      const task = { kill: () => abort.abort() };
      running.set(dir, task);
      const timer = setTimeout(() => abort.abort(), 20 * 60_000);
      void runApiImpl({ config: provider, dir, prompt: instruction, signal: abort.signal, imagePaths, capture: () => requestFilmstrip(project, scene) }).then((text) => {
        reply.text = text;
        data.run.status = "completed";
      }).catch((error) => {
        data.run.status = abort.signal.aborted ? "cancelled" : "failed";
        data.run.error = abort.signal.aborted ? undefined : error.message;
      }).finally(() => {
        clearTimeout(timer); running.delete(dir); data.run.finishedAt = new Date().toISOString(); save(dir, data);
      });
      return data;
    }
    let child;
    try {
      child = spawnProcess(executable, runnerArgs(agent, instruction, imagePaths, getBaseUrl()), { cwd: dir, shell: false, stdio: ["pipe", "pipe", "pipe"], detached: process.platform !== "win32" });
    } catch (error) {
      data.run = { ...data.run, status: "failed", error: error.message };
      save(dir, data);
      return data;
    }
    running.set(dir, child);
    let pending = "";
    let stderr = "";
    let eventError = "";
    let finished = false;
    let flushTimer;
    const scheduleSave = () => {
      if (finished) return;
      if (!flushTimer) flushTimer = setTimeout(() => { flushTimer = null; save(dir, data); }, 250);
    };
    const parse = (line) => {
      if (!line.trim()) return;
      let event;
      try { event = JSON.parse(line); } catch { return; }
      try {
        const content = eventText(agent, event);
        if (content && content !== reply.text) {
          // Claude's result repeats the assistant message; it is authoritative.
          reply.text = (agent === "claude-code" && event.type === "result" ? content : [reply.text, content].filter(Boolean).join("\n\n")).slice(-OUTPUT_LIMIT);
          scheduleSave();
        }
      } catch (error) { eventError = error.message; }
    };
    child.stdout.on("data", (chunk) => {
      pending += chunk.toString();
      let index;
      while ((index = pending.indexOf("\n")) !== -1) { parse(pending.slice(0, index)); pending = pending.slice(index + 1); }
      if (pending.length > 2_000_000) { eventError = "Agent output exceeded the supported event size"; child.kill(); }
    });
    child.stderr.on("data", (chunk) => { stderr = (stderr + chunk.toString()).slice(-6000); });
    const finish = (status, error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      clearTimeout(flushTimer);
      parse(pending);
      running.delete(dir);
      const cancelled = data.run.status === "cancelling" && !eventError;
      data.run = { ...data.run, status: cancelled ? "cancelled" : eventError ? "failed" : status, finishedAt: new Date().toISOString(), error: cancelled ? undefined : (eventError || error || undefined) };
      save(dir, data);
    };
    const timeout = setTimeout(() => { eventError = "Agent exceeded the 20 minute run limit"; stop(project, scene); }, 20 * 60_000);
    child.on("error", (error) => finish("failed", error.message));
    child.on("close", (code) => finish(code === 0 ? "completed" : "failed", code === 0 ? undefined : stderr.trim() || `Agent exited with code ${code}`));
    child.stdin.on("error", () => {});
    child.stdin.end(agent === "codex" ? instruction : undefined);
    return data;
  }

  function stop(project, scene) {
    const dir = sceneDir(project, scene);
    const child = running.get(dir);
    if (child) {
      const data = load(project, scene);
      data.run.status = "cancelling";
      save(dir, data);
      const kill = (signal) => {
        try { if (process.platform !== "win32" && child.pid) process.kill(-child.pid, signal); else child.kill(signal); } catch { /* Already exited. */ }
      };
      kill("SIGTERM");
      const timer = setTimeout(() => { if (running.get(dir) === child) kill("SIGKILL"); }, 3000);
      timer.unref?.();
    }
    return load(project, scene);
  }

  function preview(project, scene, dataUrl) {
    const dir = sceneDir(project, scene);
    if (typeof dataUrl !== "string" || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(dataUrl) || dataUrl.length > 8_000_000) throw new Error("Expected a PNG preview under 6 MB");
    fs.mkdirSync(path.join(dir, ".studio"), { recursive: true });
    fs.writeFileSync(path.join(dir, ".studio", "preview.png"), Buffer.from(dataUrl.split(",")[1], "base64"));
    return { ok: true };
  }

  return { load, start, stop, preview, requestCapture, requestFilmstrip, pendingCaptures, finishCapture, hasRunning: () => running.size > 0, discover: () => [...discover(), { id: "openai-api", label: "OpenAI API", detected: !!getProvider()?.apiKey, executable: !!getProvider()?.apiKey, status: getProvider()?.apiKey ? "available" : "not-configured" }],
    configureProvider(config) {
      if (typeof config.apiKey !== "string" || !config.apiKey.trim() || typeof config.model !== "string" || !config.model.trim()) throw new Error("Enter an API key and model name");
      setProvider({ apiKey: config.apiKey.trim(), model: config.model.trim() });
      return { ok: true };
    },
    allowedOrigin, close: () => {
      for (const job of captures.values()) { clearTimeout(job.timer); job.reject(new Error("Preview service closed")); }
      captures.clear();
      for (const dir of running.keys()) { const relative = path.relative(fs.realpathSync(projectsDir), dir).split(path.sep); stop(relative[0], relative[1]); }
    } };
}

module.exports = { createChatService, runnerArgs, eventText };
