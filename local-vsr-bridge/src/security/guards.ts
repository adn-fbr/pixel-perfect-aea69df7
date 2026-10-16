import { timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { fail } from "../types/api.js";

export interface GuardConfig {
  port: number;
  allowedOrigins: string[];
  pairingToken: string;
}

/** DNS-rebinding defence: only loopback Host headers are accepted. */
export function isAllowedHost(host: string | undefined, port: number): boolean {
  if (!host) return false;
  return [`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`].includes(host.toLowerCase());
}

export function tokenMatches(provided: string | undefined, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Simple fixed-window rate limiter (in-memory, per route key). */
export class RateLimiter {
  private hits = new Map<string, { count: number; windowStart: number }>();
  constructor(private readonly limit: number, private readonly windowMs: number) {}
  allow(key: string, t = Date.now()): boolean {
    const h = this.hits.get(key);
    if (!h || t - h.windowStart >= this.windowMs) { this.hits.set(key, { count: 1, windowStart: t }); return true; }
    h.count += 1;
    return h.count <= this.limit;
  }
}

export function makeGuards(cfg: GuardConfig) {
  return {
    /** Runs on every request. */
    async hostAndOrigin(req: FastifyRequest, reply: FastifyReply) {
      if (!isAllowedHost(req.headers.host, cfg.port)) {
        return reply.code(403).send(fail("FORBIDDEN_HOST", "Unexpected Host header"));
      }
      const origin = req.headers.origin;
      if (origin && !cfg.allowedOrigins.includes(origin)) {
        return reply.code(403).send(fail("FORBIDDEN_ORIGIN", "Origin not allowed. Add it to BRIDGE_ALLOWED_ORIGINS."));
      }
      if (origin) {
        reply.header("Access-Control-Allow-Origin", origin);
        reply.header("Vary", "Origin");
        reply.header("Access-Control-Allow-Headers", "content-type, x-vsr-token");
        reply.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        // Chrome Private Network Access: hosted HTTPS page → loopback service
        reply.header("Access-Control-Allow-Private-Network", "true");
      }
    },
    /** Pairing-token auth for everything except health. CORS is not auth. */
    async requireToken(req: FastifyRequest, reply: FastifyReply) {
      const tok = req.headers["x-vsr-token"];
      if (!tokenMatches(typeof tok === "string" ? tok : undefined, cfg.pairingToken)) {
        return reply.code(401).send(fail("UNAUTHORIZED", "Missing or invalid pairing token"));
      }
    },
  };
}
