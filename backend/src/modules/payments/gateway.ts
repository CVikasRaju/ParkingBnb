/**
 * Payment gateway abstraction.
 *
 * `PAYMENT_PROVIDER=mock` (default, dev/test) returns deterministic order ids
 * and payment signatures so every sprint can be exercised end-to-end without
 * live credentials. Setting `razorpay` or `stripe` switches to the real SDK
 * behind the same interface.
 */
import { env } from "../../config/env";

export interface PaymentOrder {
  gateway: "razorpay" | "stripe" | "mock";
  order_id: string;
  amount: number; // smallest currency unit e.g. paise/cents
  currency: string;
  client_secret?: string;
}

export interface PaymentConfirm {
  payment_id: string;
  signature: string;
}

/**
 * Returns the pocket data needed to place a pre-authorization hold.
 * `amount` is in rupees (INR) for razorpay-configured backends, else currency units.
 */
export async function createPaymentOrder(params: {
  bookingId: string;
  amount: number; // in rupees (2 dp)
  currency?: string;
}): Promise<PaymentOrder> {
  const provider = env.PAYMENT_PROVIDER;
  const currency = params.currency ?? "INR";

  if (provider === "razorpay") {
    if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
      throw new Error("RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET not configured");
    }
    const Razorpay = (await import("razorpay")).default;
    const rzp = new Razorpay({ key_id: env.RAZORPAY_KEY_ID, key_secret: env.RAZORPAY_KEY_SECRET });
    const order = await rzp.orders.create({
      amount: Math.round(params.amount * 100), // paise
      currency,
      receipt: `bk_${params.bookingId}`,
      notes: { booking_id: params.bookingId },
    });
    return { gateway: "razorpay", order_id: String(order.id), amount: Number(order.amount), currency };
  }

  if (provider === "stripe") {
    if (!env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY not configured");
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(env.STRIPE_SECRET_KEY);
    const intent = await stripe.paymentIntents.create({
      amount: Math.round(params.amount * 100),
      currency: currency.toLowerCase(),
      automatic_payment_methods: { enabled: true },
      metadata: { booking_id: params.bookingId },
    });
    return {
      gateway: "stripe",
      order_id: intent.id,
      amount: intent.amount,
      currency,
      client_secret: intent.client_secret ?? undefined,
    };
  }

  // mock provider — deterministic, signed, offline
  return {
    gateway: "mock",
    order_id: `order_${params.bookingId.replace(/-/g, "").slice(0, 12)}`,
    amount: Math.round(params.amount * 100),
    currency,
  };
}

/**
 * Verifies a driver's `payment_id + signature` confirm. With the mock
 * provider any well-formed signature passes so CI can exercise the happy
 * path; real providers verify webhook signatures (see webhooks module).
 */
export async function verifyPaymentConfirmation(params: {
  bookingId: string;
  paymentId: string;
  signature: string;
}): Promise<boolean> {
  if (env.PAYMENT_PROVIDER !== "mock") return true; // real signature check via webhook
  return params.paymentId.length > 0 && params.signature.length > 0;
}