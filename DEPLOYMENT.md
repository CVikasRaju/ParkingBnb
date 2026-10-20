# ParkPeer — deployment runbook

Three deployables, in the order they should go out:

| Piece | What it is | Where it goes |
| :--- | :--- | :--- |
| **Database** | Postgres 15 + PostGIS, plus the migrations in `backend/db/migrations/` | Supabase (already configured) or any PostGIS host |
| **API** | Fastify + TypeScript in `backend/` — REST, WebSocket, workers | Any container host (Fly, Render, ECS, a VM) or `docker-compose.prod.yml` |
| **Web** | Next.js in `website/` — landing, map, host console, operator desk | Vercel, or the same container host |
| **Mobile** | Flutter app in `client/` — Android/iOS/web | Play Console, App Store, or `flutter build web` |

Everything below is written against what is actually in the repo. Where a step
needs an account or a credential only you can create, it says so.

---

## 0. Before anything else

```bash
# From the repo root
cd backend  && npm ci && npx tsc --noEmit && npm run lint && npm test
cd ../website && npm ci && npm run lint && npm run build
cd ../client && flutter pub get && flutter analyze && flutter test
```

That is exactly what CI runs (`.github/workflows/ci.yml`). If it is green
locally it will be green there.

---

## 1. Database

### 1.1 Apply the migrations

Every migration is idempotent and tracked in `schema_migrations`, so this is
safe to re-run on every deploy:

```bash
cd backend
DATABASE_URL='postgres://…/postgres' npm run db:migrate
```

Use the **direct** connection (Supabase port `5432`), not the transaction
pooler (`6543`): migrations take DDL and long transactions.

Migrations 015–019 are the web platform's foundation — they mirror Supabase Auth
users into `public.users`, install the row-level-security policies, publish
`parking_spots`/`bookings` to Realtime, and (018) add the audit log. The runner
detects a database without the Supabase roles and installs a small compatibility
shim so the same command also works against the local docker-compose Postgres.

### 1.2 Turn off the demo fixtures

`backend/db/migrations/017` seeds eight bays and eight provider accounts whose
password (`secret123`) is published in the repository. They exist so the map has
something to draw. Never launch on them:

```bash
cd backend
npm run db:purge-demo -- --yes     # refuses if real bookings reference them
```

### 1.3 Backups

Supabase: **Project Settings → Database → Backups** — confirm daily backups are
enabled and that PITR is on for the plan you are paying for. Self-hosted:
`pg_dump` on a schedule is the minimum; a backup you have never restored is not
a backup. Do one restore into a scratch database before launch.

### 1.4 Supabase Auth configuration

**Authentication → URL Configuration**

- Site URL: `https://app.parkpeer.example`
- Redirect URLs: `https://app.parkpeer.example/auth/callback` (and the same for
  any preview domain you want sign-in to work on)

**Authentication → Emails** — the built-in SMTP sender is rate-limited hard
(free tier: a handful of messages per hour). Point it at Resend/SendGrid/Postmark
before inviting real users, and check the "Confirm email" setting matches what
the sign-up flow expects: with confirmation on, `signUpAction` shows a "check
your inbox" notice instead of a session.

### 1.5 Operator accounts

Admin accounts cannot be self-registered (migration 019). Promote one directly:

```sql
UPDATE public.users SET role = 'admin' WHERE email = 'ops@parkpeer.example';
```

---

## 2. API (Fastify)

### 2.1 Configuration

```bash
cp backend/.env.production.example backend/.env.production
# fill in every value; the comments say what each one is for
```

`NODE_ENV=production` is a gate, not a label. The process refuses to start when:

- `DATABASE_URL` / `REDIS_URL` are missing (the localhost defaults are dev-only);
- `JWT_SECRET` is missing, under 32 characters, or still reads like a placeholder;
- `CORS_ORIGIN` is `*`, empty, or lists a non-https origin;
- the configured payment provider is missing its keys;
- `PAYMENT_PROVIDER=mock` without `MOCK_PAYMENT_SECRET`.

Generate the secrets properly:

```bash
openssl rand -base64 48                 # JWT_SECRET
openssl rand -hex 32                    # MOCK_PAYMENT_SECRET, ADMIN_SIGNUP_SECRET
```

### 2.2 Deploy

With the bundled compose stack:

```bash
docker compose -f docker-compose.prod.yml --profile tools run --rm migrate
docker compose -f docker-compose.prod.yml up -d --build
```

On a container host, build `backend/Dockerfile`:

- target `runtime` (default) → the API, listens on `8080`
- target `worker` → the overstay sweep. **Exactly one replica.** Run it as a
  separate service with `OVERSTAY_WORKER=0` on the API, or every API instance
  will sweep the same sessions and send duplicate pushes.
- target `migrate` → one-shot `db/migrate.ts` for the deploy step above.

The container exposes `/health/live` (process up — use it for the container
healthcheck) and `/health/ready` (Postgres **and** Redis reachable — use it for
the load-balancer target check). Point your orchestrator at them accordingly: a
503 from `/health/ready` should drain traffic, not restart the pod.

### 2.3 Behind a proxy

Set `TRUST_PROXY=true` whenever nginx/Cloudflare/an ALB terminates TLS in front
of the API. Without it every request carries the proxy's IP, which collapses
per-IP rate limiting into a single shared bucket — and with it, never expose the
port directly, or a client can spoof `X-Forwarded-For`.

### 2.4 Payments

`PAYMENT_PROVIDER=mock` runs the whole lifecycle and moves no money. For real
escrow: `stripe` (needs `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET`) or
`razorpay` (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`,
`RAZORPAY_WEBHOOK_SECRET`). Then register the webhook URL with the provider:

```
POST https://api.parkpeer.example/api/v1/webhooks/payment
```

The handler verifies the signature before it trusts anything in the body, and
returns 401 otherwise. Point the provider's webhook tester at it once after
deploy and confirm a `200`.

If you launch on `mock`, set `MOCK_PAYMENT_SECRET` and send it as
`X-Mock-Payment-Secret` on confirmation calls — in production the endpoint
refuses unauthenticated confirmations.

### 2.5 Push notifications

`FCM_SERVICE_ACCOUNT_PATH` must point at a Firebase service-account JSON
**inside the container**; mount it as a read-only secret rather than baking it
into the image. Left empty, pushes are logged and dropped — the booking
lifecycle still works, drivers just do not get the overstay warning.

---

## 3. Web (Next.js)

### 3.1 Configuration

Copy `website/.env.example` to `website/.env.local` for local work; on Vercel,
paste the same variables into **Settings → Environment Variables** (Production,
Preview and Development):

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY      # server-only; bypasses RLS
NEXT_PUBLIC_SITE_URL           # https://app.parkpeer.example
NEXT_PUBLIC_API_BASE_URL       # optional: https://api.parkpeer.example/api/v1
```

Two things to know before you paste:

- **The service-role key is the crown jewel.** It bypasses row-level security.
  Mark it as a secret in your host, never prefix it with `NEXT_PUBLIC_`, and
  rotate it if it ever appears in a client bundle or a log.
- **`NEXT_PUBLIC_API_BASE_URL` is optional.** Without it the console runs purely
  on Supabase; with it, screens that mint QR payloads and read wallets call the
  Fastify API. If you set it, that origin must also be in the API's `CORS_ORIGIN`
  and in the site's CSP (the CSP is generated in `website/next.config.ts` from
  these env values, so a rebuild is required after changing them).

### 3.2 Deploy

Vercel: import the repo, set the root directory to `website`, deploy. No
`vercel.json` is needed — redirects, headers and the CSP come from
`next.config.ts`.

### 3.3 Verify the deploy

```bash
curl -s https://app.parkpeer.example/api/health
# {"status":"ok","mode":"live","dataSource":"Supabase live",
#  "checks":{"supabase":"configured","serviceRole":"configured",…}}
```

`"mode":"seed"` means the public Supabase pair did not reach the build — the
site will render fixtures. That endpoint never queries the database on purpose;
it answers "is this deployment configured correctly?", not "is Supabase up?".

Then check the headers landed:

```bash
curl -sI https://app.parkpeer.example/ | grep -i -E "content-security-policy|strict-transport|x-frame"
```

---

## 4. Mobile (Flutter)

### 4.1 Point it at production

```bash
cd client
flutter build appbundle --release \
  --dart-define=API_BASE_URL=https://api.parkpeer.example/api/v1
```

Release builds contain no `usesCleartextTraffic` (it is in
`android/app/src/debug/AndroidManifest.xml` only), so an `http://` base URL will
simply fail — that is deliberate.

### 4.2 Signing

`android/key.properties` + `upload-keystore.jks` are git-ignored and must exist
for a Play-uploadable artefact. Without them Gradle falls back to debug signing
and prints a loud warning; the bundle will be rejected by Play Console. Back the
keystore up somewhere you will still have it in five years — losing it means
losing the ability to update the app under the same listing.

iOS: an Apple Developer account, a distribution certificate and a provisioning
profile (`client/ios/`). App Store Connect metadata and screenshots are not in
this repository.

### 4.3 Permissions

Camera (QR check-in), fine location (geofence), notifications. The Android and
iOS usage descriptions already exist; if you remove the camera flow, remove the
permission too, because a store reviewer will ask why it is there.

---

## 5. Observability

Nothing is wired to an error reporter yet. Before launch, pick one and add it in
two places:

1. **Web** — `website/src/app/error.tsx` logs to the console; initialise Sentry
   (or similar) in `instrumentation.ts` and it will capture both server and
   client errors.
2. **API** — Fastify logs through pino with request ids and credential
   redaction. Ship the JSON to your log stack, and alert on
   `/health/ready` going 503 and on the `[shutdown]` lines.

Alerts worth having on day one: `/health/ready` failing twice in a row, HTTP 5xx
rate, the overstay worker logging nothing for an hour (it runs every minute), and
zero `settlement_ledger` rows during business hours on a live platform.

---

## 6. Rolling back

- **API**: deploy the previous image tag. Migrations are additive, so an older
  API runs against a newer schema; only roll the schema back if a migration
  actually dropped something (none currently do).
- **Web**: `vercel rollback` (or promote the previous deployment).
- **Database**: restore from the snapshot taken before the bad deploy, and only
  after deciding what happened to the writes in between.

---

## 7. Environment variable reference

Full annotated lists live in the templates:

- API: `backend/.env.production.example` (also `/.env.example` for local dev)
- Web: `website/.env.example`

The short version of what must be rotated, and how dangerous each one is:

| Secret | Rotation | Blast radius if leaked |
| :--- | :--- | :--- |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → API keys | **Total**: bypasses RLS over the whole dataset |
| `JWT_SECRET` | `openssl rand -base64 48` | Sessions forged for any user, any role |
| `RAZORPAY_KEY_SECRET` / `STRIPE_SECRET_KEY` | Provider dashboard | Charges and refunds on your account |
| `*_WEBHOOK_SECRET` | Provider dashboard | Forged payment confirmations (unpaid bookings) |
| `MOCK_PAYMENT_SECRET` | `openssl rand -hex 32` | Unpaid bookings while on the mock gateway |
| `ADMIN_SIGNUP_SECRET` | `openssl rand -hex 32` | Admin self-registration through `/auth/register` |
| `DATABASE_URL` password | Supabase → Database → Reset password | Direct database access |
| `REDIS_URL` password | Redis provider | Booking locks could be dropped or forged |
| Android keystore | Cannot be rotated safely | Loss = cannot update the Play listing |
