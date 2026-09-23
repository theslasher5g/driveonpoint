import { accountingReport, bookedYears } from "@/lib/accounting";
import { requirePermission } from "@/lib/auth/guard";
import { formatPrice, monthName, todayInZurich } from "@/lib/time";

export const dynamic = "force-dynamic";

type Params = Promise<{ jahr?: string; monat?: string }>;

export default async function BuchhaltungPage({ searchParams }: { searchParams: Params }) {
  await requirePermission("buchhaltung.ansehen");
  const params = await searchParams;

  const thisYear = Number(todayInZurich().slice(0, 4));
  const years = await bookedYears();

  const year = years.includes(Number(params.jahr)) ? Number(params.jahr) : thisYear;
  const monthRaw = Number(params.monat);
  const month = Number.isInteger(monthRaw) && monthRaw >= 1 && monthRaw <= 12 ? monthRaw : undefined;

  const report = await accountingReport(year, month);
  const label = month ? `${monthName(month)} ${year}` : String(year);
  const query = `jahr=${year}${month ? `&monat=${month}` : ""}`;
  const csvHref = `/team/buchhaltung/export?${query}`;
  const pdfHref = `/team/buchhaltung/export/pdf?${query}`;

  return (
    <section className="shell py-10 md:py-14">
      <div className="lane">
        <span className="block w-10 h-[3px] rounded-full bg-signal mb-5" aria-hidden="true" />
        <h1 className="font-display text-3xl md:text-4xl font-bold">Buchhaltung</h1>
        <p className="text-slate text-lead mt-4 max-w-[62ch]">
          Auszüge für die Steuererklärung: Datum, Angebot, Betrag. Ohne Personendaten.
        </p>

        {/* Zeitraum wählen */}
        <form method="get" className="mt-8 flex flex-wrap items-end gap-4">
          <div>
            <label className="field-label" htmlFor="jahr">
              Jahr
            </label>
            <select id="jahr" name="jahr" className="field nums" defaultValue={year}>
              {years.map((entry) => (
                <option key={entry} value={entry}>
                  {entry}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor="monat">
              Monat
            </label>
            <select id="monat" name="monat" className="field" defaultValue={month ?? ""}>
              <option value="">Ganzes Jahr</option>
              {Array.from({ length: 12 }, (_, index) => index + 1).map((entry) => (
                <option key={entry} value={entry}>
                  {monthName(entry)}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn btn-outline sm:min-w-60">
            Anzeigen
          </button>
          <a href={pdfHref} className="btn btn-primary sm:min-w-60" download>
            Als PDF herunterladen
          </a>
          <a href={csvHref} className="btn btn-outline sm:min-w-60" download>
            Als CSV herunterladen
          </a>
        </form>

        {/* Kennzahlen */}
        <dl className="grid gap-px bg-deep/12 border border-deep/12 rounded-[var(--radius-surface)] overflow-hidden grid-cols-2 lg:grid-cols-4 mt-10">
          <Tile label={`Umsatz ${label}`} value={`CHF ${formatPrice(report.totalRappen)}`} strong />
          <Tile label="Erbrachte Termine" value={String(report.rows.length)} />
          <Tile
            label="Noch ausstehend"
            value={report.openCount === 0 ? "—" : `CHF ${formatPrice(report.openRappen)}`}
            hint={report.openCount === 0 ? undefined : `${report.openCount} gebucht`}
          />
          <Tile
            label="Kurzfristige Absagen"
            value={
              report.lateCancellations.length === 0
                ? "—"
                : `CHF ${formatPrice(report.lateCancelledRappen)}`
            }
            hint={
              report.lateCancellations.length === 0
                ? undefined
                : `${report.lateCancellations.length} Stück, nicht im Umsatz`
            }
          />
        </dl>

        <p className="text-fine text-slate mt-6 max-w-[68ch]">
          Leistungsjournal, keine Zahlungsübersicht — gehört für die Steuererklärung mit den
          tatsächlichen Zahlungseingängen abgeglichen. Belege zehn Jahre aufbewahren (Art. 958f
          OR); die Website selbst löscht Personendaten bereits nach 30 Tagen.
        </p>

        {/* Monate */}
        {!month && (
          <div className="mt-12">
            <h2 className="text-section mb-4">Nach Monat</h2>
            {report.byMonth.length === 0 ? (
              <p className="text-slate">In diesem Jahr hat noch kein Termin stattgefunden.</p>
            ) : (
              <div className="surface bg-paper max-w-2xl">
                {report.byMonth.map((entry) => (
                  <div
                    key={entry.month}
                    className="border-b border-deep/10 px-5 py-3.5 flex items-baseline justify-between gap-6"
                  >
                    <a
                      href={`/team/buchhaltung?jahr=${year}&monat=${entry.month}`}
                      className="font-semibold underline-offset-4 hover:underline"
                    >
                      {monthName(entry.month)}
                    </a>
                    <span className="nums text-slate text-fine ml-auto">
                      {entry.count} {entry.count === 1 ? "Termin" : "Termine"}
                    </span>
                    <span className="nums font-bold w-32 text-right">
                      CHF {formatPrice(entry.totalRappen)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Angebote */}
        <div className="mt-12">
          <h2 className="text-section mb-4">Nach Angebot</h2>
          {report.byLessonType.length === 0 ? (
            <p className="text-slate">Keine erbrachten Termine im gewählten Zeitraum.</p>
          ) : (
            <div className="surface bg-paper max-w-2xl">
              {report.byLessonType.map((entry) => (
                <div
                  key={entry.name}
                  className="border-b border-deep/10 px-5 py-3.5 flex items-baseline justify-between gap-6"
                >
                  <span className="font-semibold">{entry.name}</span>
                  <span className="nums text-slate text-fine ml-auto">
                    {entry.count} {entry.count === 1 ? "Termin" : "Termine"}
                  </span>
                  <span className="nums font-bold w-32 text-right">
                    CHF {formatPrice(entry.totalRappen)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Einzelne Termine */}
        <div className="mt-12">
          <h2 className="text-section mb-4">
            Einzelne Termine{month ? ` — ${label}` : ""}
          </h2>
          {report.rows.length === 0 ? (
            <p className="text-slate">Keine erbrachten Termine im gewählten Zeitraum.</p>
          ) : (
            <div className="surface bg-paper">
              {report.rows.map((row) => (
                <div
                  key={row.reference}
                  className="border-b border-deep/10 px-5 py-3 grid gap-x-5 gap-y-0.5 sm:grid-cols-[7rem_1fr_auto] items-baseline"
                >
                  <p className="nums text-fine">
                    {row.day.slice(8)}.{row.day.slice(5, 7)}.{row.day.slice(0, 4)}
                    <span className="text-slate"> {row.time}</span>
                  </p>
                  <p className="text-fine min-w-0">
                    <span className="font-semibold">{row.lessonName}</span>
                    <span className="text-slate"> · {row.staffName}</span>
                    <span className="nums text-slate"> · {row.reference}</span>
                    {row.promotionLabel && (
                      <span className="text-slate"> · {row.promotionLabel}</span>
                    )}
                  </p>
                  <p className="nums font-bold sm:text-right">CHF {formatPrice(row.amountRappen)}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Kurzfristige Absagen */}
        {report.lateCancellations.length > 0 && (
          <div className="mt-12">
            <h2 className="text-section mb-2">Kurzfristige Absagen</h2>
            <p className="text-slate text-fine mb-4 max-w-[62ch]">
              Innert 24 Stunden abgesagt, laut AGB verrechenbar — oben nicht mitgezählt. Eigene
              Absagen stehen hier ebenfalls.
            </p>
            <div className="surface bg-paper">
              {report.lateCancellations.map((row) => (
                <div
                  key={row.reference}
                  className="border-b border-deep/10 px-5 py-3 grid gap-x-5 gap-y-0.5 sm:grid-cols-[7rem_1fr_auto] items-baseline"
                >
                  <p className="nums text-fine">
                    {row.day.slice(8)}.{row.day.slice(5, 7)}.{row.day.slice(0, 4)}
                    <span className="text-slate"> {row.time}</span>
                  </p>
                  <p className="text-fine min-w-0">
                    <span className="font-semibold">{row.lessonName}</span>
                    <span className="text-slate"> · {row.staffName}</span>
                    <span className="nums text-slate"> · {row.reference}</span>
                  </p>
                  <p className="nums text-slate sm:text-right">
                    CHF {formatPrice(row.amountRappen)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function Tile({
  label,
  value,
  hint,
  strong,
}: {
  label: string;
  value: string;
  hint?: string;
  strong?: boolean;
}) {
  return (
    <div className="bg-paper p-5">
      <p className="text-fine text-slate">{label}</p>
      <p
        className={`nums font-display leading-none mt-2 ${strong ? "text-3xl font-bold text-signal-ink" : "text-2xl font-bold"}`}
      >
        {value}
      </p>
      {hint && <p className="text-[0.72rem] text-slate mt-1.5">{hint}</p>}
    </div>
  );
}
