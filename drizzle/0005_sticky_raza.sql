ALTER TABLE "bookings" ADD COLUMN "confirm_token" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "confirm_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "reminder_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "no_show_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bookings_confirm_token_idx" ON "bookings" USING btree ("confirm_token");--> statement-breakpoint
-- Bisher stand jeder Termin als "angefragt", der Status hatte keine Bedeutung.
-- Ab jetzt heisst "angefragt": wartet auf die Bestätigung per Mail. Alles,
-- was schon im Kalender steht, gilt deshalb als bestätigt.
UPDATE "bookings" SET "status" = 'bestaetigt', "confirmed_at" = "created_at" WHERE "status" = 'angefragt';
