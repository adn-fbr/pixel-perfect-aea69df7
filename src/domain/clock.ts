export interface MatchClock {
  running: boolean;
  /** Elapsed ms accumulated before the current run segment. */
  accumulatedMs: number;
  /** Epoch ms when the current run started; null while paused. */
  startedAtMs: number | null;
  periodLengthSec: number;
}

export const DEFAULT_CLOCK: MatchClock = { running: false, accumulatedMs: 0, startedAtMs: null, periodLengthSec: 20 * 60 };

export function elapsedMs(c: MatchClock, nowMs: number): number {
  const live = c.running && c.startedAtMs != null ? Math.max(0, nowMs - c.startedAtMs) : 0;
  return c.accumulatedMs + live;
}

export function startClock(c: MatchClock, nowMs: number): MatchClock {
  if (c.running) return c;
  return { ...c, running: true, startedAtMs: nowMs };
}

export function pauseClock(c: MatchClock, nowMs: number): MatchClock {
  if (!c.running) return c;
  return { ...c, running: false, startedAtMs: null, accumulatedMs: elapsedMs(c, nowMs) };
}

export function resetClock(c: MatchClock): MatchClock {
  return { ...c, running: false, startedAtMs: null, accumulatedMs: 0 };
}

export function formatClock(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
