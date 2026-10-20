-- ============================================================================
-- ParkPeer Migration 020: Decentralized EV Charging & Multi-Category Spots
-- Adds spot_category, plug_type, energy metering columns, and search_nearby_spots.
-- ============================================================================

DO $$ BEGIN
    CREATE TYPE spot_category AS ENUM (
        'parking_only',
        'ev_p2p_charge',
        'commercial_cpo',
        'fuel_pump'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE plug_type AS ENUM (
        'none',
        '15A_domestic',
        'type2_ac',
        'ccs2_dc',
        'chademo'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Add EV and Category columns to parking_spots
ALTER TABLE parking_spots
    ADD COLUMN IF NOT EXISTS category spot_category NOT NULL DEFAULT 'parking_only',
    ADD COLUMN IF NOT EXISTS plug_type plug_type NOT NULL DEFAULT 'none',
    ADD COLUMN IF NOT EXISTS power_output_kw NUMERIC(6, 2) NOT NULL DEFAULT 0.00 CHECK (power_output_kw >= 0.00),
    ADD COLUMN IF NOT EXISTS energy_rate_per_kwh NUMERIC(8, 2) NOT NULL DEFAULT 0.00 CHECK (energy_rate_per_kwh >= 0.00);

CREATE INDEX IF NOT EXISTS idx_parking_spots_category ON parking_spots(category);

-- Add Energy consumption columns to bookings
ALTER TABLE bookings
    ADD COLUMN IF NOT EXISTS energy_kwh NUMERIC(8, 2) NOT NULL DEFAULT 0.00 CHECK (energy_kwh >= 0.00),
    ADD COLUMN IF NOT EXISTS energy_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (energy_amount >= 0.00);

-- Ensure photo_url alias column exists on disputes
ALTER TABLE disputes
    ADD COLUMN IF NOT EXISTS photo_url TEXT;

UPDATE disputes
    SET photo_url = photo_evidence_url
    WHERE photo_url IS NULL AND photo_evidence_url IS NOT NULL;

-- Multi-Category Radial Search Function
CREATE OR REPLACE FUNCTION search_nearby_spots(
    user_lat DOUBLE PRECISION,
    user_lng DOUBLE PRECISION,
    radius_meters DOUBLE PRECISION DEFAULT 3000,
    filter_category spot_category DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    title VARCHAR,
    address TEXT,
    hourly_rate NUMERIC,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    distance_meters DOUBLE PRECISION,
    has_iot_barrier BOOLEAN,
    category spot_category,
    plug_type plug_type,
    power_output_kw NUMERIC,
    energy_rate_per_kwh NUMERIC
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
        ps.has_iot_barrier,
        ps.category,
        ps.plug_type,
        ps.power_output_kw,
        ps.energy_rate_per_kwh
    FROM parking_spots ps
    WHERE ps.status = 'available'
      AND (filter_category IS NULL OR ps.category = filter_category)
      AND ST_DWithin(
          ps.location,
          ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography,
          radius_meters
      )
    ORDER BY distance_meters ASC;
END;
$$ LANGUAGE plpgsql STABLE;
