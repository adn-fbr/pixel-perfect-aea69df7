/**
 * MOCK TESTS — no real OBS is involved. A fake obs-websocket client is injected
 * into the real ObsWebSocketAdapter. Passing these does NOT verify OBS integration.
 */
import { describe, expect, it, vi } from "vitest";
import { loadConfig, type BridgeConfig } from "../src/config/config.js";
import { ObsWebSocketAdapter, type ObsClient } from "../src/obs/ObsWebSocketAdapter.js";
import { buildApp } from "../src/server/app.js";
import { redact } from "../src/diagnostics/redact.js";
import { isAllowedHost } from "../src/security/guards.js";

const TOKEN = "t".repeat(32);
const PASSWORD = "super-secret-obs-pw";

function cfg(): BridgeConfig {
  const r = loadConfig({ BRIDGE_PAIRING_TOKEN: TOKEN, OBS_WS_PASSWORD: PASSWORD, BRIDGE_ALLOWED_ORIGINS: "http://localhost:8080" });
  if (!r.ok) throw new Error(r.errors.join());
  return r.config;
}

class FakeObs implements ObsClient {
  closeCb: ((e: { code?: number; message?: string }) => void) | null = null;
  disconnectCalls = 0;
  private finishConnect: (() => void) | null = null;
  private versionCalls = 0;
  private finishVersion: (() => void) | null = null;
  constructor(private behavior: "ok" | "badpw" | "refused" | "hang" | "deferred-connect" | "deferred-second-version" | "sensitive-error" = "ok") {}
  async connect(_u: string, pw?: string) {
    if (this.behavior === "hang") return new Promise<never>(() => {});
    if (this.behavior === "refused") throw Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:4455"), { code: 1006 });
    if (this.behavior === "deferred-connect") {
      await new Promise<void>((resolve) => { this.finishConnect = resolve; });
      return { negotiatedRpcVersion: 1 };
    }
    if (this.behavior === "sensitive-error") {
      throw Object.assign(new Error(`authentication payload password=${PASSWORD} token=${TOKEN} url=ws://127.0.0.1:4455`), { code: "EINTERNAL" });
    }
    if (this.behavior === "badpw" || pw !== PASSWORD) throw Object.assign(new Error("Authentication failed."), { code: 4009 });
    return { negotiatedRpcVersion: 1 };
  }
  completeConnect() { this.finishConnect?.(); }
  completeVersion() { this.finishVersion?.(); }
  async disconnect() { this.disconnectCalls += 1; }
  async call(req: string) {
    if (req === "GetVersion") {
      this.versionCalls += 1;
      if (this.behavior === "deferred-second-version" && this.versionCalls === 2) {
        await new Promise<void>((resolve) => { this.finishVersion = resolve; });
      }
      return { obsVersion: "32.2.2", obsWebSocketVersion: "5.6.3", rpcVersion: 1, platform: "windows", platformDescription: "Windows 11" };
    }
    if (req === "GetSceneList") return { currentProgramSceneName: "Main", scenes: [{ sceneName: "Main", sceneIndex: 0 }, { bogus: 1 }] };
    if (req === "GetInputList") return { inputs: [{ inputName: "USB Cam 1", inputKind: "dshow_input", unversionedInputKind: "dshow_input" }, { nope: true }] };
    if (req === "GetStudioModeEnabled") return { studioModeEnabled: false };
    throw Object.assign(new Error("Unknown request type"), { code: 204 });
  }
  on(_e: "ConnectionClosed", cb: (e: { code?: number; message?: string }) => void) { this.closeCb = cb; }
}

function setup(behaviors: Array<"ok" | "badpw" | "refused" | "hang" | "deferred-connect" | "deferred-second-version" | "sensitive-error"> = ["ok"], autoReconnect = false) {
  const c = cfg();
  const clients: FakeObs[] = [];
  const logs: string[] = [];
  let n = 0;
  const adapter = new ObsWebSocketAdapter(() => { const f = new FakeObs(behaviors[Math.min(n++, behaviors.length - 1)]); clients.push(f); return f; }, {
    url: c.obsUrl, password: c.obsPassword, timeoutMs: 100, autoReconnect, reconnectBaseMs: 5,
    log: (message) => logs.push(message),
  });
  const app = buildApp(c, adapter);
  const H = { host: "127.0.0.1:4466", "x-vsr-token": TOKEN };
  return { app, adapter, clients, H, logs };
}

describe("[mock] config validation", () => {
  it("rejects a non-loopback bind address", () => {
    expect(loadConfig({ BRIDGE_HOST: "0.0.0.0" }).ok).toBe(false);
  });
  it("rejects wildcard origins and short tokens", () => {
    expect(loadConfig({ BRIDGE_ALLOWED_ORIGINS: "*" }).ok).toBe(false);
    expect(loadConfig({ BRIDGE_PAIRING_TOKEN: "short" }).ok).toBe(false);
  });
  it("defaults to 127.0.0.1:4466 and OBS port 4455, generating a token", () => {
    const r = loadConfig({});
    expect(r.ok && r.config.host).toBe("127.0.0.1");
    expect(r.ok && r.config.port).toBe(4466);
    expect(r.ok && r.config.obsUrl).toBe("ws://127.0.0.1:4455");
    expect(r.ok && r.config.pairingTokenGenerated).toBe(true);
  });
});

describe("[mock] health & security", () => {
  it("health reports bridge only, never OBS connectivity", async () => {
    const { app } = setup();
    const r = await app.inject({ url: "/api/health", headers: { host: "127.0.0.1:4466" } });
    expect(r.statusCode).toBe(200);
    expect(r.json().data.bridge).toBe("BRIDGE_READY");
    expect(JSON.stringify(r.json())).not.toContain("OBS_CONNECTED");
  });
  it("rejects requests without the pairing token", async () => {
    const { app } = setup();
    const r = await app.inject({ method: "POST", url: "/api/obs/connect", headers: { host: "127.0.0.1:4466" } });
    expect(r.statusCode).toBe(401);
    expect(r.json().errorCode).toBe("UNAUTHORIZED");
  });
  it("rejects unexpected Host headers (DNS rebinding)", async () => {
    expect(isAllowedHost("evil.example:4466", 4466)).toBe(false);
    const { app, H } = setup();
    const r = await app.inject({ url: "/api/health", headers: { ...H, host: "evil.example:4466" } });
    expect(r.statusCode).toBe(403);
  });
  it("rejects disallowed origins", async () => {
    const { app, H } = setup();
    const r = await app.inject({ url: "/api/obs/status", headers: { ...H, origin: "https://evil.example" } });
    expect(r.statusCode).toBe(403);
    expect(r.json().errorCode).toBe("FORBIDDEN_ORIGIN");
  });
  it("rejects request bodies with unexpected fields", async () => {
    const { app, H } = setup();
    const r = await app.inject({ method: "POST", url: "/api/obs/connect", headers: H, payload: { password: "x" } });
    expect(r.statusCode).toBe(400);
  });
  it("rejects oversized bodies", async () => {
    const { app, H } = setup();
    const r = await app.inject({ method: "POST", url: "/api/obs/connect", headers: { ...H, "content-type": "application/json" }, payload: JSON.stringify({ x: "a".repeat(10000) }) });
    expect(r.statusCode).toBe(413);
  });
  it("does not return parser exception details to the browser", async () => {
    const { app, H } = setup();
    const r = await app.inject({
      method: "POST", url: "/api/obs/connect", headers: { ...H, "content-type": "application/json" },
      payload: `{"${PASSWORD}${TOKEN}"`,
    });
    expect(r.statusCode).toBe(400);
    expect(r.body).not.toContain(PASSWORD);
    expect(r.body).not.toContain(TOKEN);
    expect(r.body).not.toContain("SyntaxError");
  });
});

describe("[mock] OBS connection", () => {
  it("connects only after handshake + valid GetVersion", async () => {
    const { app, H } = setup();
    const r = await app.inject({ method: "POST", url: "/api/obs/connect", headers: H });
    expect(r.statusCode).toBe(200);
    expect(r.json().data.obsVersion).toBe("32.2.2");
    const s = await app.inject({ url: "/api/obs/status", headers: H });
    expect(s.json().data.state).toBe("OBS_CONNECTED");
  });
  it("reports wrong password as AUTH_FAILED without leaking it", async () => {
    const { app, H } = setup(["badpw"]);
    const r = await app.inject({ method: "POST", url: "/api/obs/connect", headers: H });
    expect(r.json().errorCode).toBe("AUTH_FAILED");
    expect(r.body).not.toContain(PASSWORD);
  });
  it("reports OBS not running as CONNECTION_REFUSED", async () => {
    const { app, H } = setup(["refused"]);
    const r = await app.inject({ method: "POST", url: "/api/obs/connect", headers: H });
    expect(r.json().errorCode).toBe("CONNECTION_REFUSED");
  });
  it("reports a hung handshake as TIMEOUT", async () => {
    const { app, H } = setup(["hang"]);
    const r = await app.inject({ method: "POST", url: "/api/obs/connect", headers: H });
    expect(r.json().errorCode).toBe("TIMEOUT");
  });
  it("does not expose raw OBS exception details in logs or API errors", async () => {
    const { app, H, logs } = setup(["sensitive-error"]);
    const r = await app.inject({ method: "POST", url: "/api/obs/connect", headers: H });
    const output = `${JSON.stringify(logs)} ${r.body}`;
    expect(r.statusCode).toBe(502);
    expect(r.json().errorCode).toBe("INTERNAL");
    expect(output).toContain("[obs] INTERNAL");
    expect(output).not.toContain(PASSWORD);
    expect(output).not.toContain(TOKEN);
    expect(output).not.toContain("authentication payload");
    expect(output).not.toContain("ws://127.0.0.1:4455");
  });
  it("returns 409 for scenes when not connected", async () => {
    const { app, H } = setup();
    const r = await app.inject({ url: "/api/obs/scenes", headers: H });
    expect(r.statusCode).toBe(409);
  });
  it("validates scene and source responses, dropping malformed items", async () => {
    const { app, H } = setup();
    await app.inject({ method: "POST", url: "/api/obs/connect", headers: H });
    const sc = (await app.inject({ url: "/api/obs/scenes", headers: H })).json();
    expect(sc.data.scenes).toEqual([{ name: "Main", index: 0 }]);
    const so = (await app.inject({ url: "/api/obs/sources", headers: H })).json();
    expect(so.data).toEqual([{ name: "USB Cam 1", kind: "dshow_input", discoveredOnly: true }]);
  });
  it("detects unexpected disconnection", async () => {
    const { app, adapter, clients, H } = setup();
    await app.inject({ method: "POST", url: "/api/obs/connect", headers: H });
    clients[0]!.closeCb!({ code: 1001, message: "OBS shutting down" });
    expect(adapter.getConnectionStatus().state).toBe("OBS_DISCONNECTED");
    expect(adapter.getLastError()?.code).toBe("UNEXPECTED_DISCONNECT");
  });
  it("reconnects automatically after an unexpected drop", async () => {
    const { app, adapter, clients, H } = setup(["ok", "refused", "ok"], true);
    await app.inject({ method: "POST", url: "/api/obs/connect", headers: H });
    clients[0]!.closeCb!({ code: 1006 });
    await vi.waitFor(() => expect(adapter.getConnectionStatus().state).toBe("OBS_CONNECTED"), { timeout: 1000 });
    expect(clients.length).toBe(3);
  });
  it("does not reconnect after a deliberate disconnect", async () => {
    const { app, adapter, clients, H } = setup(["ok"], true);
    await app.inject({ method: "POST", url: "/api/obs/connect", headers: H });
    await app.inject({ method: "POST", url: "/api/obs/disconnect", headers: H });
    await new Promise((r) => setTimeout(r, 50));
    expect(adapter.getConnectionStatus().state).toBe("OBS_DISCONNECTED");
    expect(clients.length).toBe(1);
  });
  it("invalidates an in-flight handshake when deliberately disconnected", async () => {
    const { adapter, clients } = setup(["deferred-connect"], true);
    const pendingConnect = adapter.connect();
    const oldClient = clients[0]!;
    await adapter.disconnect();

    expect(adapter.getConnectionStatus().state).toBe("OBS_DISCONNECTED");
    expect(oldClient.disconnectCalls).toBeGreaterThan(0);
    oldClient.completeConnect();
    const result = await pendingConnect;

    expect(result).toMatchObject({ ok: false, error: { code: "INVALID_REQUEST", message: "OBS connection attempt was cancelled" } });
    expect(adapter.getConnectionStatus().state).toBe("OBS_DISCONNECTED");
    expect(clients).toHaveLength(1);
  });
  it("does not schedule another reconnect when a retry is intentionally disconnected", async () => {
    vi.useFakeTimers();
    try {
      const { adapter, clients } = setup(["ok", "deferred-connect", "ok"], true);
      await adapter.connect();
      clients[0]!.closeCb!({ code: 1006 });
      vi.advanceTimersByTime(5);
      expect(clients).toHaveLength(2);

      await adapter.disconnect();
      clients[1]!.completeConnect();
      for (let i = 0; i < 5; i += 1) await Promise.resolve();

      expect(adapter.getConnectionStatus().state).toBe("OBS_DISCONNECTED");
      expect(clients).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });
  it("allows a fresh explicit connection after cancelling an in-flight attempt", async () => {
    const { adapter, clients } = setup(["deferred-connect", "ok"], true);
    const pendingConnect = adapter.connect();
    const staleClient = clients[0]!;
    await adapter.disconnect();
    staleClient.completeConnect();
    await pendingConnect;

    const freshResult = await adapter.connect();
    expect(freshResult.ok).toBe(true);
    expect(adapter.getConnectionStatus().state).toBe("OBS_CONNECTED");
    expect(clients).toHaveLength(2);
  });
  it("leaves connection state out of CONNECTING after a failed attempt", async () => {
    const { adapter } = setup(["refused"]);
    const result = await adapter.connect();
    expect(result).toMatchObject({ ok: false, error: { code: "CONNECTION_REFUSED" } });
    expect(adapter.getConnectionStatus().state).toBe("OBS_ERROR");
  });
  it("discards a late version response from the disconnected session", async () => {
    const { adapter, clients } = setup(["deferred-second-version"]);
    expect((await adapter.connect()).ok).toBe(true);
    const pendingVersion = adapter.getObsVersion();
    await adapter.disconnect();
    clients[0]!.completeVersion();

    expect(await pendingVersion).toMatchObject({ ok: false, error: { code: "NOT_CONNECTED" } });
    expect(adapter.getConnectionStatus().state).toBe("OBS_DISCONNECTED");
  });
});

describe("[mock] secret redaction", () => {
  it("redacts secret keys and known secret values", () => {
    const out = redact({ password: "p", nested: { authToken: "x" }, msg: `failed with ${PASSWORD}` }, [PASSWORD]);
    expect(out).toEqual({ password: "[REDACTED]", nested: { authToken: "[REDACTED]" }, msg: "failed with [REDACTED]" });
  });
  it("status response never contains the OBS password or pairing token", async () => {
    const { app, H } = setup();
    await app.inject({ method: "POST", url: "/api/obs/connect", headers: H });
    const r = await app.inject({ url: "/api/obs/status", headers: H });
    expect(r.body).not.toContain(PASSWORD);
    expect(r.body).not.toContain(TOKEN);
  });
});
