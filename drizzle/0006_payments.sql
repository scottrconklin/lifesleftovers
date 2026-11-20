CREATE TYPE "public"."payout_status" AS ENUM('pending', 'paid', 'failed');--> statement-breakpoint
ALTER TYPE "public"."order_status" ADD VALUE 'offered';--> statement-breakpoint
ALTER TYPE "public"."order_status" ADD VALUE 'payment_failed';--> statement-breakpoint
ALTER TYPE "public"."order_status" ADD VALUE 'paid';--> statement-breakpoint
ALTER TYPE "public"."order_status" ADD VALUE 'problem_reported';--> statement-breakpoint
ALTER TYPE "public"."order_status" ADD VALUE 'released';--> statement-breakpoint
ALTER TYPE "public"."order_status" ADD VALUE 'refunded';--> statement-breakpoint
ALTER TYPE "public"."order_status" ADD VALUE 'cancelled';--> statement-breakpoint
CREATE TABLE "payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seller_id" uuid,
	"amount_cents" integer NOT NULL,
	"status" "payout_status" DEFAULT 'pending' NOT NULL,
	"stripe_payout_id" text,
	"failure" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	CONSTRAINT "payouts_stripePayoutId_unique" UNIQUE("stripe_payout_id"),
	CONSTRAINT "payouts_positive" CHECK ("payouts"."amount_cents" > 0)
);
--> statement-breakpoint
ALTER TABLE "payouts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT "orders_one_per_auction";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "stripe_account_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "payouts_enabled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "seller_payout_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "second_chance" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payment_attempt" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payment_intent_id" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "charge_id" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "card_brand" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "card_last4" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payment_failure" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payment_due_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "paid_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "offer_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "release_after" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "picked_up_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "released_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "problem_reported_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "problem_note" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "refund_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "refund_id" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "refunded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "cancel_reason" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "transfer_id" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "transferred_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payout_id" uuid;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_seller_id_users_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payouts_seller_idx" ON "payouts" USING btree ("seller_id","created_at");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_payout_id_payouts_id_fk" FOREIGN KEY ("payout_id") REFERENCES "public"."payouts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "orders_one_live_per_auction" ON "orders" USING btree ("auction_id") WHERE "orders"."cancelled_at" is null;--> statement-breakpoint
CREATE INDEX "orders_payout_idx" ON "orders" USING btree ("payout_id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_stripeAccountId_unique" UNIQUE("stripe_account_id");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_paymentIntentId_unique" UNIQUE("payment_intent_id");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_transferId_unique" UNIQUE("transfer_id");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_card_last4" CHECK ("orders"."card_last4" is null or "orders"."card_last4" ~ '^[0-9]{4}$');--> statement-breakpoint
-- Orders closed before payments existed: the seller gets the full price (no seller fee in V1).
UPDATE "orders" SET "seller_payout_cents" = "price_cents";
