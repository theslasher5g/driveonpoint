import Link from "next/link";

// Pro Anfrage gerendert, damit Next seine Skripte mit der Einmalkennung
// der Inhaltsrichtlinie versehen kann. Siehe src/middleware.ts.
export const dynamic = "force-dynamic";

export default function NotFound() {
  return (
    <section className="shell py-16 md:py-24">
      <div className="lane lane-draws">
        <h1 className="text-title max-w-[16ch]">Diese Seite gibt es nicht.</h1>
        <p className="text-lead text-slate mt-6 max-w-[50ch]">
          Vielleicht ein alter Link oder ein Tippfehler in der Adresse. Von hier kommst du weiter.
        </p>
        <div className="flex flex-wrap gap-3 mt-9">
          <Link href="/" className="btn btn-primary">
            Zur Startseite
          </Link>
          <Link href="/buchen" className="btn btn-outline">
            Termin buchen
          </Link>
          <Link href="/kontakt" className="btn btn-outline">
            Kontakt
          </Link>
        </div>
      </div>
    </section>
  );
}
