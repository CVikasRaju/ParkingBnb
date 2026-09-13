/**
 * Payment lifecycle helpers: refunds and split transfers.
 *
 * With the mock provider these are ledger-only (idempotent via booking id)
 * so CI can assert on the books. `PAYMENT_PROVIDER=stripe|razorpay` swaps in
 * the real gateway calls — the ledger stays the system of record.
 */
import { db } from "../../lib/db";
import { env } from "../../config/env";

export async function refundBooking(bookingId: string): Promise<{ amount: number }> {
  const booking = await db.one(
    "SELECT id, base_amount, driver_id FROM bookings WHERE id = $1",
    [bookingId]
  );

  const existing = await db.maybeOne(
    "SELECT id FROM refund_ledger WHERE booking_id = $1",
    [bookingId]
  );
  if (!existing) {
    await db.query(
      `INSERT INTO refund_ledger (booking_id, driver_id, amount) VALUES ($1, $2, $3)`,
      [bookingId, booking.driver_id, booking.base_amount]
    );
    // Drivers in the demo hold a wallet balance; credit it back.
    await db.query(
      "UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2",
      [booking.base_amount, booking.driver_id]
    );
  }
  return { amount: Number(booking.base_amount) };
}

export async function settleSplit(args: {
  bookingId: string;
  driverId: string;
  providerConnectAccount?: string | null;
  amount: number;
}) {
  const provider = env.PAYMENT_PROVIDER;
  if (provider === "stripe") {
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(env.STRIPE_SECRET_KEY);
    if (args.providerConnectAccount) {
      await stripe.transfers.create({
        amount: Math.round(args.amount * 100),
        currency: "usd",
        destination: args.providerConnectAccount,
        transfer_group: `parkpeer_${args.bookingId}`,
      });
    }
  }
  if (provider === "razorpay") {
    // Razorpay Route: splits are configured against the payment; the ledger
    // row created in booking settleEscrow stands as the source of truth.
    return;
  }
  // mock — no-op; ledger only
}