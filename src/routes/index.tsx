import { createFileRoute, Link } from "@tanstack/react-router";
import { pageHead } from "@/lib/head";
import { useEffect, useState } from "react";
import { changePeriod, clockPause, clockReset, clockStart, useAppState } from "@/lib/store";
import { elapsedMs, formatClock } from "@/domain/clock";
import type { MatchClock } from "@/domain/clock";
import { StatusPill, triState } from "@/components/vsr/Status";

export const Route = createFileRoute("/")({
  head: () => pageHead("Operations", "Live VSR operations dashboard: match, cameras, replay readiness and incidents."),
  component: Dashboard,
});

function Dashboard() {
  const s = useAppState((x) => x);
  const m = s.match;
  return (
    <div className="grid grid-cols-12 gap-4">
      <section className="panel col-span-12 flex flex-wrap items-center gap-8 px-6 py-5">
        <div>
          <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{m.competition} · {m.matchDate}</div>
          <h1 className="text-2xl font-bold">{m.name}</h1>
        </div>
        <div className="flex items-center gap-4 text-3xl font-bold">
          <span>{m.homeTeam}</span>
          <span className="rounded-sm bg-background px-4 py-1 font-mono">{m.homeScore} – {m.awayScore}</span>
          <span>{m.awayTeam}</span>
        </div>
        <div className="ml-auto flex gap-2">
          <StatusPill tone={m.status === "READY" ? "ok" : "warn"}>Match {m.status}</StatusPill>
        </div>
      </section>

      <ClockPanel clock={m.clock} period={m.period} />

      <section className="panel col-span-8">
        <div className="panel-title">System status</div>
        <div className="grid grid-cols-2 gap-px bg-border">
          <Row k="Integration mode"><StatusPill tone="demo">{s.mode}</StatusPill></Row>
          <Row k="OBS WebSocket">{s.mode === "DEMO" ? <StatusPill tone="off">Not connected (demo)</StatusPill>
            : s.bridge.obsState === "OBS_CONNECTED" ? <StatusPill tone="ok">Connected · OBS {s.bridge.obsVersion?.obsVersion ?? "?"}</StatusPill>
            : <StatusPill tone="live">{s.bridge.obsState ?? "Bridge unreachable"}</StatusPill>}</Row>
          <Row k="Replay engine">{s.mode === "DEMO" ? <StatusPill tone="demo">Simulated only</StatusPill> : <StatusPill tone="warn">Not verified</StatusPill>}</Row>
          <Row k="Storage"><StatusPill tone="off">Unverifiable without bridge</StatusPill></Row>
        </div>
        <table className="w-full text-sm">
          <thead className="text-left font-mono text-xs uppercase text-muted-foreground">
            <tr><th className="px-4 py-2">Camera</th><th>Source</th><th>Connection</th><th>Recording</th><th>Buffer</th></tr>
          </thead>
          <tbody>
            {s.cameras.map((c, i) => {
              const st = s.cameraStatus[i]!;
              return (
                <tr key={c.id} className="border-t">
                  <td className="px-4 py-2 font-semibold">{i + 1}. {c.label}</td>
                  <td className="font-mono text-xs">{c.obsSourceName}</td>
                  <td>{triState(st.connected, "Online", "Offline", st.simulated)}</td>
                  <td>{triState(st.recording, "Rec", "Stopped", st.simulated)}</td>
                  <td>{triState(st.bufferReady, "Ready", "Not ready", st.simulated)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="panel col-span-4">
        <div className="panel-title flex justify-between">Recent incidents <Link to="/incidents" className="text-demo">All →</Link></div>
        <ul className="divide-y">
          {s.incidents.slice(0, 6).map((i) => (
            <li key={i.id} className="flex items-center justify-between px-4 py-2 text-sm">
              <span className="font-mono text-xs">{i.id}</span>
              <StatusPill tone={i.status === "READY" ? "ok" : i.status === "FAILED" ? "live" : "warn"}>{i.status}</StatusPill>
            </li>
          ))}
          {!s.incidents.length && <li className="px-4 py-6 text-sm text-muted-foreground">No incidents. Press <span className="kbd">F5</span> to mark one.</li>}
        </ul>
      </section>

      <section className="panel col-span-12">
        <div className="panel-title">Operator actions (audit trail)</div>
        <ul className="max-h-64 divide-y overflow-auto font-mono text-xs">
          {s.audit.slice(0, 30).map((a) => (
            <li key={a.id} className="flex gap-4 px-4 py-1.5">
              <span className="text-muted-foreground">{a.at.slice(11, 19)}</span>
              <span className="w-36">{a.action}</span>
              <span className={a.result === "REJECTED" || a.result === "FAILED" ? "text-live" : "text-ok"}>{a.result}</span>
              <span className="text-muted-foreground">{a.detail}</span>
            </li>
          ))}
          {!s.audit.length && <li className="px-4 py-4 text-muted-foreground">No actions yet.</li>}
        </ul>
      </section>
    </div>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return <div className="flex items-center justify-between bg-panel px-4 py-3 text-sm"><span className="text-muted-foreground">{k}</span>{children}</div>;
}

function ClockPanel({ clock, period }: { clock: MatchClock; period: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!clock.running) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [clock.running]);
  const ms = elapsedMs(clock, clock.running ? now : 0);
  const over = ms >= clock.periodLengthSec * 1000;
  const btn = "rounded-sm border px-3 py-1.5 text-sm font-semibold uppercase tracking-wide hover:bg-secondary disabled:opacity-40";
  return (
    <section className="panel col-span-12 flex flex-wrap items-center gap-6 px-6 py-4" aria-label="Match clock">
      <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Match clock</div>
      <div className={`font-mono text-4xl font-bold tabular-nums ${over ? "text-live" : ""}`}>{formatClock(ms)}</div>
      <StatusPill tone={clock.running ? "ok" : "off"}>{clock.running ? "Running" : "Paused"}</StatusPill>
      <div className="flex gap-2">
        {clock.running
          ? <button className={btn} onClick={clockPause}>Pause</button>
          : <button className={btn} onClick={clockStart}>Start</button>}
        <button className={btn} onClick={clockReset}>Reset</button>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <button className={btn} onClick={() => changePeriod(-1)} disabled={period <= 1} aria-label="Previous period">−</button>
        <span className="font-mono text-lg font-bold">Period {period}</span>
        <button className={btn} onClick={() => changePeriod(1)} aria-label="Next period">+</button>
      </div>
    </section>
  );
}
