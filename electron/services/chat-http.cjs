"use strict";

async function handleChatRequest(req, res, chat) {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (!url.pathname.startsWith("/api/chat")) return false;
  const json = (status, body) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };
  // Browser requests must originate from this server, never an unrelated site.
  if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}` && req.headers.origin !== chat.allowedOrigin) { json(403, { error: "Cross-origin requests are not allowed" }); return true; }
  try {
    if (url.pathname === "/api/chat/agents" && req.method === "GET") { json(200, { agents: chat.discover() }); return true; }
    if (url.pathname === "/api/chat/capture-pending" && req.method === "GET") { json(200, chat.pendingCaptures(url.searchParams.get("project"), url.searchParams.get("scene"))); return true; }
    if (url.pathname === "/api/chat" && req.method === "GET") { json(200, chat.load(url.searchParams.get("project"), url.searchParams.get("scene"))); return true; }
    if (req.method !== "POST" || !["/api/chat/run", "/api/chat/stop", "/api/chat/preview", "/api/chat/provider", "/api/chat/capture", "/api/chat/capture-frames", "/api/chat/capture-result"].includes(url.pathname)) { json(405, { error: "method not allowed" }); return true; }
    if (!req.headers["content-type"]?.startsWith("application/json")) { json(415, { error: "Expected application/json" }); return true; }
    let raw = "";
      for await (const chunk of req) { raw += chunk; if (raw.length > 40_000_000) { json(413, { error: "Request too large" }); return true; } }
    const body = JSON.parse(raw);
    if (url.pathname === "/api/chat/capture-frames") { json(200, await chat.requestFilmstrip(body.project, body.scene, body.frames)); return true; }
    if (url.pathname === "/api/chat/capture") { json(200, await chat.requestCapture(body.project, body.scene, body.frame ?? 0)); return true; }
    if (url.pathname === "/api/chat/capture-result") { json(200, chat.finishCapture(body)); return true; }
    const result = url.pathname.endsWith("/provider") ? chat.configureProvider(body) : url.pathname.endsWith("/run") ? chat.start(body) : url.pathname.endsWith("/stop") ? chat.stop(body.project, body.scene) : chat.preview(body.project, body.scene, body.dataUrl);
    json(200, result);
  } catch (error) { json(400, { error: error.message }); }
  return true;
}

module.exports = { handleChatRequest };
