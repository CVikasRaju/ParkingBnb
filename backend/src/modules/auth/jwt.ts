import { createHmac } from "node:crypto";
import { env } from "../../config/env";

/**
 * Minimal stateless JWT implementation (HS256) using Node's built-in crypto,
 * so the backend runs without native-dependency installs. Wire-compatible
 * with standard JWT libraries.
 */

type JwtHeader = { alg: "HS256"; typ: "JWT" };
export type AuthClaims = {
  sub: string;
  role: "driver" | "provider" | "admin";
  iat?: number;
  exp?: number;
};

const B64URL = (buf: Buffer) => buf.toString("base64url");
const hmacSign = (input: string) => createHmac("sha256", env.JWT_SECRET).update(input).digest("base64url");

export function signAuthToken(claims: AuthClaims): string {
  const header: JwtHeader = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const maxAge = 7 * 24 * 3600;
  const h = B64URL(Buffer.from(JSON.stringify(header)));
  const p = B64URL(Buffer.from(JSON.stringify({ ...claims, iat: now, exp: now + maxAge })));
  return `${h}.${p}.${hmacSign(`${h}.${p}`)}`;
}

export function verifyAuthToken(token: string): AuthClaims | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, p, sig] = parts;
  const expected = hmacSign(`${h}.${p}`);
  if (sig !== expected) return null;
  try {
    const payload = JSON.parse(Buffer.from(p, "base64url").toString("utf8")) as AuthClaims;
    if (typeof payload.exp !== "number" || Math.floor(Date.now() / 1000) > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}