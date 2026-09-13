import type { FastifyInstance } from "fastify";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "../../lib/db";
import { Errors } from "../../lib/errors";
import { signAuthToken } from "./jwt";
import { requireAuth } from "./guards";

const registerSchema = z.object({
  full_name: z.string().min(2).max(120),
  email: z.string().email(),
  phone_number: z.string().min(5).max(20),
  password: z.string().min(8).max(128),
  role: z.enum(["driver", "provider", "admin"]).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const deviceSchema = z.object({
  platform: z.string().min(1),
});

/**
 * Minimal auth for the sprint demos. Passwords are bcrypt-hashed; tokens are
 * HS256 JWTs carrying { sub, role }. Production should layer in OTP/SMS
 * verification — the API surface stays identical.
 */
export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post("/auth/register", async (req) => {
    const body = registerSchema.parse(req.body);
    const existing = await db.maybeOne("SELECT id FROM users WHERE email = $1", [body.email]);
    if (existing) throw Errors.conflict("Email already registered");
    const passwordHash = await bcrypt.hash(body.password, 10);
    const user = await db.one(
      `INSERT INTO users (full_name, email, phone_number, password_hash, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, full_name, email, role`,
      [body.full_name, body.email, body.phone_number, passwordHash, body.role ?? "driver"]
    );
    const token = signAuthToken({ sub: user.id, role: user.role });
    return { success: true, data: { token, user } };
  });

  app.post("/auth/login", async (req) => {
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
  app.post("/auth/register-device", { onRequest: [requireAuth] }, async (req) => {
    deviceSchema.parse(req.body);
    return { success: true, data: { device_registered: true } };
  });
}