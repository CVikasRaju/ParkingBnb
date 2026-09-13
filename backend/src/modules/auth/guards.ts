import type { FastifyReply, FastifyRequest } from "fastify";
import { Errors } from "../../lib/errors";
import { verifyAuthToken, type AuthClaims } from "./jwt";

declare module "fastify" {
  interface FastifyRequest {
    auth?: AuthClaims;
    /** Raw request body captured in preParsing (webhook verification). */
    rawBody?: string;
  }
}

/** Requires a valid Bearer token; attaches decoded claims to req.auth. */
export async function requireAuth(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw Errors.unauthorized("Missing bearer token");
  }
  const claims = verifyAuthToken(header.slice(7));
  if (!claims) {
    throw Errors.unauthorized("Invalid or expired token");
  }
  req.auth = claims;
}

/** Builds a guard that enforces `role` on top of requireAuth. */
export function requireRole(...roles: Array<AuthClaims["role"]>) {
  return async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    await requireAuth(req, reply);
    if (req.auth && !roles.includes(req.auth.role)) {
      throw Errors.forbidden("Insufficient role for this action");
    }
  };
}