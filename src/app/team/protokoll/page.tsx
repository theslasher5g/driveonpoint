import { and, desc, gte, lte } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/db/schema";
import { addDays, todayInZurich, zurichDay, zurichTime, zurichToInstant } from "@/lib/time";

export const dynamic = "force-dynamic";

/** Menschenlesbare Beschriftung je Protokoll-Eintrag. Fehlt einer, wird der Rohwert gezeigt. */
const ACTION_LABELS: Record<string, string> = {
  "buchung.begrenzt": "Buchung wegen zu vieler Versuche abgewiesen",
  "buchung.abgesagt": "Termin von Kundschaft abgesagt",
  "buchung.abgesagt-intern": "Termin von der Fahrschule abgesagt",
  "buchung.verschoben": "Termin verschoben",
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

function describeDetail(detail: Record<string, unknown> | null): string | null {
  if (!detail) return null;
  const parts = Object.entries(detail)
    .filter(([key]) => key !== "id" && key !== "fuer")
    .map(([key, value]) => `${key}: ${String(value)}`);
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

  const rows = await db
    .select()
    .from(auditLog)
    .where(and(gte(auditLog.occurredAt, from), lte(auditLog.occurredAt, until)))
    .orderBy(desc(auditLog.occurredAt))
    .limit(300);

  return (
    <section className="shell py-10 md:py-14">
      <div className="lane">
        <h1 className="text-title">Protokoll</h1>
        <p className="text-slate text-lead mt-4 max-w-[62ch]">
          Wer was geändert hat — Anmeldungen, Preise, Termine, Konten. Der einzige Weg,
          nachzuvollziehen, was bei einem Vorfall passiert ist.
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
              const detail = describeDetail(row.detail);
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
