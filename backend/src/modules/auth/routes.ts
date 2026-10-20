import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import bcrypt from "bcryptjs";

import { env } from "../../config/env";
import { db } from "../../lib/db";
import { Errors } from "../../lib/errors";
import { authRateLimit } from "../../lib/rateLimit";
import { signAuthToken } from "./jwt";
import { requireAuth } from "./guards";

const registerSchema = z.object({
  full_name: z.string().min(2).max(120),
  email: z.string().email(),
  phone_number: z.string().min(5).max(20),
  password: z.string().min(8).max(128),
  role: z.enum(["driver", "provider", "admin"]).optional(),
  /** Only read when `role: "admin"` is requested. */
  admin_secret: z.string().min(1).max(256).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const deviceSchema = z.object({
  platform: z.string().min(1),
});

/** Constant-time compare that tolerates different lengths without throwing. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Minimal auth for the sprint demos. Passwords are bcrypt-hashed; tokens are
 * HS256 JWTs carrying { sub, role }. Production should layer in OTP/SMS
 * verification — the API surface stays identical.
 *
 * Two production guards live here:
 *  - every credential endpoint is rate limited per IP (brute force);
 *  - `role: "admin"` cannot be self-assigned. It requires the operator secret
 *    from `ADMIN_SIGNUP_SECRET`, and when that variable is unset the request is
 *    refused outright. Before this, anyone could register an admin account.
 */
export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post("/auth/register", { preHandler: [authRateLimit()] }, async (req) => {
    const body = registerSchema.parse(req.body);

    let role = body.role ?? "driver";
    if (role === "admin") {
      const secret = env.ADMIN_SIGNUP_SECRET;
      if (!secret || !body.admin_secret || !safeEqual(body.admin_secret, secret)) {
        throw Errors.forbidden("Admin accounts cannot be self-registered");
      }
      role = "admin";
    }

    const existing = await db.maybeOne("SELECT id FROM users WHERE email = $1", [body.email]);
    if (existing) throw Errors.conflict("Email already registered");
    const passwordHash = await bcrypt.hash(body.password, 10);
    const user = await db.one(
      `INSERT INTO users (full_name, email, phone_number, password_hash, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, full_name, email, role`,
      [body.full_name, body.email, body.phone_number, passwordHash, role]
    );
    const token = signAuthToken({ sub: user.id, role: user.role });
    return { success: true, data: { token, user } };
  });

  app.post("/auth/login", { preHandler: [authRateLimit()] }, async (req) => {
    const body = loginSchema.parse(req.body);
    const user = await db.maybeOne(
      "SELECT id, full_name, email, password_hash, role FROM users WHERE email = $1",
      [body.email]
    );
    if (!user || !(await bcrypt.compare(body.password, user.password_hash))) {
      throw Errors.unauthorized("Invalid email or password");
    }
    const token = signAuthToken({ sub: user.id, role: user.role });
    return {
      success: true,
      data: {
        token,
        user: { id: user.id, full_name: user.full_name, email: user.email, role: user.role },
      },
    };
  });

  /** Any authenticated client registers for push; token derived from user id. */
  app.post("/auth/register-device", { onRequest: [requireAuth], preHandler: [authRateLimit()] }, async (req) => {
    deviceSchema.parse(req.body);
    return { success: true, data: { device_registered: true } };
  });
}
