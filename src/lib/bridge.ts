/**
 * Browser client for the Local VSR Bridge (runs on the OBS PC, see local-vsr-bridge/).
 * The OBS password never reaches the browser — only a pairing token, kept in sessionStorage.
 */
export interface BridgeResponse<T> {
  success: boolean;
  timestamp: string;
  message: string;
  data?: T;
  errorCode?: string;
}

export const DEFAULT_BRIDGE_URL = "http://127.0.0.1:4466";
const TOKEN_KEY = "vsr-bridge-token";

export function getToken(): string {
  try { return sessionStorage.getItem(TOKEN_KEY) ?? ""; } catch { return ""; }
}
export function setToken(t: string) {
  try { t ? sessionStorage.setItem(TOKEN_KEY, t) : sessionStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
}

export function isLoopbackUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(u.hostname);
  } catch { return false; }
}

export async function bridgeCall<T>(
  baseUrl: string,
  path: string,
  method: "GET" | "POST" = "GET",
  timeoutMs = 8000,
): Promise<BridgeResponse<T>> {
  if (!isLoopbackUrl(baseUrl)) {
    return { success: false, timestamp: new Date().toISOString(), message: "Bridge URL must be http://127.0.0.1:<port> or http://localhost:<port>", errorCode: "INVALID_URL" };
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(baseUrl.replace(/\/$/, "") + path, {
      method,
      headers: { "x-vsr-token": getToken(), ...(method === "POST" ? { "content-type": "application/json" } : {}) },
      body: method === "POST" ? "{}" : undefined,
      signal: ctrl.signal,
    });
    const body = (await res.json()) as BridgeResponse<T>;
    return body;
  } catch {
    return {
      success: false,
      timestamp: new Date().toISOString(),
      message: "Bridge not reachable. Start it on the OBS PC (npm run start in local-vsr-bridge) and check the URL.",
      errorCode: "BRIDGE_UNREACHABLE",
    };
  } finally {
    clearTimeout(t);
  }
}
