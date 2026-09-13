/**
 * Critical-money + FSM + geo + QR correctness tests.
 * These encode the non-negotiable requirements from the brief:
 *  - FSM edges only
 *  - exact overstay / split formulas (server-side)
 *  - 50m geofence
 *  - HMAC token expiry
 */
import { describe, expect, it } from "vitest";
import {
  computeBaseAmount,
  computeCheckoutBreakdown,
  computeOverstayFee,
} from "../src/lib/money";
import { assertTransition, isTerminal, FSM_EDGES } from "../src/lib/fsm";
import { haversineMeters, isWithinGeofence } from "../src/lib/geo";
import { generatePin, generateQrSecret, signCompact, signQrToken, verifyQrToken } from "../src/lib/qr";

describe("bookings FSM", () => {
  it("allows the happy path pending_lock -> reserved -> checked_in -> completed", () => {
    expect(() => assertTransition("pending_lock", "reserved")).not.toThrow();
    expect(() => assertTransition("reserved", "checked_in")).not.toThrow();
    expect(() => assertTransition("checked_in", "completed")).not.toThrow();
  });

  it("rejects illegal transitions with 409", () => {
    expect(() => assertTransition("pending_lock", "checked_in")).toThrow(/Illegal booking transition/);
    expect(() => assertTransition("reserved", "completed")).toThrow(/Illegal booking transition/);
    expect(() => assertTransition("completed", "checked_in")).toThrow(/Illegal booking transition/);
    expect(() => assertTransition("checked_in", "cancelled")).toThrow(/Illegal booking transition/);
  });

  it("recognises terminal states", () => {
    for (const s of ["completed", "cancelled", "overstayed", "disputed"]) expect(isTerminal(s as never)).toBe(true);
    expect(isTerminal("reserved" as never)).toBe(false);
  });

  it("defines exactly the approved edges", () => {
    expect(FSM_EDGES.pending_lock).toEqual(new Set(["reserved", "cancelled", "disputed"]));
    expect(FSM_EDGES.reserved).toEqual(new Set(["checked_in", "cancelled", "disputed"]));
    expect(FSM_EDGES.checked_in).toEqual(new Set(["completed", "overstayed", "disputed"]));
    expect(FSM_EDGES.overstayed).toEqual(new Set(["completed", "disputed"]));
  });
});

describe("money math (ARCHITECTURE §5)", () => {
  it("computes base amount", () => {
    expect(computeBaseAmount(80, 2)).toBe(160);
    expect(computeBaseAmount(120, 1.5)).toBe(180);
  });

  it("charges no overstay within the 15-min grace", () => {
    expect(computeOverstayFee(10, 80, 2)).toBe(0);
    expect(computeOverstayFee(15, 80, 2)).toBe(0);
    expect(computeOverstayFee(0, 80, 2)).toBe(0);
  });

  it("charges ceil(hour) x rate x multiplier beyond grace", () => {
    // 16 min -> ceil(16/60)=1 hour -> 1 * 80 * 2 = 160
    expect(computeOverstayFee(16, 80, 2)).toBe(160);
    // 61 min -> ceil(61/60)=2 hours -> 2 * 80 * 2 = 320
    expect(computeOverstayFee(61, 80, 2)).toBe(320);
  });

  it("splits gross 85/15 exactly as documented", () => {
    const b = computeCheckoutBreakdown({
      base_amount: 160,
      hourly_rate: 80,
      overstay_multiplier: 2,
      parked_minutes: 90,
      booked_minutes: 120, // parked < booked -> no overstay
    });
    expect(b.overstay_amount).toBe(0);
    expect(b.gross_amount).toBe(160);
    expect(b.platform_fee).toBe(24); // 15% of 160 = 24
    expect(b.provider_earnings).toBe(136); // 160 - 24
  });

  it("adds overstay to gross before the split", () => {
    const b = computeCheckoutBreakdown({
      base_amount: 160,
      hourly_rate: 80,
      overstay_multiplier: 2,
      parked_minutes: 150, // overstay 30 min -> ceil(30/60)=1h -> 160 extra
      booked_minutes: 120,
    });
    expect(b.overstay_amount).toBe(160);
    expect(b.gross_amount).toBe(320);
    expect(b.platform_fee).toBe(48); // 15% of 320
    expect(b.provider_earnings).toBe(272);
  });

  it("grace boundary: 16 minutes is billable, 15 is free", () => {
    const a = computeCheckoutBreakdown({
      base_amount: 100,
      hourly_rate: 100,
      overstay_multiplier: 2,
      parked_minutes: 135, // 15 over
      booked_minutes: 120,
    });
    const c = computeCheckoutBreakdown({
      base_amount: 100,
      hourly_rate: 100,
      overstay_multiplier: 2,
      parked_minutes: 136, // 16 over
      booked_minutes: 120,
    });
    expect(a.overstay_amount).toBe(0);
    expect(c.overstay_amount).toBe(200);
  });
});

describe("geofence", () => {
  it("computes haversine distance", () => {
    const d = haversineMeters(12.9716, 77.5946, 12.9716, 77.5946); // same point
    expect(d).toBeLessThan(1);
    const km = haversineMeters(12.9716, 77.5946, 13.0, 77.6); // ~3 km
    expect(km).toBeGreaterThan(2500);
  });

  it("accepts within 50 m and rejects beyond", () => {
    expect(isWithinGeofence(12.9716, 77.5946, 12.9716, 77.5946, 50).within).toBe(true);
    // ~40 m north
    expect(isWithinGeofence(12.9716 + 0.00035, 77.5946, 12.9716, 77.5946, 50).within).toBe(true);
    // ~110 m north
    expect(isWithinGeofence(12.9716 + 0.001, 77.5946, 12.9716, 77.5946, 50).within).toBe(false);
    // distance is numeric
    expect(typeof isWithinGeofence(12.9716, 77.5946, 13.0, 77.6).distanceMeters).toBe("number");
  });
});

describe("QR + PIN", () => {
  it("signs and verifies a valid HMAC token", () => {
    const secret = generateQrSecret();
    const tok = signQrToken("bk-1", secret);
    expect(verifyQrToken("bk-1", secret, tok)).not.toBe(null);
  });

  it("rejects a token for a different booking", () => {
    const secret = generateQrSecret();
    const tok = signQrToken("bk-1", secret);
    expect(verifyQrToken("bk-2", secret, tok)).toBe(null);
  });

  it("rejects a token signed with a different secret", () => {
    const tok = signQrToken("bk-1", generateQrSecret());
    expect(verifyQrToken("bk-1", generateQrSecret(), tok)).toBe(null);
  });

  it("rejects a tampered token", () => {
    const secret = generateQrSecret();
    const tok = signQrToken("bk-1", secret);
    const tampered = tok.slice(0, -2) + (tok.endsWith("aa") ? "bb" : "aa");
    expect(verifyQrToken("bk-1", secret, tampered)).toBe(null);
  });

  it("expires tokens after 60 seconds", () => {
    const secret = generateQrSecret();
    // Build a token whose exp is already in the past — must be rejected.
    const stale = signCompact(secret, {
      booking_id: "bk-1",
      iat: Math.floor(Date.now() / 1000) - 120,
      exp: Math.floor(Date.now() / 1000) - 61,
    });
    expect(verifyQrToken("bk-1", secret, stale)).toBe(null);
  });
});

describe("PIN", () => {
  it("generates a 4-digit PIN", () => {
    for (let i = 0; i < 50; i++) {
      const pin = generatePin();
      expect(pin).toMatch(/^\d{4}$/);
    }
  });
});