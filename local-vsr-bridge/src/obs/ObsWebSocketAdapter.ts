import type { ErrorCode, ObsError, ObsScene, ObsSource, ObsStatus, ObsVersionInfo } from "../types/api.js";
import type { AdapterResult, ObsAdapter } from "./ObsAdapter.js";

/** Minimal surface of obs-websocket-js we depend on (lets tests inject a fake). */
export interface ObsClient {
  connect(url: string, password?: string, opts?: { rpcVersion: number }): Promise<{ negotiatedRpcVersion: number }>;
  disconnect(): Promise<void>;
  call(request: string, data?: Record<string, unknown>): Promise<any>;
  on(event: "ConnectionClosed", cb: (err: { code?: number; message?: string }) => void): unknown;
  off?(event: "ConnectionClosed", cb: (err: { code?: number; message?: string }) => void): unknown;
}

export interface AdapterOptions {
  url: string;
  password: string;
  timeoutMs: number;
  autoReconnect: boolean;
  /** backoff base in ms; tests use a small value */
  reconnectBaseMs?: number;
  maxReconnectAttempts?: number;
  log?: (msg: string) => void;
}

const now = () => new Date().toISOString();

/** Maps obs-websocket close codes / socket errors to bridge error codes. */
export function classifyError(err: { code?: number; message?: string } | unknown): { code: ErrorCode; message: string } {
  const e = (err ?? {}) as { code?: number; message?: string };
  const msg = String(e.message ?? "");
  if (e.code === 4009 || /authentication/i.test(msg)) return { code: "AUTH_FAILED", message: "OBS rejected the WebSocket password. Check OBS > Tools > WebSocket Server Settings." };
  if (/ECONNREFUSED|connect failed|1006/i.test(msg) || e.code === 1006) return { code: "CONNECTION_REFUSED", message: "Could not reach OBS. Is OBS running with the WebSocket server enabled on the configured port?" };
  if (/timeout/i.test(msg)) return { code: "TIMEOUT", message: "OBS did not respond in time." };
  if (e.code === 204 || /unknown request|not found/i.test(msg)) return { code: "UNSUPPORTED_REQUEST", message: `OBS does not support this request: ${msg}` };
  return { code: "INTERNAL", message: msg || "Unknown OBS error" };
}

export class ObsWebSocketAdapter implements ObsAdapter {
  private status: ObsStatus = { state: "BRIDGE_READY", connectedAt: null, lastError: null, reconnectAttempts: 0 };
  private client: ObsClient | null = null;
  private manualDisconnect = false;
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(private readonly createClient: () => ObsClient, private readonly opts: AdapterOptions) {}

  getConnectionStatus(): ObsStatus { return { ...this.status }; }
  getLastError(): ObsError | null { return this.status.lastError; }

  private setError(code: ErrorCode, message: string, state: ObsStatus["state"] = "OBS_ERROR") {
    this.status = { ...this.status, state, connectedAt: null, lastError: { code, message, at: now() } };
    this.opts.log?.(`[obs] ${code}: ${message}`);
  }

  private withTimeout<T>(p: Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("timeout")), this.opts.timeoutMs);
      p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
    });
  }

  async connect(): Promise<AdapterResult<ObsVersionInfo>> {
    if (this.status.state === "OBS_CONNECTING") return { ok: false, error: { code: "INVALID_REQUEST", message: "A connection attempt is already in progress", at: now() } };
    if (this.status.state === "OBS_CONNECTED") return this.getObsVersion();
    this.clearReconnect();
    this.manualDisconnect = false;
    this.status = { ...this.status, state: "OBS_CONNECTING" };
    const client = this.createClient();
    try {
      await this.withTimeout(client.connect(this.opts.url, this.opts.password || undefined, { rpcVersion: 1 }));
      // Handshake alone is not enough: require a valid GetVersion response.
      const v = await this.withTimeout(client.call("GetVersion"));
      if (!v || typeof v.obsVersion !== "string") throw new Error("Invalid GetVersion response from OBS");
      this.client = client;
      client.on("ConnectionClosed", (err) => this.onClosed(client, err));
      this.status = { state: "OBS_CONNECTED", connectedAt: now(), lastError: null, reconnectAttempts: 0 };
      return { ok: true, data: toVersion(v) };
    } catch (err) {
      try { await client.disconnect(); } catch { /* ignore */ }
      const c = classifyError(err);
      this.setError(c.code, c.message);
      return { ok: false, error: this.status.lastError! };
    }
  }

  private onClosed(client: ObsClient, err: { code?: number; message?: string }) {
    if (client !== this.client) return;
    this.client = null;
    if (this.manualDisconnect) {
      this.status = { ...this.status, state: "OBS_DISCONNECTED", connectedAt: null };
      return;
    }
    this.setError("UNEXPECTED_DISCONNECT", `OBS connection closed unexpectedly (code ${err?.code ?? "?"}). OBS may have been shut down.`, "OBS_DISCONNECTED");
    this.scheduleReconnect();
  }

  private scheduleReconnect() {
    const max = this.opts.maxReconnectAttempts ?? 10;
    if (!this.opts.autoReconnect || this.status.reconnectAttempts >= max) return;
    const attempt = this.status.reconnectAttempts + 1;
    const delay = Math.min(30000, (this.opts.reconnectBaseMs ?? 2000) * 2 ** (attempt - 1));
    this.status = { ...this.status, reconnectAttempts: attempt };
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      const lastErr = this.status.lastError;
      const r = await this.connect();
      if (!r.ok) {
        // keep the attempt counter and original disconnect context, then retry (read-only, safe)
        this.status = { ...this.status, state: "OBS_DISCONNECTED", reconnectAttempts: attempt, lastError: this.status.lastError ?? lastErr };
        this.scheduleReconnect();
      }
    }, delay);
  }

  private clearReconnect() { if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; } }

  async disconnect(): Promise<void> {
    this.manualDisconnect = true;
    this.clearReconnect();
    const c = this.client;
    this.client = null;
    if (c) { try { await c.disconnect(); } catch { /* ignore */ } }
    this.status = { ...this.status, state: "OBS_DISCONNECTED", connectedAt: null, reconnectAttempts: 0 };
  }

  private async call<T>(request: string, map: (r: any) => T): Promise<AdapterResult<T>> {
    if (!this.client || this.status.state !== "OBS_CONNECTED") {
      return { ok: false, error: { code: "NOT_CONNECTED", message: "OBS is not connected", at: now() } };
    }
    try {
      return { ok: true, data: map(await this.withTimeout(this.client.call(request))) };
    } catch (err) {
      const c = classifyError(err);
      return { ok: false, error: { ...c, at: now() } };
    }
  }

  getObsVersion() { return this.call("GetVersion", toVersion); }

  getAvailableScenes() {
    return this.call("GetSceneList", (r) => {
      if (!Array.isArray(r?.scenes)) throw new Error("Invalid GetSceneList response");
      const scenes: ObsScene[] = r.scenes
        .filter((s: any) => typeof s?.sceneName === "string")
        .map((s: any) => ({ name: s.sceneName, index: Number(s.sceneIndex ?? 0) }));
      return { current: typeof r.currentProgramSceneName === "string" ? r.currentProgramSceneName : null, scenes };
    });
  }

  getSources() {
    return this.call("GetInputList", (r) => {
      if (!Array.isArray(r?.inputs)) throw new Error("Invalid GetInputList response");
      return r.inputs
        .filter((i: any) => typeof i?.inputName === "string")
        .map((i: any): ObsSource => ({ name: i.inputName, kind: String(i.unversionedInputKind ?? i.inputKind ?? "unknown"), discoveredOnly: true }));
    });
  }

  getStudioModeStatus() {
    return this.call("GetStudioModeEnabled", (r) => ({ enabled: Boolean(r?.studioModeEnabled) }));
  }
}

function toVersion(v: any): ObsVersionInfo {
  if (!v || typeof v.obsVersion !== "string") throw new Error("Invalid GetVersion response");
  return {
    obsVersion: v.obsVersion,
    obsWebSocketVersion: String(v.obsWebSocketVersion ?? "unknown"),
    rpcVersion: Number(v.rpcVersion ?? 1),
    platform: String(v.platform ?? "unknown"),
    platformDescription: String(v.platformDescription ?? ""),
  };
}
