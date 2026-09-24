import { and, desc, gte, lte } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/guard";
import { ROLE_LABEL } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { auditLog, lessonTypes, staff } from "@/lib/db/schema";
import {
  addDays,
  formatPrice,
  todayInZurich,
  weekdayName,
  zurichDay,
  zurichTime,
  zurichToInstant,
} from "@/lib/time";

export const dynamic = "force-dynamic";

/** Menschenlesbare Beschriftung je Protokoll-Eintrag. Fehlt einer, wird der Rohwert gezeigt. */
const ACTION_LABELS: Record<string, string> = {
  "buchung.erstellt": "Online-Buchung eingegangen, wartet auf Bestätigung",
  "buchung.bestaetigt": "Online-Buchung per Mail bestätigt",
  "buchung.verfallen": "Unbestätigte Buchungen verfallen",
  "buchung.nicht-erschienen": "Als nicht erschienen markiert",
  "buchung.erschienen": "Markierung „nicht erschienen“ zurückgenommen",
  "erinnerung.versendet": "Erinnerungen vor dem Termin verschickt",
  "mitarbeiter.geloescht": "Konto gelöscht",
  "aufbewahrung.geloescht": "Kundendaten nach Ablauf der Frist gelöscht",
  "buchung.begrenzt": "Buchung wegen zu vieler Versuche abgewiesen",
  "buchung.abgesagt": "Termin von Kundschaft abgesagt",
  "buchung.abgesagt-intern": "Termin von der Fahrschule abgesagt",
  "buchung.verschoben": "Termin verschoben",
  "kurs.abgesagt": "Ganzer Kurstermin abgesagt",
  "warteliste.eingetragen": "Auf die Warteliste eines Kurses eingetragen",
  "warteliste.ausgetragen": "Von einer Warteliste gestrichen",
  "buchung.manuell-erstellt": "Termin von Hand erfasst",
  "verfuegbarkeit.regel-erstellt": "Wöchentliche Verfügbarkeit eingetragen",
  "verfuegbarkeit.regel-geloescht": "Wöchentliche Verfügbarkeit gelöscht",
  "verfuegbarkeit.ausnahme-erstellt": "Ausnahme eingetragen",
  "verfuegbarkeit.ausnahme-geloescht": "Ausnahme gelöscht",
  "anmeldung.mfa-angefordert": "Anmeldung — Bestätigungscode angefordert",
  "anmeldung.erfolgreich": "Anmeldung erfolgreich",
  "anmeldung.gesperrt": "Adresse wegen Fehlversuchen gesperrt",
  "anmeldung.konto-unter-beschuss": "Konto wegen Fehlversuchen gesperrt",
  "anmeldung.mfa-gesperrt": "Bestätigungscode wegen Fehlversuchen gesperrt",
  "anmeldung.wiederherstellungscode-verwendet": "Anmeldung mit Wiederherstellungscode",
  "mitarbeiter.angelegt": "Konto angelegt",
  "mitarbeiter.rolle-geaendert": "Rolle geändert",
  "mitarbeiter.umgeschaltet": "Konto aktiviert/gesperrt",
  "mitarbeiter.passwort-zurueckgesetzt": "Passwort zurückgesetzt",
  "mitarbeiter.angebote-gesetzt": "Angebote einer Person geändert",
  "mitarbeiter.mfa-zurueckgesetzt": "MFA einer Person zurückgesetzt",
  "passwort.geaendert": "Eigenes Passwort geändert",
  "kalenderlink.erneuert": "Kalenderlink erneuert",
  "konto.mfa-eingerichtet": "MFA eingerichtet",
  "konto.mfa-deaktiviert": "MFA deaktiviert",
  "konto.mfa-codes-erneuert": "Wiederherstellungscodes erneuert",
  abmeldung: "Abgemeldet",
  "preis.geaendert": "Preis geändert",
  "aktion.erstellt": "Rabattaktion erstellt",
  "aktion.umgeschaltet": "Rabattaktion ein-/ausgeschaltet",
  "aktion.geloescht": "Rabattaktion gelöscht",
};

const DETAIL_LABELS: Record<string, string> = {
  id: "Konto",
  neu: "Konto",
  fuer: "Für",
  staffId: "Konto",
  rolle: "Rolle",
  aktiv: "Aktiv",
  lektionsart: "Angebot",
  angebot: "Angebot",
  art: "Art",
  tag: "Tag",
  bis: "bis",
  von: "von",
  auf: "auf",
  wochentag: "Wochentag",
  referenz: "Referenz",
  referenzen: "Referenzen",
  anzahl: "Anzahl",
  preisRappen: "Preis",
  name: "Name",
  versuche: "Versuche",
  weg: "Weg",
  geloescht: "Gelöscht",
  uebergeben: "Übergeben",
  abgesagt: "Abgesagt",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Kennungen werden zu Namen aufgelöst — eine Zeile wie „neu: d2e2a591-…“
 * sagte niemandem etwas. Eine Kennung ohne Treffer (gelöschtes Konto,
 * Kennung einer Regel oder Aktion) fällt weg statt als Zeichensalat stehen
 * zu bleiben.
 */
function describeDetail(
  detail: Record<string, unknown> | null,
  names: Map<string, string>,
): string | null {
  if (!detail) return null;
  const parts: string[] = [];

  for (const [key, raw] of Object.entries(detail)) {
    if (raw === undefined || raw === null || raw === "") continue;
    let value: string;

    if (typeof raw === "string" && UUID.test(raw)) {
      const resolved = names.get(raw);
      if (!resolved) continue;
      value = resolved;
    } else if (typeof raw === "boolean") {
      value = raw ? "ja" : "nein";
    } else if (key === "rolle" && typeof raw === "string" && raw in ROLE_LABEL) {
      value = ROLE_LABEL[raw as keyof typeof ROLE_LABEL];
    } else if (key === "wochentag" && typeof raw === "number") {
      value = weekdayName(raw);
    } else if (key === "preisRappen" && typeof raw === "number") {
      value = `CHF ${formatPrice(raw)}`;
    } else if (key === "ip" || key === "adresse") {
      // Nur zum Abgleich in der Datenbank; als Prüfsumme sagt sie hier nichts.
      continue;
    } else {
      value = String(raw);
    }

    parts.push(`${DETAIL_LABELS[key] ?? key}: ${value}`);
  }

  return parts.length > 0 ? parts.join(" · ") : null;
}

type Params = Promise<{ von?: string; bis?: string }>;

export default async function ProtokollPage({ searchParams }: { searchParams: Params }) {
  await requirePermission("protokoll.ansehen");
  const params = await searchParams;

  const today = todayInZurich();
  const von = /^\d{4}-\d{2}-\d{2}$/.test(params.von ?? "") ? params.von! : addDays(today, -30);
  const bis = /^\d{4}-\d{2}-\d{2}$/.test(params.bis ?? "") ? params.bis! : today;

  const from = zurichToInstant(von, "00:00");
  const until = zurichToInstant(bis, "23:59");

  const [rows, people, offerings] = await Promise.all([
    db
      .select()
      .from(auditLog)
      .where(and(gte(auditLog.occurredAt, from), lte(auditLog.occurredAt, until)))
      .orderBy(desc(auditLog.occurredAt))
      .limit(300),
    db.select({ id: staff.id, name: staff.name }).from(staff),
    db.select({ id: lessonTypes.id, name: lessonTypes.name }).from(lessonTypes),
  ]);

  const names = new Map<string, string>([
    ...people.map((person) => [person.id, person.name] as const),
    ...offerings.map((offering) => [offering.id, offering.name] as const),
  ]);

  return (
    <section className="shell py-10 md:py-14">
      <div className="lane">
        <h1 className="text-title">Protokoll</h1>
        <p className="text-slate text-lead mt-4 max-w-[62ch]">
          Wer was geändert hat — Anmeldungen, Preise, Termine, Konten.
        </p>

        <form method="get" className="mt-8 flex flex-wrap items-end gap-4">
          <div>
            <label className="field-label" htmlFor="von">
              Von
            </label>
            <input id="von" name="von" type="date" className="field nums" defaultValue={von} />
          </div>
          <div>
            <label className="field-label" htmlFor="bis">
              Bis
            </label>
            <input id="bis" name="bis" type="date" className="field nums" defaultValue={bis} />
          </div>
          <button type="submit" className="btn btn-outline">
            Zeitraum anzeigen
          </button>
        </form>

        {rows.length === 0 ? (
          <p className="text-slate mt-10">In diesem Zeitraum ist nichts protokolliert.</p>
        ) : (
          <div className="border-t border-deep/15 mt-10">
            {rows.map((row) => {
              const detail = describeDetail(row.detail, names);
              return (
                <div
                  key={row.id}
                  className="border-b border-deep/15 py-3 grid gap-x-6 gap-y-0.5 sm:grid-cols-[10rem_1fr] items-baseline"
                >
                  <p className="nums text-fine font-bold">
                    {zurichTime(row.occurredAt)}
                    <span className="block font-normal text-slate">
                      {zurichDay(row.occurredAt)}
                    </span>
                  </p>
                  <div className="min-w-0">
                    <p className="text-fine">
                      <span className="font-bold">{row.actorLabel ?? "Unbekannt"}</span>
                      {" — "}
                      {ACTION_LABELS[row.action] ?? row.action}
                    </p>
                    {detail && <p className="text-[0.72rem] text-slate mt-0.5">{detail}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {rows.length === 300 && (
          <p className="text-fine text-slate mt-6">
            Zeigt die letzten 300 Einträge im gewählten Zeitraum. Für ältere Einträge den Zeitraum
            eingrenzen.
          </p>
        )}
      </div>
    </section>
  );
}
