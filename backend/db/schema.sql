-- ============================================================================
-- ParkPeer schema — verbatim from docs/SCHEMA.md (source of truth).
-- Runs as the base migration; do NOT redesign here.
-- ============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. CUSTOM ENUMS
CREATE TYPE user_role AS ENUM ('driver', 'provider', 'admin');
CREATE TYPE spot_status AS ENUM ('available', 'locked', 'maintenance', 'inactive');
CREATE TYPE booking_status AS ENUM (
    'pending_lock',
    'reserved',
    'checked_in',
    'completed',
    'cancelled',
    'overstayed',
    'disputed'
);
CREATE TYPE vehicle_type AS ENUM ('sedan', 'suv', 'hatchback', 'ev', 'motorcycle');
CREATE TYPE verification_mode AS ENUM ('qr_code', 'pin', 'geofence', 'iot_gate');

-- 3. USERS TABLE
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name VARCHAR(120) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone_number VARCHAR(20) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role user_role DEFAULT 'driver',
    stripe_account_id VARCHAR(100), -- For provider payouts
    wallet_balance NUMERIC(12, 2) DEFAULT 0.00 CHECK (wallet_balance >= 0.00),
    is_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. VEHICLES TABLE
CREATE TABLE vehicles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    license_plate VARCHAR(20) NOT NULL UNIQUE,
    make_model VARCHAR(100) NOT NULL,
    vehicle_type vehicle_type DEFAULT 'sedan',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. PARKING SPOTS TABLE
CREATE TABLE parking_spots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(150) NOT NULL,
    description TEXT,
    address TEXT NOT NULL,
    location GEOGRAPHY(POINT, 4326) NOT NULL, -- WGS 84 GPS Coordinates
    hourly_rate NUMERIC(10, 2) NOT NULL CHECK (hourly_rate > 0.00),
    overstay_multiplier NUMERIC(3, 2) DEFAULT 1.50 CHECK (overstay_multiplier >= 1.00),
    status spot_status DEFAULT 'available',
    entry_instructions TEXT, -- Gate codes, physical directions
    has_iot_barrier BOOLEAN DEFAULT FALSE,
    iot_device_key VARCHAR(128), -- Secret for hardware authentication
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- SPATIAL GIST INDEX: Fast bounding box and radial queries
CREATE INDEX idx_parking_spots_location ON parking_spots USING GIST (location);
CREATE INDEX idx_parking_spots_provider ON parking_spots(provider_id);

-- 6. SPOT OPERATING SCHEDULES
CREATE TABLE spot_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    spot_id UUID NOT NULL REFERENCES parking_spots(id) ON DELETE CASCADE,
    day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sunday
    open_time TIME NOT NULL,
    close_time TIME NOT NULL,
    CONSTRAINT chk_time_window CHECK (open_time < close_time)
);

-- 7. BOOKINGS TABLE
CREATE TABLE bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    spot_id UUID NOT NULL REFERENCES parking_spots(id),
    driver_id UUID NOT NULL REFERENCES users(id),
    vehicle_id UUID NOT NULL REFERENCES vehicles(id),
    status booking_status DEFAULT 'pending_lock',
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    expected_end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    actual_check_in TIMESTAMP WITH TIME ZONE,
    actual_check_out TIMESTAMP WITH TIME ZONE,
    base_amount NUMERIC(10, 2) NOT NULL,
    overstay_amount NUMERIC(10, 2) DEFAULT 0.00,
    platform_fee NUMERIC(10, 2) NOT NULL,
    provider_earnings NUMERIC(10, 2) NOT NULL,
    pin_code VARCHAR(4) NOT NULL,
    qr_secret VARCHAR(64) NOT NULL,
    verified_via verification_mode,
    payment_intent_id VARCHAR(128) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT chk_booking_times CHECK (start_time < expected_end_time)
);

CREATE INDEX idx_bookings_spot_status ON bookings(spot_id, status);
CREATE INDEX idx_bookings_driver ON bookings(driver_id);

-- 8. DISPUTES & ISSUES
CREATE TABLE disputes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    reporter_id UUID NOT NULL REFERENCES users(id),
    reason VARCHAR(100) NOT NULL, -- 'spot_blocked', 'overstay_refusal', 'damage'
    description TEXT NOT NULL,
    photo_evidence_url TEXT,
    resolved BOOLEAN DEFAULT FALSE,
    admin_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 9. STORED PROCEDURE: HIGH-SPEED RADIAL SEARCH
CREATE OR REPLACE FUNCTION search_nearby_parking(
    user_lat DOUBLE PRECISION,
    user_lng DOUBLE PRECISION,
    radius_meters DOUBLE PRECISION DEFAULT 3000
)
RETURNS TABLE (
    id UUID,
    title VARCHAR,
    address TEXT,
    hourly_rate NUMERIC,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    distance_meters DOUBLE PRECISION,
    has_iot_barrier BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ps.id,
        ps.title,
        ps.address,
        ps.hourly_rate,
        ST_Y(ps.location::geometry) AS latitude,
        ST_X(ps.location::geometry) AS longitude,
        ST_Distance(
            ps.location,
            ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography
        ) AS distance_meters,
        ps.has_iot_barrier
    FROM parking_spots ps
    WHERE ps.status = 'available'
      AND ST_DWithin(
          ps.location,
          ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography,
          radius_meters
      )
    ORDER BY distance_meters ASC;
END;
$$ LANGUAGE plpgsql STABLE;

-- 10. AUTO-UPDATE TRIGGER FOR TIMESTAMPS
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER trg_spots_updated BEFORE UPDATE ON parking_spots
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER trg_bookings_updated BEFORE UPDATE ON bookings
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();