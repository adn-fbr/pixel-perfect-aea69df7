import { randomBytes } from "node:crypto";
import { z } from "zod";

const LOOPBACK = ["127.0.0.1", "localhost", "::1"];

const schema = z.object({
  BRIDGE_HOST: z.string().default("127.0.0.1").refine((h) => LOOPBACK.includes(h), {
    message: "BRIDGE_HOST must be a loopback address (127.0.0.1, localhost or ::1)",
  }),
  BRIDGE_PORT: z.coerce.number().int().min(1024).max(65535).default(4466),
  BRIDGE_ALLOWED_ORIGINS: z
    .string()
    .default("http://localhost:8080")
    .transform((s) => s.split(",").map((o) => o.trim()).filter(Boolean))
    .refine((list) => list.every((o) => /^https?:\/\/[^/\s*]+$/.test(o)), {
      message: "BRIDGE_ALLOWED_ORIGINS must be exact origins like https://example.com (no wildcards, no paths)",
    }),
  BRIDGE_PAIRING_TOKEN: z
    .string()
    .optional()
    .transform((t) => (t && t.trim() ? t.trim() : undefined))
    .refine((t) => t === undefined || t.length >= 24, { message: "BRIDGE_PAIRING_TOKEN must be at least 24 characters" }),
  OBS_WS_URL: z
    .string()
    .default("ws://127.0.0.1:4455")
    .refine((u) => /^wss?:\/\/[^\s]+:\d{1,5}\/?$/.test(u), { message: "OBS_WS_URL must look like ws://127.0.0.1:4455" }),
  OBS_WS_PASSWORD: z.string().default(""),
  OBS_CONNECT_TIMEOUT_MS: z.coerce.number().int().min(500).max(60000).default(5000),
  OBS_AUTO_RECONNECT: z
    .string()
    .default("true")
    .transform((v) => v.toLowerCase() === "true"),
});

export interface BridgeConfig {
  host: string;
  port: number;
  allowedOrigins: string[];
  pairingToken: string;
  pairingTokenGenerated: boolean;
  obsUrl: string;
  obsPassword: string;
  obsConnectTimeoutMs: number;
  obsAutoReconnect: boolean;
}

export type ConfigResult = { ok: true; config: BridgeConfig } | { ok: false; errors: string[] };

export function loadConfig(env: Record<string, string | undefined>): ConfigResult {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
  }
  const e = parsed.data;
  const generated = !e.BRIDGE_PAIRING_TOKEN;
  return {
    ok: true,
    config: {
      host: e.BRIDGE_HOST,
      port: e.BRIDGE_PORT,
      allowedOrigins: e.BRIDGE_ALLOWED_ORIGINS,
      pairingToken: e.BRIDGE_PAIRING_TOKEN ?? randomBytes(24).toString("base64url"),
      pairingTokenGenerated: generated,
      obsUrl: e.OBS_WS_URL,
      obsPassword: e.OBS_WS_PASSWORD,
      obsConnectTimeoutMs: e.OBS_CONNECT_TIMEOUT_MS,
      obsAutoReconnect: e.OBS_AUTO_RECONNECT,
    },
  };
}
