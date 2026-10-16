import { createFileRoute } from "@tanstack/react-router";
import { pageHead } from "@/lib/head";
import { audit, updateCamera, updateMatch, useAppState } from "@/lib/store";
import { validateMatch } from "@/domain/validation";
import { StatusPill } from "@/components/vsr/Status";
import type { MatchConfig } from "@/domain/types";

export const Route = createFileRoute("/setup")({
  head: () => pageHead("Match Setup", "Configure match, teams, camera mapping, recording path and replay timing."),
  component: Setup,
});

function Setup() {
  const m = useAppState((s) => s.match);
  const cams = useAppState((s) => s.cameras);
  const errors = validateMatch(m, cams);
  const txt = (k: keyof MatchConfig, label: string, type = "text") => (
    <label className="grid gap-1 text-sm"><span className="text-muted-foreground">{label}</span>
      <input className="field" type={type} value={String(m[k])}
        onChange={(e) => updateMatch({ [k]: type === "number" ? Number(e.target.value) : e.target.value } as Partial<MatchConfig>)} />
    </label>
  );
  return (
    <div className="grid grid-cols-12 gap-4">
      <section className="panel col-span-8 grid grid-cols-2 gap-4 p-5">
        <div className="panel-title col-span-2 -mx-5 -mt-5 mb-1">Match</div>
        {txt("name", "Match name")}{txt("competition", "Competition")}
        {txt("homeTeam", "Home team")}{txt("awayTeam", "Away team")}
        {txt("matchDate", "Match date", "date")}{txt("period", "Period", "number")}
        {txt("homeScore", "Home score", "number")}{txt("awayScore", "Away score", "number")}
        {txt("operatorName", "Operator name")}{txt("recordingDirectory", "Recording directory (local SSD)")}
        {txt("preRollSec", "Pre-roll (s)", "number")}{txt("postRollSec", "Post-roll (s)", "number")}
        {txt("replayDurationSec", "Preferred replay duration (s)", "number")}
      </section>
      <section className="col-span-4 flex flex-col gap-4">
        <div className="panel grid gap-3 p-5">
          <div className="panel-title -mx-5 -mt-5">Cameras → OBS sources</div>
          {cams.map((c, i) => (
            <div key={c.id} className="grid grid-cols-2 gap-2">
              <input className="field" aria-label={`Camera ${i + 1} label`} value={c.label} onChange={(e) => updateCamera(c.id, { label: e.target.value })} />
              <input className="field font-mono" aria-label={`Camera ${i + 1} OBS source`} value={c.obsSourceName} onChange={(e) => updateCamera(c.id, { obsSourceName: e.target.value })} />
            </div>
          ))}
          <p className="text-xs text-muted-foreground">Source names can't be checked against OBS until the local bridge exists.</p>
        </div>
        <div className="panel p-5">
          <div className="mb-3 flex items-center justify-between"><span className="font-semibold">Validation</span>
            <StatusPill tone={m.status === "READY" ? "ok" : "warn"}>{m.status}</StatusPill></div>
          {errors.length ? <ul className="mb-3 list-disc pl-5 text-sm text-warn">{errors.map((e) => <li key={e}>{e}</li>)}</ul>
            : <p className="mb-3 text-sm text-ok">✓ Configuration valid</p>}
          <button className="btn btn-ok w-full" disabled={errors.length > 0}
            onClick={() => { updateMatch({ status: "READY" }); audit("MATCH_READY", "COMPLETED", m.name); }}>Mark match ready</button>
        </div>
      </section>
    </div>
  );
}
