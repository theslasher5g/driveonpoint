CREATE TABLE IF NOT EXISTS "trusted_browsers" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"staff_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"user_agent" text
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trusted_browsers" ADD CONSTRAINT "trusted_browsers_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trusted_browsers_staff_idx" ON "trusted_browsers" USING btree ("staff_id");