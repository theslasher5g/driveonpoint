import { asc } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { lessonTypes } from "@/lib/db/schema";
import { LessonTypeEditor } from "@/components/lesson-type-editor";

export const dynamic = "force-dynamic";

export default async function PreisePage() {
  await requirePermission("preise.verwalten");

  const rows = await db
    .select()
    .from(lessonTypes)
    .orderBy(asc(lessonTypes.sortOrder), asc(lessonTypes.name));

  return (
    <section className="shell py-10 md:py-14">
      <div className="lane">
        <h1 className="text-title">Preise und Angebote</h1>
        <p className="text-slate text-lead mt-4 max-w-[58ch]">
          Änderungen sind sofort auf der Website sichtbar. Bereits gebuchte Termine behalten den
          Preis, der beim Buchen galt.
        </p>

        <div className="mt-10 space-y-10">
          {rows.map((lessonType) => (
            <LessonTypeEditor key={lessonType.id} lessonType={lessonType} />
          ))}
        </div>

      </div>
    </section>
  );
}
