import type { ObsError, ObsScene, ObsSource, ObsStatus, ObsVersionInfo } from "../types/api.js";

export type AdapterResult<T> = { ok: true; data: T } | { ok: false; error: ObsError };

/**
 * Read-only OBS operations used in Phase 2. Nothing here mutates OBS scenes,
 * recording settings or encoders. Replay operations will live in a separate
 * ReplayAdapter (later phase) so this interface stays replaceable.
 */
export interface ObsAdapter {
  connect(): Promise<AdapterResult<ObsVersionInfo>>;
  disconnect(): Promise<void>;
  getConnectionStatus(): ObsStatus;
  getObsVersion(): Promise<AdapterResult<ObsVersionInfo>>;
  getAvailableScenes(): Promise<AdapterResult<{ current: string | null; scenes: ObsScene[] }>>;
  getSources(): Promise<AdapterResult<ObsSource[]>>;
  getStudioModeStatus(): Promise<AdapterResult<{ enabled: boolean }>>;
  getLastError(): ObsError | null;
}

/** Future-phase contract only — intentionally not implemented in Phase 2. */
export interface ReplayAdapter {
  getCapabilities(): Promise<AdapterResult<Record<string, "VERIFIED" | "UNVERIFIED" | "UNSUPPORTED">>>;
}
