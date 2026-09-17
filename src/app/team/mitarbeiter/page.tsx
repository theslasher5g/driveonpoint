import { asc, eq } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/guard";
import { ROLE_DESCRIPTION, ROLE_LABEL } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { lessonTypes, staff, staffLessonTypes, staffRole } from "@/lib/db/schema";
import { CreateStaffForm } from "@/components/create-staff-form";
import { StaffRow } from "@/components/staff-row";

export const dynamic = "force-dynamic";

export default async function MitarbeiterPage() {
  const admin = await requirePermission("mitarbeiter.verwalten");

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
