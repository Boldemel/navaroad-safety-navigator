/**
 * Server-only AES-256-GCM encryption for ELD passwords.
 * Ciphertext format stored in DB: "enc:v1:<base64 iv>:<base64 ciphertext+tag>".
 * The key is derived (SHA-256) from the ELD_ENCRYPTION_KEY secret and never leaves the server.
 */
const PREFIX = "enc:v1:";

async function getKey(): Promise<CryptoKey> {
  const secret = process.env["ELD_ENCRYPTION_KEY"];
  if (!secret) throw new Error("ELD credential storage is not configured.");
  const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

const b64 = (buf: ArrayBuffer | Uint8Array) => Buffer.from(buf as ArrayBuffer).toString("base64");

export async function encryptEldSecret(plain: string | null | undefined): Promise<string | null> {
  if (!plain) return null;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await getKey(), new TextEncoder().encode(plain));
  return `${PREFIX}${b64(iv)}:${b64(ct)}`;
}

export async function decryptEldSecret(stored: string | null | undefined): Promise<string | null> {
  if (!stored) return null;
  // Legacy plaintext rows (none expected) are returned as-is so nothing breaks.
  if (!stored.startsWith(PREFIX)) return stored;
  const [ivB64, ctB64] = stored.slice(PREFIX.length).split(":");
  try {
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: Buffer.from(ivB64, "base64") },
      await getKey(),
      Buffer.from(ctB64, "base64"),
    );
    return new TextDecoder().decode(pt);
  } catch {
    return null;
  }
}
