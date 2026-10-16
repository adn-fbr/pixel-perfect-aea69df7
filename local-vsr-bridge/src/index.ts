import { readFileSync, existsSync } from "node:fs";
import OBSWebSocket from "obs-websocket-js";
import { loadConfig } from "./config/config.js";
import { ObsWebSocketAdapter, type ObsClient } from "./obs/ObsWebSocketAdapter.js";
import { buildApp, BRIDGE_VERSION } from "./server/app.js";
import { startupLogMessages } from "./startupLog.js";

/** Minimal .env loader (no extra dependency). Real env vars win. */
function loadDotEnv(path = ".env") {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && m[1] && process.env[m[1]] === undefined) process.env[m[1]] = (m[2] ?? "").replace(/^["']|["']$/g, "");
  }
}

async function main() {
  loadDotEnv();
  const res = loadConfig(process.env);
  if (!res.ok) {
    console.error("Invalid bridge configuration:\n - " + res.errors.join("\n - "));
    process.exit(2);
  }
  const config = res.config;
  const adapter = new ObsWebSocketAdapter(() => new OBSWebSocket() as unknown as ObsClient, {
    url: config.obsUrl,
    password: config.obsPassword,
    timeoutMs: config.obsConnectTimeoutMs,
    autoReconnect: config.obsAutoReconnect,
    log: (m) => console.log(m),
  });
  const app = buildApp(config, adapter, { logger: true });

  const shutdown = async (sig: string) => {
    console.log(`\n${sig} received — closing OBS connection and bridge…`);
    await adapter.disconnect();
    await app.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  await app.listen({ host: config.host, port: config.port });
  for (const message of startupLogMessages(config)) console.log(message);
}

void main();
