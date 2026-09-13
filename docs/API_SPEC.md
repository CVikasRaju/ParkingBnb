# REST & WebSocket API Specification

Base URL: `https://api.parkpeer.com/v1`
Authentication: `Authorization: Bearer <JWT>`

---

## 1. Discovery & Search

### `GET /spots/search`

Retrieves available parking spots within a radius using PostGIS.

* **Query Parameters:**
  * `lat` (float, required): User latitude (e.g. `12.8703`)
  * `lng` (float, required): User longitude (e.g. `74.8806`)
  * `radius` (float, optional): Search radius in meters (default `3000`)
* **Response (200 OK):**

```json
{
  "success": true,
  "data": [
    {
      "id": "e4a28bb1-943e-4b68-80f0-8c238bfe4ad1",
      "title": "St. Aloysius Gated Basement Slot 3",
      "address": "Light House Hill Rd, Hampankatta, Mangaluru",
      "hourly_rate": 30.00,
      "latitude": 12.87032,
      "longitude": 74.88061,
      "distance_meters": 245.8,
      "has_iot_barrier": true
    }
  ]
}
```

---

## 2. Phase 1: Lock & Pre-Authorization

### `POST /bookings/lock`

Attempts to acquire an exclusive 10-minute Redis lock and returns a payment intent client secret.

* **Request Body:**

```json
{
  "spot_id": "e4a28bb1-943e-4b68-80f0-8c238bfe4ad1",
  "vehicle_id": "31b01799-d4d1-4cb7-a50e-54dcbffebda9",
  "start_time": "2026-09-13T16:00:00Z",
  "duration_hours": 2
}
```

* **Response (201 Created):**

```json
{
  "success": true,
  "data": {
    "booking_id": "b182fb5a-695c-43f1-b9a3-5cbe360b0942",
    "lock_expires_at": "2026-09-13T16:10:00Z",
    "base_amount": 60.00,
    "currency": "INR",
    "payment_gateway": {
      "provider": "razorpay",
      "order_id": "order_NX8a1B90cK1",
      "amount": 6000
    }
  }
}
```

* **Error Response (409 Conflict):**

```json
{
  "success": false,
  "error": "This slot was just locked by another driver. Please select an alternate spot."
}
```

---

## 3. Phase 2: Handshake & Navigation

### `POST /bookings/{id}/confirm-payment`

Confirms payment pre-authorization, converts the lock to `reserved`, and alerts the provider.

* **Request Body:**

```json
{
  "payment_id": "pay_K8s901Bda901",
  "signature": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
}
```

* **Response (200 OK):**

```json
{
  "success": true,
  "data": {
    "booking_id": "b182fb5a-695c-43f1-b9a3-5cbe360b0942",
    "status": "reserved",
    "navigation": {
      "latitude": 12.87032,
      "longitude": 74.88061,
      "address": "St. Aloysius Gated Basement Slot 3, Hampankatta",
      "entry_instructions": "Enter via Gate 2. Keypad code: #8821.",
      "google_maps_url": "https://www.google.com/maps/dir/?api=1&destination=12.87032,74.88061&travelmode=driving",
      "apple_maps_url": "http://maps.apple.com/?daddr=12.87032,74.88061&dirflg=d"
    },
    "verification": {
      "pin_code": "8821",
      "dynamic_qr_payload": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    }
  }
}
```

---

## 4. Phase 3: Check-In Validation

### `POST /bookings/{id}/check-in`

Validates driver arrival at the physical spot.

* **Request Body (Manual / Geofence):**

```json
{
  "method": "pin",
  "pin_code": "8821",
  "driver_lat": 12.87031,
  "driver_lng": 74.88062
}
```

* **Response (200 OK):**

```json
{
  "success": true,
  "data": {
    "booking_id": "b182fb5a-695c-43f1-b9a3-5cbe360b0942",
    "status": "checked_in",
    "session_start_time": "2026-09-13T16:04:12Z",
    "barrier_triggered": true
  }
}
```

### `POST /webhooks/iot-barrier`

Receives inbound trigger from ESP32 barrier relays or ANPR camera controllers.

* **Headers:** `X-Device-Key: <spot_iot_device_key>`
* **Request Body:**

```json
{
  "event_type": "plate_detected",
  "license_plate": "KA19MG2024",
  "timestamp": "2026-09-13T16:04:00Z"
}
```

* **Response (200 OK):**

```json
{
  "barrier_action": "OPEN",
  "booking_id": "b182fb5a-695c-43f1-b9a3-5cbe360b0942"
}
```

---

## 5. Phase 4: Session Checkout & Escrow Settlement

### `POST /bookings/{id}/check-out`

Terminates the parking session, calculates overstays, and initiates provider payout.

* **Response (200 OK):**

```json
{
  "success": true,
  "data": {
    "booking_id": "b182fb5a-695c-43f1-b9a3-5cbe360b0942",
    "status": "completed",
    "breakdown": {
      "booked_duration_minutes": 120,
      "actual_duration_minutes": 145,
      "overstay_minutes": 25,
      "base_fee": 60.00,
      "overstay_fee": 22.50,
      "total_charged": 82.50,
      "platform_commission_15_pct": 12.38,
      "provider_payout_amount": 70.12
    }
  }
}
```

---

## 6. Real-Time WebSockets (`/ws`)

### Client Subscriptions

* `subscribe:spot:{spot_id}`: Emits `{ "status": "locked" | "available" }` immediately to prevent UI pin stale states on other drivers' map screens.
* `subscribe:driver:{driver_id}`: Emits arrival alerts, overstay countdown alerts (T-15m, T-0m), and penalty receipts.
