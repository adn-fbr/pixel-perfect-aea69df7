import type { MatchClock } from "./clock";

export type IntegrationMode = "DEMO" | "CONNECTING" | "OBS_CONNECTED" | "REPLAY_READY" | "DISCONNECTED";
export type DiscoveryStatus = "IDLE" | "REFRESHING" | "READY" | "ERROR";

export type IncidentStatus = "MARKED" | "CAPTURING" | "READY" | "UNDER_REVIEW" | "COMPLETED" | "FAILED";

export type CameraId = "cam1" | "cam2" | "cam3";

export type MatchStatus = "DRAFT" | "READY" | "LIVE" | "FINISHED";

export interface CameraConfig {
  id: CameraId;
  label: string;
  obsSourceName: string;
}

export interface CameraStatus {
  id: CameraId;
  /** null = unknown / not verifiable in current mode */
  connected: boolean | null;
  recording: boolean | null;
  bufferReady: boolean | null;
  simulated: boolean;
}

export interface MatchConfig {
  id: string;
  name: string;
  homeTeam: string;
  awayTeam: string;
  competition: string;
  matchDate: string;
  period: number;
  homeScore: number;
  awayScore: number;
  recordingDirectory: string;
  replayDurationSec: number;
  preRollSec: number;
  postRollSec: number;
  operatorName: string;
  status: MatchStatus;
  clock: MatchClock;
}

export interface FootageRange {
  startIso: string;
  endIso: string;
}

export interface RecordingAsset {
  filename: string;
  verified: boolean;
  simulated: boolean;
}

export interface Incident {
  id: string;
  matchId: string;
  label: string;
  period: number;
  matchClock: string | null;
  wallClockIso: string;
  cameraId: CameraId;
  recording: RecordingAsset | null;
  preRollSec: number;
  postRollSec: number;
  availableRange: FootageRange | null;
  status: IncidentStatus;
  notes: string;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuditEntry {
  id: string;
  at: string;
  action: string;
  result: "ACCEPTED" | "COMPLETED" | "REJECTED" | "FAILED";
  detail: string;
}

export type PlaybackState = "LIVE" | "PAUSED" | "PLAYING";
export type ReplaySpeed = 0.25 | 0.5 | 1 | 2;

export interface BridgeInfo {
  url: string;
  bridgeVersion: string | null;
  obsState: string | null;
  obsVersion: { obsVersion: string; obsWebSocketVersion: string; platformDescription: string } | null;
  scenes: { name: string; index: number }[];
  currentScene: string | null;
  sources: { name: string; kind: string }[];
  discoveryStatus: DiscoveryStatus;
  discoveryError: { code: string; message: string; at: string } | null;
  lastError: { code: string; message: string; at: string } | null;
  lastCheckedAt: string | null;
}
