CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"display_name" text,
	"home_zip" text,
	"phone_e164" text,
	"phone_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_phone_e164_unique" UNIQUE("phone_e164"),
	CONSTRAINT "users_home_zip_format" CHECK ("users"."home_zip" ~ '^[0-9]{5}$'),
	CONSTRAINT "users_phone_e164_format" CHECK ("users"."phone_e164" ~ '^\+[1-9][0-9]{7,14}$'),
	CONSTRAINT "users_phone_verified_together" CHECK (("users"."phone_e164" is null) = ("users"."phone_verified_at" is null))
);
--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_id_users_id_fk" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;