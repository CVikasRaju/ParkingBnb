# ParkPeer — Agent Memory

P2P parking marketplace. Specs in `docs/` are the source of truth — **do not modify them**.

## Layout
- `backend/` — Fastify + TypeScript, PostgreSQL 15+PostGIS, Redis. Modules: auth, spots, bookings, payments, webhooks, realtime, admin.
- `client/` — Flutter (Dart) app. `lib/core` (api_client, deep_link, geolocation, ws_client), `lib/features/{map,booking,provider,admin}`.
- `docker-compose.yml` — postgres (postgis/postgis:15-3.4) + redis; schema auto-loads from `backend/db/schema.sql`.
- `website/` — Next.js 16 (App Router, TS, Tailwind v4) marketing site **and** logged-in web console. React Three Fiber for 3D, Leaflet for maps, Supabase for auth/data.

## Verified commands
### Backend
```bash
cd backend
npm run dev        # tsx watch src/server.ts (dev)
npm run build      # tsc
npm run typecheck  # tsc --noEmit
npm run lint       # eslint src --ext .ts
npm run test       # vitest run (18 unit tests)
bash scripts/e2e.sh                # full 17-step lifecycle
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
flutter analyze     # clean except 2 info lints (unavoidable modal-after-await)
flutter test        # 10 unit tests (contract + haversine, geofence, JWT payload decode)
flutter build apk --release   # universal APK → client/build/app/outputs/flutter-apk/app-release.apk
flutter build appbundle --release  # Play Store upload bundle
```

### Website
```bash
cd website
npm install
npm run dev        # dev server → http://localhost:3000
npm run build      # production build + TypeScript check
npm run start      # serve the build
npm run lint       # eslint src  (must exit 0 — React Compiler purity rules are on)
```
Sign-in: any email + 6+ char password in demo mode; one-click Driver/Provider/Admin buttons on `/login`.
Routes: `/` marketing, `/login`, `/signup`, `/auth/callback`, `/dashboard{,/map,/bookings,/pass,/provider,/wallet,/admin}`.

## Key invariants
- Redis lock: atomic `SET spot:{id}:lock {driverId} NX EX 600` via dedicated lib (`backend/src/lib/redis.ts`) — never read-then-write.
- Booking FSM edges live in `backend/src/lib/fsm.ts`; all transitions go through `transition()` in `bookings/service.ts`.
- Money math (overstay, 15/85 split) in `backend/src/lib/money.ts`, server-side only.
- QR tokens: HMAC-SHA256 compact JWT signed in `backend/src/lib/qr.ts`; `GET /bookings/:id/qr` refreshes (60s TTL). Verify + QR check-in is in `bookings/routes.ts`.
- Provider QRs: client decodes payload only for booking_id (static `ProviderScannerScreen.decodeBookingId`), server re-verifies HMAC+exp.
- `search_nearby_parking()` PostGIS function: in `backend/db/migrations` + schema; `GET /spots/search` calls it.
- Payload key names: QR endpoint returns `dynamic_qr_payload` (NOT `qr_token` — that's the check-in request field).
- Website auth: one `getSessionUser()` in `website/src/lib/auth/session.ts` serves both modes — Supabase session when `NEXT_PUBLIC_SUPABASE_URL`+`ANON_KEY` are set, else a HMAC-signed `parkpeer_session` cookie. `/dashboard/*` is guarded in `website/src/app/dashboard/layout.tsx` (server-side redirect), not middleware.
- Website runs **credential-free**: with no env vars it uses `website/src/lib/data/demo.ts`. Adding Supabase keys activates real auth with zero code changes.
- 3D scenes must never call `Math.random()`/`Date.now()` during render (React Compiler `react-hooks/purity` is enforced). Use `website/src/lib/random.ts` seeded PRNG, and `useSyncExternalStore` for clocks/capability probes.

## Gotchas
- Backend `.env` is git-ignored; template at repo root `.env.example` (includes `QR_TOKEN_TTL_SECONDS=60`).
- Backend default `PAYMENT_PROVIDER=mock` — swap to `razorpay`/`stripe` for real escrow.
- Android manifest has `android:usesCleartextTraffic="true"` for local dev over http; iOS Info.plist has camera/location usage descriptions.
- Docs dir `docs/` is committed as provided — treat as read-only.
- Release builds are Android-only: `android/upload-keystore.jks` (git-ignored, upload key) wired via git-ignored `android/key.properties`. Keep `applicationId com.parkpeer.parkpeer`. Flutter web target was removed on request — no `client/web/`, no web token store.
- Android build needs JDK 21 + Gradle 8.14.3 + AGP 8.11.1 + Kotlin 2.2.20 (Flutter 3.47 minimums; stay on AGP 8.x — AGP 9 removes standalone KGP). `JAVA_HOME` → Android Studio JBR. `app/build.gradle` must define `signingConfigs.release` and resolve `storeFile` via `rootProject.file(...)` (keystore lives in `android/`, not `android/app/`).
- Website `.env.local` is git-ignored; template at `website/.env.example`. `SESSION_SECRET` signs the demo cookie — the built-in fallback is dev-only.
- Website env: `NEXT_PUBLIC_API_BASE_URL` points at the Fastify backend; blank = demo data.