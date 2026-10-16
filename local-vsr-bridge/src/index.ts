import { readFileSync, existsSync } from "node:fs";
import OBSWebSocket from "obs-websocket-js";
import { loadConfig } from "./config/config.js";
import { ObsWebSocketAdapter, type ObsClient } from "./obs/ObsWebSocketAdapter.js";
import { buildApp, BRIDGE_VERSION } from "./server/app.js";

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
  console.log(`\nLocal VSR Bridge v${BRIDGE_VERSION} listening on http://${config.host}:${config.port}`);
  console.log(`OBS target: ${config.obsUrl} (password ${config.obsPassword ? "set" : "NOT set"})`);
  console.log(`Allowed origins: ${config.allowedOrigins.join(", ")}`);
  if (config.pairingTokenGenerated) {
    console.log(`\nPairing token (paste into Diagnostics, valid until the bridge stops):\n  ${config.pairingToken}\n`);
  } else {
    console.log("Pairing token: using BRIDGE_PAIRING_TOKEN from .env");
  }
  console.log("Not connected to OBS yet. Press 'Connect to OBS' in the Diagnostics screen. Ctrl+C to stop.");
}

void main();
