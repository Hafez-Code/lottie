import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import type { Plugin } from "vite";
import type { Scene, Project, ScenesTree } from "../src/types/common";
import type { IncomingMessage, ServerResponse } from "node:http";

const require = createRequire(import.meta.url);
const { createChatService } = require("../electron/services/chat.cjs");
const { handleChatRequest } = require("../electron/services/chat-http.cjs");
const { writeSceneBrief: persistBrief } = require("../electron/services/scenes-lib.cjs");
const { handleMcpRequest } = require("../electron/services/mcp.cjs");
const { createScenesService } = require("../electron/services/scenes.cjs");

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"]);
const FONT_EXTENSIONS = new Set([".ttf", ".otf", ".ttc"]);

/** "main-project" -> "Main Project", "scene-1" -> "Scene 1" */
function titleCase(slug: string): string {
  return slug
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/** Order is the trailing "-NN" suffix of a scene slug; absent -> Infinity (sorts last). */
function sceneOrder(slug: string): number {
  const match = slug.match(/-(\d+)$/);
  return match ? Number(match[1]) : Number.POSITIVE_INFINITY;
}

function listDirs(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

/** "My Cool Anim" -> "my-cool-anim" (folder-safe, used as the URL segment). */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** A folder name under `parent` that doesn't collide, e.g. "foo", "foo-2", "foo-3". */
function uniqueDir(parent: string, base: string): string {
  const root = base || "untitled";
  let slug = root;
  let n = 2;
  while (fs.existsSync(path.join(parent, slug))) slug = `${root}-${n++}`;
  return slug;
}

/** Next "scene-N" slug for a project, one past the highest existing trailing number. */
function nextSceneSlug(projectDir: string): string {
  let max = 0;
  for (const dir of listDirs(projectDir)) {
    const match = dir.match(/-(\d+)$/);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `scene-${max + 1}`;
}

/** Minimal Bodymovin scene: a `w`x`h` background rect exposing an editable bgColor slot. */
function defaultLottie(w: number, h: number, hex: string): unknown {
  const r = Number.parseInt(hex.slice(1, 3), 16) / 255;
  const g = Number.parseInt(hex.slice(3, 5), 16) / 255;
  const b = Number.parseInt(hex.slice(5, 7), 16) / 255;
  return {
    v: "5.7.0",
    fr: 60,
    ip: 0,
    op: 90,
    w,
    h,
    assets: [],
    // Full-frame scenes expose their background as a color slot (output rubric).
    slots: {
      bgColor: { p: { a: 0, k: [r, g, b, 1] } },
    },
    layers: [
      {
        ty: 4,
        nm: "background",
        ip: 0,
        op: 90,
        st: 0,
        ks: {
          o: { a: 0, k: 100 },
          r: { a: 0, k: 0 },
          a: { a: 0, k: [0, 0, 0] },
          s: { a: 0, k: [100, 100, 100] },
          p: { a: 0, k: [w / 2, h / 2, 0] },
        },
        shapes: [
          {
            ty: "gr",
            nm: "background-group",
            it: [
              { ty: "rc", p: { a: 0, k: [0, 0] }, s: { a: 0, k: [w, h] }, r: { a: 0, k: 0 } },
              { ty: "fl", c: { sid: "bgColor" }, o: { a: 0, k: 100 } },
              {
                ty: "tr",
                p: { a: 0, k: [0, 0] },
                a: { a: 0, k: [0, 0] },
                s: { a: 0, k: [100, 100] },
                r: { a: 0, k: 0 },
                o: { a: 0, k: 100 },
              },
            ],
          },
        ],
      },
    ],
  };
}

/** Create `<sceneDir>/lottie.json` with a fresh 512x512 #262626 scene. */
function createScene(sceneDir: string): void {
  fs.mkdirSync(sceneDir, { recursive: true });
  fs.writeFileSync(
    path.join(sceneDir, "lottie.json"),
    JSON.stringify(defaultLottie(512, 512, "#262626"), null, 2),
  );
  // Give the scene one control out of the box so it is editable on arrival.
  fs.writeFileSync(
    path.join(sceneDir, "controls.json"),
    JSON.stringify({ controls: [{ sid: "bgColor", label: "Background" }] }, null, 2) + "\n",
  );
}

const IMAGE_EXT_BY_MIME: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/svg+xml": ".svg",
  "image/avif": ".avif",
};

/**
 * Write a chat brief into a scene folder: reference images land flat next to
 * lottie.json (the layout the scanner expects) and `brief.json` indexes them,
 * so the connected agent can read the description + images over MCP.
 */
function writeSceneBrief(sceneDir: string, brief: Record<string, unknown>): string[] {
  return persistBrief(sceneDir, brief).images;
}

function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(data || "{}"));
      } catch {
        resolve({});
      }
    });
  });
}

function scanScene(projectSlug: string, sceneSlug: string, sceneDir: string): Scene | null {
  const files = fs
    .readdirSync(sceneDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name);

  if (!files.includes("lottie.json")) return null;

  const base = `/projects/${projectSlug}/${sceneSlug}`;
  const byExtension = (extensions: Set<string>) =>
    files
      .filter((name) => extensions.has(path.extname(name).toLowerCase()))
      .sort()
      .map((name) => `${base}/${name}`);

  return {
    slug: sceneSlug,
    label: titleCase(sceneSlug),
    order: sceneOrder(sceneSlug),
    lottie: `${base}/lottie.json`,
    controls: files.includes("controls.json") ? `${base}/controls.json` : undefined,
    brief: files.includes("brief.json") ? `${base}/brief.json` : undefined,
    images: byExtension(IMAGE_EXTENSIONS),
    fonts: byExtension(FONT_EXTENSIONS),
  };
}

/** mtime of a scene's source (lottie.json), as an ISO string; null if missing. */
function sceneLastModified(sceneDir: string): string | null {
  try {
    return fs.statSync(path.join(sceneDir, "lottie.json")).mtime.toISOString();
  } catch {
    return null;
  }
}

/**
 * Last playback snapshot reported by the browser. Only updated on discrete
 * events (scene change, play, pause, scrub) — never per-frame — so the live
 * frame is *computed* on read from elapsed time rather than streamed.
 */
interface LiveState {
  project: string | null;
  scene: string | null;
  playing: boolean;
  frame: number;
  totalFrames: number;
  fps: number;
  reportedAt: number; // server epoch ms when this snapshot arrived
}

/** Agent-facing snapshot: filesystem tree (+ mtimes) merged with live playback. */
function buildContext(projectsDir: string, live: LiveState | null, now: number) {
  const projects = listDirs(projectsDir)
    .sort()
    .map((projectSlug) => {
      const projectDir = path.join(projectsDir, projectSlug);
      const scenes = listDirs(projectDir)
        .map((sceneSlug) => {
          const sceneDir = path.join(projectDir, sceneSlug);
          if (!fs.existsSync(path.join(sceneDir, "lottie.json"))) return null;
          return {
            slug: sceneSlug,
            label: titleCase(sceneSlug),
            order: sceneOrder(sceneSlug),
            active: live?.project === projectSlug && live?.scene === sceneSlug,
            lastModified: sceneLastModified(sceneDir),
          };
        })
        .filter((s): s is NonNullable<typeof s> => s !== null)
        .sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug));
      if (scenes.length === 0) return null;
      return {
        slug: projectSlug,
        label: titleCase(projectSlug),
        active: live?.project === projectSlug,
        scenes,
      };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  // While playing, advance the reported frame by the time since it was reported,
  // wrapping at totalFrames — mirrors the browser's rAF loop. Paused → as-is.
  let currentFrame = live?.frame ?? 0;
  if (live?.playing && live.fps > 0 && live.totalFrames > 0) {
    const elapsed = (now - live.reportedAt) / 1000;
    currentFrame = (live.frame + elapsed * live.fps) % live.totalFrames;
  }

  return {
    generatedAt: new Date(now).toISOString(),
    live: {
      hasClient: live !== null,
      activeProject: live?.project ?? null,
      activeScene: live?.scene ?? null,
      playing: live?.playing ?? false,
      currentFrame: Math.round(currentFrame * 1000) / 1000,
      totalFrames: live?.totalFrames ?? 0,
      fps: live?.fps ?? 0,
      reportedAt: live ? new Date(live.reportedAt).toISOString() : null,
    },
    projects,
  };
}

/** Discover all projects/scenes under `projectsDir` into an ordered tree. */
export function scanProjects(projectsDir: string): ScenesTree {
  const projects: Project[] = [];

  for (const projectSlug of listDirs(projectsDir).sort()) {
    const projectDir = path.join(projectsDir, projectSlug);
    const scenes: Scene[] = [];

    for (const sceneSlug of listDirs(projectDir)) {
      const scene = scanScene(projectSlug, sceneSlug, path.join(projectDir, sceneSlug));
      if (scene) scenes.push(scene);
    }

    scenes.sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug));
    if (scenes.length > 0) {
      projects.push({ slug: projectSlug, label: titleCase(projectSlug), scenes });
    }
  }

  return { projects };
}

/**
 * Auto-discovers `public/projects/<project>/<scene-NN>/` folders.
 * - Dev: serves the tree at `GET /__scenes` and live-pushes `scenes:update` over
 *   Vite's HMR socket whenever a project/scene file is added, removed, or renamed.
 * - Build: emits a static `scenes.json` for production.
 */
export function scenesPlugin(): Plugin {
  let projectsDir = "";
  let live: LiveState | null = null; // latest browser playback snapshot

  // Exact content of the last lottie.json the plugin wrote per path. Used to
  // tell the browser's own auto-save write-backs (echoes, to be ignored) apart
  // from external edits (e.g. the agent), which should trigger a live reload.
  const selfWrites = new Map<string, string>();

  return {
    name: "scenes-discovery",

    configResolved(config) {
      projectsDir = path.resolve(config.root, "public/projects");
    },

    configureServer(server) {
      let provider: { apiKey: string; model: string } | null = null;
      const chat = createChatService({ projectsDir, getBaseUrl: () => server.resolvedUrls?.local[0]?.replace(/\/$/, "") ?? "", getProvider: () => provider, setProvider: (next: typeof provider) => { provider = next; } });
      const sceneService = createScenesService(projectsDir, () => void 0);
      const mcpDeps = { ...sceneService,
        getScene: (project: string, scene: string) => ({ project, scene, lottie: sceneService.getScene(project, scene) }),
        openScene: (project: string, scene: string) => ({ project, scene, url: `/${project}/${scene}` }),
        captureFrames: (project: string, scene: string, frames?: number[]) => chat.requestFilmstrip(project, scene, frames),
        captureScene: (project: string, scene: string, frame: number) => chat.requestCapture(project, scene, frame),
      };
      server.httpServer?.once("close", () => chat.close());
      server.middlewares.use((req, res, next) => {
        const handler = req.url?.split("?")[0] === "/mcp" ? handleMcpRequest(req, res, mcpDeps) : handleChatRequest(req, res, chat);
        void handler.then((handled: boolean) => { if (!handled) next(); }).catch(next);
      });
      const json = (res: ServerResponse, status: number, body: unknown) => {
        res.statusCode = status;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(body));
      };

      // Create a new project with a default scene (POST, body: { name }), or
      // delete an existing project and all its scenes (DELETE, body: { project }).
      server.middlewares.use("/__scenes/project", async (req, res) => {
        const body = await readJsonBody(req);
        if (req.method === "POST") {
          const projectSlug = uniqueDir(projectsDir, slugify(String(body.name ?? "")));
          const sceneSlug = "scene-1";
          createScene(path.join(projectsDir, projectSlug, sceneSlug));
          return json(res, 201, { project: projectSlug, scene: sceneSlug });
        }
        if (req.method === "DELETE") {
          const projectDir = path.resolve(projectsDir, String(body.project ?? ""));
          if (!projectDir.startsWith(projectsDir + path.sep) || !fs.existsSync(projectDir)) {
            return json(res, 404, { error: "project not found" });
          }
          fs.rmSync(projectDir, { recursive: true, force: true });
          return json(res, 200, { ok: true });
        }
        json(res, 405, { error: "method not allowed" });
      });

      // Append a new default scene to a project (POST, body: { project }), or
      // delete a scene (DELETE, body: { project, scene }).
      server.middlewares.use("/__scenes/scene", async (req, res) => {
        const body = await readJsonBody(req);
        if (req.method === "POST") {
          const projectSlug = String(body.project ?? "");
          const projectDir = path.resolve(projectsDir, projectSlug);
          if (!projectDir.startsWith(projectsDir + path.sep) || !fs.existsSync(projectDir)) {
            return json(res, 404, { error: "project not found" });
          }
          const sceneSlug = nextSceneSlug(projectDir);
          createScene(path.join(projectDir, sceneSlug));
          return json(res, 201, { project: projectSlug, scene: sceneSlug });
        }
        if (req.method === "DELETE") {
          const sceneDir = path.resolve(projectsDir, String(body.project ?? ""), String(body.scene ?? ""));
          if (!sceneDir.startsWith(projectsDir + path.sep) || !fs.existsSync(sceneDir)) {
            return json(res, 404, { error: "scene not found" });
          }
          fs.rmSync(sceneDir, { recursive: true, force: true });
          return json(res, 200, { ok: true });
        }
        json(res, 405, { error: "method not allowed" });
      });

      // Create a scene from a chat brief (POST, body: { project?, description, images }).
      // Images (data URLs) are written flat into the scene folder and indexed by
      // brief.json. Omit `project` to start a brand-new project.
      server.middlewares.use("/__scenes/brief", async (req, res) => {
        if (req.method !== "POST") return json(res, 405, { error: "method not allowed" });
        const body = await readJsonBody(req);
        const description = String(body.description ?? "");
        const images = Array.isArray(body.images) ? body.images : [];
        if (!description.trim() && images.length === 0) {
          return json(res, 400, { error: "Provide a description or at least one image" });
        }

        let projectSlug = String(body.project ?? "");
        let projectDir: string;
        if (projectSlug) {
          projectDir = path.resolve(projectsDir, projectSlug);
          if (!projectDir.startsWith(projectsDir + path.sep) || !fs.existsSync(projectDir)) {
            return json(res, 404, { error: "project not found" });
          }
        } else {
          projectSlug = uniqueDir(projectsDir, slugify(description.split(/\s+/).slice(0, 4).join(" ")));
          projectDir = path.join(projectsDir, projectSlug);
        }

        const sceneSlug = nextSceneSlug(projectDir);
        const sceneDir = path.join(projectDir, sceneSlug);
        createScene(sceneDir);
        writeSceneBrief(sceneDir, { description, images });
        return json(res, 201, { project: projectSlug, scene: sceneSlug });
      });

      // Overwrite a scene's lottie.json source. Body: { project, scene, doc }.
      // This keeps `public/projects` the source of truth for control edits.
      server.middlewares.use("/__scenes/lottie", async (req, res) => {
        if (req.method !== "POST") return json(res, 405, { error: "method not allowed" });
        const body = await readJsonBody(req);
        const projectSlug = String(body.project ?? "");
        const sceneSlug = String(body.scene ?? "");
        const sceneDir = path.resolve(projectsDir, projectSlug, sceneSlug);
        if (!sceneDir.startsWith(projectsDir + path.sep) || !fs.existsSync(sceneDir)) {
          return json(res, 404, { error: "scene not found" });
        }
        const lottiePath = path.join(sceneDir, "lottie.json");
        if (!fs.existsSync(lottiePath)) return json(res, 404, { error: "lottie.json not found" });
        if (!body.doc || typeof body.doc !== "object") return json(res, 400, { error: "missing doc" });
        const serialized = JSON.stringify(body.doc, null, 2);
        selfWrites.set(lottiePath, serialized); // mark as our own write so the watcher ignores the echo
        fs.writeFileSync(lottiePath, serialized);
        json(res, 200, { ok: true });
      });

      // Agent-facing application context.
      //   GET  -> projects/scenes (+ mtimes), active project/scene, playback.
      //   POST -> browser heartbeat; body: { project, scene, playing, frame, totalFrames, fps }.
      // The browser only POSTs on discrete events (scene change, play, pause,
      // scrub); GET computes the live frame from elapsed time, so no streaming.
      server.middlewares.use("/__context", async (req, res) => {
        if (req.method === "POST") {
          const body = await readJsonBody(req);
          live = {
            project: body.project != null ? String(body.project) : null,
            scene: body.scene != null ? String(body.scene) : null,
            playing: Boolean(body.playing),
            frame: Number(body.frame) || 0,
            totalFrames: Number(body.totalFrames) || 0,
            fps: Number(body.fps) || 0,
            reportedAt: Date.now(),
          };
          return json(res, 200, { ok: true });
        }
        json(res, 200, buildContext(projectsDir, live, Date.now()));
      });

      server.middlewares.use("/__scenes", (_req, res) => {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(scanProjects(projectsDir)));
      });

      const notify = (file: string) => {
        if (!file.startsWith(projectsDir)) return;
        server.ws.send({ type: "custom", event: "scenes:update", data: scanProjects(projectsDir) });
      };

      // Only structural events change the scenes tree; file content "change"
      // events (e.g. saving control edits back to lottie.json) must not trigger
      // a re-scan, or the active scene would reload on every auto-save.
      server.watcher.add(projectsDir);
      for (const event of ["add", "unlink", "addDir", "unlinkDir"] as const) {
        server.watcher.on(event, notify);
      }

      // Content edits to a scene's lottie.json: reload just that scene in the
      // browser. The browser's own auto-saves are filtered out by comparing
      // against the exact bytes the plugin last wrote, so only external edits
      // (e.g. the agent rewriting the file) reach the client.
      server.watcher.on("change", (file) => {
        if (!file.startsWith(projectsDir) || path.basename(file) !== "lottie.json") return;
        let content: string;
        try {
          content = fs.readFileSync(file, "utf8");
        } catch {
          return;
        }
        if (selfWrites.get(file) === content) {
          selfWrites.delete(file);
          return; // echo of our own save — ignore
        }
        const rel = path.relative(projectsDir, file).split(path.sep).join("/");
        server.ws.send({ type: "custom", event: "scene:source", data: { lottie: `/projects/${rel}` } });
      });
    },

    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "scenes.json",
        source: JSON.stringify(scanProjects(projectsDir)),
      });
    },
  };
}
