import { cn } from "@/lib/utils";

type Tone = "ok" | "warn" | "live" | "demo" | "off";

const tones: Record<Tone, string> = {
  ok: "border-ok text-ok",
  warn: "border-warn text-warn",
  live: "border-live text-live",
  demo: "border-demo text-demo",
  off: "border-border text-muted-foreground",
};
const glyph: Record<Tone, string> = { ok: "✓", warn: "!", live: "●", demo: "◇", off: "–" };

/** Status never relies on color alone: glyph + text label. */
export function StatusPill({ tone, children, className }: { tone: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wider", tones[tone], className)}>
      <span aria-hidden>{glyph[tone]}</span>
      {children}
    </span>
  );
}

export function triState(v: boolean | null, yes: string, no: string, simulated: boolean) {
  if (v === null) return <StatusPill tone="off">Unknown</StatusPill>;
  const label = simulated ? `${v ? yes : no} (sim)` : v ? yes : no;
  return <StatusPill tone={simulated ? "demo" : v ? "ok" : "live"}>{label}</StatusPill>;
}
