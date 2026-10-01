"use strict";

// Lottie-specific structural checks. These do not prove that pixels render correctly.
function inspectScene(doc) {
  const issues = [];
  const stats = { nodes: 0, byKind: {}, depth: 0, duration: 0 };
  const limitations = "Structural analysis only; image files, animated opacity, nested timeline transforms, fonts and rendered pixels require visual verification.";
  const issue = (code, severity, message, node) => issues.push({ code, severity, message, ...(node ? { node } : {}) });
  if (!doc || !Array.isArray(doc.layers)) {
    issue("invalid-document", "error", "Expected a Lottie object with a layers array");
    return { stats, issues, limitations };
  }
  if (![doc.w, doc.h, doc.fr, doc.ip, doc.op].every(Number.isFinite) || doc.w <= 0 || doc.h <= 0 || doc.fr <= 0 || doc.op <= doc.ip) issue("invalid-metadata", "error", "Invalid canvas size, frame rate or duration");
  else stats.duration = (doc.op - doc.ip) / doc.fr;
  const assets = new Map();
  if (doc.assets !== undefined && !Array.isArray(doc.assets)) issue("invalid-assets", "error", "Assets must be an array");
  for (const asset of Array.isArray(doc.assets) ? doc.assets : []) {
    if (!asset || typeof asset !== "object" || Array.isArray(asset) || typeof asset.id !== "string") issue("invalid-asset", "error", "Asset must be an object with a string id");
    else assets.set(asset.id, asset);
  }
  const kinds = { 0: "precomp", 1: "solid", 2: "image", 3: "null", 4: "shape", 5: "text", 6: "audio" };
  function visit(layers, depth, ancestry) {
    if (depth > 128) {
      issue("analysis-limit", "error", "Precomposition depth exceeds 128; structural analysis is incomplete", ancestry.join("/"));
      return;
    }
    stats.depth = Math.max(stats.depth, depth);
    layers.forEach((layer, index) => {
      stats.nodes++;
      if (!layer || typeof layer !== "object" || Array.isArray(layer)) {
        issue("invalid-layer", "error", "Layer must be an object", `${ancestry.join("/") || "scene"}/${index}`);
        return;
      }
      const kind = kinds[layer.ty] ?? "unknown";
      stats.byKind[kind] = (stats.byKind[kind] ?? 0) + 1;
      const node = `${ancestry.join("/") || "scene"}/${layer.ind ?? index}:${layer.nm ?? kind}`;
      if (layer.hd) issue("hidden", "warning", "Layer is hidden", node);
      if (Number.isFinite(layer.ip) && Number.isFinite(layer.op)) {
        if (layer.op <= layer.ip) issue("zero-duration", "warning", "Layer has no duration", node);
        else if (layer.op <= doc.ip || layer.ip >= doc.op) issue("never-visible", "warning", "Layer is outside the scene timeline", node);
      }
      if (layer.ks?.o?.a === 0 && layer.ks.o.k === 0) issue("transparent", "warning", "Layer has zero static opacity", node);
      if (layer.ty === 0 || layer.ty === 2) {
        const asset = assets.get(layer.refId);
        if (!asset) issue("missing-asset", "error", `Missing asset: ${layer.refId}`, node);
        else if (layer.ty === 0) {
          if (ancestry.includes(layer.refId)) issue("cyclic-precomp", "error", "Recursive precomposition reference", node);
          else if (!Array.isArray(asset.layers)) issue("invalid-precomp", "error", "Precomposition has no layers array", node);
          else visit(asset.layers, depth + 1, [...ancestry, layer.refId]);
        }
      }
    });
  }
  visit(doc.layers, 0, []);
  if (!doc.layers.length) issue("no-visuals", "warning", "Scene has no layers");
  return { stats, issues, limitations };
}

module.exports = { inspectScene };
