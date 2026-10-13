import type { Metadata } from "next";
import Link from "next/link";
import { NewPasswordForm } from "@/components/password-reset-forms";
import { resetTarget } from "@/lib/auth/password-reset";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Neues Passwort",
  robots: { index: false, follow: false, nocache: true },
  // Der Link enthält das Token; es soll in keinem Referrer auftauchen.
  referrer: "no-referrer",
};

export default async function PasswortNeuPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const target = await resetTarget(token);

  return (
    <section className="shell py-14 md:py-24">
      <div className="lane max-w-md">
        <h1 className="text-title">Neues Passwort</h1>
        {target ? (
          <>
            <p className="text-slate mt-4 mb-9">
              Hallo {target.name.split(" ")[0]}, leg dein neues Passwort fest. Danach meldest du dich
              damit an; alle anderen Geräte werden abgemeldet.
            </p>
            <NewPasswordForm token={token} />
          </>
        ) : (
          <>
            <p role="alert" className="notice notice-error mt-6">
              Dieser Link ist abgelaufen oder wurde schon verwendet.
            </p>
            <p className="text-slate mt-4">Ein Link gilt 60 Minuten und nur einmal. Fordere einfach einen neuen an.</p>
            <Link href="/team/passwort-vergessen" className="btn btn-primary w-full mt-7">
              Neuen Link anfordern
            </Link>
          </>
        )}
      </div>
    </section>
  );
}
