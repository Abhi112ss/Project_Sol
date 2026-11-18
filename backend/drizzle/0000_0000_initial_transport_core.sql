CREATE TYPE "public"."approval_decision" AS ENUM('APPROVED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."availability_status" AS ENUM('AVAILABLE', 'ON_TRIP', 'OFF_DUTY', 'MAINTENANCE');--> statement-breakpoint
CREATE TYPE "public"."booking_status" AS ENUM('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'DISPATCHED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('DRAFT', 'ISSUED', 'RECONCILED', 'DISPUTED');--> statement-breakpoint
CREATE TYPE "public"."no_show_appeal_status" AS ENUM('NONE', 'APPEALED', 'OVERTURNED', 'UPHELD');--> statement-breakpoint
CREATE TYPE "public"."no_show_reason" AS ENUM('PASSENGER_UNREACHABLE', 'DID_NOT_EXIT', 'CANCELLED_AT_DOOR', 'WRONG_LOCATION', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."no_show_sync_status" AS ENUM('VERIFIED', 'PENDING_RECONCILE');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('IN_APP', 'PUSH');--> statement-breakpoint
CREATE TYPE "public"."org_status" AS ENUM('ACTIVE', 'SUSPENDED', 'TRIAL');--> statement-breakpoint
CREATE TYPE "public"."otp_type" AS ENUM('BOARDING', 'DEBOARDING');--> statement-breakpoint
CREATE TYPE "public"."passenger_assignment_status" AS ENUM('SCHEDULED', 'EN_ROUTE', 'ARRIVED', 'BOARDED', 'NO_SHOW', 'CANCELLED', 'SKIPPED', 'DROPPED');--> statement-breakpoint
CREATE TYPE "public"."safety_alert_status" AS ENUM('OPEN', 'ACKNOWLEDGED', 'RESOLVED');--> statement-breakpoint
CREATE TYPE "public"."safety_alert_type" AS ENUM('SOS', 'ROUTE_DEVIATION', 'LONG_STOPPAGE', 'SAFE_REACH_OVERDUE');--> statement-breakpoint
CREATE TYPE "public"."safety_severity" AS ENUM('MEDIUM', 'HIGH', 'CRITICAL');--> statement-breakpoint
CREATE TYPE "public"."stop_status" AS ENUM('PENDING', 'ACTIVE', 'ARRIVED', 'COMPLETED', 'SKIPPED');--> statement-breakpoint
CREATE TYPE "public"."stop_type" AS ENUM('PICKUP', 'DROP', 'OFFICE');--> statement-breakpoint
CREATE TYPE "public"."trip_direction" AS ENUM('LOGIN', 'LOGOUT');--> statement-breakpoint
CREATE TYPE "public"."trip_status" AS ENUM('CREATED', 'ASSIGNED', 'DRIVER_ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'ABORTED');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('PLATFORM_SUPER_ADMIN', 'ORG_ADMIN', 'TRANSPORT_MANAGER', 'DUTY_APPROVER', 'VENDOR_SUPERVISOR', 'DRIVER', 'EMPLOYEE', 'AUDITOR');--> statement-breakpoint
CREATE TYPE "public"."vehicle_type" AS ENUM('SEDAN', 'SUV', 'TEMPO_TRAVELLER', 'EV_SEDAN', 'SHUTTLE_BUS');--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"booking_id" uuid NOT NULL,
	"approver_user_id" uuid NOT NULL,
	"decision" "approval_decision" NOT NULL,
	"remarks" text,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"actor_role" varchar(48) NOT NULL,
	"action" varchar(96) NOT NULL,
	"entity_type" varchar(64) NOT NULL,
	"entity_id" uuid NOT NULL,
	"reason" text,
	"before_json" jsonb,
	"after_json" jsonb,
	"correlation_id" varchar(96),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"shift_id" uuid NOT NULL,
	"office_id" uuid NOT NULL,
	"pickup_location_id" uuid NOT NULL,
	"travel_date" date NOT NULL,
	"direction" "trip_direction" NOT NULL,
	"scheduled_pickup_at" timestamp with time zone NOT NULL,
	"status" "booking_status" DEFAULT 'PENDING_APPROVAL' NOT NULL,
	"notes" text,
	"cancellation_reason" text,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drivers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"vendor_id" uuid NOT NULL,
	"assigned_vehicle_id" uuid,
	"driver_code" varchar(48) NOT NULL,
	"license_no" varchar(64) NOT NULL,
	"license_expires_at" timestamp with time zone,
	"availability_status" "availability_status" DEFAULT 'AVAILABLE' NOT NULL,
	"is_suspended" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"location_name" varchar(120) NOT NULL,
	"address" text NOT NULL,
	"corridor_tag" varchar(80),
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"location" geometry(point) NOT NULL,
	"google_place_id" varchar(180),
	"original_maps_url" text,
	"geofence_radius_m" integer DEFAULT 150 NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"office_id" uuid NOT NULL,
	"default_shift_id" uuid,
	"employee_code" varchar(48) NOT NULL,
	"department" varchar(100) NOT NULL,
	"transport_eligible" boolean DEFAULT true NOT NULL,
	"emergency_contact_name" varchar(120),
	"emergency_contact_phone" varchar(32),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gps_locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"trip_id" uuid NOT NULL,
	"driver_id" uuid NOT NULL,
	"client_ping_id" uuid NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"location" geometry(point) NOT NULL,
	"accuracy_m" double precision,
	"speed_mps" double precision,
	"heading_deg" double precision,
	"recorded_at" timestamp with time zone NOT NULL,
	"server_received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"idempotency_key" varchar(128) NOT NULL,
	"request_method" varchar(12) NOT NULL,
	"request_path" varchar(256) NOT NULL,
	"request_hash" varchar(128) NOT NULL,
	"status_code" integer NOT NULL,
	"response_json" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"vendor_id" uuid NOT NULL,
	"invoice_number" varchar(64) NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"total_trips" integer DEFAULT 0 NOT NULL,
	"total_distance_km" double precision DEFAULT 0 NOT NULL,
	"subtotal_paise" integer DEFAULT 0 NOT NULL,
	"tax_paise" integer DEFAULT 0 NOT NULL,
	"total_paise" integer DEFAULT 0 NOT NULL,
	"currency" varchar(8) DEFAULT 'INR' NOT NULL,
	"status" "invoice_status" DEFAULT 'DRAFT' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "user_role" NOT NULL,
	"vendor_id" uuid,
	"office_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "no_show_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"trip_id" uuid NOT NULL,
	"trip_stop_id" uuid NOT NULL,
	"passenger_assignment_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"driver_id" uuid NOT NULL,
	"reason_code" "no_show_reason" NOT NULL,
	"driver_notes" text,
	"driver_arrived_at" timestamp with time zone NOT NULL,
	"wait_started_at" timestamp with time zone NOT NULL,
	"marked_at" timestamp with time zone NOT NULL,
	"waited_seconds" integer NOT NULL,
	"distance_from_stop_m" double precision,
	"geofence_verified" boolean DEFAULT false NOT NULL,
	"gps_accuracy_m" double precision,
	"latitude" double precision,
	"longitude" double precision,
	"sync_status" "no_show_sync_status" DEFAULT 'VERIFIED' NOT NULL,
	"appeal_status" "no_show_appeal_status" DEFAULT 'NONE' NOT NULL,
	"appeal_note" text,
	"appeal_resolved_by" uuid,
	"appeal_resolution_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"recipient_user_id" uuid NOT NULL,
	"channel" "notification_channel" DEFAULT 'IN_APP' NOT NULL,
	"category" varchar(64) NOT NULL,
	"title" varchar(180) NOT NULL,
	"body" text NOT NULL,
	"metadata_json" jsonb,
	"read_at" timestamp with time zone,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" varchar(160) NOT NULL,
	"code" varchar(48) NOT NULL,
	"address" text NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"location" geometry(point) NOT NULL,
	"geofence_radius_m" integer DEFAULT 250 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"default_geofence_radius_m" integer DEFAULT 150 NOT NULL,
	"no_show_wait_seconds" integer DEFAULT 300 NOT NULL,
	"booking_cutoff_minutes" integer DEFAULT 120 NOT NULL,
	"cancellation_cutoff_minutes" integer DEFAULT 45 NOT NULL,
	"require_boarding_otp" boolean DEFAULT true NOT NULL,
	"require_deboarding_otp" boolean DEFAULT false NOT NULL,
	"gps_stale_threshold_seconds" integer DEFAULT 60 NOT NULL,
	"gps_retention_days" integer DEFAULT 90 NOT NULL,
	"gps_ping_interval_seconds" integer DEFAULT 15 NOT NULL,
	"currency_code" varchar(8) DEFAULT 'INR' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(160) NOT NULL,
	"slug" varchar(80) NOT NULL,
	"status" "org_status" DEFAULT 'ACTIVE' NOT NULL,
	"country_code" varchar(8) DEFAULT 'IN' NOT NULL,
	"timezone" varchar(64) DEFAULT 'Asia/Kolkata' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "otp_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"passenger_assignment_id" uuid NOT NULL,
	"otp_type" "otp_type" NOT NULL,
	"otp_code_hash" varchar(128) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"verified_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"topic" varchar(96) NOT NULL,
	"aggregate_type" varchar(64) NOT NULL,
	"aggregate_id" uuid NOT NULL,
	"payload_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"last_error" text
);
--> statement-breakpoint
CREATE TABLE "passenger_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"trip_id" uuid NOT NULL,
	"trip_stop_id" uuid NOT NULL,
	"booking_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"status" "passenger_assignment_status" DEFAULT 'SCHEDULED' NOT NULL,
	"scheduled_pickup_at" timestamp with time zone,
	"driver_arrived_at" timestamp with time zone,
	"boarded_at" timestamp with time zone,
	"dropped_at" timestamp with time zone,
	"no_show_at" timestamp with time zone,
	"arrival_delay_seconds" integer,
	"passenger_wait_seconds" integer,
	"running_late_eta_minutes" integer,
	"running_late_reported_at" timestamp with time zone,
	"safe_reach_confirmed_at" timestamp with time zone,
	"cancellation_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "safety_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"trip_id" uuid,
	"employee_id" uuid,
	"driver_id" uuid,
	"alert_type" "safety_alert_type" NOT NULL,
	"severity" "safety_severity" DEFAULT 'CRITICAL' NOT NULL,
	"status" "safety_alert_status" DEFAULT 'OPEN' NOT NULL,
	"latitude" double precision,
	"longitude" double precision,
	"accuracy_m" double precision,
	"notes" text,
	"acknowledged_by" uuid,
	"acknowledged_at" timestamp with time zone,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"resolution_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shifts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"office_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"code" varchar(48) NOT NULL,
	"direction" "trip_direction" NOT NULL,
	"shift_time_local" varchar(5) NOT NULL,
	"days_of_week" varchar(32) DEFAULT 'MON,TUE,WED,THU,FRI' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trip_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"trip_id" uuid NOT NULL,
	"trip_stop_id" uuid,
	"passenger_assignment_id" uuid,
	"actor_user_id" uuid,
	"actor_role" varchar(48) NOT NULL,
	"event_type" varchar(64) NOT NULL,
	"client_event_id" uuid NOT NULL,
	"occurred_at_client" timestamp with time zone NOT NULL,
	"server_received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"latitude" double precision,
	"longitude" double precision,
	"gps_accuracy_m" double precision,
	"payload_json" jsonb
);
--> statement-breakpoint
CREATE TABLE "trip_stops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"trip_id" uuid NOT NULL,
	"sequence_no" integer NOT NULL,
	"stop_type" "stop_type" NOT NULL,
	"location_name" varchar(160) NOT NULL,
	"address" text NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"location" geometry(point) NOT NULL,
	"geofence_radius_m" integer DEFAULT 150 NOT NULL,
	"scheduled_arrival_at" timestamp with time zone,
	"actual_arrival_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"status" "stop_status" DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"office_id" uuid NOT NULL,
	"shift_id" uuid NOT NULL,
	"driver_id" uuid,
	"vehicle_id" uuid,
	"vendor_id" uuid,
	"trip_code" varchar(48) NOT NULL,
	"travel_date" date NOT NULL,
	"direction" "trip_direction" NOT NULL,
	"status" "trip_status" DEFAULT 'CREATED' NOT NULL,
	"current_stop_sequence" integer DEFAULT 1 NOT NULL,
	"planned_start_at" timestamp with time zone,
	"actual_start_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"aborted_at" timestamp with time zone,
	"abort_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(180) NOT NULL,
	"phone" varchar(32) NOT NULL,
	"full_name" varchar(160) NOT NULL,
	"password_hash" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"vendor_id" uuid NOT NULL,
	"registration_no" varchar(32) NOT NULL,
	"model_name" varchar(100) NOT NULL,
	"vehicle_type" "vehicle_type" DEFAULT 'SEDAN' NOT NULL,
	"seating_capacity" integer DEFAULT 4 NOT NULL,
	"availability_status" "availability_status" DEFAULT 'AVAILABLE' NOT NULL,
	"insurance_expires_at" timestamp with time zone,
	"permit_expires_at" timestamp with time zone,
	"fitness_expires_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" varchar(160) NOT NULL,
	"code" varchar(48) NOT NULL,
	"contact_name" varchar(120) NOT NULL,
	"contact_phone" varchar(32) NOT NULL,
	"billing_base_trip_paise" integer DEFAULT 45000 NOT NULL,
	"billing_rate_per_km_paise" integer DEFAULT 1800 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_approver_user_id_users_id_fk" FOREIGN KEY ("approver_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_office_id_offices_id_fk" FOREIGN KEY ("office_id") REFERENCES "public"."offices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_pickup_location_id_employee_locations_id_fk" FOREIGN KEY ("pickup_location_id") REFERENCES "public"."employee_locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_assigned_vehicle_id_vehicles_id_fk" FOREIGN KEY ("assigned_vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_locations" ADD CONSTRAINT "employee_locations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_locations" ADD CONSTRAINT "employee_locations_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_office_id_offices_id_fk" FOREIGN KEY ("office_id") REFERENCES "public"."offices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_default_shift_id_shifts_id_fk" FOREIGN KEY ("default_shift_id") REFERENCES "public"."shifts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gps_locations" ADD CONSTRAINT "gps_locations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gps_locations" ADD CONSTRAINT "gps_locations_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gps_locations" ADD CONSTRAINT "gps_locations_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_office_id_offices_id_fk" FOREIGN KEY ("office_id") REFERENCES "public"."offices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "no_show_records" ADD CONSTRAINT "no_show_records_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "no_show_records" ADD CONSTRAINT "no_show_records_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "no_show_records" ADD CONSTRAINT "no_show_records_trip_stop_id_trip_stops_id_fk" FOREIGN KEY ("trip_stop_id") REFERENCES "public"."trip_stops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "no_show_records" ADD CONSTRAINT "no_show_records_passenger_assignment_id_passenger_assignments_id_fk" FOREIGN KEY ("passenger_assignment_id") REFERENCES "public"."passenger_assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "no_show_records" ADD CONSTRAINT "no_show_records_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "no_show_records" ADD CONSTRAINT "no_show_records_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "no_show_records" ADD CONSTRAINT "no_show_records_appeal_resolved_by_users_id_fk" FOREIGN KEY ("appeal_resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offices" ADD CONSTRAINT "offices_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_settings" ADD CONSTRAINT "organization_settings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "otp_records" ADD CONSTRAINT "otp_records_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "otp_records" ADD CONSTRAINT "otp_records_passenger_assignment_id_passenger_assignments_id_fk" FOREIGN KEY ("passenger_assignment_id") REFERENCES "public"."passenger_assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passenger_assignments" ADD CONSTRAINT "passenger_assignments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passenger_assignments" ADD CONSTRAINT "passenger_assignments_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passenger_assignments" ADD CONSTRAINT "passenger_assignments_trip_stop_id_trip_stops_id_fk" FOREIGN KEY ("trip_stop_id") REFERENCES "public"."trip_stops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passenger_assignments" ADD CONSTRAINT "passenger_assignments_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passenger_assignments" ADD CONSTRAINT "passenger_assignments_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_alerts" ADD CONSTRAINT "safety_alerts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_alerts" ADD CONSTRAINT "safety_alerts_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_alerts" ADD CONSTRAINT "safety_alerts_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_alerts" ADD CONSTRAINT "safety_alerts_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_alerts" ADD CONSTRAINT "safety_alerts_acknowledged_by_users_id_fk" FOREIGN KEY ("acknowledged_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_alerts" ADD CONSTRAINT "safety_alerts_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_office_id_offices_id_fk" FOREIGN KEY ("office_id") REFERENCES "public"."offices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_events" ADD CONSTRAINT "trip_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_events" ADD CONSTRAINT "trip_events_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_events" ADD CONSTRAINT "trip_events_trip_stop_id_trip_stops_id_fk" FOREIGN KEY ("trip_stop_id") REFERENCES "public"."trip_stops"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_events" ADD CONSTRAINT "trip_events_passenger_assignment_id_passenger_assignments_id_fk" FOREIGN KEY ("passenger_assignment_id") REFERENCES "public"."passenger_assignments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_events" ADD CONSTRAINT "trip_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_stops" ADD CONSTRAINT "trip_stops_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_stops" ADD CONSTRAINT "trip_stops_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_office_id_offices_id_fk" FOREIGN KEY ("office_id") REFERENCES "public"."offices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "approvals_org_booking_idx" ON "approvals" USING btree ("organization_id","booking_id");--> statement-breakpoint
CREATE INDEX "audit_logs_org_entity_idx" ON "audit_logs" USING btree ("organization_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_logs_org_created_idx" ON "audit_logs" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "bookings_org_date_status_idx" ON "bookings" USING btree ("organization_id","travel_date","status");--> statement-breakpoint
CREATE INDEX "bookings_emp_date_idx" ON "bookings" USING btree ("employee_id","travel_date");--> statement-breakpoint
CREATE UNIQUE INDEX "drivers_org_code_uidx" ON "drivers" USING btree ("organization_id","driver_code");--> statement-breakpoint
CREATE UNIQUE INDEX "drivers_org_user_uidx" ON "drivers" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "drivers_org_status_idx" ON "drivers" USING btree ("organization_id","availability_status");--> statement-breakpoint
CREATE INDEX "emp_loc_org_emp_idx" ON "employee_locations" USING btree ("organization_id","employee_id");--> statement-breakpoint
CREATE INDEX "emp_loc_gist_idx" ON "employee_locations" USING gist ("location");--> statement-breakpoint
CREATE UNIQUE INDEX "employees_org_code_uidx" ON "employees" USING btree ("organization_id","employee_code");--> statement-breakpoint
CREATE UNIQUE INDEX "employees_org_user_uidx" ON "employees" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "employees_org_dept_idx" ON "employees" USING btree ("organization_id","department");--> statement-breakpoint
CREATE UNIQUE INDEX "gps_loc_trip_ping_uidx" ON "gps_locations" USING btree ("trip_id","client_ping_id");--> statement-breakpoint
CREATE INDEX "gps_loc_trip_recorded_idx" ON "gps_locations" USING btree ("trip_id","recorded_at");--> statement-breakpoint
CREATE INDEX "gps_loc_gist_idx" ON "gps_locations" USING gist ("location");--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_org_key_uidx" ON "idempotency_keys" USING btree ("organization_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "idempotency_expires_idx" ON "idempotency_keys" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_org_number_uidx" ON "invoices" USING btree ("organization_id","invoice_number");--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_org_user_role_uidx" ON "memberships" USING btree ("organization_id","user_id","role");--> statement-breakpoint
CREATE INDEX "memberships_user_idx" ON "memberships" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "no_show_pass_assign_uidx" ON "no_show_records" USING btree ("passenger_assignment_id");--> statement-breakpoint
CREATE INDEX "no_show_org_appeal_idx" ON "no_show_records" USING btree ("organization_id","appeal_status");--> statement-breakpoint
CREATE INDEX "notifications_user_read_idx" ON "notifications" USING btree ("recipient_user_id","read_at","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "offices_org_code_uidx" ON "offices" USING btree ("organization_id","code");--> statement-breakpoint
CREATE INDEX "offices_location_gist_idx" ON "offices" USING gist ("location");--> statement-breakpoint
CREATE UNIQUE INDEX "org_settings_org_id_uidx" ON "organization_settings" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_slug_uidx" ON "organizations" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "otp_assign_type_idx" ON "otp_records" USING btree ("passenger_assignment_id","otp_type");--> statement-breakpoint
CREATE INDEX "outbox_pending_idx" ON "outbox_events" USING btree ("published_at","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "pass_assign_booking_uidx" ON "passenger_assignments" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "pass_assign_trip_status_idx" ON "passenger_assignments" USING btree ("trip_id","status");--> statement-breakpoint
CREATE INDEX "pass_assign_emp_status_idx" ON "passenger_assignments" USING btree ("employee_id","status");--> statement-breakpoint
CREATE INDEX "safety_alerts_org_status_idx" ON "safety_alerts" USING btree ("organization_id","status","severity");--> statement-breakpoint
CREATE UNIQUE INDEX "shifts_org_office_code_uidx" ON "shifts" USING btree ("organization_id","office_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "trip_events_org_client_evt_uidx" ON "trip_events" USING btree ("organization_id","client_event_id");--> statement-breakpoint
CREATE INDEX "trip_events_trip_received_idx" ON "trip_events" USING btree ("trip_id","server_received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "trip_stops_trip_seq_uidx" ON "trip_stops" USING btree ("trip_id","sequence_no");--> statement-breakpoint
CREATE INDEX "trip_stops_gist_idx" ON "trip_stops" USING gist ("location");--> statement-breakpoint
CREATE UNIQUE INDEX "trips_org_code_uidx" ON "trips" USING btree ("organization_id","trip_code");--> statement-breakpoint
CREATE INDEX "trips_org_date_status_idx" ON "trips" USING btree ("organization_id","travel_date","status");--> statement-breakpoint
CREATE INDEX "trips_driver_status_idx" ON "trips" USING btree ("driver_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uidx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "vehicles_org_reg_uidx" ON "vehicles" USING btree ("organization_id","registration_no");--> statement-breakpoint
CREATE INDEX "vehicles_org_status_idx" ON "vehicles" USING btree ("organization_id","availability_status");--> statement-breakpoint
CREATE UNIQUE INDEX "vendors_org_code_uidx" ON "vendors" USING btree ("organization_id","code");