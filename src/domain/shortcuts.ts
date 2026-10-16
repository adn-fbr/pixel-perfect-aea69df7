export type ShortcutAction =
  | "MARK" | "SAVE" | "PLAY_PAUSE" | "RETURN_LIVE"
  | "CAM1" | "CAM2" | "CAM3" | "SEEK_BACK" | "SEEK_FWD";

export const DEFAULT_SHORTCUTS: Record<ShortcutAction, string> = {
  MARK: "F5",
  SAVE: "F6",
  PLAY_PAUSE: "F7",
  RETURN_LIVE: "F8",
  CAM1: "1",
  CAM2: "2",
  CAM3: "3",
  SEEK_BACK: "ArrowLeft",
  SEEK_FWD: "ArrowRight",
};

export const SHORTCUT_LABELS: Record<ShortcutAction, string> = {
  MARK: "Mark incident",
  SAVE: "Save incident",
  PLAY_PAUSE: "Play / pause",
  RETURN_LIVE: "Return to live",
  CAM1: "Select camera 1",
  CAM2: "Select camera 2",
  CAM3: "Select camera 3",
  SEEK_BACK: "Seek backward",
  SEEK_FWD: "Seek forward",
};

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as HTMLElement).tagName !== "string") return false;
  const el = target as HTMLElement;
  const tag = el.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || el.isContentEditable;
}

export function resolveShortcut(
  key: string,
  target: EventTarget | null,
  map: Record<ShortcutAction, string> = DEFAULT_SHORTCUTS,
): ShortcutAction | null {
  if (isTypingTarget(target)) return null;
  const entry = (Object.entries(map) as [ShortcutAction, string][]).find(([, k]) => k === key);
  return entry ? entry[0] : null;
}
