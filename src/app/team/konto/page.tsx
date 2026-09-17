import { requireUser } from "@/lib/auth/guard";
import { ROLE_DESCRIPTION, ROLE_LABEL } from "@/lib/auth/permissions";
import { env } from "@/lib/env";
import { CalendarSubscription } from "@/components/calendar-subscription";
import { ChangePasswordForm } from "@/components/change-password-form";
import { MfaSetup } from "@/components/mfa-setup";

export const dynamic = "force-dynamic";

export default async function KontoPage({
  searchParams,
}: {
  searchParams: Promise<{ erstanmeldung?: string }>;
}) {
  const user = await requireUser();
  const { erstanmeldung } = await searchParams;

  const feedUrl = `${env.appUrl}/api/kalender/${user.calendarToken}.ics`;

  return (
    <section className="shell py-10 md:py-14">
      <div className="lane">
        <h1 className="text-title">Mein Konto</h1>
        <p className="text-slate mt-4">
          {user.name} — {ROLE_LABEL[user.role]}. {ROLE_DESCRIPTION[user.role]}
        </p>

        {(erstanmeldung || user.mustChangePassword) && (
          <p className="surface bg-amber text-deep px-5 py-4 font-semibold mt-7 max-w-xl">
            Du bist noch mit dem vergebenen Startpasswort unterwegs. Wähle jetzt ein eigenes.
          </p>
        )}

        {!user.totpEnabled && (
          <p className="notice notice-warn mt-7 max-w-xl">
            Dein Konto hat noch keine Zwei-Faktor-Authentifizierung. Wir empfehlen, sie
            einzurichten — weiter unten auf dieser Seite.
          </p>
        )}

        <div className="grid gap-12 lg:grid-cols-2 mt-10">
          <div>
            <h2 className="text-section mb-6">Passwort ändern</h2>
            <ChangePasswordForm />

            <h2 className="text-section mb-6 mt-12">Zwei-Faktor-Authentifizierung</h2>
            <MfaSetup enabled={user.totpEnabled} />
          </div>

          <div>
            <h2 className="text-section mb-6">Kalender abonnieren</h2>
            <CalendarSubscription url={feedUrl} />
          </div>
        </div>
      </div>
    </section>
  );
}
