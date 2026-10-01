"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
  createScene,
  scanProjects,
  slugify,
  uniqueDir,
  nextSceneSlug,
  readJsonSafe,
  writeJson,
  writeSceneBrief,
} = require("./scenes-lib.cjs");

/**
 * Filesystem service over `public/projects`. Both the MCP tools and the REST
 * API (used by the CLI) call into these functions, so agents get identical
 * semantics no matter which transport they use.
 */
function createScenesService(projectsDir, notifyChanged) {
  const ensureWithin = (target) => {
    const resolved = path.resolve(target);
    if (!resolved.startsWith(path.resolve(projectsDir) + path.sep)) {
      throw new Error("Path escapes the projects directory");
    }
    let existing = resolved;
    while (!fs.existsSync(existing)) existing = path.dirname(existing);
    const realRoot = fs.realpathSync(projectsDir);
    const realExisting = fs.realpathSync(existing);
    if (realExisting !== realRoot && !realExisting.startsWith(realRoot + path.sep)) throw new Error("Path escapes the projects directory through a symbolic link");
    return resolved;
  };

  const listProjects = () => scanProjects(projectsDir);

  const getScene = (project, scene) => {
    const file = path.join(projectsDir, String(project), String(scene), "lottie.json");
    ensureWithin(file);
    if (!fs.existsSync(file)) throw new Error(`Scene not found: ${project}/${scene}`);
    return readJsonSafe(file, null);
  };

  const createProject = (name) => {
    const projectSlug = uniqueDir(projectsDir, slugify(name ?? ""));
    const sceneSlug = "scene-1";
    createScene(path.join(projectsDir, projectSlug, sceneSlug));
    notifyChanged?.();
    return { project: projectSlug, scene: sceneSlug };
  };

  const deleteProject = (slug) => {
    const dir = ensureWithin(path.join(projectsDir, String(slug)));
    if (!fs.existsSync(dir)) throw new Error(`Project not found: ${slug}`);
    fs.rmSync(dir, { recursive: true, force: true });
    notifyChanged?.();
    return { ok: true };
  };

  const createSceneInProject = (project) => {
    const projectDir = ensureWithin(path.join(projectsDir, String(project)));
    if (!fs.existsSync(projectDir)) throw new Error(`Project not found: ${project}`);
    const sceneSlug = nextSceneSlug(projectDir);
    createScene(path.join(projectDir, sceneSlug));
    notifyChanged?.();
    return { project, scene: sceneSlug };
  };
  const saveScene = (project, scene, doc) => {
    const dir = ensureWithin(path.join(projectsDir, project, scene));
    if (!fs.existsSync(path.join(dir, "lottie.json"))) throw new Error("Scene not found");
    if (!doc || typeof doc !== "object" || !Array.isArray(doc.layers)) throw new Error("Invalid Lottie document");
    writeJson(path.join(dir, "lottie.json"), doc);
    notifyChanged?.();
    return { ok: true };
  };
  const deleteScene = (project, scene) => {
    const dir = ensureWithin(path.join(projectsDir, project, scene));
    if (!fs.existsSync(path.join(dir, "lottie.json"))) throw new Error("Scene not found");
    fs.rmSync(dir, { recursive: true });
    notifyChanged?.();
    return { ok: true };
  };

  /**
   * Create a scene from a chat brief (description + reference images).
   * Falls back to a brand-new project when `project` is empty.
   */
  const createSceneFromBrief = (project, brief) => {
    const description = String(brief?.description ?? "");
    const images = Array.isArray(brief?.images) ? brief.images : [];
    if (!description.trim() && images.length === 0) {
      throw new Error("Provide a description or at least one image");
    }

    let projectSlug = String(project ?? "");
    let projectDir;
    if (projectSlug) {
      projectDir = ensureWithin(path.join(projectsDir, projectSlug));
      if (!fs.existsSync(projectDir)) throw new Error(`Project not found: ${projectSlug}`);
    } else {
      const base = slugify(description.split(/\s+/).slice(0, 4).join(" "));
      projectSlug = uniqueDir(projectsDir, base);
      projectDir = ensureWithin(path.join(projectsDir, projectSlug));
    }

    const sceneSlug = nextSceneSlug(projectDir);
    const sceneDir = ensureWithin(path.join(projectDir, sceneSlug));
    createScene(sceneDir);
    writeSceneBrief(sceneDir, { description, images });
    notifyChanged?.();
    return { project: projectSlug, scene: sceneSlug };
  };

  /** All slot definitions + current values, from controls.json if present. */
  const listSlots = (project, scene) => {
    const sceneDir = ensureWithin(path.join(projectsDir, String(project), String(scene)));
    const controls = readJsonSafe(path.join(sceneDir, "controls.json"), null);
    if (!controls) {
      return { slots: [], note: "No controls.json for this scene — every value is static." };
    }
    const entries = Array.isArray(controls)
      ? controls
      : Object.entries(controls).map(([sid, value]) => ({ sid, value }));
    return { slots: entries };
  };

  /** Validate + coerce an incoming value by the slot's current type. */
  const coerceValue = (existing, value) => {
    if (existing && typeof existing.value === "number") {
      const num = Number(value);
      if (!Number.isFinite(num)) throw new Error("Expected a number for this scalar slot");
      return num;
    }
    if (existing && Array.isArray(existing.value) && existing.value.length === 4) {
      // color slot: accept "#rrggbb" / "#rrggbbaa" or [r,g,b,a] in 0..1
      if (typeof value === "string") {
        const hex = value.replace("#", "");
        if (!/^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(hex)) throw new Error("Expected #rrggbb hex for this color slot");
        const r = Number.parseInt(hex.slice(0, 2), 16) / 255;
        const g = Number.parseInt(hex.slice(2, 4), 16) / 255;
        const b = Number.parseInt(hex.slice(4, 6), 16) / 255;
        const a = hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) / 255 : 1;
        return [r, g, b, a];
      }
      if (Array.isArray(value) && value.length === 4 && value.every((v) => Number.isFinite(Number(v)))) {
        return value.map(Number);
      }
      throw new Error("Expected #rrggbb or [r,g,b,a] for this color slot");
    }
    if (existing && Array.isArray(existing.value) && existing.value.length === 2) {
      if (!Array.isArray(value) || value.length !== 2) throw new Error("Expected [x, y] for this vec2 slot");
      return [Number(value[0]), Number(value[1])];
    }
    // fall back: text/anything -> string
    return String(value);
  };

  const setSlotValue = (project, scene, sid, value) => {
    const sceneDir = ensureWithin(path.join(projectsDir, String(project), String(scene)));
    const controlsPath = path.join(sceneDir, "controls.json");
    if (!fs.existsSync(controlsPath)) throw new Error(`No controls.json for ${project}/${scene} — nothing to edit`);
    const controls = readJsonSafe(controlsPath, null);
    if (!controls) throw new Error("controls.json is not valid JSON");

    if (Array.isArray(controls)) {
      const index = controls.findIndex((entry) => entry && entry.sid === sid);
      if (index === -1) throw new Error(`Unknown slot: ${sid}`);
      controls[index] = { ...controls[index], value: coerceValue(controls[index], value) };
    } else {
      if (!(sid in controls)) throw new Error(`Unknown slot: ${sid}`);
      controls[sid] = coerceValue({ value: controls[sid] }, value);
    }

    writeJson(controlsPath, controls);
    notifyChanged?.();
    return { ok: true, sid };
  };

  return { listProjects, getScene, createProject, deleteProject, createSceneInProject, createSceneFromBrief, listSlots, setSlotValue, saveScene, deleteScene };
}

module.exports = { createScenesService };
