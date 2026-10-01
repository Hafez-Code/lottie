"use strict";

const fs = require("node:fs");
const path = require("node:path");

function validateResult(result) {
  const doc = result?.lottie;
  if (!doc || !Array.isArray(doc.layers) || doc.layers.some((layer) => !layer || typeof layer !== "object" || Array.isArray(layer)) || ![doc.w, doc.h, doc.fr, doc.ip, doc.op].every(Number.isFinite) || doc.w <= 0 || doc.h <= 0 || doc.fr <= 0 || doc.op <= doc.ip) throw new Error("The model did not return a valid Lottie animation. The existing scene was preserved.");
  if (doc.assets !== undefined && (!Array.isArray(doc.assets) || doc.assets.some((asset) => !asset || typeof asset !== "object" || Array.isArray(asset) || (asset.p !== undefined && typeof asset.p !== "string") || (asset.u !== undefined && typeof asset.u !== "string")))) throw new Error("The model returned invalid assets. The existing scene was preserved.");
  if (doc.assets?.some((asset) => asset.p && (/^(https?:|data:|\/)/.test(asset.p) || asset.p.includes("..") || (asset.u && asset.u !== "")))) throw new Error("The model referenced unsupported external assets. The existing scene was preserved.");
  if (result.controls && (!Array.isArray(result.controls.controls) || result.controls.controls.some((c) => !c || typeof c !== "object" || typeof c.sid !== "string"))) throw new Error("The model returned invalid controls");
  return result;
}

async function runApi({ config, dir, prompt, signal, fetchImpl = fetch, capture, imagePaths = [] }) {
  const files = fs.readdirSync(dir).filter((name) => /^reference-\d+\.(png|jpg|webp)$/.test(name)).slice(0, 12);
  const preview = path.join(dir, ".studio", "preview.png");
  if (fs.existsSync(preview)) files.push(".studio/preview.png");
  for (const file of imagePaths) {
    const name = path.relative(dir, file);
    if (!name.startsWith("..") && /\.(png|jpg|webp)$/.test(name) && !files.includes(name)) files.push(name);
  }
  const content = [{ type: "input_text", text: `${prompt}\n\nCurrent lottie.json:\n${fs.readFileSync(path.join(dir, "lottie.json"), "utf8")}\n\nReturn only one JSON object with keys: lottie (complete valid Lottie JSON), controls (optional { controls: [{sid,label,min,max,step}] }), summary (what changed). Preserve existing image filenames; do not invent assets. Use vector shapes for new elements. This is an animation generation request: produce JSON, not a plan.` }];
  for (const file of files) {
    const bytes = fs.readFileSync(path.join(dir, file));
    const mime = file.endsWith(".jpg") ? "image/jpeg" : file.endsWith(".webp") ? "image/webp" : "image/png";
    content.push({ type: "input_image", image_url: `data:${mime};base64,${bytes.toString("base64")}` });
  }
  const res = await fetchImpl("https://api.openai.com/v1/responses", {
    method: "POST", signal, headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({ model: config.model, input: [{ role: "user", content }], text: { format: { type: "json_object" } } }),
  });
  const response = await res.json();
  if (!res.ok) throw new Error(`OpenAI API request failed (${res.status}). Check the key, model access and quota.`);
  if (response.status === "incomplete" || response.error) throw new Error("The model response was incomplete. The existing scene was preserved.");
  const text = (response.output ?? []).flatMap((item) => item.content ?? []).filter((item) => item.type === "output_text").map((item) => item.text).join("");
  let result;
  try { result = JSON.parse(text); } catch { throw new Error("The model did not return readable animation JSON. The existing scene was preserved."); }
  validateResult(result);
  if (signal.aborted) throw new Error("Run cancelled");
  const original = fs.readFileSync(path.join(dir, "lottie.json"), "utf8");
  fs.mkdirSync(path.join(dir, ".studio"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".studio", "before-api.json"), original);
  fs.writeFileSync(path.join(dir, "lottie.json.tmp"), JSON.stringify(result.lottie, null, 2));
  fs.renameSync(path.join(dir, "lottie.json.tmp"), path.join(dir, "lottie.json"));
  if (result.controls) fs.writeFileSync(path.join(dir, "controls.json"), JSON.stringify(result.controls, null, 2));
  const summary = String(result.summary ?? "Animation generated.");
  if (capture) {
    try {
      const preview = await capture();
      if (signal.aborted) throw new Error("Run cancelled");
      const review = await fetchImpl("https://api.openai.com/v1/responses", {
        method: "POST", signal, headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify({ model: config.model, input: [{ role: "user", content: [
          { type: "input_text", text: `Review this rendered image against the user's animation request. Explain what is visible and any mismatch. This image may be a labelled contact sheet of sampled frames. Sampling does not verify the entire animation or audio. Do not claim that it does.\n\n${prompt}\n\nGeneration summary: ${summary}` },
          { type: "input_image", image_url: preview.dataUrl },
        ] }] }),
      });
      const reviewData = await review.json();
      if (!review.ok) throw new Error("Visual review request failed");
      const feedback = (reviewData.output ?? []).flatMap((item) => item.content ?? []).filter((item) => item.type === "output_text").map((item) => item.text).join("");
      if (!feedback) throw new Error("No visual review was returned");
      return `${summary}\n\nRendered sample review:\n${feedback}`;
    } catch (error) {
      if (signal.aborted) throw error;
      return `${summary}\n\nThe animation was saved, but visual review could not complete: ${error.message}`;
    }
  }
  return summary + "\n\nThe generated result has not yet been visually verified.";
}

module.exports = { runApi, validateResult };
