const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const { PassThrough } = require("node:stream");
const { createChatService, runnerArgs, eventText } = require("../electron/services/chat.cjs");

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-chat-"));
  const dir = path.join(root, "project", "scene-1");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "lottie.json"), JSON.stringify({ w: 100, h: 100, fr: 30, ip: 0, op: 60, layers: [] }));
  fs.writeFileSync(path.join(dir, "brief.json"), JSON.stringify({ description: "Create a logo reveal", images: ["reference-1.png"] }));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  let child;
  let invocation;
  const service = createChatService({ projectsDir: root, resolveExecutable: () => "/fake/codex", spawnProcess: (exe, args, options) => {
    invocation = { exe, args, options };
    child = new EventEmitter();
    child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.stdin = new PassThrough();
    child.kill = () => { child.emit("close", null); };
    return child;
  } });
  return { service, root, dir, child: () => child, invocation: () => invocation };
}

test("runs a saved brief without duplicating it, parses chunked events and persists a completed conversation", (t) => {
  const f = fixture(t);
  f.service.start({ project: "project", scene: "scene-1", agent: "codex", useBrief: true });
  assert.equal(f.invocation().options.shell, false);
  assert.equal(f.invocation().options.cwd, fs.realpathSync(f.dir));
  assert.throws(() => f.service.start({ project: "project", scene: "scene-1", agent: "codex", text: "again" }), /already working/);
  const event = JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "Updated the logo" } });
  f.child().stdout.write(event.slice(0, 15)); f.child().stdout.write(event.slice(15));
  f.child().emit("close", 0);
  const saved = createChatService({ projectsDir: f.root }).load("project", "scene-1");
  assert.equal(saved.run.status, "completed");
  assert.equal(saved.messages.filter((m) => m.role === "user").length, 1);
  assert.equal(saved.messages.at(-1).text, "Updated the logo");
});

test("reports agent failure even with a zero exit code", (t) => {
  const f = fixture(t);
  f.service.start({ project: "project", scene: "scene-1", agent: "codex", useBrief: true });
  f.child().stdout.write(JSON.stringify({ type: "turn.failed", error: { message: "Sign in required" } }) + "\n");
  f.child().emit("close", 0);
  assert.equal(f.service.load("project", "scene-1").run.status, "failed");
  assert.match(f.service.load("project", "scene-1").run.error, /Sign in/);
});

test("cancellation remains cancelled and follow-ups retain selected layer context", (t) => {
  const f = fixture(t);
  f.service.start({ project: "project", scene: "scene-1", agent: "codex", text: "Change color", context: { frame: 10, layer: { index: 2, name: "Logo" } } });
  f.service.stop("project", "scene-1");
  const session = f.service.load("project", "scene-1");
  assert.equal(session.run.status, "cancelled");
  assert.equal(session.messages.at(-2).context.layer.name, "Logo");
});

test("rejects escaping paths, symlink scenes and unavailable agents", (t) => {
  const f = fixture(t);
  assert.throws(() => f.service.load("../outside", "scene-1"), /Invalid/);
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "studio-outside-"));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  fs.symlinkSync(outside, path.join(f.root, "project", "escape"));
  assert.throws(() => f.service.load("project", "escape"), /Scene not found/);
  assert.throws(() => f.service.start({ project: "project", scene: "scene-1", agent: "untrusted" }), /Install/);
});

test("marks an unfinished persisted run interrupted after restart", (t) => {
  const f = fixture(t);
  f.service.start({ project: "project", scene: "scene-1", agent: "codex", useBrief: true });
  const restored = createChatService({ projectsDir: f.root }).load("project", "scene-1");
  assert.equal(restored.run.status, "interrupted");
  f.child().emit("close", 0);
});

test("keeps prompt text out of a shell and does not disable agent safeguards", () => {
  const args = runnerArgs("codex", "$(touch /tmp/unwanted)");
  assert.ok(args.includes("workspace-write"));
  assert.ok(!args.some((a) => a.includes("bypass")));
  assert.equal(args.at(-1), "-");
});

test("a failed saved request can be retried without duplicating the user's brief", (t) => {
  const f = fixture(t);
  f.service.start({ project: "project", scene: "scene-1", agent: "codex", useBrief: true });
  f.child().emit("close", 1);
  f.service.start({ project: "project", scene: "scene-1", agent: "codex", useBrief: true });
  f.child().emit("close", 0);
  assert.equal(f.service.load("project", "scene-1").messages.filter((m) => m.role === "user").length, 1);
});

test("capture requests are routed to their scene and resolved with the rendered PNG", async (t) => {
  const f = fixture(t);
  const promise = f.service.requestCapture("project", "scene-1", 15);
  assert.equal(f.service.pendingCaptures("other", "scene-1").length, 0);
  const [job] = f.service.pendingCaptures("project", "scene-1");
  f.service.finishCapture({ id: job.id, project: "project", scene: "scene-1", dataUrl: "data:image/png;base64,aGVsbG8=" });
  const image = await promise;
  assert.equal(image.frame, 15);
  assert.ok(fs.existsSync(image.path));
  assert.equal(f.service.pendingCaptures("project", "scene-1").length, 0);
});

test("API keys do not appear in discovery results or persisted conversation", async (t) => {
  const f = fixture(t);
  const service = createChatService({ projectsDir: f.root, getProvider: () => ({ apiKey: "test-secret", model: "test-model" }), runApiImpl: async () => "Animation generated" });
  service.start({ project: "project", scene: "scene-1", agent: "openai-api", useBrief: true });
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(!JSON.stringify(service.discover()).includes("test-secret"));
  assert.ok(!fs.readFileSync(path.join(f.dir, ".studio", "chat.json"), "utf8").includes("test-secret"));
  assert.equal(service.load("project", "scene-1").run.status, "completed");
});

test("parses Claude and OpenCode responses and never treats an empty error result as success", () => {
  assert.equal(eventText("claude-code", { type: "assistant", message: { content: [{ type: "text", text: "Updated" }] } }), "Updated");
  assert.equal(eventText("opencode", { type: "text", part: { text: "Done" } }), "Done");
  assert.throws(() => eventText("claude-code", { type: "result", is_error: true, result: "", errors: [] }), /Claude run failed/);
  assert.throws(() => eventText("opencode", { type: "error", error: { data: { message: "No credentials" } } }), /No credentials/);
});

test("filmstrip samples relative frames, preserves each capture and rejects invalid positions", async (t) => {
  const f = fixture(t);
  const png = "data:image/png;base64,iVBORw0KGgo=";
  const first = f.service.requestFilmstrip("project", "scene-1");
  const [job] = f.service.pendingCaptures("project", "scene-1");
  assert.deepEqual(job.frames, [0, 29, 59]);
  f.service.finishCapture({ id: job.id, project: "project", scene: "scene-1", dataUrl: png });
  const result = await first;
  assert.deepEqual(result.frames, job.frames);
  const second = f.service.requestFilmstrip("project", "scene-1", [10]);
  const [next] = f.service.pendingCaptures("project", "scene-1");
  f.service.finishCapture({ id: next.id, project: "project", scene: "scene-1", dataUrl: png });
  assert.notEqual((await second).path, result.path);
  assert.ok(fs.existsSync(result.path));
  for (const frames of [[], [-1], [60], [0.5], new Array(13).fill(0)]) assert.throws(() => f.service.requestFilmstrip("project", "scene-1", frames), /1–12/);
});
