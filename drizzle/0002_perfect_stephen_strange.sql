DROP INDEX IF EXISTS "staff_google_sub_unique";--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "totp_secret" text;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "totp_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "totp_confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "mfa_recovery_codes" jsonb;--> statement-breakpoint
ALTER TABLE "staff" DROP COLUMN IF EXISTS "google_sub";--> statement-breakpoint
ALTER TABLE "staff" DROP COLUMN IF EXISTS "google_linked_at";--> statement-breakpoint
ALTER TABLE "staff" DROP COLUMN IF EXISTS "password_login_enabled";