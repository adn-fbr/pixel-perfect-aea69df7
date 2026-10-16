export type BridgeConnectionState =
  | "BRIDGE_READY"
  | "OBS_CONNECTING"
  | "OBS_CONNECTED"
  | "OBS_DISCONNECTED"
  | "OBS_ERROR";

export type ErrorCode =
  | "AUTH_FAILED"
  | "CONNECTION_REFUSED"
  | "TIMEOUT"
  | "NOT_CONNECTED"
  | "UNSUPPORTED_REQUEST"
  | "UNEXPECTED_DISCONNECT"
  | "INVALID_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN_ORIGIN"
  | "FORBIDDEN_HOST"
  | "RATE_LIMITED"
  | "CONFIG_INVALID"
  | "INTERNAL";

export interface ApiResponse<T = unknown> {
  success: boolean;
  timestamp: string;
  message: string;
  data?: T;
  errorCode?: ErrorCode;
}

export interface ObsError {
  code: ErrorCode;
  message: string;
  at: string;
}

export interface ObsVersionInfo {
  obsVersion: string;
  obsWebSocketVersion: string;
  rpcVersion: number;
  platform: string;
  platformDescription: string;
}

export interface ObsScene {
  name: string;
  index: number;
}

export interface ObsSource {
  name: string;
  kind: string;
  /** Discovered in OBS. This does NOT verify the physical camera is working. */
  discoveredOnly: true;
}

export interface ObsStatus {
  state: BridgeConnectionState;
  connectedAt: string | null;
  lastError: ObsError | null;
  reconnectAttempts: number;
}

export function ok<T>(message: string, data?: T): ApiResponse<T> {
  return { success: true, timestamp: new Date().toISOString(), message, ...(data !== undefined ? { data } : {}) };
}

export function fail(errorCode: ErrorCode, message: string): ApiResponse<never> {
  return { success: false, timestamp: new Date().toISOString(), message, errorCode };
}
