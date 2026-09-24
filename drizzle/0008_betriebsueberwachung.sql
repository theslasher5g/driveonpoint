CREATE TABLE IF NOT EXISTS "system_checks" (
	"key" text PRIMARY KEY NOT NULL,
	"last_ok_at" timestamp with time zone,
	"last_error_at" timestamp with time zone,
	"last_error" text,
	"alerted_at" timestamp with time zone
);
