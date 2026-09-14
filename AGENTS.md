# ParkPeer — Agent Memory

P2P parking marketplace. Specs in `docs/` are the source of truth — **do not modify them**.

## Layout
- `backend/` — Fastify + TypeScript, PostgreSQL 15+PostGIS, Redis. Modules: auth, spots, bookings, payments, webhooks, realtime, admin.
- `client/` — Flutter (Dart) app. `lib/core` (api_client, deep_link, geolocation, ws_client), `lib/features/{map,booking,provider,admin}`.
- `docker-compose.yml` — postgres (postgis/postgis:15-3.4) + redis; schema auto-loads from `backend/db/schema.sql`.

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
Flutter SDK at `/tmp/flutter/bin` (not system-installed).
```bash
export PATH=/tmp/flutter/bin:$PATH
cd client
flutter pub get
flutter analyze     # clean except 2 info lints (unavoidable modal-after-await)
flutter test        # 6 unit tests (haversine, geofence, JWT payload decode)
flutter build web --release
```

## Key invariants
- Redis lock: atomic `SET spot:{id}:lock {driverId} NX EX 600` via dedicated lib (`backend/src/lib/redis.ts`) — never read-then-write.
- Booking FSM edges live in `backend/src/lib/fsm.ts`; all transitions go through `transition()` in `bookings/service.ts`.
- Money math (overstay, 15/85 split) in `backend/src/lib/money.ts`, server-side only.
- QR tokens: HMAC-SHA256 compact JWT signed in `backend/src/lib/qr.ts`; `GET /bookings/:id/qr` refreshes (60s TTL). Verify + QR check-in is in `bookings/routes.ts`.
- Provider QRs: client decodes payload only for booking_id (static `ProviderScannerScreen.decodeBookingId`), server re-verifies HMAC+exp.
- `search_nearby_parking()` PostGIS function: in `backend/db/migrations` + schema; `GET /spots/search` calls it.
- Payload key names: QR endpoint returns `dynamic_qr_payload` (NOT `qr_token` — that's the check-in request field).

## Gotchas
- Backend `.env` is git-ignored; template at repo root `.env.example` (includes `QR_TOKEN_TTL_SECONDS=60`).
- Backend default `PAYMENT_PROVIDER=mock` — swap to `razorpay`/`stripe` for real escrow.
- Android manifest has `android:usesCleartextTraffic="true"` for local dev over http; iOS Info.plist has camera/location usage descriptions.
- Docs dir `docs/` is committed as provided — treat as read-only.
- Web token storage is platform-adaptive (`lib/core/token_store*.dart`): native uses secure storage, web uses `localStorage` (avoids the `flutter_secure_storage` web plugin bootstrap failure that left a blank white canvas). Web build defaults to `http://localhost:8080/api/v1`.