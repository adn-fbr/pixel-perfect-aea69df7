import Fastify, { type FastifyInstance } from "fastify";
import { z } from "zod";
import type { BridgeConfig } from "../config/config.js";
import type { ObsAdapter } from "../obs/ObsAdapter.js";
import { makeGuards, RateLimiter } from "../security/guards.js";
import { fail, ok } from "../types/api.js";
import { redact } from "../diagnostics/redact.js";

export const BRIDGE_VERSION = "0.2.0";

const emptyBody = z.union([z.undefined(), z.null(), z.object({}).strict()]);

export function buildApp(config: BridgeConfig, adapter: ObsAdapter, opts: { logger?: boolean } = {}): FastifyInstance {
  const secrets = [config.obsPassword, config.pairingToken];
  const app = Fastify({
    bodyLimit: 4096,
    logger: opts.logger
      ? { level: "info", redact: { paths: ["req.headers['x-vsr-token']", "req.headers.authorization"], censor: "[REDACTED]" } }
      : false,
  });
  const guards = makeGuards(config);
  const connectLimiter = new RateLimiter(5, 60_000);

  app.addHook("onRequest", guards.hostAndOrigin);
  app.options("/*", async (_req, reply) => reply.code(204).send());

  app.setErrorHandler((err: { statusCode?: number; message?: string }, _req, reply) => {
    const status = err.statusCode && err.statusCode < 500 ? err.statusCode : 500;
    reply.code(status).send(status === 500 ? fail("INTERNAL", "Internal bridge error") : fail("INVALID_REQUEST", redact(err.message ?? "Invalid request", secrets)));
  });

  // Health reports the BRIDGE only. It never claims OBS connectivity.
  app.get("/api/health", async () =>
    ok("Bridge is running. This does not indicate OBS connectivity.", {
      bridge: "BRIDGE_READY",
      bridgeVersion: BRIDGE_VERSION,
      uptimeSec: Math.round(process.uptime()),
      obsStateNote: "Query /api/obs/status (requires pairing token)",
    }),
  );

  app.register(async (priv) => {
    priv.addHook("preHandler", guards.requireToken);
    priv.addHook("preValidation", async (req, reply) => {
      if (req.method === "POST" && !emptyBody.safeParse(req.body).success) {
        return reply.code(400).send(fail("INVALID_REQUEST", "This endpoint accepts no body fields"));
      }
    });

    priv.get("/api/obs/status", async () => {
      const s = adapter.getConnectionStatus();
      return ok(`OBS state: ${s.state}`, redact(s, secrets));
    });

    priv.post("/api/obs/connect", async (req, reply) => {
      if (!connectLimiter.allow("connect")) return reply.code(429).send(fail("RATE_LIMITED", "Too many connection attempts; wait a minute"));
      const r = await adapter.connect();
      if (!r.ok) return reply.code(502).send(fail(r.error.code, redact(r.error.message, secrets)));
      return ok("Connected to OBS (handshake + GetVersion verified)", r.data);
    });

    priv.post("/api/obs/disconnect", async () => {
      await adapter.disconnect();
      return ok("Disconnected from OBS", adapter.getConnectionStatus());
    });

    const read = <T>(path: string, fn: () => Promise<{ ok: true; data: T } | { ok: false; error: { code: any; message: string } }>, msg: string) =>
      priv.get(path, async (_req, reply) => {
        const r = await fn();
        if (!r.ok) return reply.code(r.error.code === "NOT_CONNECTED" ? 409 : 502).send(fail(r.error.code, redact(r.error.message, secrets)));
        return ok(msg, r.data);
      });

    read("/api/obs/version", () => adapter.getObsVersion(), "Version reported by OBS");
    read("/api/obs/scenes", () => adapter.getAvailableScenes(), "Scenes reported by OBS");
    read("/api/obs/sources", () => adapter.getSources(), "Sources discovered in OBS (physical camera health NOT verified)");
    read("/api/obs/studio-mode", () => adapter.getStudioModeStatus(), "Studio mode reported by OBS");
  });

  app.setNotFoundHandler((_req, reply) => reply.code(404).send(fail("INVALID_REQUEST", "Unknown route")));
  return app;
}
