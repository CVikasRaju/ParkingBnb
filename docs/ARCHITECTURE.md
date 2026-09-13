# System Architecture & Technical Specifications

## 1. Concurrency Model: Preventing Double-Bookings (Phase 1)

When multiple drivers attempt to book the same spot simultaneously, the system prevents race conditions at the cache layer before hitting the relational database.

```
Driver A Request ───┐
                     ├───> [API Gateway] ───> [Redis Atomic Engine]
Driver B Request ───┘                                │
                                                      ├── Driver A: SET spot:{id}:lock {driver_A_id} NX EX 600 -> OK
                                                      └── Driver B: SET spot:{id}:lock {driver_B_id} NX EX 600 -> NIL (409 Conflict)
```

### Redis Key Lifecycle

* **Key:** `lock:spot:{spot_id}`
* **Value:** `{"booking_id": "...", "driver_id": "..."}`
* **TTL:** `600` seconds (10 minutes).
* **Release Scenarios:**
  1. **Payment Succeeded:** The lock is converted into a confirmed `RESERVED` booking record in PostgreSQL. The Redis lock is released.
  2. **Payment Cancelled / Failed:** The key is deleted explicitly via `DEL lock:spot:{spot_id}`.
  3. **Client Abandonment:** Redis automatically evicts the key at TTL = 0, restoring spot availability with zero manual cleanup.

---

## 2. Booking Finite State Machine (FSM)

```
               ┌─────────────── Payment Failed / 10m TTL Expired ──────────────┐
               │                                                                │
               ▼                                                                │
        [ AVAILABLE ] ──────────> [ LOCKED ] ──────────> [ RESERVED ]           │
              ▲                     (10 min TTL)               │                │
              │                                                │                │
              │                                                ▼                │
        [ COMPLETED ] <────────── [ ACTIVE ] <───────── [ CHECKED_IN ]          │
              ▲                     (Timer running)             │               │
              │                            │                    │               │
              │                     Overstay Exceeded            │               │
              │                            │                    │               │
              │                            ▼                    │               │
              └─────────────────── [ PENALTY_BILLED ]           │               │
                                           ▲                    ▼               ▼
                                           └─────────── [ DISPUTED / CANCELLED ]
```

### Transition Invariants

* `AVAILABLE` → `LOCKED`: Only allowed if no active booking overlaps and Redis lock is granted.
* `LOCKED` → `RESERVED`: Triggered strictly by payment gateway webhook (`payment_intent.amount_capturable_updated`).
* `RESERVED` → `ACTIVE`: Triggered by QR code match, valid PIN entry, or geofence verification.
* `ACTIVE` → `COMPLETED`: Triggered by check-out action; fires escrow release and provider wallet credit.

---

## 3. Navigation Strategy: Native Deep-Linking Engine

To avoid Google/Mapbox Turn-by-Turn SDK licensing costs ($0.50–$2.00+ per session), the application hands off turn-by-turn navigation directly to the user's native operating system app.

```
[Driver Taps "Navigate"]
          │
          ├── Platform = iOS ─────> Launch Apple Maps Intent:
          │                         http://maps.apple.com/?daddr={lat},{lng}&dirflg=d
          │
          └── Platform = Android ─> Launch Google Maps Native Intent:
                                     google.navigation:q={lat},{lng}&mode=d
                                     │
                                     └── Fallback (Web/Desktop):
                                         https://www.google.com/maps/dir/?api=1&destination={lat},{lng}
```

### Flutter Intent Launcher Implementation

```dart
import 'dart:io';
import 'package:url_launcher/url_launcher.dart';

Future<void> launchTurnByTurnNavigation({
  required double destinationLat,
  required double destinationLng,
}) async {
  final Uri uri;

  if (Platform.isIOS) {
    uri = Uri.parse(
      'http://maps.apple.com/?daddr=$destinationLat,$destinationLng&dirflg=d',
    );
  } else if (Platform.isAndroid) {
    uri = Uri.parse(
      'google.navigation:q=$destinationLat,$destinationLng&mode=d',
    );
  } else {
    uri = Uri.parse(
      'https://www.google.com/maps/dir/?api=1&destination=$destinationLat,$destinationLng&travelmode=driving',
    );
  }

  if (await canLaunchUrl(uri)) {
    await launchUrl(uri, mode: LaunchMode.externalNonBrowserApplication);
  } else {
    final fallback = Uri.parse(
      'https://www.google.com/maps/dir/?api=1&destination=$destinationLat,$destinationLng&travelmode=driving',
    );
    await launchUrl(fallback, mode: LaunchMode.externalApplication);
  }
}
```

---

## 4. Phase 3: Arrival & Dual-Tier Verification Architecture

```
                                  [Arrival Event]
                                         │
                    ┌────────────────────┴────────────────────┐
                    ▼                                         ▼
            [Tier 1: Low-Tech]                       [Tier 2: High-Tech]
      (Residential Driveways & Lots)             (Gated & Commercial Garages)
                    │                                         │
        ┌───────────┼───────────┐                             │
        ▼           ▼           ▼                             ▼
   [Dynamic QR]  [4-Digit]  [GPS Radius]             [IoT Gate / ANPR]
   HMAC-SHA256     PIN      PostGIS Point            Camera reads plate,
   rotates 30s   validated   ≤ 50 meters             hits `/webhooks/gate`
        │           │           │                             │
        └───────────┼───────────┘                             │
                    ▼                                         ▼
             [API Validation] ───────────────────────> [Lift Gate /
                                                        Start Session]
```

### Verification Rules

* **Dynamic QR Code:** Contains a time-based token signed with HMAC-SHA256 (`jwt.sign({ booking_id, timestamp }, secret, { expiresIn: '60s' })`). Scanned by the provider app to prevent screenshot fraud.
* **Geofencing Check:** Server computes Haversine distance between driver device coordinates (lat_d, lng_d) and spot coordinates (lat_s, lng_s). Verification passes if distance ≤ 50 meters.
* **IoT Relay / ANPR:** Webhook endpoint `/api/v1/webhooks/gate` accepts JSON payloads from Raspberry Pi / ESP32 relays or ANPR camera systems matching `license_plate` against active `RESERVED` bookings.

---

## 5. Phase 4: Overstay Calculation & Escrow Settlement

### Overstay Penalty Formula

```
T_overstay = max(0, T_actual_checkout − T_expected_end)
```

If `T_overstay > 15 minutes`:

```
Penalty Fee = ceil(T_overstay / 60) × (Hourly Rate × Overstay Multiplier)
```

### Escrow Distribution Breakdown

* Gross Amount = Base Amount + Penalty Fee
* Platform Commission (15%) = Gross Amount × 0.15
* Provider Disbursement (85%) = Gross Amount − Platform Commission

Captured via payment gateway split transfer (Stripe Transfers or Razorpay Route) directly to the provider's connected account upon `COMPLETED` status.
