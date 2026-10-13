import { asc, eq } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/guard";
import { ROLE_DESCRIPTION, ROLE_LABEL } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { lessonTypes, staff, staffLessonTypes, staffRole } from "@/lib/db/schema";
import { CreateStaffForm } from "@/components/create-staff-form";
import { StaffRow } from "@/components/staff-row";

export const dynamic = "force-dynamic";

const FEHLER: Record<string, string> = {
  "unbekanntes-konto": "Dieses Konto gibt es nicht mehr.",
  "eigenes-konto": "Das eigene Konto lässt sich nicht löschen.",
  "letzte-administration": "Das letzte Administrationskonto lässt sich nicht löschen.",
};

type Params = Promise<{
  geloescht?: string;
  uebergeben?: string;
  abgesagt?: string;
  fehler?: string;
}>;

export default async function MitarbeiterPage({ searchParams }: { searchParams: Params }) {
  const admin = await requirePermission("mitarbeiter.verwalten");
  const params = await searchParams;

  const [people, offers, assignments] = await Promise.all([
    db
      .select({
        id: staff.id,
        name: staff.name,
        email: staff.email,
        role: staff.role,
        active: staff.active,
        mustChangePassword: staff.mustChangePassword,
        totpEnabled: staff.totpEnabled,
        lastLoginAt: staff.lastLoginAt,
      })
      .from(staff)
      .orderBy(asc(staff.active), asc(staff.name)),
    db
      .select({ id: lessonTypes.id, name: lessonTypes.name })
      .from(lessonTypes)
      .where(eq(lessonTypes.active, true))
      .orderBy(asc(lessonTypes.sortOrder)),
    db.select().from(staffLessonTypes),
  ]);

  return (
    <section className="shell py-10 md:py-14">
      <div className="lane">
        <h1 className="text-title">Mitarbeitende</h1>
        <p className="text-slate mt-2 max-w-[58ch]">
          Wer hier ein Konto hat, kommt in den Team-Bereich. Die Rolle entscheidet, was jemand
          dort sehen und ändern darf.
        </p>

        {params.geloescht && (
          <p role="status" className="notice notice-success mt-9">
            Konto von {params.geloescht} gelöscht.
            {Number(params.uebergeben) > 0 &&
              ` ${params.uebergeben} Termin(e) übergeben.`}
            {Number(params.abgesagt) > 0 &&
              ` ${params.abgesagt} Termin(e) abgesagt, Kundschaft benachrichtigt.`}
          </p>
        )}
        {params.fehler && (
          <p role="alert" className="notice notice-error mt-9">
            {FEHLER[params.fehler] ?? "Das hat nicht geklappt."}
          </p>
        )}

        <h2 className="text-section mt-10 mb-4">Konten</h2>
        <div className="space-y-5">
          {people.map((person) => (
            <StaffRow
              key={person.id}
              person={person}
              offers={offers}
              assigned={assignments
                .filter((entry) => entry.staffId === person.id)
                .map((entry) => entry.lessonTypeId)}
              isSelf={person.id === admin.id}
            />
          ))}
        </div>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] mt-12 items-start">
          <div>
            <h2 className="text-section mb-4">Neues Konto anlegen</h2>
            <CreateStaffForm />
          </div>
          {/* Die Rollen erklärt neben dem Formular, wo man sie beim Anlegen
              braucht — vorher standen sie als drei Kacheln ganz oben und
              schoben die Konten selbst unter den Bildschirmrand. */}
          <dl className="surface bg-paper divide-y divide-rule lg:mt-11">
            {staffRole.enumValues.map((role) => (
              <div key={role} className="px-5 py-3.5">
                <dt className="text-fine font-bold">{ROLE_LABEL[role]}</dt>
                <dd className="text-fine text-slate mt-0.5">{ROLE_DESCRIPTION[role]}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
