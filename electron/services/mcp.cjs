"use strict";

/**
 * Minimal MCP (Model Context Protocol) server over Streamable HTTP.
 *
 * What the agents need, implemented over a plain node:http handler:
 * - POST /mcp    JSON-RPC requests: initialize, tools/list, tools/call
 *                (notifications/initialized -> 202; answered as application/json).
 * - OPTIONS /mcp CORS preflight (agents run outside the browser).
 * - DELETE /mcp  session teardown -> 204.
 *
 * Tool handlers are passed in from the Electron main process so the protocol
 * layer stays independent of the filesystem service layer.
 */

const { inspectScene } = require("./scene-inspection.cjs");

const PROTOCOL_VERSION = "2025-03-26";
const SERVER_INFO = { name: "diffusion-studio", version: "1.0.0" };

function jsonRpcResult(id, result) {
  return { jsonrpc: "2.0", id, result };
}

function jsonRpcError(id, code, message) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

/** JSON Schema definitions for the exposed tools. */
function toolDefinitions() {
  return [
    {
      name: "capture_scene_frames",
      description: "Render 1–12 scene frames into one labelled PNG contact sheet. Defaults to beginning, middle and end. Frame numbers are relative to the first scene frame. Scene must be open; sampled frames do not verify all motion.",
      inputSchema: { type: "object", properties: { project: { type: "string" }, scene: { type: "string" }, frames: { type: "array", minItems: 1, maxItems: 12, items: { type: "integer", minimum: 0 } } }, required: ["project", "scene"] },
    },
    {
      name: "check_scene",
      description: "Inspect Lottie metadata, layer timing, static opacity and precomposition references without rendering. Returns stats and structural issues; capture frames to verify pixels.",
      inputSchema: { type: "object", properties: { project: { type: "string" }, scene: { type: "string" } }, required: ["project", "scene"] },
    },
    {
      name: "capture_scene",
      description: "Render an open scene at a frame and return its PNG image. Reads the latest saved source. The scene must be open in Studio ProMax.",
      inputSchema: { type: "object", properties: { project: { type: "string" }, scene: { type: "string" }, frame: { type: "number", minimum: 0 } }, required: ["project", "scene"] },
    },
    {
      name: "list_projects",
      description: "List all Lottie projects and their scenes, with the active scene flagged.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "get_scene",
      description: "Read the lottie.json body of a scene.",
      inputSchema: {
        type: "object",
        properties: {
          project: { type: "string" },
          scene: { type: "string" },
        },
        required: ["project", "scene"],
      },
    },
    {
      name: "create_project",
      description: "Create a new project with one default scene. Returns the created slugs.",
      inputSchema: {
        type: "object",
        properties: { name: { type: "string" } },
        required: ["name"],
      },
    },
    {
      name: "delete_project",
      description: "Delete a project and all its scenes.",
      inputSchema: {
        type: "object",
        properties: { project: { type: "string" } },
        required: ["project"],
      },
    },
    {
      name: "open_scene",
      description: "Open a scene in the Studio ProMax window.",
      inputSchema: {
        type: "object",
        properties: {
          project: { type: "string" },
          scene: { type: "string" },
        },
        required: ["project", "scene"],
      },
    },
    {
      name: "list_slots",
      description: "List the controllable slots (scalar/color/vec2/text) of a scene.",
      inputSchema: {
        type: "object",
        properties: {
          project: { type: "string" },
          scene: { type: "string" },
        },
        required: ["project", "scene"],
      },
    },
    {
      name: "set_slot_value",
      description:
        "Set a slot's value. Types: text (string), scalar (number), color ('#rrggbb' or [r,g,b,a] 0-1), vec2 ([x,y]).",
      inputSchema: {
        type: "object",
        properties: {
          project: { type: "string" },
          scene: { type: "string" },
          sid: { type: "string" },
          value: {},
        },
        required: ["project", "scene", "sid", "value"],
      },
    },
  ];
}

/**
 * Handle one JSON-RPC message. `deps` comes from the caller:
 * { listProjects, getScene, createProject, deleteProject, openScene, listSlots, setSlotValue }
 */
async function handleMessage(message, deps) {
  const { id, method, params } = message ?? {};

  if (method === "initialize") {
    return jsonRpcResult(id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: SERVER_INFO,
    });
  }

  if (method === "notifications/initialized" || String(method ?? "").startsWith("notifications/")) {
    return null; // notifications get no body (202)
  }

  if (method === "ping") {
    return jsonRpcResult(id, {});
  }

  if (method === "tools/list") {
    return jsonRpcResult(id, { tools: toolDefinitions() });
  }

  if (method === "tools/call") {
    const name = params?.name;
    const args = params?.arguments ?? {};
    try {
      let data;
      switch (name) {
        case "check_scene": { const source = await deps.getScene(args.project, args.scene); data = inspectScene(source.lottie); break; }
        case "capture_scene_frames": data = await deps.captureFrames(args.project, args.scene, args.frames); break;
        case "capture_scene": data = await deps.captureScene(args.project, args.scene, args.frame ?? 0); break;
        case "list_projects": data = await deps.listProjects(); break;
        case "get_scene": data = await deps.getScene(args.project, args.scene); break;
        case "create_project": data = await deps.createProject(args.name); break;
        case "delete_project": data = await deps.deleteProject(args.project); break;
        case "open_scene": data = await deps.openScene(args.project, args.scene); break;
        case "list_slots": data = await deps.listSlots(args.project, args.scene); break;
        case "set_slot_value": data = await deps.setSlotValue(args.project, args.scene, args.sid, args.value); break;
        default:
          return jsonRpcError(id, -32602, `Unknown tool: ${name}`);
      }
      if ((name === "capture_scene" || name === "capture_scene_frames") && (typeof data?.dataUrl !== "string" || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(data.dataUrl))) throw new Error("Renderer returned an invalid PNG image");
      return jsonRpcResult(id, {
        content: (name === "capture_scene" || name === "capture_scene_frames") ? [{ type: "image", data: data.dataUrl.split(",")[1], mimeType: "image/png" }, { type: "text", text: JSON.stringify({ path: data.path, frame: data.frame, ...(data.frames ? { frames: data.frames } : {}) }) }] : [{ type: "text", text: JSON.stringify(data, null, 2) }],
        structuredContent: (name === "capture_scene" || name === "capture_scene_frames") ? { path: data.path, frame: data.frame, ...(data.frames ? { frames: data.frames } : {}) } : data,
      });
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error);
      return jsonRpcResult(id, {
        content: [{ type: "text", text: `Error: ${messageText}` }],
        isError: true,
      });
    }
  }

  if (method === "resources/list" || method === "prompts/list") {
    return jsonRpcResult(id, {});
  }

  return jsonRpcError(id, -32601, `Method not found: ${method}`);
}

/** Wire /mcp (and CORS for it) into a plain node:http server. */
async function handleMcpRequest(req, res, deps) {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  if (url.pathname !== "/mcp") return false;

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type, mcp-session-id, mcp-protocol-version, authorization");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return true;
  }

  if (req.method === "DELETE") {
    res.statusCode = 204;
    res.end();
    return true;
  }

  if (req.method === "GET") {
    // Stateful SSE streams are optional; this server is stateless (POST-only).
    res.writeHead(405, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "SSE streaming not supported; use POST" }));
    return true;
  }

  if (req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "method not allowed" }));
    return true;
  }

  let body = "";
  for await (const chunk of req) body += chunk;

  let messages;
  try {
    const parsed = JSON.parse(body || "{}");
    messages = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify(jsonRpcError(null, -32700, "Parse error")));
    return true;
  }

  const responses = [];
  let hasNotification = false;
  for (const message of messages) {
    const response = await handleMessage(message, deps);
    if (response) responses.push(response);
    else hasNotification = true;
  }

  if (responses.length === 0) {
    res.writeHead(202); // accepted notification
    res.end();
    return true;
  }

  // Mixed batch (notifications + requests): answer as an SSE stream so the
  // notifications are "accepted" while the requests still get their responses.
  if (hasNotification) {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    for (const response of responses) {
      res.write(`event: message\ndata: ${JSON.stringify(response)}\n\n`);
    }
    res.end();
    return true;
  }

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(responses.length === 1 ? responses[0] : responses));
  return true;
}

module.exports = { handleMessage, handleMcpRequest, toolDefinitions, PROTOCOL_VERSION };
