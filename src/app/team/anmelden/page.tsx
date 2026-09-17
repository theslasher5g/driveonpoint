import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { currentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Anmeldung",
  robots: { index: false, follow: false, nocache: true },
};

const REASONS: Record<string, string> = {
  "zu-viele-versuche": "Zu viele Versuche. Bitte in einer Viertelstunde erneut.",
  gesperrt: "Von dieser Verbindung kamen zu viele Anfragen. Bitte später erneut.",
  "mfa-abgelaufen": "Die Anmeldung ist abgelaufen. Bitte melde dich erneut an.",
};

export default async function AnmeldenPage({
  searchParams,
}: {
  searchParams: Promise<{ fehler?: string }>;
}) {
  if (await currentUser()) redirect("/team");

  const { fehler } = await searchParams;
  const message = fehler ? REASONS[fehler] : undefined;

  return (
    <section className="shell py-14 md:py-24">
      <div className="lane max-w-md">
        <h1 className="text-title">Team-Anmeldung</h1>
        <p className="text-slate mt-4 mb-9">
          Dieser Bereich ist für Mitarbeitende. Kundinnen und Kunden buchen ohne Konto.
        </p>

        {message && (
          <p role="alert" className="notice notice-error mb-6">
            {message}
          </p>
        )}

        <LoginForm />
      </div>
    </section>
  );
}
