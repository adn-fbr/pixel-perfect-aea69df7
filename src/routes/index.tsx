import { createFileRoute, Link } from "@tanstack/react-router";
import { pageHead } from "@/lib/head";
import { useAppState } from "@/lib/store";
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
          <StatusPill tone="off">Period {m.period}</StatusPill>
          <StatusPill tone="off">Clock: not available</StatusPill>
        </div>
      </section>

      <section className="panel col-span-8">
        <div className="panel-title">System status</div>
        <div className="grid grid-cols-2 gap-px bg-border">
          <Row k="Integration mode"><StatusPill tone="demo">{s.mode}</StatusPill></Row>
          <Row k="OBS WebSocket"><StatusPill tone="off">Not connected — bridge not built</StatusPill></Row>
          <Row k="Replay engine"><StatusPill tone="demo">Simulated only</StatusPill></Row>
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
