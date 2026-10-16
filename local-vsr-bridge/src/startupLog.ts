import type { BridgeConfig } from "./config/config.js";
import { BRIDGE_VERSION } from "./server/app.js";

export function startupLogMessages(config: BridgeConfig): string[] {
  return [
    `\nLocal VSR Bridge v${BRIDGE_VERSION} listening on http://${config.host}:${config.port}`,
    `OBS WebSocket target: configured (password ${config.obsPassword ? "set" : "NOT set"})`,
    `Allowed origins: ${config.allowedOrigins.join(", ")}`,
    "Pairing token is configured. Enter it manually in the Diagnostics screen.",
    "Not connected to OBS yet. Press 'Connect to OBS' in the Diagnostics screen. Ctrl+C to stop.",
  ];
}
