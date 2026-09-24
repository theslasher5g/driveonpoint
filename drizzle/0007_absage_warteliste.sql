CREATE TABLE IF NOT EXISTS "waitlist_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lesson_type_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text NOT NULL,
	"token" text NOT NULL,
	"notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "cancelled_by" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_lesson_type_id_lesson_types_id_fk" FOREIGN KEY ("lesson_type_id") REFERENCES "public"."lesson_types"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "waitlist_token_unique" ON "waitlist_entries" USING btree ("token");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "waitlist_session_idx" ON "waitlist_entries" USING btree ("lesson_type_id","starts_at");--> statement-breakpoint
-- Bestehende Absagen nachträglich zuordnen. Das Protokoll hält fest, ob die
-- Kundschaft über den Link abgesagt hat oder jemand aus dem Team.
UPDATE "bookings" b SET "cancelled_by" = 'fahrschule'
WHERE b."status" = 'abgesagt' AND b."cancelled_by" IS NULL
  AND EXISTS (
    SELECT 1 FROM "audit_log" a
    WHERE a."action" = 'buchung.abgesagt-intern' AND a."detail"->>'referenz' = b."reference"
  );
--> statement-breakpoint
UPDATE "bookings" b SET "cancelled_by" = 'kundschaft'
WHERE b."status" = 'abgesagt' AND b."cancelled_by" IS NULL
  AND EXISTS (
    SELECT 1 FROM "audit_log" a
    WHERE a."action" = 'buchung.abgesagt' AND a."detail"->>'referenz' = b."reference"
  );
