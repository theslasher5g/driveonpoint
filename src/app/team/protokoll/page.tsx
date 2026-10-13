import Link from "next/link";
import { and, count, desc, gte, like, lte, or } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/guard";
import { ROLE_LABEL } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { auditLog, lessonTypes, staff } from "@/lib/db/schema";
import {
  addDays,
  formatDayLong,
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
  "buchung.selbst-verschoben": "Termin von der Kundschaft selbst verschoben",
  "kurs.abgesagt": "Ganzer Kurstermin abgesagt",
  "kurs.verschoben": "Ganzer Kurstermin verschoben",
  "bewertung.angefragt": "Um eine Google-Bewertung gebeten",
  "warteliste.eingetragen": "Auf die Warteliste eines Kurses eingetragen",
  "warteliste.ausgetragen": "Von einer Warteliste gestrichen",
  "buchung.manuell-erstellt": "Termin von Hand erfasst",
  "verfuegbarkeit.regel-erstellt": "Wöchentliche Verfügbarkeit eingetragen",
  "verfuegbarkeit.datum-erstellt": "Verfügbarkeit für ein Datum eingetragen",
  "verfuegbarkeit.regel-geloescht": "Wiederkehrende Verfügbarkeit gelöscht",
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

/**
 * Arten zum Filtern, nach dem Präfix der Aktion. So lässt sich etwa nur
 * nachsehen, wer sich angemeldet hat, ohne durch hunderte Buchungen zu
 * blättern.
 */
const KINDS = {
  termine: { label: "Termine", prefixes: ["buchung.", "kurs.", "erinnerung.", "warteliste.", "bewertung.", "aufbewahrung."] },
  anmeldungen: { label: "Anmeldungen", prefixes: ["anmeldung.", "abmeldung"] },
  verfuegbarkeit: { label: "Verfügbarkeit", prefixes: ["verfuegbarkeit."] },
  konten: { label: "Konten", prefixes: ["mitarbeiter.", "passwort.", "konto.", "kalenderlink."] },
  angebot: { label: "Preise und Aktionen", prefixes: ["preis.", "aktion."] },
} as const;
type Kind = keyof typeof KINDS;

const PAGE_SIZE = 50;

type Params = Promise<{ von?: string; bis?: string; art?: string; seite?: string }>;

export default async function ProtokollPage({ searchParams }: { searchParams: Params }) {
  await requirePermission("protokoll.ansehen");
  const params = await searchParams;

  const today = todayInZurich();
  const von = /^\d{4}-\d{2}-\d{2}$/.test(params.von ?? "") ? params.von! : addDays(today, -30);
  const bis = /^\d{4}-\d{2}-\d{2}$/.test(params.bis ?? "") ? params.bis! : today;
  // Object.hasOwn statt "in": sonst gälte auch ?art=toString als Art.
  const art = params.art && Object.hasOwn(KINDS, params.art) ? (params.art as Kind) : null;
  const seite = Math.min(1000, Math.max(1, Number.parseInt(params.seite ?? "1", 10) || 1));

  const from = zurichToInstant(von, "00:00");
  const until = zurichToInstant(bis, "23:59");
  const where = and(
    gte(auditLog.occurredAt, from),
    lte(auditLog.occurredAt, until),
    art ? or(...KINDS[art].prefixes.map((prefix) => like(auditLog.action, `${prefix}%`))) : undefined,
  );

  const [rows, total, people, offerings] = await Promise.all([
    db
      .select()
      .from(auditLog)
      .where(where)
      .orderBy(desc(auditLog.occurredAt))
      .limit(PAGE_SIZE)
      .offset((seite - 1) * PAGE_SIZE),
    db
      .select({ total: count() })
      .from(auditLog)
      .where(where)
      .then((result) => result[0]?.total ?? 0),
    db.select({ id: staff.id, name: staff.name }).from(staff),
    db.select({ id: lessonTypes.id, name: lessonTypes.name }).from(lessonTypes),
  ]);

  const names = new Map<string, string>([
    ...people.map((person) => [person.id, person.name] as const),
    ...offerings.map((offering) => [offering.id, offering.name] as const),
  ]);

  // Nach Tagen gruppiert, wie im Kalender: der Tag steht einmal oben statt
  // in jeder Zeile.
  const byDay = new Map<string, typeof rows>();
  for (const row of rows) {
    const day = zurichDay(row.occurredAt);
    byDay.set(day, [...(byDay.get(day) ?? []), row]);
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (changes: { art?: Kind | null; seite?: number }) => {
    const query = new URLSearchParams({ von, bis });
    const kind = changes.art === undefined ? art : changes.art;
    if (kind) query.set("art", kind);
    const page = changes.seite ?? 1;
    if (page > 1) query.set("seite", String(page));
    return `/team/protokoll?${query}`;
  };
  const firstShown = total === 0 ? 0 : (seite - 1) * PAGE_SIZE + 1;
  const lastShown = Math.min(total, seite * PAGE_SIZE);

  return (
    <section className="shell py-10 md:py-14">
      <div className="lane max-w-5xl">
        <h1 className="text-title">Protokoll</h1>
        <p className="text-slate mt-2 max-w-[62ch]">
          Wer was geändert hat: Anmeldungen, Preise, Termine, Konten.
        </p>

        <form method="get" className="mt-7 flex flex-wrap items-end gap-3">
          {art && <input type="hidden" name="art" value={art} />}
          <div>
            <label className="field-label" htmlFor="von">
              Von
            </label>
            <input id="von" name="von" type="date" className="field nums py-2.5" defaultValue={von} />
          </div>
          <div>
            <label className="field-label" htmlFor="bis">
              Bis
            </label>
            <input id="bis" name="bis" type="date" className="field nums py-2.5" defaultValue={bis} />
          </div>
          <button type="submit" className="btn btn-outline py-2.5">
            Zeitraum anzeigen
          </button>
        </form>

        <nav aria-label="Nach Art filtern" className="mt-5 flex flex-wrap gap-2">
          {[null, ...(Object.keys(KINDS) as Kind[])].map((kind) => {
            const active = kind === art;
            return (
              <Link
                key={kind ?? "alle"}
                href={href({ art: kind })}
                aria-current={active ? "true" : undefined}
                className={`rounded-full px-3.5 py-1.5 text-fine font-semibold border transition-colors ${
                  active
                    ? "bg-deep text-paper border-deep"
                    : "bg-paper border-rule text-slate hover:text-deep hover:border-deep/40"
                }`}
              >
                {kind ? KINDS[kind].label : "Alles"}
              </Link>
            );
          })}
        </nav>

        {rows.length === 0 ? (
          <div className="surface bg-paper px-5 py-8 text-center mt-8">
            <p className="font-bold">In diesem Zeitraum ist nichts protokolliert.</p>
            <p className="text-slate text-fine mt-1">
              {art ? "Wähle eine andere Art oder einen längeren Zeitraum." : "Wähle einen längeren Zeitraum."}
            </p>
          </div>
        ) : (
          <>
            <p className="text-fine text-slate mt-8 mb-3">
              Einträge <span className="nums">{firstShown}–{lastShown}</span> von{" "}
              <span className="nums">{total}</span>, die neuesten zuerst.
            </p>
            <div className="grid gap-4">
              {[...byDay.entries()].map(([day, entries]) => (
                <section key={day} className="surface bg-paper" aria-label={formatDayLong(day)}>
                  <h2 className="text-fine font-bold px-5 pt-3.5 pb-2.5 border-b border-rule">
                    {day === today ? "Heute" : formatDayLong(day)}
                  </h2>
                  <ul className="divide-y divide-rule">
                    {entries.map((row) => {
                      const detail = describeDetail(row.detail, names);
                      return (
                        <li key={row.id} className="px-5 py-2.5 grid grid-cols-[3.25rem_minmax(0,1fr)] gap-x-4 items-baseline">
                          <p className="nums text-fine text-slate">{zurichTime(row.occurredAt)}</p>
                          <div className="min-w-0 text-fine">
                            <p>
                              <span className="font-bold">{row.actorLabel ?? "Unbekannt"}</span>{" "}
                              <span className="text-slate">{ACTION_LABELS[row.action] ?? row.action}</span>
                            </p>
                            {detail && <p className="text-[0.78rem] text-slate mt-0.5 break-words">{detail}</p>}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>

            {pages > 1 && (
              <nav aria-label="Seiten" className="mt-6 flex items-center justify-between gap-4">
                {seite > 1 ? (
                  <Link href={href({ seite: seite - 1 })} className="btn btn-outline py-2 px-3.5 text-fine">
                    Neuere
                  </Link>
                ) : (
                  <span />
                )}
                <p className="text-fine text-slate nums">
                  Seite {seite} von {pages}
                </p>
                {seite < pages ? (
                  <Link href={href({ seite: seite + 1 })} className="btn btn-outline py-2 px-3.5 text-fine">
                    Ältere
                  </Link>
                ) : (
                  <span />
                )}
              </nav>
            )}
          </>
        )}
      </div>
    </section>
  );
}
