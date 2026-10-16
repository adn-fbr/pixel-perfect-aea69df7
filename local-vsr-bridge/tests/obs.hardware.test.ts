/**
 * HARDWARE / SYSTEM INTEGRATION TEST — requires a real OBS Studio instance.
 * Run on the OBS PC only:  npm run test:hardware
 * Skipped automatically when OBS_HARDWARE_TEST is not "1".
 */
import OBSWebSocket from "obs-websocket-js";
import { describe, expect, it } from "vitest";
import { ObsWebSocketAdapter, type ObsClient } from "../src/obs/ObsWebSocketAdapter.js";

const run = process.env.OBS_HARDWARE_TEST === "1";

describe.skipIf(!run)("[hardware] real OBS WebSocket", () => {
  it("connects, reads version, scenes and sources", async () => {
    const a = new ObsWebSocketAdapter(() => new OBSWebSocket() as unknown as ObsClient, {
      url: process.env.OBS_WS_URL ?? "ws://127.0.0.1:4455",
      password: process.env.OBS_WS_PASSWORD ?? "",
      timeoutMs: 5000,
      autoReconnect: false,
    });
    const c = await a.connect();
    expect(c.ok, c.ok ? "" : c.error.message).toBe(true);
    const v = await a.getObsVersion();
    console.log("OBS version:", v.ok ? v.data : v.error);
    const s = await a.getAvailableScenes();
    console.log("Scenes:", s.ok ? s.data : s.error);
    const src = await a.getSources();
    console.log("Sources:", src.ok ? src.data : src.error);
    expect(v.ok && s.ok && src.ok).toBe(true);
    await a.disconnect();
  });
});
