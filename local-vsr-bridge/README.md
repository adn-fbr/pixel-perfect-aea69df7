# Local VSR Bridge — Phase 2 Slice A

The bridge runs on the Windows 11 PC running OBS Studio. It holds the OBS
WebSocket password and exposes authenticated, read-only OBS status and
discovery to the VSR Futsal browser client. It does not control scenes,
recording, encoders, or replay.

## Current status and evidence

Statuses describe evidence, not intended functionality:

| Area | Status | Evidence / limitation |
|---|---|---|
| Loopback-only bridge, Host/origin checks, pairing-token guard | IMPLEMENTED | Config and Fastify guards in this repository; not a proof of deployment configuration |
| OBS WebSocket connection, authenticated handshake, `GetVersion` validation | IMPLEMENTED | Adapter code; no real OBS handshake has been recorded |
| Read-only scene and input-source discovery | IMPLEMENTED | `GetSceneList` and `GetInputList`; source discovery does not prove camera operation |
| Browser source-name matching | IMPLEMENTED | Exact-name display mapping for the three configured camera names |
| Preventing OBS connection from enabling simulated replay | IMPLEMENTED | Store resets camera status outside DEMO and blocks replay outside DEMO |
| Bridge build and application checks in this audit | NOT_TESTED | Node.js and npm were unavailable on the audit machine on 2026-10-17 |
| Bridge mock tests in this audit | NOT_TESTED | The mock suite and new regression cases were not executed in this audit |
| Real OBS connection, physical cameras, recording, Source Record | UNVERIFIED | No hardware test was run; no hardware evidence is available |

The earlier version of this README reported a verified build and passing mock
tests. Those results were not reproducible in this audit because Node.js/npm
were not available, so they are not carried forward as current verified status.
`IMPLEMENTED` is not `BUILD_VERIFIED` or `MOCK_TESTED`; a code path is not
hardware evidence.

## Phase 2 Slice A acceptance checklist

- [x] Bridge configuration rejects non-loopback bind hosts.
- [x] Requests are checked against loopback Host values, configured exact
  origins, and a pairing token on OBS routes.
- [x] OBS connection is reported only after the WebSocket handshake and a
  valid `GetVersion` response.
- [x] Scenes and input sources are labeled as discovered; camera health is
  not inferred.
- [x] The UI labels DEMO, connecting, connected, disconnected/error states
  separately, and labels connected OBS as replay-unverified.
- [x] Entering a real bridge mode clears simulated camera status; replay is
  unavailable outside DEMO.
- [x] The mock suite includes an ordinary manual-disconnect/no-reconnect case.
- [ ] Re-run build, lint, and application/mock tests on a machine with the
  declared Node/npm toolchain.
- [ ] Run the separate read-only hardware integration test on the target OBS
  PC and retain sanitized evidence.
- [x] Adapter diagnostics log allowlisted error categories instead of raw OBS
  exception text; a regression test covers dummy password/token values.
- [x] Discovery state and errors are separate from OBS transport state;
  successful refreshes clear discovery errors and stale results are guarded.
- [x] Disconnect invalidates in-flight connection attempts at both the bridge
  adapter and browser state layers; late responses cannot restore the prior
  session.
- [ ] Execute the new regression tests and the remaining checks on a machine
  with the declared Node/npm toolchain.

### Audit observations and limitations

- The adapter now classifies only known protocol/transport codes and logs the
  category, not raw exception messages. User-facing adapter errors use fixed
  messages. Regression coverage is present but has not been executed in this
  environment; this does not establish universal secret safety for every
  dependency or runtime logging path. The startup log no longer prints the
  OBS WebSocket URL. The generated pairing token is still printed
  intentionally at startup for the operator to pair the browser session.
- Discovery progress/errors now live in a separate `discoveryStatus` field.
  Discovery failures do not change OBS transport mode, and request generations
  prevent older refreshes or results arriving after a disconnect from
  overwriting current state. Focused regression tests are present but have not
  been executed in this environment.
- Intentional disconnect invalidates the active adapter attempt and the
  frontend connect generation. The browser waits for an already-sent connect
  request to settle before it sends the disconnect request, then the adapter
  invalidates its attempt and rejects any late result. A stale client is
  closed best-effort; the operator can explicitly connect again after
  disconnect completes. The OBS WebSocket client API used here has no
  cancellation signal, so this guarantees the stale attempt cannot become the
  adapter/UI's connected session, but cannot guarantee that an underlying
  network handshake is physically aborted at the instant Disconnect is
  pressed. The adapter applies one overall connection timeout (at most 60
  seconds by configuration), and the browser allows a 5-second response
  margin before it times out that request. If the handshake completes after
  invalidation, the adapter requests client shutdown again.
  Deterministic regression tests cover delayed handshake/version/discovery
  responses and fresh connection, but remain unexecuted until the Node/npm
  toolchain is available.
- `GetInputList` discovers OBS inputs, not physical camera health, capture
  frames, or necessarily the source items actually used by the active scene.
  The browser's mapping is an exact name comparison, not a device test.
- `src/routes/diagnostics.tsx` still marks recording and Source Record checks
  unverifiable / unverified and disables its capability-check action.
- The repository has no `docs/` directory or separate status report. This
  README is the bridge's current operational and phase-status document; the
  root README is generic Lovable/project setup guidance.
- The project README names OBS Studio 32.2.2, but the bridge package does not
  enforce or negotiate an OBS Studio version range. No supported-version
  matrix or real-OBS compatibility evidence is present. Check OBS WebSocket
  compatibility before a hardware run.

## Requirements and security boundaries

- Windows 11 PC running OBS Studio.
- Node.js `>=20.11` (Node.js 22 LTS is the recommended runtime in this guide);
  `local-vsr-bridge/package.json` declares `>=20.11`.
- OBS WebSocket server available at the configured `OBS_WS_URL` (default
  `ws://127.0.0.1:4455`).
- Bind only to `127.0.0.1`, `localhost`, or `::1`. Non-loopback bridge binds
  are rejected. Do not use port forwarding, tunnels, or firewall exposure.
- The OBS password stays on the OBS PC. The browser receives only a pairing
  token, stored in `sessionStorage`; the bridge prints a generated token on
  startup so the operator can pair the UI.
- The pairing token authenticates OBS API routes; CORS is not authentication.
  Host and origin checks are separate protections.
- The browser client accepts only HTTP loopback bridge URLs. Hosted HTTPS
  pages may be subject to browser Private Network Access policy. The bridge
  returns the Chrome PNA response header, but browser/version compatibility
  has not been tested here; Firefox and Safari may block the request. Do not
  weaken bridge origin/Host checks to work around browser restrictions.
- Pairing-token request headers are redacted by Fastify's logger, and
  configured secret values are redacted from API responses. See the adapter
  logging limitation above before sharing logs.

## Install and configure

From the repository root in PowerShell:

```powershell
Set-Location .\local-vsr-bridge
npm ci
Copy-Item .env.example .env
notepad .env
```

Set `OBS_WS_PASSWORD` to the OBS WebSocket password and `BRIDGE_ALLOWED_ORIGINS`
to the exact browser origin(s). Keep `BRIDGE_HOST=127.0.0.1`. Never commit or
share `.env`. The bridge does not change OBS settings or install a Windows
service.

Start the bridge:

```powershell
npm run build
npm run start
```

For development only, `npm run dev` runs the TypeScript entry point with
watch/restart. The bridge prints a pairing token at startup when
`BRIDGE_PAIRING_TOKEN` is unset. Enter it in the VSR Diagnostics panel.

## Commands and result interpretation

Run the scripts defined in each `package.json`; run from the indicated folder.

| Purpose | PowerShell command | Passing result means |
|---|---|---|
| Application lint | From repository root: `npm run lint` | ESLint found no reported errors |
| Application tests | From repository root: `npm test` | The Vitest application suite passed; no OBS hardware was contacted |
| Application build | From repository root: `npm run build` | The production application build completed |
| Bridge type/build check | From `local-vsr-bridge`: `npm run build` | The TypeScript bridge build completed |
| Bridge mock tests | From `local-vsr-bridge`: `npm test` | Fake-client/server tests passed; this is not an OBS connection test |
| Bridge real-OBS test | From `local-vsr-bridge`: `npm run test:hardware` with the opt-in variables below | Only when explicitly enabled and run on the OBS PC; the test itself reads version/scenes/sources |

The bridge test script excludes `tests/**/*.hardware.test.ts`. The hardware
test is separately gated by `OBS_HARDWARE_TEST=1`; a skipped test is NOT a
pass. Do not call a test `MOCK_TESTED` or a build `BUILD_VERIFIED` unless its
command completed successfully. Record the command, date, result, and any
sanitized output.

## Windows 11 hardware validation — Phase 2 read-only test

This is an optional real-OBS test, not a mock test. Run only on the Windows 11
PC with the intended OBS instance available. It makes an authenticated
WebSocket connection, reads version/scenes/input sources, and disconnects; it
does not start/stop recording or modify OBS state.

1. Confirm you are on the intended OBS PC, OBS is already running, and its
   WebSocket server is already enabled with authentication. Do not expose the
   bridge or OBS WebSocket to the LAN. Do not change OBS settings as part of
   this read-only validation.
2. Open PowerShell in the repository, then verify the required tools:

   ```powershell
   node --version
   npm --version
   ```

   Use Node.js 20.11 or newer. If it is unavailable, stop; do not mark the
   hardware test as passed.
3. Install the locked bridge dependencies and build:

   ```powershell
   Set-Location .\local-vsr-bridge
   npm ci
   npm run build
   ```

4. Set the opt-in flag and target URL, enter the OBS password without putting
   it in the command text, run the hardware test, then clear the environment
   variables:

   ```powershell
   $env:OBS_HARDWARE_TEST = "1"
   $env:OBS_WS_URL = "ws://127.0.0.1:4455"
   $securePassword = Read-Host "OBS WebSocket password" -AsSecureString
   $passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
   try {
     $env:OBS_WS_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
     npm run test:hardware
   } finally {
     [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
     Remove-Item Env:OBS_HARDWARE_TEST, Env:OBS_WS_URL, Env:OBS_WS_PASSWORD -ErrorAction SilentlyContinue
     $securePassword.Dispose()
   }
   ```

5. A pass requires Vitest to report the test passed and the output to show
   actual OBS-reported version, scenes, and sources. An error, timeout, missing
   OBS, or skipped test is not a pass. Save the date, OBS/bridge versions,
   command result, and sanitized output; never save the password or pairing
   token. This test does not verify camera frames, recording status, Source
   Record, replay, or browser-to-bridge connectivity.

The current audit did not run this test. Hardware status remains
`NOT_TESTED` / `UNVERIFIED`.

## API currently implemented

All responses use `{ success, timestamp, message, data?, errorCode? }`.

| Route | Auth | OBS operation / meaning |
|---|---|---|
| `GET /api/health` | None | Bridge health only; does not assert OBS connectivity |
| `GET /api/obs/status` | Pairing token | Bridge's current OBS connection state |
| `POST /api/obs/connect` | Pairing token | Authenticated WebSocket handshake plus `GetVersion` check; rate limited |
| `POST /api/obs/disconnect` | Pairing token | Closes the bridge's OBS WebSocket connection |
| `GET /api/obs/version` | Pairing token | `GetVersion` |
| `GET /api/obs/scenes` | Pairing token | `GetSceneList` |
| `GET /api/obs/sources` | Pairing token | `GetInputList`; discovered inputs only |
| `GET /api/obs/studio-mode` | Pairing token | `GetStudioModeEnabled` |

After unexpected connection loss, automatic reconnect is enabled by default,
with bounded backoff/attempts. An explicit disconnect disables reconnect for
that connection until an operator explicitly connects again. Set
`OBS_AUTO_RECONNECT=false` to disable automatic reconnect.

## Phase 3 Slice A — read-only capability discovery (proposed)

Implement only a read-only capability report. It must not make OBS changes or
claim that discovered configuration proves operational camera/replay behavior.

### Scope

1. Report an OBS connection as confirmed only after the authenticated
   handshake and a valid `GetVersion` response. Otherwise report disconnected,
   connecting, error, or `unknown` as appropriate.
2. Read OBS version and available scenes and inputs through supported OBS
   WebSocket requests.
3. Read recording activity using the documented `GetRecordStatus` request.
   A request failure, timeout, unsupported request, malformed response, or
   disconnected OBS must produce an explicit unsupported/error/`unknown`
   result—not a guessed `false`.
4. Report Source Record 0.4.8 as `unknown` unless reliable evidence of that
   exact installed/loaded plugin and its relevant capabilities is available.
   Do not infer it from an input/source name or generic OBS version data.
5. Compare the configured camera names exactly against discovered inputs:
   `USB Cam 1`, `USB Cam 2`, and `USB Cam 3`. Report match/missing/unknown.
   A match means only “name discovered”; it is not a physical-camera test.
6. Keep current replay readiness disabled/unverified. Do not implement buffer
   save/playback, synchronization, global hotkeys, recording control, or
   configuration changes.

### Acceptance criteria and test plan

- [ ] Disconnected OBS yields an explicit disconnected/unknown report and does
  not call OBS requests.
- [ ] Failed and timed-out requests produce explicit failure/unknown states,
  with no success-shaped fallback.
- [ ] Missing or unsupported requests/capabilities remain unsupported or
  unknown; no inferred plugin or replay-buffer capability.
- [ ] Camera names are matched against discovered OBS input names; absent or
  mismatched names are reported missing, not healthy.
- [ ] Insufficient evidence is represented as `unknown`, not `false`,
  `available`, or `verified`.
- [ ] Tests assert the discovery workflow sends only allowlisted read-only OBS
  requests and never invokes state-mutating recording/scene/source operations.
- [ ] UI labels distinguish OBS-connected, source-discovered, and verified
  camera operation. No source discovery is labeled as working camera.
- [ ] Mock adapter tests are separate from the opt-in real OBS integration
  test. Mock results are never hardware evidence.
- [ ] No change enables replay or modifies OBS state/configuration.

`GetRecordStatus` is the planned documented OBS request; the implementation
must still handle runtime `UNSUPPORTED_REQUEST`, timeout, disconnect, and
invalid-response cases rather than assume every target supports it.

### Source Record discovery limitation and manual verification

The current bridge interface exposes no verified generic plugin-inventory
capability, and the repository has no tested Source Record-specific request.
Do not guess custom request names or infer plugin installation from an OBS
source name. If Phase 3 cannot establish plugin discovery through a documented
and supported OBS interface, report the result as `unknown` and use this
manual, read-only procedure on the OBS PC:

1. In OBS, inspect **Help → Log Files → View Current Log** for evidence that
   the Source Record module loaded successfully. Compare the exact plugin
   version with the plugin's official release/package metadata to establish
   whether it is 0.4.8.
2. Inspect the plugin's own documented UI and capability descriptions to
   establish what that version supports. A plugin file being present, or a
   named source existing, alone does not prove that it loaded or exposes a
   replay buffer.
3. If the current log and official metadata do not establish exact version
   and loaded state, keep the capability `unknown`. Do not start/stop
   recording or alter OBS settings for this discovery slice.

No plugin installation, recording test, replay-buffer test, or hardware
verification is included in Phase 3 Slice A.
