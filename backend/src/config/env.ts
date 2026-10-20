/**
 * Environment configuration — all values are validated up front so a typo'd
 * .env fails fast at boot instead of mid-request.
 *
 * Two layers of validation:
 *  1. Parsing — every value is read once here, with its default, so no route
 *     ever consults `process.env` directly.
 *  2. Production contract — when `NODE_ENV=production` the placeholder secrets,
 *     wildcard CORS origin and half-configured payment provider that are
 *     convenient in development become *boot failures* (`productionEnvProblems`).
 *     Warnings (`productionEnvWarnings`) cover what degrades a feature without
 *     being fatal, e.g. push notifications with no Firebase key.
 */
import "dotenv/config";

const DEV_JWT_SECRET = "dev-insecure-jwt-secret-change-me";
const DEV_DATABASE_URL = "postgres://parkpeer:parkpeer@localhost:5432/parkpeer";
const DEV_REDIS_URL = "redis://localhost:6379";

export type RawEnv = Record<string, string | undefined>;

/** Trimmed, empty-as-missing lookup. */
function read(rawEnv: RawEnv, name: string): string | undefined {
  const value = rawEnv[name];
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function bool(rawEnv: RawEnv, name: string, fallback: boolean): boolean {
  const value = read(rawEnv, name);
  if (value === undefined) return fallback;
  const normalised = value.toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalised)) return true;
  if (["0", "false", "no", "off"].includes(normalised)) return false;
  throw new Error(`Invalid boolean env var ${name}: ${value}`);
}

function required(name: string, fallback?: string): string {
  const v = read(process.env, name) ?? fallback;
  if (v === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

function number(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`Invalid numeric env var ${name}: ${raw}`);
  return n;
}

/* ── Production contract ─────────────────────────────────────────────────────
   Pure functions over a raw environment map: unit-tested in
   `backend/test/production.test.ts`, applied to `process.env` below.          */

/**
 * Fatal problems. Each one would leak a secret, break authentication or drop the
 * money path, so the process refuses to start instead.
 */
export function productionEnvProblems(rawEnv: RawEnv): string[] {
  const problems: string[] = [];
  const value = (name: string) => read(rawEnv, name);

  // ── Datastores must be explicit: the localhost fallbacks are dev-only.
  if (!value("DATABASE_URL")) {
    problems.push(
      `DATABASE_URL must be set explicitly in production (the default ${DEV_DATABASE_URL} is local-only)`
    );
  }
  if (!value("REDIS_URL")) {
    problems.push(
      `REDIS_URL must be set explicitly in production (the default ${DEV_REDIS_URL} is local-only)`
    );
  }

  // ── JWT: a short or placeholder secret is a forged token waiting to happen.
  const jwtSecret = value("JWT_SECRET") ?? "";
  if (!jwtSecret) {
    problems.push("JWT_SECRET must be set in production");
  } else {
    if (jwtSecret.length < 32) {
      problems.push(
        `JWT_SECRET must be at least 32 characters in production (got ${jwtSecret.length})`
      );
    }
    if (
      jwtSecret === DEV_JWT_SECRET ||
      /change[-_]?me|insecure|placeholder|dev[-_]?secret/i.test(jwtSecret)
    ) {
      problems.push("JWT_SECRET still looks like a development placeholder — generate a new one");
    }
  }

  // ── CORS: `*` on a bearer-token API is an open door for any origin.
  const cors = value("CORS_ORIGIN");
  if (!cors) {
    problems.push("CORS_ORIGIN must list the deployed web/mobile origins in production (not '*')");
  } else if (cors === "*") {
    problems.push("CORS_ORIGIN must not be '*' in production — list the allowed origins");
  } else {
    const insecure = cors
      .split(",")
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0)
      .filter((origin) => !origin.startsWith("https://") && !origin.startsWith("http://localhost"));
    if (insecure.length > 0) {
      problems.push(`CORS_ORIGIN entries must use https:// in production: ${insecure.join(", ")}`);
    }
  }

  // ── Money: a provider without keys takes bookings it can never settle.
  const provider = (value("PAYMENT_PROVIDER") ?? "mock").toLowerCase();
  if (!["mock", "razorpay", "stripe"].includes(provider)) {
    problems.push(`PAYMENT_PROVIDER must be one of mock|razorpay|stripe (got '${provider}')`);
  } else if (provider === "razorpay") {
    for (const key of ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"]) {
      if (!value(key)) problems.push(`${key} is required when PAYMENT_PROVIDER=razorpay`);
    }
  } else if (provider === "stripe") {
    for (const key of ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"]) {
      if (!value(key)) problems.push(`${key} is required when PAYMENT_PROVIDER=stripe`);
    }
  } else if (!value("MOCK_PAYMENT_SECRET")) {
    // The mock gateway has no signature to verify, so in production the caller
    // must at least present a shared secret — otherwise anyone who can reach
    // /webhooks/payment can confirm a payment and reserve a bay for free.
    problems.push(
      "MOCK_PAYMENT_SECRET is required when PAYMENT_PROVIDER=mock in production (protects the confirmation webhook)"
    );
  }

  // ── Routing / prefix sanity.
  const prefix = value("API_PREFIX");
  if (prefix && !prefix.startsWith("/")) {
    problems.push(`API_PREFIX must start with '/' (got '${prefix}')`);
  }

  return problems;
}

/** Degradations worth printing loudly, but not worth refusing to boot over. */
export function productionEnvWarnings(rawEnv: RawEnv): string[] {
  const warnings: string[] = [];
  const value = (name: string) => read(rawEnv, name);

  if ((value("PAYMENT_PROVIDER") ?? "mock").toLowerCase() === "mock") {
    warnings.push(
      "PAYMENT_PROVIDER=mock — no real money moves. Bookings are recorded but never charged."
    );
  }
  if (value("PAYMENT_PROVIDER")?.toLowerCase() === "mock" && (value("MOCK_PAYMENT_SECRET")?.length ?? 0) < 16) {
    warnings.push(
      "MOCK_PAYMENT_SECRET is shorter than 16 characters — use a long random string, it guards the mock payment webhook."
    );
  }
  if (!value("FCM_SERVICE_ACCOUNT_PATH")) {
    warnings.push(
      "FCM_SERVICE_ACCOUNT_PATH is empty — push notifications are logged, not delivered."
    );
  }
  if (!value("TRUST_PROXY")) {
    warnings.push(
      "TRUST_PROXY is off — behind a load balancer every request shares one IP, which breaks per-IP rate limiting."
    );
  }
  if (!value("ADMIN_SIGNUP_SECRET")) {
    warnings.push(
      "ADMIN_SIGNUP_SECRET is unset — self-service admin registration is disabled; promote operators with SQL."
    );
  }
  return warnings;
}

/** Throws when the production contract is broken. Called at import time. */
export function assertProductionEnv(rawEnv: RawEnv): string[] {
  const problems = productionEnvProblems(rawEnv);
  if (problems.length > 0) {
    throw new Error(
      `Refusing to start: ${problems.length} production environment problem(s)\n  - ${problems.join("\n  - ")}`
    );
  }
  return productionEnvWarnings(rawEnv);
}

/* ── Parsed configuration ─────────────────────────────────────────────────── */

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? "development",
  PORT: number("PORT", 8080),
  API_PREFIX: process.env.API_PREFIX ?? "/api/v1",
  LOG_LEVEL: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "test" ? "silent" : "info"),

  DATABASE_URL: required("DATABASE_URL", DEV_DATABASE_URL),
  // Managed Postgres (Supabase/Neon/RDS) needs TLS. `sslmode=require` in the URL
  // is honoured by node-postgres; these flags cover providers whose CA is not in
  // the local trust store (`DATABASE_SSL_NO_VERIFY=true` is an explicit opt-out).
  DATABASE_SSL: bool(process.env, "DATABASE_SSL", false),
  DATABASE_SSL_NO_VERIFY: bool(process.env, "DATABASE_SSL_NO_VERIFY", false),

  REDIS_URL: required("REDIS_URL", DEV_REDIS_URL),

  JWT_SECRET: required("JWT_SECRET", DEV_JWT_SECRET),
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN ?? "7d",

  // Only consulted when a client tries to self-register as an admin. Empty means
  // public admin sign-up is refused outright.
  ADMIN_SIGNUP_SECRET: process.env.ADMIN_SIGNUP_SECRET ?? "",

  // Booking engine knobs (mirror docs/ARCHITECTURE.md)
  BOOKING_LOCK_TTL_SECONDS: number("BOOKING_LOCK_TTL_SECONDS", 600),
  CHECKIN_GEOFENCE_METERS: number("CHECKIN_GEOFENCE_METERS", 50),
  QR_TOKEN_TTL_SECONDS: number("QR_TOKEN_TTL_SECONDS", 60),
  OVERSTAY_GRACE_MINUTES: number("OVERSTAY_GRACE_MINUTES", 15),
  PLATFORM_COMMISSION_RATE: number("PLATFORM_COMMISSION_RATE", 0.15),

  // Payments
  PAYMENT_PROVIDER: process.env.PAYMENT_PROVIDER ?? "mock", // mock | razorpay | stripe
  RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID ?? "",
  RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET ?? "",
  RAZORPAY_WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET ?? "",
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY ?? "",
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  /** Shared secret the mock gateway must present in production (see webhooks). */
  MOCK_PAYMENT_SECRET: process.env.MOCK_PAYMENT_SECRET ?? "",

  // FCM
  FCM_SERVICE_ACCOUNT_PATH: process.env.FCM_SERVICE_ACCOUNT_PATH ?? "",

  CORS_ORIGIN: process.env.CORS_ORIGIN ?? "*",
  /** Off by default; MUST be on behind a proxy or every client looks like the LB. */
  TRUST_PROXY: bool(process.env, "TRUST_PROXY", false),

  // Abuse control. The auth window is deliberately slow — it is the brute-force
  // guard for password login.
  RATE_LIMIT_MAX: number("RATE_LIMIT_MAX", 300),
  RATE_LIMIT_WINDOW_SECONDS: number("RATE_LIMIT_WINDOW_SECONDS", 60),
  AUTH_RATE_LIMIT_MAX: number("AUTH_RATE_LIMIT_MAX", 20),
  AUTH_RATE_LIMIT_WINDOW_SECONDS: number("AUTH_RATE_LIMIT_WINDOW_SECONDS", 900),
  WEBHOOK_RATE_LIMIT_MAX: number("WEBHOOK_RATE_LIMIT_MAX", 600),
  WEBHOOK_RATE_LIMIT_WINDOW_SECONDS: number("WEBHOOK_RATE_LIMIT_WINDOW_SECONDS", 60),
} as const;

export const isProd = env.NODE_ENV === "production";

// Fail fast: a misconfigured production box must never accept a request.
if (isProd) {
  for (const warning of assertProductionEnv(process.env)) console.warn(`[env] ${warning}`);
}
