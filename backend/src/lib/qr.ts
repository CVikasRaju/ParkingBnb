/**
 * Dynamic QR code signing — time-based HMAC-SHA256 and a 60s expiry window
 * (ARCHITECTURE §4). Prevent screenshot fraud through rotation.
 *
 * NOTE: the runtime environment cannot install `jsonwebtoken`'s native deps,
 * so JWT signing is implemented with Node's crypto for the exact payload
 * shape the spec calls for (`{ booking_id, timestamp }`).
 *
 * Token: base64url(header).base64url(payload).base64url(hmac-sha256 sig)
 */
import { createHmac, createHash, randomBytes } from "node:crypto";
import { env } from "../config/env";

const B64URL = (buf: Buffer) =>
  buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export function hmacSha256(secret: string, input: string): string {
  return createHmac("sha256", secret).update(input).digest("hex");
}

/** Sign a compact JWT with our app QR secret. */
function signCompactForTest(secret: string, payload: object): string {
  const header = { alg: "HS256", typ: "JWT" };
  const h = B64URL(Buffer.from(JSON.stringify(header)));
  const p = B64URL(Buffer.from(JSON.stringify(payload)));
  const sig = createHmac("sha256", secret).update(`${h}.${p}`).digest();
  return `${h}.${p}.${B64URL(sig)}`;
}
// Export the low-level signer so tests can build expired tokens deterministically.
export const signCompact = signCompactForTest;

function verifyCompact(secret: string, token: string): unknown | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, p, sig] = parts;
  const expected = createHmac("sha256", secret)
    .update(`${h}.${p}`)
    .digest()
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  if (sig !== expected) return null;
  try {
    return JSON.parse(Buffer.from(p, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

/**
 * Payload is a compact JWT bound to the booking's `qr_secret` (server-only).
 * Contains `{ booking_id, timestamp, nonce }` with iat/exp for the 60s window.
 */
export function signQrToken(bookingId: string, qrSecret: string): string {
  const now = Math.floor(Date.now() / 1000);
  return signCompact(qrSecret, {
    booking_id: bookingId,
    timestamp: new Date(now * 1000).toISOString(),
    nonce: randomBytes(8).toString("hex"),
    iat: now,
    exp: now + env.QR_TOKEN_TTL_SECONDS,
  });
}

/**
 * Verify + expiry-check a QR token for a specific booking. Returns the parsed
 * payload when valid, otherwise null. Expiry is enforced via `exp` (60s TTL).
 */
export function verifyQrToken(bookingId: string, qrSecret: string, token: string): unknown | null {
  const payload = verifyCompact(qrSecret, token);
  if (!payload || typeof payload !== "object") return null;
  const p = payload as { booking_id?: string; exp?: number };
  const now = Math.floor(Date.now() / 1000);
  if (p.booking_id !== bookingId) return null;
  if (!p.exp || now > p.exp) return null;
  return payload;
}

/** Per-booking secret used to sign / verify QR tokens (64 hex chars). */
export function generateQrSecret(): string {
  return randomBytes(32).toString("hex");
}

/** 4-digit numeric PIN (kept as VARCHAR(4) per schema). */
export function generatePin(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

/** Derive a stable provider push token for subscribed devices (Firebase). */
export function firebaseRegistrationToken(providerId: string): string {
  return createHash("sha256").update(`fcm:${providerId}`).digest("hex");
}