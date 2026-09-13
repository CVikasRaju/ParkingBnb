# ParkPeer: Real-Time P2P Parking Marketplace

ParkPeer is a peer-to-peer parking reservation platform connecting stranded drivers with residential, private, and commercial space owners. The platform enforces a zero-race-condition booking engine, free native turn-by-turn navigation deep-linking, verified multi-tier check-ins, and automated escrow payouts.

---

## Problem Statement

Urban drivers lose significant time, fuel, and productivity searching for parking in congested zones, which contributes to street-level traffic congestion and emissions. Simultaneously, private property owners, commercial complexes, and independent space managers have underutilized, empty parking spaces that lack a unified, reliable platform to monetize and manage securely. Existing solutions suffer from double-booking conflicts, lack of real-time slot verification, and messy check-in and checkout enforcement.

## Solution

A real-time, peer-to-peer parking marketplace web and mobile application that connects stranded drivers with local parking space providers through a structured, 4-phase transaction lifecycle:

1. **Frictionless Discovery & Race-Condition-Free Booking** — Drivers locate nearby verified slots via interactive maps. The platform applies an instant 5-to-10-minute lock during payment pre-authorization to prevent double bookings.
2. **Automated Handshake & Seamless Dispatch** — Immediate notification dispatch gives providers the incoming vehicle's identity, while drivers receive turn-by-turn navigation, gate codes, and precise spot instructions.
3. **Secure, Dual-Tier Check-In** — Spot access is authenticated either manually (dynamic QR codes, 4-digit PINs, GPS geofencing) or automatically (IoT gate barriers, ANPR license plate recognition).
4. **Guaranteed Checkout & Automated Escrow Settlement** — Real-time session monitoring penalizes overstays, immediately frees the listing on departure, deducts platform commission, and deposits earnings directly into the provider's wallet.

---

## 1. Core Personas

* **Driver (User):** Discovers nearby verified spots via interactive maps, reserves spaces with a 10-minute hold guarantee during payment authorization, receives gate access passes, and gets one-tap turn-by-turn navigation.
* **Provider (Host):** Lists driveways, private garages, or commercial bays, sets automated operating schedules and pricing, receives arrival alerts, and earns automated wallet payouts.
* **Admin:** Oversees identity and property verification, resolves booking disputes and reported blockages, manages platform commission structures, and monitors transaction flows.

---

## 2. The 4-Phase Transaction Lifecycle

```
[Driver Discovers Spot]
         │
         ▼
[Phase 1: Real-Time Verification & Lock]
  ├── Redis acquires atomic distributed lock (TTL: 10 mins)
  └── Payment pre-authorization held in escrow (Stripe/Razorpay)
         │
         ▼
[Phase 2: Instant Handshake & Navigation]
  ├── Push & SMS alert dispatched to Provider with vehicle details
  └── Driver receives digital pass + 1-tap Google/Apple Maps deep link
         │
         ▼
[Phase 3: Arrival & Dual-Tier Check-In]
  ├── Low-Tech: Dynamic QR scan, 4-digit PIN, or GPS geofence validation (≤ 50m)
  └── High-Tech: IoT gate relay or ANPR license plate camera webhook
         │
         ▼
[Phase 4: Session Tracking & Checkout]
  ├── Live parking timer runs; automated overtime penalties apply for overstays
  ├── Departure confirmed via driver tap or IoT sensor exit event
  └── Platform deducts take rate (15%); net earnings transferred to Provider wallet
```

---

## 3. Tech Stack

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Mobile & Web App** | Flutter (Dart) | Single codebase for iOS, Android, and Web |
| **In-App Maps** | `flutter_map` + OpenStreetMap / MapLibre | Zero-cost map rendering and nearby spot clustering |
| **Turn-by-Turn Navigation** | Native OS Intents (Google Maps / Apple Maps) | Free voice-guided navigation without commercial SDK fees |
| **Backend API** | Node.js (TypeScript) / Express or Fastify | High-throughput REST and WebSocket gateway |
| **Database** | PostgreSQL + PostGIS | Geospatial indexing (`ST_DWithin`) and relational storage |
| **Concurrency Engine** | Redis (Redlock / Atomic SETNX) | 10-minute temporary holds to eliminate double bookings |
| **Payment & Escrow** | Stripe Connect / Razorpay Route | Pre-authorization holds and marketplace split disbursements |
| **Push Notifications** | Firebase Cloud Messaging (FCM) | Real-time arrival alerts and overstay warnings |

---

## 4. Repository Structure

```text
parkpeer/
├── docs/
│   ├── ARCHITECTURE.md       # Concurrency, state machine, and navigation architecture
│   ├── SCHEMA.md             # PostgreSQL + PostGIS schema, indexes, and triggers
│   ├── API_SPEC.md           # OpenAPI / REST & WebSocket specification
│   └── TASKS.md              # Sprint execution roadmap
├── backend/
│   ├── src/
│   │   ├── modules/
│   │   │   ├── auth/         # JWT, role-based access control
│   │   │   ├── spots/        # PostGIS search, CRUD
│   │   │   ├── bookings/     # Redis locking, state machine, lifecycle
│   │   │   ├── payments/     # Stripe/Razorpay pre-auth and escrow
│   │   │   └── webhooks/     # IoT gate & payment callbacks
│   │   └── server.ts
│   ├── Dockerfile
│   └── package.json
└── client/
    ├── lib/
    │   ├── core/             # API client, deep link handlers, geolocation
    │   ├── features/
    │   │   ├── map/          # FlutterMap OSM integration
    │   │   ├── booking/      # 4-Phase UI flow & dynamic QR generation
    │   │   └── provider/     # Spot listing and schedule management
    │   └── main.dart
    └── pubspec.yaml
```

---

## 5. Quickstart

### Prerequisites

* Docker & Docker Compose
* Node.js v20+
* Flutter SDK v3.22+

### Local Environment Setup

1. Clone the repository and copy the environment template:

   ```bash
   git clone https://github.com/your-org/parkpeer.git
   cd parkpeer
   cp .env.example .env
   ```

2. Start PostgreSQL (with PostGIS) and Redis:

   ```bash
   docker compose up -d postgres redis
   ```

3. Run database migrations:

   ```bash
   cd backend
   npm install
   npm run db:migrate
   npm run dev
   ```

4. Run the Flutter client:

   ```bash
   cd ../client
   flutter pub get
   flutter run
   ```

---

## Further Reading

* [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — concurrency model, booking state machine, navigation strategy, check-in verification, escrow settlement math
* [`docs/SCHEMA.md`](docs/SCHEMA.md) — PostgreSQL + PostGIS schema
* [`docs/API_SPEC.md`](docs/API_SPEC.md) — REST & WebSocket API specification
* [`docs/TASKS.md`](docs/TASKS.md) — sprint-by-sprint execution roadmap
