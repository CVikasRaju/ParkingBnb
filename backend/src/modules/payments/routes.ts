import type { FastifyInstance } from "fastify";
import { requireRole } from "../auth/guards";
import { db } from "../../lib/db";

export async function paymentRoutes(app: FastifyInstance): Promise<void> {
  /** Provider wallet balance + payout history. */
  app.get("/payments/wallet", { onRequest: [requireRole("provider")] }, async (req) => {
    const wallet = await db.maybeOne("SELECT wallet_balance, stripe_account_id FROM users WHERE id = $1", [req.auth!.sub]);
    const payouts = await db.query(
      `SELECT id, booking_id, gross_amount, provider_earnings, status, gateway_ref, created_at
       FROM settlement_ledger WHERE provider_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [req.auth!.sub]
    );
    return {
      success: true,
      data: {
        wallet_balance: wallet ? Number(wallet.wallet_balance) : 0,
        stripe_account_id: wallet?.stripe_account_id ?? null,
        payouts: payouts.rows,
      },
    };
  });
}