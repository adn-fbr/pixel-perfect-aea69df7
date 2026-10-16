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

/** Maps only known protocol/transport codes; exception messages are untrusted. */
export function classifyError(err: { code?: number | string } | unknown): { code: ErrorCode; message: string } {
  const code = err && typeof err === "object" ? (err as { code?: unknown }).code : undefined;
  if (code === 4009) return { code: "AUTH_FAILED", message: "OBS authentication failed. Check the WebSocket credentials in the bridge configuration." };
  if (code === "ECONNREFUSED" || code === 1006) return { code: "CONNECTION_REFUSED", message: "Could not reach OBS. Confirm that OBS and its WebSocket server are running." };
  if (code === "BRIDGE_TIMEOUT") return { code: "TIMEOUT", message: "OBS did not respond before the bridge request timed out." };
  if (code === 204) return { code: "UNSUPPORTED_REQUEST", message: "OBS does not support the requested WebSocket operation." };
  return { code: "INTERNAL", message: "OBS operation failed. Check the bridge diagnostic code for details." };
}

export class ObsWebSocketAdapter implements ObsAdapter {
  private status: ObsStatus = { state: "BRIDGE_READY", connectedAt: null, lastError: null, reconnectAttempts: 0 };
  private client: ObsClient | null = null;
  private pendingClients = new Set<ObsClient>();
  private connectionGeneration = 0;
  private manualDisconnect = false;
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(private readonly createClient: () => ObsClient, private readonly opts: AdapterOptions) {}

  getConnectionStatus(): ObsStatus { return { ...this.status }; }
  getLastError(): ObsError | null { return this.status.lastError; }

  private setError(code: ErrorCode, message: string, state: ObsStatus["state"] = "OBS_ERROR") {
    this.status = { ...this.status, state, connectedAt: null, lastError: { code, message, at: now() } };
    this.opts.log?.(`[obs] ${code}`);
  }

  private withTimeout<T>(p: Promise<T>, timeoutMs = this.opts.timeoutMs): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const t = setTimeout(() => reject(Object.assign(new Error(), { code: "BRIDGE_TIMEOUT" })), timeoutMs);
      p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
    });
  }

  async connect(): Promise<AdapterResult<ObsVersionInfo>> {
    if (this.status.state === "OBS_CONNECTING") return { ok: false, error: { code: "INVALID_REQUEST", message: "A connection attempt is already in progress", at: now() } };
    if (this.status.state === "OBS_CONNECTED") return this.getObsVersion();
    this.clearReconnect();
    this.manualDisconnect = false;
    const generation = ++this.connectionGeneration;
    this.status = { ...this.status, state: "OBS_CONNECTING" };
    const client = this.createClient();
    this.pendingClients.add(client);
    const deadline = Date.now() + this.opts.timeoutMs;
    try {
      await this.withTimeout(
        client.connect(this.opts.url, this.opts.password || undefined, { rpcVersion: 1 }),
        Math.max(0, deadline - Date.now()),
      );
      if (!this.isCurrentAttempt(generation)) {
        void this.closeClient(client);
        return this.cancelledAttempt();
      }
      // Handshake alone is not enough: require a valid GetVersion response.
      const v = await this.withTimeout(client.call("GetVersion"), Math.max(0, deadline - Date.now()));
      if (!this.isCurrentAttempt(generation)) {
        void this.closeClient(client);
        return this.cancelledAttempt();
      }
      if (!v || typeof v.obsVersion !== "string") throw new Error("Invalid GetVersion response from OBS");
      this.client = client;
      client.on("ConnectionClosed", (err) => this.onClosed(client, err));
      this.status = { state: "OBS_CONNECTED", connectedAt: now(), lastError: null, reconnectAttempts: 0 };
      return { ok: true, data: toVersion(v) };
    } catch (err) {
      if (!this.isCurrentAttempt(generation)) {
        void this.closeClient(client);
        return this.cancelledAttempt();
      }
      const c = classifyError(err);
      this.setError(c.code, c.message);
      void this.closeClient(client);
      return { ok: false, error: this.status.lastError! };
    } finally {
      this.pendingClients.delete(client);
    }
  }

  private isCurrentAttempt(generation: number) {
    return generation === this.connectionGeneration && !this.manualDisconnect;
  }

  private cancelledAttempt(): AdapterResult<ObsVersionInfo> {
    return { ok: false, error: { code: "INVALID_REQUEST", message: "OBS connection attempt was cancelled", at: now() } };
  }

  private async closeClient(client: ObsClient) {
    try { await client.disconnect(); } catch { /* disconnect is best-effort during cancellation */ }
  }

  private onClosed(client: ObsClient, _err: { code?: number; message?: string }) {
    if (client !== this.client) return;
    this.client = null;
    if (this.manualDisconnect) {
      this.status = { ...this.status, state: "OBS_DISCONNECTED", connectedAt: null };
      return;
    }
    this.setError("UNEXPECTED_DISCONNECT", "OBS connection closed unexpectedly. OBS may have been shut down.", "OBS_DISCONNECTED");
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
      const connecting = this.connect();
      const generation = this.connectionGeneration;
      const r = await connecting;
      if (generation !== this.connectionGeneration || this.manualDisconnect) return;
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
    this.connectionGeneration += 1;
    this.clearReconnect();
    const c = this.client;
    this.client = null;
    this.status = { ...this.status, state: "OBS_DISCONNECTED", connectedAt: null, reconnectAttempts: 0 };
    for (const pending of this.pendingClients) void this.closeClient(pending);
    if (c) await this.closeClient(c);
  }

  private async call<T>(request: string, map: (r: any) => T): Promise<AdapterResult<T>> {
    const client = this.client;
    const generation = this.connectionGeneration;
    if (!client || this.status.state !== "OBS_CONNECTED") {
      return { ok: false, error: { code: "NOT_CONNECTED", message: "OBS is not connected", at: now() } };
    }
    try {
      const result = await this.withTimeout(client.call(request));
      if (client !== this.client || generation !== this.connectionGeneration || this.status.state !== "OBS_CONNECTED") {
        return { ok: false, error: { code: "NOT_CONNECTED", message: "OBS is not connected", at: now() } };
      }
      return { ok: true, data: map(result) };
    } catch (err) {
      if (client !== this.client || generation !== this.connectionGeneration || this.status.state !== "OBS_CONNECTED") {
        return { ok: false, error: { code: "NOT_CONNECTED", message: "OBS is not connected", at: now() } };
      }
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
