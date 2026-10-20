# 3D Map & Real-Time Booking Engine Specification

## 1. Interactive 3D Map Architecture (`/explore`)
When users click **"Find Parking"** or scroll to the bottom of the landing page, they enter the full-screen Map Explorer.

### Map Configuration
* **Engine:** Mapbox GL JS v3 (Standard Dark Core style with custom 3D building extrusions enabled).
* **Camera Defaults:** `pitch: 60`, `bearing: -20`, `zoom: 16.5` for a dramatic 3D street-level perspective.
* **Custom 3D Marker Layer:**
  * Standard Mapbox DOM markers lag when rendering >100 items. Use a **Custom Three.js Layer** synced to Mapbox's projection matrix (`mapboxgl.MercatorCoordinate`) or instanced WebGL markers.
  * **States:**
    * **Available:** Floating Emerald Pill (`#10B981`) displaying hourly price.
    * **Hovered/Selected:** Expands in 3D scale (`1.3x`), emits a ground-ring pulse, and smoothly flies the camera (`map.flyTo`) to frame the exact driveway/lot entrance.
    * **EV Charger Equipped:** Displays a rotating 3D lightning bolt icon above the price pin.

## 2. Spot Inspection Drawer (3D Street-View Preview)
Clicking a pin opens a glassmorphic side panel containing:
1. **3D Spot Visualizer:** A mini embedded R3F canvas showing the exact dimensions of the spot (`Length x Width x Height clearance`) compared against the user's selected vehicle model (e.g., Hatchback, Sedan, SUV, Bike).
2. **Host & Access Info:** Security camera badge, gated entry instructions, EV charging kW rating, and user ratings.
3. **Dynamic Time-Slot Selector:** Interactive circular or horizontal timeline scrubber to pick **Check-In** and **Check-Out** times with instant price recalculation.

## 3. Real-Time Booking State Machine
To prevent double-booking when two drivers click the same spot simultaneously:

```text
[AVAILABLE] 
   │ (User clicks "Reserve Now")
   ▼
[LOCKED_PENDING_PAYMENT] ──► (10-minute Redis/Supabase TTL Lock created)
   │                         (Spot turns Amber on all other users' maps via Supabase Realtime)
   ├──► (Payment Fails / Timer Expires) ──► [AVAILABLE]
   │
   ▼ (Payment Webhook Succeeds)
[CONFIRMED_BOOKED]
   │
   ▼ (Driver arrives within geofence / clicks "Check-In")
[ACTIVE_PARKING_SESSION] ──► (Live countdown timer in HUD; option to "Extend Time" in 1-click)
   │
   ▼ (Driver departs & checks out)
[COMPLETED] ──► (Payout released to Host; Review prompt triggered)