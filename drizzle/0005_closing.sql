CREATE TYPE "public"."order_kind" AS ENUM('sale', 'free_claim');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('awaiting_payment', 'claimed');--> statement-breakpoint
ALTER TYPE "public"."listing_status" ADD VALUE 'sold';--> statement-breakpoint
ALTER TYPE "public"."listing_status" ADD VALUE 'ended';--> statement-breakpoint
CREATE TABLE "closing_nights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"metro_id" uuid NOT NULL,
	"date" date NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"next_slot" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "closing_nights_window" CHECK ("closing_nights"."ends_at" > "closing_nights"."starts_at")
);
--> statement-breakpoint
ALTER TABLE "closing_nights" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auction_id" uuid NOT NULL,
	"listing_id" uuid NOT NULL,
	"buyer_id" uuid,
	"seller_id" uuid,
	"kind" "order_kind" NOT NULL,
	"status" "order_status" NOT NULL,
	"price_cents" integer NOT NULL,
	"premium_cents" integer NOT NULL,
	"total_cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_one_per_auction" UNIQUE("auction_id"),
	CONSTRAINT "orders_total" CHECK ("orders"."total_cents" = "orders"."price_cents" + "orders"."premium_cents")
);
--> statement-breakpoint
ALTER TABLE "orders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "want_taps" (
	"auction_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "want_taps_auction_id_user_id_pk" PRIMARY KEY("auction_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "want_taps" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "unsold_runs" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "second_chance" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "needs_decision" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "auctions" ADD COLUMN "closing_night_id" uuid;--> statement-breakpoint
ALTER TABLE "auctions" ADD COLUMN "slot" integer;--> statement-breakpoint
ALTER TABLE "auctions" ADD COLUMN "closed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "closing_nights" ADD CONSTRAINT "closing_nights_metro_id_metros_id_fk" FOREIGN KEY ("metro_id") REFERENCES "public"."metros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_auction_id_auctions_id_fk" FOREIGN KEY ("auction_id") REFERENCES "public"."auctions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_seller_id_users_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "want_taps" ADD CONSTRAINT "want_taps_auction_id_auctions_id_fk" FOREIGN KEY ("auction_id") REFERENCES "public"."auctions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "want_taps" ADD CONSTRAINT "want_taps_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "closing_nights_metro_start" ON "closing_nights" USING btree ("metro_id","starts_at");--> statement-breakpoint
CREATE INDEX "orders_buyer_idx" ON "orders" USING btree ("buyer_id");--> statement-breakpoint
CREATE INDEX "orders_seller_idx" ON "orders" USING btree ("seller_id");--> statement-breakpoint
ALTER TABLE "auctions" ADD CONSTRAINT "auctions_closing_night_id_closing_nights_id_fk" FOREIGN KEY ("closing_night_id") REFERENCES "public"."closing_nights"("id") ON DELETE no action ON UPDATE no action;