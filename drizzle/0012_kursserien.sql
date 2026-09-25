ALTER TABLE "availability_exceptions" ADD COLUMN "cancelled_session" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Wochenregeln für Kurse aus der Zeit, bevor Kurse über einzelne Kurstermine
-- liefen. Sie waren im Team-Bereich unsichtbar und boten nichts an; ab jetzt
-- bieten Regeln auch für Kurse Termine an, darum müssen die alten weg.
DELETE FROM "availability_rules" WHERE "lesson_type_id" IN (SELECT "id" FROM "lesson_types" WHERE "capacity" > 1);
