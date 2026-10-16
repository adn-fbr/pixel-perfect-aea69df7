import { bridgeCall } from "./bridge";
import { audit, getState, setMode, updateBridge } from "./store";
import type { BridgeInfo } from "@/domain/types";

type Version = NonNullable<BridgeInfo["obsVersion"]>;

/** Deliberate operator action: health → connect → read version/scenes/sources. */
export async function connectToObs() {
  const url = getState().bridge.url;
  const prevMode = getState().mode;
  setMode("CONNECTING");
  audit("BRIDGE_CONNECT", "ACCEPTED", url);

  const health = await bridgeCall<{ bridgeVersion: string }>(url, "/api/health");
  if (!health.success) {
    updateBridge({ lastError: err(health), lastCheckedAt: now(), obsState: null });
    setMode(prevMode === "CONNECTING" ? "DEMO" : prevMode === "OBS_CONNECTED" ? "DISCONNECTED" : prevMode);
    audit("BRIDGE_CONNECT", "FAILED", health.message);
    return;
  }
  updateBridge({ bridgeVersion: health.data?.bridgeVersion ?? null });

  const c = await bridgeCall<Version>(url, "/api/obs/connect", "POST", 15000);
  if (!c.success) {
    updateBridge({ lastError: err(c), lastCheckedAt: now(), obsState: "OBS_ERROR", obsVersion: null });
    setMode("DISCONNECTED");
    audit("OBS_CONNECT", "FAILED", `${c.errorCode}: ${c.message}`);
    return;
  }
  updateBridge({ obsVersion: c.data ?? null, obsState: "OBS_CONNECTED", lastError: null });
  setMode("OBS_CONNECTED");
  audit("OBS_CONNECT", "COMPLETED", `OBS ${c.data?.obsVersion}`);
  await refreshDiscovery();
}

export async function refreshDiscovery() {
  const url = getState().bridge.url;
  const [scenes, sources] = await Promise.all([
    bridgeCall<{ current: string | null; scenes: { name: string; index: number }[] }>(url, "/api/obs/scenes"),
    bridgeCall<{ name: string; kind: string }[]>(url, "/api/obs/sources"),
  ]);
  updateBridge({
    scenes: scenes.success ? scenes.data?.scenes ?? [] : [],
    currentScene: scenes.success ? scenes.data?.current ?? null : null,
    sources: sources.success ? sources.data ?? [] : [],
    lastCheckedAt: now(),
    ...(!scenes.success ? { lastError: err(scenes) } : !sources.success ? { lastError: err(sources) } : {}),
  });
  if (!scenes.success || !sources.success) setMode("DEGRADED");
}

/** Polls real OBS state; called periodically while not in DEMO. */
export async function pollStatus() {
  const s = getState();
  if (s.mode === "DEMO" || s.mode === "CONNECTING") return;
  const r = await bridgeCall<{ state: string; lastError: BridgeInfo["lastError"] }>(s.bridge.url, "/api/obs/status");
  if (!r.success) {
    updateBridge({ obsState: null, lastError: err(r), lastCheckedAt: now() });
    if (s.mode !== "DISCONNECTED") { setMode("DISCONNECTED"); audit("BRIDGE_STATUS", "FAILED", r.message); }
    return;
  }
  const st = r.data?.state ?? null;
  updateBridge({ obsState: st, lastCheckedAt: now(), ...(r.data?.lastError ? { lastError: r.data.lastError } : {}) });
  if (st === "OBS_CONNECTED" && (s.mode === "DISCONNECTED")) { setMode("OBS_CONNECTED"); void refreshDiscovery(); }
  if (st !== "OBS_CONNECTED" && s.mode !== "DISCONNECTED") { setMode("DISCONNECTED"); audit("OBS_STATUS", "FAILED", `OBS state ${st}`); }
}

export async function disconnectObs() {
  const url = getState().bridge.url;
  const r = await bridgeCall(url, "/api/obs/disconnect", "POST");
  audit("OBS_DISCONNECT", r.success ? "COMPLETED" : "FAILED", r.message);
  updateBridge({ obsState: r.success ? "OBS_DISCONNECTED" : null, obsVersion: null, scenes: [], sources: [], currentScene: null });
  setMode("DISCONNECTED");
}

export function returnToDemo() {
  updateBridge({ obsState: null, obsVersion: null, scenes: [], sources: [], currentScene: null });
  setMode("DEMO");
}

const now = () => new Date().toISOString();
const err = (r: { errorCode?: string; message: string; timestamp: string }) => ({ code: r.errorCode ?? "UNKNOWN", message: r.message, at: r.timestamp });
