"use strict";

const fs = require("node:fs");
const path = require("node:path");

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"]);
const FONT_EXTENSIONS = new Set([".ttf", ".otf", ".ttc"]);

/** "main-project" -> "Main Project", "scene-1" -> "Scene 1" */
function titleCase(slug) {
  return slug
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/** Order is the trailing "-NN" suffix of a scene slug; absent -> Infinity. */
function sceneOrder(slug) {
  const match = slug.match(/-(\d+)$/);
  return match ? Number(match[1]) : Number.POSITIVE_INFINITY;
}

function slugify(name) {
  return String(name)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function uniqueDir(parent, base) {
  const root = base || "untitled";
  let slug = root;
  let n = 2;
  while (fs.existsSync(path.join(parent, slug))) slug = `${root}-${n++}`;
  return slug;
}

function nextSceneSlug(projectDir) {
  let max = 0;
  for (const dir of listDirs(projectDir)) {
    const match = dir.match(/-(\d+)$/);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `scene-${max + 1}`;
}

function listDirs(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

/** Minimal Bodymovin scene: a `w`x`h` background rect exposing an editable bgColor slot. */
function defaultLottie(w, h, hex) {
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

function createScene(sceneDir, w = 512, h = 512, hex = "#262626") {
  fs.mkdirSync(sceneDir, { recursive: true });
  fs.writeFileSync(
    path.join(sceneDir, "lottie.json"),
    JSON.stringify(defaultLottie(w, h, hex), null, 2),
  );
  // Give the scene one control out of the box so it is editable on arrival.
  writeJson(path.join(sceneDir, "controls.json"), {
    controls: [{ sid: "bgColor", label: "Background" }],
  });
}

/** Discover all projects/scenes under `projectsDir` into an ordered tree. */
function scanProjects(projectsDir) {
  const projects = [];

  for (const projectSlug of listDirs(projectsDir).sort()) {
    const projectDir = path.join(projectsDir, projectSlug);
    const scenes = [];

    for (const sceneSlug of listDirs(projectDir)) {
      const sceneDir = path.join(projectDir, sceneSlug);
      if (!fs.existsSync(path.join(sceneDir, "lottie.json"))) continue;
      const files = fs
        .readdirSync(sceneDir, { withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name);
      const base = `/projects/${projectSlug}/${sceneSlug}`;
      const byExtension = (extensions) =>
        files
          .filter((name) => extensions.has(path.extname(name).toLowerCase()))
          .sort()
          .map((name) => `${base}/${name}`);

      scenes.push({
        slug: sceneSlug,
        label: titleCase(sceneSlug),
        order: sceneOrder(sceneSlug),
        lottie: `${base}/lottie.json`,
        controls: files.includes("controls.json") ? `${base}/controls.json` : undefined,
        brief: files.includes("brief.json") ? `${base}/brief.json` : undefined,
        images: byExtension(IMAGE_EXTENSIONS),
        fonts: byExtension(FONT_EXTENSIONS),
      });
    }

    scenes.sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug));
    if (scenes.length > 0) {
      projects.push({ slug: projectSlug, label: titleCase(projectSlug), scenes });
    }
  }

  return { projects };
}

/** Safe JSON read/write helpers. */
function readJsonSafe(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
}

/** Extension for a data-URL mime type; falls back to ".png". */
const IMAGE_EXT_BY_MIME = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/svg+xml": ".svg",
  "image/avif": ".avif",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/quicktime": ".mov",
};

/**
 * Persist a chat brief into a scene folder.
 *
 * Reference images are written flat next to lottie.json (the layout
 * `scanProjects` expects) and indexed from `brief.json`, so the connected
 * agent can read the original description + images over MCP.
 */
function writeSceneBrief(sceneDir, brief = {}) {
  fs.mkdirSync(sceneDir, { recursive: true });
  const images = Array.isArray(brief.images) ? brief.images : [];
  const saved = [];
  const references = [];

  images.forEach((image, index) => {
    const dataUrl = String(image?.dataUrl ?? "");
    const match = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/.exec(dataUrl);
    if (!match || !IMAGE_EXT_BY_MIME[match[1]]) throw new Error("Unsupported reference file type");
    const buffer = Buffer.from(match[3], match[2] ? "base64" : "utf8");
    if (buffer.length > 8 * 1024 * 1024) throw new Error("Reference exceeds 8 MB");
    const ext = IMAGE_EXT_BY_MIME[match[1]];
    const fileName = `reference-${index + 1}${ext}`;
    fs.writeFileSync(path.join(sceneDir, fileName), buffer);
    saved.push(fileName);
    references.push({ file: fileName, name: String(image.name ?? fileName), mime: match[1] });
  });

  const record = {
    description: String(brief.description ?? "").trim(),
    images: saved,
    references,
    createdAt: new Date().toISOString(),
  };
  writeJson(path.join(sceneDir, "brief.json"), record);
  return record;
}

module.exports = {
  titleCase,
  sceneOrder,
  slugify,
  uniqueDir,
  nextSceneSlug,
  listDirs,
  defaultLottie,
  createScene,
  scanProjects,
  readJsonSafe,
  writeJson,
  writeSceneBrief,
  IMAGE_EXTENSIONS,
  FONT_EXTENSIONS,
};
