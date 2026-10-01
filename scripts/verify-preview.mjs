import fs from "node:fs";

const filmstrip = process.argv.includes("--filmstrip");
const res = await fetch(`http://127.0.0.1:3030/api/chat/${filmstrip ? "capture-frames" : "capture"}`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ project: "main-project", scene: "scene-1", ...(filmstrip ? {} : { frame: 15 }) }),
});
const result = await res.json();
if (!res.ok) throw new Error(result.error);
const bytes = Buffer.from(result.dataUrl.split(",")[1], "base64");
if (bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new Error("Renderer did not return a PNG");
const output = filmstrip ? "/tmp/studio-verified-filmstrip.png" : "/tmp/studio-verified-preview.png";
if (filmstrip && (!Array.isArray(result.frames) || result.frames.length < 2)) throw new Error("Expected multiple sampled frames");
fs.writeFileSync(output, bytes);
console.log(JSON.stringify({ frame: result.frame, frames: result.frames, width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), bytes: bytes.length, preview: output }));
