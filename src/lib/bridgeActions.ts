import { bridgeCall } from "./bridge";
import { audit, getState, setMode, updateBridge } from "./store";
import type { BridgeInfo } from "@/domain/types";

type Version = NonNullable<BridgeInfo["obsVersion"]>;

let discoverySequence = 0;
let connectionGeneration = 0;
let statusSequence = 0;

function invalidatePendingRequests() {
  discoverySequence += 1;
  connectionGeneration += 1;
  statusSequence += 1;
}

/** Deliberate operator action: health → connect → read version/scenes/sources. */
export async function connectToObs() {
  invalidatePendingRequests();
  const url = getState().bridge.url;
  const prevMode = getState().mode;
  setMode("CONNECTING");
  updateBridge({ discoveryStatus: "IDLE", discoveryError: null });
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
    updateBridge({
      lastError: err(c), lastCheckedAt: now(), obsState: "OBS_ERROR", obsVersion: null,
      discoveryStatus: "IDLE", discoveryError: null,
    });
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
  const current = getState();
  const request = ++discoverySequence;
  const generation = connectionGeneration;
  const url = current.bridge.url;
  if (current.mode !== "OBS_CONNECTED" || current.bridge.obsState !== "OBS_CONNECTED") {
    updateBridge({
      discoveryStatus: "ERROR",
      discoveryError: { code: "NOT_CONNECTED", message: "OBS connection is not confirmed; discovery was not performed.", at: now() },
      lastCheckedAt: now(),
    });
    return;
  }
  updateBridge({ discoveryStatus: "REFRESHING", discoveryError: null });
  const [scenes, sources] = await Promise.all([
    bridgeCall<{ current: string | null; scenes: { name: string; index: number }[] }>(url, "/api/obs/scenes"),
    bridgeCall<{ name: string; kind: string }[]>(url, "/api/obs/sources"),
  ]);
  const latest = getState();
  if (
    request !== discoverySequence ||
    generation !== connectionGeneration ||
    latest.mode !== "OBS_CONNECTED" ||
    latest.bridge.obsState !== "OBS_CONNECTED"
  ) return;

  const failed = !scenes.success ? scenes : !sources.success ? sources : null;
  updateBridge({
    scenes: scenes.success ? scenes.data?.scenes ?? [] : [],
    currentScene: scenes.success ? scenes.data?.current ?? null : null,
    sources: sources.success ? sources.data ?? [] : [],
    discoveryStatus: failed ? "ERROR" : "READY",
    discoveryError: failed ? err(failed) : null,
    lastCheckedAt: now(),
  });
}

/** Polls real OBS state; called periodically while not in DEMO. */
export async function pollStatus() {
  const s = getState();
  if (s.mode === "DEMO" || s.mode === "CONNECTING") return;
  const request = ++statusSequence;
  const r = await bridgeCall<{ state: string; lastError: BridgeInfo["lastError"] }>(s.bridge.url, "/api/obs/status");
  if (request !== statusSequence) return;
  if (!r.success) {
    invalidatePendingRequests();
    updateBridge({
      obsState: null, lastError: err(r), lastCheckedAt: now(), scenes: [], sources: [], currentScene: null,
      discoveryStatus: "IDLE", discoveryError: null,
    });
    if (getState().mode !== "DISCONNECTED") { setMode("DISCONNECTED"); audit("BRIDGE_STATUS", "FAILED", r.message); }
    return;
  }
  const st = r.data?.state ?? null;
  if (st !== "OBS_CONNECTED") {
    invalidatePendingRequests();
    updateBridge({
      obsState: st, lastError: r.data?.lastError ?? null, lastCheckedAt: now(), scenes: [], sources: [], currentScene: null,
      discoveryStatus: "IDLE", discoveryError: null,
    });
    if (getState().mode !== "DISCONNECTED") { setMode("DISCONNECTED"); audit("OBS_STATUS", "FAILED", `OBS state ${st}`); }
    return;
  }
  const recovering = getState().mode !== "OBS_CONNECTED" || getState().bridge.obsState !== "OBS_CONNECTED";
  if (recovering) invalidatePendingRequests();
  updateBridge({ obsState: st, lastError: r.data?.lastError ?? null, lastCheckedAt: now() });
  if (recovering) {
    setMode("OBS_CONNECTED");
    void refreshDiscovery();
  }
}

export async function disconnectObs() {
  invalidatePendingRequests();
  const url = getState().bridge.url;
  const r = await bridgeCall(url, "/api/obs/disconnect", "POST");
  audit("OBS_DISCONNECT", r.success ? "COMPLETED" : "FAILED", r.message);
  updateBridge({
    obsState: r.success ? "OBS_DISCONNECTED" : null, obsVersion: null, scenes: [], sources: [], currentScene: null,
    discoveryStatus: "IDLE", discoveryError: null,
  });
  setMode("DISCONNECTED");
}

export function returnToDemo() {
  invalidatePendingRequests();
  updateBridge({
    obsState: null, obsVersion: null, scenes: [], sources: [], currentScene: null,
    discoveryStatus: "IDLE", discoveryError: null,
  });
  setMode("DEMO");
}

const now = () => new Date().toISOString();
const err = (r: { errorCode?: string; message: string; timestamp: string }) => ({ code: r.errorCode ?? "UNKNOWN", message: r.message, at: r.timestamp });
