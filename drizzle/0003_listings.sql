CREATE TYPE "public"."listing_category" AS ENUM('home-kitchen', 'tools-building', 'yard-garden', 'furniture', 'sports-outdoors', 'clothing-shoes-handbags', 'costumes-uniforms', 'toys-games', 'kids-baby', 'electronics', 'crafts-hobbies', 'collectibles-kitsch', 'free-oddities');--> statement-breakpoint
CREATE TYPE "public"."listing_condition" AS ENUM('new', 'like_new', 'good', 'fair', 'for_parts');--> statement-breakpoint
CREATE TYPE "public"."listing_status" AS ENUM('draft', 'in_review', 'live', 'cancelled', 'removed');--> statement-breakpoint
CREATE TYPE "public"."photo_kind" AS ENUM('photo', 'tag', 'interior', 'serial');--> statement-breakpoint
CREATE TYPE "public"."size_hint" AS ENUM('trunk', 'truck');--> statement-breakpoint
CREATE TYPE "public"."unsold_action" AS ENUM('relist_once', 'drop_to_free', 'end');--> statement-breakpoint
CREATE TABLE "listing_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"kind" "photo_kind" DEFAULT 'photo' NOT NULL,
	"position" smallint NOT NULL,
	"storage_key" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "listing_photos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seller_id" uuid NOT NULL,
	"status" "listing_status" DEFAULT 'draft' NOT NULL,
	"title" text,
	"description" text,
	"why_its_here" text,
	"category" "listing_category",
	"condition" "listing_condition",
	"is_lot" boolean DEFAULT false NOT NULL,
	"is_free" boolean DEFAULT false NOT NULL,
	"lot_item_count" integer,
	"lot_contents" text,
	"size_hint" "size_hint",
	"start_price_cents" integer DEFAULT 100 NOT NULL,
	"suggested_start_cents" integer,
	"is_brand_name" boolean DEFAULT false NOT NULL,
	"authenticity_confirmed_at" timestamp with time zone,
	"pickup_zip" text,
	"metro_id" uuid,
	"pickup_windows" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"closing_night_date" date,
	"unsold_action" "unsold_action" DEFAULT 'relist_once' NOT NULL,
	"seller_notes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ai_suggestion" jsonb,
	"moderation" jsonb,
	"posted_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "listings_price" CHECK (("listings"."is_free" and "listings"."start_price_cents" = 0) or (not "listings"."is_free" and "listings"."start_price_cents" >= 100)),
	CONSTRAINT "listings_lot_fields" CHECK ("listings"."is_lot" or ("listings"."lot_item_count" is null and "listings"."lot_contents" is null)),
	CONSTRAINT "listings_complete_when_posted" CHECK ("listings"."status" = 'draft' or ("listings"."title" is not null and "listings"."category" is not null
        and "listings"."condition" is not null and "listings"."pickup_zip" is not null and "listings"."metro_id" is not null
        and "listings"."posted_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "listings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "listing_photos" ADD CONSTRAINT "listing_photos_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_seller_id_users_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_pickup_zip_zip_codes_zip_fk" FOREIGN KEY ("pickup_zip") REFERENCES "public"."zip_codes"("zip") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_metro_id_metros_id_fk" FOREIGN KEY ("metro_id") REFERENCES "public"."metros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "listing_photos_position" ON "listing_photos" USING btree ("listing_id","position");--> statement-breakpoint
CREATE INDEX "listings_seller_idx" ON "listings" USING btree ("seller_id");--> statement-breakpoint
CREATE INDEX "listings_live_idx" ON "listings" USING btree ("metro_id","closing_night_date") WHERE "listings"."status" = 'live';