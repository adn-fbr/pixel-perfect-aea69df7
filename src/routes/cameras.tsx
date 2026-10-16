import { createFileRoute } from "@tanstack/react-router";
import { pageHead } from "@/lib/head";
import { selectCamera, useAppState } from "@/lib/store";
import { StatusPill, triState } from "@/components/vsr/Status";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/cameras")({
  head: () => pageHead("Camera Monitor", "Three-camera monitor with source mapping and recording status."),
  component: Cameras,
});

function Cameras() {
  const cams = useAppState((s) => s.cameras);
  const status = useAppState((s) => s.cameraStatus);
  const sel = useAppState((s) => s.selectedCamera);
  return (
    <div className="grid grid-cols-3 gap-4">
      {cams.map((c, i) => (
        <button key={c.id} onClick={() => selectCamera(c.id)} aria-pressed={sel === c.id}
          className={cn("panel text-left outline-none focus-visible:ring-2 focus-visible:ring-ring", sel === c.id && "border-demo ring-1 ring-demo")}>
          <div className="flex items-center justify-between px-4 py-2">
            <span className="font-bold">CAM {i + 1} · {c.label}</span>
            {sel === c.id && <StatusPill tone="demo">Selected</StatusPill>}
          </div>
          <div className="flex aspect-video flex-col items-center justify-center gap-2 bg-video text-center">
            <span className="font-mono text-sm uppercase tracking-widest text-muted-foreground">Preview unavailable</span>
            <span className="max-w-xs text-xs text-muted-foreground">No preview transport is implemented yet. Monitor the feed in OBS.</span>
          </div>
          <div className="flex flex-wrap gap-2 px-4 py-3">
            <span className="mr-auto font-mono text-xs text-muted-foreground">src: {c.obsSourceName}</span>
            {triState(status[i]!.connected, "Online", "Offline", status[i]!.simulated)}
            {triState(status[i]!.recording, "Rec", "Stopped", status[i]!.simulated)}
          </div>
        </button>
      ))}
      <p className="col-span-3 text-sm text-muted-foreground">Press <span className="kbd">1</span> <span className="kbd">2</span> <span className="kbd">3</span> to select a camera.</p>
    </div>
  );
}
