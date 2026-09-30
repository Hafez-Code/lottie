#!/usr/bin/env node
/**
 * Dev orchestrator: start Vite, wait for it, then launch Electron pointed at
 * the dev server. Ctrl+C tears both down.
 */

import { spawn } from "node:child_process";

const root = new URL("..", import.meta.url).pathname;

const vite = spawn("npx", ["vite", "--port", "3030", "--strictPort"], {
  cwd: root,
  stdio: "inherit",
});

let electron = null;
let shuttingDown = false;

function waitForVite(url, timeoutMs = 30_000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(800) });
        if (res.ok) return resolve();
      } catch {
        // not up yet
      }
      if (Date.now() - started > timeoutMs) return reject(new Error("Vite did not start in time"));
      setTimeout(tick, 300);
    };
    void tick();
  });
}

async function main() {
  try {
    await waitForVite("http://localhost:3030/");
  } catch (error) {
    console.error(String(error));
    vite.kill("SIGTERM");
    process.exit(1);
  }

  electron = spawn("npx", ["electron", "."], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, VITE_DEV_SERVER_URL: "http://localhost:3030" },
  });

  electron.on("exit", (code) => {
    if (shuttingDown) return;
    vite.kill("SIGTERM");
    process.exit(code ?? 0);
  });
}

function shutdown() {
  shuttingDown = true;
  electron?.kill("SIGTERM");
  vite.kill("SIGTERM");
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

void main();