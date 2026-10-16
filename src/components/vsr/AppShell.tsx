import { Link, Outlet } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { resolveShortcut } from "@/domain/shortcuts";
import {
  getState, hydrateStore, markIncident, replayAvailable, saveIncident,
  selectCamera, setPlayback, useAppState, audit,
} from "@/lib/store";
import { StatusPill } from "./Status";

const nav = [
  { to: "/", label: "Operations" },
  { to: "/cameras", label: "Cameras" },
  { to: "/replay", label: "Replay" },
  { to: "/incidents", label: "Incidents" },
  { to: "/setup", label: "Match Setup" },
  { to: "/diagnostics", label: "Diagnostics" },
] as const;

export function AppShell() {
  const match = useAppState((s) => s.match);
  const mode = useAppState((s) => s.mode);
  const [toast, setToast] = useState<{ text: string; tone: "ok" | "warn" | "live" } | null>(null);

  useEffect(() => { hydrateStore(); }, []);

  useEffect(() => {
    const flash = (text: string, tone: "ok" | "warn" | "live") => {
      setToast({ text, tone });
      window.setTimeout(() => setToast(null), 2200);
    };
    const onKey = (e: KeyboardEvent) => {
      const action = resolveShortcut(e.key, e.target);
      if (!action) return;
      e.preventDefault();
      const s = getState();
      switch (action) {
        case "MARK": { const i = markIncident(); flash(`Marked ${i.id}`, "ok"); break; }
        case "SAVE": { const r = saveIncident(s.activeIncidentId); flash(r.ok ? "Saved — asset verified (simulated)" : `Rejected: ${r.reason}`, r.ok ? "ok" : "live"); break; }
        case "PLAY_PAUSE": {
          const r = replayAvailable();
          if (!r.ok) { audit("PLAY_PAUSE", "REJECTED", r.reason!); flash(`Rejected: ${r.reason}`, "live"); break; }
          setPlayback({ state: s.playback.state === "PLAYING" ? "PAUSED" : "PLAYING" });
          flash("Accepted (simulated playback)", "warn"); break;
        }
        case "RETURN_LIVE": setPlayback({ state: "LIVE", positionSec: 0 }); flash("Returned to live", "ok"); break;
        case "CAM1": selectCamera("cam1"); flash("Camera 1", "ok"); break;
        case "CAM2": selectCamera("cam2"); flash("Camera 2", "ok"); break;
        case "CAM3": selectCamera("cam3"); flash("Camera 3", "ok"); break;
        case "SEEK_BACK": case "SEEK_FWD": {
          const r = replayAvailable();
          if (!r.ok) { flash(`Rejected: ${r.reason}`, "live"); break; }
          const d = action === "SEEK_BACK" ? -2 : 2;
          setPlayback({ positionSec: Math.max(0, s.playback.positionSec + d) });
          flash(`Seek ${d > 0 ? "+" : ""}${d}s (simulated)`, "warn"); break;
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);



  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center gap-6 border-b bg-panel px-5 py-2">
        <div className="font-mono text-sm font-bold tracking-[0.3em]">VSR<span className="text-live">●</span>FUTSAL</div>
        <nav className="flex gap-1">
          {nav.map((n) => (
            <Link key={n.to} to={n.to} activeOptions={{ exact: true }}
              className="rounded-sm px-3 py-1.5 text-sm font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground data-[status=active]:bg-secondary data-[status=active]:text-foreground">
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm">
          <span className="text-muted-foreground">{match.homeTeam} <b className="font-mono text-foreground">{match.homeScore}–{match.awayScore}</b> {match.awayTeam} · P{match.period}</span>
          {mode === "DEMO" ? <StatusPill tone="demo">Demo mode — simulated</StatusPill> : <StatusPill tone="ok">{mode}</StatusPill>}
        </div>
      </header>
      <main className="flex-1 p-5"><Outlet /></main>
      {toast && (
        <div role="status" className="fixed bottom-5 right-5"><StatusPill tone={toast.tone} className="bg-panel px-3 py-2 text-xs">{toast.text}</StatusPill></div>
      )}
    </div>
  );
}
