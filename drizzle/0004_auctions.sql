CREATE TYPE "public"."auction_status" AS ENUM('open', 'closing', 'sold', 'unsold', 'cancelled');--> statement-breakpoint
CREATE TABLE "auctions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"metro_id" uuid NOT NULL,
	"closing_night_date" date NOT NULL,
	"status" "auction_status" DEFAULT 'open' NOT NULL,
	"is_free" boolean NOT NULL,
	"start_price_cents" integer NOT NULL,
	"current_price_cents" integer NOT NULL,
	"high_bidder_id" uuid,
	"high_max_cents" integer,
	"bid_count" integer DEFAULT 0 NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"scheduled_ends_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auctions_prices" CHECK ("auctions"."start_price_cents" >= 0 and "auctions"."current_price_cents" >= "auctions"."start_price_cents"),
	CONSTRAINT "auctions_leader" CHECK ("auctions"."high_bidder_id" is null or "auctions"."high_max_cents" is not null)
);
--> statement-breakpoint
ALTER TABLE "auctions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "bids" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auction_id" uuid NOT NULL,
	"bidder_id" uuid NOT NULL,
	"max_cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bids_positive" CHECK ("bids"."max_cents" > 0)
);
--> statement-breakpoint
ALTER TABLE "bids" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "user_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"payment_method_id" text NOT NULL,
	"fingerprint" text NOT NULL,
	"brand" text NOT NULL,
	"last4" text NOT NULL,
	"exp_month" smallint NOT NULL,
	"exp_year" smallint NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_cards_paymentMethodId_unique" UNIQUE("payment_method_id"),
	CONSTRAINT "user_cards_last4" CHECK ("user_cards"."last4" ~ '^[0-9]{4}$')
);
--> statement-breakpoint
ALTER TABLE "user_cards" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "user_devices" (
	"user_id" uuid NOT NULL,
	"device_hash" text NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_devices_user_id_device_hash_pk" PRIMARY KEY("user_id","device_hash")
);
--> statement-breakpoint
ALTER TABLE "user_devices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "watches" (
	"user_id" uuid NOT NULL,
	"listing_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "watches_user_id_listing_id_pk" PRIMARY KEY("user_id","listing_id")
);
--> statement-breakpoint
ALTER TABLE "watches" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "stripe_customer_id" text;--> statement-breakpoint
ALTER TABLE "auctions" ADD CONSTRAINT "auctions_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auctions" ADD CONSTRAINT "auctions_metro_id_metros_id_fk" FOREIGN KEY ("metro_id") REFERENCES "public"."metros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auctions" ADD CONSTRAINT "auctions_high_bidder_id_users_id_fk" FOREIGN KEY ("high_bidder_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bids" ADD CONSTRAINT "bids_auction_id_auctions_id_fk" FOREIGN KEY ("auction_id") REFERENCES "public"."auctions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bids" ADD CONSTRAINT "bids_bidder_id_users_id_fk" FOREIGN KEY ("bidder_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_cards" ADD CONSTRAINT "user_cards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_devices" ADD CONSTRAINT "user_devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watches" ADD CONSTRAINT "watches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watches" ADD CONSTRAINT "watches_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "auctions_one_open_per_listing" ON "auctions" USING btree ("listing_id") WHERE "auctions"."status" = 'open';--> statement-breakpoint
CREATE INDEX "auctions_open_ends_idx" ON "auctions" USING btree ("ends_at") WHERE "auctions"."status" = 'open';--> statement-breakpoint
CREATE INDEX "bids_auction_idx" ON "bids" USING btree ("auction_id","created_at");--> statement-breakpoint
CREATE INDEX "bids_bidder_idx" ON "bids" USING btree ("bidder_id","created_at");--> statement-breakpoint
CREATE INDEX "user_cards_fingerprint_idx" ON "user_cards" USING btree ("fingerprint");--> statement-breakpoint
CREATE UNIQUE INDEX "user_cards_one_default" ON "user_cards" USING btree ("user_id") WHERE "user_cards"."is_default";--> statement-breakpoint
CREATE INDEX "user_devices_hash_idx" ON "user_devices" USING btree ("device_hash");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_stripeCustomerId_unique" UNIQUE("stripe_customer_id");