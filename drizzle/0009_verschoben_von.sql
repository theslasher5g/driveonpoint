ALTER TABLE "bookings" ADD COLUMN "moved_by" text;--> statement-breakpoint
-- Bestehende Verschiebungen aus dem Protokoll nachtragen: die jeweils
-- letzte zählt. Ganze Kurse führen ihre Referenzen als Liste.
UPDATE "bookings" b SET "moved_by" = latest."who"
FROM (
  SELECT DISTINCT ON (moves."ref") moves."ref", moves."who"
  FROM (
    SELECT a."detail"->>'referenz' AS "ref", 'fahrschule' AS "who", a."occurred_at"
      FROM "audit_log" a WHERE a."action" = 'buchung.verschoben'
    UNION ALL
    SELECT a."detail"->>'referenz', 'kundschaft', a."occurred_at"
      FROM "audit_log" a WHERE a."action" = 'buchung.selbst-verschoben'
    UNION ALL
    SELECT r."value", 'fahrschule', a."occurred_at"
      FROM "audit_log" a, jsonb_array_elements_text(a."detail"->'referenzen') r
      WHERE a."action" = 'kurs.verschoben'
  ) moves
  WHERE moves."ref" IS NOT NULL
  ORDER BY moves."ref", moves."occurred_at" DESC
) latest
WHERE b."reference" = latest."ref" AND b."moved_by" IS NULL;
