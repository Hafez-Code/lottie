"use strict";

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { AGENTS, detectInstalledAgents } = require("../shared/agents.cjs");
const { handleMcpRequest } = require("./services/mcp.cjs");
const { createScenesService } = require("./services/scenes.cjs");
const { createChatService } = require("./services/chat.cjs");
const { handleChatRequest } = require("./services/chat-http.cjs");

/**
 * The local service server. One HTTP listener on 127.0.0.1:<port>:
 *   /mcp           MCP over Streamable HTTP (tools)
 *   /api/status    { app, port, agents, mcp, ... } for the UI + CLI
 *   /api/agents    POST persist the agent toggles from Settings
 *   /api/projects  GET list / POST create / DELETE remove
 *   /api/scenes    GET one lottie.json / POST create a scene
 *   /api/slots     GET list / POST set a value
 *   /api/open      POST open a scene in the app window
 *   anything else  static files (dist/ + public/) when running packaged
 */

const PORT_BASE = 3274; // matches the URL advertised in Settings → MCP & CLI
const PORT_SCAN = 24; // 3274..3297, first free port wins

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readJsonBody(req) {
  let data = "";
  for await (const chunk of req) data += chunk;
  try {
    return JSON.parse(data || "{}");
  } catch {
    return {};
  }
}

function createServerOnce({ appRoot, isDev, workspaceDir, dataDir = appRoot, rendererOrigin, getProvider, setProvider }) {
  let projectsDir = workspaceDir ?? (isDev
    ? path.join(appRoot, "public", "projects")
    : path.join(process.resourcesPath ?? appRoot, "public", "projects"));

  const agentsStateFile = path.join(dataDir, ".agents-state.json");
  const startedAt = new Date().toISOString();

  function defaultAgents() {
    return Object.fromEntries(AGENTS.map((a) => [a.id, true]));
  }

  function loadAgents() {
    try {
      if (fs.existsSync(agentsStateFile)) {
        const raw = JSON.parse(fs.readFileSync(agentsStateFile, "utf8"));
        if (raw && typeof raw.agents === "object") return { ...defaultAgents(), ...raw.agents };
      }
    } catch {
      // fall through to defaults
    }
    return defaultAgents();
  }

  let agents = loadAgents();
  let port = PORT_BASE;
  let onOpenScene = null; // wired by main.cjs after window creation
  let httpServer = null; // the live listener, so close() can tear it down

  let scenes = createScenesService(projectsDir, () => void 0);
  let chat = createChatService({ projectsDir, getBaseUrl: () => `http://127.0.0.1:${port}`, allowedOrigin: rendererOrigin, getProvider, setProvider });

  const openScene = (project, scene) => {
    const tree = scenes.listProjects();
    const p = tree.projects.find((item) => item.slug === project);
    const s = p?.scenes.find((item) => item.slug === scene);
    if (!p || !s) throw new Error(`Scene not found: ${project}/${scene}`);
    onOpenScene?.({ project, scene });
    return { ok: true, project, scene };
  };

  const buildStatus = () => ({
    app: "diffusion-studio",
    version: "1.0.0",
    port,
    dev: isDev,
    projectsDir,
    startedAt,
    mcp: `http://127.0.0.1:${port}/mcp`,
    cli: "npx diffusion-studio status",
    agents: { ...agents },
    // Read live so a just-installed agent shows up without restarting the app.
    agentsInstalled: detectInstalledAgents(),
  });

  const mcpDeps = {
    listProjects: () => scenes.listProjects(),
    getScene: (project, scene) => ({ project, scene, lottie: scenes.getScene(project, scene) }),
    createProject: (name) => scenes.createProject(name ?? "Untitled project"),
    deleteProject: (project) => scenes.deleteProject(project),
    openScene,
    listSlots: (...args) => scenes.listSlots(...args),
    setSlotValue: (...args) => scenes.setSlotValue(...args),
    captureFrames: (project, scene, frames) => chat.requestFilmstrip(project, scene, frames),
    captureScene: (project, scene, frame) => chat.requestCapture(project, scene, frame),
  };

  async function handle(req, res) {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
    const origin = req.headers.origin;
    if (origin && (origin === rendererOrigin || origin === `http://${req.headers.host}`)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
      res.setHeader("Vary", "Origin");
      if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
    } else if (origin && url.pathname.startsWith("/api/")) { return json(res, 403, { error: "Origin not allowed" }); }
    if (await handleChatRequest(req, res, chat)) return;

    // --- MCP over Streamable HTTP -------------------------------------------
    if (url.pathname === "/mcp") {
      const handled = await handleMcpRequest(req, res, mcpDeps);
      if (handled) return;
    }

    // --- REST API for the CLI ------------------------------------------------
    if (url.pathname === "/api/status") return json(res, 200, buildStatus());

    if (url.pathname === "/api/agents" && req.method === "POST") {
      const body = await readJsonBody(req);
      if (body && typeof body.agents === "object") {
        agents = { ...agents, ...body.agents };
        try {
          fs.writeFileSync(agentsStateFile, JSON.stringify({ agents }, null, 2));
        } catch {
          // state file is best-effort; the in-memory value already updated
        }
      }
      return json(res, 200, { ok: true, agents: { ...agents } });
    }

    if (url.pathname === "/api/projects") {
      if (req.method === "GET") return json(res, 200, scenes.listProjects());
      if (req.method === "POST") {
        const body = await readJsonBody(req);
        return json(res, 201, scenes.createProject(String(body.name ?? "Untitled project")));
      }
      if (req.method === "DELETE") {
        const body = await readJsonBody(req);
        return json(res, 200, scenes.deleteProject(String(body.project ?? "")));
      }
      return json(res, 405, { error: "method not allowed" });
    }

    const sceneMatch = url.pathname.match(/^\/api\/scenes\/([^/]+)\/([^/]+)$/);
    if (sceneMatch) {
      if (req.method === "GET") {
        return json(res, 200, scenes.getScene(decodeURIComponent(sceneMatch[1]), decodeURIComponent(sceneMatch[2])));
      }
      return json(res, 405, { error: "method not allowed" });
    }

    if (url.pathname === "/api/scenes" && req.method === "POST") {
      const body = await readJsonBody(req);
      return json(res, 201, scenes.createSceneInProject(String(body.project ?? "")));
    }
    if (url.pathname === "/api/scenes" && req.method === "DELETE") {
      const body = await readJsonBody(req);
      return json(res, 200, scenes.deleteScene(String(body.project), String(body.scene)));
    }
    if (url.pathname === "/api/lottie" && req.method === "POST") {
      const body = await readJsonBody(req);
      return json(res, 200, scenes.saveScene(String(body.project), String(body.scene), body.doc));
    }
    if (url.pathname === "/scenes.json") return json(res, 200, scenes.listProjects());
    if (url.pathname.startsWith("/projects/")) {
      const file = path.resolve(projectsDir, decodeURIComponent(url.pathname.slice("/projects/".length)));
      const root = fs.realpathSync(projectsDir);
      if (file.startsWith(path.resolve(projectsDir) + path.sep) && fs.existsSync(file) && fs.realpathSync(file).startsWith(root + path.sep) && fs.statSync(file).isFile()) {
        const types = { ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml", ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime" };
        res.writeHead(200, { "Content-Type": types[path.extname(file)] ?? "application/octet-stream" });
        fs.createReadStream(file).pipe(res); return;
      }
      return json(res, 404, { error: "Asset not found" });
    }

    // Create a scene from a chat brief (description + reference images).
    if (url.pathname === "/api/brief" && req.method === "POST") {
      const body = await readJsonBody(req);
      return json(
        res,
        201,
        scenes.createSceneFromBrief(String(body.project ?? ""), {
          description: body.description,
          images: Array.isArray(body.images) ? body.images : [],
        }),
      );
    }

    if (url.pathname === "/api/slots") {
      if (req.method === "GET") {
        return json(res, 200, scenes.listSlots(url.searchParams.get("project") ?? "", url.searchParams.get("scene") ?? ""));
      }
      if (req.method === "POST") {
        const body = await readJsonBody(req);
        return json(res, 200, scenes.setSlotValue(String(body.project), String(body.scene), String(body.sid), body.value));
      }
      return json(res, 405, { error: "method not allowed" });
    }

    if (url.pathname === "/api/open" && req.method === "POST") {
      const body = await readJsonBody(req);
      return json(res, 200, openScene(String(body.project), String(body.scene)));
    }

    // --- Static renderer (packaged mode) -------------------------------------
    if (!isDev && serveStatic(url.pathname, res)) return;

    json(res, 404, { error: "not found", pathname: url.pathname, dev: isDev });
  }

  function serveStatic(pathname, res) {
    const roots = [path.join(appRoot, "dist"), path.join(appRoot, "public")];
    let clean = decodeURIComponent(pathname);
    if (clean === "/" || clean === "") clean = "/index.html";
    for (const root of roots) {
      const rootAbs = path.resolve(root);
      const file = path.resolve(rootAbs, "." + clean);
      if (file.startsWith(rootAbs) && fs.existsSync(file) && fs.statSync(file).isFile()) {
        const ext = path.extname(file).toLowerCase();
        const types = {
          ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
          ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml",
          ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp",
          ".ttf": "font/ttf", ".otf": "font/otf", ".wasm": "application/wasm",
          ".woff2": "font/woff2", ".map": "application/json",
        };
        res.writeHead(200, { "Content-Type": types[ext] ?? "application/octet-stream" });
        fs.createReadStream(file).pipe(res);
        return true;
      }
    }
    // SPA fallback for client-side routes
    const index = path.join(appRoot, "dist", "index.html");
    if (fs.existsSync(index) && !clean.startsWith("/projects/")) {
      res.writeHead(200, { "Content-Type": "text/html" });
      fs.createReadStream(index).pipe(res);
      return true;
    }
    return false;
  }

  return {
    /** Listen on the first free port in the scan range. Resolves { port, server }. */
    listen() {
      return new Promise((resolve, reject) => {
        const server = http.createServer((req, res) => {
          void handle(req, res).catch((error) => {
            if (!res.headersSent) {
              json(res, 500, { error: error instanceof Error ? error.message : String(error) });
            }
          });
        });
        httpServer = server;
        let attempt = 0;
        let settling = false;
        const tryPort = () => {
          if (settling) return;
          if (attempt > PORT_SCAN) {
            settling = true;
            reject(new Error(`No free port found (${PORT_BASE}..${PORT_BASE + PORT_SCAN}).`));
            return;
          }
          port = PORT_BASE + attempt;
          attempt += 1;
          server.listen(port, "127.0.0.1", () => {
            settling = true;
            resolve({ port, server });
          });
          server.once("error", () => tryPort());
        };
        tryPort();
      });
    },
    /** Stop listening and release the port. Resolves true when a server was closed. */
    close() {
      chat.close();
      const server = httpServer;
      httpServer = null;
      if (!server) return Promise.resolve(false);
      return new Promise((resolve) => server.close(() => resolve(true)));
    },
    setOpenSceneHandler(fn) {
      onOpenScene = fn;
    },
    setAgents(next) {
      agents = { ...agents, ...next };
      try {
        fs.writeFileSync(agentsStateFile, JSON.stringify({ agents }, null, 2));
      } catch {
        // best-effort
      }
    },
    getAgents: () => ({ ...agents }),
    getStatus: buildStatus,
    getPort: () => port,
    setWorkspace(dir) {
      if (chat.hasRunning()) throw new Error("Stop the running agents before changing the projects folder.");
      chat.close();
      fs.mkdirSync(dir, { recursive: true });
      projectsDir = fs.realpathSync(dir);
      scenes = createScenesService(projectsDir, () => void 0);
      chat = createChatService({ projectsDir, getBaseUrl: () => `http://127.0.0.1:${port}`, allowedOrigin: rendererOrigin, getProvider, setProvider });
      return { projectsDir };
    },
  };
}

module.exports = { createServerOnce, PORT_BASE };
