CREATE TYPE "public"."metro_status" AS ENUM('waitlist', 'seeding', 'open');--> statement-breakpoint
CREATE TABLE "areas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"metro_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"center" extensions.geography(Point,4326) NOT NULL,
	"zips" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "areas" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "metros" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"short_name" text NOT NULL,
	"status" "metro_status" DEFAULT 'waitlist' NOT NULL,
	"center" extensions.geography(Point,4326) NOT NULL,
	"service_radius_miles" integer NOT NULL,
	"time_zone" text NOT NULL,
	"closing_weekday" smallint NOT NULL,
	"closing_starts_at" time NOT NULL,
	"closing_ends_at" time NOT NULL,
	"closing_slot_seconds" integer NOT NULL,
	"listings_to_open" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "metros_slug_unique" UNIQUE("slug"),
	CONSTRAINT "metros_closing_weekday" CHECK ("metros"."closing_weekday" between 0 and 6),
	CONSTRAINT "metros_closing_window" CHECK ("metros"."closing_ends_at" > "metros"."closing_starts_at"),
	CONSTRAINT "metros_positive_numbers" CHECK ("metros"."service_radius_miles" > 0 and "metros"."closing_slot_seconds" > 0 and "metros"."listings_to_open" >= 0)
);
--> statement-breakpoint
ALTER TABLE "metros" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "waitlist_signups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"metro_id" uuid,
	"zip" text,
	"email" text NOT NULL,
	"user_id" uuid,
	"wants_to_host" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "waitlist_has_place" CHECK ("waitlist_signups"."metro_id" is not null or "waitlist_signups"."zip" is not null)
);
--> statement-breakpoint
ALTER TABLE "waitlist_signups" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "zip_codes" (
	"zip" text PRIMARY KEY NOT NULL,
	"location" extensions.geography(Point,4326) NOT NULL,
	"metro_id" uuid,
	"area_id" uuid,
	CONSTRAINT "zip_codes_zip_format" CHECK ("zip_codes"."zip" ~ '^[0-9]{5}$')
);
--> statement-breakpoint
ALTER TABLE "zip_codes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "areas" ADD CONSTRAINT "areas_metro_id_metros_id_fk" FOREIGN KEY ("metro_id") REFERENCES "public"."metros"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_signups" ADD CONSTRAINT "waitlist_signups_metro_id_metros_id_fk" FOREIGN KEY ("metro_id") REFERENCES "public"."metros"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_signups" ADD CONSTRAINT "waitlist_signups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zip_codes" ADD CONSTRAINT "zip_codes_metro_id_metros_id_fk" FOREIGN KEY ("metro_id") REFERENCES "public"."metros"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zip_codes" ADD CONSTRAINT "zip_codes_area_id_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "areas_metro_slug" ON "areas" USING btree ("metro_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "waitlist_metro_email" ON "waitlist_signups" USING btree ("metro_id","email") WHERE "waitlist_signups"."metro_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "waitlist_zip_email" ON "waitlist_signups" USING btree ("zip","email") WHERE "waitlist_signups"."metro_id" is null;--> statement-breakpoint
CREATE INDEX "zip_codes_location_idx" ON "zip_codes" USING gist ("location");--> statement-breakpoint
CREATE INDEX "zip_codes_metro_idx" ON "zip_codes" USING btree ("metro_id");