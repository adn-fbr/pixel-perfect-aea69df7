import type { CameraConfig, MatchConfig } from "./types";

/** Rejects traversal, relative paths, and illegal Windows characters. */
export function validateRecordingPath(path: string): string | null {
  const p = path.trim();
  if (!p) return "Recording directory is required";
  if (!/^[a-zA-Z]:\\/.test(p)) return "Use an absolute Windows path, e.g. D:\\VSR\\Recordings";
  if (p.split(/[\\/]/).some((seg) => seg === ".." || seg === ".")) return "Path traversal segments are not allowed";
  if (/[<>"|?*]/.test(p.slice(2))) return "Path contains illegal characters";
  return null;
}

export function validateFilename(name: string): boolean {
  return /^[\w\-. ]+\.mkv$/i.test(name) && !name.includes("..");
}

export function validateCameraMapping(cameras: CameraConfig[]): string[] {
  const errors: string[] = [];
  if (cameras.length !== 3) errors.push("Exactly three cameras are required");
  const sources = cameras.map((c) => c.obsSourceName.trim());
  cameras.forEach((c) => {
    if (!c.label.trim()) errors.push(`${c.id}: label is required`);
    if (!c.obsSourceName.trim()) errors.push(`${c.id}: OBS source name is required`);
  });
  const dupes = sources.filter((s, i) => s && sources.indexOf(s) !== i);
  if (dupes.length) errors.push(`Duplicate OBS source mapping: ${[...new Set(dupes)].join(", ")}`);
  return errors;
}

export function validateMatch(match: MatchConfig, cameras: CameraConfig[]): string[] {
  const errors: string[] = [];
  if (!match.name.trim()) errors.push("Match name is required");
  if (!match.homeTeam.trim()) errors.push("Home team is required");
  if (!match.awayTeam.trim()) errors.push("Away team is required");
  if (match.homeTeam.trim() && match.homeTeam.trim() === match.awayTeam.trim()) errors.push("Teams must differ");
  if (!match.matchDate) errors.push("Match date is required");
  if (!match.operatorName.trim()) errors.push("Operator name is required");
  if (match.preRollSec < 0 || match.preRollSec > 60) errors.push("Pre-roll must be 0–60 seconds");
  if (match.postRollSec < 0 || match.postRollSec > 60) errors.push("Post-roll must be 0–60 seconds");
  if (match.replayDurationSec < 5 || match.replayDurationSec > 120) errors.push("Replay duration must be 5–120 seconds");
  const pathErr = validateRecordingPath(match.recordingDirectory);
  if (pathErr) errors.push(pathErr);
  return [...errors, ...validateCameraMapping(cameras)];
}
