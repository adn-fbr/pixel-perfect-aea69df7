import { describe, expect, it } from "vitest";
import { canTransition, normalizeIso, transitionIncident } from "@/domain/incident";
import { validateCameraMapping, validateFilename, validateRecordingPath } from "@/domain/validation";
import { resolveShortcut } from "@/domain/shortcuts";
import type { Incident } from "@/domain/types";

const base: Incident = {
  id: "INC-1", matchId: "M", label: "x", period: 1, matchClock: null,
  wallClockIso: "2026-10-16T05:00:00.000Z", cameraId: "cam1", recording: null,
  preRollSec: 15, postRollSec: 10, availableRange: null, status: "CAPTURING",
  notes: "", failureReason: null, createdAt: "", updatedAt: "",
};

describe("incident lifecycle", () => {
  it("refuses READY without a verified asset", () => {
    expect(transitionIncident(base, "READY", "now").ok).toBe(false);
  });
  it("allows READY with a verified asset", () => {
    const r = transitionIncident({ ...base, recording: { filename: "a.mkv", verified: true, simulated: false } }, "READY", "now");
    expect(r.ok).toBe(true);
  });
  it("cannot leave COMPLETED", () => {
    expect(canTransition("COMPLETED", "UNDER_REVIEW")).toBe(false);
  });
  it("requires a failure reason", () => {
    expect(transitionIncident(base, "FAILED", "now").ok).toBe(false);
  });
  it("normalizes timestamps to ISO 8601", () => {
    expect(normalizeIso(0)).toBe("1970-01-01T00:00:00.000Z");
    expect(() => normalizeIso("garbage")).toThrow();
  });
});

describe("validation", () => {
  it("rejects path traversal and relative paths", () => {
    expect(validateRecordingPath("D:\\VSR\\..\\Windows")).not.toBeNull();
    expect(validateRecordingPath("recordings")).not.toBeNull();
    expect(validateRecordingPath("D:\\VSR\\Recordings")).toBeNull();
  });
  it("only accepts safe mkv filenames", () => {
    expect(validateFilename("cam1_INC.mkv")).toBe(true);
    expect(validateFilename("../x.mkv")).toBe(false);
  });
  it("rejects duplicate OBS source mapping", () => {
    const errs = validateCameraMapping([
      { id: "cam1", label: "a", obsSourceName: "S" },
      { id: "cam2", label: "b", obsSourceName: "S" },
      { id: "cam3", label: "c", obsSourceName: "T" },
    ]);
    expect(errs.some((e) => e.includes("Duplicate"))).toBe(true);
  });
});

describe("shortcuts", () => {
  it("maps F5 to MARK", () => expect(resolveShortcut("F5", null)).toBe("MARK"));
  it("ignores keys while typing", () => {
    expect(resolveShortcut("1", document.createElement("input"))).toBeNull();
  });
});
