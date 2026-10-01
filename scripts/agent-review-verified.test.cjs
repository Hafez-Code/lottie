"use strict";

/**
 * Independent regression tests for the multi-frame (filmstrip) capture path and
 * the structural scene inspection added with it.
 *
 * Surfaces under test:
 *   - electron/services/scene-inspection.cjs  (inspectScene)
 *   - electron/services/mcp.cjs               (check_scene, capture_scene,
 *                                              capture_scene_frames)
 *   - electron/services/chat.cjs              (requestFilmstrip/requestCapture,
 *                                              pendingCaptures, finishCapture)
 *
 * Run:  node --test scripts/agent-review-verified.test.cjs
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createChatService } = require("../electron/services/chat.cjs");
const { handleMessage, toolDefinitions } = require("../electron/services/mcp.cjs");
const { inspectScene } = require("../electron/services/scene-inspection.cjs");

const BASE64 = "aGVsbG8="; // "hello"
const PNG = `data:image/png;base64,${BASE64}`;

/** A throwaway projects tree holding one scene, plus a chat service over it. */
function fixture(t, lottie = { w: 100, h: 100, fr: 30, ip: 0, op: 60, layers: [] }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-filmstrip-review-"));
  const project = "project";
  const scene = "scene-1";
  const dir = path.join(root, project, scene);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "lottie.json"), JSON.stringify(lottie));
  const service = createChatService({ projectsDir: root });
  t.after(() => {
    service.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  // The service reports realpaths, and macOS tmpdirs live behind /private.
  return { service, root, dir: fs.realpathSync(dir), project, scene };
}

const call = (name, args) => ({ id: 1, method: "tools/call", params: { name, arguments: args } });
/** Let a submitted tools/call reach the point where its job is registered. */
const settle = () => new Promise((resolve) => setImmediate(resolve));
const codes = (report) => report.issues.map((issue) => issue.code);

// ---------------------------------------------------------------------------
// inspectScene — structure
// ---------------------------------------------------------------------------

test("inspectScene counts nested precomp layers, kinds, depth and duration", () => {
  const report = inspectScene({
    w: 200, h: 100, fr: 20, ip: 0, op: 100,
    layers: [
      { ty: 4, nm: "background" },
      { ty: 0, refId: "pre" },
      { ty: 3, ind: 7, ip: 10, op: 20 },
    ],
    assets: [{ id: "pre", layers: [{ ty: 2, refId: "img", ip: 0, op: 50 }] }],
  });
  assert.deepEqual(report.stats, {
    nodes: 4,
    byKind: { shape: 1, precomp: 1, null: 1, image: 1 },
    depth: 1,
    duration: 5,
  });
  // The nested image layer points at an asset that was never declared.
  assert.deepEqual(codes(report), ["missing-asset"]);
  assert.equal(report.issues[0].node, "pre/0:image");
  assert.match(report.limitations, /Structural analysis only/);
});

test("inspectScene flags zero-duration, never-visible, hidden and transparent layers", () => {
  const report = inspectScene({
    w: 100, h: 100, fr: 30, ip: 10, op: 40,
    layers: [
      { ty: 4, ip: 12, op: 12 }, // ends where it starts
      { ty: 4, ip: 0, op: 10 }, // finishes before the scene opens
      { ty: 4, ip: 40, op: 50 }, // starts after the scene closes
      { ty: 4, ip: 10, op: 40 }, // exactly the scene, clean
      { ty: 4, hd: 1 },
      { ty: 4, ks: { o: { a: 0, k: 0 } } },
    ],
  });
  assert.deepEqual(codes(report).sort(), ["hidden", "never-visible", "never-visible", "transparent", "zero-duration"]);
  assert.equal(report.stats.nodes, 6);
  assert.equal(report.stats.duration, 1);
});

test("inspectScene reports invalid metadata but still walks the layers", () => {
  const report = inspectScene({ w: 0, h: 100, fr: 30, ip: 0, op: 60, layers: [{ ty: 4 }] });
  assert.deepEqual(codes(report), ["invalid-metadata"]);
  assert.equal(report.stats.nodes, 1, "a bad canvas size must not hide the layer analysis");
  assert.equal(report.stats.duration, 0, "an unusable timeline must not report a duration");
});

test("inspectScene rejects anything that is not a Lottie document", () => {
  for (const doc of [null, undefined, [], "lottie", 42, {}, { layers: {} }, { layers: null }]) {
    const report = inspectScene(doc);
    assert.deepEqual(codes(report), ["invalid-document"], `expected invalid-document for ${JSON.stringify(doc) ?? String(doc)}`);
    assert.equal(report.stats.nodes, 0);
  }
});

test("inspectScene detects self-referential and mutual precomp cycles without recursing", () => {
  const selfCycle = { w: 10, h: 10, fr: 10, ip: 0, op: 10, layers: [{ ty: 0, refId: "a" }], assets: [{ id: "a", layers: [{ ty: 0, refId: "a" }] }] };
  assert.deepEqual(codes(inspectScene(selfCycle)), ["cyclic-precomp"]);

  const mutual = { w: 10, h: 10, fr: 10, ip: 0, op: 10, layers: [{ ty: 0, refId: "a" }], assets: [{ id: "a", layers: [{ ty: 0, refId: "b" }] }, { id: "b", layers: [{ ty: 0, refId: "a" }] }] };
  assert.deepEqual(codes(inspectScene(mutual)), ["cyclic-precomp"]);
});

test("inspectScene reports a precomp whose layers are not an array instead of recursing", () => {
  for (const layers of [null, 5, {}]) {
    const report = inspectScene({ w: 10, h: 10, fr: 10, ip: 0, op: 10, layers: [{ ty: 0, refId: "a" }], assets: [{ id: "a", layers }] });
    assert.deepEqual(codes(report), ["invalid-precomp"], `layers=${JSON.stringify(layers)}`);
  }
});

test("inspectScene describes malformed assets and layers instead of throwing", () => {
  // Regression guard: a model can plausibly emit `assets: {}` (not an array),
  // `assets: [null]` or `layers: [null]`. Each must come back as a structural
  // finding, because check_scene has no other way to report it.
  const base = { w: 100, h: 100, fr: 30, ip: 0, op: 60, layers: [] };
  const cases = [
    [{ assets: {} }, "invalid-assets"],
    [{ assets: 5 }, "invalid-assets"],
    [{ assets: "x" }, "invalid-assets"],
    [{ assets: [null] }, "invalid-asset"],
    [{ assets: [{ id: 7 }] }, "invalid-asset"],
    [{ layers: [null] }, "invalid-layer"],
    [{ layers: [5] }, "invalid-layer"],
  ];
  for (const [patch, expected] of cases) {
    let report;
    assert.doesNotThrow(() => { report = inspectScene({ ...base, ...patch }); }, `${JSON.stringify(patch)} must not crash`);
    assert.ok(codes(report).includes(expected), `${JSON.stringify(patch)} must report ${expected}, got ${JSON.stringify(codes(report))}`);
    assert.ok(Array.isArray(report.issues) && report.stats, "a malformed document still yields a usable report");
  }
});

// ---------------------------------------------------------------------------
// MCP: check_scene
// ---------------------------------------------------------------------------

test("check_scene mirrors its structured report into the JSON text block", async () => {
  const doc = { w: 100, h: 100, fr: 30, ip: 0, op: 60, layers: [{ ty: 4, ks: { o: { a: 0, k: 0 } } }] };
  let asked = null;
  const res = await handleMessage(call("check_scene", { project: "p", scene: "s" }), {
    getScene: (project, scene) => {
      asked = [project, scene];
      return { lottie: doc };
    },
  });
  assert.deepEqual(asked, ["p", "s"]);
  assert.equal(res.result.isError, undefined);
  assert.equal(res.result.structuredContent.stats.nodes, 1);
  assert.deepEqual(codes(res.result.structuredContent), ["transparent"]);
  assert.match(res.result.content[0].text, /"transparent"/);
  assert.match(res.result.structuredContent.limitations, /Structural analysis only/);
});

test("check_scene reports a malformed model document as a finding, not a tool failure", async () => {
  const res = await handleMessage(call("check_scene", { project: "p", scene: "s" }), {
    getScene: () => ({ lottie: { w: 100, h: 100, fr: 30, ip: 0, op: 60, layers: [], assets: {} } }),
  });
  assert.notEqual(res.result.isError, true, "a malformed document is a finding, not a tool failure");
  assert.deepEqual(codes(res.result.structuredContent), ["invalid-assets", "no-visuals"]);
  assert.match(res.result.content[0].text, /invalid-assets/);
});

test("MCP protocol plumbing answers notifications, ping and unknown methods", async () => {
  assert.equal(await handleMessage({ method: "notifications/initialized" }, {}), null);
  assert.deepEqual((await handleMessage({ id: 2, method: "ping" }, {})).result, {});
  const unknown = await handleMessage({ id: 3, method: "tools/nope" }, {});
  assert.equal(unknown.error.code, -32601);
});

// ---------------------------------------------------------------------------
// Filmstrip capture — sampling
// ---------------------------------------------------------------------------

test("requestFilmstrip samples beginning, middle and end and de-duplicates short scenes", async (t) => {
  const expectations = [
    [{ ip: 0, op: 60 }, [0, 29, 59]],
    [{ ip: 0, op: 2 }, [0, 1]],
    [{ ip: 0, op: 1 }, [0]],
    [{ ip: 10, op: 40 }, [0, 14, 29]], // frames are relative to the first scene frame
  ];
  for (const [timing, frames] of expectations) {
    const f = fixture(t, { w: 10, h: 10, fr: 30, layers: [], ...timing });
    const promise = f.service.requestFilmstrip(f.project, f.scene);
    const [job] = f.service.pendingCaptures(f.project, f.scene);
    assert.deepEqual(job.frames, frames, `${JSON.stringify(timing)} must sample ${frames}`);
    assert.equal(job.frame, frames[0], "the job's frame is the first sampled frame");
    f.service.finishCapture({ id: job.id, project: f.project, scene: f.scene, dataUrl: PNG });
    assert.deepEqual((await promise).frames, frames);
  }
});

test("requestFilmstrip treats a missing frame list as an automatic sample, not an empty one", async (t) => {
  const f = fixture(t);
  for (const frames of [undefined, null]) {
    const promise = f.service.requestFilmstrip(f.project, f.scene, frames);
    const jobs = f.service.pendingCaptures(f.project, f.scene);
    assert.equal(jobs.length, 1, "a nullish list must queue the automatic sample");
    assert.deepEqual(jobs[0].frames, [0, 29, 59]);
    f.service.finishCapture({ id: jobs[0].id, project: f.project, scene: f.scene, dataUrl: PNG });
    await promise;
  }
});

test("requestFilmstrip keeps the caller's frame order, including repeats and descending runs", async (t) => {
  for (const frames of [[59, 0, 30], [0, 0, 59], [7]]) {
    const f = fixture(t);
    const promise = f.service.requestFilmstrip(f.project, f.scene, frames);
    const [job] = f.service.pendingCaptures(f.project, f.scene);
    assert.deepEqual(job.frames, frames, "explicit frames must reach the renderer unchanged");
    assert.equal(job.frame, frames[0]);
    f.service.finishCapture({ id: job.id, project: f.project, scene: f.scene, dataUrl: PNG });
    assert.deepEqual((await promise).frames, frames);
  }
});

test("requestFilmstrip rejects frame sets that are empty, fractional, negative, out of range or too long", (t) => {
  const f = fixture(t);
  const invalid = [[], [0.5], [-1], [60], [0, 60], Array.from({ length: 13 }, (_, i) => i), "0", [null]];
  for (const frames of invalid) {
    assert.throws(
      () => f.service.requestFilmstrip(f.project, f.scene, frames),
      /1–12 integer frames/,
      `frames=${JSON.stringify(frames)} must be rejected`,
    );
  }
  assert.equal(f.service.pendingCaptures(f.project, f.scene).length, 0, "rejected requests must not queue work");
});

test("requestFilmstrip refuses a scene whose timeline is unusable", (t) => {
  const f = fixture(t, { w: 10, h: 10, fr: 30, ip: 0, op: 0, layers: [] });
  assert.throws(() => f.service.requestFilmstrip(f.project, f.scene), /Invalid scene duration/);
  assert.equal(f.service.pendingCaptures(f.project, f.scene).length, 0);
});

test("capture requests reject bad slugs before they touch the filesystem", (t) => {
  const f = fixture(t);
  for (const [project, scene] of [["..", "s"], ["p", "../s"], ["p", "a/b"], ["p", "with space"]]) {
    assert.throws(() => f.service.requestFilmstrip(project, scene), /Invalid project or scene/, `${project}/${scene}`);
  }
});

test("a missing scene is reported as not found without leaking a server path", (t) => {
  // Regression guard: sceneDir must swallow its realpathSync ENOENT, otherwise
  // the HTTP layer echoes the server's absolute path back to the client.
  const f = fixture(t);
  assert.throws(
    () => f.service.requestFilmstrip(f.project, "no-such-scene"),
    (error) => {
      assert.equal(error.message, "Scene not found", "callers get the friendly error, not a raw fs error");
      assert.doesNotMatch(error.message, /studio-filmstrip-review-/, "the server path must not leak to the client");
      return true;
    },
  );
  assert.equal(f.service.pendingCaptures(f.project, "no-such-scene").length, 0);
});

test("a scene folder without lottie.json is reported as not found", (t) => {
  const f = fixture(t);
  fs.mkdirSync(path.join(f.root, f.project, "empty-scene"), { recursive: true });
  assert.throws(() => f.service.requestFilmstrip(f.project, "empty-scene"), /Scene not found/);
});

// ---------------------------------------------------------------------------
// Filmstrip capture — job lifecycle
// ---------------------------------------------------------------------------

test("each capture resolves to its own PNG file and its own frame metadata", async (t) => {
  const f = fixture(t);
  const promise = f.service.requestFilmstrip(f.project, f.scene, [0, 30]);
  const [job] = f.service.pendingCaptures(f.project, f.scene);
  assert.deepEqual(job.frames, [0, 30]);
  const result = f.service.finishCapture({ id: job.id, project: f.project, scene: f.scene, dataUrl: PNG });
  assert.deepEqual(result, { ok: true });
  const settled = await promise;
  assert.equal(settled.path, path.join(f.dir, ".studio", "captures", `${job.id}.png`));
  assert.equal(fs.readFileSync(settled.path).toString("base64"), BASE64, "the PNG bytes must be the renderer's payload");
  assert.deepEqual(settled.frames, [0, 30]);
  assert.equal(f.service.pendingCaptures(f.project, f.scene).length, 0, "a finished job leaves the queue");
});

test("a job is only settled by a result for its own project and scene", async (t) => {
  const f = fixture(t);
  const promise = f.service.requestCapture(f.project, f.scene, 3);
  const [job] = f.service.pendingCaptures(f.project, f.scene);
  assert.throws(
    () => f.service.finishCapture({ id: job.id, project: "other", scene: f.scene, dataUrl: PNG }),
    /Preview request expired/,
  );
  assert.equal(f.service.pendingCaptures(f.project, f.scene).length, 1, "a foreign result must not consume the job");
  f.service.finishCapture({ id: job.id, project: f.project, scene: f.scene, dataUrl: PNG });
  assert.equal((await promise).frame, 3);
});

test("a capture that reports an error rejects the caller and clears the queue", async (t) => {
  const f = fixture(t);
  const promise = f.service.requestCapture(f.project, f.scene, 0);
  const [job] = f.service.pendingCaptures(f.project, f.scene);
  f.service.finishCapture({ id: job.id, project: f.project, scene: f.scene, error: "Renderer crashed" });
  await assert.rejects(promise, /Renderer crashed/);
  assert.equal(f.service.pendingCaptures(f.project, f.scene).length, 0);
});

test("a refused preview settles its caller at once and clears the queue", async (t) => {
  // Regression guard: a bad data URL must reject the awaiting tools/call
  // immediately, not leave the job queued until its 20s timeout.
  const f = fixture(t);
  const promise = f.service.requestCapture(f.project, f.scene, 0);
  const [job] = f.service.pendingCaptures(f.project, f.scene);
  assert.throws(() => f.service.finishCapture({ id: job.id, project: f.project, scene: f.scene, dataUrl: "not a data url" }), /PNG preview/);
  await assert.rejects(promise, /PNG preview/);
  assert.equal(f.service.pendingCaptures(f.project, f.scene).length, 0, "a refused result must not leave the job queued");
});

test("a capture that cannot be written settles its caller instead of orphaning it", async (t) => {
  // Regression guard for the worst case: chat.cjs used to delete the job and
  // clear its timer before writing the PNG, so a storage failure left the
  // promise pending forever with no queue entry left to retry.
  const f = fixture(t);
  fs.mkdirSync(path.join(f.dir, ".studio"), { recursive: true });
  fs.writeFileSync(path.join(f.dir, ".studio", "captures"), "not a directory");
  const promise = f.service.requestCapture(f.project, f.scene, 0);
  const [job] = f.service.pendingCaptures(f.project, f.scene);
  assert.throws(
    () => f.service.finishCapture({ id: job.id, project: f.project, scene: f.scene, dataUrl: PNG }),
    /EEXIST|ENOTDIR/,
  );
  const outcome = await Promise.race([
    promise.then(() => "settled", () => "settled"),
    new Promise((resolve) => setTimeout(() => resolve("still pending"), 200)),
  ]);
  assert.equal(outcome, "settled", "a failed write must settle the request");
  assert.equal(f.service.pendingCaptures(f.project, f.scene).length, 0);
});

test("close() rejects every pending capture so no caller is left waiting", async (t) => {
  const f = fixture(t);
  const first = f.service.requestCapture(f.project, f.scene, 0);
  const second = f.service.requestCapture(f.project, f.scene, 1);
  const firstSettled = assert.rejects(first, /Preview service closed/);
  const secondSettled = assert.rejects(second, /Preview service closed/);
  f.service.close();
  await Promise.all([firstSettled, secondSettled]);
  assert.equal(f.service.pendingCaptures(f.project, f.scene).length, 0);
});

// ---------------------------------------------------------------------------
// MCP: capture_scene / capture_scene_frames
// ---------------------------------------------------------------------------

test("capture_scene_frames advertises the 1–12 frame contact-sheet budget", () => {
  const tool = toolDefinitions().find((definition) => definition.name === "capture_scene_frames");
  assert.ok(tool, "capture_scene_frames must be advertised to agents");
  assert.equal(tool.inputSchema.properties.frames.minItems, 1);
  assert.equal(tool.inputSchema.properties.frames.maxItems, 12);
  assert.equal(tool.inputSchema.properties.frames.items.minimum, 0);
  assert.deepEqual(tool.inputSchema.required, ["project", "scene"]);
});

test("capture_scene_frames returns the sheet as base64 image plus structured frame metadata", async (t) => {
  const f = fixture(t);
  const pending = handleMessage(call("capture_scene_frames", { project: f.project, scene: f.scene, frames: [0, 30, 59] }), {
    captureFrames: (project, scene, frames) => f.service.requestFilmstrip(project, scene, frames),
  });
  await settle();
  const [job] = f.service.pendingCaptures(f.project, f.scene);
  assert.deepEqual(job.frames, [0, 30, 59]);
  f.service.finishCapture({ id: job.id, project: f.project, scene: f.scene, dataUrl: PNG });

  const res = await pending;
  assert.equal(res.result.isError, undefined);
  assert.deepEqual(res.result.content[0], { type: "image", data: BASE64, mimeType: "image/png" });
  assert.equal(res.result.structuredContent.frame, 0, "the sheet's headline frame is the first sampled frame");
  assert.deepEqual(res.result.structuredContent.frames, [0, 30, 59]);
  assert.equal(res.result.structuredContent.path, path.join(f.dir, ".studio", "captures", `${job.id}.png`));
  assert.equal(res.result.structuredContent.dataUrl, undefined, "the structured payload must not repeat the whole image");
  assert.match(res.result.content[1].text, /"frames":\[0,30,59\]/);
  assert.equal(f.service.pendingCaptures(f.project, f.scene).length, 0);
});

test("capture_scene reports a single frame without sheet metadata", async (t) => {
  const f = fixture(t);
  const pending = handleMessage(call("capture_scene", { project: f.project, scene: f.scene, frame: 12 }), {
    captureScene: (project, scene, frame) => f.service.requestCapture(project, scene, frame),
  });
  await settle();
  const [job] = f.service.pendingCaptures(f.project, f.scene);
  assert.equal(job.frame, 12);
  assert.equal(job.frames, undefined, "a single capture must not pretend to be a filmstrip");
  f.service.finishCapture({ id: job.id, project: f.project, scene: f.scene, dataUrl: PNG });
  const res = await pending;
  assert.deepEqual(Object.keys(res.result.structuredContent).sort(), ["frame", "path"]);
  assert.equal(res.result.content[0].type, "image");
});

test("an out-of-range frame is a tool error, not a protocol error, and queues nothing", async (t) => {
  const f = fixture(t);
  const res = await handleMessage(call("capture_scene_frames", { project: f.project, scene: f.scene, frames: [60] }), {
    captureFrames: (project, scene, frames) => f.service.requestFilmstrip(project, scene, frames),
  });
  assert.equal(res.error, undefined, "tool failures stay in the result, not the JSON-RPC envelope");
  assert.equal(res.result.isError, true);
  assert.match(res.result.content[0].text, /1–12 integer frames/);
  assert.equal(f.service.pendingCaptures(f.project, f.scene).length, 0);
});

test("a renderer payload that is not a PNG surfaces as a tool error, never an empty image", async () => {
  // The tool now validates `data.dataUrl` before building the image block, but
  // the duplicate of that guard in the catch block (mcp.cjs:177) references
  // `data`, which `let data` scopes to the try block: every failing capture
  // call raises ReferenceError out of handleMessage and the HTTP layer answers
  // 500 {"error":"data is not defined"} instead of an isError tool result.
  // This test therefore fails on the tool-error path, not on the contract.
  const res = await handleMessage(call("capture_scene", { project: "p", scene: "s" }), {
    captureScene: async () => ({ dataUrl: "about:blank", path: "/tmp/x.png", frame: 0 }),
  });
  const [image] = res.result.content;
  assert.ok(
    res.result.isError === true || (typeof image.data === "string" && image.data.length > 0),
    "an image block must carry base64 data, or the call must fail loudly",
  );
});

test("unknown MCP tools are protocol errors and never reach a handler", async () => {
  const res = await handleMessage(call("capture_everything", {}), {});
  assert.equal(res.error.code, -32602);
  assert.match(res.error.message, /Unknown tool/);
});

test("excessive acyclic precomp depth returns an explicit incomplete-analysis issue", () => {
  const assets = Array.from({ length: 150 }, (_, i) => ({ id: `a${i}`, layers: i < 149 ? [{ ty: 0, refId: `a${i + 1}` }] : [{ ty: 4 }] }));
  const report = inspectScene({ w: 100, h: 100, fr: 30, ip: 0, op: 60, layers: [{ ty: 0, refId: "a0" }], assets });
  assert.ok(report.issues.some((issue) => issue.code === "analysis-limit" && /incomplete/.test(issue.message)));
  assert.ok(report.limitations);
});
