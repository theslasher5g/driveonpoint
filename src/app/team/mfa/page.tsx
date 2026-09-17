import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { readMfaChallenge } from "@/lib/auth/mfa-session";
import { MfaChallengeForm } from "@/components/mfa-challenge-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Bestätigungscode",
  robots: { index: false, follow: false, nocache: true },
};

export default async function MfaPage() {
  const pending = await readMfaChallenge();
  if (!pending) redirect("/team/anmelden?fehler=mfa-abgelaufen");

  return (
    <section className="shell py-14 md:py-24">
      <div className="lane max-w-md">
        <h1 className="text-title">Bestätigungscode</h1>
        <p className="text-slate mt-4 mb-9">
          Öffne deine Authenticator-App und gib den sechsstelligen Code ein. Keinen Zugriff mehr
          aufs Gerät? Verwende einen deiner Wiederherstellungscodes.
        </p>
        <MfaChallengeForm />
      </div>
    </section>
  );
}
