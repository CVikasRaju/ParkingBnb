-- ParkPeer migrations — extension: refund ledger (blocked-spot auto-refund).
-- unique(booking_id) makes the driver refund idempotent under retries.

CREATE TABLE IF NOT EXISTS refund_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
    driver_id UUID NOT NULL REFERENCES users(id),
    amount NUMERIC(12, 2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refund_driver ON refund_ledger(driver_id, created_at);