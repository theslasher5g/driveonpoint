import { requireUser } from "@/lib/auth/guard";
import { ROLE_DESCRIPTION, ROLE_LABEL } from "@/lib/auth/permissions";
import { countTrustedBrowsers } from "@/lib/auth/trusted-browser";
import { env } from "@/lib/env";
import { CalendarSubscription } from "@/components/calendar-subscription";
import { ChangePasswordForm } from "@/components/change-password-form";
import { MfaSetup } from "@/components/mfa-setup";
import { forgetBrowsersAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function KontoPage({
  searchParams,
}: {
  searchParams: Promise<{ erstanmeldung?: string }>;
}) {
  const user = await requireUser();
  const { erstanmeldung } = await searchParams;

  const feedUrl = `${env.appUrl}/api/kalender/${user.calendarToken}.ics`;
  const trusted = user.totpEnabled ? await countTrustedBrowsers(user.id) : 0;

  return (
    <section className="shell py-10 md:py-14">
      <div className="lane">
        <span className="block w-10 h-[3px] rounded-full bg-signal mb-5" aria-hidden="true" />
        <h1 className="font-display text-3xl md:text-4xl font-bold">Mein Konto</h1>
        <p className="text-slate text-lead mt-4 max-w-[58ch]">
          {user.name} — {ROLE_LABEL[user.role]}. {ROLE_DESCRIPTION[user.role]}
        </p>

        {(erstanmeldung || user.mustChangePassword) && (
          <p className="surface bg-amber text-deep px-5 py-4 font-semibold mt-6 max-w-xl">
            Du bist noch mit dem vergebenen Startpasswort unterwegs. Wähle ein eigenes — erst
            danach öffnen sich Kalender und die übrigen Bereiche.
          </p>
        )}

        {!user.totpEnabled && (
          <p className="notice notice-warn mt-4 max-w-xl">
            Dein Konto hat noch keine Zwei-Faktor-Authentifizierung. Wir empfehlen, sie
            einzurichten — weiter unten auf dieser Seite.
          </p>
        )}

        <div className="grid gap-5 lg:grid-cols-2 mt-10 items-start">
          <div className="surface bg-paper p-6 md:p-7">
            <h2 className="font-display text-xl font-bold mb-5">Passwort ändern</h2>
            <ChangePasswordForm />
          </div>

          <div className="surface bg-paper p-6 md:p-7">
            <h2 className="font-display text-xl font-bold mb-5">Zwei-Faktor-Authentifizierung</h2>
            <MfaSetup enabled={user.totpEnabled} />
            {user.totpEnabled && trusted > 0 && (
              <form action={forgetBrowsersAction} className="mt-6 pt-5 border-t border-deep/12">
                <p className="text-fine text-slate">
                  {trusted === 1 ? "Ein Browser ist" : `${trusted} Browser sind`} gemerkt und
                  verlangen bei der Anmeldung nur das Passwort, jeweils 30 Tage lang.
                </p>
                <button type="submit" className="btn btn-outline py-2.5 px-4 text-fine mt-3">
                  Gemerkte Browser vergessen
                </button>
              </form>
            )}
          </div>

          <div className="surface bg-paper p-6 md:p-7 lg:col-span-2">
            <h2 className="font-display text-xl font-bold mb-5">Kalender abonnieren</h2>
            <CalendarSubscription url={feedUrl} />
          </div>
        </div>
      </div>
    </section>
  );
}
