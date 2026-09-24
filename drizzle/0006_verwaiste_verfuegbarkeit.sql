-- Verfügbarkeiten aufräumen, die im Team-Bereich unsichtbar waren und sich
-- deshalb nicht löschen liessen, im Wochenkalender aber trotzdem standen:
--
-- 1. Wochenzeiten und Einzeltage für Angebote, die der Person nicht mehr
--    zugeteilt sind (die Seite Verfügbarkeit zeigt nur zugeteilte Angebote).
DELETE FROM "availability_rules" r
WHERE NOT EXISTS (
  SELECT 1 FROM "staff_lesson_types" s
  WHERE s."staff_id" = r."staff_id" AND s."lesson_type_id" = r."lesson_type_id"
);
--> statement-breakpoint
DELETE FROM "availability_exceptions" e
WHERE e."lesson_type_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "staff_lesson_types" s
    WHERE s."staff_id" = e."staff_id" AND s."lesson_type_id" = e."lesson_type_id"
  );
--> statement-breakpoint
-- 2. Wöchentliche Zeiten für Kurse (VKU, Nothilfekurs). Kurse laufen seit
--    der Umstellung nur noch über einzelne Kurstermine; alte Wochenregeln
--    boten sie sonst jede Woche an, ohne dass man sie sehen konnte.
DELETE FROM "availability_rules" r
USING "lesson_types" l
WHERE l."id" = r."lesson_type_id" AND l."capacity" > 1;
