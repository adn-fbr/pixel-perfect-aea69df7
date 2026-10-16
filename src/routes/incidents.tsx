import { createFileRoute } from "@tanstack/react-router";
import { pageHead } from "@/lib/head";
import {
  deleteAllIncidents, setActiveIncident, setIncidentStatus, updateIncidentNotes, useAppState,
} from "@/lib/store";
import { StatusPill } from "@/components/vsr/Status";

export const Route = createFileRoute("/incidents")({
  head: () => pageHead("Incidents", "Incident log with review status, footage range and operator notes."),
  component: Incidents,
});

function Incidents() {
  const list = useAppState((s) => s.incidents);
  const active = useAppState((s) => s.activeIncidentId);
  return (
    <div className="panel">
      <div className="panel-title flex items-center justify-between">
        <span>Incidents ({list.length})</span>
        <button className="btn btn-neutral px-2 py-1 text-xs" disabled={!list.length}
          onClick={() => { if (window.confirm("Delete all incident records? Video files are never touched.")) deleteAllIncidents(); }}>
          Clear records
        </button>
      </div>
      <table className="w-full text-sm">
        <thead className="text-left font-mono text-xs uppercase text-muted-foreground">
          <tr><th className="px-4 py-2">ID</th><th>Time</th><th>P</th><th>Cam</th><th>Recording</th><th>Range</th><th>Status</th><th>Notes</th><th>Actions</th></tr>
        </thead>
        <tbody>
          {list.map((i) => (
            <tr key={i.id} className={`border-t align-top ${active === i.id ? "bg-secondary" : ""}`}>
              <td className="px-4 py-2 font-mono text-xs">{i.id}</td>
              <td className="py-2 font-mono text-xs">{i.wallClockIso.slice(11, 19)}</td>
              <td className="py-2">{i.period}</td>
              <td className="py-2">{i.cameraId}</td>
              <td className="py-2 font-mono text-xs">{i.recording ? <>{i.recording.filename}{i.recording.simulated && <span className="text-demo"> (sim)</span>}</> : "—"}</td>
              <td className="py-2 font-mono text-xs">{i.availableRange ? `−${i.preRollSec}s / +${i.postRollSec}s` : "—"}</td>
              <td className="py-2"><StatusPill tone={i.status === "READY" || i.status === "COMPLETED" ? "ok" : i.status === "FAILED" ? "live" : "warn"}>{i.status}</StatusPill>
                {i.failureReason && <div className="mt-1 text-xs text-live">{i.failureReason}</div>}</td>
              <td className="py-2 pr-2"><input className="field py-1" defaultValue={i.notes} aria-label="Notes" onBlur={(e) => updateIncidentNotes(i.id, e.target.value)} /></td>
              <td className="flex flex-wrap gap-1 py-2 pr-4">
                <button className="btn btn-neutral px-2 py-1 text-xs" onClick={() => setActiveIncident(i.id)}>Select</button>
                {i.status === "READY" && <button className="btn btn-neutral px-2 py-1 text-xs" onClick={() => setIncidentStatus(i.id, "UNDER_REVIEW")}>Review</button>}
                {i.status === "UNDER_REVIEW" && <button className="btn btn-ok px-2 py-1 text-xs" onClick={() => setIncidentStatus(i.id, "COMPLETED")}>Complete</button>}
                {i.status !== "COMPLETED" && i.status !== "FAILED" && (
                  <button className="btn btn-neutral px-2 py-1 text-xs" onClick={() => { const r = window.prompt("Failure reason?"); if (r) setIncidentStatus(i.id, "FAILED", r); }}>Fail</button>
                )}
              </td>
            </tr>
          ))}
          {!list.length && <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">No incidents yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
