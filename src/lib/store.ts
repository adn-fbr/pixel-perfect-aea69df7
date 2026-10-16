import { useSyncExternalStore } from "react";
import { newIncidentId, transitionIncident } from "@/domain/incident";
import type {
  AuditEntry, BridgeInfo, CameraConfig, CameraId, CameraStatus, Incident, IntegrationMode,
  MatchConfig, PlaybackState, ReplaySpeed,
} from "@/domain/types";

export interface AppState {
  mode: IntegrationMode;
  match: MatchConfig;
  cameras: CameraConfig[];
  cameraStatus: CameraStatus[];
  incidents: Incident[];
  audit: AuditEntry[];
  selectedCamera: CameraId;
  activeIncidentId: string | null;
  playback: { state: PlaybackState; positionSec: number; speed: ReplaySpeed };
  bridge: BridgeInfo;
}

const STORAGE_KEY = "vsr-state-v1";

const initial: AppState = {
  mode: "DEMO",
  match: {
    id: "MATCH-001",
    name: "Liga Futsal Kota — Round 4",
    homeTeam: "Garuda FC",
    awayTeam: "Elang Muda",
    competition: "Liga Futsal Kota",
    matchDate: "2026-10-16",
    period: 1,
    homeScore: 0,
    awayScore: 0,
    recordingDirectory: "D:\\VSR\\Recordings",
    replayDurationSec: 30,
    preRollSec: 15,
    postRollSec: 10,
    operatorName: "",
    status: "DRAFT",
  },
  cameras: [
    { id: "cam1", label: "Main / Halfway", obsSourceName: "USB Cam 1" },
    { id: "cam2", label: "Goal Left", obsSourceName: "USB Cam 2" },
    { id: "cam3", label: "Goal Right", obsSourceName: "USB Cam 3" },
  ],
  cameraStatus: (["cam1", "cam2", "cam3"] as CameraId[]).map((id) => ({
    id, connected: true, recording: true, bufferReady: true, simulated: true,
  })),
  incidents: [],
  audit: [],
  selectedCamera: "cam1",
  activeIncidentId: null,
  playback: { state: "LIVE", positionSec: 0, speed: 1 },
  bridge: {
    url: "http://127.0.0.1:4466", bridgeVersion: null, obsState: null, obsVersion: null,
    scenes: [], currentScene: null, sources: [], lastError: null, lastCheckedAt: null,
  },
};

export const DEMO_CAMERA_STATUS = initial.cameraStatus;

let state: AppState = initial;
const listeners = new Set<() => void>();
let hydrated = false;

function emit() {
  if (hydrated && typeof window !== "undefined") {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* ignore quota */ }
  }
  listeners.forEach((l) => l());
}

export function hydrateStore() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<AppState>;
      // Connection state is never restored from storage: always start in DEMO.
      state = { ...initial, ...saved, mode: "DEMO", cameraStatus: initial.cameraStatus,
        bridge: { ...initial.bridge, url: saved.bridge?.url ?? initial.bridge.url } };
    }
  } catch { /* corrupted state: keep defaults */ }
  emit();
}

export function useAppState<T>(sel: (s: AppState) => T): T {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => sel(state),
    () => sel(initial),
  );
}

export function getState() { return state; }

function set(patch: Partial<AppState>) { state = { ...state, ...patch }; emit(); }

let auditSeq = 0;
export function audit(action: string, result: AuditEntry["result"], detail: string) {
  const entry: AuditEntry = { id: `A${Date.now()}-${auditSeq++}`, at: new Date().toISOString(), action, result, detail };
  set({ audit: [entry, ...state.audit].slice(0, 200) });
}

export function updateMatch(patch: Partial<MatchConfig>) { set({ match: { ...state.match, ...patch } }); }
export function updateCamera(id: CameraId, patch: Partial<CameraConfig>) {
  set({ cameras: state.cameras.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
}

export function selectCamera(id: CameraId) {
  set({ selectedCamera: id });
  audit("SELECT_CAMERA", "COMPLETED", id);
}

export function cycleCamera(dir: 1 | -1) {
  const ids: CameraId[] = ["cam1", "cam2", "cam3"];
  const i = ids.indexOf(state.selectedCamera);
  selectCamera(ids[(i + dir + 3) % 3]!);
}

export function markIncident(label = "Incident"): Incident {
  const now = new Date();
  const iso = now.toISOString();
  const inc: Incident = {
    id: newIncidentId(now, state.incidents.length + 1),
    matchId: state.match.id,
    label,
    period: state.match.period,
    matchClock: null,
    wallClockIso: iso,
    cameraId: state.selectedCamera,
    recording: null,
    preRollSec: state.match.preRollSec,
    postRollSec: state.match.postRollSec,
    availableRange: null,
    status: "MARKED",
    notes: "",
    failureReason: null,
    createdAt: iso,
    updatedAt: iso,
  };
  set({ incidents: [inc, ...state.incidents], activeIncidentId: inc.id });
  audit("MARK_INCIDENT", "COMPLETED", `${inc.id} on ${inc.cameraId}`);
  return inc;
}

function replaceIncident(inc: Incident) {
  set({ incidents: state.incidents.map((i) => (i.id === inc.id ? inc : i)) });
}

/** DEMO only: simulates capture + asset verification, clearly labeled as simulated. */
export function saveIncident(id: string | null): { ok: boolean; reason?: string } {
  const inc = state.incidents.find((i) => i.id === id);
  if (!inc) { audit("SAVE_INCIDENT", "REJECTED", "No active incident"); return { ok: false, reason: "No active incident — mark one first" }; }
  if (state.mode !== "DEMO") {
    audit("SAVE_INCIDENT", "REJECTED", "Bridge not implemented");
    return { ok: false, reason: "Local bridge not implemented yet (Phase 2)" };
  }
  const now = new Date().toISOString();
  const cap = transitionIncident(inc, "CAPTURING", now);
  if (!cap.ok) { audit("SAVE_INCIDENT", "REJECTED", cap.reason); return { ok: false, reason: cap.reason }; }
  const t = new Date(inc.wallClockIso).getTime();
  const withAsset: Incident = {
    ...cap.incident,
    recording: { filename: `${inc.cameraId}_${inc.id}.mkv`, verified: true, simulated: true },
    availableRange: {
      startIso: new Date(t - inc.preRollSec * 1000).toISOString(),
      endIso: new Date(t + inc.postRollSec * 1000).toISOString(),
    },
  };
  const ready = transitionIncident(withAsset, "READY", now);
  if (!ready.ok) { audit("SAVE_INCIDENT", "FAILED", ready.reason); return { ok: false, reason: ready.reason }; }
  replaceIncident(ready.incident);
  audit("SAVE_INCIDENT", "COMPLETED", `${inc.id} READY (simulated asset)`);
  return { ok: true };
}

export function setIncidentStatus(id: string, to: Incident["status"], reason?: string) {
  const inc = state.incidents.find((i) => i.id === id);
  if (!inc) return { ok: false, reason: "Not found" };
  const r = transitionIncident(inc, to, new Date().toISOString(), reason);
  if (!r.ok) { audit("SET_STATUS", "REJECTED", `${id}: ${r.reason}`); return r; }
  replaceIncident(r.incident);
  audit("SET_STATUS", "COMPLETED", `${id} → ${to}`);
  return r;
}

export function updateIncidentNotes(id: string, notes: string) {
  const inc = state.incidents.find((i) => i.id === id);
  if (inc) replaceIncident({ ...inc, notes, updatedAt: new Date().toISOString() });
}

export function setActiveIncident(id: string) { set({ activeIncidentId: id }); }

export function replayAvailable(): { ok: boolean; reason?: string } {
  if (state.mode !== "DEMO") return { ok: false, reason: "Replay capability not verified (Phase 2 connects to OBS only)" };
  const inc = state.incidents.find((i) => i.id === state.activeIncidentId);
  if (!inc) return { ok: false, reason: "No incident selected" };
  if (!["READY", "UNDER_REVIEW"].includes(inc.status)) return { ok: false, reason: `Incident is ${inc.status}, not READY` };
  return { ok: true };
}

export function setPlayback(patch: Partial<AppState["playback"]>) { set({ playback: { ...state.playback, ...patch } }); }

export function deleteAllIncidents() {
  set({ incidents: [], activeIncidentId: null });
  audit("DELETE_INCIDENTS", "COMPLETED", "All incident metadata cleared (no video files touched)");
}

export function setMode(mode: IntegrationMode) {
  if (state.mode === mode) return;
  // Leaving DEMO: simulated camera health is replaced by "unknown" — not verified in Phase 2.
  const cameraStatus = mode === "DEMO"
    ? initial.cameraStatus
    : state.cameraStatus.map((c) => ({ ...c, connected: null, recording: null, bufferReady: null, simulated: false }));
  set({ mode, cameraStatus, ...(mode !== "DEMO" ? { playback: { ...state.playback, state: "LIVE" as const, positionSec: 0 } } : {}) });
  audit("MODE", "COMPLETED", mode);
}

export function updateBridge(patch: Partial<BridgeInfo>) { set({ bridge: { ...state.bridge, ...patch } }); }
