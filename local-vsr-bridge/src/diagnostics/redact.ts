const SECRET_KEYS = /pass(word)?|token|secret|auth(entication)?|authorization|cookie/i;

/** Deep-redacts any key that looks secret, and scrubs known secret values from strings. */
export function redact<T>(value: T, knownSecrets: string[] = []): T {
  const secrets = knownSecrets.filter((s) => s && s.length >= 4);
  const scrub = (s: string) => secrets.reduce((acc, sec) => acc.split(sec).join("[REDACTED]"), s);
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") return scrub(v);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>).map(([k, val]) => [k, SECRET_KEYS.test(k) ? "[REDACTED]" : walk(val)]),
      );
    }
    return v;
  };
  return walk(value) as T;
}
