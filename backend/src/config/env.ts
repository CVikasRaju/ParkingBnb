/**
 * Environment configuration — all values are validated up front so a typo'd
 * .env fails fast at boot instead of mid-request.
 */
import "dotenv/config";

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
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

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? "development",
  PORT: number("PORT", 8080),
  API_PREFIX: process.env.API_PREFIX ?? "/api/v1",

  DATABASE_URL: required("DATABASE_URL", "postgres://parkpeer:parkpeer@localhost:5432/parkpeer"),
  REDIS_URL: required("REDIS_URL", "redis://localhost:6379"),

  JWT_SECRET: required("JWT_SECRET", "dev-insecure-jwt-secret-change-me"),
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN ?? "7d",

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

  // FCM
  FCM_SERVICE_ACCOUNT_PATH: process.env.FCM_SERVICE_ACCOUNT_PATH ?? "",

  CORS_ORIGIN: process.env.CORS_ORIGIN ?? "*",
} as const;

export const isProd = env.NODE_ENV === "production";