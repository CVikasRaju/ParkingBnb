# ParkPeer — website & web app

The public marketing site **and** the logged-in web console for ParkPeer, built
as a single Next.js application.

It is designed so that **nothing needs to be configured to try it**. With no
credentials present the site runs in *demo mode*: you can sign in, browse the
map, hold a bay, open a rotating QR pass, manage listings and work the dispute
desk — all against a built-in dataset. The moment you add real Supabase keys,
the same screens use real auth and data, with no code changes.

---

## Stack

| Concern | Choice |
| :--- | :--- |
| Framework | Next.js 16 (App Router, TypeScript strict) |
| 3D | React Three Fiber + three.js |
| Styling | Tailwind CSS v4 (design tokens in `src/app/globals.css`) |
| Motion | Framer Motion + CSS-transition scroll reveals |
| Maps | Leaflet + react-leaflet (OpenStreetMap tiles) |
| Auth / data | Supabase (`@supabase/ssr`) — optional |
| QR | `react-qr-code` (SVG, no canvas) |

---

## Quickstart

```bash
cd website
npm install
npm run dev
```

Open <http://localhost:3000>. Sign in with **any** email and a password of six
or more characters — the login screen also has one-click **Driver / Provider /
Admin** demo buttons.

### Scripts

```bash
npm run dev     # dev server (Turbopack)
npm run build   # production build + type check
npm run start   # serve the production build
npm run lint    # eslint
```

---

## 3D scenes

Three independent WebGL scenes carry the marketing site, each mounted only while
near the viewport (`src/components/three/SceneFrame.tsx`) so the GPU never
renders more than one at a time:

1. **Isometric city** (`HeroCity.tsx`) — a stylised skyline with live parking
   bays. Hover a bay to inspect it; click one and a car drives over and parks.
   The camera follows your cursor.
2. **Wave field** (`ParkingWave.tsx`) — ~900 bay columns in a single
   `InstancedMesh`, driven by a travelling wave plus a ripple under the cursor.
3. **Interactive globe** (`CityGlobe.tsx`) — drag to spin, hover a marker for
   market stats, with animated arcs from the Hyderabad hub and a starfield.

All three degrade safely: if WebGL is unavailable, or the visitor has
`prefers-reduced-motion` set, the canvas is replaced with a styled placeholder
instead of animating.

---

## Connecting Supabase

The app is wired for Supabase already — it activates purely from environment
variables.

1. Create a project at [supabase.com](https://supabase.com).
2. Copy `.env.example` to `.env.local`.
3. Open **Project Settings → API** and copy the values across:

   <https://supabase.com/dashboard/project/_/settings/api>

   ```bash
   NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
   SUPABASE_SERVICE_ROLE_KEY=<service role key>   # server-only, never public
   SESSION_SECRET=<openssl rand -base64 32>
   ```

4. Restart `npm run dev`.

What changes automatically once the keys are present:

- Sign-up/sign-in go through `supabase.auth` instead of the demo session cookie.
- Email confirmation is honoured (an "check your inbox" notice is shown when a
  session is not returned immediately).
- OAuth buttons (Google, GitHub) appear on both auth screens — enable the
  provider in **Authentication → Providers** to make them work.
- Email magic links and OAuth redirects land on `/auth/callback`, which
  exchanges the code for a session cookie.
- The sidebar label flips from *Demo data* to *Supabase connected*.

### Auth model

`src/lib/auth/session.ts` exposes one `getSessionUser()` for both modes:

- **Supabase configured** → reads the Supabase session from cookies and maps
  `user_metadata.role` / `full_name` onto the app's `SessionUser`.
- **Not configured** → reads a signed HTTP-only `parkpeer_session` cookie.

The demo cookie is HMAC-SHA256 signed with `SESSION_SECRET`, so it cannot be
hand-edited to escalate a role. Set a real `SESSION_SECRET` before deploying —
the built-in fallback is for local development only.

`/dashboard/*` is guarded server-side in `src/app/dashboard/layout.tsx`, which
redirects anonymous visitors to `/login`.

---

## Optional: the ParkPeer API

The Fastify backend in `../backend` is the source of truth for bookings, the
Redis lock, escrow and check-in. Point the site at it with:

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:8080/api/v1
```

While this is blank, every screen reads `src/lib/data/demo.ts`. The demo shapes
deliberately mirror the real API in `../docs/API_SPEC.md` — including the
booking FSM states from `backend/src/lib/fsm.ts` and the 15% commission — so
swapping the data source is a transport change, not a rewrite.

---

## Routes

| Route | Description |
| :--- | :--- |
| `/` | Marketing site: 3D hero, lifecycle, platform, personas, coverage globe, pricing, FAQ |
| `/login`, `/signup` | Auth, with demo quick-access |
| `/auth/callback` | Supabase OAuth / magic-link exchange |
| `/dashboard` | Overview: active reservations, spend, nearby availability |
| `/dashboard/map` | Leaflet map with price markers, filters, and the 10-minute hold countdown |
| `/dashboard/bookings` | All reservations, filtered by FSM status |
| `/dashboard/pass` | Rotating QR pass, PIN fallback, live session timer, check-in/out |
| `/dashboard/provider` | Host console: listings, arrivals, pause/resume, utilisation |
| `/dashboard/wallet` | Balance, settlement ledger, escrow explanation |
| `/dashboard/admin` | Dispute desk, verification queue, escrow health |

---

## Project structure

```text
website/
├── src/
│   ├── app/
│   │   ├── page.tsx              # marketing site
│   │   ├── login/ signup/        # auth pages
│   │   ├── auth/callback/        # Supabase code exchange
│   │   └── dashboard/            # guarded web app
│   ├── components/
│   │   ├── three/                # 3D scenes + resilient canvas wrapper
│   │   ├── marketing/            # landing sections
│   │   ├── auth/                 # auth shell + forms
│   │   └── app/                  # dashboard shell, map, pass, consoles
│   └── lib/
│       ├── config.ts             # env detection (demo vs connected)
│       ├── auth/                 # session, server actions, roles
│       ├── supabase/             # browser + server clients
│       ├── data/demo.ts          # built-in dataset
│       └── format.ts             # currency / date / status helpers
└── .env.example
```

---

## Deploying

Deploys to Vercel with no extra configuration. Set the same environment
variables in the project settings, and add your deployment URL to
**Supabase → Authentication → URL Configuration** so OAuth redirects return to
the right host.

> The `SESSION_SECRET` warning is real: without it the demo session cookie falls
> back to a known development secret, which is fine locally but must be set in
> any shared or public environment.
