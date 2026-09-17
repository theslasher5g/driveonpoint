import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { currentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Anmeldung",
  robots: { index: false, follow: false, nocache: true },
};

export default async function AnmeldenPage() {
  if (await currentUser()) redirect("/team");

  return (
    <section className="shell py-14 md:py-24">
      <div className="lane max-w-md">
        <h1 className="text-title">Team-Anmeldung</h1>
        <p className="text-slate mt-4 mb-9">
          Dieser Bereich ist für Mitarbeitende. Kundinnen und Kunden buchen ohne Konto.
        </p>
        <LoginForm />
      </div>
    </section>
  );
}
