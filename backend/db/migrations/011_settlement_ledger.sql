-- ParkPeer migrations — extension: settlement ledger for escrow payouts.
-- One row per completed booking. Drive-by idempotency for worker retries:
-- unique(booking_id) means a retried check-out can never double-pay.

CREATE TABLE IF NOT EXISTS settlement_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
    driver_id UUID NOT NULL REFERENCES users(id),
    provider_id UUID NOT NULL REFERENCES users(id),
    gross_amount NUMERIC(12, 2) NOT NULL,
    platform_fee NUMERIC(12, 2) NOT NULL,
    provider_earnings NUMERIC(12, 2) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'paid',
    gateway_ref VARCHAR(128),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_settlement_provider ON settlement_ledger(provider_id, created_at);