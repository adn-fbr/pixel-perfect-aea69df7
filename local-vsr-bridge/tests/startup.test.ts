import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const bridgeRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tsxCli = resolve(bridgeRoot, "node_modules/tsx/dist/cli.mjs");
const entry = resolve(bridgeRoot, "src/index.ts");

function runStartup(pairingToken: string) {
  const cwd = mkdtempSync(join(tmpdir(), "vsr-bridge-startup-"));
  try {
    return spawnSync(process.execPath, [tsxCli, entry], {
      cwd,
      encoding: "utf8",
      timeout: 15_000,
      env: {
        PATH: process.env.PATH ?? "",
        SystemRoot: process.env.SystemRoot ?? "",
        TEMP: tmpdir(),
        TMP: tmpdir(),
        BRIDGE_PAIRING_TOKEN: pairingToken,
      },
    });
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

describe("[mock] secure startup configuration", () => {
  it("exits safely when the pairing token is empty", () => {
    const result = runStartup("");
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("BRIDGE_PAIRING_TOKEN: must be configured");
    expect(result.stderr).not.toContain("undefined");
  }, 15_000);

  it("exits safely for an invalid token without echoing it", () => {
    const invalidToken = "synthetic-short";
    const result = runStartup(invalidToken);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("BRIDGE_PAIRING_TOKEN: invalid configuration");
    expect(result.stderr).not.toContain(invalidToken);
  }, 15_000);
});
