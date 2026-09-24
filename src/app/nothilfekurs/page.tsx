import type { Metadata } from "next";
import Link from "next/link";
import { OfferBookingCard } from "@/components/offer-booking-card";
import { PageHeader, Section } from "@/components/page-header";
import { PriceTable } from "@/components/price-table";
import { site } from "@/lib/site";

export const dynamic = "force-dynamic";

const offer = site.offers.nothilfekurs;

export const metadata: Metadata = {
  title: `Nothilfekurs in ${site.contact.city}`,
  description: `${offer.lead} Kursort ${site.contact.city}.`,
  alternates: { canonical: "/nothilfekurs" },
};

export default function NothilfekursPage() {
  return (
    <>
      <PageHeader
        title={`Nothilfekurs in ${site.contact.city}`}
        lead={offer.lead}
        aside={<OfferBookingCard slug="nothilfekurs" />}
      />

      <Section title="Was geübt wird" tone="paper">
        <div className="grid gap-x-10 gap-y-6 sm:grid-cols-2 max-w-4xl">
          {[
            ["Unfallstelle sichern", "Warnblinker, Weste, Pannendreieck, und wie du dich dabei selbst schützt."],
            ["Notruf richtig absetzen", "144, 117, 118. Welche Angaben die Leitstelle braucht und in welcher Reihenfolge."],
            ["Bewusstlose Person", "Atmung prüfen, stabile Seitenlage, Atemwege freihalten."],
            ["Wiederbelebung", "Herzdruckmassage und Beatmung an der Puppe, bis der Ablauf sitzt."],
            ["Defibrillator", "Wie ein AED funktioniert. Das Gerät sagt dir jeden Schritt an."],
            ["Blutungen und Schock", "Druckverband anlegen, Lagerung, Wärmeerhalt bis der Rettungsdienst da ist."],
          ].map(([title, body]) => (
            <div key={title}>
              <h3 className="text-base">{title}</h3>
              <p className="text-slate mt-1">{body}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Organisatorisches">
        {/* Zweispaltig wie „Was geübt wird“ darüber: sechs kurze Antworten
            untereinander ergaben eine halbe Bildschirmhöhe Leerraum daneben. */}
        <ul className="grid gap-x-10 gap-y-4 sm:grid-cols-2">
          {[
            ["Ab welchem Alter?", `Ab ${offer.minAge}. Der Ausweis wird erst beim Gesuch für den Lernfahrausweis gebraucht.`],
            ["Prüfung?", "Keine. Wer durchgehend anwesend ist und mitmacht, bekommt den Ausweis am Ende des Kurses."],
            ["Wie lange gültig?", "Sechs Jahre. Danach musst du ihn erneuern, falls du ihn noch brauchst."],
            ["Kleidung", "Bequem. Es wird auf dem Boden gearbeitet."],
            ["Anerkennung", "Der Ausweis wird in der ganzen Schweiz anerkannt, auch bei anderen Fahrschulen."],
            ["Abwesenheit", "Verpasst du einen Teil, musst du ihn nachholen. Die Stundenzahl ist vorgeschrieben."],
          ].map(([q, a]) => (
            <li key={q}>
              <h3 className="text-base">{q}</h3>
              <p className="text-slate text-fine mt-1">{a}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Preis" tone="paper">
        <div className="max-w-2xl">
          <PriceTable onlySlug="nothilfekurs" />
          <p className="text-fine text-slate mt-5">
            Inklusive Kursunterlagen und Ausweis. Zahlbar vor Kursbeginn. Für die Ermässigung
            bring bitte den Lehrlings-, Studenten- oder IV-Ausweis mit.
          </p>
          <Link href="/buchen?angebot=nothilfekurs" className="btn btn-primary mt-7">
            Zu den Kursdaten
          </Link>
        </div>
      </Section>
    </>
  );
}
