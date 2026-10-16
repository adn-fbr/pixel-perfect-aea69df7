import { describe, expect, it } from "vitest";
import { isLoopbackUrl } from "@/lib/bridge";
import { getState, replayAvailable, setMode, markIncident, saveIncident } from "@/lib/store";

describe("bridge client", () => {
  it("only accepts loopback bridge URLs", () => {
    expect(isLoopbackUrl("http://127.0.0.1:4466")).toBe(true);
    expect(isLoopbackUrl("http://localhost:4466")).toBe(true);
    expect(isLoopbackUrl("http://192.168.1.10:4466")).toBe(false);
    expect(isLoopbackUrl("https://evil.example")).toBe(false);
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
