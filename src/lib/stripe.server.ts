/**
 * Server-only thin Stripe REST client. We avoid the heavy npm `stripe` SDK
 * because it ships Node-only deps that don't run cleanly in the Worker SSR
 * runtime; the REST API works fine over fetch.
 */

const STRIPE_API = "https://api.stripe.com/v1";

function authHeaders() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/x-www-form-urlencoded",
  };
}

/** Encodes a nested object as Stripe's bracket form-encoding. */
function toForm(obj: Record<string, unknown>, prefix = ""): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object" && !Array.isArray(v)) {
      parts.push(toForm(v as Record<string, unknown>, key));
    } else if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (typeof item === "object" && item !== null) {
          parts.push(toForm(item as Record<string, unknown>, `${key}[${i}]`));
        } else {
          parts.push(`${encodeURIComponent(`${key}[${i}]`)}=${encodeURIComponent(String(item))}`);
        }
      });
    } else {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
    }
  }
  return parts.filter(Boolean).join("&");
}

export async function stripeFetch<T = any>(
  path: string,
  init?: { method?: "GET" | "POST" | "DELETE"; body?: Record<string, unknown> },
): Promise<T> {
  const method = init?.method ?? "GET";
  const url = `${STRIPE_API}${path}`;
  const res = await fetch(url, {
    method,
    headers: authHeaders(),
    body: init?.body ? toForm(init.body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) {
    const msg = json?.error?.message ?? `Stripe ${method} ${path} failed (${res.status})`;
    throw new Error(msg);
  }
  return json as T;
}

/** Verify Stripe webhook signature using the official t=, v1= scheme. */
export async function verifyStripeSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
  toleranceSec = 300,
): Promise<boolean> {
  if (!signatureHeader) return false;
  const parts = Object.fromEntries(
    signatureHeader.split(",").map((p) => {
      const i = p.indexOf("=");
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    }),
  ) as Record<string, string>;
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > toleranceSec) return false;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`${t}.${rawBody}`));
  const expected = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
  // timing-safe compare
  if (expected.length !== v1.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ v1.charCodeAt(i);
  return diff === 0;
}
