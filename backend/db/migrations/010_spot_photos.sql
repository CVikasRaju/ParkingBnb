-- ParkPeer migrations — extension: spot photo gallery.
-- docs/SCHEMA.md §5 lists photo uploads in the sprint roadmap (`POST /spots`
-- ingests photo_urls); this table persists those URLs in upload order.

CREATE TABLE IF NOT EXISTS spot_photos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    spot_id UUID NOT NULL REFERENCES parking_spots(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    position SMALLINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_spot_photos_spot ON spot_photos(spot_id, position);