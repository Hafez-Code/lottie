const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { runApi } = require("../electron/services/api-provider.cjs");
const { writeSceneBrief } = require("../electron/services/scenes-lib.cjs");

function setup(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "studio-api-"));
  const original = { w: 200, h: 100, fr: 30, ip: 0, op: 60, layers: [] };
  fs.writeFileSync(path.join(dir, "lottie.json"), JSON.stringify(original));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return { dir, original };
}

test("saves a valid API animation with a previous-source backup", async (t) => {
  const { dir, original } = setup(t);
  const generated = { ...original, op: 90 };
  const summary = await runApi({ dir, config: { apiKey: "test-key", model: "test-model" }, prompt: "Create JSON", signal: new AbortController().signal,
    fetchImpl: async (url, init) => {
      assert.equal(url, "https://api.openai.com/v1/responses");
      assert.equal(JSON.parse(init.body).model, "test-model");
      return { ok: true, json: async () => ({ output: [{ content: [{ type: "output_text", text: JSON.stringify({ lottie: generated, summary: "Changed duration" }) }] }] }) };
    },
  });
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "lottie.json"))).op, 90);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, ".studio", "before-api.json"))).op, 60);
  assert.match(summary, /not yet been visually verified/);
});

test("invalid model output preserves the existing animation", async (t) => {
  const { dir, original } = setup(t);
  await assert.rejects(runApi({ dir, config: { apiKey: "key", model: "model" }, prompt: "JSON", signal: new AbortController().signal,
    fetchImpl: async () => ({ ok: true, json: async () => ({ output: [{ content: [{ type: "output_text", text: '{"lottie":{"layers":[]}}' }] }] }) }),
  }), /valid Lottie/);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, "lottie.json"))), original);
});

test("video references preserve MIME, filename and extracted frame files", (t) => {
  const { dir } = setup(t);
  const record = writeSceneBrief(dir, { description: "Use video motion", images: [
    { name: "motion.mp4", dataUrl: "data:video/mp4;base64,aGVsbG8=" },
    { name: "motion.mp4 at 1.00s", dataUrl: "data:image/jpeg;base64,aGVsbG8=" },
  ] });
  assert.deepEqual(record.images, ["reference-1.mp4", "reference-2.jpg"]);
  assert.equal(record.references[0].name, "motion.mp4");
  assert.equal(record.references[1].mime, "image/jpeg");
});

test("API visual review receives the sampled contact sheet and reports its limits", async (t) => {
  const { dir, original } = setup(t);
  let calls = 0;
  const image = "data:image/png;base64,AAAA";
  const result = await runApi({ dir, config: { apiKey: "test", model: "test" }, prompt: "Animate", signal: new AbortController().signal,
    capture: async () => ({ dataUrl: image, frames: [0, 29, 59] }),
    fetchImpl: async (_url, init) => {
      calls++;
      if (calls === 1) return { ok: true, json: async () => ({ output: [{ content: [{ type: "output_text", text: JSON.stringify({ lottie: original, summary: "Saved" }) }] }] }) };
      const content = JSON.parse(init.body).input[0].content;
      assert.equal(content[1].image_url, image);
      assert.match(content[0].text, /Sampling does not verify the entire animation/);
      return { ok: true, json: async () => ({ output: [{ content: [{ type: "output_text", text: "Three samples reviewed" }] }] }) };
    },
  });
  assert.equal(calls, 2);
  assert.match(result, /Three samples reviewed/);
});
