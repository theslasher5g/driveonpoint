import { requireUser } from "@/lib/auth/guard";
import { googleConfigured } from "@/lib/auth/google";
import { ROLE_DESCRIPTION, ROLE_LABEL } from "@/lib/auth/permissions";
import { env } from "@/lib/env";
import { CalendarSubscription } from "@/components/calendar-subscription";
import { ChangePasswordForm } from "@/components/change-password-form";
import { GoogleAccount } from "@/components/google-account";

export const dynamic = "force-dynamic";

const REASONS: Record<string, string> = {
  "ohne-google":
    "Die Passwortanmeldung lässt sich erst abschalten, wenn ein Google-Konto verknüpft ist — sonst kämst du nicht mehr herein.",
  "letzter-weg":
    "Die Google-Verknüpfung lässt sich nicht lösen, solange sie der einzige Weg in dieses Konto ist.",
};

export default async function KontoPage({
  searchParams,
}: {
  searchParams: Promise<{ erstanmeldung?: string; fehler?: string }>;
}) {
  const user = await requireUser();
  const { erstanmeldung, fehler } = await searchParams;

  const feedUrl = `${env.appUrl}/api/kalender/${user.calendarToken}.ics`;
  const message = fehler ? REASONS[fehler] : undefined;

  return (
    <section className="shell py-10 md:py-14">
      <div className="lane">
        <h1 className="text-title">Mein Konto</h1>
        <p className="text-slate mt-4">
          {user.name} — {ROLE_LABEL[user.role]}. {ROLE_DESCRIPTION[user.role]}
        </p>

        {message && (
          <p
            role="alert"
            className="surface bg-paper border-l-4 border-[#B3261E] px-5 py-4 font-semibold mt-7 max-w-xl"
          >
            {message}
          </p>
        )}

        {(erstanmeldung || user.mustChangePassword) && user.passwordLoginEnabled && (
          <p className="surface bg-amber text-deep px-5 py-4 font-semibold mt-7 max-w-xl">
            Du bist noch mit dem vergebenen Startpasswort unterwegs. Wähle jetzt ein eigenes —
            oder schalte die Passwortanmeldung ab, wenn du nur noch Google nutzt.
          </p>
        )}

        <div className="grid gap-12 lg:grid-cols-2 mt-10">
          <div>
            <h2 className="text-section mb-6">Anmeldung über Google</h2>
            <GoogleAccount
              linked={Boolean(user.googleSub)}
              passwordLoginEnabled={user.passwordLoginEnabled}
              configured={googleConfigured()}
            />

            <h2 className="text-section mb-6 mt-12">Passwort ändern</h2>
            {user.passwordLoginEnabled ? (
              <ChangePasswordForm />
            ) : (
              <p className="text-slate max-w-md">
                Die Passwortanmeldung ist für dein Konto abgeschaltet. Schalte sie oben wieder
                ein, wenn du ein Passwort setzen möchtest.
              </p>
            )}
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
