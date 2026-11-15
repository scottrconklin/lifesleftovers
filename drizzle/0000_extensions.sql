-- Milestone 0: extensions every later migration relies on.
-- Supabase convention: extensions live in the "extensions" schema, which is on the default search_path.
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
