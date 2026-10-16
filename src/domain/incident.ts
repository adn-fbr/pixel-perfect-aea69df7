import type { Incident, IncidentStatus } from "./types";

const ALLOWED: Record<IncidentStatus, IncidentStatus[]> = {
  MARKED: ["CAPTURING", "FAILED"],
  CAPTURING: ["READY", "FAILED"],
  READY: ["UNDER_REVIEW", "FAILED"],
  UNDER_REVIEW: ["COMPLETED", "READY", "FAILED"],
  COMPLETED: [],
  FAILED: [],
};

export type TransitionResult =
  | { ok: true; incident: Incident }
  | { ok: false; reason: string };

export function canTransition(from: IncidentStatus, to: IncidentStatus): boolean {
  return ALLOWED[from].includes(to);
}

export function transitionIncident(
  incident: Incident,
  to: IncidentStatus,
  nowIso: string,
  failureReason?: string,
): TransitionResult {
  if (!canTransition(incident.status, to)) {
    return { ok: false, reason: `Cannot move from ${incident.status} to ${to}` };
  }
  if (to === "READY" && !incident.recording?.verified) {
    return { ok: false, reason: "Recording asset has not been verified as existing and readable" };
  }
  if (to === "FAILED" && !failureReason) {
    return { ok: false, reason: "A failure reason is required" };
  }
  return {
    ok: true,
    incident: {
      ...incident,
      status: to,
      failureReason: to === "FAILED" ? failureReason! : incident.failureReason,
      updatedAt: nowIso,
    },
  };
}

export function normalizeIso(input: string | number | Date): string {
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) throw new Error("Invalid timestamp");
  return d.toISOString();
}

export function newIncidentId(now: Date, seq: number): string {
  const stamp = now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  return `INC-${stamp}-${String(seq).padStart(3, "0")}`;
}
