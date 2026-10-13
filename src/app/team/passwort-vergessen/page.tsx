import type { Metadata } from "next";
import { RequestResetForm } from "@/components/password-reset-forms";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Passwort vergessen",
  robots: { index: false, follow: false, nocache: true },
};

export default function PasswortVergessenPage() {
  return (
    <section className="shell py-14 md:py-24">
      <div className="lane max-w-md">
        <h1 className="text-title">Passwort vergessen</h1>
        <p className="text-slate mt-4 mb-9">
          Gib die Mailadresse deines Kontos ein. Du bekommst einen Link, mit dem du ein neues
          Passwort festlegst.
        </p>
        <RequestResetForm />
      </div>
    </section>
  );
}
