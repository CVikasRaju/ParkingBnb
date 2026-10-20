# ParkPeer — web platform

The public 3D experience **and** the operating console for ParkPeer, built as one
Next.js application on top of the Supabase project the rest of the stack already
uses.

Two things are true at once:

- With no credentials the whole platform runs — the scroll-driven landing page,
  the 3D map, the four-phase booking flow, the host console and the operator
  desk — against the seed catalogue in `src/lib/data/seed.ts`, which mirrors the
  eight bays already in Supabase.
- The moment `website/.env.local` holds Supabase keys, the same screens read the
  live `parking_spots`/`bookings` tables, authenticate real accounts, write real
  bookings and react to Realtime. No code changes.

---

## Stack

| Concern | Choice |
| :--- | :--- |
| Framework | Next.js 16 (App Router, Turbopack, React 19) |
| 3D | three.js · React Three Fiber · drei · `@react-three/postprocessing` |
| Motion | GSAP ScrollTrigger + Lenis (scroll), Framer Motion (UI) |
| Map | MapLibre GL v5 with extruded markers at 60° pitch |
| State | Zustand (`src/store/useParkPeerStore.ts`) |
| Auth / data | Supabase (`@supabase/ssr`) + Realtime |
| Fonts | Space Grotesk (display), Plus Jakarta Sans (body), JetBrains Mono (data) |

---

## Routes

| Route | What it is |
| :--- | :--- |
| `/` | Five-act scroll-driven 3D landing page. One persistent WebGL canvas; scrolling scrubs the camera along a Catmull-Rom spline through a procedural city. |
| `/explore` | Full-screen 3D map with GPU-rendered bay markers and the four-phase booking drawer. |
| `/auth` | Unified sign-in / sign-up. Role switching moves the 3D camera; a driver's plate renders live on a 3D plate. |
| `/provider` | Host console: 3D slot configurator, rate control, arrival radar, PIN/QR verifier, payout ledger. |
| `/admin` | Operator god-view: 3D telemetry city, force-release controls, dispute desk, commission analytics. |
| `/auth/callback` | Supabase OAuth / email-confirmation exchange. |
| `/terms`, `/privacy` | Legal documents. Server-rendered, no JS required — reviewers and payment providers read them with a crawler. |
| `/api/health` | Deployment health check: reports live vs seed mode, never a secret, never a database query. |

`/login`, `/signup` and `/dashboard/*` are retired and permanently redirect (see
`next.config.ts`).

---

## Quickstart

```bash
cd website
npm install
npm run dev     # http://localhost:3000
```

Scripts:

```bash
npm run dev      # dev server (Turbopack)
npm run build    # production build + type check
npm run start    # serve the production build
npm run lint     # eslint (flat config, React Compiler rules on)
```

---

## Connecting Supabase

1. Copy `.env.example` to `.env.local`.
2. From **Project Settings → API**, set:

   ```bash
   NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
   SUPABASE_SERVICE_ROLE_KEY=<service role key>   # server-only
   NEXT_PUBLIC_SITE_URL=http://localhost:3000
   ```

3. Apply the database migrations (see below) if the project is fresh.
4. Add your site URL to **Authentication → URL Configuration → Redirect URLs**.
5. Restart `npm run dev`.

### What the database needs

The website relies on migrations `013`–`015` in `backend/db/migrations/`:

- **013 / 014** — public read access for the map, with the two sensitive columns
  (`entry_instructions`, `iot_device_key`) deliberately excluded.
- **015** — the Supabase Auth bridge:
  - mirrors every `auth.users` row into `public.users` with the same UUID, so
    `bookings.driver_id` and `vehicles.driver_id` have something to point at;
  - adds RLS policies so a driver reads only their own rows, a host reads their
    own bays and the bookings on them, and operators read everything;
  - grants the column-level privileges those policies need;
  - publishes `parking_spots` and `bookings` to `supabase_realtime`;
  - adds `public_providers`, a curated view so the map can show host names
    without exposing the `users` table;
  - adds `spot_access(spot_id)`, the only way a gate code or device secret is
    ever released — and only to the host or a driver holding a live booking.

Apply them with the backend's runner, which is idempotent and tracks what it has
already applied:

```bash
cd ../backend
npm run db:migrate
```

---

## How the four phases map onto the data

| Phase | UI | Database |
| :--- | :--- | :--- |
| 1 · Lock & pre-authorise | "Lock bay for 10 mins" | insert `bookings` (`pending_lock`), set `parking_spots.status = 'locked'`, mint PIN + QR secret |
| 2 · Handshake | countdown, host notification, route | update to `reserved` |
| 3 · Arrival | rotating QR, PIN, GPS geofence, IoT gate | update to `checked_in` with `verified_via` + `actual_check_in` |
| 4 · Settlement | session timer, overstay fast-forward, receipt | update to `completed`, insert `settlement_ledger` (85/15), free the bay |

Every write goes through a server action in `src/lib/actions/` on the
service-role client, with an explicit authorisation check first, because the
public roles intentionally hold no write grants.

The 10-minute hold has no column of its own — the production API keeps the TTL
in Redis. The web platform derives it from `created_at`, treats an older
`pending_lock` as expired, and sweeps those rows on load
(`releaseExpiredLocks`), so an abandoned tab can never strand a bay.

---

## Structure

```text
website/src/
├── app/
│   ├── page.tsx            # five-act landing
│   ├── explore/            # 3D map + booking engine
│   ├── auth/               # auth portal + callback
│   ├── provider/           # host console
│   └── admin/              # operator god-view
├── components/
│   ├── three/              # procedural meshes, custom shaders, the scenes
│   ├── landing/            # Lenis + GSAP scrollytelling
│   ├── explore/            # MapLibre canvas, HUD, booking drawer
│   ├── auth/ provider/ admin/
│   └── shell/Nav.tsx
├── lib/
│   ├── actions/            # server actions (booking lifecycle, host, operator)
│   ├── data/               # seed catalogue, row adapters, loaders
│   ├── auth/               # session, roles, form actions
│   ├── supabase/           # browser, user-scoped server, service-role clients
│   ├── fsm.ts              # mirror of backend/src/lib/fsm.ts
│   ├── money.ts            # mirror of backend/src/lib/money.ts
│   ├── geo.ts              # haversine, geofence, EWKB decode
│   └── useNow.ts           # shared 1 Hz clock for every live timer
└── store/useParkPeerStore.ts
```

---

## Deploying

Vercel needs no extra configuration: set the same environment variables in the
project settings (see `.env.example` for the annotated list) and add the
deployment URL to Supabase's redirect list. The service-role key is the one to
guard — it bypasses RLS, so keep it server-only and rotate it if it ever appears
in a client bundle.

What ships from this directory that you should know about:

| Thing | Where |
| :--- | :--- |
| Security headers + Content-Security-Policy | `next.config.ts` — the CSP is built from `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_API_BASE_URL`, so **rebuild after changing either** |
| Uptime check | `/api/health` — reports `mode: live\|seed` and the configuration it booted with, without touching the database |
| Legal pages | `/terms`, `/privacy` — plain server-rendered documents, linked from the landing footer and the sign-up form |
| Crawlers | `/robots.txt` (consoles and `/api` disallowed), `/sitemap.xml` from `NEXT_PUBLIC_SITE_URL` |
| Error boundary + 404 | `src/app/error.tsx`, `src/app/not-found.tsx` |

Before launch: confirm `curl -s https://<deploy>/api/health` says `"mode":"live"`
(seed mode means the public Supabase pair did not reach the build), have the two
legal documents reviewed, and wire an error reporter into `src/app/error.tsx`
(see `../DEPLOYMENT.md` → Observability).
