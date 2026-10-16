# Local VSR Bridge (Phase 2)

A small local program that runs **on the Windows 11 PC running OBS Studio**. It holds the OBS WebSocket password and gives the VSR Futsal screens a safe, read-only view of OBS. It doesn't change OBS scenes, recording settings or encoders, and it doesn't control replay.

| Item | Status |
|---|---|
| Bridge server, config, security, OBS adapter | IMPLEMENTED, BUILD_VERIFIED |
| Mock tests (20) | MOCK_TESTED |
| Real OBS connection | NOT_TESTED — run the hardware test below on the OBS PC |
| Replay / Source Record | Not in Phase 2 |

## Requirements
- Windows 11, **Node.js 20.11 or newer (LTS 22 recommended)**: https://nodejs.org
- OBS Studio 32.2.2 (WebSocket server is built in; no plugin needed)

## 1. Enable OBS WebSocket
1. OBS → **Tools → WebSocket Server Settings**.
2. Tick **Enable WebSocket server**.
3. Port: **4455** (or your choice; it must match `OBS_WS_URL`).
4. Tick **Enable Authentication** and set a strong password.
5. Click **Show Connect Info** to confirm the port and password, then **Apply**.

## 2. Install and configure the bridge
```powershell
cd local-vsr-bridge
npm ci
copy .env.example .env
notepad .env
```
In `.env` set:
- `OBS_WS_PASSWORD`: the OBS WebSocket password. It stays in this file only.
- `BRIDGE_ALLOWED_ORIGINS`: the exact address(es) where you open the VSR screens.
- Leave `BRIDGE_HOST=127.0.0.1`. The bridge won't start on a network-facing address.

Never share or commit `.env`.

## 3. Start
```powershell
npm run build
npm run start
```
The window prints a **pairing token**. In VSR Futsal open **Diagnostics**, paste the token, then press **Connect to OBS**. A new token is generated every time the bridge starts, unless you set `BRIDGE_PAIRING_TOKEN` (at least 24 characters).

For development: `npm run dev` (auto-restarts on code changes).

## 4. Stop
Press **Ctrl+C** in the bridge window. It closes the OBS connection cleanly. Closing the window also stops it.

## 5. Health check
```powershell
curl http://127.0.0.1:4466/api/health
```
`BRIDGE_READY` means the **bridge** is running. It says nothing about OBS. OBS state comes from `/api/obs/status`, which needs the `x-vsr-token` header.

## 6. Real OBS test (hardware / system integration)
With OBS running:
```powershell
$env:OBS_HARDWARE_TEST="1"; $env:OBS_WS_PASSWORD="your-password"; npm run test:hardware
```
It counts as passed only when it prints the real OBS version, scenes and sources.

## API
All responses: `{ success, timestamp, message, data?, errorCode? }`.

| Route | Auth | Purpose |
|---|---|---|
| GET /api/health | none | Bridge status only |
| GET /api/obs/status | token | BRIDGE_READY / OBS_CONNECTING / OBS_CONNECTED / OBS_DISCONNECTED / OBS_ERROR |
| POST /api/obs/connect | token | Real authenticated handshake + `GetVersion` check (max 5 per minute) |
| POST /api/obs/disconnect | token | Close the connection (no auto-reconnect after this) |
| GET /api/obs/version | token | `GetVersion` |
| GET /api/obs/scenes | token | `GetSceneList` |
| GET /api/obs/sources | token | `GetInputList`. Sources are *discovered*; camera health is not verified |
| GET /api/obs/studio-mode | token | `GetStudioModeEnabled` |

Error codes: `AUTH_FAILED`, `CONNECTION_REFUSED`, `TIMEOUT`, `NOT_CONNECTED`, `UNSUPPORTED_REQUEST`, `UNEXPECTED_DISCONNECT`, `UNAUTHORIZED`, `FORBIDDEN_ORIGIN`, `FORBIDDEN_HOST`, `RATE_LIMITED`, `INVALID_REQUEST`.

## Security model
- Listens on 127.0.0.1 only (enforced by config validation).
- Host header must be `127.0.0.1:<port>` / `localhost:<port>` (DNS-rebinding protection).
- Origin must exactly match `BRIDGE_ALLOWED_ORIGINS`. CORS is **not** treated as authentication.
- Every `/api/obs/*` route requires the pairing token (`x-vsr-token`), compared in constant time. The browser keeps it in sessionStorage, which clears when the tab closes.
- 4 KB body limit; POST bodies must be empty.
- Secrets are redacted from responses and logs. The OBS password never leaves this PC.
- After an *unexpected* drop the bridge re-opens the read-only OBS connection (backoff up to 30 s, 10 attempts). Set `OBS_AUTO_RECONNECT=false` to disable this.

### Using the hosted (HTTPS) VSR page
Chrome and Edge treat `http://127.0.0.1` as a secure context, so a hosted HTTPS page may call it. The bridge sends `Access-Control-Allow-Private-Network: true` for Chrome's Private Network Access checks. Firefox/Safari may block it; in that case run the VSR screens locally (`http://localhost:8080`). The bridge must never be exposed through port forwarding or tunnels.

## Troubleshooting
| Symptom | Fix |
|---|---|
| "Bridge not reachable" | The bridge isn't running, or the port/URL is wrong. Check the bridge window. |
| `FORBIDDEN_ORIGIN` | Add the exact page address to `BRIDGE_ALLOWED_ORIGINS` and restart the bridge. |
| `UNAUTHORIZED` | Paste the current pairing token. It changes on every restart. |
| `CONNECTION_REFUSED` | OBS isn't running, or the WebSocket server is off or on another port. |
| `AUTH_FAILED` | Wrong `OBS_WS_PASSWORD`. Compare it with OBS → Show Connect Info. |
| `TIMEOUT` | OBS is busy or frozen. Wait, then press Connect again. |
| Config error at start | The message names the bad setting in `.env`. |

The bridge doesn't install Windows services, change firewall rules, or change OBS settings.
