import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { pageHead } from "@/lib/head";
import {
  cycleCamera, markIncident, replayAvailable, saveIncident, selectCamera, setPlayback, useAppState,
} from "@/lib/store";
import { StatusPill } from "@/components/vsr/Status";
import type { ReplaySpeed } from "@/domain/types";

export const Route = createFileRoute("/replay")({
  head: () => pageHead("Replay Controller", "Mark, save and review incidents with camera selection and playback controls."),
  component: Replay,
});

const speeds: ReplaySpeed[] = [0.25, 0.5, 1, 2];

function Replay() {
  const s = useAppState((x) => x);
  const [msg, setMsg] = useState<string | null>(null);
  const inc = s.incidents.find((i) => i.id === s.activeIncidentId) ?? null;
  const avail = (() => { void s.incidents; return replayAvailable(); })();
  const dur = inc ? inc.preRollSec + inc.postRollSec : 0;
  const pb = s.playback;
  const camIdx = s.cameras.findIndex((c) => c.id === s.selectedCamera);

  return (
    <div className="grid grid-cols-12 gap-4">
      <section className="panel col-span-8">
        <div className="panel-title flex justify-between">
          <span>Review — CAM {camIdx + 1} · {s.cameras[camIdx].label}</span>
          <StatusPill tone={pb.state === "LIVE" ? "live" : "demo"}>{pb.state === "LIVE" ? "Live" : `${pb.state} (simulated)`}</StatusPill>
        </div>
        <div className="flex aspect-video flex-col items-center justify-center gap-2 bg-video">
          <span className="font-mono text-sm uppercase tracking-widest text-muted-foreground">
            {pb.state === "LIVE" ? "Live — preview unavailable" : "Simulated playback — no video engine yet"}
          </span>
          {inc?.recording && <span className="font-mono text-xs text-demo">{inc.recording.filename} (simulated asset)</span>}
        </div>
        <div className="px-4 py-3">
          <div className="h-2 rounded-sm bg-background">
            <div className="h-2 rounded-sm bg-demo" style={{ width: dur ? `${Math.min(100, (pb.positionSec / dur) * 100)}%` : "0%" }} />
          </div>
          <div className="mt-1 flex justify-between font-mono text-xs text-muted-foreground">
            <span>{pb.positionSec.toFixed(1)}s / {dur}s</span><span>{pb.speed}x</span>
          </div>
        </div>
        <div className="grid grid-cols-6 gap-2 px-4 pb-4">
          <Ctl k="←" disabled={!avail.ok} why={avail.reason} onClick={() => setPlayback({ positionSec: Math.max(0, pb.positionSec - 2) })}>−2s</Ctl>
          <Ctl k="F7" disabled={!avail.ok} why={avail.reason} onClick={() => setPlayback({ state: "PLAYING" })}>Play</Ctl>
          <Ctl k="F7" disabled={!avail.ok} why={avail.reason} onClick={() => setPlayback({ state: "PAUSED" })}>Pause</Ctl>
          <Ctl k="→" disabled={!avail.ok} why={avail.reason} onClick={() => setPlayback({ positionSec: Math.min(dur, pb.positionSec + 2) })}>+2s</Ctl>
          <div className="col-span-2 flex gap-1">
            {speeds.map((sp) => (
              <button key={sp} disabled={!avail.ok} title={avail.reason} onClick={() => setPlayback({ speed: sp })} aria-pressed={pb.speed === sp}
                className={`btn flex-1 px-1 ${pb.speed === sp ? "border-demo text-demo" : "btn-neutral"}`}>{sp}x</button>
            ))}
          </div>
        </div>
        {!avail.ok && <p className="px-4 pb-4 text-sm text-warn">! Playback unavailable: {avail.reason}</p>}
      </section>

      <section className="col-span-4 flex flex-col gap-4">
        <div className="panel grid gap-2 p-4">
          <button className="btn btn-mark btn-xl" onClick={() => { const i = markIncident(); setMsg(`Marked ${i.id}`); }}>Mark incident <span className="kbd">F5</span></button>
          <button className="btn btn-ok btn-xl" disabled={!inc || inc.status !== "MARKED"}
            title={!inc ? "Mark an incident first" : inc.status !== "MARKED" ? `Already ${inc.status}` : undefined}
            onClick={() => { const r = saveIncident(s.activeIncidentId); setMsg(r.ok ? "Saved — asset verified (simulated)" : `Rejected: ${r.reason}`); }}>
            Save incident <span className="kbd">F6</span>
          </button>
          <button className="btn btn-neutral btn-xl" onClick={() => setPlayback({ state: "LIVE", positionSec: 0 })}>Return to live <span className="kbd">F8</span></button>
          {msg && <p role="status" className="font-mono text-xs text-muted-foreground">{msg}</p>}
        </div>
        <div className="panel p-4">
          <div className="mb-2 font-mono text-xs uppercase text-muted-foreground">Camera</div>
          <div className="grid grid-cols-5 gap-2">
            <button className="btn btn-neutral" onClick={() => cycleCamera(-1)} aria-label="Previous camera">‹</button>
            {s.cameras.map((c, i) => (
              <button key={c.id} onClick={() => selectCamera(c.id)} aria-pressed={c.id === s.selectedCamera}
                className={`btn ${c.id === s.selectedCamera ? "border-demo text-demo" : "btn-neutral"}`}>{i + 1}</button>
            ))}
            <button className="btn btn-neutral" onClick={() => cycleCamera(1)} aria-label="Next camera">›</button>
          </div>
        </div>
        <div className="panel p-4 text-sm">
          <div className="mb-2 font-mono text-xs uppercase text-muted-foreground">Active incident</div>
          {inc ? (
            <dl className="grid grid-cols-2 gap-y-1">
              <dt className="text-muted-foreground">ID</dt><dd className="font-mono text-xs">{inc.id}</dd>
              <dt className="text-muted-foreground">Status</dt><dd><StatusPill tone={inc.status === "READY" ? "ok" : "warn"}>{inc.status}</StatusPill></dd>
              <dt className="text-muted-foreground">Timestamp</dt><dd className="font-mono text-xs">{inc.wallClockIso.slice(11, 23)}</dd>
              <dt className="text-muted-foreground">Camera</dt><dd>{inc.cameraId}</dd>
              <dt className="text-muted-foreground">Pre / post</dt><dd>{inc.preRollSec}s / {inc.postRollSec}s</dd>
              <dt className="text-muted-foreground">Replay type</dt><dd className="text-demo">Simulated</dd>
            </dl>
          ) : <p className="text-muted-foreground">None. Mark an incident to begin.</p>}
        </div>
      </section>
    </div>
  );
}

function Ctl({ children, k, disabled, why, onClick }: { children: React.ReactNode; k: string; disabled: boolean; why?: string; onClick: () => void }) {
  return (
    <button className="btn btn-neutral flex-col py-3" disabled={disabled} title={disabled ? why : undefined} onClick={onClick}>
      {children}<span className="kbd">{k}</span>
    </button>
  );
}
