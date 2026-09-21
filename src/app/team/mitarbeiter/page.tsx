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
        <p className="text-slate text-lead mt-4 max-w-[58ch]">
          Wer hier ein Konto hat, kommt in den Team-Bereich. Die Rolle entscheidet, was jemand
          dort sehen und ändern darf.
        </p>

        <dl className="grid gap-5 sm:grid-cols-3 mt-9 border-t border-deep/15 pt-6">
          {staffRole.enumValues.map((role) => (
            <div key={role}>
              <dt className="font-bold">{ROLE_LABEL[role]}</dt>
              <dd className="text-fine text-slate mt-1">{ROLE_DESCRIPTION[role]}</dd>
            </div>
          ))}
        </dl>

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

        <h2 className="text-section mt-14 mb-6">Konten</h2>
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

        <h2 className="text-section mt-14 mb-6">Neues Konto anlegen</h2>
        <CreateStaffForm />
      </div>
    </section>
  );
}
