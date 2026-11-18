ALTER TABLE "booking_series" ADD COLUMN IF NOT EXISTS "commute_key" varchar(160);--> statement-breakpoint
ALTER TABLE "booking_series" ADD COLUMN IF NOT EXISTS "commute_name" varchar(160);--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "commute_key" varchar(160);--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN IF NOT EXISTS "commute_key" varchar(160);--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN IF NOT EXISTS "commute_name" varchar(160);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "booking_series_org_commute_idx" ON "booking_series" USING btree ("organization_id", "commute_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bookings_org_commute_date_idx" ON "bookings" USING btree ("organization_id", "commute_key", "travel_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bookings_series_idx" ON "bookings" USING btree ("series_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trips_org_drv_commute_date_idx" ON "trips" USING btree ("organization_id", "driver_id", "commute_key", "travel_date");--> statement-breakpoint
UPDATE "booking_series" bs
SET
  "commute_key" = sub.ckey,
  "commute_name" = sub.cname
FROM (
  SELECT
    bs2.id,
    'cmt-' || left(
      coalesce(nullif(trim(both '-' from regexp_replace(lower(coalesce(loc.canonical_name, el.normalized_locality, el.corridor_tag, el.location_name, 'corridor')), '[^a-z0-9]+', '-', 'g')), ''), 'corridor'),
      24
    ) || '-' || lower(bs2.direction::text)
      || '-' || replace(bs2.requested_time_local, ':', '')
      || '-' || left(encode(sha256(convert_to(
        bs2.office_id::text || '|' || bs2.shift_id::text || '|' || bs2.direction::text || '|' ||
        coalesce(nullif(trim(both '-' from regexp_replace(lower(coalesce(loc.canonical_name, el.normalized_locality, el.corridor_tag, el.location_name, 'corridor')), '[^a-z0-9]+', '-', 'g')), ''), 'corridor')
        || '|' || bs2.time_preference::text || '|' || replace(bs2.requested_time_local, ':', ''),
        'UTF8'
      )), 'hex'), 10) AS ckey,
    CASE
      WHEN bs2.direction::text = 'LOGIN'
        THEN coalesce(loc.canonical_name, el.normalized_locality, el.corridor_tag, el.location_name) || ' -> ' || off.name
      ELSE off.name || ' -> ' || coalesce(loc.canonical_name, el.normalized_locality, el.corridor_tag, el.location_name)
    END || ' · ' || sh.name AS cname
  FROM "booking_series" bs2
  JOIN "employee_locations" el ON el.id = bs2.pickup_location_id
  LEFT JOIN "localities" loc ON loc.id = coalesce(bs2.locality_id, el.locality_id)
  JOIN "offices" off ON off.id = bs2.office_id
  JOIN "shifts" sh ON sh.id = bs2.shift_id
  WHERE bs2.commute_key IS NULL
) sub
WHERE bs.id = sub.id;--> statement-breakpoint
UPDATE "bookings" b
SET "commute_key" = bs.commute_key
FROM "booking_series" bs
WHERE b.series_id = bs.id AND b.commute_key IS NULL AND bs.commute_key IS NOT NULL;--> statement-breakpoint
UPDATE "bookings" b
SET "commute_key" = sub.ckey
FROM (
  SELECT
    b2.id,
    'cmt-' || left(
      coalesce(nullif(trim(both '-' from regexp_replace(lower(coalesce(loc.canonical_name, el.normalized_locality, el.corridor_tag, el.location_name, 'corridor')), '[^a-z0-9]+', '-', 'g')), ''), 'corridor'),
      24
    ) || '-' || lower(b2.direction::text)
      || '-' || replace(coalesce(b2.requested_time_local, to_char(b2.scheduled_pickup_at AT TIME ZONE coalesce(nullif(b2.timezone, ''), 'Asia/Kolkata'), 'HH24:MI')), ':', '')
      || '-' || left(encode(sha256(convert_to(
        b2.office_id::text || '|' || b2.shift_id::text || '|' || b2.direction::text || '|' ||
        coalesce(nullif(trim(both '-' from regexp_replace(lower(coalesce(loc.canonical_name, el.normalized_locality, el.corridor_tag, el.location_name, 'corridor')), '[^a-z0-9]+', '-', 'g')), ''), 'corridor')
        || '|' || b2.time_preference::text || '|' || replace(coalesce(b2.requested_time_local, to_char(b2.scheduled_pickup_at AT TIME ZONE coalesce(nullif(b2.timezone, ''), 'Asia/Kolkata'), 'HH24:MI')), ':', ''),
        'UTF8'
      )), 'hex'), 10) AS ckey
  FROM "bookings" b2
  JOIN "employee_locations" el ON el.id = b2.pickup_location_id
  LEFT JOIN "localities" loc ON loc.id = el.locality_id
  WHERE b2.commute_key IS NULL
) sub
WHERE b.id = sub.id;--> statement-breakpoint
UPDATE "trips" t
SET
  "commute_key" = sub.dkey,
  "commute_name" = sub.dname
FROM (
  SELECT
    t2.id,
    'dcmt-' || left(
      coalesce(nullif(trim(both '-' from regexp_replace(lower(coalesce(loc.canonical_name, stop_loc.normalized_locality, stop_loc.corridor_tag, stop_loc.location_name, 'corridor')), '[^a-z0-9]+', '-', 'g')), ''), 'corridor'),
      24
    ) || '-' || lower(t2.direction::text)
      || '-' || left(encode(sha256(convert_to(
        'drv|' || t2.office_id::text || '|' || t2.shift_id::text || '|' || t2.direction::text || '|' ||
        coalesce(nullif(trim(both '-' from regexp_replace(lower(coalesce(loc.canonical_name, stop_loc.normalized_locality, stop_loc.corridor_tag, stop_loc.location_name, 'corridor')), '[^a-z0-9]+', '-', 'g')), ''), 'corridor'),
        'UTF8'
      )), 'hex'), 10) AS dkey,
    coalesce(loc.canonical_name, stop_loc.normalized_locality, stop_loc.corridor_tag, stop_loc.location_name, 'Corridor')
      || ' ' || CASE
        WHEN split_part(sh.shift_time_local, ':', 1)::int < 12 THEN 'Morning'
        WHEN split_part(sh.shift_time_local, ':', 1)::int < 17 THEN 'Afternoon'
        ELSE 'Evening'
      END
      || ' ' || CASE WHEN t2.direction::text = 'LOGIN' THEN 'Pickup' ELSE 'Drop' END AS dname
  FROM "trips" t2
  JOIN "shifts" sh ON sh.id = t2.shift_id
  LEFT JOIN "localities" loc ON loc.id = t2.primary_locality_id
  LEFT JOIN LATERAL (
    SELECT el.normalized_locality, el.corridor_tag, el.location_name
    FROM "passenger_assignments" pa
    JOIN "bookings" b ON b.id = pa.booking_id
    JOIN "employee_locations" el ON el.id = b.pickup_location_id
    WHERE pa.trip_id = t2.id
    LIMIT 1
  ) stop_loc ON true
  WHERE t2.commute_key IS NULL
) sub
WHERE t.id = sub.id;
