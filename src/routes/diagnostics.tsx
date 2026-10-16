import { createFileRoute } from "@tanstack/react-router";
import { pageHead } from "@/lib/head";
import { useAppState } from "@/lib/store";
import { StatusPill } from "@/components/vsr/Status";
import { DEFAULT_SHORTCUTS, SHORTCUT_LABELS, type ShortcutAction } from "@/domain/shortcuts";

export const Route = createFileRoute("/diagnostics")({
  head: () => pageHead("Diagnostics", "OBS, bridge, plugin, recording and replay capability diagnostics."),
  component: Diagnostics,
});

const checks: [string, string][] = [
  ["OBS WebSocket connection", "Requires Local VSR Bridge (Phase 2)"],
  ["OBS version", "Reported only by a real connection"],
  ["Bridge version", "Bridge not built"],
  ["Source Record 0.4.8 plugin", "Capability not verified (Phase 3)"],
  ["Recording state", "Unverifiable"],
  ["Storage free space", "Unverifiable"],
  ["NVENC H.264 encoder", "Untested (Phase 3)"],
  ["Replay buffer capability", "Unverified — instant replay not claimed"],
  ["Last integration test", "Never run"],
];

function Diagnostics() {
  const cams = useAppState((s) => s.cameras);
  const mode = useAppState((s) => s.mode);
  return (
    <div className="grid grid-cols-12 gap-4">
      <section className="panel col-span-7">
        <div className="panel-title flex justify-between">Capability report <StatusPill tone="demo">{mode}</StatusPill></div>
        <ul className="divide-y text-sm">
          {checks.map(([k, v]) => (
            <li key={k} className="flex items-center justify-between px-4 py-3"><span>{k}</span><StatusPill tone="off">{v}</StatusPill></li>
          ))}
        </ul>
        <div className="flex gap-2 border-t p-4">
          <button className="btn btn-neutral" disabled title="Available once the local bridge is implemented">Test connection</button>
          <button className="btn btn-neutral" disabled title="Available once the local bridge is implemented">Run capability check</button>
        </div>
      </section>
      <section className="col-span-5 flex flex-col gap-4">
        <div className="panel">
          <div className="panel-title">Camera source mapping</div>
          <ul className="divide-y font-mono text-xs">{cams.map((c, i) => <li key={c.id} className="flex justify-between px-4 py-2"><span>CAM {i + 1} · {c.label}</span><span>{c.obsSourceName}</span></li>)}</ul>
        </div>
        <div className="panel">
          <div className="panel-title">Keyboard shortcuts</div>
          <ul className="divide-y text-sm">
            {(Object.keys(DEFAULT_SHORTCUTS) as ShortcutAction[]).map((a) => (
              <li key={a} className="flex justify-between px-4 py-2"><span>{SHORTCUT_LABELS[a]}</span><span className="kbd">{DEFAULT_SHORTCUTS[a]}</span></li>
            ))}
          </ul>
          <p className="px-4 pb-3 text-xs text-muted-foreground">Shortcuts are ignored while typing in a field.</p>
        </div>
      </section>
    </div>
  );
}
