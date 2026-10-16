import { describe, expect, it } from "vitest";
import { bridgeCall, getToken, isLoopbackUrl, setToken } from "@/lib/bridge";
import { getState, replayAvailable, setMode, markIncident, saveIncident } from "@/lib/store";

describe("bridge client", () => {
  it("only accepts loopback bridge URLs", () => {
    expect(isLoopbackUrl("http://127.0.0.1:4466")).toBe(true);
    expect(isLoopbackUrl("http://localhost:4466")).toBe(true);
    expect(isLoopbackUrl("http://192.168.1.10:4466")).toBe(false);
    expect(isLoopbackUrl("https://evil.example")).toBe(false);
  });
  it("keeps pairing in session storage and sends the token only in the auth header", async () => {
    const syntheticToken = "synthetic-pairing-token-123456";
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ success: true, timestamp: "now", message: "ok" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      expect(setToken(syntheticToken)).toBe(true);
      expect(getToken()).toBe(syntheticToken);
      await bridgeCall("http://127.0.0.1:4466", "/api/obs/status");
      const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).not.toContain(syntheticToken);
      expect(new Headers(options.headers).get("x-vsr-token")).toBe(syntheticToken);
      expect(options.method).toBe("GET");
    } finally {
      setToken("");
      vi.unstubAllGlobals();
    }
  });
  it("OBS connection does not make replay available", () => {
    const inc = markIncident();
    saveIncident(inc.id);
    expect(replayAvailable().ok).toBe(true);
    setMode("OBS_CONNECTED");
    expect(replayAvailable().ok).toBe(false);
    expect(getState().cameraStatus.every((c) => c.connected === null && !c.simulated)).toBe(true);
    setMode("DEMO");
  });
});
