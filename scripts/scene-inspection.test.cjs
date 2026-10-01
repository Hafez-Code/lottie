const { test } = require("node:test");
const assert = require("node:assert/strict");
const { inspectScene } = require("../electron/services/scene-inspection.cjs");
const { handleMessage } = require("../electron/services/mcp.cjs");
const scene = { w: 100, h: 100, fr: 30, ip: 15, op: 75, layers: [] };

test("checks missing assets, opacity, timing and cyclic precomps without recursion overflow", () => {
  const doc = { ...scene, layers: [{ ty: 2, refId: "missing", ip: 0, op: 10, ks: { o: { a: 0, k: 0 } } }, { ty: 0, refId: "a" }], assets: [{ id: "a", layers: [{ ty: 0, refId: "a" }] }] };
  const result = inspectScene(doc);
  assert.equal(result.stats.duration, 2);
  assert.equal(result.stats.nodes, 3);
  for (const code of ["missing-asset", "transparent", "never-visible", "cyclic-precomp"]) assert.ok(result.issues.some((issue) => issue.code === code));
});

test("MCP filmstrip includes image and structured frame metadata; failures are tool errors", async () => {
  const call = (name) => ({ id: 1, method: "tools/call", params: { name, arguments: { project: "p", scene: "s" } } });
  const result = await handleMessage(call("capture_scene_frames"), { captureFrames: () => ({ path: "/tmp/frames.png", frames: [0, 10], frame: 0, dataUrl: "data:image/png;base64,AAAA" }) });
  assert.equal(result.result.content[0].type, "image");
  assert.deepEqual(result.result.structuredContent.frames, [0, 10]);
  const failure = await handleMessage(call("capture_scene_frames"), { captureFrames: () => { throw new Error("Scene must be open"); } });
  assert.equal(failure.result.isError, true);
  const check = await handleMessage(call("check_scene"), { getScene: () => ({ lottie: scene }) });
  assert.equal(check.result.structuredContent.issues[0].code, "no-visuals");
});
