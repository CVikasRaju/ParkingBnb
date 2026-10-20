# ParkPeer — Agent Memory

P2P parking marketplace. Specs in `docs/` are the source of truth — **do not modify them**.

## Layout
- `backend/` — Fastify + TypeScript, PostgreSQL 15+PostGIS, Redis. Modules: auth, spots, bookings, payments, webhooks, realtime, admin.
- `client/` — Flutter (Dart) app. `lib/core` (api_client, deep_link, geolocation, ws_client), `lib/features/{map,booking,provider,admin}`.
- `docker-compose.yml` — postgres (postgis/postgis:15-3.4) + redis; schema auto-loads from `backend/db/schema.sql`. `docker-compose.prod.yml` — api + worker + one-shot migrate targets.
- `website/` — Next.js 16 (App Router, TS, Tailwind v4) landing page **and** logged-in web console. React Three Fiber for 3D, MapLibre GL v5 for maps, Supabase for auth/data.
- `DEPLOYMENT.md` — deploy runbook. `PRODUCTION_READINESS.md` — verified / waiting-on-credentials / not-done status.

## Verified commands
### Backend
```bash
cd backend
npm run dev        # tsx watch src/server.ts (dev)
npm run build      # tsc
npm run typecheck  # tsc --noEmit
npm run lint       # eslint src --ext .ts
npm run test       # vitest run (34 unit tests: money/FSM/geo/QR + production guards)
npm run start:worker              # compiled overstay sweep (single replica in prod)
npm run db:purge-demo -- --yes    # drop the seeded demo providers/bays (pre-launch)
curl localhost:8080/health/live   # liveness   (no dependencies)
curl localhost:8080/health/ready  # readiness  (pings Postgres + Redis, 503 when down)
bash scripts/e2e.sh                # full 17-step lifecycle (needs local postgres AND redis)
bash scripts/e2e_s34.sh            # Sprint 3/4 edge cases + emergency unlock
bash scripts/e2e_overstay_worker.sh
bash scripts/e2e_ws_iot.sh         # WS + IoT webhook
```
Live server URL: `http://localhost:8080` (`API_PREFIX=/api/v1`). Dev creds: `alice@example.com`/`bob@example.com`/`admin@example.com`, password `secret123`, roles via register `role`.

### Client
Flutter SDK at `C:/src/flutter/bin` (not system-installed). Export `PATH=/c/src/flutter/bin:$PATH` before Flutter commands.
```bash
export PATH=/c/src/flutter/bin:$PATH
cd client
flutter pub get
flutter analyze     # clean
flutter test        # 10 unit tests (contract + haversine, geofence, JWT payload decode)
flutter build apk --release   # universal APK → client/build/app/outputs/flutter-apk/app-release.apk
flutter build appbundle --release  # Play Store upload bundle
```

### Website
```bash
cd website
npm ci
npm run dev        # dev server → http://localhost:3000
npm run build      # production build + TypeScript check (green with no env: seed mode)
npm run start      # serve the build
npm run lint       # eslint  (must exit 0 — React Compiler purity rules are on)
```
Sign-in: Supabase Auth when the keys are present, otherwise the app runs on the seed catalogue with accounts disabled.
Routes: `/` landing, `/explore`, `/auth`, `/auth/callback`, `/provider`, `/admin`, `/terms`, `/privacy`, `/api/health`. `/login`, `/signup` and `/dashboard/*` are retired and permanently redirect (`next.config.ts`).

## Key invariants
- Redis lock: atomic `SET spot:{id}:lock {driverId} NX EX 600` via dedicated lib (`backend/src/lib/redis.ts`) — never read-then-write.
- Booking FSM edges live in `backend/src/lib/fsm.ts`; all transitions go through `transition()` in `bookings/service.ts`.
- Money math (overstay, 15/85 split) in `backend/src/lib/money.ts`, server-side only.
- QR tokens: HMAC-SHA256 compact JWT signed in `backend/src/lib/qr.ts`; `GET /bookings/:id/qr` refreshes (60s TTL). Verify + QR check-in is in `bookings/routes.ts`.
- Provider QRs: client decodes payload only for booking_id (static `ProviderScannerScreen.decodeBookingId`), server re-verifies HMAC+exp.
- `search_nearby_parking()` PostGIS function: in `backend/db/migrations` + schema; `GET /spots/search` calls it.
- Payload key names: QR endpoint returns `dynamic_qr_payload` (NOT `qr_token` — that's the check-in request field).
- Production env contract: `backend/src/config/env.ts` refuses to boot with `NODE_ENV=production` when DATABASE_URL/REDIS_URL are missing, JWT_SECRET is short/placeholder, CORS_ORIGIN is `*`/non-https, a payment provider lacks keys, or `PAYMENT_PROVIDER=mock` without `MOCK_PAYMENT_SECRET`. Tests in `backend/test/production.test.ts`.
- Rate limiting: `backend/src/lib/rateLimit.ts` — per-IP fixed windows in Redis, in-process fallback when Redis is not `ready` (never queues behind a dead socket). Global + strict `/auth/*` + webhook limits.
- Admin accounts cannot be self-registered: the API needs `ADMIN_SIGNUP_SECRET`, and migration 019 maps sign-up metadata `role: "admin"` to `driver`. Promote with `UPDATE public.users SET role='admin' WHERE email=…`.
- Audit log: migration 018 writes curated before/after diffs to `public.audit_log` (bookings, parking_spots, users, ledgers) — never PIN/QR secret/gate code. `anon` has no read grant; RLS limits reads to admins.
- Migrations: `npm run db:migrate` takes an advisory lock, strips top-level BEGIN/COMMIT only (a line-anchored regex must never touch `END;`, which also closes a plpgsql CASE), and installs a small Supabase compat shim (auth schema, `auth.uid()`, anon/authenticated/service_role, the realtime publication) when the database has no `authenticated` role — so the same command works on both docker Postgres and Supabase.
- Website auth: one `getSessionUser()` in `website/src/lib/auth/session.ts` serves both modes — Supabase session when `NEXT_PUBLIC_SUPABASE_URL`+`ANON_KEY` are set, else a HMAC-signed `parkpeer_session` cookie. `/dashboard/*` is guarded in `website/src/app/dashboard/layout.tsx` (server-side redirect), not middleware.
- Website runs **credential-free**: with no env vars every screen falls back to the seed catalogue (`website/src/lib/data/seed.ts`) and the HUD says so. Adding Supabase keys activates real auth and live data with zero code changes.
- 3D scenes must never call `Math.random()`/`Date.now()` during render (React Compiler `react-hooks/purity` is enforced). Use `website/src/lib/random.ts` seeded PRNG, and `useSyncExternalStore` for clocks/capability probes.

## Gotchas
- Backend `.env` is git-ignored; template at repo root `.env.example` (includes `QR_TOKEN_TTL_SECONDS=60`).
- Backend default `PAYMENT_PROVIDER=mock` — swap to `razorpay`/`stripe` for real escrow.
- Cleartext HTTP is **debug-only**: it lives in `client/android/app/src/debug/AndroidManifest.xml`, and the main manifest must stay free of `android:usesCleartextTraffic` so release builds are https-only. Verify a change with `./gradlew :app:processReleaseMainManifest` and grep the merged manifest. iOS Info.plist has camera/location usage descriptions.
- XML comments may not contain `--`; a manifest comment mentioning a `--flag` breaks the Android manifest merger.
- Docs dir `docs/` is committed as provided — treat as read-only.
- Release builds are Android-only: `android/upload-keystore.jks` (git-ignored, upload key) wired via git-ignored `android/key.properties`. Keep `applicationId com.parkpeer.parkpeer`. Flutter web target was removed on request — no `client/web/`, no web token store.
- Android build needs JDK 21 + Gradle 8.14.3 + AGP 8.11.1 + Kotlin 2.2.20 (Flutter 3.47 minimums; stay on AGP 8.x — AGP 9 removes standalone KGP). `JAVA_HOME` → Android Studio JBR. `app/build.gradle` must define `signingConfigs.release` and resolve `storeFile` via `rootProject.file(...)` (keystore lives in `android/`, not `android/app/`).
- Website `.env.local` is git-ignored; template at `website/.env.example`. `SUPABASE_SERVICE_ROLE_KEY` is server-only and bypasses RLS — never give it a `NEXT_PUBLIC_` prefix. The site's CSP in `next.config.ts` is built from `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_API_BASE_URL`, so a rebuild is required after changing either.
- Website env: `NEXT_PUBLIC_API_BASE_URL` points at the Fastify backend; blank = demo data.