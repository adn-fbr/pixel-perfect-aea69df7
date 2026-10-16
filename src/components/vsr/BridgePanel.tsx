import { useEffect, useState } from "react";
import { getToken, isLoopbackUrl, setToken } from "@/lib/bridge";
import { connectToObs, disconnectObs, refreshDiscovery, returnToDemo } from "@/lib/bridgeActions";
import { updateBridge, useAppState } from "@/lib/store";
import { StatusPill } from "./Status";

export function BridgePanel() {
  const mode = useAppState((s) => s.mode);
  const b = useAppState((s) => s.bridge);
  const cams = useAppState((s) => s.cameras);
  const [token, setTok] = useState("");
  const [disconnecting, setDisconnecting] = useState(false);
  useEffect(() => setTok(getToken()), []);
  const urlOk = isLoopbackUrl(b.url);
  const busy = mode === "CONNECTING";
  const live = mode !== "DEMO";

  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      await disconnectObs();
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-title flex items-center justify-between">
        Local VSR Bridge → OBS
        {b.obsState === "OBS_CONNECTED" ? <StatusPill tone="ok">OBS connected</StatusPill>
          : live ? <StatusPill tone="live">{b.obsState ?? "Not reachable"}</StatusPill>
          : <StatusPill tone="demo">Demo — not connected</StatusPill>}
      </div>
      <div className="grid grid-cols-2 gap-3 p-4">
        <label className="grid gap-1 text-sm"><span className="text-muted-foreground">Bridge address</span>
          <input className="field font-mono" value={b.url} onChange={(e) => updateBridge({ url: e.target.value.trim() })} />
          {!urlOk && <span className="text-xs text-live">Must be http://127.0.0.1:port or http://localhost:port</span>}
        </label>
        <label className="grid gap-1 text-sm"><span className="text-muted-foreground">Pairing token (shown in the bridge window)</span>
          <input className="field font-mono" type="password" autoComplete="off" value={token}
            onChange={(e) => { setTok(e.target.value); setToken(e.target.value.trim()); }} />
        </label>
        <div className="col-span-2 flex flex-wrap gap-2">
          <button className="btn btn-ok" disabled={busy || !urlOk || !token} onClick={() => void connectToObs()}
            title={!token ? "Enter the pairing token first" : undefined}>{busy ? "Connecting…" : live ? "Reconnect" : "Connect to OBS"}</button>
          <button className="btn btn-neutral" disabled={!live || busy} onClick={() => void refreshDiscovery()}>Refresh scenes & sources</button>
          <button className="btn btn-neutral" disabled={!live || disconnecting} onClick={() => void handleDisconnect()}>
            {disconnecting ? "Disconnecting…" : "Disconnect"}
          </button>
          <button className="btn btn-neutral ml-auto" disabled={!live || busy} onClick={returnToDemo}>Back to demo</button>
        </div>
        {b.lastError && (
          <div className="col-span-2 rounded-sm border border-live p-3 text-sm">
            <div className="font-mono text-xs text-live">! {b.lastError.code} · {b.lastError.at.slice(11, 19)}</div>
            <div>{b.lastError.message}</div>
          </div>
        )}
      </div>
      <dl className="grid grid-cols-2 gap-px border-t bg-border text-sm">
        <Cell k="Bridge version" v={b.bridgeVersion ?? "—"} />
        <Cell k="OBS version (reported)" v={b.obsVersion ? `${b.obsVersion.obsVersion} · WS ${b.obsVersion.obsWebSocketVersion}` : "—"} />
        <Cell k="Platform" v={b.obsVersion?.platformDescription || "—"} />
        <Cell k="Last checked" v={b.lastCheckedAt ? b.lastCheckedAt.slice(11, 19) : "—"} />
      </dl>
      {live && (
        <div className="grid grid-cols-2 gap-4 border-t p-4 text-sm">
          <div className="col-span-2 text-xs text-muted-foreground" role="status">
            Discovery: {discoveryLabel(b.discoveryStatus)}
            {b.discoveryError && <span className="ml-2 text-live">{b.discoveryError.code}: {b.discoveryError.message}</span>}
          </div>
          <div>
            <div className="mb-2 font-mono text-xs uppercase text-muted-foreground">Scenes ({b.scenes.length})</div>
            <ul className="space-y-1">{b.scenes.map((s) => <li key={s.name} className="font-mono text-xs">{s.name}{s.name === b.currentScene && <span className="text-ok"> ● program</span>}</li>)}</ul>
          </div>
          <div>
            <div className="mb-2 font-mono text-xs uppercase text-muted-foreground">Sources discovered in OBS ({b.sources.length})</div>
            <ul className="space-y-1">{b.sources.map((s) => {
              const mapped = cams.find((c) => c.obsSourceName === s.name);
              return <li key={s.name} className="flex justify-between font-mono text-xs"><span>{s.name} <span className="text-muted-foreground">({s.kind})</span></span>{mapped && <span className="text-demo">→ {mapped.label}</span>}</li>;
            })}</ul>
            <p className="mt-2 text-xs text-muted-foreground">Found in OBS only. This does not confirm the physical camera is working.</p>
            {b.obsState === "OBS_CONNECTED" && cams.filter((c) => !b.sources.some((s) => s.name === c.obsSourceName)).map((c) => (
              <p key={c.id} className="mt-1 text-xs text-warn">! "{c.obsSourceName}" ({c.label}) not found in OBS</p>
            ))}
          </div>
        </div>
      )}
      {!live && (
        <p className="border-t p-4 text-xs text-muted-foreground">
          Start the bridge on the OBS PC: open <span className="kbd">local-vsr-bridge</span>, run <span className="kbd">npm run start</span>, then copy the pairing token it prints. See local-vsr-bridge/README.md.
        </p>
      )}
    </section>
  );
}

function discoveryLabel(status: string) {
  switch (status) {
    case "REFRESHING": return "refreshing scenes and sources";
    case "READY": return "scenes and sources refreshed";
    case "ERROR": return "unavailable; OBS connection status is shown separately";
    default: return "not checked";
  }
}

function Cell({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between bg-panel px-4 py-2"><dt className="text-muted-foreground">{k}</dt><dd className="font-mono text-xs">{v}</dd></div>;
}
