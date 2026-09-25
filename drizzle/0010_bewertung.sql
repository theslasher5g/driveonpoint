ALTER TABLE "bookings" ADD COLUMN "review_consent" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "review_requested_at" timestamp with time zone;