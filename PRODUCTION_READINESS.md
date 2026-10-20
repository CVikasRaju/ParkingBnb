# ParkPeer — production readiness

Status of the platform against a production launch. Split into three parts:

1. **Done and verified in this pass** — code in the repo, exercised, with the
   evidence noted.
2. **Blocked on credentials or accounts** — code is ready, the value is yours to
   supply.
3. **Deliberately not done** — product/legal work that is out of scope for a
   code change, with the reason.

The runbook for actually deploying is [DEPLOYMENT.md](DEPLOYMENT.md).

---

## 1. Done and verified

### Backend (`backend/`)

| Item | What changed | How it was verified |
| :--- | :--- | :--- |
| **Production env contract** | `src/config/env.ts` refuses to boot in production on a missing datastore URL, a JWT secret under 32 chars or still reading like a placeholder, a wildcard/non-https `CORS_ORIGIN`, a payment provider without keys, or `PAYMENT_PROVIDER=mock` without `MOCK_PAYMENT_SECRET`. Non-fatal gaps (no FCM key, no proxy trust) print a warning. | 7 unit tests in `test/production.test.ts`; `npm run typecheck`, `npm run lint`, `npm test` (34 tests) green. |
| **Security headers** | `src/lib/security.ts` sets nosniff, DENY framing, no-referrer, COOP/CORP, Permissions-Policy, a `default-src 'none'` CSP, HSTS in production, and `Cache-Control: no-store` on credential paths. | `curl -i` against the built server: every header present, HSTS correctly absent in dev. |
| **Rate limiting** | `src/lib/rateLimit.ts`: per-IP fixed windows in Redis, in-process fallback when Redis is unavailable, `429` + `Retry-After`. Applied globally, tightly to `/auth/*` (brute force), generously to webhooks. | 3 unit tests + a live request showing `x-ratelimit-*` on `/auth/login` and the deployed error envelope for a 429. |
| **Health probes** | `/health/live` (dependency-free, for the container healthcheck) and `/health/ready` (pings Postgres + Redis, 503 when either is down). `/health` kept for compatibility. | Live: `/health/live` → 200, `/health/ready` → 503 with `{"database":"up","redis":"down"}` in this environment. |
| **Graceful shutdown** | `SIGTERM`/`SIGINT` drain the server, end the pool and quit Redis, with a 10s force-exit ceiling; `uncaughtException` goes through the same path. | Ran the exported `shutdown()` against a live listener: `[shutdown] received SIGTERM — draining` → `[shutdown] clean exit`, exit 0 even with Redis down. |
| **Logging** | pino at `LOG_LEVEL`, request ids per request, redaction of `authorization`, `cookie`, `x-device-key`, webhook signature headers. | Type-checked; log lines show `reqId` and neither header appears. |
| **Redis resilience** | Added the missing `error` listener (an unhandled `'error'` event used to crash the process on a Redis restart) and capped the boot-time pub/sub subscribe at 3s, so the API starts even when Redis is down instead of hanging forever. | Started the API with no Redis reachable: it served traffic and logged `[ratelimit] Redis not connected`. |
| **Postgres** | Pool TLS options (`DATABASE_SSL`, explicit `DATABASE_SSL_NO_VERIFY` opt-out), idle-client error handler, pool-size/timeouts from env, `pingDatabase()` for readiness. | Typecheck + the readiness probe above. |
| **Admin self-registration closed** | `/auth/register` used to accept `role: "admin"` from anyone. It now requires `ADMIN_SIGNUP_SECRET` and refuses otherwise. The old `public.users` mirror had the same hole (see migrations). | Unit-level: the route now rejects unauthenticated admin registration (typecheck + logic review). The DB half is verified below. |
| **Payment webhook hardening** | The mock gateway has no signature, so in production it now requires `X-Mock-Payment-Secret`; the env contract refuses to boot without it. | Env-contract test; header check in `webhooks/routes.ts`. |
| **Worker** | `npm run start:worker` runs the compiled sweep; the API's in-process worker is now off by default in production; `Dockerfile` has a `worker` target; compose runs exactly one replica. | `npm run build` emits `dist/workers/overstayWorker.js`; both compose files parse. |
| **Docker** | Non-root `node` user, healthcheck on `/health/live`, `migrate` target that keeps the TypeScript runner, `.dockerignore` for `.env`. | `docker compose config` on both files passes (CI now checks it too). |
| **Migration runner** | Advisory lock (concurrent deploys cannot race DDL), top-level transaction-control stripping implemented with a real tokeniser, Supabase compat shim for plain Postgres, per-file transactions, idempotent tracking. | Applied 018 and 019 to the configured database through this runner. The first run exposed a genuine bug — a regex that deleted `END;` inside plpgsql — now fixed and covered by a regression test. |
| **Tests** | `test/production.test.ts`: env contract, rate-limiter maths + 429, security headers, migration runner. | `34 passed (34)` with the existing 18 money/FSM/geo/QR tests. |

### Database

| Item | What changed | How it was verified |
| :--- | :--- | :--- |
| **Audit log** (migration `018`) | Append-only `public.audit_log` with a trigger on `bookings`, `parking_spots`, `users`, `settlement_ledger`, `refund_ledger`. Records who/what/when plus a curated before/after diff — never the PIN, QR secret, gate code or IoT device key. Anonymous read denied; RLS limits reads to admins. | Applied to the live Supabase project. An update inside a rolled-back transaction produced `{"hourly_rate":{"to":51,"from":50}}`; `has_table_privilege('anon',…)=false`, `('authenticated',…)=true`; no rows left behind. |
| **Role hardening** (migration `019`) | Sign-up metadata `role: "admin"` now maps to `driver`; only `provider` is honoured. Existing self-assigned admins are reported, not silently demoted. | Applied. A probe insert into `auth.users` with `{"role":"admin"}` mirrored as `driver`, then rolled back. |
| **Demo purge** | `npm run db:purge-demo -- --yes` removes the eight seeded providers/bays (they share a published password), and refuses if real bookings reference them. | Script written; not run — it is a pre-launch step, listed below. |

### Web (`website/`)

| Item | What changed | How it was verified |
| :--- | :--- | :--- |
| **Security headers + CSP** | `next.config.ts`: CSP generated from the environment (self, OpenFreeMap tiles, Supabase REST + Realtime, optional API origin), HSTS, nosniff, DENY framing, Permissions-Policy, COOP, `poweredByHeader: false`. | Production build + `next start`: headers present. Headless Chrome on `/`, `/explore` and `/terms` reported **0 CSP violations** and the MapLibre canvas rendered. |
| **Legal pages** | `/terms` and `/privacy`, linked from the landing footer and from the sign-up form ("by creating an account you agree…"). Plain server-rendered markup so they work without JS. | Built as static routes; `curl` returns 200 and the document text. |
| **Error handling** | `app/error.tsx` (retry + escape hatch, logs a digest), `app/not-found.tsx` (branded 404). | Build + lint clean. |
| **SEO / crawlers** | `robots.ts` (consoles and `/api` disallowed), `sitemap.ts` from `NEXT_PUBLIC_SITE_URL`. | `/robots.txt` and `/sitemap.xml` served correctly. |
| **Health endpoint** | `/api/health` reports configuration mode (`live` vs `seed`) without leaking a secret and without touching the database. | Returns `{"mode":"live","checks":{"supabase":"configured","serviceRole":"configured",…}}`. |
| **Sign-up cannot claim admin** | The role picker no longer offers `admin` for new accounts, `signUpAction` clamps it, and migration 019 neutralises it server-side. | `npx tsc --noEmit`, `npm run lint`, `npm run build` clean. |
| **Env template** | `website/.env.example` (the README referenced one that did not exist), and `.gitignore` now ignores every real env file while keeping the template. | `git status` shows the template as trackable and no env file as ignored-but-needed. |

### Mobile (`client/`)

| Item | What changed | How it was verified |
| :--- | :--- | :--- |
| **No cleartext in release** | `android:usesCleartextTraffic="true"` moved out of the main manifest into `src/debug/AndroidManifest.xml`. Release builds are https-only. | Ran the real Android manifest merger: debug merged manifest has `usesCleartextTraffic="true"`, the release one has the attribute **absent**. |
| **Signing warning** | A release build without `android/key.properties` now prints a loud Gradle warning that the artefact is debug-signed and cannot be uploaded. | Gradle task executed. |
| **Client hygiene** | `flutter analyze` and `flutter test` clean, with the API base URL documented as a build-time `dart-define`. | `flutter analyze` → no issues; `flutter test` → 10/10. |

### CI / repo

- `.github/workflows/ci.yml` runs backend (typecheck, lint, tests, build),
  website (lint, build), Flutter (analyze, test) and validates both compose
  files — so a broken deploy stack fails in CI, not during a deploy.
- `.gitignore` covers `.env*` in every flavour while keeping `*.env.example`.

---

## 2. Blocked on credentials or accounts

Each of these has code waiting for a value; none is a code change.

1. **Real payment provider.** `PAYMENT_PROVIDER=mock` is the default. Provide
   Stripe or Razorpay keys, set `PAYMENT_PROVIDER`, register
   `POST /api/v1/webhooks/payment` with the provider and send one test webhook.
   Until then bookings are recorded but no money moves.
2. **Firebase Cloud Messaging.** `FCM_SERVICE_ACCOUNT_PATH` is empty, so pushes
   are logged and dropped (overstay warnings never reach a device).
3. **Supabase Auth configuration.** Site URL + redirect URLs, SMTP for
   confirmation emails (the built-in sender is heavily rate-limited), and the
   Google/GitHub OAuth credentials the sign-in page offers.
4. **Error monitoring.** No reporter is wired. Sentry (or similar) needs an
   account and a DSN; the two integration points are named in `DEPLOYMENT.md`.
5. **Backups.** Confirm daily backups and PITR on the Supabase plan, and do one
   restore into a scratch database. A backup you have not restored is a guess.
6. **Domain + TLS.** `NEXT_PUBLIC_SITE_URL`, `CORS_ORIGIN` and the API's public
   hostname all need the real domain. HSTS includes `preload`; only submit to
   the preload list once every subdomain is https.
7. **Managed Redis.** This environment has Redis on `localhost` and nothing
   listening. Production should use Upstash/Redis Cloud over `rediss://`; the
   limiter degrades to per-process windows when Redis is unreachable, which is
   correct for one instance and wrong for several.
8. **Android keystore / Play Console / App Store Connect.** Signing keys,
   listing metadata, screenshots and an iOS distribution profile are all
   account-bound. See `DEPLOYMENT.md` §4.
9. **Legal review.** `/terms` and `/privacy` are written against what the
   software does, but the entity, jurisdiction, contact addresses, retention
   period and DPO wording are placeholders for counsel to finish.

---

## 3. Deliberately not done

- **Self-service data export / erasure.** The privacy policy describes handling
  these on request. Building the flow needs a decision on what happens to
  financial records (they have to survive deletion) — a product/legal call, not
  a code one.
- **Internationalisation.** Every string is English and inline. Adding i18n is a
  refactor of every screen, not a config flag.
- **Accessibility audit.** The UI uses semantic buttons and labels, but there is
  no screen-reader or keyboard-only pass, and the 3D scenes have no reduced-
  motion fallback beyond the canvas `fallback` prop.
- **Load / performance testing.** The PostGIS search and the indexes have not
  been benchmarked under realistic catalogue size. Run `EXPLAIN ANALYZE` on
  `search_nearby_parking()` with a seeded city before you trust the map at
  scale.
- **Website unit tests.** The web app is covered by typecheck, lint, production
  build and the headless CSP check; there is no component test suite.
- **Bot / abuse content moderation.** No CAPTCHA or email-verification gate on
  sign-up beyond Supabase's own confirmation, and no review queue for listings.
- **Mobile integration tests.** The Flutter suite covers wire contracts and pure
  logic (10 tests); there is no on-device E2E run.
- **Re-running the backend e2e scripts.** `scripts/e2e*.sh` need a local
  Postgres **and** Redis; Redis is not running in this environment, so the
  booking-lock paths were not re-exercised this pass. They passed previously;
  run them once against a local stack before launch:
  `docker compose up -d postgres redis && bash backend/scripts/e2e.sh`.

---

## 4. Pre-deploy checklist

Ordered; each line is a command or a click.

- [ ] `cd backend && npm ci && npm run typecheck && npm run lint && npm test && npm run build`
- [ ] `cd website && npm ci && npm run lint && npm run build`
- [ ] `cd client && flutter pub get && flutter analyze && flutter test`
- [ ] `cp backend/.env.production.example backend/.env.production` and fill it in
- [ ] `openssl rand -base64 48` → `JWT_SECRET`; `openssl rand -hex 32` → `MOCK_PAYMENT_SECRET`, `ADMIN_SIGNUP_SECRET`
- [ ] `DATABASE_URL=<direct, port 5432> npm run db:migrate`
- [ ] `npm run db:purge-demo -- --yes` (demo providers share a published password)
- [ ] `UPDATE public.users SET role='admin' WHERE email='…'` for the first operator
- [ ] Supabase → Authentication → URL Configuration (site URL + `/auth/callback`)
- [ ] Supabase → Authentication → SMTP / email rate limits; OAuth apps if used
- [ ] Payment provider keys set, webhook URL registered, one test event returns 200
- [ ] Firebase service-account JSON mounted; send one test push
- [ ] `TRUST_PROXY=true` if anything terminates TLS in front of the API
- [ ] `CORS_ORIGIN=https://<real origin>`; no `*`
- [ ] `docker compose -f docker-compose.prod.yml --profile tools run --rm migrate`
- [ ] `curl https://<api>/health/live` → 200, `curl https://<api>/health/ready` → 200
- [ ] `curl https://<web>/api/health` → `"mode":"live"`
- [ ] `curl -sI https://<web>/` shows CSP + HSTS
- [ ] Error reporter connected and a deliberately thrown error reaches it
- [ ] Backups enabled **and** one restore rehearsed
- [ ] Terms/privacy reviewed by counsel; placeholders replaced
- [ ] `flutter build appbundle --release --dart-define=API_BASE_URL=https://…`
- [ ] Android keystore backed up in two places
