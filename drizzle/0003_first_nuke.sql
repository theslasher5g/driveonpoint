DROP INDEX IF EXISTS "availability_rules_staff_idx";--> statement-breakpoint
ALTER TABLE "availability_exceptions" ADD COLUMN "lesson_type_id" uuid;--> statement-breakpoint
ALTER TABLE "availability_rules" ADD COLUMN "lesson_type_id" uuid NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "availability_exceptions" ADD CONSTRAINT "availability_exceptions_lesson_type_id_lesson_types_id_fk" FOREIGN KEY ("lesson_type_id") REFERENCES "public"."lesson_types"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "availability_rules" ADD CONSTRAINT "availability_rules_lesson_type_id_lesson_types_id_fk" FOREIGN KEY ("lesson_type_id") REFERENCES "public"."lesson_types"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "availability_rules_staff_lesson_idx" ON "availability_rules" USING btree ("staff_id","lesson_type_id","weekday");