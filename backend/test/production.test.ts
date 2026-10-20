/**
 * Production-readiness guards.
 *
 * These encode the things that must never silently pass a deploy:
 *  - the prod env contract (placeholder secrets, wildcard CORS, provider keys);
 *  - the rate limiter's window maths and its 429 response;
 *  - the security headers every response carries;
 *  - the migration runner's treatment of files that manage their own
 *    transactions.
 */
import Fastify from "fastify";
import { afterAll, describe, expect, it } from "vitest";

import {
  assertProductionEnv,
  productionEnvProblems,
  productionEnvWarnings,
  type RawEnv,
} from "../src/config/env";
import { consumeMemory, memoryStore, pruneMemory, resetRateLimitState, rateLimit } from "../src/lib/rateLimit";
import { SECURITY_HEADERS, registerSecurityHeaders } from "../src/lib/security";
import { redis } from "../src/lib/redis";
import { applyErrorHandler } from "../src/server";
import { stripTransactionControl, topLevelStatements } from "../db/migrate";

const VALID_PROD: RawEnv = {
  NODE_ENV: "production",
  DATABASE_URL: "postgres://user:pw@db.example.com:5432/parkpeer?sslmode=require",
  REDIS_URL: "rediss://default:pw@cache.example.com:6379",
  JWT_SECRET: "8f3c1d9a4b7e2f5c8a1d4e7b0c3f6a9d2e5b8c1f4a7d0e3b6c9f2a5d8e1b4c7f",
  CORS_ORIGIN: "https://app.parkpeer.example,https://admin.parkpeer.example",
  PAYMENT_PROVIDER: "stripe",
  STRIPE_SECRET_KEY: "sk_live_x",
  STRIPE_WEBHOOK_SECRET: "whsec_x",
  FCM_SERVICE_ACCOUNT_PATH: "/secrets/fcm.json",
  TRUST_PROXY: "true",
  ADMIN_SIGNUP_SECRET: "operator-secret",
};

function problemsFrom(overrides: RawEnv): string {
  return productionEnvProblems({ ...VALID_PROD, ...overrides }).join("\n");
}

describe("production env contract", () => {
  it("accepts a fully configured production environment", () => {
    expect(productionEnvProblems(VALID_PROD)).toEqual([]);
    expect(productionEnvWarnings(VALID_PROD)).toEqual([]);
  });

  it("rejects the development defaults for the datastores", () => {
    const problems = problemsFrom({ DATABASE_URL: undefined, REDIS_URL: undefined });
    expect(problems).toMatch(/DATABASE_URL must be set explicitly/);
    expect(problems).toMatch(/REDIS_URL must be set explicitly/);
  });

  it("rejects a short or placeholder JWT secret", () => {
    expect(problemsFrom({ JWT_SECRET: "short" })).toMatch(/at least 32 characters/);
    expect(problemsFrom({ JWT_SECRET: "change-me-to-a-long-random-string-32" })).toMatch(
      /development placeholder/
    );
    expect(problemsFrom({ JWT_SECRET: "" })).toMatch(/JWT_SECRET must be set/);
  });

  it("rejects a wildcard or non-https CORS origin", () => {
    expect(problemsFrom({ CORS_ORIGIN: "*" })).toMatch(/must not be '\*'/);
    expect(problemsFrom({ CORS_ORIGIN: undefined })).toMatch(/CORS_ORIGIN must list/);
    expect(problemsFrom({ CORS_ORIGIN: "http://app.parkpeer.example" })).toMatch(
      /must use https:\/\//
    );
  });

  it("requires the keys for whichever payment provider is configured", () => {
    expect(problemsFrom({ PAYMENT_PROVIDER: "razorpay" })).toMatch(/RAZORPAY_KEY_ID/);
    expect(
      problemsFrom({ PAYMENT_PROVIDER: "stripe", STRIPE_SECRET_KEY: undefined })
    ).toMatch(/STRIPE_SECRET_KEY/);
    expect(problemsFrom({ PAYMENT_PROVIDER: "paypal" })).toMatch(/mock\|razorpay\|stripe/);
  });

  it("refuses an unauthenticated mock payment gateway in production", () => {
    expect(
      problemsFrom({
        PAYMENT_PROVIDER: "mock",
        STRIPE_SECRET_KEY: undefined,
        STRIPE_WEBHOOK_SECRET: undefined,
        MOCK_PAYMENT_SECRET: undefined,
      })
    ).toMatch(/MOCK_PAYMENT_SECRET is required/);
  });

  it("warns about degraded-but-alive settings", () => {
    const warnings = productionEnvWarnings({
      ...VALID_PROD,
      PAYMENT_PROVIDER: "mock",
      MOCK_PAYMENT_SECRET: "a-long-enough-secret",
      FCM_SERVICE_ACCOUNT_PATH: undefined,
      TRUST_PROXY: undefined,
      ADMIN_SIGNUP_SECRET: undefined,
    });
    expect(warnings.join("\n")).toMatch(/PAYMENT_PROVIDER=mock/);
    expect(warnings.join("\n")).toMatch(/FCM_SERVICE_ACCOUNT_PATH/);
    expect(warnings.join("\n")).toMatch(/TRUST_PROXY/);
    expect(warnings.join("\n")).toMatch(/ADMIN_SIGNUP_SECRET/);
  });

  it("lists every problem before throwing", () => {
    expect(() => assertProductionEnv({ NODE_ENV: "production" })).toThrow(
      /production environment problem\(s\)/
    );
  });
});

describe("rate limiter", () => {
  it("counts within a window and resets after it", () => {
    const store = new Map();
    const t0 = 1_000_000;

    expect(consumeMemory(store, "k", 2, 1000, t0).limited).toBe(false);
    expect(consumeMemory(store, "k", 2, 1000, t0 + 10).limited).toBe(false);

    const third = consumeMemory(store, "k", 2, 1000, t0 + 20);
    expect(third.limited).toBe(true);
    expect(third.count).toBe(3);

    // New window: the counter starts again.
    expect(consumeMemory(store, "k", 2, 1000, t0 + 1001).limited).toBe(false);
  });

  it("treats a zero limit as disabled and prunes expired windows", () => {
    const store = new Map();
    expect(consumeMemory(store, "k", 0, 1000, 0).limited).toBe(true);

    const stale = new Map([["old", { count: 1, expiresAt: 500 }]]);
    pruneMemory(stale, 1000);
    expect(stale.size).toBe(0);
  });

  it("answers 429 with Retry-After once a route's budget is spent", async () => {
    resetRateLimitState();
    const app = Fastify();
    // The same envelope the deployed API returns for a 429.
    applyErrorHandler(app);
    app.get("/limited", { preHandler: [rateLimit({ scope: "test-429", limit: 2, windowSeconds: 60 })] }, async () => ({
      ok: true,
    }));

    const first = await app.inject({ method: "GET", url: "/limited" });
    const second = await app.inject({ method: "GET", url: "/limited" });
    const third = await app.inject({ method: "GET", url: "/limited" });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(first.headers["x-ratelimit-remaining"]).toBe("1");
    expect(third.statusCode).toBe(429);
    expect(Number(third.headers["retry-after"])).toBeGreaterThan(0);
    expect(third.json()).toMatchObject({
      success: false,
      error: "Too many requests — slow down and try again shortly.",
    });

    await app.close();
    resetRateLimitState();
    expect(memoryStore.size).toBe(0);
  });
});

describe("security headers", () => {
  it("sets the hardening headers on every response", async () => {
    const app = Fastify();
    await registerSecurityHeaders(app);
    app.get("/anything", async () => ({ ok: true }));

    const res = await app.inject({ method: "GET", url: "/anything" });

    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      expect(res.headers[name.toLowerCase()]).toBe(value);
    }
    // HSTS is production-only, so a local run must not pin the browser to https.
    expect(res.headers["strict-transport-security"]).toBeUndefined();

    await app.close();
  });

  it("marks credential-bearing responses as uncacheable", async () => {
    const app = Fastify();
    await registerSecurityHeaders(app);
    app.post("/api/v1/auth/login", async () => ({ ok: true }));

    const res = await app.inject({ method: "POST", url: "/api/v1/auth/login" });
    expect(res.headers["cache-control"]).toBe("no-store");

    await app.close();
  });
});

describe("migration runner", () => {
  it("strips transaction control so the runner owns the transaction", () => {
    const sql = "BEGIN;\nUPDATE t SET a = 1;\nCOMMIT;\n";
    const stripped = stripTransactionControl(sql);
    expect(stripped).not.toMatch(/BEGIN/);
    expect(stripped).not.toMatch(/COMMIT/);
    expect(stripped).toMatch(/UPDATE t SET a = 1;/);
  });

  it("leaves a CASE ... END inside a function body alone", () => {
    // Regression: a line-anchored regex deleted this `END;` and the migration
    // then failed with `syntax error at or near "v_changes"`.
    const sql = [
      "CREATE OR REPLACE FUNCTION f() RETURNS void LANGUAGE plpgsql AS $$",
      "BEGIN",
      "  v := CASE WHEN true THEN 1",
      "    ELSE NULL",
      "  END;",
      "  v_changes := 2;",
      "END;",
      "$$;",
      "",
    ].join("\n");

    const stripped = stripTransactionControl(sql);
    expect(stripped).toContain("END;\n  v_changes := 2;");
    expect(stripped).toContain("$$;");
  });

  it("ignores semicolons inside strings, comments and dollar quotes", () => {
    const sql = [
      "INSERT INTO t (a) VALUES ('a;b');",
      "-- COMMIT;",
      "SELECT $$COMMIT; $$;",
      "COMMIT;",
    ].join("\n");

    // Three statements: the comment keeps its semicolon out of the count, and
    // the `$$`-quoted `COMMIT;` stays inside statement two.
    const statements = topLevelStatements(sql);
    expect(statements).toHaveLength(3);
    expect(stripTransactionControl(sql)).toContain("('a;b')");
    expect(stripTransactionControl(sql)).toContain("$$COMMIT; $$");
    expect(stripTransactionControl(sql)).not.toMatch(/^COMMIT;/m);
  });
});

// The limiter talks to Redis when a socket is available; in this suite it is
// not, so the in-process fallback is exercised. Close the client explicitly so
// vitest does not wait on a reconnecting socket.
afterAll(() => {
  redis.disconnect();
});
