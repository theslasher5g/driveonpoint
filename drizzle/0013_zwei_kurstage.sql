ALTER TABLE "availability_exceptions" ADD COLUMN "second_day_offset" smallint;--> statement-breakpoint
ALTER TABLE "availability_exceptions" ADD COLUMN "second_start_time" time;--> statement-breakpoint
ALTER TABLE "availability_exceptions" ADD COLUMN "second_end_time" time;--> statement-breakpoint
ALTER TABLE "availability_rules" ADD COLUMN "second_day_offset" smallint;--> statement-breakpoint
ALTER TABLE "availability_rules" ADD COLUMN "second_start_time" time;--> statement-breakpoint
ALTER TABLE "availability_rules" ADD COLUMN "second_end_time" time;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "second_starts_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "second_ends_at" timestamp with time zone;--> statement-breakpoint
-- Der VKU findet an zwei Abenden statt, nicht an vier. Nur den alten
-- Standardtext ersetzen; eine eigene Beschreibung aus "Preise" bleibt.
UPDATE "lesson_types" SET "short_description" = '8 Lektionen an 2 Abenden, inklusive Unterlagen' WHERE "slug" = 'vku' AND "short_description" = '8 Lektionen an 4 Abenden, inklusive Unterlagen';
