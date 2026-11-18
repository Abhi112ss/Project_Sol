CREATE TYPE "public"."booking_recurrence_type" AS ENUM('ONE_DAY', 'WEEKLY', 'MONTHLY', 'CUSTOM');--> statement-breakpoint
CREATE TYPE "public"."booking_series_status" AS ENUM('ACTIVE', 'PAUSED', 'EXPIRED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."booking_time_preference" AS ENUM('PICKUP_AT', 'ARRIVE_BY');--> statement-breakpoint
ALTER TYPE "public"."booking_status" ADD VALUE 'EXPIRED';--> statement-breakpoint
CREATE TABLE "localities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"canonical_name" varchar(120) NOT NULL,
	"normalized_slug" varchar(120) NOT NULL,
	"aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"center_latitude" double precision NOT NULL,
	"center_longitude" double precision NOT NULL,
	"center_point" geometry(point) NOT NULL,
	"proximity_radius_m" integer DEFAULT 3500 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "allocation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"created_by_user_id" uuid,
	"travel_date" date,
	"shift_id" uuid,
	"office_id" uuid,
	"direction" "trip_direction",
	"engine_version" varchar(64) DEFAULT 'LOCALITY_INTERVAL_V1' NOT NULL,
	"config_snapshot_json" jsonb NOT NULL,
	"summary_json" jsonb NOT NULL,
	"proposals_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_series" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"shift_id" uuid NOT NULL,
	"office_id" uuid NOT NULL,
	"pickup_location_id" uuid NOT NULL,
	"locality_id" uuid,
	"direction" "trip_direction" NOT NULL,
	"time_preference" "booking_time_preference" DEFAULT 'PICKUP_AT' NOT NULL,
	"requested_time_local" varchar(5) NOT NULL,
	"timezone" varchar(64) DEFAULT 'Asia/Kolkata' NOT NULL,
	"recurrence_type" "booking_recurrence_type" DEFAULT 'ONE_DAY' NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"selected_days_of_week" varchar(64) DEFAULT 'MON,TUE,WED,THU,FRI' NOT NULL,
	"status" "booking_series_status" DEFAULT 'ACTIVE' NOT NULL,
	"notes" text,
	"expired_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancellation_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "series_id" uuid;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "time_preference" "booking_time_preference" DEFAULT 'PICKUP_AT' NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "requested_time_local" varchar(5);--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "timezone" varchar(64) DEFAULT 'Asia/Kolkata' NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "requested_pickup_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "is_arrive_by_infeasible" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "feasibility_note" text;--> statement-breakpoint
ALTER TABLE "drivers" ADD COLUMN "base_locality_id" uuid;--> statement-breakpoint
ALTER TABLE "drivers" ADD COLUMN "base_locality_name" varchar(120);--> statement-breakpoint
ALTER TABLE "drivers" ADD COLUMN "base_latitude" double precision;--> statement-breakpoint
ALTER TABLE "drivers" ADD COLUMN "base_longitude" double precision;--> statement-breakpoint
ALTER TABLE "drivers" ADD COLUMN "base_location" geometry(point);--> statement-breakpoint
ALTER TABLE "employee_locations" ADD COLUMN "locality_id" uuid;--> statement-breakpoint
ALTER TABLE "employee_locations" ADD COLUMN "normalized_locality" varchar(120);--> statement-breakpoint
ALTER TABLE "organization_settings" ADD COLUMN "nearby_locality_radius_m" integer DEFAULT 4000 NOT NULL;--> statement-breakpoint
ALTER TABLE "organization_settings" ADD COLUMN "max_route_detour_ratio" double precision DEFAULT 1.75 NOT NULL;--> statement-breakpoint
ALTER TABLE "organization_settings" ADD COLUMN "pickup_window_tolerance_minutes" integer DEFAULT 15 NOT NULL;--> statement-breakpoint
ALTER TABLE "organization_settings" ADD COLUMN "driver_turnaround_buffer_minutes" integer DEFAULT 20 NOT NULL;--> statement-breakpoint
ALTER TABLE "organization_settings" ADD COLUMN "arrive_by_safety_buffer_minutes" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "organization_settings" ADD COLUMN "allow_same_day_booking" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "primary_locality_id" uuid;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "allocation_run_id" uuid;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "allocation_rationale_json" jsonb;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "planned_end_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "localities" ADD CONSTRAINT "localities_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allocation_runs" ADD CONSTRAINT "allocation_runs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allocation_runs" ADD CONSTRAINT "allocation_runs_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allocation_runs" ADD CONSTRAINT "allocation_runs_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allocation_runs" ADD CONSTRAINT "allocation_runs_office_id_offices_id_fk" FOREIGN KEY ("office_id") REFERENCES "public"."offices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_series" ADD CONSTRAINT "booking_series_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_series" ADD CONSTRAINT "booking_series_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_series" ADD CONSTRAINT "booking_series_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_series" ADD CONSTRAINT "booking_series_office_id_offices_id_fk" FOREIGN KEY ("office_id") REFERENCES "public"."offices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_series" ADD CONSTRAINT "booking_series_pickup_location_id_employee_locations_id_fk" FOREIGN KEY ("pickup_location_id") REFERENCES "public"."employee_locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_series" ADD CONSTRAINT "booking_series_locality_id_localities_id_fk" FOREIGN KEY ("locality_id") REFERENCES "public"."localities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "localities_org_slug_uidx" ON "localities" USING btree ("organization_id","normalized_slug");--> statement-breakpoint
CREATE INDEX "localities_center_gist_idx" ON "localities" USING gist ("center_point");--> statement-breakpoint
CREATE INDEX "allocation_runs_org_date_idx" ON "allocation_runs" USING btree ("organization_id","travel_date","created_at");--> statement-breakpoint
CREATE INDEX "booking_series_org_emp_status_idx" ON "booking_series" USING btree ("organization_id","employee_id","status");--> statement-breakpoint
CREATE INDEX "booking_series_status_end_idx" ON "booking_series" USING btree ("status","end_date");--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_series_id_booking_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."booking_series"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_base_locality_id_localities_id_fk" FOREIGN KEY ("base_locality_id") REFERENCES "public"."localities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_locations" ADD CONSTRAINT "employee_locations_locality_id_localities_id_fk" FOREIGN KEY ("locality_id") REFERENCES "public"."localities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_primary_locality_id_localities_id_fk" FOREIGN KEY ("primary_locality_id") REFERENCES "public"."localities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_allocation_run_id_allocation_runs_id_fk" FOREIGN KEY ("allocation_run_id") REFERENCES "public"."allocation_runs"("id") ON DELETE set null ON UPDATE no action;