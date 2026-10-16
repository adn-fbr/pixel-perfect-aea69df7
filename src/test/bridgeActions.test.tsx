import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BridgeResponse } from "@/lib/bridge";

const tokenStore = vi.hoisted(() => ({ value: "" }));
const { bridgeCallMock } = vi.hoisted(() => ({ bridgeCallMock: vi.fn() }));

vi.mock("@/lib/bridge", () => ({
  bridgeCall: bridgeCallMock,
  getToken: () => tokenStore.value,
  isLoopbackUrl: () => true,
  setToken: (token: string) => { tokenStore.value = token; return true; },
}));

import { BridgePanel } from "@/components/vsr/BridgePanel";
import { connectToObs, disconnectObs, pollStatus, refreshDiscovery } from "@/lib/bridgeActions";
import { getState, setMode, updateBridge } from "@/lib/store";

function response<T>(data: T): BridgeResponse<T> {
  return { success: true, timestamp: new Date().toISOString(), message: "ok", data };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

function connected() {
  setMode("DEMO");
  updateBridge({
    obsState: "OBS_CONNECTED",
    discoveryStatus: "READY",
    discoveryError: null,
    lastError: null,
    scenes: [{ name: "Old scene", index: 0 }],
    currentScene: "Old scene",
    sources: [{ name: "Old source", kind: "test" }],
  });
  setMode("OBS_CONNECTED");
}

afterEach(cleanup);
beforeEach(() => {
  bridgeCallMock.mockReset();
  tokenStore.value = "";
  connected();
});

describe("bridge discovery state", () => {
  it("clears the manual token field after saving while retaining session pairing", async () => {
    bridgeCallMock.mockImplementation((_url: string, path: string) => {
      if (path === "/api/health") return Promise.resolve(response({ bridgeVersion: "0.2.0" }));
      if (path === "/api/obs/connect") return Promise.resolve(response({
        obsVersion: "32.2.2", obsWebSocketVersion: "5.6.3", platformDescription: "Windows 11",
      }));
      if (path === "/api/obs/scenes") return Promise.resolve(response({ current: "Main", scenes: [{ name: "Main", index: 0 }] }));
      if (path === "/api/obs/sources") return Promise.resolve(response([]));
      throw new Error(`Unexpected bridge route: ${path}`);
    });

    render(<BridgePanel />);
    const field = screen.getByLabelText("Pairing token");
    fireEvent.change(field, { target: { value: "synthetic-pairing-token-123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Save pairing token" }));

    expect(field).toHaveValue("");
    expect(tokenStore.value).toBe("synthetic-pairing-token-123456");
    expect(screen.getByRole("button", { name: "Reconnect" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Reconnect" }));
    await waitFor(() => expect(getState().mode).toBe("OBS_CONNECTED"));
    expect(bridgeCallMock.mock.calls.map(([, path]) => path)).toEqual([
      "/api/health", "/api/obs/connect", "/api/obs/scenes", "/api/obs/sources",
    ]);
  });

  it("clears a discovery error after a successful refresh without degrading OBS connection state", async () => {
    bridgeCallMock
      .mockResolvedValueOnce(response({ current: "Main", scenes: [{ name: "Main", index: 0 }] }))
      .mockResolvedValueOnce({ success: false, timestamp: new Date().toISOString(), message: "source request failed", errorCode: "TIMEOUT" })
      .mockResolvedValueOnce(response({ current: "Main", scenes: [{ name: "Main", index: 0 }] }))
      .mockResolvedValueOnce(response([{ name: "USB Cam 1", kind: "dshow_input" }]));

    await refreshDiscovery();
    expect(getState().mode).toBe("OBS_CONNECTED");
    expect(getState().bridge.obsState).toBe("OBS_CONNECTED");
    expect(getState().bridge.discoveryStatus).toBe("ERROR");
    expect(getState().bridge.discoveryError?.code).toBe("TIMEOUT");

    await refreshDiscovery();
    expect(getState().mode).toBe("OBS_CONNECTED");
    expect(getState().bridge.discoveryStatus).toBe("READY");
    expect(getState().bridge.discoveryError).toBeNull();
    expect(getState().bridge.sources).toEqual([{ name: "USB Cam 1", kind: "dshow_input" }]);
  });

  it("ignores a successful discovery response that arrives after OBS disconnects", async () => {
    const scenes = deferred<BridgeResponse<{ current: string; scenes: { name: string; index: number }[] }>>();
    const sources = deferred<BridgeResponse<{ name: string; kind: string }[]>>();
    bridgeCallMock.mockImplementation((_url: string, path: string) => {
      if (path === "/api/obs/scenes") return scenes.promise;
      if (path === "/api/obs/sources") return sources.promise;
      return Promise.resolve(response({ state: "OBS_DISCONNECTED", lastError: null }));
    });

    const refreshing = refreshDiscovery();
    await pollStatus();
    expect(getState().mode).toBe("DISCONNECTED");
    expect(getState().bridge.obsState).toBe("OBS_DISCONNECTED");
    expect(getState().bridge.discoveryStatus).toBe("IDLE");

    scenes.resolve(response({ current: "Stale scene", scenes: [{ name: "Stale scene", index: 0 }] }));
    sources.resolve(response([{ name: "Stale source", kind: "test" }]));
    await refreshing;

    expect(getState().mode).toBe("DISCONNECTED");
    expect(getState().bridge.obsState).toBe("OBS_DISCONNECTED");
    expect(getState().bridge.discoveryStatus).toBe("IDLE");
    expect(getState().bridge.scenes).toEqual([]);
    expect(getState().bridge.sources).toEqual([]);
  });

  it("keeps the newest results when overlapping refreshes complete out of order", async () => {
    const oldScenes = deferred<BridgeResponse<{ current: string; scenes: { name: string; index: number }[] }>>();
    const oldSources = deferred<BridgeResponse<{ name: string; kind: string }[]>>();
    const newScenes = deferred<BridgeResponse<{ current: string; scenes: { name: string; index: number }[] }>>();
    const newSources = deferred<BridgeResponse<{ name: string; kind: string }[]>>();
    const sceneQueue = [oldScenes, newScenes];
    const sourceQueue = [oldSources, newSources];
    bridgeCallMock.mockImplementation((_url: string, path: string) =>
      path === "/api/obs/scenes" ? sceneQueue.shift()!.promise : sourceQueue.shift()!.promise,
    );

    const olderRefresh = refreshDiscovery();
    const newerRefresh = refreshDiscovery();
    newScenes.resolve(response({ current: "New scene", scenes: [{ name: "New scene", index: 1 }] }));
    newSources.resolve(response([{ name: "New source", kind: "test" }]));
    await newerRefresh;
    oldScenes.resolve(response({ current: "Old scene", scenes: [{ name: "Old scene", index: 0 }] }));
    oldSources.resolve(response([{ name: "Old source", kind: "test" }]));
    await olderRefresh;

    expect(getState().bridge.currentScene).toBe("New scene");
    expect(getState().bridge.sources).toEqual([{ name: "New source", kind: "test" }]);
    expect(getState().bridge.discoveryStatus).toBe("READY");
  });

  it("shows discovery failure separately while keeping the OBS connected label accurate, then recovers", async () => {
    bridgeCallMock
      .mockResolvedValueOnce({ success: false, timestamp: new Date().toISOString(), message: "scene request failed", errorCode: "TIMEOUT" })
      .mockResolvedValueOnce(response([{ name: "USB Cam 1", kind: "dshow_input" }]))
      .mockResolvedValueOnce(response({ current: "Main", scenes: [{ name: "Main", index: 0 }] }))
      .mockResolvedValueOnce(response([{ name: "USB Cam 1", kind: "dshow_input" }]));

    render(<BridgePanel />);
    await refreshDiscovery();
    expect(screen.getByText("OBS connected")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Discovery: unavailable");

    await refreshDiscovery();
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("scenes and sources refreshed"));
    expect(screen.getByText("OBS connected")).toBeInTheDocument();
    expect(screen.queryByText(/TIMEOUT/)).not.toBeInTheDocument();
  });

  it("ignores an old successful connect response after Disconnect completes", async () => {
    const oldConnect = deferred<BridgeResponse<{ obsVersion: string; obsWebSocketVersion: string; platformDescription: string }>>();
    bridgeCallMock.mockImplementation((_url: string, path: string) => {
      if (path === "/api/health") return Promise.resolve(response({ bridgeVersion: "0.2.0" }));
      if (path === "/api/obs/connect") return oldConnect.promise;
      if (path === "/api/obs/disconnect") return Promise.resolve(response({}));
      throw new Error(`Unexpected bridge route: ${path}`);
    });

    const connecting = connectToObs();
    await waitFor(() => expect(bridgeCallMock).toHaveBeenCalledTimes(2));
    expect(getState().mode).toBe("CONNECTING");
    render(<BridgePanel />);
    expect(screen.getByRole("button", { name: "Disconnect" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    expect(bridgeCallMock).toHaveBeenCalledTimes(2);

    oldConnect.resolve(response({
      obsVersion: "32.2.2", obsWebSocketVersion: "5.6.3", platformDescription: "Windows 11",
    }));
    await connecting;
    await waitFor(() => expect(getState().mode).toBe("DISCONNECTED"));
    expect(bridgeCallMock).toHaveBeenCalledWith(getState().bridge.url, "/api/obs/disconnect", "POST");

    expect(getState().mode).toBe("DISCONNECTED");
    expect(getState().bridge.obsState).toBe("OBS_DISCONNECTED");
    expect(getState().bridge.obsVersion).toBeNull();
  });

  it("allows a new operator connection after Disconnect has completed", async () => {
    bridgeCallMock.mockImplementation((_url: string, path: string) => {
      if (path === "/api/health") return Promise.resolve(response({ bridgeVersion: "0.2.0" }));
      if (path === "/api/obs/connect") {
        return Promise.resolve(response({
          obsVersion: "32.2.2", obsWebSocketVersion: "5.6.3", platformDescription: "Windows 11",
        }));
      }
      if (path === "/api/obs/disconnect") return Promise.resolve(response({}));
      if (path === "/api/obs/scenes") return Promise.resolve(response({ current: "Fresh", scenes: [{ name: "Fresh", index: 0 }] }));
      if (path === "/api/obs/sources") return Promise.resolve(response([{ name: "Fresh source", kind: "test" }]));
      throw new Error(`Unexpected bridge route: ${path}`);
    });

    await disconnectObs();
    await connectToObs();

    expect(getState().mode).toBe("OBS_CONNECTED");
    expect(getState().bridge.obsState).toBe("OBS_CONNECTED");
    expect(getState().bridge.currentScene).toBe("Fresh");
    expect(getState().bridge.discoveryStatus).toBe("READY");
  });

  it("does not leave the UI in CONNECTING when a bridge request rejects", async () => {
    bridgeCallMock
      .mockResolvedValueOnce(response({ bridgeVersion: "0.2.0" }))
      .mockRejectedValueOnce(new Error("request rejected"));
    await connectToObs();

    expect(getState().mode).toBe("DISCONNECTED");
    expect(getState().bridge.obsState).toBe("OBS_ERROR");
    expect(getState().bridge.lastError?.code).toBe("BRIDGE_REQUEST_FAILED");
  });

  it("does not let late discovery results from a disconnected session overwrite the new session", async () => {
    const oldScenes = deferred<BridgeResponse<{ current: string; scenes: { name: string; index: number }[] }>>();
    const oldSources = deferred<BridgeResponse<{ name: string; kind: string }[]>>();
    let sceneCalls = 0;
    let sourceCalls = 0;
    bridgeCallMock.mockImplementation((_url: string, path: string) => {
      if (path === "/api/obs/scenes") {
        sceneCalls += 1;
        return sceneCalls === 1
          ? oldScenes.promise
          : Promise.resolve(response({ current: "New session", scenes: [{ name: "New session", index: 1 }] }));
      }
      if (path === "/api/obs/sources") {
        sourceCalls += 1;
        return sourceCalls === 1
          ? oldSources.promise
          : Promise.resolve(response([{ name: "New source", kind: "test" }]));
      }
      if (path === "/api/obs/disconnect") return Promise.resolve(response({}));
      if (path === "/api/health") return Promise.resolve(response({ bridgeVersion: "0.2.0" }));
      if (path === "/api/obs/connect") {
        return Promise.resolve(response({
          obsVersion: "32.2.2", obsWebSocketVersion: "5.6.3", platformDescription: "Windows 11",
        }));
      }
      throw new Error(`Unexpected bridge route: ${path}`);
    });

    const oldRefresh = refreshDiscovery();
    await disconnectObs();
    await connectToObs();
    oldScenes.resolve(response({ current: "Stale session", scenes: [{ name: "Stale session", index: 0 }] }));
    oldSources.resolve(response([{ name: "Stale source", kind: "test" }]));
    await oldRefresh;

    expect(getState().mode).toBe("OBS_CONNECTED");
    expect(getState().bridge.currentScene).toBe("New session");
    expect(getState().bridge.sources).toEqual([{ name: "New source", kind: "test" }]);
    expect(getState().bridge.discoveryStatus).toBe("READY");
  });
});
