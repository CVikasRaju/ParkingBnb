# ParkPeer

Real-time peer-to-peer parking marketplace. Drivers find nearby private parking spots on a map, hold them with a 10-minute atomic Redis lock while their payment pre-authorizes, navigate with native OS intents, check in with QR/PIN/geofence/IoT, and are billed automatically on checkout with 85/15 escrow split to the provider.

See the shipped docs (source of truth):

- `docs/ARCHITECTURE.md` — concurrency model, booking FSM, deep-link navigation, check-in verification, overstay/escrow math
- `docs/SCHEMA.md` — PostgreSQL + PostGIS schema, run as-is
- `docs/API_SPEC.md` — every REST endpoint and WebSocket channel
- `docs/TASKS.md` — sprint execution roadmap

## Repository Layout

```
parkpeer/
├── docs/                  # spec documents (source of truth)
├── backend/               # Node.js + TypeScript (Fastify)
├── client/                # Flutter (Dart)
├── docker-compose.yml     # PostgreSQL + PostGIS, Redis
└── .github/workflows/     # CI (TS lint + Flutter analyze)
```

## Quickstart

```bash
cp .env.example .env
docker compose up -d postgres redis
cd backend && npm install && npm run db:migrate && npm run dev
cd ../client && flutter pub get && flutter run
```

## Sprint Status

- [x] **Sprint 0** — Infra & scaffolding: compose stack, schema migration, CI lint
- [x] **Sprint 1** — Map & listings: `POST /spots`, `GET /spots/search`, Flutter OSM map + deep links
- [x] **Sprint 2** — Phases 1–2: atomic Redis lock, payment pre-auth, confirm-payment + FCM, countdown sheet, Active Pass
- [x] **Sprint 3** — Phases 3–4: QR/PIN/geofence check-in, overstay worker, escrow check-out
- [x] **Sprint 4** — Admin & edge cases: disputes dashboard, emergency unlock, blocked-spot auto-refund