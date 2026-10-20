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
├── website/               # Next.js web platform + operator console
├── docker-compose.yml     # local: PostgreSQL + PostGIS, Redis
├── docker-compose.prod.yml# deploy: api, worker, migrate (+ optional local data plane)
├── DEPLOYMENT.md          # deploy runbook
├── PRODUCTION_READINESS.md# status: verified / waiting on credentials / not done
└── .github/workflows/     # CI (TS, website, Flutter, compose)
```

## Quickstart

```bash
cp .env.example .env
docker compose up -d postgres redis
cd backend && npm install && npm run db:migrate && npm run dev
cd ../client && flutter pub get && flutter run
```

## Production

`DEPLOYMENT.md` is the runbook; `PRODUCTION_READINESS.md` is the status. The
parts worth knowing before you deploy:

- The API **refuses to boot** in production on a placeholder `JWT_SECRET`, a
  wildcard `CORS_ORIGIN`, a missing datastore URL or a payment provider without
  keys — start from `backend/.env.production.example`.
- `npm run db:migrate` is idempotent, takes an advisory lock and is safe to run
  on every deploy. It also works against a plain Postgres (the local stack) as
  well as Supabase.
- Run the overstay sweep as its own single-replica service
  (`npm run start:worker`); the in-process worker is development-only.
- Provision with `/health/live` (liveness) and `/health/ready` (Postgres +
  Redis).
- The website's Content-Security-Policy is generated from its environment, so
  rebuild after changing any `NEXT_PUBLIC_*` value; `/api/health` reports
  whether a deployment is live or running on the seed catalogue.

## Sprint Status

- [x] **Sprint 0** — Infra & scaffolding: compose stack, schema migration, CI lint
- [x] **Sprint 1** — Map & listings: `POST /spots`, `GET /spots/search`, Flutter OSM map + deep links
- [x] **Sprint 2** — Phases 1–2: atomic Redis lock, payment pre-auth, confirm-payment + FCM, countdown sheet, Active Pass
- [x] **Sprint 3** — Phases 3–4: QR/PIN/geofence check-in, overstay worker, escrow check-out
- [x] **Sprint 4** — Admin & edge cases: disputes dashboard, emergency unlock, blocked-spot auto-refund