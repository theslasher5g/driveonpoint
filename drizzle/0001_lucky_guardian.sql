CREATE TABLE IF NOT EXISTS "price_packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lesson_type_id" uuid,
	"label" text NOT NULL,
	"price_rappen" integer NOT NULL,
	"lessons" smallint,
	"note" text,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" smallint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lesson_types" ADD COLUMN "reduced_price_rappen" integer;--> statement-breakpoint
ALTER TABLE "lesson_types" ADD COLUMN "reduced_label" text DEFAULT 'Lehrlinge, Studierende und IV' NOT NULL;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "google_sub" text;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "google_linked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "password_login_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "price_packages" ADD CONSTRAINT "price_packages_lesson_type_id_lesson_types_id_fk" FOREIGN KEY ("lesson_type_id") REFERENCES "public"."lesson_types"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "price_packages_sort_idx" ON "price_packages" USING btree ("sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "staff_google_sub_unique" ON "staff" USING btree ("google_sub");