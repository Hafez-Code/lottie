"use strict";
// Retained API regression cases from the first Ollama/Claude run, reviewed by the coordinator.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { runApi, validateResult } = require("../electron/services/api-provider.cjs");
const PNG = "data:image/png;base64,aGVsbG8=";

test("a failed visual review keeps the saved animation and never claims verification", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "studio-review-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const original = { w: 200, h: 100, fr: 30, ip: 0, op: 60, layers: [] };
  fs.writeFileSync(path.join(dir, "lottie.json"), JSON.stringify(original));
  let calls = 0;
  const result = await runApi({
    dir,
    config: { apiKey: "k", model: "m" },
    prompt: "Animate a reveal",
    signal: new AbortController().signal,
    capture: async () => ({ dataUrl: PNG, frames: [0, 29, 59] }),
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) {
        return { ok: true, json: async () => ({ output: [{ content: [{ type: "output_text", text: JSON.stringify({ lottie: { ...original, op: 90 }, summary: "Saved" }) }] }] }) };
      }
      return { ok: false, json: async () => ({ error: { message: "quota" } }) };
    },
  });
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "lottie.json"))).op, 90, "the animation stays saved");
  assert.match(result, /could not complete/);
  assert.doesNotMatch(result, /verified/i, "a failed review must not claim visual verification");
});

test("validateResult rejects malformed assets with a controlled message", () => {
  // electron/services/api-provider.cjs:9 dereferences `asset.p` and calls
  // `doc.assets?.some` without checking the shapes, so `assets: {}` or
  // `assets: [null]` raises a raw TypeError. Callers get "Cannot read properties
  // of null (reading 'p')" instead of the controlled, user-facing rejection.
  const base = { w: 200, h: 100, fr: 30, ip: 0, op: 60, layers: [] };
  for (const assets of [{}, [null]]) {
    assert.throws(
      () => validateResult({ lottie: { ...base, assets } }),
      (error) => error instanceof Error && !/Cannot read properties|is not a function/.test(error.message),
      `assets=${JSON.stringify(assets)} must fail with a controlled validation error`,
    );
  }
});
