# Engineering Roadmap & Sprint Execution Checklist

## Sprint 0: Infrastructure & Scaffolding

- [ ] Initialize Git repository with `backend/` and `client/` directories.
- [ ] Spin up Docker Compose running PostgreSQL 15, PostGIS, and Redis.
- [ ] Execute `SCHEMA.md` to configure tables, types, triggers, and GIST indices.
- [ ] Set up continuous integration (CI) linting for TypeScript and Flutter.

---

## Sprint 1: Map Core & Space Listing (Days 1–5)

- [ ] **Backend:** Implement `POST /spots` allowing providers to upload photos, geo-coordinates, and hourly pricing.
- [ ] **Backend:** Implement `GET /spots/search` executing the `search_nearby_parking()` PostGIS function.
- [ ] **Flutter:** Build Map screen using `flutter_map` displaying OpenStreetMap vector tiles centered on user GPS.
- [ ] **Flutter:** Add animated map markers representing available slots; wire popup cards showing rate and distance.
- [ ] **Flutter:** Implement `launchTurnByTurnNavigation()` using `url_launcher` targeting Google Maps and Apple Maps intents.

---

## Sprint 2: Phase 1 & Phase 2 Booking Flow (Days 6–10)

- [ ] **Backend:** Implement `POST /bookings/lock` with Redis atomic command (`SET spot:{id}:lock {driver_id} NX EX 600`).
- [ ] **Backend:** Integrate Stripe / Razorpay pre-authorization intent creation.
- [ ] **Backend:** Implement `POST /bookings/{id}/confirm-payment` releasing the Redis key and updating booking status to `reserved`.
- [ ] **Backend:** Integrate Firebase Cloud Messaging (FCM) to trigger Provider push notifications upon lock confirmation.
- [ ] **Flutter:** Build 10-minute visual countdown timer sheet for driver checkout.
- [ ] **Flutter:** Build Driver "Active Pass" screen showing address, gate instructions, and navigation trigger button.

---

## Sprint 3: Phase 3 Check-In & Phase 4 Escrow Engine (Days 11–15)

- [ ] **Flutter:** Build dynamic rotating QR generator (HMAC-SHA256) and 4-digit PIN display.
- [ ] **Flutter (Provider View):** Build built-in QR scanner screen using `mobile_scanner`.
- [ ] **Backend:** Implement `POST /bookings/{id}/check-in` verifying PIN, QR signature, or PostGIS geofence radius (≤ 50m).
- [ ] **Backend:** Build automated background worker (BullMQ or Node cron) checking for sessions exceeding `expected_end_time`.
- [ ] **Backend:** Implement `POST /bookings/{id}/check-out` applying the overstay fee formula and triggering split payment transfers to provider wallets.

---

## Sprint 4: Admin Portal & Edge Cases (Days 16–20)

- [ ] **Backend & Web:** Build Admin dashboard listing disputed bookings (`spot_blocked`, `overstay_refusal`).
- [ ] **Backend:** Build manual emergency unlock endpoint for administrators to evict orphaned locks.
- [ ] **Flutter:** Implement "Report Blocked Spot" flow with camera attachment, triggering driver auto-refund and spot status penalty.
- [ ] **Client:** Perform end-to-end user testing across Android, iOS, and Web targets.
